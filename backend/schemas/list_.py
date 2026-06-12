from pydantic import BaseModel, field_validator
from typing import Optional, List as PyList
from datetime import datetime


class ListCreate(BaseModel):
    name: str
    color: Optional[str] = None
    wip_limit: Optional[int] = None

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("List name cannot be empty")
        return v.strip()

    @field_validator("wip_limit")
    @classmethod
    def wip_positive(cls, v):
        if v is not None and v < 1:
            raise ValueError("WIP limit must be at least 1")
        return v


class ListUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    wip_limit: Optional[int] = None

    @field_validator("wip_limit")
    @classmethod
    def wip_positive(cls, v):
        if v is not None and v < 1:
            raise ValueError("WIP limit must be at least 1")
        return v


class ListReorderItem(BaseModel):
    id: int
    position: int


class ListReorder(BaseModel):
    lists: PyList[ListReorderItem]


class AutomationRuleOut(BaseModel):
    id: int
    list_id: int
    rule_type: str
    config_json: Optional[str] = None
    is_active: bool
    created_at: datetime


class AutomationRuleCreate(BaseModel):
    rule_type: str
    config_json: Optional[str] = None


class AutomationRuleToggle(BaseModel):
    is_active: bool


class ListOut(BaseModel):
    id: int
    board_id: int
    name: str
    position: int
    wip_limit: Optional[int] = None
    color: Optional[str] = None
    is_archived: bool
    card_count: int = 0
    created_at: datetime
    automation_rules: PyList[AutomationRuleOut] = []
