from sqlalchemy import Column, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.mysql import BIGINT
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class CardAssignee(Base):
    __tablename__ = "card_assignees"

    id = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    card_id = Column(BIGINT(unsigned=True), ForeignKey("cards.id"), nullable=False, index=True)
    user_id = Column(BIGINT(unsigned=True), ForeignKey("users.id"), nullable=False, index=True)
    assigned_at = Column(DateTime, server_default=func.now(), nullable=False)

    card = relationship("Card", back_populates="assignees")
    user = relationship("User", foreign_keys=[user_id])

    __table_args__ = (UniqueConstraint("card_id", "user_id", name="uq_card_assignee"),)
