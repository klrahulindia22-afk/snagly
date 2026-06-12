import enum
from sqlalchemy import Column, String, DateTime, ForeignKey, Text, Enum as SAEnum, UniqueConstraint
from sqlalchemy.dialects.mysql import BIGINT
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class PushStatus(str, enum.Enum):
    pending = "pending"
    success = "success"
    failed = "failed"


class ExternalRef(Base):
    __tablename__ = "external_refs"

    id = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    card_id = Column(BIGINT(unsigned=True), ForeignKey("cards.id"), nullable=False, index=True)
    integration_id = Column(BIGINT(unsigned=True), ForeignKey("integrations.id"), nullable=False, index=True)
    external_id = Column(String(200), nullable=True)       # ClickUp task ID / GitHub issue number
    external_url = Column(String(500), nullable=True)      # Link to the external item
    status = Column(SAEnum(PushStatus), nullable=False, default=PushStatus.pending)
    error_message = Column(Text, nullable=True)
    pushed_at = Column(DateTime, nullable=True)
    pushed_by_id = Column(BIGINT(unsigned=True), ForeignKey("users.id"), nullable=True, index=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    integration = relationship("Integration", back_populates="external_refs")
    pushed_by = relationship("User", foreign_keys=[pushed_by_id])

    __table_args__ = (
        UniqueConstraint("card_id", "integration_id", name="uq_card_integration"),
    )
