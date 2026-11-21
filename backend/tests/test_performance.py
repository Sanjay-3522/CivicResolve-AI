"""
Efficiency evidence: pagination + X-Total-Count on every list endpoint, gzip,
Cache-Control policies, ETag/304 revalidation and immutable upload caching.
"""

import io

import pytest
from PIL import Image

from database import Category, Report, SLABreach, utc_now


def _seed(db, n: int = 7) -> list[str]:
    now = utc_now()
    ids = []
    for i in range(n):
        rid = f"perf-{i:02d}"
        db.add(
            Report(
                id=rid,
                title=f"Perf report {i}",
                description="Seeded for pagination tests",
                category=Category.pothole,
                latitude=12.97 + i * 1e-4,
                longitude=77.59,
                urgency=1 + i % 5,
                created_at=now,
                updated_at=now,
            )
        )
        ids.append(rid)
    db.flush()
    for i in range(min(3, n)):
        db.add(SLABreach(report_id=ids[i], escalated_to_tier=2, breach_minutes=10 * (i + 1)))
    db.commit()
    return ids


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "path,total",
    [
        ("/api/reports", 7),
        ("/api/reports?lat=12.97&lon=77.59&radius=1000", 7),
        ("/api/admin/queue", 7),
        ("/api/admin/heatmap", 7),
        ("/api/admin/sla-log", 3),
    ],
)
async def test_every_list_endpoint_paginates_with_total_count(client, db, admin_headers, path, total):
    _seed(db)
    sep = "&" if "?" in path else "?"
    first = await client.get(f"{path}{sep}limit=2&offset=0", headers=admin_headers)
    second = await client.get(f"{path}{sep}limit=2&offset=2", headers=admin_headers)
    tail = await client.get(f"{path}{sep}limit=2&offset={total}", headers=admin_headers)
    assert first.headers["x-total-count"] == str(total)
    assert len(first.json()) == 2 and len(second.json()) == min(2, total - 2) and tail.json() == []
    assert {r["id"] for r in first.json()}.isdisjoint({r["id"] for r in second.json()})


@pytest.mark.asyncio
async def test_default_page_matches_previous_unpaginated_behaviour(client, db):
    ids = _seed(db)
    body = (await client.get("/api/reports")).json()
    assert sorted(r["id"] for r in body) == sorted(ids)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "path",
    [
        "/api/reports?offset=-1",
        "/api/reports?offset=100001",
        "/api/admin/queue?offset=-5",
        "/api/admin/heatmap?limit=0",
        "/api/admin/heatmap?limit=5001",
    ],
)
async def test_pagination_bounds(client, admin_headers, path):
    assert (await client.get(path, headers=admin_headers)).status_code == 422


@pytest.mark.asyncio
async def test_large_json_responses_are_gzipped(client, db):
    _seed(db, 30)
    res = await client.get("/api/reports?limit=30", headers={"Accept-Encoding": "gzip"})
    assert res.headers["content-encoding"] == "gzip"
    assert int(res.headers["content-length"]) < len(res.content) / 3  # compressed on the wire


@pytest.mark.asyncio
async def test_public_list_is_briefly_cacheable(client):
    res = await client.get("/api/reports")
    assert res.headers["cache-control"] == "public, max-age=10, stale-while-revalidate=30"
    assert res.headers["etag"].startswith('"')


@pytest.mark.asyncio
async def test_report_detail_revalidates_with_etag_and_304(client, db):
    _seed(db, 1)
    first = await client.get("/api/reports/perf-00")
    assert first.headers["cache-control"] == "no-cache"
    etag = first.headers["etag"]
    again = await client.get("/api/reports/perf-00", headers={"If-None-Match": etag})
    assert again.status_code == 304 and again.content == b""
    await client.post("/api/reports/perf-00/upvote")
    changed = await client.get("/api/reports/perf-00", headers={"If-None-Match": etag})
    assert changed.status_code == 200 and changed.headers["etag"] != etag


@pytest.mark.asyncio
@pytest.mark.parametrize("path", ["/api/admin/queue", "/health"])
async def test_private_and_health_responses_are_not_stored(client, admin_headers, path):
    res = await client.get(path, headers=admin_headers)
    assert res.headers["cache-control"] == "no-store"


@pytest.mark.asyncio
async def test_mutations_are_not_stored(client, db):
    _seed(db, 1)
    res = await client.post("/api/reports/perf-00/upvote")
    assert res.headers["cache-control"] == "no-store"


@pytest.mark.asyncio
async def test_uploads_are_cached_immutably(client, db):
    buf = io.BytesIO()
    Image.new("RGB", (4, 4)).save(buf, format="PNG")
    data = {"title": "Cache test", "description": "Photo caching check", "latitude": "1", "longitude": "1"}
    created = await client.post("/api/reports", data=data, files={"image": ("p.png", buf.getvalue(), "image/png")})
    name = db.get(Report, created.json()["id"]).before_image.rsplit("/", 1)[-1]
    res = await client.get(f"/uploads/{name}")
    assert res.headers["cache-control"] == "public, max-age=31536000, immutable"
    assert "etag" in res.headers
    missing = await client.get("/uploads/nope.png")
    assert missing.status_code == 404 and missing.headers.get("cache-control") != "public, max-age=31536000, immutable"
