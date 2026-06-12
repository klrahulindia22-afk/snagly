from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.dialects.mysql import BIGINT
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
from models.card import Priority, Severity


class CardTemplate(Base):
    __tablename__ = "card_templates"

    id = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    board_id = Column(BIGINT(unsigned=True), ForeignKey("boards.id"), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    severity = Column(SAEnum(Severity), nullable=True)
    priority = Column(SAEnum(Priority), nullable=False, default=Priority.normal)
    checklist_json = Column(Text, nullable=True)
    created_by_id = Column(BIGINT(unsigned=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    board = relationship("Board", foreign_keys=[board_id])
    created_by = relationship("User", foreign_keys=[created_by_id])
