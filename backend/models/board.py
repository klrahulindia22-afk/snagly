from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.mysql import BIGINT
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class Board(Base):
    __tablename__ = "boards"

    id = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    slug = Column(String(255), unique=True, nullable=True, index=True)
    description = Column(String(1000), nullable=True)
    owner_id = Column(BIGINT(unsigned=True), ForeignKey("users.id"), nullable=False, index=True)
    member_limit = Column(Integer, nullable=False, default=10)
    bg_color = Column(String(500), nullable=True, default="#1a1f2e")
    is_archived = Column(Boolean, nullable=False, default=False)
    archived_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    owner = relationship("User", foreign_keys=[owner_id])
    sla_rules = relationship("SLARule", back_populates="board", cascade="all, delete-orphan")
