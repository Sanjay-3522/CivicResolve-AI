"""
Tests for Phase-3 hardening: input validation, bulk-status, X-Forwarded-For
handling, security headers and production docs lockdown.
"""

import os
import subprocess
import sys

import pytest
from starlette.requests import Request

from database import Category, Report, ReportStatus, TimelineEvent, utc_now
from services.auth import get_client_ip, report_limiter

VALID_REPORT = {
    "title": "Broken streetlamp outside park",
    "description": "Dark streetlight creating safety issue for pedestrians",
    "latitude": "12.9784",
    "longitude": "77.6408",
    "category": "streetlight",
}


def _make_report(db, rid: str, **kw) -> Report:
    r = Report(
        id=rid,
        title=kw.get("title", f"Report {rid}"),
        description="A long enough description",
        category=kw.get("category", Category.pothole),
        status=kw.get("status", ReportStatus.reported),
        latitude=kw.get("latitude", 12.97),
        longitude=kw.get("longitude", 77.59),
        urgency=kw.get("urgency", 3),
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    db.add(r)
    db.commit()
    return r


# ── Input validation ──────────────────────────────────────────────────────────
@pytest.mark.asyncio
@pytest.mark.parametrize(
    "field,value",
    [
        ("latitude", "90.5"),
        ("latitude", "-91"),
        ("longitude", "180.1"),
        ("longitude", "-181"),
        ("title", "ab"),
        ("title", "x" * 121),
        ("description", "too short"),
        ("description", "y" * 2001),
        ("address", "z" * 301),
        ("category", "not_a_category"),
    ],
)
async def test_create_report_rejects_out_of_range_fields(client, field, value):
    res = await client.post("/api/reports", data={**VALID_REPORT, field: value})
    assert res.status_code == 422, (field, value, res.text)


@pytest.mark.asyncio
async def test_create_report_accepts_boundary_values(client):
    data = {
        **VALID_REPORT,
        "title": "abc",
        "description": "d" * 10,
        "latitude": "90",
        "longitude": "-180",
        "address": "a" * 300,
    }
    res = await client.post("/api/reports", data=data)
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "query",
    [
        "limit=0",
        "limit=201",
        "radius=0",
        "radius=50001",
        "lat=91&lon=0",
        "lat=0&lon=-181",
        "category=spaceship",
        "status=lost",
    ],
)
async def test_list_reports_rejects_invalid_query(client, query):
    res = await client.get(f"/api/reports?{query}")
    assert res.status_code == 422, query


@pytest.mark.asyncio
async def test_list_reports_radius_filter_uses_bbox_and_haversine(client, db):
    _make_report(db, "near-1", latitude=12.9716, longitude=77.5946)
    _make_report(db, "far-1", latitude=13.0716, longitude=77.5946)  # ~11 km north
    res = await client.get("/api/reports?lat=12.9716&lon=77.5946&radius=1000")
    ids = {r["id"] for r in res.json()}
    assert "near-1" in ids and "far-1" not in ids


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "path",
    [
        "/api/admin/queue?limit=201",
        "/api/admin/queue?min_urgency=6",
        "/api/admin/queue?department=NASA",
        "/api/admin/sla-log?limit=0",
        "/api/admin/heatmap?category=bogus",
    ],
)
async def test_admin_list_endpoints_validate_query(client, admin_headers, path):
    res = await client.get(path, headers=admin_headers)
    assert res.status_code == 422, path


@pytest.mark.asyncio
async def test_status_note_and_reopen_reason_length_caps(client, db, admin_headers):
    _make_report(db, "note-cap", status=ReportStatus.resolved)
    res = await client.post(
        "/api/reports/note-cap/status", data={"status": "in_progress", "note": "n" * 501}, headers=admin_headers
    )
    assert res.status_code == 422
    res = await client.post("/api/reports/note-cap/reopen", data={"reason": "r" * 501})
    assert res.status_code == 422


# ── Bulk status ───────────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_bulk_status_rejects_invalid_status(client, db, admin_headers):
    _make_report(db, "bulk-a")
    res = await client.patch(
        "/api/admin/reports/bulk-status", data={"report_ids": "bulk-a", "status": "teleported"}, headers=admin_headers
    )
    assert res.status_code == 400
    db.expire_all()
    assert db.get(Report, "bulk-a").status == ReportStatus.reported


@pytest.mark.asyncio
async def test_bulk_status_caps_number_of_ids(client, admin_headers):
    ids = ",".join(f"id-{i}" for i in range(201))
    res = await client.patch(
        "/api/admin/reports/bulk-status", data={"report_ids": ids, "status": "acknowledged"}, headers=admin_headers
    )
    assert res.status_code == 400
    assert "max 200" in res.json()["detail"]


@pytest.mark.asyncio
async def test_bulk_status_rejects_empty_id_list(client, admin_headers):
    res = await client.patch(
        "/api/admin/reports/bulk-status", data={"report_ids": " , ", "status": "acknowledged"}, headers=admin_headers
    )
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_bulk_status_updates_existing_ids_and_logs_timeline(client, db, admin_headers):
    _make_report(db, "bulk-1")
    _make_report(db, "bulk-2")
    res = await client.patch(
        "/api/admin/reports/bulk-status",
        data={"report_ids": "bulk-1,bulk-2,bulk-1,missing", "status": "in_progress", "note": "crew sent"},
        headers=admin_headers,
    )
    assert res.status_code == 200
    assert res.json() == {"updated": 2}
    db.expire_all()
    assert db.get(Report, "bulk-1").status == ReportStatus.in_progress
    events = db.query(TimelineEvent).filter(TimelineEvent.report_id.in_(["bulk-1", "bulk-2"])).all()
    assert len(events) == 2 and all(e.note == "crew sent" and e.status == "in_progress" for e in events)


