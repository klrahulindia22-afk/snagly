from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
from datetime import datetime
from models.user import UserRole


class BoardCreate(BaseModel):
    name: str
    description: Optional[str] = None
    bg_color: Optional[str] = "#6c63ff"
    member_limit: Optional[int] = 10


class BoardUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    bg_color: Optional[str] = None


class BoardOut(BaseModel):
    id: int
    name: str
    slug: Optional[str] = None
    description: Optional[str] = None
    owner_id: int
    owner_name: Optional[str] = None
    member_limit: int
    bg_color: Optional[str] = None
    is_archived: bool
    archived_at: Optional[datetime] = None
    created_at: datetime
    my_role: Optional[str] = None
    member_count: int = 0


class MemberOut(BaseModel):
    user_id: int
    full_name: str
    email: str
    role: str
    avatar_url: Optional[str] = None
    initials_color: Optional[str] = None
    joined_at: datetime


class MemberRoleUpdate(BaseModel):
    role: UserRole


class BoardInviteRequest(BaseModel):
    email: EmailStr
    role: Optional[UserRole] = UserRole.team


class InviteAcceptRequest(BaseModel):
    token: str
    full_name: Optional[str] = None
    password: Optional[str] = None

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v):
        if v is not None and len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class ShareLinkOut(BaseModel):
    id: int
    token: str
    role: str
    url: str
    is_active: bool
    created_at: datetime


class JoinRequestCreate(BaseModel):
    message: Optional[str] = None


class JoinRequestReview(BaseModel):
    status: str

    @field_validator("status")
    @classmethod
    def valid_status(cls, v):
        if v not in ("approved", "declined"):
            raise ValueError("status must be 'approved' or 'declined'")
        return v


class JoinRequestOut(BaseModel):
    id: int
    user_id: int
    full_name: str
    email: str
    message: Optional[str] = None
    status: str
    created_at: datetime


class BoardInviteOut(BaseModel):
    id: int
    email: str
    role: str
    expires_at: datetime
    created_at: datetime
