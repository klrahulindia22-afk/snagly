import enum
from sqlalchemy import Column, String, Boolean, DateTime, SmallInteger, Text, Enum as SAEnum, ForeignKey
from sqlalchemy.dialects.mysql import BIGINT
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class UserRole(str, enum.Enum):
    super_admin = "super_admin"
    owner = "owner"
    team = "team"
    client = "client"


class User(Base):
    __tablename__ = "users"

    id = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(SAEnum(UserRole), nullable=False, default=UserRole.team)
    avatar_url = Column(String(500), nullable=True)
    initials_color = Column(String(7), nullable=True, default="#6c63ff")
    is_active = Column(Boolean, nullable=False, default=True)
    is_deleted = Column(Boolean, nullable=False, default=False)
    deleted_at = Column(DateTime, nullable=True)
    password_reset_token = Column(String(255), nullable=True, index=True)
    password_reset_expires = Column(DateTime, nullable=True)
    last_login_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    # Phase 0 — email verification
    is_verified = Column(Boolean, nullable=False, default=False)
    email_otp_hash = Column(String(255), nullable=True)
    email_otp_expires_at = Column(DateTime, nullable=True)
    email_otp_attempts = Column(SmallInteger, nullable=False, default=0)

    # Phase 0 — 2FA
    totp_secret_encrypted = Column(Text, nullable=True)
    two_fa_enabled = Column(Boolean, nullable=False, default=False)
    backup_codes_hash = Column(Text, nullable=True)  # JSON array of bcrypt hashes

    # Phase 0 — plan + lockout
    plan_id = Column(BIGINT(unsigned=True), ForeignKey("plans.id"), nullable=True)
    locked_until = Column(DateTime, nullable=True)

    digest_preference = relationship("DigestPreference", back_populates="user", uselist=False, cascade="all, delete-orphan")
    plan = relationship("Plan", foreign_keys=[plan_id])
