"""
Security evidence for uploads, static file serving, rate limits and error handling.
"""

import io

import httpx
import pytest
from PIL import Image

from app_security import GENERIC_ERROR
from main import app
from services.auth import reopen_limiter, upvote_limiter

REPORT = {
    "title": "Upload security test",
    "description": "Checking that only real images are stored",
    "latitude": "12.97",
    "longitude": "77.59",
}


def _image(fmt: str) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (4, 4), (10, 20, 30)).save(buf, format=fmt)
    return buf.getvalue()


async def _upload(client, content: bytes, name: str, ctype: str):
    return await client.post("/api/reports", data=REPORT, files={"image": (name, content, ctype)})


# ── Upload hardening ──────────────────────────────────────────────────────────
@pytest.mark.asyncio
@pytest.mark.parametrize("fmt", ["GIF", "BMP", "TIFF", "PPM", "ICO"])
async def test_non_allowlisted_decoders_are_never_used(client, fmt):
    """Image.open is restricted to JPEG/PNG/WebP, so other (CVE-prone) decoders reject."""
    res = await _upload(client, _image(fmt), f"x.{fmt.lower()}", "image/jpeg")
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_html_jpeg_polyglot_is_rejected(client):
    """JPEG magic bytes followed by HTML/script must not pass image verification."""
    polyglot = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00<html><script>alert(1)</script></html>"
    res = await _upload(client, polyglot, "evil.jpg", "image/jpeg")
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_svg_with_script_is_rejected(client):
    svg = b'<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    res = await _upload(client, svg, "logo.png", "image/png")
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_valid_image_with_trailing_html_is_stored_with_safe_extension(client, db):
    """A real PNG with appended HTML is stored as .png (served as image/png + nosniff), never .html."""
    from database import Report

    res = await _upload(client, _image("PNG") + b"<script>alert(1)</script>", "evil.html", "text/html")
    assert res.status_code == 200
    stored = db.get(Report, res.json()["id"]).before_image
    assert stored.endswith(".png")


@pytest.mark.asyncio
async def test_oversized_upload_rejected_before_decoding(client):
    res = await _upload(client, b"\xff\xd8" + b"0" * (8 * 1024 * 1024 + 10), "big.jpg", "image/jpeg")
    assert res.status_code == 400
    assert "maximum allowed size" in res.json()["detail"]


@pytest.mark.asyncio
async def test_empty_upload_rejected(client):
    res = await _upload(client, b"", "empty.jpg", "image/jpeg")
    assert res.status_code == 400
    assert res.json()["detail"] == "Empty file upload."


@pytest.mark.asyncio
async def test_excessive_image_pixel_count_is_rejected(client):
    """Small compressed PNGs cannot force the service to decode 30M pixels."""
    buf = io.BytesIO()
    Image.new("1", (6000, 5000), 1).save(buf, format="PNG")
    assert len(buf.getvalue()) < 1024 * 1024
    res = await _upload(client, buf.getvalue(), "giant.png", "image/png")
    assert res.status_code == 400


# ── /uploads static serving ───────────────────────────────────────────────────
@pytest.mark.asyncio
@pytest.mark.parametrize(
    "path",
    [
        "/uploads/../main.py",
        "/uploads/..%2fmain.py",
        "/uploads/%2e%2e/main.py",
        "/uploads/%2e%2e%2f%2e%2e%2fetc%2fpasswd",
        "/uploads/....//main.py",
    ],
)
async def test_path_traversal_on_uploads_is_blocked(client, path):
    res = await client.get(path)
    assert res.status_code == 404
    assert "import" not in res.text and "root:" not in res.text


@pytest.mark.asyncio
async def test_uploaded_files_served_with_nosniff(client, db):
    res = await _upload(client, _image("JPEG"), "ok.jpg", "image/jpeg")
    from database import Report

    name = db.get(Report, res.json()["id"]).before_image.rsplit("/", 1)[-1]
    served = await client.get(f"/uploads/{name}")
    assert served.status_code == 200
    assert served.headers["content-type"] == "image/jpeg"
    assert served.headers["x-content-type-options"] == "nosniff"


# ── Rate limits on every citizen write endpoint ──────────────────────────────
@pytest.mark.asyncio
async def test_upvote_rate_limit(client):
    upvote_limiter.reset()
    codes = [(await client.post("/api/reports/none/upvote")).status_code for _ in range(upvote_limiter.requests + 1)]
    assert codes[-1] == 429 and set(codes[:-1]) == {404}


@pytest.mark.asyncio
async def test_reopen_rate_limit_sets_retry_after(client):
    reopen_limiter.reset()
    for _ in range(reopen_limiter.requests + 1):
        res = await client.post("/api/reports/none/reopen", data={"reason": "still broken"})
    assert res.status_code == 429
    assert int(res.headers["retry-after"]) >= 1


# ── Generic errors: no stack traces or internal paths ────────────────────────
@pytest.mark.asyncio
async def test_unhandled_errors_return_generic_message(monkeypatch, db):
    from database import get_db

    async def boom(**kwargs):
        raise RuntimeError("secret detail at /app/backend/services/gemini_triage.py line 42")

    monkeypatch.setattr("routes.reports.run_triage", boom)
    app.dependency_overrides[get_db] = lambda: db
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    try:
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
            res = await c.post("/api/reports", data=REPORT)
    finally:
        app.dependency_overrides.clear()
    assert res.status_code == 500
    body = res.json()
    assert body["detail"] == GENERIC_ERROR and len(body["error_id"]) == 12
    for leak in ("Traceback", "secret", "/app/", ".py", "RuntimeError"):
        assert leak not in res.text
    assert res.headers["x-content-type-options"] == "nosniff"


@pytest.mark.asyncio
async def test_not_found_does_not_leak_internals(client):
    res = await client.get("/api/does-not-exist")
    assert res.status_code == 404 and res.json() == {"detail": "Not Found"}


@pytest.mark.asyncio
async def test_api_csp_blocks_scripts_and_framing(client):
    csp = (await client.get("/api/reports")).headers["content-security-policy"]
    assert "default-src 'none'" in csp and "frame-ancestors 'none'" in csp
