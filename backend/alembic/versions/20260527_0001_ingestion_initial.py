"""ingestion: initial schema

Revision ID: 20260527_0001
Revises:
Create Date: 2026-05-27

Создаёт все таблицы ingestion-модуля. Префикс ingest_* — чтобы
не пересечься со схемой основного backend/app.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "20260527_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPLOAD_STATUS = sa.Enum(
    "received",
    "parsing",
    "parsed",
    "normalized",
    "failed",
    "partially_failed",
    name="ingest_upload_status",
)
_UPLOAD_SOURCE = sa.Enum("telegram", "api", "manual", name="ingest_upload_source")
_ERROR_SEVERITY = sa.Enum("warning", "error", "fatal", name="ingest_parse_error_severity")


def upgrade() -> None:
    bind = op.get_bind()
    _UPLOAD_STATUS.create(bind, checkfirst=True)
    _UPLOAD_SOURCE.create(bind, checkfirst=True)
    _ERROR_SEVERITY.create(bind, checkfirst=True)

    op.create_table(
        "ingest_raw_uploads",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("original_filename", sa.String(length=512), nullable=False),
        sa.Column("storage_path", sa.String(length=1024), nullable=False),
        sa.Column("content_type", sa.String(length=128)),
        sa.Column("file_size", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("sha256", sa.String(length=64)),
        sa.Column("source", _UPLOAD_SOURCE, nullable=False, server_default="api"),
        sa.Column("uploader_ref", sa.String(length=128)),
        sa.Column("status", _UPLOAD_STATUS, nullable=False, server_default="received"),
        sa.Column("detected_format", sa.String(length=32)),
        sa.Column("parser_name", sa.String(length=64)),
        sa.Column("rows_total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("rows_ok", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("rows_failed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("extra", postgresql.JSON(astext_type=sa.Text())),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("parsed_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_ingest_raw_uploads_sha256", "ingest_raw_uploads", ["sha256"])
    op.create_index("ix_ingest_raw_uploads_uploader_ref", "ingest_raw_uploads", ["uploader_ref"])
    op.create_index("ix_ingest_raw_uploads_status", "ingest_raw_uploads", ["status"])
    op.create_index("ix_ingest_raw_uploads_created_at", "ingest_raw_uploads", ["created_at"])

    op.create_table(
        "ingest_dim_projects",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(length=64), nullable=False, unique=True),
        sa.Column("canonical_name", sa.String(length=256), nullable=False, unique=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "ingest_project_aliases",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "project_id",
            sa.Integer(),
            sa.ForeignKey("ingest_dim_projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("alias", sa.String(length=256), nullable=False),
        sa.Column("alias_normalized", sa.String(length=256), nullable=False, unique=True),
        sa.Column("auto", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_ingest_project_aliases_project_id", "ingest_project_aliases", ["project_id"])

    op.create_table(
        "ingest_staging_marketing_data",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "upload_id",
            sa.Integer(),
            sa.ForeignKey("ingest_raw_uploads.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("row_index", sa.Integer(), nullable=False),
        sa.Column("raw_project_name", sa.String(length=512)),
        sa.Column("period_label", sa.String(length=64)),
        sa.Column("metric_name", sa.String(length=128)),
        sa.Column("metric_value", sa.Numeric(20, 4)),
        sa.Column("payload", postgresql.JSON(astext_type=sa.Text()), nullable=False),
        sa.Column("is_normalized", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("normalization_error", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("upload_id", "row_index", name="uq_ingest_staging_upload_row"),
    )
    op.create_index("ix_ingest_staging_upload_id", "ingest_staging_marketing_data", ["upload_id"])
    op.create_index(
        "ix_ingest_staging_raw_project_name",
        "ingest_staging_marketing_data",
        ["raw_project_name"],
    )
    op.create_index(
        "ix_ingest_staging_is_normalized",
        "ingest_staging_marketing_data",
        ["is_normalized"],
    )

    op.create_table(
        "ingest_fact_marketing_metrics",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "project_id",
            sa.Integer(),
            sa.ForeignKey("ingest_dim_projects.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("period_month", sa.DateTime(timezone=False), nullable=False),
        sa.Column("period_label", sa.String(length=64)),
        sa.Column("metric_name", sa.String(length=128), nullable=False),
        sa.Column("metric_value", sa.Numeric(20, 4), nullable=False),
        sa.Column("unit", sa.String(length=32)),
        sa.Column(
            "source_upload_id",
            sa.Integer(),
            sa.ForeignKey("ingest_raw_uploads.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("source_row_id", sa.BigInteger()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint(
            "project_id",
            "period_month",
            "metric_name",
            "source_upload_id",
            name="uq_ingest_fact_grain",
        ),
    )
    op.create_index(
        "ix_ingest_fact_project_id", "ingest_fact_marketing_metrics", ["project_id"]
    )
    op.create_index(
        "ix_ingest_fact_source_upload_id",
        "ingest_fact_marketing_metrics",
        ["source_upload_id"],
    )
    op.create_index(
        "ix_ingest_fact_project_period",
        "ingest_fact_marketing_metrics",
        ["project_id", "period_month"],
    )
    op.create_index(
        "ix_ingest_fact_metric_period",
        "ingest_fact_marketing_metrics",
        ["metric_name", "period_month"],
    )

    op.create_table(
        "ingest_parse_error_log",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "upload_id",
            sa.Integer(),
            sa.ForeignKey("ingest_raw_uploads.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("row_index", sa.Integer()),
        sa.Column("column_name", sa.String(length=128)),
        sa.Column(
            "severity",
            _ERROR_SEVERITY,
            nullable=False,
            server_default="error",
        ),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("context", postgresql.JSON(astext_type=sa.Text())),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_ingest_parse_error_log_upload_id", "ingest_parse_error_log", ["upload_id"])
    op.create_index("ix_ingest_parse_error_log_severity", "ingest_parse_error_log", ["severity"])


def downgrade() -> None:
    op.drop_table("ingest_parse_error_log")
    op.drop_table("ingest_fact_marketing_metrics")
    op.drop_table("ingest_staging_marketing_data")
    op.drop_table("ingest_project_aliases")
    op.drop_table("ingest_dim_projects")
    op.drop_table("ingest_raw_uploads")

    bind = op.get_bind()
    _ERROR_SEVERITY.drop(bind, checkfirst=True)
    _UPLOAD_SOURCE.drop(bind, checkfirst=True)
    _UPLOAD_STATUS.drop(bind, checkfirst=True)
