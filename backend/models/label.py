from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.dialects.mysql import BIGINT
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class Label(Base):
    __tablename__ = "labels"

    id = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    board_id = Column(BIGINT(unsigned=True), ForeignKey("boards.id"), nullable=False, index=True)
    name = Column(String(100), nullable=True)
    color = Column(String(20), nullable=False, default="#6c63ff")
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    card_labels = relationship("CardLabel", back_populates="label", cascade="all, delete-orphan")
