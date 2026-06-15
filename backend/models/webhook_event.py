"""Phase 16 — WebhookEvent model (PRD §5.28-G). UNIQUE on (gateway, event_id)."""
import enum
from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, DateTime, Enum as SAEnum, String, Text, UniqueConstraint
from sqlalchemy.dialects.mysql import BIGINT
from database import Base


class WebhookGateway(str, enum.Enum):
    stripe   = "stripe"
    razorpay = "razorpay"


class WebhookEvent(Base):
    __tablename__ = "webhook_events"

    __table_args__ = (
        UniqueConstraint("gateway", "event_id", name="uq_webhook_gateway_event_id"),
    )

    id           = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    gateway      = Column(SAEnum(WebhookGateway), nullable=False, index=True)
    event_id     = Column(String(255), nullable=False, index=True)
    event_type   = Column(String(100), nullable=False)
    payload_json = Column(Text, nullable=True)            # full event payload (never logged to stdout)
    processed    = Column(Boolean, nullable=False, default=False)
    processed_at = Column(DateTime, nullable=True)
    error        = Column(Text, nullable=True)            # traceback on handler exception
    created_at   = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
