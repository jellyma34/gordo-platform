from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    token: str
    role: Literal["admin", "manager", "employee"]
    allowed_sections: list[str]


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
    allowed_sections: list[str]


class UpdateUserRequest(BaseModel):
    full_name: Optional[str] = None
    role: Literal["admin", "manager", "employee"]
    allowed_sections: list[str] = Field(default_factory=list)


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
    plan_start: str
    plan_end: str
    fact_start: str | None = None
    fact_end: str | None = None
    completion: int = 0
    comment: str | None = None
    related_tmc_ids: list[str] = Field(default_factory=list)
    part_id: int


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
