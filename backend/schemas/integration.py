from typing import Optional, Any
from pydantic import BaseModel
from datetime import datetime


class IntegrationCreate(BaseModel):
    type: str
    name: Optional[str] = None
    config: dict


class IntegrationUpdate(BaseModel):
    name: Optional[str] = None
    config: Optional[dict] = None
    is_active: Optional[bool] = None


class ExternalRefOut(BaseModel):
    id: int
    card_id: int
    integration_id: int
    integration_type: str
    integration_name: Optional[str]
    external_id: Optional[str]
    external_url: Optional[str]
    status: str
    error_message: Optional[str]
    pushed_at: Optional[datetime]
    pushed_by_name: Optional[str]
