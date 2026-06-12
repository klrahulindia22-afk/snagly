from sqlalchemy import Column, String, Text, DateTime, ForeignKey
from sqlalchemy.dialects.mysql import BIGINT
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class SystemConfig(Base):
    __tablename__ = "system_configs"

    id = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    config_key = Column(String(100), unique=True, nullable=False, index=True)
    config_value = Column(Text, nullable=False, default="null")   # JSON-encoded
    updated_by_id = Column(BIGINT(unsigned=True), ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    updated_by = relationship("User", foreign_keys=[updated_by_id])
