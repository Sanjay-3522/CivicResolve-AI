"""
CivicResolve — HTTP performance: gzip, Cache-Control policies, ETag/304 for public reads,
and immutable caching for uploaded photos (their filenames are random and never reused).
"""

import hashlib
from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request, Response
from fastapi.middleware.gzip import GZipMiddleware
from starlette.responses import Response as StarletteResponse
from starlette.staticfiles import StaticFiles
from starlette.types import Scope

GZIP_MIN_BYTES = 500
UPLOADS_CACHE = "public, max-age=31536000, immutable"
PUBLIC_LIST_CACHE = "public, max-age=10, stale-while-revalidate=30"
PUBLIC_DETAIL_CACHE = "no-cache"  # always revalidate (ETag) so status changes show immediately
NO_STORE = "no-store"


def cache_policy(method: str, path: str) -> str | None:
    """Cache-Control for an API response, or None to leave it unset."""
    if method != "GET":
        return NO_STORE
    if path == "/api/reports":
        return PUBLIC_LIST_CACHE
    if path.startswith("/api/reports/"):
        return PUBLIC_DETAIL_CACHE
    if path.startswith("/api/admin") or path == "/health":
        return NO_STORE
    return None


async def caching(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
    """Apply Cache-Control and answer conditional GETs on public JSON reads with 304."""
    response = await call_next(request)
    path = request.url.path
    if path.startswith("/uploads/"):
        return response
    policy = cache_policy(request.method, path)
    if policy:
        response.headers["Cache-Control"] = policy
    if policy in (PUBLIC_LIST_CACHE, PUBLIC_DETAIL_CACHE) and response.status_code == 200:
        body = b"".join([chunk async for chunk in response.body_iterator])  # type: ignore[attr-defined]
        etag = '"' + hashlib.sha256(body).hexdigest()[:32] + '"'
        headers = {k: v for k, v in response.headers.items() if k.lower() != "content-length"}
        headers["ETag"] = etag
        if request.headers.get("if-none-match") == etag:
            return StarletteResponse(
                status_code=304, headers={k: v for k, v in headers.items() if k.lower() != "content-type"}
            )
        return StarletteResponse(content=body, status_code=200, headers=headers, media_type=response.media_type)
    return response


class ImmutableStaticFiles(StaticFiles):
    """StaticFiles that marks every served upload as immutable for a year."""

    async def get_response(self, path: str, scope: Scope) -> StarletteResponse:
        """Serve the file (with Starlette's own ETag/Last-Modified) plus a long-lived Cache-Control."""
        response = await super().get_response(path, scope)
        if response.status_code in (200, 304):
            response.headers["Cache-Control"] = UPLOADS_CACHE
        return response


def install_performance(app: FastAPI) -> None:
    """Register caching middleware and gzip (gzip outermost so it compresses final bodies)."""
    app.middleware("http")(caching)
    app.add_middleware(GZipMiddleware, minimum_size=GZIP_MIN_BYTES)
