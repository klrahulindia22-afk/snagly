from sqlalchemy import Column, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.mysql import BIGINT
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class CardLabel(Base):
    __tablename__ = "card_labels"

    id = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    card_id = Column(BIGINT(unsigned=True), ForeignKey("cards.id"), nullable=False, index=True)
    label_id = Column(BIGINT(unsigned=True), ForeignKey("labels.id"), nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    card = relationship("Card", back_populates="labels")
    label = relationship("Label", back_populates="card_labels")

    __table_args__ = (UniqueConstraint("card_id", "label_id", name="uq_card_label"),)
