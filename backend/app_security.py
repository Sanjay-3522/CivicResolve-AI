"""
CivicResolve — cross-cutting HTTP security: defensive response headers and a
generic error handler that never leaks stack traces or internal paths.
"""

import logging
import uuid
from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse

logger = logging.getLogger("civicresolve.security")

# The API only returns JSON and images, so its CSP can be locked down completely.
SECURITY_HEADERS = {
    "Content-Security-Policy": "default-src 'none'; img-src 'self'; frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(self), camera=(self), microphone=()",
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
}
# Swagger UI loads its own assets from a CDN; don't break it outside production.
DOCS_PATHS = ("/docs", "/redoc", "/openapi.json")
GENERIC_ERROR = "Internal server error. Please try again later."


async def security_headers(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
    """Attach defensive headers to every API response."""
    response = await call_next(request)
    for name, value in SECURITY_HEADERS.items():
        if name == "Content-Security-Policy" and request.url.path.startswith(DOCS_PATHS):
            continue
        response.headers.setdefault(name, value)
    return response


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Log the full error server-side; return only a generic message and an error id."""
    error_id = uuid.uuid4().hex[:12]
    logger.exception("Unhandled error %s on %s %s", error_id, request.method, request.url.path, exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={"detail": GENERIC_ERROR, "error_id": error_id},
        headers=SECURITY_HEADERS,
    )


def install_security(app: FastAPI) -> None:
    """Register the security-header middleware and the generic 500 handler."""
    app.middleware("http")(security_headers)
    app.add_exception_handler(Exception, unhandled_exception_handler)
