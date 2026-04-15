from datetime import date, datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator


class CreateUserRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, description="Задаётся на клиенте; в ответе API не возвращается")
    full_name: Optional[str] = None
    role: Literal["admin", "manager", "employee"] = "employee"
    allowed_sections: list[str] = Field(default_factory=list)


class CreateUserResponse(BaseModel):
    id: int
    email: str
    full_name: Optional[str] = None
    role: str
    allowed_sections: list[str]


class UserListItem(BaseModel):
    id: int
    email: str
    full_name: Optional[str] = None
    role: Literal["admin", "manager", "employee"]
    status: Literal["active", "blocked"] = "active"
    blocked_reason: str | None = None
    blocked_at: datetime | None = None
    blocked_by_email: str | None = None
    allowed_sections: list[str]


class UpdateUserRequest(BaseModel):
    full_name: Optional[str] = None
    role: Literal["admin", "manager", "employee"]
    allowed_sections: list[str] = Field(default_factory=list)


class BlockUserRequest(BaseModel):
    reason: str | None = None


class UserTaskDeviationItem(BaseModel):
    task_id: int
    code: str
    name: str
    status: Literal["green", "yellow", "red", "gray"]
    deviation_days: int | None = None
    completion: int


class UserAnalyticsResponse(BaseModel):
    total_tasks: int
    active_tasks: int
    completion_percent: float
    avg_deviation_days: float | None = None
    green: int
    yellow: int
    red: int
    gray: int
    performance_score: float | None = None
    low_efficiency: bool
    warning: str | None = None
    tasks: list[UserTaskDeviationItem] = Field(default_factory=list)


UserResponse = UserListItem


class SetPasswordRequest(BaseModel):
    password: str = Field(min_length=6, description="Новый пароль; в ответе API не возвращается")


class ActivityLogItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_email: str
    role: str
    action: str
    entity: str
    details: Any | None
    created_at: datetime


class ActivityLogsPage(BaseModel):
    items: list[ActivityLogItem]
    total: int
    page: int
    page_size: int


class ProjectPartItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class GprTaskBase(BaseModel):
    code: str
    global_task_id: str | None = None
    name: str
    level: int = 1
    plan_start: str | None = None
    plan_end: str | None = None
    fact_start: str | None = None
    fact_end: str | None = None
    completion: int = 0
    comment: str | None = None
    related_tmc_ids: list[str] = Field(default_factory=list)
    part_id: int

    @field_validator("plan_start", "plan_end", "fact_start", "fact_end", mode="before")
    @classmethod
    def empty_date_to_none(cls, v: object) -> object:
        if v == "":
            return None
        return v

    @model_validator(mode="after")
    def validate_date_ranges(self) -> "GprTaskBase":
        def _day(s: str | None):
            if not s:
                return None
            try:
                return date.fromisoformat(s)
            except ValueError:
                return None

        ps, pe = _day(self.plan_start), _day(self.plan_end)
        if ps is not None and pe is not None and ps > pe:
            raise ValueError("plan_start не может быть позже plan_end")
        fs, fe = _day(self.fact_start), _day(self.fact_end)
        if fs is not None and fe is not None and fs > fe:
            raise ValueError("fact_start не может быть позже fact_end")
        return self


class GprTaskCreate(GprTaskBase):
    pass


class GprTaskUpdate(GprTaskBase):
    pass


class GprTaskItem(GprTaskBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status: str | None = None
    blocked_reasons: list[str] = Field(default_factory=list)


class RelatedDeviationItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    section: str
    deviation_days: int
    comment: str | None = None
    link: str


class GprDataVersionListItem(BaseModel):
    id: int
    entity_id: int
    version_number: int
    created_at: datetime
    changed_by: int
    created_by: str | None = None
    changed_by_name: str | None = None
    changed_by_role: str
    change_type: str | None = "Редактирование"


class GprDataVersionDetail(BaseModel):
    id: int
    entity_id: int
    data: Any | None
    version_number: int
    created_at: datetime
    changed_by: int
    created_by: str | None = None
    changed_by_name: str | None = None
    changed_by_role: str
    change_type: str | None = "Редактирование"


class EntityHistoryListItem(BaseModel):
    """Элемент списка ``GET /entity/{id}/history``."""

    id: int
    entity_id: int
    entity_type: str = "stage"
    changed_by: int
    created_at: datetime
    changed_by_name: str | None = None
    changed_by_role: str
    change_type: str | None = "Редактирование"


class EntityHistoryDetail(BaseModel):
    """Снимок версии ``GET /entity/{id}/history/{version_id}``."""

    id: int
    entity_id: int
    entity_type: str = "stage"
    data: Any | None
    changed_by: int
    created_at: datetime
    changed_by_name: str | None = None
    changed_by_role: str
    change_type: str | None = "Редактирование"


class TmcItem(BaseModel):
    """Позиция ТМЦ с привязкой к части проекта (как на фронте)."""

    id: str
    project_part: Literal["residential", "parking"]
    name: str
    gpr_stage: str
    plan_cost: float | int
    fact_cost: float | int | None = None
    plan_date: str
    fact_date: str | None = None


class TenderBase(BaseModel):
    part_id: int
    code: str
    name: str
    stage: str
    plan_start: str
    fact_start: str | None = None
    plan_contract_date: str
    fact_contract_date: str | None = None
    cost: int | None = None
    contractor: str | None = None
    status: str | None = None
    comment: str | None = None


class TenderUpdate(TenderBase):
    pass


class TenderItem(TenderBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


class TmcBase(BaseModel):
    external_id: str
    project_part: Literal["residential", "parking"]
    name: str
    gpr_stage: str
    plan_cost: int
    fact_cost: int | None = None
    plan_date: str
    fact_date: str | None = None


class TmcUpdate(TmcBase):
    pass


class TmcDbItem(TmcBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
