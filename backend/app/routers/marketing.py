"""Marketing CSV imports — PostgreSQL SoT (project_id + kind)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import assert_section_access, get_current_user, security_scheme
from app.models import MarketingImport, User
from app.project_ids import normalize_project_id
from app.security import decode_token
from fastapi.security import HTTPAuthorizationCredentials

router = APIRouter(prefix="/marketing", tags=["marketing"])


class MarketingImportPutBody(BaseModel):
    projectId: str = Field(default="verba-phase-1")
    kind: str
    payload: dict[str, Any] | list[Any]
    rawCsv: str | None = None
    fileName: str | None = None
    uploadedBy: str | None = None

    model_config = ConfigDict(populate_by_name=True)


class MarketingImportResponse(BaseModel):
    projectId: str
    kind: str
    payload: dict[str, Any] | list[Any]
    rawCsv: str | None = None
    fileName: str | None = None
    uploadedBy: str | None = None
    updatedAt: datetime | None = None


class MarketingImportMetaOut(BaseModel):
    kind: str
    updatedAt: datetime | None = None
    uploadedBy: str | None = None
    fileName: str | None = None
    hasData: bool


def _auth_user_or_internal(
    db: Session,
    creds: HTTPAuthorizationCredentials | None,
    x_internal_key: str | None,
) -> User | None:
    """JWT user или internal key (Next.js server). Internal → None user, but allowed.

    Если INTERNAL_API_KEY не задан — разрешаем server-to-server без JWT
    (Next.js marketing storage), как ранее открытый FS-API.
    """
    key = (settings.internal_api_key or "").strip()
    if key and x_internal_key and x_internal_key.strip() == key:
        return None
    if creds is not None and creds.credentials:
        user_id_str = decode_token(creds.credentials)
        if user_id_str is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Недействительный токен")
        try:
            user_id = int(user_id_str)
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Недействительный токен") from e
        user = db.get(User, user_id)
        if user is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Пользователь не найден")
        if user.status == "blocked":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Доступ ограничен")
        assert_section_access(user, "marketing")
        return user
    if key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Требуется авторизация или X-Internal-Key",
        )
    # Нет INTERNAL_API_KEY — доступ для Next.js server persistence (общий SoT).
    return None


def _to_response(row: MarketingImport) -> MarketingImportResponse:
    return MarketingImportResponse(
        projectId=row.project_id,
        kind=row.kind,
        payload=row.payload if isinstance(row.payload, (dict, list)) else {},
        rawCsv=row.raw_csv,
        fileName=row.file_name,
        uploadedBy=row.uploaded_by,
        updatedAt=row.updated_at,
    )


def _meta_from_row(row: MarketingImport) -> MarketingImportMetaOut:
    payload = row.payload if isinstance(row.payload, dict) else {}
    rows = payload.get("rows") if isinstance(payload.get("rows"), list) else []
    monthly = payload.get("monthly") if isinstance(payload.get("monthly"), list) else []
    segments = payload.get("segments") if isinstance(payload.get("segments"), list) else []
    has_data = bool(rows or monthly or segments or row.file_name)
    return MarketingImportMetaOut(
        kind=row.kind,
        updatedAt=row.updated_at,
        uploadedBy=row.uploaded_by,
        fileName=row.file_name,
        hasData=has_data,
    )


@router.get("/imports", response_model=list[MarketingImportMetaOut])
def list_marketing_imports(
    project_id: str = Query("verba-phase-1", alias="projectId"),
    db: Session = Depends(get_db),
    creds: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    x_internal_key: str | None = Header(default=None, alias="X-Internal-Key"),
):
    _auth_user_or_internal(db, creds, x_internal_key)
    pid = normalize_project_id(project_id)
    rows = db.scalars(select(MarketingImport).where(MarketingImport.project_id == pid)).all()
    return [_meta_from_row(r) for r in rows]


@router.get("/imports/{kind}", response_model=MarketingImportResponse)
def get_marketing_import(
    kind: str,
    project_id: str = Query("verba-phase-1", alias="projectId"),
    db: Session = Depends(get_db),
    creds: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    x_internal_key: str | None = Header(default=None, alias="X-Internal-Key"),
):
    _auth_user_or_internal(db, creds, x_internal_key)
    pid = normalize_project_id(project_id)
    k = (kind or "").strip()
    row = db.scalars(
        select(MarketingImport).where(MarketingImport.project_id == pid, MarketingImport.kind == k)
    ).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Импорт не найден")
    return _to_response(row)


@router.put("/imports", response_model=MarketingImportResponse)
def put_marketing_import(
    body: MarketingImportPutBody,
    db: Session = Depends(get_db),
    creds: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    x_internal_key: str | None = Header(default=None, alias="X-Internal-Key"),
):
    user = _auth_user_or_internal(db, creds, x_internal_key)
    pid = normalize_project_id(body.projectId)
    k = (body.kind or "").strip()
    if not k:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="kind required")
    uploaded_by = body.uploadedBy
    if not uploaded_by and user is not None:
        uploaded_by = user.email

    row = db.scalars(
        select(MarketingImport).where(MarketingImport.project_id == pid, MarketingImport.kind == k)
    ).first()
    now = datetime.now(timezone.utc)
    if row is None:
        row = MarketingImport(
            project_id=pid,
            kind=k,
            payload=body.payload,
            raw_csv=body.rawCsv,
            file_name=body.fileName,
            uploaded_by=uploaded_by,
            updated_at=now,
        )
        db.add(row)
    else:
        row.payload = body.payload
        if body.rawCsv is not None:
            row.raw_csv = body.rawCsv
        if body.fileName is not None:
            row.file_name = body.fileName
        if uploaded_by is not None:
            row.uploaded_by = uploaded_by
        row.updated_at = now
    db.commit()
    db.refresh(row)
    return _to_response(row)


@router.delete("/imports/{kind}")
def delete_marketing_import(
    kind: str,
    project_id: str = Query("verba-phase-1", alias="projectId"),
    db: Session = Depends(get_db),
    creds: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    x_internal_key: str | None = Header(default=None, alias="X-Internal-Key"),
):
    _auth_user_or_internal(db, creds, x_internal_key)
    pid = normalize_project_id(project_id)
    k = (kind or "").strip()
    row = db.scalars(
        select(MarketingImport).where(MarketingImport.project_id == pid, MarketingImport.kind == k)
    ).first()
    if row is not None:
        db.delete(row)
        db.commit()
    return {"ok": True}
