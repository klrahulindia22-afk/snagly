import enum
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Text, Enum as SAEnum
from sqlalchemy.dialects.mysql import BIGINT
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class IntegrationType(str, enum.Enum):
    clickup = "clickup"
    github = "github"
    gitlab = "gitlab"


class Integration(Base):
    __tablename__ = "integrations"

    id = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    board_id = Column(BIGINT(unsigned=True), ForeignKey("boards.id"), nullable=False, index=True)
    type = Column(SAEnum(IntegrationType), nullable=False)
    name = Column(String(200), nullable=True)
    config_json = Column(Text, nullable=False)  # Fernet-encrypted JSON — never return raw
    is_active = Column(Boolean, nullable=False, default=True)
    created_by_id = Column(BIGINT(unsigned=True), ForeignKey("users.id"), nullable=True, index=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    external_refs = relationship("ExternalRef", back_populates="integration", cascade="all, delete-orphan")
