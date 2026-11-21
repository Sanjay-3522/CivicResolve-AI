"""
Tests for File Upload Hardening
"""

import io

import pytest
from PIL import Image


def create_test_image(format="JPEG", size=(100, 100), color=(255, 0, 0)) -> bytes:
    img = Image.new("RGB", size, color)
    buf = io.BytesIO()
    img.save(buf, format=format)
    return buf.getvalue()


@pytest.mark.asyncio
async def test_upload_valid_jpeg(client):
    img_bytes = create_test_image(format="JPEG")
    files = {"image": ("pothole.jpg", img_bytes, "image/jpeg")}
    data = {
        "title": "Valid JPEG upload report",
        "description": "Report with real JPEG image",
        "latitude": "12.9716",
        "longitude": "77.5946",
        "category": "pothole",
    }
    res = await client.post("/api/reports", data=data, files=files)
    assert res.status_code == 200
    res_data = res.json()
    assert res_data["merged"] is False
    assert "id" in res_data


@pytest.mark.asyncio
async def test_upload_valid_png(client):
    img_bytes = create_test_image(format="PNG")
    files = {"image": ("garbage.png", img_bytes, "image/png")}
    data = {
        "title": "Valid PNG upload report",
        "description": "Report with real PNG image",
        "latitude": "12.9352",
        "longitude": "77.6245",
        "category": "garbage",
    }
    res = await client.post("/api/reports", data=data, files=files)
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_reject_html_file(client):
    html_content = b"<html><body><script>alert(1)</script></body></html>"
    files = {"image": ("exploit.html", html_content, "text/html")}
    data = {
        "title": "Malicious HTML file",
        "description": "Attempt to upload HTML script",
        "latitude": "12.9716",
        "longitude": "77.5946",
    }
    res = await client.post("/api/reports", data=data, files=files)
    assert res.status_code == 400
    assert "not a valid image" in res.json()["detail"].lower() or "invalid image" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_reject_svg_file(client):
    svg_content = b'<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>'
    files = {"image": ("vector.svg", svg_content, "image/svg+xml")}
    data = {
        "title": "SVG vector image",
        "description": "Attempt to upload SVG file",
        "latitude": "12.9716",
        "longitude": "77.5946",
    }
    res = await client.post("/api/reports", data=data, files=files)
    assert res.status_code == 400
    assert "invalid image" in res.json()["detail"].lower() or "unsupported image" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_reject_oversized_file(client):
    # Create 9MB dummy payload (over 8MB limit)
    oversized = b"A" * (9 * 1024 * 1024)
    files = {"image": ("huge.jpg", oversized, "image/jpeg")}
    data = {
        "title": "Oversized file",
        "description": "File over 8MB limit",
        "latitude": "12.9716",
        "longitude": "77.5946",
    }
    res = await client.post("/api/reports", data=data, files=files)
    assert res.status_code == 400
    assert "exceeds maximum allowed size" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_extension_derived_from_verified_format_not_client_filename(client, db):
    # A JPEG file falsely given a .png or .exe client extension
    real_jpeg = create_test_image(format="JPEG")
    files = {"image": ("spoofed.png", real_jpeg, "image/png")}
    data = {
        "title": "Spoofed extension report",
        "description": "JPEG file disguised as PNG filename",
        "latitude": "12.9784",
        "longitude": "77.6408",
        "category": "streetlight",
    }
    res = await client.post("/api/reports", data=data, files=files)
    assert res.status_code == 200
    report_id = res.json()["id"]

    # Verify report stored image path has .jpg extension
    from database import Report

    report = db.query(Report).filter(Report.id == report_id).first()
    assert report.before_image is not None
    assert report.before_image.endswith(".jpg")
