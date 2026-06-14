"""Pydantic-схемы для ingestion API."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


# ----- common -----


class OkResponse(BaseModel):
    ok: bool = True


# ----- uploads -----


class UploadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    original_filename: str
    storage_path: str
    content_type: str | None
    file_size: int
    sha256: str | None
    source: str
    uploader_ref: str | None
    status: str
    detected_format: str | None
    parser_name: str | None
    rows_total: int
    rows_ok: int
    rows_failed: int
    created_at: datetime
    parsed_at: datetime | None


class UploadDetailOut(UploadOut):
    extra: dict[str, Any] | None = None


class IngestionOutcomeOut(BaseModel):
    upload_id: int
    status: str
    rows_total: int
    rows_ok: int
    rows_failed: int
    facts_written: int
    unresolved_projects: int


# ----- metrics (fact) -----


class MetricOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    project_id: int
    project_name: str
    period_month: datetime
    period_label: str | None
    metric_name: str
    metric_value: float
    unit: str | None
    source_upload_id: int


class MetricsPage(BaseModel):
    items: list[MetricOut]
    total: int
    limit: int
    offset: int


# ----- projects -----


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    canonical_name: str
    is_active: bool


class ProjectCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=64)
    canonical_name: str = Field(..., min_length=1, max_length=256)


class AliasCreate(BaseModel):
    alias: str = Field(..., min_length=1, max_length=256)


class AliasOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    alias: str
    alias_normalized: str
    auto: bool


# ----- errors -----


class ParseErrorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    upload_id: int
    row_index: int | None
    column_name: str | None
    severity: Literal["warning", "error", "fatal"]
    code: str
    message: str
    context: dict[str, Any] | None
    created_at: datetime
