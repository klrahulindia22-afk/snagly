from sqlalchemy import Column, String, Integer, Boolean, Text, DateTime, ForeignKey
from sqlalchemy.dialects.mysql import BIGINT
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class FieldDefinition(Base):
    __tablename__ = "field_definitions"

    id = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    board_id = Column(BIGINT(unsigned=True), ForeignKey("boards.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    field_type = Column(String(20), nullable=False, default="text")  # text, number, date, dropdown
    options_json = Column(Text, nullable=True)  # JSON array of strings for dropdown
    position = Column(Integer, nullable=False, default=0)
    is_required = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    board = relationship("Board", foreign_keys=[board_id])
    card_fields = relationship("CardField", back_populates="field_definition", cascade="all, delete-orphan")
