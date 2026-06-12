from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.mysql import BIGINT
from sqlalchemy.sql import func
from database import Base


class Attachment(Base):
    __tablename__ = "attachments"

    id = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    card_id = Column(BIGINT(unsigned=True), ForeignKey("cards.id"), nullable=False, index=True)
    uploaded_by_id = Column(BIGINT(unsigned=True), ForeignKey("users.id"), nullable=False, index=True)
    file_name = Column(String(255), nullable=True)
    file_path = Column(String(500), nullable=True)   # absolute fs path
    file_url = Column(String(500), nullable=True)    # URL path served to client
    mime_type = Column(String(100), nullable=True)
    file_size = Column(Integer, nullable=True)        # bytes
    is_cover = Column(Boolean, nullable=False, default=False)
    link_url = Column(String(1000), nullable=True)
    link_title = Column(String(255), nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    card = relationship("Card", back_populates="attachments")
