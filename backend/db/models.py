"""
SQLAlchemy модели ingestion-системы.

Все таблицы изолированы префиксом "ingest_" — чтобы не конфликтовать
с существующей схемой GORDO (gpr_tasks, users, ...).

Архитектура (классический lake-style ingestion):

  raw_uploads
      сырые файлы как есть (метаданные + ссылка на blob в storage/raw).

  staging_marketing_data
      "сырые строки" из распарсенного файла, схема почти free-form (JSON).
      Здесь хранится всё, что распарсилось — до нормализации.

  fact_marketing_metrics
      нормализованные факты: project_id (FK на dim_projects), метрика,
      значение, период. Это то, что отдаёт API наружу.

  dim_projects
      справочник канонических проектов.

  project_aliases
      "грязные" имена проектов из файлов → project_id.
      Позволяет постепенно растить словарь без перезагрузки данных.

  parse_error_log
      ошибки парсинга, привязанные к raw_upload_id и опционально к строке.
"""
from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .session import Base


class UploadStatus(str, enum.Enum):
    """Жизненный цикл загруженного файла."""

    received = "received"        # файл сохранён в storage/raw, ещё не парсился
    parsing = "parsing"          # парсер в процессе
    parsed = "parsed"            # есть строки в staging
    normalized = "normalized"    # данные перенесены в fact_*
    failed = "failed"            # фатальная ошибка
    partially_failed = "partially_failed"  # часть строк не прошла


class UploadSource(str, enum.Enum):
    telegram = "telegram"
    api = "api"
    manual = "manual"


# ---------------------------------------------------------------------------
# RAW
# ---------------------------------------------------------------------------


class RawUpload(Base):
    """
    Метаданные одного загруженного файла. Сам файл лежит в storage/raw
    под именем `storage_path` (относительно settings.storage_raw_dir).
    """

    __tablename__ = "ingest_raw_uploads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    original_filename: Mapped[str] = mapped_column(String(512), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    content_type: Mapped[str | None] = mapped_column(String(128))
    file_size: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    sha256: Mapped[str | None] = mapped_column(String(64), index=True)

    source: Mapped[UploadSource] = mapped_column(
        Enum(UploadSource, name="ingest_upload_source"),
        nullable=False,
        default=UploadSource.api,
    )
    # Идентификатор отправителя в источнике: telegram user_id или ник.
    uploader_ref: Mapped[str | None] = mapped_column(String(128), index=True)

    status: Mapped[UploadStatus] = mapped_column(
        Enum(UploadStatus, name="ingest_upload_status"),
        nullable=False,
        default=UploadStatus.received,
        index=True,
    )

    # Что определил parser registry: 'csv', 'xlsx', и т.п. — заполняется на этапе парсинга.
    detected_format: Mapped[str | None] = mapped_column(String(32))
    parser_name: Mapped[str | None] = mapped_column(String(64))

    rows_total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rows_ok: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rows_failed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Произвольная мета (отправитель в Telegram, caption и т.п.)
    extra: Mapped[dict | None] = mapped_column(JSON)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    parsed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    staging_rows: Mapped[list["StagingMarketingRow"]] = relationship(
        back_populates="upload", cascade="all, delete-orphan"
    )
    errors: Mapped[list["ParseErrorLog"]] = relationship(
        back_populates="upload", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_ingest_raw_uploads_created_at", "created_at"),
    )


# ---------------------------------------------------------------------------
# STAGING
# ---------------------------------------------------------------------------


