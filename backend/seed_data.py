"""
CivicResolve — Seed Data for Demo

Showcases:
1. Multiple potholes near each other → deduplication triggers
2. SLA breach scenario (reports created with expired SLA deadlines)
3. Water leakage near electrical → auto-escalated urgency (5)
4. Resolved + reopened flow
5. Heatmap hotspot cluster
"""

import json
import logging
from datetime import timedelta

from database import Report, ReportStatus, SessionLocal, SLABreach, TimelineEvent, init_db, utc_now
from seed_fixtures import DEMO_LOCATIONS, SEED_REPORTS

logger = logging.getLogger(__name__)


def seed_if_empty() -> None:
    """Only seed if the reports table is empty."""
    db = SessionLocal()
    try:
        count = db.query(Report).count()
        if count > 0:
            print(f"Database already has {count} reports, skipping seed.")
            return
        _do_seed(db)
        logger.info("Seeded %d demo reports.", len(SEED_REPORTS))
    finally:
        db.close()


def _do_seed(db):
    now = utc_now()

    for data in SEED_REPORTS:
        sla_hours = data.pop("sla_offset_hours", 24)
        reopen_hours = data.pop("reopen_offset_hours", None)
        timeline_data = data.pop("timeline", [])
        data.pop("is_parent", None)

        sla_deadline = now + timedelta(hours=sla_hours)
        reopen_deadline = now + timedelta(hours=reopen_hours) if reopen_hours else None
        created_at = now - timedelta(hours=max(0, -sla_hours) + 2)

        flags = data.pop("escalation_flags", [])
        report = Report(
            id=data["id"],
            title=data["title"],
            description=data["description"],
            category=data["category"],
            status=data["status"],
            latitude=data["latitude"],
            longitude=data["longitude"],
            address=data.get("address"),
            urgency=data["urgency"],
            urgency_reasoning=data.get("urgency_reasoning"),
            department=data["department"],
            department_confidence=data.get("department_confidence", 0.8),
            department_justification=data.get("department_justification"),
            escalation_flags=json.dumps(flags),
            ai_summary=data.get("ai_summary"),
            embedding=json.dumps([0.0] * 128),  # Placeholder
            corroboration_count=data.get("corroboration_count", 0),
            upvote_count=data.get("upvote_count", 0),
            sla_deadline=sla_deadline,
            escalation_tier=data.get("escalation_tier", 1),
            reopen_count=data.get("reopen_count", 0),
            resolution_confidence=data.get("resolution_confidence"),
            resolution_reasoning=data.get("resolution_reasoning"),
            reopen_deadline=reopen_deadline,
            created_at=created_at,
            updated_at=now,
        )
        db.add(report)

        # Timeline events
        for i, (status, note, actor) in enumerate(timeline_data):
            event = TimelineEvent(
                report_id=data["id"],
                status=status,
                note=note,
                actor=actor,
                created_at=created_at + timedelta(hours=i * 2),
            )
            db.add(event)

    # Add SLA breach records for demo
    breached_report_id = SEED_REPORTS[0]["id"]
    critical_report_id = SEED_REPORTS[1]["id"]

    # Seed actual corroborating reports linked to MG Road pothole report
    db.add(
        Report(
            id="demo-corrob-1",
            title="Large crater right outside Trinity metro exit",
            description="Almost fell off my motorcycle today evening because of this pothole. It is very wide and filled with loose gravel.",
            category="pothole",
            status=ReportStatus.merged,
            latitude=DEMO_LOCATIONS[1]["lat"],
            longitude=DEMO_LOCATIONS[1]["lon"],
            address=DEMO_LOCATIONS[1]["address"],
            urgency=4,
            department="PWD",
            parent_id=breached_report_id,
            created_at=now - timedelta(hours=14),
            updated_at=now - timedelta(hours=14),
        )
    )
    db.add(
        Report(
            id="demo-corrob-2",
            title="Pothole near Cauvery Junction signal",
            description="Auto rickshaws are braking suddenly causing traffic backlogs. Deep ditch in the center lane.",
            category="pothole",
            status=ReportStatus.merged,
            latitude=DEMO_LOCATIONS[2]["lat"],
            longitude=DEMO_LOCATIONS[2]["lon"],
            address=DEMO_LOCATIONS[2]["address"],
            urgency=4,
            department="PWD",
            parent_id=breached_report_id,
            created_at=now - timedelta(hours=8),
            updated_at=now - timedelta(hours=8),
        )
    )

    db.add(
        SLABreach(
            report_id=breached_report_id,
            escalated_to_tier=2,
            breach_minutes=1080,
            note="SLA breached by 1080 minutes. Auto-escalated to Zonal Commissioner.",
            created_at=now - timedelta(hours=2),
        )
    )
    db.add(
        SLABreach(
            report_id=critical_report_id,
            escalated_to_tier=2,
            breach_minutes=240,
            note="SLA breached by 240 minutes. Auto-escalated to Zonal Commissioner.",
            created_at=now - timedelta(hours=1),
        )
    )

    db.commit()


if __name__ == "__main__":
    init_db()
    seed_if_empty()
