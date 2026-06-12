from sqlalchemy import Column, String, Text, DateTime, ForeignKey
from sqlalchemy.dialects.mysql import BIGINT
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class AdminAuditLog(Base):
    __tablename__ = "admin_audit_logs"

    id = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    admin_id = Column(BIGINT(unsigned=True), ForeignKey("users.id"), nullable=False, index=True)
    action = Column(String(100), nullable=False)          # e.g. "update_system_config"
    target_type = Column(String(50), nullable=True)       # e.g. "User", "SystemConfig"
    target_id = Column(BIGINT(unsigned=True), nullable=True)
    detail_json = Column(Text, nullable=True)             # before/after JSON snapshot
    performed_at = Column(DateTime, server_default=func.now(), nullable=False, index=True)

    admin = relationship("User", foreign_keys=[admin_id])
