from sqlalchemy import Column, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.mysql import BIGINT
from sqlalchemy.sql import func
from database import Base


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    user_id = Column(BIGINT(unsigned=True), ForeignKey("users.id"), nullable=False, index=True)
    type = Column(String(50), nullable=False)        # "mention", "comment", "reply", "card_assigned", etc.
    payload_json = Column(Text, nullable=True)        # {board_id, card_id, comment_id, ...}
    is_read = Column(Boolean, nullable=False, default=False)
    created_by_id = Column(BIGINT(unsigned=True), ForeignKey("users.id"), nullable=True, index=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
