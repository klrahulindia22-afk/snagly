from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.dialects.mysql import BIGINT
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class ListAutomationRule(Base):
    __tablename__ = "list_automation_rules"

    id = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    list_id = Column(BIGINT(unsigned=True), ForeignKey("lists.id"), nullable=False, index=True)
    rule_type = Column(String(50), nullable=False)
    config_json = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    list_ = relationship("List", back_populates="automation_rules")
