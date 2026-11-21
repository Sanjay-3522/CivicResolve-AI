"""
Tests for opaque admin session tokens (HttpOnly cookie auth)
"""

import time

import pytest

from services.auth import ADMIN_SESSION_COOKIE, admin_sessions, login_limiter

ADMIN_KEY = "test-admin-secret-2026"


@pytest.fixture(autouse=True)
def _reset_auth_state():
    admin_sessions.clear()
    login_limiter.reset()
    yield
    admin_sessions.clear()
    login_limiter.reset()


async def _login(client) -> str:
    res = await client.post("/api/admin/login", json={"key": ADMIN_KEY})
    assert res.status_code == 200
    return res.cookies[ADMIN_SESSION_COOKIE]


def _cookie(token: str) -> dict:
    # httpx won't replay a Secure cookie over plain http://test, so send it explicitly.
    return {"Cookie": f"{ADMIN_SESSION_COOKIE}={token}"}


@pytest.mark.asyncio
async def test_login_cookie_is_opaque_token_not_raw_key(client):
    res = await client.post("/api/admin/login", json={"key": ADMIN_KEY})
    assert res.status_code == 200
    token = res.cookies[ADMIN_SESSION_COOKIE]
    assert token != ADMIN_KEY
    assert len(token) >= 40
    assert ADMIN_KEY not in res.text  # key never echoed back

    set_cookie = res.headers["set-cookie"].lower()
    assert "httponly" in set_cookie
    assert "secure" in set_cookie
    assert "samesite=lax" in set_cookie


@pytest.mark.asyncio
async def test_session_cookie_authorizes_admin_routes(client):
    token = await _login(client)
    res = await client.get("/api/admin/queue", headers=_cookie(token))
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_raw_key_in_cookie_is_rejected(client):
    res = await client.get("/api/admin/queue", headers=_cookie(ADMIN_KEY))
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_forged_token_is_rejected(client):
    res = await client.get("/api/admin/queue", headers=_cookie("not-a-real-session-token"))
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_logout_revokes_session(client):
    token = await _login(client)
    res = await client.post("/api/admin/logout", headers=_cookie(token))
    assert res.status_code == 200
    assert (await client.get("/api/admin/queue", headers=_cookie(token))).status_code == 401


@pytest.mark.asyncio
async def test_relogin_rotates_previous_token(client):
    old = await _login(client)
    res = await client.post("/api/admin/login", json={"key": ADMIN_KEY}, headers=_cookie(old))
    new = res.cookies[ADMIN_SESSION_COOKIE]
    assert new != old
    assert (await client.get("/api/admin/queue", headers=_cookie(old))).status_code == 401
    assert (await client.get("/api/admin/queue", headers=_cookie(new))).status_code == 200


@pytest.mark.asyncio
async def test_expired_session_is_rejected(client, monkeypatch):
    token = await _login(client)
    future = time.time() + admin_sessions.ttl_seconds + 1
    monkeypatch.setattr("services.auth.time.time", lambda: future)
    assert (await client.get("/api/admin/queue", headers=_cookie(token))).status_code == 401


@pytest.mark.asyncio
async def test_login_is_rate_limited(client):
    for _ in range(login_limiter.requests):
        await client.post("/api/admin/login", json={"key": "wrong-key-attempt"})
    res = await client.post("/api/admin/login", json={"key": ADMIN_KEY})
    assert res.status_code == 429
