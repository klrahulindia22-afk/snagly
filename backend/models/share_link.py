from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.dialects.mysql import BIGINT
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
from models.user import UserRole


class ShareLink(Base):
    __tablename__ = "share_links"

    id = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    board_id = Column(BIGINT(unsigned=True), ForeignKey("boards.id"), nullable=False, index=True)
    token = Column(String(255), nullable=False, unique=True, index=True)
    role = Column(SAEnum(UserRole), nullable=False, default=UserRole.client)
    is_active = Column(Boolean, nullable=False, default=True)
    created_by_id = Column(BIGINT(unsigned=True), ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    created_by = relationship("User", foreign_keys=[created_by_id])
