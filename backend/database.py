"""
CivicResolve — SQLAlchemy Models
"""

import json
import os
from collections.abc import Iterator
from datetime import UTC, datetime

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, Text, create_engine
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker

from constants import Category, Department, ReportStatus

__all__ = ["Category", "Department", "ReportStatus"]  # re-exported for existing imports

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./civicresolve.db")
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """Declarative base for all ORM models (SQLAlchemy 2.0 typed mappings)."""


def utc_now() -> datetime:
    """Current UTC time as a naive datetime.

    Built from a timezone-aware clock (``datetime.utcnow`` is deprecated) but stored
    naive because every DateTime column in this schema holds naive UTC; keeping one
    representation makes all comparisons consistent.
    """
    return datetime.now(UTC).replace(tzinfo=None)


class Report(Base):
    """A citizen-reported civic issue with its AI triage, SLA, dedup and resolution state."""

    __tablename__ = "reports"
    __table_args__ = (
        Index("ix_reports_parent_id", "parent_id"),
        Index("ix_reports_status", "status"),
        Index("ix_reports_category", "category"),
        Index("ix_reports_department", "department"),
        Index("ix_reports_urgency", "urgency"),
        Index("ix_reports_created_at", "created_at"),
        Index("ix_reports_sla_deadline", "sla_deadline"),
        Index("ix_reports_lat_lon", "latitude", "longitude"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[Category] = mapped_column(SAEnum(Category), nullable=False)
    status: Mapped[ReportStatus] = mapped_column(SAEnum(ReportStatus), default=ReportStatus.reported, nullable=True)

    # Location
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    address: Mapped[str | None] = mapped_column(String, nullable=True)

    # AI Triage
    urgency: Mapped[int] = mapped_column(Integer, default=3, nullable=True)  # 1-5
    urgency_reasoning: Mapped[str | None] = mapped_column(Text, nullable=True)
    department: Mapped[Department | None] = mapped_column(SAEnum(Department), nullable=True)
    department_confidence: Mapped[float] = mapped_column(Float, default=0.0, nullable=True)
    department_justification: Mapped[str | None] = mapped_column(Text, nullable=True)
    escalation_flags: Mapped[str] = mapped_column(Text, default="[]", nullable=True)  # JSON list
    ai_summary: Mapped[str | None] = mapped_column(Text, nullable=True)  # human-readable AI reasoning

    # Embedding for dedup (stored as JSON array string)
    embedding: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Images
    before_image: Mapped[str | None] = mapped_column(String, nullable=True)
    after_image: Mapped[str | None] = mapped_column(String, nullable=True)

    # Resolution verification
    resolution_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    resolution_reasoning: Mapped[str | None] = mapped_column(Text, nullable=True)
    reopen_deadline: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Dedup / corroboration
    parent_id: Mapped[str | None] = mapped_column(String, ForeignKey("reports.id"), nullable=True)
    corroboration_count: Mapped[int] = mapped_column(Integer, default=0, nullable=True)
    upvote_count: Mapped[int] = mapped_column(Integer, default=0, nullable=True)

    # SLA tracking
    sla_deadline: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    escalation_tier: Mapped[int] = mapped_column(Integer, default=1, nullable=True)  # 1=ward, 2=zone, 3=commissioner
    escalated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    reopen_count: Mapped[int] = mapped_column(Integer, default=0, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now, nullable=True)

    # Relationships
    timelines: Mapped[list["TimelineEvent"]] = relationship(
        "TimelineEvent", back_populates="report", cascade="all, delete-orphan"
    )
    sla_breaches: Mapped[list["SLABreach"]] = relationship(
        "SLABreach", back_populates="report", cascade="all, delete-orphan"
    )

    def get_escalation_flags(self) -> list:
        """Decoded escalation flags (empty list on bad JSON)."""
        try:
            return json.loads(self.escalation_flags or "[]")
        except Exception:
            return []

    def set_escalation_flags(self, flags: list) -> None:
        """Store escalation flags as a JSON string."""
        self.escalation_flags = json.dumps(flags)


class TimelineEvent(Base):
    """One public, timestamped step in an issue's tracking history."""

    __tablename__ = "timeline_events"
    __table_args__ = (Index("ix_timeline_events_report_id", "report_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    report_id: Mapped[str] = mapped_column(String, ForeignKey("reports.id"), nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    actor: Mapped[str] = mapped_column(String, default="system", nullable=True)  # "system", "ai", "admin", "citizen"
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=True)

    report: Mapped["Report"] = relationship("Report", back_populates="timelines")


class SLABreach(Base):
    """Public transparency record of a missed SLA deadline and its escalation."""

    __tablename__ = "sla_breaches"
    __table_args__ = (
        Index("ix_sla_breaches_report_id", "report_id"),
        Index("ix_sla_breaches_created_at", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    report_id: Mapped[str] = mapped_column(String, ForeignKey("reports.id"), nullable=False)
    escalated_to_tier: Mapped[int] = mapped_column(Integer, nullable=False)
    breach_minutes: Mapped[int] = mapped_column(Integer, nullable=False)  # how late
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=True)

    report: Mapped["Report"] = relationship("Report", back_populates="sla_breaches")


def get_db() -> Iterator[Session]:
    """FastAPI dependency yielding a request-scoped DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create missing tables, plus any indexes missing from pre-existing databases."""
    Base.metadata.create_all(bind=engine)
    for table in Base.metadata.sorted_tables:
        for index in table.indexes:
            index.create(bind=engine, checkfirst=True)
