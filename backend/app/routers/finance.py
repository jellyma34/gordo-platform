"""Финансовые импорты CSV — распарсенные снимки в PostgreSQL (общий для всех пользователей)."""

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import FinanceBudgetImport, FinanceExecutionImport, User
from app.project_ids import normalize_project_id as _normalize_project_id

router = APIRouter(prefix="/finance", tags=["finance"])


class FinanceImportPutBody(BaseModel):
    projectId: str = Field(default="verba-phase-1")
    payload: dict[str, Any]

    model_config = ConfigDict(populate_by_name=True)


class FinanceImportResponse(BaseModel):
    projectId: str
    payload: dict[str, Any]
    updatedAt: datetime | None = None
    updatedByEmail: str | None = None


def _budget_response(row: FinanceBudgetImport) -> FinanceImportResponse:
    payload = row.payload if isinstance(row.payload, dict) else {}
    return FinanceImportResponse(
        projectId=row.project_id,
        payload=payload,
        updatedAt=row.updated_at,
        updatedByEmail=row.updated_by_email,
    )


def _execution_response(row: FinanceExecutionImport) -> FinanceImportResponse:
    payload = row.payload if isinstance(row.payload, dict) else {}
    return FinanceImportResponse(
        projectId=row.project_id,
        payload=payload,
        updatedAt=row.updated_at,
        updatedByEmail=row.updated_by_email,
    )


@router.get("/budget-imports", response_model=FinanceImportResponse)
def get_finance_budget_import(
    project_id: str = Query("verba-phase-1", alias="projectId"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _ = user
    pid = _normalize_project_id(project_id)
    row = db.scalars(select(FinanceBudgetImport).where(FinanceBudgetImport.project_id == pid)).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Импорт бюджета не найден")
    return _budget_response(row)


@router.put("/budget-imports", response_model=FinanceImportResponse)
def put_finance_budget_import(
    body: FinanceImportPutBody,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    pid = _normalize_project_id(body.projectId)
    if not isinstance(body.payload, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="payload must be an object")

    now = datetime.now(timezone.utc)
    row = db.scalars(select(FinanceBudgetImport).where(FinanceBudgetImport.project_id == pid)).first()
    if row is None:
        row = FinanceBudgetImport(
            project_id=pid,
            payload=body.payload,
            updated_at=now,
            updated_by_email=user.email,
        )
        db.add(row)
    else:
        row.payload = body.payload
        row.updated_at = now
        row.updated_by_email = user.email
    db.commit()
    db.refresh(row)
    return _budget_response(row)


@router.get("/execution-imports", response_model=FinanceImportResponse)
def get_finance_execution_import(
    project_id: str = Query("verba-phase-1", alias="projectId"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _ = user
    pid = _normalize_project_id(project_id)
    row = db.scalars(
        select(FinanceExecutionImport).where(FinanceExecutionImport.project_id == pid)
    ).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Импорт исполнения не найден")
    return _execution_response(row)


@router.put("/execution-imports", response_model=FinanceImportResponse)
def put_finance_execution_import(
    body: FinanceImportPutBody,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    pid = _normalize_project_id(body.projectId)
    if not isinstance(body.payload, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="payload must be an object")

    now = datetime.now(timezone.utc)
    row = db.scalars(
        select(FinanceExecutionImport).where(FinanceExecutionImport.project_id == pid)
    ).first()
    if row is None:
        row = FinanceExecutionImport(
            project_id=pid,
            payload=body.payload,
            updated_at=now,
            updated_by_email=user.email,
        )
        db.add(row)
    else:
        row.payload = body.payload
        row.updated_at = now
        row.updated_by_email = user.email
    db.commit()
    db.refresh(row)
    return _execution_response(row)
