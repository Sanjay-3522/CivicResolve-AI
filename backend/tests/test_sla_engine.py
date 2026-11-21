"""
Tests for SLA Escalation Engine
"""

from datetime import datetime, timedelta

from database import Category, Department, Report, ReportStatus, SLABreach, TimelineEvent, utc_now
from services.sla_engine import (
    compute_sla_deadline,
    get_sla_minutes,
    run_sla_check,
)


def test_sla_minutes_urgency_ordering():
    # Higher urgency must have shorter SLA window
    for cat in ["pothole", "garbage", "streetlight", "water_leakage", "road_damage"]:
        p5 = get_sla_minutes(cat, 5)
        p4 = get_sla_minutes(cat, 4)
        p3 = get_sla_minutes(cat, 3)
        p2 = get_sla_minutes(cat, 2)
        p1 = get_sla_minutes(cat, 1)

        assert p5 <= p4 <= p3 <= p2 <= p1
        # P5 for water leakage is 60 minutes
        if cat == "water_leakage":
            assert p5 == 60


def test_sla_minutes_boundary_clamping():
    # Clamping for < 1 and > 5
    assert get_sla_minutes("pothole", 0) == get_sla_minutes("pothole", 1)
    assert get_sla_minutes("pothole", -5) == get_sla_minutes("pothole", 1)
    assert get_sla_minutes("pothole", 6) == get_sla_minutes("pothole", 5)
    assert get_sla_minutes("pothole", 100) == get_sla_minutes("pothole", 5)


def test_compute_sla_deadline():
    start = datetime(2026, 1, 1, 12, 0, 0)
    deadline = compute_sla_deadline("water_leakage", 5, start)
    # Urgency 5 water leakage is 60 minutes
    assert deadline == datetime(2026, 1, 1, 13, 0, 0)


def test_run_sla_check_escalates_breached_reports(db):
    now = utc_now()
    # Seed a report whose SLA deadline expired 90 minutes ago
    expired_deadline = now - timedelta(minutes=90)

    breached_report = Report(
        id="sla-breach-test-rep",
        title="Unattended sewer overflow",
        description="Drainage overflowing for 2 days",
        category=Category.water_leakage,
        status=ReportStatus.reported,
        latitude=12.9550,
        longitude=77.6100,
        urgency=4,
        department=Department.BWSSB,
        sla_deadline=expired_deadline,
        escalation_tier=1,
        created_at=now - timedelta(hours=5),
    )
    db.add(breached_report)
    db.commit()

    # Run the SLA check job on the test session
    run_sla_check(db)

    # Verify escalation tier incremented
    refreshed = db.query(Report).filter(Report.id == "sla-breach-test-rep").first()
    assert refreshed is not None
    assert refreshed.escalation_tier == 2
    assert refreshed.escalated_at is not None

    # Verify SLABreach row created in public transparency log
    breach = db.query(SLABreach).filter(SLABreach.report_id == "sla-breach-test-rep").first()
    assert breach is not None
    assert breach.escalated_to_tier == 2
    assert breach.breach_minutes >= 80

    # Verify TimelineEvent logged for citizen tracking
    event = (
        db.query(TimelineEvent)
        .filter(TimelineEvent.report_id == "sla-breach-test-rep", TimelineEvent.status == "escalated")
        .first()
    )
    assert event is not None
    assert "SLA breached" in event.note
