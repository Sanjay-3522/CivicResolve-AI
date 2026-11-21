"""
Tests for Authentication & Authorization Layer
"""

import pytest

from database import Category, Department, Report, ReportStatus


@pytest.mark.asyncio
async def test_admin_queue_requires_auth(client):
    # Without header
    res = await client.get("/api/admin/queue")
    assert res.status_code == 401
    assert "Unauthorized" in res.json()["detail"]

    # With invalid header
    res = await client.get("/api/admin/queue", headers={"X-Admin-Key": "wrong-key"})
    assert res.status_code == 401

    # With valid header
    res = await client.get("/api/admin/queue", headers={"X-Admin-Key": "test-admin-secret-2026"})
    assert res.status_code == 200
    assert isinstance(res.json(), list)


@pytest.mark.asyncio
async def test_admin_login(client):
    # Missing / empty key
    res = await client.post("/api/admin/login", json={"key": "invalid-key"})
    assert res.status_code == 401

    # Valid key in body
    res = await client.post("/api/admin/login", json={"key": "test-admin-secret-2026"})
    assert res.status_code == 200
    data = res.json()
    assert data["authenticated"] is True
    assert "admin_key" in res.cookies

    # Valid key in header
    res = await client.post("/api/admin/login", headers={"X-Admin-Key": "test-admin-secret-2026"})
    assert res.status_code == 200
    assert res.json()["authenticated"] is True


@pytest.mark.asyncio
async def test_admin_analytics_and_heatmap_require_auth(client, admin_headers):
    # Analytics
    assert (await client.get("/api/admin/analytics")).status_code == 401
    assert (await client.get("/api/admin/analytics", headers=admin_headers)).status_code == 200

    # Heatmap
    assert (await client.get("/api/admin/heatmap")).status_code == 401
    assert (await client.get("/api/admin/heatmap", headers=admin_headers)).status_code == 200

    # SLA log
    assert (await client.get("/api/admin/sla-log")).status_code == 401
    assert (await client.get("/api/admin/sla-log", headers=admin_headers)).status_code == 200


@pytest.mark.asyncio
async def test_mutating_report_routes_require_admin_auth(client, db, admin_headers):
    # Seed a report
    report = Report(
        id="test-auth-rep-1",
        title="Test auth report",
        description="Description",
        category=Category.pothole,
        status=ReportStatus.reported,
        latitude=12.9716,
        longitude=77.5946,
        department=Department.PWD,
    )
    db.add(report)
    db.commit()

    # POST /api/reports/{id}/status without auth -> 401
    res = await client.post("/api/reports/test-auth-rep-1/status", data={"status": "in_progress"})
    assert res.status_code == 401

    # With auth -> 200
    res = await client.post(
        "/api/reports/test-auth-rep-1/status",
        headers=admin_headers,
        data={"status": "in_progress"},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "in_progress"

    # POST /api/reports/{id}/resolve without auth -> 401
    res = await client.post("/api/reports/test-auth-rep-1/resolve", data={"note": "Fixed"})
    assert res.status_code == 401

    # With auth -> 200
    res = await client.post(
        "/api/reports/test-auth-rep-1/resolve",
        headers=admin_headers,
        data={"note": "Fixed"},
    )
    assert res.status_code == 200
    assert res.json()["status"] in ["resolved", "verified", "flagged"]


@pytest.mark.asyncio
async def test_trigger_sla_check_requires_auth(client, admin_headers):
    # Without header -> 401
    res = await client.post("/api/admin/trigger-sla-check")
    assert res.status_code == 401

    # With header -> 200
    res = await client.post("/api/admin/trigger-sla-check", headers=admin_headers)
    assert res.status_code == 200
    assert "triggered" in res.json()["message"]
