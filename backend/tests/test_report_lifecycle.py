"""
Route branches for the report lifecycle (resolve, status, reopen), list filters,
admin queue/heatmap, and dedup through the API.
"""

import io
from datetime import timedelta

import pytest
from PIL import Image

from database import Category, Department, Report, ReportStatus, utc_now


# ── helpers ───────────────────────────────────────────────────────────────────
def _jpeg_bytes(color=(200, 50, 50)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), color).save(buf, format="JPEG")
    return buf.getvalue()


def _report(db, rid, **kw):
    now = utc_now()
    r = Report(
        id=rid,
        title=kw.get("title", "Pothole on main road"),
        description="Deep pothole near the signal",
        category=kw.get("category", Category.pothole),
        status=kw.get("status", ReportStatus.reported),
        latitude=12.97,
        longitude=77.59,
        urgency=kw.get("urgency", 3),
        department=kw.get("department", Department.PWD),
        before_image=kw.get("before_image"),
        sla_deadline=kw.get("sla_deadline"),
        reopen_deadline=kw.get("reopen_deadline"),
        upvote_count=kw.get("upvote_count", 0),
        corroboration_count=kw.get("corroboration_count", 0),
        created_at=now,
        updated_at=now,
    )
    db.add(r)
    db.commit()
    return r


# ── route branches ────────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_resolve_with_before_and_after_images_is_flagged_in_mock_mode(
    client, db, admin_headers, tmp_path, monkeypatch
):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    before = tmp_path / "before.jpg"
    before.write_bytes(_jpeg_bytes())
    _report(db, "res-1", before_image=str(before), status=ReportStatus.in_progress)
    res = await client.post(
        "/api/reports/res-1/resolve",
        headers=admin_headers,
        files={"after_image": ("after.jpg", _jpeg_bytes((0, 255, 0)), "image/jpeg")},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "flagged" and res.json()["reopen_deadline"]


@pytest.mark.asyncio
async def test_resolve_verified_when_ai_confident(client, db, admin_headers, tmp_path, monkeypatch):
    before = tmp_path / "before.jpg"
    before.write_bytes(_jpeg_bytes())
    _report(db, "res-2", before_image=str(before))

    async def confident(**kw):
        return {"confidence": 0.95, "reasoning": "fixed", "flag_for_review": False}

    monkeypatch.setattr("routes.report_lifecycle.verify_resolution", confident)
    res = await client.post(
        "/api/reports/res-2/resolve",
        headers=admin_headers,
        files={"after_image": ("after.png", _jpeg_bytes(), "image/jpeg")},
    )
    assert res.json()["status"] == "verified"


@pytest.mark.asyncio
async def test_resolve_without_after_image_and_404(client, db, admin_headers):
    _report(db, "res-3")
    res = await client.post("/api/reports/res-3/resolve", headers=admin_headers, data={"note": "done"})
    assert res.json()["status"] == "resolved"
    assert (await client.post("/api/reports/missing/resolve", headers=admin_headers)).status_code == 404


@pytest.mark.asyncio
async def test_status_update_paths(client, db, admin_headers):
    _report(db, "st-1")
    bad = await client.post("/api/reports/st-1/status", data={"status": "bogus"}, headers=admin_headers)
    assert bad.status_code == 400
    missing = await client.post("/api/reports/nope/status", data={"status": "acknowledged"}, headers=admin_headers)
    assert missing.status_code == 404
    ok = await client.post("/api/reports/st-1/status", data={"status": "acknowledged"}, headers=admin_headers)
    assert ok.status_code == 200


@pytest.mark.asyncio
async def test_reopen_rejections(client, db):
    _report(db, "ro-1", status=ReportStatus.resolved, reopen_deadline=utc_now() - timedelta(hours=1))
    _report(db, "ro-2", status=ReportStatus.in_progress)
    assert (await client.post("/api/reports/ro-1/reopen", data={"reason": "still broken"})).status_code == 400
    assert (await client.post("/api/reports/ro-2/reopen", data={"reason": "still broken"})).status_code == 400
    assert (await client.post("/api/reports/none/reopen", data={"reason": "x"})).status_code == 404


@pytest.mark.asyncio
async def test_get_and_upvote_missing_report(client):
    assert (await client.get("/api/reports/does-not-exist")).status_code == 404
    assert (await client.post("/api/reports/does-not-exist/upvote")).status_code == 404


@pytest.mark.asyncio
async def test_list_reports_category_and_status_filters(client, db):
    _report(db, "lf-1", category=Category.garbage, status=ReportStatus.reported)
    _report(db, "lf-2", category=Category.pothole, status=ReportStatus.resolved)
    ids = {r["id"] for r in (await client.get("/api/reports?category=garbage&status=reported")).json()}
    assert ids == {"lf-1"}


@pytest.mark.asyncio
async def test_admin_queue_filters_and_sla_breach_fields(client, db, admin_headers):
    _report(
        db,
        "q-1",
        department=Department.BESCOM,
        category=Category.streetlight,
        urgency=5,
        sla_deadline=utc_now() - timedelta(hours=2),
    )
    _report(db, "q-2", department=Department.PWD, urgency=2, sla_deadline=utc_now() + timedelta(days=3))
    body = (
        await client.get(
            "/api/admin/queue?department=BESCOM&category=streetlight&status=reported&min_urgency=4",
            headers=admin_headers,
        )
    ).json()
    assert [r["id"] for r in body] == ["q-1"]
    assert body[0]["sla_breached"] is True and body[0]["minutes_overdue"] >= 119
    risk = (await client.get("/api/admin/queue?sla_at_risk=true", headers=admin_headers)).json()
    assert {r["id"] for r in risk} == {"q-1"}


@pytest.mark.asyncio
async def test_heatmap_weights_and_category_filter(client, db, admin_headers):
    _report(db, "h-1", urgency=4, corroboration_count=2, upvote_count=5)
    _report(db, "h-2", category=Category.garbage)
    pts = (await client.get("/api/admin/heatmap?category=pothole", headers=admin_headers)).json()
    assert len(pts) == 1 and pts[0]["weight"] == round(4 * (1 + 2 * 0.5 + 5 * 0.1), 2)


@pytest.mark.asyncio
async def test_create_report_merges_duplicate(client, monkeypatch):
    async def fixed_embedding(text):
        return [1.0, 0.0, 0.0]

    monkeypatch.setattr("routes.reports.get_embedding", fixed_embedding)
    data = {
        "title": "Pothole on MG Road",
        "description": "Huge pothole near the metro pillar",
        "latitude": "12.9750",
        "longitude": "77.6050",
        "category": "pothole",
    }
    first = (await client.post("/api/reports", data=data)).json()
    second = (await client.post("/api/reports", data={**data, "latitude": "12.9751"})).json()
    assert first["merged"] is False
    assert second["merged"] is True and second["existing_id"] == first["id"]


def test_run_sla_check_handles_errors(db, monkeypatch):
    from services import sla_engine

    monkeypatch.setattr(db, "commit", lambda: (_ for _ in ()).throw(RuntimeError("db down")))
    sla_engine.run_sla_check(db)  # must log and roll back, not raise
