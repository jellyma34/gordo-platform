"""POST /uploads, GET /uploads, GET /uploads/{id}, GET /uploads/{id}/errors."""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from db import get_db
from db.config import settings
from db.models import ParseErrorLog, RawUpload, UploadSource
from services_ingestion import IngestionService

from .schemas import (
    IngestionOutcomeOut,
    ParseErrorOut,
    UploadDetailOut,
    UploadOut,
)


router = APIRouter(prefix="/uploads", tags=["uploads"])


@router.post(
    "",
    response_model=IngestionOutcomeOut,
    status_code=status.HTTP_201_CREATED,
    summary="Загрузить файл и запустить ingestion",
)
async def create_upload(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> IngestionOutcomeOut:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Файл без имени")

    # Чтение в память контролируем лимитом из настроек.
    raw = await file.read(settings.max_upload_bytes + 1)
    if len(raw) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"Файл больше лимита {settings.max_upload_bytes} байт",
        )

    import io

    service = IngestionService(db)
    outcome = service.ingest_blob_and_run(
        filename=file.filename,
        data=io.BytesIO(raw),
        content_type=file.content_type,
        source=UploadSource.api,
        uploader_ref="api",
    )
    return IngestionOutcomeOut(
        upload_id=outcome.upload_id,
        status=outcome.status.value,
        rows_total=outcome.rows_total,
        rows_ok=outcome.rows_ok,
        rows_failed=outcome.rows_failed,
        facts_written=outcome.facts_written,
        unresolved_projects=outcome.unresolved_projects,
    )


@router.get(
    "",
    response_model=list[UploadOut],
    summary="Список загрузок (последние первыми)",
)
def list_uploads(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    source: str | None = Query(None),
    db: Session = Depends(get_db),
) -> list[UploadOut]:
    stmt = select(RawUpload).order_by(desc(RawUpload.created_at))
    if source:
        stmt = stmt.where(RawUpload.source == source)
    stmt = stmt.limit(limit).offset(offset)
    rows = db.scalars(stmt).all()
    return [UploadOut.model_validate(r) for r in rows]


@router.get(
    "/{upload_id}",
    response_model=UploadDetailOut,
    summary="Детали загрузки",
)
def get_upload(upload_id: int, db: Session = Depends(get_db)) -> UploadDetailOut:
    row = db.get(RawUpload, upload_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Upload не найден")
    return UploadDetailOut.model_validate(row)


@router.get(
    "/{upload_id}/errors",
    response_model=list[ParseErrorOut],
    summary="Журнал ошибок парсинга/нормализации по загрузке",
)
def get_upload_errors(
    upload_id: int,
    limit: int = Query(500, ge=1, le=5000),
    db: Session = Depends(get_db),
) -> list[ParseErrorOut]:
    if db.get(RawUpload, upload_id) is None:
        raise HTTPException(status_code=404, detail="Upload не найден")
    stmt = (
        select(ParseErrorLog)
        .where(ParseErrorLog.upload_id == upload_id)
        .order_by(ParseErrorLog.id.asc())
        .limit(limit)
    )
    rows = db.scalars(stmt).all()
    return [ParseErrorOut.model_validate(r) for r in rows]
