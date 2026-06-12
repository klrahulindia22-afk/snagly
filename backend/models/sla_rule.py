from datetime import datetime, timezone
from sqlalchemy import Column, BigInteger, Integer, String, Enum, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from database import Base
import enum


class SeverityLevel(str, enum.Enum):
    critical = "critical"
    high = "high"
    medium = "medium"
    low = "low"


class SLARule(Base):
    __tablename__ = "sla_rules"
    __table_args__ = (
        UniqueConstraint("board_id", "severity", name="uq_sla_board_severity"),
    )

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    board_id = Column(BigInteger, ForeignKey("boards.id", ondelete="CASCADE"), nullable=False, index=True)
    severity = Column(Enum(SeverityLevel), nullable=False)
    hours_to_resolve = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    board = relationship("Board", back_populates="sla_rules")
