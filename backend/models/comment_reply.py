from sqlalchemy import Column, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.mysql import BIGINT
from sqlalchemy.sql import func
from database import Base


class CommentReply(Base):
    __tablename__ = "comment_replies"

    id = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    comment_id = Column(BIGINT(unsigned=True), ForeignKey("comments.id"), nullable=False, index=True)
    user_id = Column(BIGINT(unsigned=True), ForeignKey("users.id"), nullable=False, index=True)
    body = Column(Text, nullable=False)
    is_deleted = Column(Boolean, nullable=False, default=False)
    deleted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    comment = relationship("Comment", back_populates="replies")
