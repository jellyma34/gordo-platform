"""GET /metrics — нормализованные fact-данные с фильтрами и пагинацией."""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from db import get_db
from db.models import DimProject, FactMarketingMetric

from .schemas import MetricOut, MetricsPage


router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get(
    "",
    response_model=MetricsPage,
    summary="Получить обработанные маркетинговые метрики",
)
def list_metrics(
    project_id: int | None = Query(None),
    metric_name: str | None = Query(None),
    period_from: datetime | None = Query(None, description="Включительно"),
    period_to: datetime | None = Query(None, description="Включительно"),
    upload_id: int | None = Query(None),
    limit: int = Query(200, ge=1, le=2000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> MetricsPage:
    base = (
        select(
            FactMarketingMetric.project_id,
            DimProject.canonical_name,
            FactMarketingMetric.period_month,
            FactMarketingMetric.period_label,
            FactMarketingMetric.metric_name,
            FactMarketingMetric.metric_value,
            FactMarketingMetric.unit,
            FactMarketingMetric.source_upload_id,
        )
        .join(DimProject, DimProject.id == FactMarketingMetric.project_id)
    )
    count_stmt = select(func.count()).select_from(FactMarketingMetric)

    filters = []
    if project_id is not None:
        filters.append(FactMarketingMetric.project_id == project_id)
    if metric_name:
        filters.append(FactMarketingMetric.metric_name == metric_name)
    if period_from is not None:
        filters.append(FactMarketingMetric.period_month >= period_from)
    if period_to is not None:
        filters.append(FactMarketingMetric.period_month <= period_to)
    if upload_id is not None:
        filters.append(FactMarketingMetric.source_upload_id == upload_id)

    for f in filters:
        base = base.where(f)
        count_stmt = count_stmt.where(f)

    total = db.scalar(count_stmt) or 0

    base = base.order_by(
        FactMarketingMetric.period_month.desc(),
        FactMarketingMetric.project_id.asc(),
        FactMarketingMetric.metric_name.asc(),
    ).limit(limit).offset(offset)

    rows = db.execute(base).all()
    items = [
        MetricOut(
            project_id=r.project_id,
            project_name=r.canonical_name,
            period_month=r.period_month,
            period_label=r.period_label,
            metric_name=r.metric_name,
            metric_value=float(r.metric_value),
            unit=r.unit,
            source_upload_id=r.source_upload_id,
        )
        for r in rows
    ]
    return MetricsPage(items=items, total=total, limit=limit, offset=offset)
