from sqlalchemy import Column, String, Boolean, DateTime
from sqlalchemy.dialects.mysql import BIGINT
from sqlalchemy.sql import func
from database import Base


class LoginAttempt(Base):
    __tablename__ = "login_attempts"

    id = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    email = Column(String(255), nullable=False, index=True)
    ip_address = Column(String(45), nullable=True)  # IPv4 or IPv6
    success = Column(Boolean, nullable=False, default=False)
    attempted_at = Column(DateTime, server_default=func.now(), nullable=False, index=True)
