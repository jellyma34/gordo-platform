"""CRUD для dim_projects и project_aliases."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from db import get_db
from db.models import DimProject, ProjectAlias
from normalizers.projects import normalize_project_name

from .schemas import AliasCreate, AliasOut, ProjectCreate, ProjectOut


router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[ProjectOut])
def list_projects(db: Session = Depends(get_db)) -> list[ProjectOut]:
    rows = db.scalars(
        select(DimProject).order_by(DimProject.canonical_name.asc())
    ).all()
    return [ProjectOut.model_validate(r) for r in rows]


@router.post(
    "",
    response_model=ProjectOut,
    status_code=status.HTTP_201_CREATED,
)
def create_project(payload: ProjectCreate, db: Session = Depends(get_db)) -> ProjectOut:
    row = DimProject(code=payload.code.strip(), canonical_name=payload.canonical_name.strip())
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Проект с таким code/canonical_name уже есть")
    db.refresh(row)
    return ProjectOut.model_validate(row)


@router.post(
    "/{project_id}/aliases",
    response_model=AliasOut,
    status_code=status.HTTP_201_CREATED,
    summary="Добавить ручной alias для проекта",
)
def add_alias(
    project_id: int,
    payload: AliasCreate,
    db: Session = Depends(get_db),
) -> AliasOut:
    if db.get(DimProject, project_id) is None:
        raise HTTPException(status_code=404, detail="Проект не найден")
    alias_norm = normalize_project_name(payload.alias)
    if not alias_norm:
        raise HTTPException(status_code=400, detail="Пустой alias после нормализации")

    row = ProjectAlias(
        project_id=project_id,
        alias=payload.alias.strip(),
        alias_normalized=alias_norm,
        auto=False,
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Такой alias уже зарегистрирован")
    db.refresh(row)
    return AliasOut.model_validate(row)


@router.get("/{project_id}/aliases", response_model=list[AliasOut])
def list_aliases(project_id: int, db: Session = Depends(get_db)) -> list[AliasOut]:
    if db.get(DimProject, project_id) is None:
        raise HTTPException(status_code=404, detail="Проект не найден")
    rows = db.scalars(
        select(ProjectAlias)
        .where(ProjectAlias.project_id == project_id)
        .order_by(ProjectAlias.alias.asc())
    ).all()
    return [AliasOut.model_validate(r) for r in rows]