@pytest.mark.asyncio
async def test_bulk_status_accepts_exactly_the_cap(client, admin_headers):
    ids = ",".join(f"id-{i}" for i in range(200))
    res = await client.patch(
        "/api/admin/reports/bulk-status", data={"report_ids": ids, "status": "acknowledged"}, headers=admin_headers
    )
    assert res.status_code == 200 and res.json() == {"updated": 0}


# ── X-Forwarded-For handling ──────────────────────────────────────────────────
def _req(peer: str, xff: str | None = None) -> Request:
    headers = [(b"x-forwarded-for", xff.encode())] if xff is not None else []
    return Request({"type": "http", "headers": headers, "client": (peer, 1234)})


def test_xff_ignored_without_trust_proxy(monkeypatch):
    monkeypatch.delenv("TRUST_PROXY", raising=False)
    assert get_client_ip(_req("203.0.113.9", "1.2.3.4")) == "203.0.113.9"


def test_xff_spoofed_left_entries_are_ignored(monkeypatch):
    monkeypatch.setenv("TRUST_PROXY", "1")
    # attacker-supplied "6.6.6.6" + real client appended by Cloud Run
    assert get_client_ip(_req("127.0.0.1", "6.6.6.6, 198.51.100.7")) == "198.51.100.7"


def test_xff_skips_trusted_proxy_hops(monkeypatch):
    monkeypatch.setenv("TRUST_PROXY", "1")
    assert get_client_ip(_req("127.0.0.1", "6.6.6.6, 198.51.100.7, 35.191.1.2, 169.254.1.1")) == "198.51.100.7"


def test_xff_private_spoof_cannot_hide_client(monkeypatch):
    monkeypatch.setenv("TRUST_PROXY", "1")
    assert get_client_ip(_req("127.0.0.1", "10.0.0.1, 198.51.100.7")) == "198.51.100.7"


def test_xff_all_trusted_or_garbage_falls_back_to_peer(monkeypatch):
    monkeypatch.setenv("TRUST_PROXY", "1")
    assert get_client_ip(_req("127.0.0.1", "10.0.0.1, 192.168.1.1")) == "127.0.0.1"
    assert get_client_ip(_req("127.0.0.1", "not-an-ip")) == "127.0.0.1"
    assert get_client_ip(_req("127.0.0.1")) == "127.0.0.1"


@pytest.mark.asyncio
async def test_rotating_spoofed_xff_does_not_bypass_rate_limit(client, monkeypatch):
    monkeypatch.delenv("TRUST_PROXY", raising=False)
    report_limiter.reset()
    codes = []
    for i in range(report_limiter.requests + 2):
        res = await client.post("/api/reports", data=VALID_REPORT, headers={"X-Forwarded-For": f"1.1.1.{i}"})
        codes.append(res.status_code)
    assert 429 in codes


@pytest.mark.asyncio
async def test_rotating_spoofed_prefix_with_trust_proxy_still_limited(client, monkeypatch):
    monkeypatch.setenv("TRUST_PROXY", "1")
    report_limiter.reset()
    codes = []
    for i in range(report_limiter.requests + 2):
        res = await client.post(
            "/api/reports", data=VALID_REPORT, headers={"X-Forwarded-For": f"1.1.1.{i}, 198.51.100.42"}
        )
        codes.append(res.status_code)
    assert 429 in codes


# ── Security headers & docs ───────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_security_headers_present(client):
    res = await client.get("/health")
    assert res.status_code == 200
    h = res.headers
    assert h["x-content-type-options"] == "nosniff"
    assert h["x-frame-options"] == "DENY"
    assert h["referrer-policy"] == "strict-origin-when-cross-origin"
    assert "geolocation=(self)" in h["permissions-policy"]
    assert "max-age=" in h["strict-transport-security"]
    assert "default-src 'none'" in h["content-security-policy"]


@pytest.mark.asyncio
async def test_health_reports_ai_mode(client, monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    assert (await client.get("/health")).json()["ai_mode"] == "mock"
    monkeypatch.setenv("GEMINI_API_KEY", "dummy")
    assert (await client.get("/health")).json()["ai_mode"] == "live"


@pytest.mark.asyncio
async def test_docs_available_outside_production(client):
    assert (await client.get("/docs")).status_code == 200


def test_docs_disabled_in_production():
    backend = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    code = (
        "import main; from fastapi.testclient import TestClient; c = TestClient(main.app); "
        "assert c.get('/docs').status_code == 404; assert c.get('/redoc').status_code == 404; "
        "assert c.get('/openapi.json').status_code == 404"
    )
    env = {
        **os.environ,
        "ENV": "production",
        "ADMIN_API_KEY": "prod-test-key-0123456789",
        "DATABASE_URL": "sqlite:///:memory:",
    }
    result = subprocess.run([sys.executable, "-c", code], cwd=backend, env=env, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
