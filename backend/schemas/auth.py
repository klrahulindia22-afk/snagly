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

    model_config = {"from_attributes": True}
