"""ТМЦ по частям проекта (синхрон с фронтом: residential / parking)."""

from typing import Literal

from fastapi import APIRouter, Depends, Query

from app.deps import assert_section_access, get_current_user
from app.models import User
from app.schemas import TmcItem

router = APIRouter(prefix="/tmc", tags=["tmc"])

ProjectPartKey = Literal["residential", "parking"]

_RESIDENTIAL: list[dict[str, str | int | float | None]] = [
    {
        "id": "tmc-01",
        "project_part": "residential",
        "name": "Арматура А500С, 12 мм",
        "gpr_stage": "Строительство зданий и сооружений",
        "plan_cost": 4200000,
        "fact_cost": 3980000,
        "plan_date": "2025-09-10",
        "fact_date": "2025-09-08",
    },
    {
        "id": "tmc-02",
        "project_part": "residential",
        "name": "Цемент М500",
        "gpr_stage": "Строительство зданий и сооружений",
        "plan_cost": 2500000,
        "fact_cost": 2710000,
        "plan_date": "2025-10-01",
        "fact_date": "2025-10-12",
    },
    {
        "id": "tmc-03",
        "project_part": "residential",
        "name": "Кабель силовой ВВГнг 4x95",
        "gpr_stage": "Устройство сетей",
        "plan_cost": 3100000,
        "fact_cost": 3550000,
        "plan_date": "2025-11-05",
        "fact_date": "2025-11-28",
    },
    {
        "id": "tmc-04",
        "project_part": "residential",
        "name": "Трубы ПНД 315 мм",
        "gpr_stage": "Устройство сетей",
        "plan_cost": 2800000,
        "fact_cost": None,
        "plan_date": "2025-11-20",
        "fact_date": None,
    },
    {
        "id": "tmc-05",
        "project_part": "residential",
        "name": "Бордюрный камень",
        "gpr_stage": "Благоустройство",
        "plan_cost": 980000,
        "fact_cost": 940000,
        "plan_date": "2026-04-12",
        "fact_date": "2026-04-10",
    },
    {
        "id": "tmc-06",
        "project_part": "residential",
        "name": "Тротуарная плитка",
        "gpr_stage": "Благоустройство",
        "plan_cost": 1670000,
        "fact_cost": 1695000,
        "plan_date": "2026-04-25",
        "fact_date": "2026-05-03",
    },
    {
        "id": "tmc-07",
        "project_part": "residential",
        "name": "Щебень фракции 20-40",
        "gpr_stage": "Подготовка территории",
        "plan_cost": 1250000,
        "fact_cost": 1210000,
        "plan_date": "2025-08-15",
        "fact_date": "2025-08-14",
    },
    {
        "id": "tmc-08",
        "project_part": "residential",
        "name": "Песок карьерный",
        "gpr_stage": "Подготовка территории",
        "plan_cost": 890000,
        "fact_cost": None,
        "plan_date": "2025-08-20",
        "fact_date": None,
    },
]

def _parking_row(row: dict[str, str | int | float | None]) -> dict[str, str | int | float | None]:
    rid = str(row["id"]).replace("tmc-", "tmc-p-", 1)
    out = {**row, "id": rid, "project_part": "parking"}
    if rid == "tmc-p-04":
        out["fact_cost"] = 1_400_000
        out["fact_date"] = "2025-11-25"
    elif rid == "tmc-p-08":
        out["fact_cost"] = 600_000
        out["fact_date"] = "2025-08-18"
    return out


_PARKING = [_parking_row(row) for row in _RESIDENTIAL]

_TMC_ROWS: list[dict[str, str | int | float | None]] = _RESIDENTIAL + _PARKING


@router.get("", response_model=list[TmcItem])
def list_tmc(
    project_part: ProjectPartKey | None = Query(
        None,
        description="Фильтр: residential | parking. Без параметра — все позиции.",
    ),
    user: User = Depends(get_current_user),
):
    assert_section_access(user, "materials")
    rows = _TMC_ROWS
    if project_part is not None:
        rows = [r for r in rows if r["project_part"] == project_part]
    return [TmcItem.model_validate(r) for r in rows]


def tmc_row_for_part(part_id: int, tmc_id: str) -> dict[str, str | None] | None:
    """План/факт поставки для блокировки ГПР с учётом части проекта."""
    key: ProjectPartKey = "parking" if part_id == 2 else "residential"
    for row in _TMC_ROWS:
        if row["id"] == tmc_id and row["project_part"] == key:
            return {
                "name": str(row["name"]),
                "plan_date": str(row["plan_date"]) if row.get("plan_date") else None,
                "fact_date": str(row["fact_date"]) if row.get("fact_date") else None,
            }
    return None
