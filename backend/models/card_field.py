from sqlalchemy import Column, String, Text, DateTime, Float, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.mysql import BIGINT
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class CardField(Base):
    __tablename__ = "card_fields"
    __table_args__ = (UniqueConstraint("card_id", "field_definition_id", name="uq_card_field"),)

    id = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    card_id = Column(BIGINT(unsigned=True), ForeignKey("cards.id"), nullable=False, index=True)
    field_definition_id = Column(BIGINT(unsigned=True), ForeignKey("field_definitions.id"), nullable=False, index=True)
    value_text = Column(Text, nullable=True)
    value_number = Column(Float, nullable=True)
    value_date = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    field_definition = relationship("FieldDefinition", back_populates="card_fields")
