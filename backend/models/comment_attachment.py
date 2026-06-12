from sqlalchemy import Column, String, Integer, DateTime, ForeignKey
from sqlalchemy.dialects.mysql import BIGINT
from sqlalchemy.sql import func
from database import Base


class CommentAttachment(Base):
    __tablename__ = "comment_attachments"

    id = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    comment_id = Column(BIGINT(unsigned=True), ForeignKey("comments.id"), nullable=False, index=True)
    uploaded_by_id = Column(BIGINT(unsigned=True), ForeignKey("users.id"), nullable=False, index=True)
    file_name = Column(String(255), nullable=True)
    file_url = Column(String(500), nullable=True)
    mime_type = Column(String(100), nullable=True)
    file_size = Column(Integer, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
