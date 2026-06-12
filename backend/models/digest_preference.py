from datetime import datetime, timezone
from sqlalchemy import Column, BigInteger, Integer, String, Enum, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from database import Base
import enum


class DigestFrequency(str, enum.Enum):
    off = "off"
    daily = "daily"
    weekly = "weekly"


class DigestPreference(Base):
    __tablename__ = "digest_preferences"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    frequency = Column(Enum(DigestFrequency), nullable=False, default=DigestFrequency.off)
    send_hour = Column(Integer, nullable=False, default=8)  # 0–23 UTC
    last_sent_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    user = relationship("User", back_populates="digest_preference")
