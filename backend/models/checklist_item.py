from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.mysql import BIGINT
from sqlalchemy.sql import func
from database import Base


class ChecklistItem(Base):
    __tablename__ = "checklist_items"

    id = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    checklist_id = Column(BIGINT(unsigned=True), ForeignKey("checklists.id"), nullable=False, index=True)
    text = Column(String(500), nullable=False)
    is_checked = Column(Boolean, nullable=False, default=False)
    position = Column(Integer, nullable=False, default=0)
    assignee_id = Column(BIGINT(unsigned=True), ForeignKey("users.id"), nullable=True, index=True)
    due_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    checklist = relationship("Checklist", back_populates="items")
