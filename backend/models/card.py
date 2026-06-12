import enum
from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey, Text, Enum as SAEnum
from sqlalchemy.dialects.mysql import BIGINT
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class Priority(str, enum.Enum):
    urgent = "urgent"
    high = "high"
    normal = "normal"
    low = "low"


class Severity(str, enum.Enum):
    critical = "critical"
    high = "high"
    medium = "medium"
    low = "low"


class CardSource(str, enum.Enum):
    internal = "internal"
    client = "client"


class Card(Base):
    __tablename__ = "cards"

    id = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    board_id = Column(BIGINT(unsigned=True), ForeignKey("boards.id"), nullable=False, index=True)
    list_id = Column(BIGINT(unsigned=True), ForeignKey("lists.id"), nullable=False, index=True)
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    position = Column(Integer, nullable=False, default=0)
    priority = Column(SAEnum(Priority), nullable=False, default=Priority.normal)
    severity = Column(SAEnum(Severity), nullable=True)
    source = Column(SAEnum(CardSource), nullable=False, default=CardSource.internal)
    due_date = Column(DateTime, nullable=True)
    start_date = Column(DateTime, nullable=True)
    cover_image_url = Column(String(500), nullable=True)
    is_archived = Column(Boolean, nullable=False, default=False)
    archived_at = Column(DateTime, nullable=True)
    is_deleted = Column(Boolean, nullable=False, default=False)
    deleted_at = Column(DateTime, nullable=True)
    created_by_id = Column(BIGINT(unsigned=True), ForeignKey("users.id"), nullable=True, index=True)
    is_recurring = Column(Boolean, nullable=False, default=False)
    recurrence_pattern = Column(String(20), nullable=True)  # "daily" | "weekly" | "monthly"
    recurrence_end_date = Column(DateTime, nullable=True)
    next_recurrence_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    meta = relationship("CardMeta", back_populates="card", uselist=False, cascade="all, delete-orphan")
    labels = relationship("CardLabel", back_populates="card", cascade="all, delete-orphan")
    assignees = relationship("CardAssignee", back_populates="card", cascade="all, delete-orphan")
    checklists = relationship("Checklist", back_populates="card", cascade="all, delete-orphan", order_by="Checklist.position")
    attachments = relationship("Attachment", back_populates="card", cascade="all, delete-orphan")
    created_by = relationship("User", foreign_keys=[created_by_id])
