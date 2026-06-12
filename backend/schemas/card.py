from pydantic import BaseModel, field_validator
from typing import Optional, List as PyList
from datetime import datetime
from models.card import Priority, Severity, CardSource


class CardMetaIn(BaseModel):
    browser: Optional[str] = None
    os: Optional[str] = None
    viewport: Optional[str] = None
    user_agent: Optional[str] = None


class CardCreate(BaseModel):
    list_id: int
    title: str
    priority: Optional[Priority] = Priority.normal
    severity: Optional[Severity] = None
    source: Optional[CardSource] = None
    due_date: Optional[datetime] = None
    start_date: Optional[datetime] = None
    meta: Optional[CardMetaIn] = None

    @field_validator("title")
    @classmethod
    def title_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Title cannot be empty")
        return v.strip()


class CardUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[Priority] = None
    severity: Optional[Severity] = None
    source: Optional[CardSource] = None
    due_date: Optional[datetime] = None
    start_date: Optional[datetime] = None
    cover_image_url: Optional[str] = None
    list_id: Optional[int] = None


class CardMove(BaseModel):
    list_id: int
    position: int


class LabelMiniOut(BaseModel):
    id: int
    name: Optional[str] = None
    color: str


class AssigneeMiniOut(BaseModel):
    user_id: int
    full_name: str
    avatar_url: Optional[str] = None
    initials_color: Optional[str] = None


class CardMetaOut(BaseModel):
    browser: Optional[str] = None
    os: Optional[str] = None
    viewport: Optional[str] = None


class CardFace(BaseModel):
    id: int
    board_id: int
    list_id: int
    title: str
    description: Optional[str] = None
    position: int
    priority: str
    severity: Optional[str] = None
    source: str
    due_date: Optional[datetime] = None
    start_date: Optional[datetime] = None
    cover_image_url: Optional[str] = None
    is_archived: bool
    is_deleted: bool
    created_by_id: Optional[int] = None
    created_at: datetime
    labels: PyList[LabelMiniOut] = []
    assignees: PyList[AssigneeMiniOut] = []
    meta: Optional[CardMetaOut] = None
    checklist_total: int = 0
    checklist_checked: int = 0
    watcher_count: int = 0
    is_watching: bool = False
    custom_fields: list = []
    total_time_minutes: int = 0
    is_recurring: bool = False
    recurrence_pattern: Optional[str] = None
    next_recurrence_at: Optional[datetime] = None


class LabelCreate(BaseModel):
    name: Optional[str] = None
    color: str = "#6c63ff"


class LabelUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None


class LabelOut(BaseModel):
    id: int
    board_id: int
    name: Optional[str] = None
    color: str
    created_at: datetime
