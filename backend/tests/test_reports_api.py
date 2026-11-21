"""
Tests for Reports API Endpoints (Citizen Lifecycle)
"""

from datetime import timedelta

import pytest

from database import Category, Department, Report, ReportStatus, utc_now


@pytest.mark.asyncio
async def test_create_report_happy_path(client):
    data = {
        "title": "Broken streetlamp outside park",
        "description": "Dark streetlight creating safety issue for pedestrians",
        "latitude": "12.9784",
        "longitude": "77.6408",
        "category": "streetlight",
    }
    res = await client.post("/api/reports", data=data)
    assert res.status_code == 200
    res_data = res.json()
    assert res_data["merged"] is False
    assert res_data["triage_source"] in ("rules", "gemini")
    assert "id" in res_data
    assert res_data["category"] == "streetlight"
    assert "sla_deadline" in res_data


@pytest.mark.asyncio
async def test_create_report_validation_errors(client):
    # Missing title
    res = await client.post(
        "/api/reports",
        data={
            "description": "Some description",
            "latitude": "12.9716",
            "longitude": "77.5946",
        },
    )
    assert res.status_code == 422

    # Missing coordinates
    res = await client.post(
        "/api/reports",
        data={
            "title": "Some title",
            "description": "Some description",
        },
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_get_report_detail_with_corroborations_and_timelines(client, db):
    now = utc_now()
    parent = Report(
        id="detail-test-rep",
        title="Main issue report",
        description="Pothole near bus stop",
        category=Category.pothole,
        status=ReportStatus.reported,
        latitude=12.9716,
        longitude=77.5946,
        urgency=3,
        department=Department.PWD,
        created_at=now,
    )
    db.add(parent)
    db.commit()

    # Add a corroborating child report
    child = Report(
        id="detail-test-child",
        title="Also saw this pothole",
        description="Damaged a tire on this exact spot",
        category=Category.pothole,
        status=ReportStatus.merged,
        latitude=12.9717,
        longitude=77.5947,
        parent_id="detail-test-rep",
        created_at=now,
    )
    db.add(child)
    db.commit()

    res = await client.get("/api/reports/detail-test-rep")
    assert res.status_code == 200
    res_data = res.json()
    assert res_data["id"] == "detail-test-rep"
    assert "corroborations" in res_data
    assert len(res_data["corroborations"]) == 1
    assert res_data["corroborations"][0]["title"] == "Also saw this pothole"


@pytest.mark.asyncio
async def test_upvote_report(client, db):
    report = Report(
        id="upvote-test-rep",
        title="Issue needing upvotes",
        description="Water stagnation",
        category=Category.water_leakage,
        status=ReportStatus.reported,
        latitude=12.9352,
        longitude=77.6245,
        upvote_count=5,
    )
    db.add(report)
    db.commit()

    res = await client.post("/api/reports/upvote-test-rep/upvote")
    assert res.status_code == 200
    assert res.json()["upvote_count"] == 6


@pytest.mark.asyncio
async def test_reopen_report_escalates_urgency_and_sla(client, db):
    now = utc_now()
    initial_deadline = now + timedelta(hours=24)

    resolved_rep = Report(
        id="reopen-test-rep",
        title="Prematurely closed issue",
        description="Road resurfacing incomplete",
        category=Category.road_damage,
        status=ReportStatus.resolved,
        latitude=12.9121,
        longitude=77.6446,
        urgency=2,
        department=Department.PWD,
        sla_deadline=initial_deadline,
        reopen_deadline=now + timedelta(hours=48),  # Active window
        reopen_count=0,
    )
    db.add(resolved_rep)
    db.commit()

    res = await client.post("/api/reports/reopen-test-rep/reopen", data={"reason": "Pothole still present after rain"})
    assert res.status_code == 200
    res_data = res.json()
    assert res_data["status"] == "reopened"
    assert res_data["reopen_count"] == 1
    assert res_data["new_urgency"] == 3

    # Verify SLA deadline recomputed
    db.refresh(resolved_rep)
    assert resolved_rep.urgency == 3
    assert resolved_rep.sla_deadline is not None


@pytest.mark.asyncio
async def test_rate_limiter_blocks_excessive_submissions(client):
    # report_limiter limit is 10 requests per minute
    data = {
        "title": "Rate limit spam test",
        "description": "Submitting rapidly",
        "latitude": "12.9716",
        "longitude": "77.5946",
    }

    status_codes = []
    for _ in range(12):
        res = await client.post("/api/reports", data=data)
        status_codes.append(res.status_code)

    assert 429 in status_codes
    rate_limited_res = [c for c in status_codes if c == 429]
    assert len(rate_limited_res) >= 1
