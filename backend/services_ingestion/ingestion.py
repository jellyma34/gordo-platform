"""
IngestionService — основной оркестратор.

Пайплайн (вызывается из API / bot handler):

    ingest_blob_and_run(...) — общая точка:
        1. сохраняет файл через RawStorage
        2. создает RawUpload (status=received)
        3. вызывает run_pipeline(upload_id):
            а. resolve parser → parse → staging
            б. normalize → fact
            в. перевод status'а, фиксация счётчиков
        4. логирует ошибки через ErrorLogger

Парсинг сейчас синхронный (внутри FastAPI BackgroundTasks хватит).
Когда понадобится — заменим run_pipeline на отправку в очередь (Celery/Arq),
интерфейс при этом не сломается.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import BinaryIO

from sqlalchemy import select
from sqlalchemy.orm import Session

from db.models import (
    FactMarketingMetric,
    ParseErrorSeverity,
    RawUpload,
    StagingMarketingRow,
    UploadSource,
    UploadStatus,
)
from normalizers import ProjectNormalizer
from parsers import ParserError, get_registry
from storage import RawStorage, get_default_storage

from .errors import ErrorLogger


_LOGGER = logging.getLogger("ingestion")


@dataclass(slots=True)
class IngestionOutcome:
    upload_id: int
    status: UploadStatus
    rows_total: int
    rows_ok: int
    rows_failed: int
    facts_written: int
    unresolved_projects: int


class IngestionService:
    def __init__(
        self,
        db: Session,
        *,
        storage: RawStorage | None = None,
    ):
        self.db = db
        self.storage = storage or get_default_storage()
        self.registry = get_registry()

    # -------------------- public --------------------

    def ingest_blob_and_run(
        self,
        *,
        filename: str,
        data: BinaryIO,
        content_type: str | None,
        source: UploadSource,
        uploader_ref: str | None = None,
        extra: dict | None = None,
    ) -> IngestionOutcome:
        """Сохранить файл + сразу запустить пайплайн в той же транзакции/сессии."""
        blob = self.storage.save(filename=filename, data=data)

        upload = RawUpload(
            original_filename=filename,
            storage_path=blob.storage_path,
            content_type=content_type,
            file_size=blob.size,
            sha256=blob.sha256,
            source=source,
            uploader_ref=uploader_ref,
            status=UploadStatus.received,
            extra=extra,
        )
        self.db.add(upload)
        self.db.flush()  # нужен upload.id
        self.db.commit()

        return self.run_pipeline(upload_id=upload.id)

    def run_pipeline(self, *, upload_id: int) -> IngestionOutcome:
        upload = self.db.get(RawUpload, upload_id)
        if upload is None:
            raise ValueError(f"RawUpload id={upload_id} не найден")

        err = ErrorLogger(self.db, upload_id=upload.id)
        upload.status = UploadStatus.parsing
        self.db.commit()

        # -------- parse --------
        try:
            parser = self.registry.resolve(
                filename=upload.original_filename,
                content_type=upload.content_type,
            )
        except ParserError as exc:
            return self._fail(upload, err, exc.code, exc.message, context=exc.context)

        upload.parser_name = parser.name
        upload.detected_format = parser.fmt
        self.db.commit()

        file_path = self.storage.absolute_path(upload.storage_path)
        try:
            result = parser.parse(file_path=file_path)
        except ParserError as exc:
            return self._fail(upload, err, exc.code, exc.message, context=exc.context)
        except Exception as exc:  # noqa: BLE001
            return self._fail(upload, err, "parser_crash", str(exc))

        # -------- staging --------
        staging_objs: list[StagingMarketingRow] = []
        for row in result.rows:
            staging_objs.append(
                StagingMarketingRow(
                    upload_id=upload.id,
                    row_index=row.row_index,
                    raw_project_name=row.raw_project_name,
                    period_label=row.period_label,
                    metric_name=row.metric_name,
                    metric_value=row.metric_value,
                    payload=row.payload,
                )
            )
        if staging_objs:
            self.db.bulk_save_objects(staging_objs, return_defaults=True)
        for re_ in result.errors:
            err.error(
                code=re_.code,
                message=re_.message,
                row_index=re_.row_index,
                column_name=re_.column_name,
                context=re_.context,
            )
        for re_ in result.warnings:
            err.warning(
                code=re_.code,
                message=re_.message,
                row_index=re_.row_index,
                column_name=re_.column_name,
                context=re_.context,
            )

        upload.rows_total = result.rows_total
        upload.rows_ok = result.rows_ok
        upload.rows_failed = result.rows_failed
        upload.status = UploadStatus.parsed
        upload.parsed_at = datetime.now(timezone.utc)
        self.db.commit()

        # -------- normalize → fact --------
        facts_written, unresolved = self._normalize_and_load_facts(upload=upload, err=err)

        # -------- final status --------
        if upload.rows_failed > 0 or unresolved > 0:
            upload.status = UploadStatus.partially_failed
        else:
            upload.status = UploadStatus.normalized
        self.db.commit()

        return IngestionOutcome(
            upload_id=upload.id,
            status=upload.status,
            rows_total=upload.rows_total,
            rows_ok=upload.rows_ok,
            rows_failed=upload.rows_failed,
            facts_written=facts_written,
            unresolved_projects=unresolved,
        )

    # -------------------- internals --------------------

    def _normalize_and_load_facts(
        self, *, upload: RawUpload, err: ErrorLogger
    ) -> tuple[int, int]:
        """
        Проходит по staging-строкам с метрикой/значением, резолвит проект
        и пишет fact_marketing_metrics. Возвращает (facts_written, unresolved).
        """
        normalizer = ProjectNormalizer(self.db)
        normalizer.warmup()

        stmt = select(StagingMarketingRow).where(
            StagingMarketingRow.upload_id == upload.id,
            StagingMarketingRow.is_normalized.is_(False),
        )
        rows = self.db.scalars(stmt).all()

        facts_written = 0
        unresolved = 0

        for row in rows:
            if row.metric_name is None or row.metric_value is None or row.raw_project_name is None:
                # Не "горячая" строка — оставляем в staging как есть.
                row.is_normalized = True
                continue

            res = normalizer.resolve(row.raw_project_name)
            if res.unresolved or res.project_id is None:
                unresolved += 1
                row.normalization_error = "project_not_resolved"
                err.warning(
                    code="project_not_resolved",
                    message=f"Не удалось сопоставить проект: {row.raw_project_name!r}",
                    row_index=row.row_index,
                    column_name="project",
                    context={"raw_project_name": row.raw_project_name},
                )
                continue

            period_month = _coerce_period_month(row.period_label)
            if period_month is None:
                row.normalization_error = "bad_period"
                err.warning(
                    code="bad_period",
                    message=f"Не удалось распознать период: {row.period_label!r}",
                    row_index=row.row_index,
                    column_name="period",
                    context={"period_label": row.period_label},
                )
                continue

            self.db.add(
                FactMarketingMetric(
                    project_id=res.project_id,
                    period_month=period_month,
                    period_label=row.period_label,
                    metric_name=row.metric_name,
                    metric_value=row.metric_value,
                    unit=None,
                    source_upload_id=upload.id,
                    source_row_id=row.id,
                )
            )
            row.is_normalized = True
            facts_written += 1

        self.db.commit()
        return facts_written, unresolved

    def _fail(
        self,
        upload: RawUpload,
        err: ErrorLogger,
        code: str,
        message: str,
        *,
        context: dict | None = None,
    ) -> IngestionOutcome:
        err.log(
            code=code,
            message=message,
            severity=ParseErrorSeverity.fatal,
            context=context,
        )
        upload.status = UploadStatus.failed
        self.db.commit()
        return IngestionOutcome(
            upload_id=upload.id,
            status=upload.status,
            rows_total=upload.rows_total,
            rows_ok=upload.rows_ok,
            rows_failed=upload.rows_failed,
            facts_written=0,
            unresolved_projects=0,
        )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


_RU_MONTHS = {
    "январь": 1, "января": 1, "янв": 1,
    "февраль": 2, "февраля": 2, "фев": 2,
    "март": 3, "марта": 3, "мар": 3,
    "апрель": 4, "апреля": 4, "апр": 4,
    "май": 5, "мая": 5,
    "июнь": 6, "июня": 6, "июн": 6,
    "июль": 7, "июля": 7, "июл": 7,
    "август": 8, "августа": 8, "авг": 8,
    "сентябрь": 9, "сентября": 9, "сен": 9, "сент": 9,
    "октябрь": 10, "октября": 10, "окт": 10,
    "ноябрь": 11, "ноября": 11, "ноя": 11,
    "декабрь": 12, "декабря": 12, "дек": 12,
}


def _coerce_period_month(label: str | None) -> datetime | None:
    """Толерантный парсер периода: '2026-05', '05.2026', 'май 2026', '2026-05-13' …"""
    if not label:
        return None
    s = str(label).strip().lower()

    # 2026-05 / 2026-05-13 / 2026/05
    m = re.match(r"^(\d{4})[\-/.](\d{1,2})(?:[\-/.](\d{1,2}))?$", s)
    if m:
        y, mo = int(m.group(1)), int(m.group(2))
        if 1 <= mo <= 12:
            return datetime(y, mo, 1)

    # 05.2026 / 05/2026
    m = re.match(r"^(\d{1,2})[\-/.](\d{4})$", s)
    if m:
        mo, y = int(m.group(1)), int(m.group(2))
        if 1 <= mo <= 12:
            return datetime(y, mo, 1)

    # "май 2026"
    parts = s.split()
    if len(parts) == 2 and parts[0] in _RU_MONTHS and parts[1].isdigit():
        return datetime(int(parts[1]), _RU_MONTHS[parts[0]], 1)

    # ISO без дня: 2026-05
    try:
        dt = datetime.fromisoformat(s)
        return datetime(dt.year, dt.month, 1)
    except (TypeError, ValueError):
        return None