class StagingMarketingRow(Base):
    """
    Одна строка из распарсенного файла. Все колонки исходного файла
    кладутся как есть в `payload` (), плюс нормализованные хелпер-поля:
    raw_project_name, period_label, metric_name, metric_value — если parser
    их смог выделить.

    Эта таблица — буфер. Из неё сервис нормализации формирует fact_*.
    """

    __tablename__ = "ingest_staging_marketing_data"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    upload_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("ingest_raw_uploads.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    row_index: Mapped[int] = mapped_column(Integer, nullable=False)

    raw_project_name: Mapped[str | None] = mapped_column(String(512), index=True)
    period_label: Mapped[str | None] = mapped_column(String(64))
    metric_name: Mapped[str | None] = mapped_column(String(128))
    metric_value: Mapped[float | None] = mapped_column(Numeric(20, 4))

    payload: Mapped[dict] = mapped_column(JSON, nullable=False)

    is_normalized: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    normalization_error: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    upload: Mapped["RawUpload"] = relationship(back_populates="staging_rows")

    __table_args__ = (
        UniqueConstraint("upload_id", "row_index", name="uq_ingest_staging_upload_row"),
        Index("ix_ingest_staging_is_normalized", "is_normalized"),
    )


# ---------------------------------------------------------------------------
# DIM
# ---------------------------------------------------------------------------


class DimProject(Base):
    """Канонический справочник проектов."""

    __tablename__ = "ingest_dim_projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    canonical_name: Mapped[str] = mapped_column(String(256), nullable=False, unique=True)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    aliases: Mapped[list["ProjectAlias"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )


class ProjectAlias(Base):
    """
    Маппинг "грязное имя из файла" → канонический project_id.

    `alias_normalized` хранится в lower-case без лишних пробелов,
    чтобы lookup был O(1) по PK/UQ.
    """

    __tablename__ = "ingest_project_aliases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("ingest_dim_projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    alias: Mapped[str] = mapped_column(String(256), nullable=False)
    alias_normalized: Mapped[str] = mapped_column(String(256), nullable=False, unique=True)
    # Был ли алиас добавлен автоматически (например, при первом совпадении по нормализованной форме).
    auto: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    project: Mapped["DimProject"] = relationship(back_populates="aliases")


# ---------------------------------------------------------------------------
# FACT
# ---------------------------------------------------------------------------


class FactMarketingMetric(Base):
    """
    Очищенные нормализованные факты — то, что отдаём наружу через API.

    Зерно (grain) одной строки: (project_id, period, metric_name, source_upload_id).
    Хранить ли историю по upload — да: позволяет идемпотентно перезагружать данные.
    """

    __tablename__ = "ingest_fact_marketing_metrics"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    project_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("ingest_dim_projects.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    # Период в виде даты начала месяца (YYYY-MM-01) — удобно для агрегаций.
    period_month: Mapped[datetime] = mapped_column(DateTime(timezone=False), nullable=False)
    # Текстовое представление периода как было в файле (для аудита).
    period_label: Mapped[str | None] = mapped_column(String(64))

    metric_name: Mapped[str] = mapped_column(String(128), nullable=False)
    metric_value: Mapped[float] = mapped_column(Numeric(20, 4), nullable=False)
    unit: Mapped[str | None] = mapped_column(String(32))

    source_upload_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("ingest_raw_uploads.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    source_row_id: Mapped[int | None] = mapped_column(BigInteger)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    project: Mapped["DimProject"] = relationship()

    __table_args__ = (
        UniqueConstraint(
            "project_id",
            "period_month",
            "metric_name",
            "source_upload_id",
            name="uq_ingest_fact_grain",
        ),
        Index("ix_ingest_fact_project_period", "project_id", "period_month"),
        Index("ix_ingest_fact_metric_period", "metric_name", "period_month"),
    )


# ---------------------------------------------------------------------------
# ERROR LOG
# ---------------------------------------------------------------------------


class ParseErrorSeverity(str, enum.Enum):
    warning = "warning"
    error = "error"
    fatal = "fatal"


class ParseErrorLog(Base):
    """
    Журнал ошибок парсинга / нормализации.

    fatal — файл целиком провален; error — конкретная строка/поле;
    warning — например, неизвестный alias проекта, не блокирующее.
    """

    __tablename__ = "ingest_parse_error_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    upload_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("ingest_raw_uploads.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    row_index: Mapped[int | None] = mapped_column(Integer)
    column_name: Mapped[str | None] = mapped_column(String(128))

    severity: Mapped[ParseErrorSeverity] = mapped_column(
        Enum(ParseErrorSeverity, name="ingest_parse_error_severity"),
        nullable=False,
        default=ParseErrorSeverity.error,
        index=True,
    )

    code: Mapped[str] = mapped_column(String(64), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    context: Mapped[dict | None] = mapped_column(JSON)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    upload: Mapped["RawUpload"] = relationship(back_populates="errors")
