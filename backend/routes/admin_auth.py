"""
CivicResolve — Admin authentication router (opaque HttpOnly session cookie).
"""

import logging

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from pydantic import BaseModel

from services.auth import (
    ADMIN_SESSION_COOKIE,
    ADMIN_SESSION_TTL_SECONDS,
    admin_sessions,
    check_admin_key,
    login_limiter,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["admin"])


class AdminLoginRequest(BaseModel):
    """JSON body for POST /api/admin/login."""

    key: str | None = None


# ───────────────────────────────────────────────
# POST /api/admin/login — Admin authentication
# ───────────────────────────────────────────────
@router.post("/login", dependencies=[Depends(login_limiter)])
async def admin_login(
    response: Response,
    request: Request,
    payload: AdminLoginRequest | None = None,
    x_admin_key: str | None = Header(None, alias="X-Admin-Key"),
) -> dict:
    """Exchange the admin key for an opaque HttpOnly session cookie."""
    submitted_key = (payload.key if payload else None) or x_admin_key

    if not check_admin_key(submitted_key):
        logger.warning("Failed admin login attempt from %s", request.client.host if request.client else "unknown")
        raise HTTPException(
            status_code=401,
            detail="Unauthorized: Invalid admin key",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    # Rotate: revoke any session this browser already held, then issue a fresh opaque token.
    admin_sessions.revoke(request.cookies.get(ADMIN_SESSION_COOKIE))
    token = admin_sessions.create()

    response.set_cookie(
        key=ADMIN_SESSION_COOKIE,
        value=token,
        httponly=True,
        secure=True,
        samesite="lax",
        path="/",
        max_age=ADMIN_SESSION_TTL_SECONDS,
    )

    return {
        "status": "ok",
        "authenticated": True,
        "expires_in": ADMIN_SESSION_TTL_SECONDS,
        "message": "Admin session authenticated successfully.",
    }


# ───────────────────────────────────────────────
# POST /api/admin/logout — Revoke session & clear cookie
# ───────────────────────────────────────────────
@router.post("/logout")
async def admin_logout(response: Response, request: Request) -> dict:
    """Revoke the current admin session and clear its cookie."""
    admin_sessions.revoke(request.cookies.get(ADMIN_SESSION_COOKIE))
    response.delete_cookie(
        key=ADMIN_SESSION_COOKIE,
        path="/",
        httponly=True,
        secure=True,
        samesite="lax",
    )
    return {"status": "ok", "authenticated": False}
