"""
Tests for Phase-4 efficiency work: SQL aggregates must equal the old Python-loop
results, the SLA log join, numpy cosine parity, DB indexes and utc_now().
"""

import math
import random
from collections import defaultdict
from datetime import UTC, timedelta

import pytest
from sqlalchemy import inspect

from database import (
    Category,
    Department,
    Report,
    ReportStatus,
    SLABreach,
    init_db,
    utc_now,
)
from services.geo_dedup import cosine_similarity


def _legacy_analytics(db) -> dict:
    """The pre-refactor implementation, kept verbatim as the reference oracle."""
    now = utc_now()
    week_ago = now - timedelta(days=7)
    total = db.query(Report).filter(Report.parent_id.is_(None)).count()
    resolved_week = (
        db.query(Report)
        .filter(
            Report.status.in_([ReportStatus.verified, ReportStatus.resolved]),
            Report.updated_at >= week_ago,
        )
        .count()
    )
    resolved_reports = (
        db.query(Report)
        .filter(
            Report.status.in_([ReportStatus.verified, ReportStatus.resolved]),
            Report.parent_id.is_(None),
        )
        .all()
    )
    avg_hours = 0.0
    if resolved_reports:
        avg_hours = sum((r.updated_at - r.created_at).total_seconds() / 3600 for r in resolved_reports) / len(
            resolved_reports
        )
    by_category: defaultdict[str, dict[str, int]] = defaultdict(lambda: {"total": 0, "resolved": 0})
    by_dept: defaultdict[str, int] = defaultdict(int)
    by_status: defaultdict[str, int] = defaultdict(int)
    for r in db.query(Report).filter(Report.parent_id.is_(None)).all():
        by_category[str(r.category)]["total"] += 1
        if r.status in [ReportStatus.verified, ReportStatus.resolved]:
            by_category[str(r.category)]["resolved"] += 1
        by_dept[str(r.department)] += 1
        by_status[str(r.status)] += 1
    return {
        "total_reports": total,
        "resolved_this_week": resolved_week,
        "avg_resolution_hours": round(avg_hours, 1),
        "by_category": dict(by_category),
        "by_department": dict(by_dept),
        "by_status": dict(by_status),
        "sla_breach_count": db.query(SLABreach).count(),
    }


def _seed(db, n: int = 60) -> None:
    rng = random.Random(42)
    now = utc_now()
    cats, depts, statuses = list(Category), list(Department) + [None], list(ReportStatus)
    parents: list[str] = []
    for i in range(n):
        created = now - timedelta(hours=rng.randint(1, 24 * 30))
        r = Report(
            id=f"agg-{i}",
            title=f"Seeded {i}",
            description="Seeded analytics row",
            category=rng.choice(cats),
            department=rng.choice(depts),
            status=rng.choice(statuses),
            latitude=12.9 + rng.random() / 10,
            longitude=77.5 + rng.random() / 10,
            urgency=rng.randint(1, 5),
            created_at=created,
            updated_at=created + timedelta(minutes=rng.randint(5, 60 * 24 * 5)),
            parent_id=rng.choice(parents) if parents and rng.random() < 0.2 else None,
        )
        db.add(r)
        if r.parent_id is None:
            parents.append(r.id)
    db.flush()
    for i in range(7):
        db.add(
            SLABreach(
                report_id=f"agg-{i}",
                escalated_to_tier=2,
                breach_minutes=30 * (i + 1),
                created_at=now - timedelta(minutes=i),
            )
        )
    db.add(
        SLABreach(
            report_id="deleted-report", escalated_to_tier=3, breach_minutes=5, created_at=now + timedelta(minutes=1)
        )
    )
    db.commit()


@pytest.mark.asyncio
async def test_analytics_matches_legacy_implementation(client, db, admin_headers):
    _seed(db)
    res = await client.get("/api/admin/analytics", headers=admin_headers)
    assert res.status_code == 200
    assert res.json() == _legacy_analytics(db)


@pytest.mark.asyncio
async def test_analytics_empty_db(client, admin_headers):
    body = (await client.get("/api/admin/analytics", headers=admin_headers)).json()
    assert body["total_reports"] == 0 and body["avg_resolution_hours"] == 0.0
    assert body["by_category"] == {} and body["sla_breach_count"] == 0


@pytest.mark.asyncio
async def test_sla_log_join_matches_per_row_lookup(client, db, admin_headers):
    _seed(db)
    body = (await client.get("/api/admin/sla-log?limit=50", headers=admin_headers)).json()
    assert len(body) == 8
    assert [b["created_at"] for b in body] == sorted((b["created_at"] for b in body), reverse=True)
    orphan = body[0]
    assert orphan["report_id"] == "deleted-report"
    assert orphan["report_title"] == "Unknown" and orphan["category"] == "unknown"
    for entry in body[1:]:
        rep = db.get(Report, entry["report_id"])
        assert entry["report_title"] == rep.title
        assert entry["category"] == str(rep.category)
        assert entry["hours_overdue"] == round(entry["breach_minutes"] / 60, 1)


@pytest.mark.asyncio
async def test_sla_log_respects_limit(client, db, admin_headers):
    _seed(db)
    body = (await client.get("/api/admin/sla-log?limit=3", headers=admin_headers)).json()
    assert len(body) == 3


def _legacy_cosine(a, b):
    if not a or not b:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b, strict=False))
    ma, mb = math.sqrt(sum(x * x for x in a)), math.sqrt(sum(y * y for y in b))
    return 0.0 if ma == 0 or mb == 0 else dot / (ma * mb)


@pytest.mark.parametrize("seed", range(20))
def test_numpy_cosine_matches_legacy(seed):
    rng = random.Random(seed)
    la, lb = rng.randint(1, 300), rng.randint(1, 300)  # includes mismatched lengths
    a = [rng.uniform(-1, 1) for _ in range(la)]
    b = [rng.uniform(-1, 1) for _ in range(lb)]
    assert cosine_similarity(a, b) == pytest.approx(_legacy_cosine(a, b), abs=1e-12)


def test_expected_indexes_exist(db):
    init_db_on = inspect(db.get_bind())
    report_cols = {tuple(ix["column_names"]) for ix in init_db_on.get_indexes("reports")}
    for col in ["parent_id", "status", "category", "department", "urgency", "created_at", "sla_deadline"]:
        assert (col,) in report_cols, col
    assert ("latitude", "longitude") in report_cols
    assert ("report_id",) in {tuple(i["column_names"]) for i in init_db_on.get_indexes("timeline_events")}
    breach = {tuple(i["column_names"]) for i in init_db_on.get_indexes("sla_breaches")}
    assert ("report_id",) in breach and ("created_at",) in breach


def test_init_db_is_idempotent():
    init_db()
    init_db()


def test_utc_now_is_naive_utc():
    from datetime import datetime

    now = utc_now()
    assert now.tzinfo is None
    assert abs((datetime.now(UTC).replace(tzinfo=None) - now).total_seconds()) < 2
