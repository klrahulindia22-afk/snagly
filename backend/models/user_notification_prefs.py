from sqlalchemy import Column, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.mysql import BIGINT
from sqlalchemy.sql import func
from database import Base


class UserNotificationPrefs(Base):
    __tablename__ = "user_notification_prefs"
    __table_args__ = (UniqueConstraint("user_id", name="uq_notif_prefs_user"),)

    id = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    user_id = Column(BIGINT(unsigned=True), ForeignKey("users.id"), nullable=False, index=True)

    # In-app toggles
    in_app_mention = Column(Boolean, nullable=False, default=True)
    in_app_comment = Column(Boolean, nullable=False, default=True)
    in_app_reply = Column(Boolean, nullable=False, default=True)
    in_app_card_assigned = Column(Boolean, nullable=False, default=True)
    in_app_join_request = Column(Boolean, nullable=False, default=True)

    # Email toggles
    email_mention = Column(Boolean, nullable=False, default=True)
    email_comment = Column(Boolean, nullable=False, default=True)
    email_reply = Column(Boolean, nullable=False, default=True)
    email_card_assigned = Column(Boolean, nullable=False, default=True)
    email_card_overdue = Column(Boolean, nullable=False, default=True)
    email_join_request = Column(Boolean, nullable=False, default=True)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
