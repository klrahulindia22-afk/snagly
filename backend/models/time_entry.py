from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.dialects.mysql import BIGINT
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class TimeEntry(Base):
    __tablename__ = "time_entries"

    id = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    card_id = Column(BIGINT(unsigned=True), ForeignKey("cards.id"), nullable=False, index=True)
    user_id = Column(BIGINT(unsigned=True), ForeignKey("users.id"), nullable=False, index=True)
    duration_minutes = Column(Integer, nullable=False)
    note = Column(Text, nullable=True)
    logged_at = Column(DateTime, server_default=func.now(), nullable=False)

    user = relationship("User", foreign_keys=[user_id])
