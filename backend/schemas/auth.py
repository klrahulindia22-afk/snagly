import json
from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
from models.user import UserRole


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr
    frontend_url: Optional[str] = None  # caller can override the reset-link base URL


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: UserRole
    avatar_url: Optional[str] = None
    initials_color: Optional[str] = None
    is_active: bool
    is_verified: bool
    two_fa_enabled: bool = False
    backup_codes_remaining: int = 0

    model_config = {"from_attributes": True}

    @classmethod
    def model_validate(cls, obj, **kwargs):
        data = super().model_validate(obj, **kwargs)
        if hasattr(obj, "backup_codes_hash") and obj.backup_codes_hash:
            try:
                data.backup_codes_remaining = len(json.loads(obj.backup_codes_hash))
            except Exception:
                data.backup_codes_remaining = 0
        return data
