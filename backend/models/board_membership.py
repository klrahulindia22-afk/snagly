from sqlalchemy import Column, DateTime, ForeignKey, Enum as SAEnum, UniqueConstraint
from sqlalchemy.dialects.mysql import BIGINT
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
from models.user import UserRole


class BoardMembership(Base):
    __tablename__ = "board_memberships"

    id = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    board_id = Column(BIGINT(unsigned=True), ForeignKey("boards.id"), nullable=False, index=True)
    user_id = Column(BIGINT(unsigned=True), ForeignKey("users.id"), nullable=False, index=True)
    role = Column(SAEnum(UserRole), nullable=False, default=UserRole.team)
    joined_at = Column(DateTime, server_default=func.now(), nullable=False)

    board = relationship("Board", foreign_keys=[board_id])
    user = relationship("User", foreign_keys=[user_id])

    __table_args__ = (UniqueConstraint("board_id", "user_id", name="uq_board_user"),)
