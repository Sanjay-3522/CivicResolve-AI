"""
CivicResolve — SLA Engine

Defines resolution windows per category+priority.
APScheduler job checks for SLA breaches every 5 minutes.
Breaches auto-escalate and are logged to public transparency log.
"""

import logging
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from database import Report, ReportStatus, SessionLocal, SLABreach, TimelineEvent, utc_now

logger = logging.getLogger(__name__)

# SLA windows in minutes: {category: [P1, P2, P3, P4, P5]}
# Index 0 = urgency 1 (lowest priority, longest window)
# Index 4 = urgency 5 (highest priority, shortest window)
SLA_MINUTES = {
    "pothole": [20160, 10080, 4320, 1440, 240],
    "garbage": [20160, 10080, 4320, 1440, 480],
    "streetlight": [10080, 4320, 1440, 480, 120],
    "water_leakage": [10080, 4320, 1440, 240, 60],
    "road_damage": [43200, 20160, 10080, 2880, 480],
    "other": [20160, 10080, 4320, 1440, 480],
}

ESCALATION_TIER_LABELS = {
    1: "Ward Officer",
    2: "Zonal Commissioner",
    3: "Municipal Commissioner",
}


def get_sla_minutes(category: str, urgency: int) -> int:
    """Resolution window in minutes for a category and urgency (1–5, clamped)."""
    cat_str = category.value if hasattr(category, "value") else str(category).replace("Category.", "")
    windows = SLA_MINUTES.get(cat_str, SLA_MINUTES["other"])
    idx = max(0, min(4, int(urgency) - 1))
    return windows[idx]  # urgency 1 → index 0 (longest), urgency 5 → index 4 (shortest)


def compute_sla_deadline(category: str, urgency: int, from_time: datetime) -> datetime:
    """Deadline = from_time + SLA window for the category/urgency."""
    minutes = get_sla_minutes(category, urgency)
    return from_time + timedelta(minutes=minutes)


def run_sla_check(db: Session | None = None) -> None:
    """
    Called by APScheduler every 5 minutes.
    Finds breached reports, escalates, logs to transparency log.
    """
    should_close = False
    if db is None:
        db = SessionLocal()
        should_close = True
    try:
        now = utc_now()
        active_statuses = [
            ReportStatus.reported,
            ReportStatus.acknowledged,
            ReportStatus.in_progress,
        ]

        breached = (
            db.query(Report)
            .filter(
                Report.status.in_(active_statuses),
                Report.sla_deadline.isnot(None),
                Report.sla_deadline < now,
                Report.escalation_tier < 3,
            )
            .all()
        )

        for report in breached:
            assert report.sla_deadline is not None  # guaranteed by the isnot(None) filter above
            overdue_minutes = int((now - report.sla_deadline).total_seconds() / 60)
            new_tier = min(3, report.escalation_tier + 1)
            tier_label = ESCALATION_TIER_LABELS.get(new_tier, "Commissioner")

            logger.info(
                f"SLA breach: report {report.id} overdue by {overdue_minutes}m "
                f"→ escalating to tier {new_tier} ({tier_label})"
            )

            # Log breach to public transparency log
            breach = SLABreach(
                report_id=report.id,
                escalated_to_tier=new_tier,
                breach_minutes=overdue_minutes,
                note=f"SLA breached by {overdue_minutes} minutes. Auto-escalated to {tier_label}.",
            )
            db.add(breach)

            # Timeline event (visible to citizen)
            event = TimelineEvent(
                report_id=report.id,
                status="escalated",
                note=(
                    f"⚠️ SLA breached — escalated to {tier_label} after {overdue_minutes} min delay. "
                    "This event is public."
                ),
                actor="system",
            )
            db.add(event)

            # Update report
            report.escalation_tier = new_tier
            report.escalated_at = now
            # Bump urgency if at max tier
            if new_tier == 3 and report.urgency < 5:
                report.urgency = min(5, report.urgency + 1)

        db.commit()
        if breached:
            logger.info(f"SLA check complete: {len(breached)} breaches processed")
    except Exception as e:
        logger.error(f"SLA check error: {e}")
        db.rollback()
    finally:
        if should_close:  # only close sessions this function opened
            db.close()
