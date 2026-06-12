from sqlalchemy import Column, String, DateTime, Boolean, ForeignKey, Enum as SAEnum
from sqlalchemy.dialects.mysql import BIGINT
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
from models.user import UserRole


class Invite(Base):
    __tablename__ = "invites"

    id = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    email = Column(String(255), nullable=False, index=True)
    board_id = Column(BIGINT(unsigned=True), ForeignKey("boards.id"), nullable=True, index=True)
    invited_by_id = Column(BIGINT(unsigned=True), ForeignKey("users.id"), nullable=False, index=True)
    role = Column(SAEnum(UserRole), nullable=False, default=UserRole.team)
    token = Column(String(255), nullable=False, unique=True, index=True)
    expires_at = Column(DateTime, nullable=False)
    accepted_at = Column(DateTime, nullable=True)
    is_cancelled = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    board = relationship("Board", foreign_keys=[board_id])
    invited_by = relationship("User", foreign_keys=[invited_by_id])
