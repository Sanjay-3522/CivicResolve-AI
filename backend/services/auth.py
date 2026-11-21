"""
CivicResolve — Authentication & Rate Limiting Services
"""

import hmac
import ipaddress
import os
import secrets
import time
from collections import defaultdict
from threading import Lock

from fastapi import Header, HTTPException, Request

ADMIN_API_KEY_ENV = "ADMIN_API_KEY"
ADMIN_SESSION_COOKIE = "admin_key"  # cookie name kept for client compatibility; value is an opaque session token
ADMIN_SESSION_TTL_SECONDS = int(os.getenv("ADMIN_SESSION_TTL_SECONDS", str(8 * 3600)))
MIN_ADMIN_KEY_LENGTH = 16


def _load_admin_key() -> str:
    key = (os.getenv(ADMIN_API_KEY_ENV) or "").strip()
    if not key:
        raise RuntimeError(
            f"{ADMIN_API_KEY_ENV} is not set. Refusing to start without an admin secret. "
            f'Generate one with: python -c "import secrets; print(secrets.token_urlsafe(32))" '
            f"and set it in backend/.env or your deployment secret store."
        )
    if len(key) < MIN_ADMIN_KEY_LENGTH:
        raise RuntimeError(f"{ADMIN_API_KEY_ENV} is too short ({len(key)} chars); use at least {MIN_ADMIN_KEY_LENGTH}.")
    return key


# Fail loudly at import (i.e. app startup) — never fall back to a known default.
_ADMIN_API_KEY = _load_admin_key()


def get_expected_admin_key() -> str:
    """Return the configured admin key (validated at import)."""
    return _ADMIN_API_KEY


def check_admin_key(candidate: str | None) -> bool:
    """Constant-time comparison of a submitted key against ADMIN_API_KEY."""
    if not candidate:
        return False
    return hmac.compare_digest(candidate.encode(), _ADMIN_API_KEY.encode())


class AdminSessionStore:
    """
    Thread-safe in-memory store of opaque admin session tokens -> expiry (epoch seconds).
    Sessions are invalidated on process restart by design.
    """

    def __init__(self, ttl_seconds: int):
        self.ttl_seconds = ttl_seconds
        self._sessions: dict[str, float] = {}
        self._lock = Lock()

    def _purge_expired(self, now: float) -> None:
        expired = [t for t, exp in self._sessions.items() if exp <= now]
        for t in expired:
            del self._sessions[t]

    def create(self) -> str:
        """Issue a new opaque session token."""
        token = secrets.token_urlsafe(32)
        now = time.time()
        with self._lock:
            self._purge_expired(now)
            self._sessions[token] = now + self.ttl_seconds
        return token

    def is_valid(self, token: str | None) -> bool:
        """True if the token exists and has not expired."""
        if not token:
            return False
        now = time.time()
        with self._lock:
            exp = self._sessions.get(token)
            if exp is None:
                return False
            if exp <= now:
                del self._sessions[token]
                return False
            return True

    def revoke(self, token: str | None) -> None:
        """Invalidate a token (no-op if unknown)."""
        if not token:
            return
        with self._lock:
            self._sessions.pop(token, None)

    def clear(self) -> None:
        """Drop all sessions (used by tests)."""
        with self._lock:
            self._sessions.clear()


admin_sessions = AdminSessionStore(ttl_seconds=ADMIN_SESSION_TTL_SECONDS)


def verify_admin_key(
    request: Request,
    x_admin_key: str | None = Header(None, alias="X-Admin-Key"),
) -> str:
    """
    Authorizes admin requests.
    - Browser sessions: HttpOnly cookie carrying an opaque session token, validated
      against the server-side session store (the raw admin key never lives in the browser).
    - Non-browser clients (CI, scripts, curl): X-Admin-Key header, constant-time compared.
    Raises 401 if neither is valid.
    """
    session_token = request.cookies.get(ADMIN_SESSION_COOKIE)
    if admin_sessions.is_valid(session_token):
        return "session"
    if check_admin_key(x_admin_key):
        return "api-key"
    raise HTTPException(
        status_code=401,
        detail="Unauthorized: Invalid or missing admin session or X-Admin-Key",
        headers={"WWW-Authenticate": "ApiKey"},
    )


# Proxies we may skip when walking X-Forwarded-For from the right: loopback/private/
# link-local (Next.js, container networking) plus Google front-end ranges used by
# Cloud Run / Cloud Load Balancing. Extend via TRUSTED_PROXY_CIDRS (comma-separated).
_DEFAULT_TRUSTED_CIDRS = (
    "127.0.0.0/8",
    "::1/128",
    "10.0.0.0/8",
    "172.16.0.0/12",
    "192.168.0.0/16",
    "169.254.0.0/16",
    "fc00::/7",
    "fe80::/10",
    "35.191.0.0/16",
    "130.211.0.0/22",
)


def _load_trusted_networks() -> list:
    extra = [c.strip() for c in os.getenv("TRUSTED_PROXY_CIDRS", "").split(",") if c.strip()]
    return [ipaddress.ip_network(c, strict=False) for c in (*_DEFAULT_TRUSTED_CIDRS, *extra)]


_TRUSTED_NETWORKS = _load_trusted_networks()


def trust_proxy_enabled() -> bool:
    """X-Forwarded-For is honoured only when TRUST_PROXY=1 (set in the Dockerfile)."""
    return os.getenv("TRUST_PROXY", "0").strip() == "1"


def _is_trusted_proxy(value: str) -> bool:
    try:
        ip = ipaddress.ip_address(value)
    except ValueError:
        return False
    return any(ip in net for net in _TRUSTED_NETWORKS)


def get_client_ip(request: Request) -> str:
    """
    Resolve the client IP used for rate limiting.

    Without TRUST_PROXY=1 the socket peer is used and X-Forwarded-For is ignored,
    so clients cannot spoof it. With TRUST_PROXY=1 (Cloud Run → Next.js → uvicorn)
    the header is walked right-to-left, skipping trusted proxy hops; the first
    untrusted entry is the client. Left-most entries are client-supplied and are
    never trusted.
    """
    peer = request.client.host if request.client else "127.0.0.1"
    if not trust_proxy_enabled():
        return peer
    forwarded = request.headers.get("X-Forwarded-For")
    if not forwarded:
        return peer
    for hop in reversed([h.strip() for h in forwarded.split(",") if h.strip()]):
        if not _is_trusted_proxy(hop):
            try:
                return str(ipaddress.ip_address(hop))
            except ValueError:
                return peer  # malformed hop: fall back rather than key on attacker text
    return peer


class InMemoryRateLimiter:
    """
    Thread-safe sliding-window rate limiter by client IP.
    """

    def __init__(self, requests: int, window_seconds: int = 60):
        self.requests = requests
        self.window_seconds = window_seconds
        self.history: defaultdict[str, list[float]] = defaultdict(list)
        self.lock = Lock()

    def reset(self) -> None:
        """Forget all recorded requests (used by tests)."""
        with self.lock:
            self.history.clear()

    def __call__(self, request: Request):
        client_ip = get_client_ip(request)

        now = time.time()
        cutoff = now - self.window_seconds

        with self.lock:
            valid = [t for t in self.history[client_ip] if t > cutoff]
            if len(valid) >= self.requests:
                retry_after = int(valid[0] - cutoff) + 1
                raise HTTPException(
                    status_code=429,
                    detail=f"Rate limit exceeded: maximum {self.requests} requests per {self.window_seconds}s.",
                    headers={"Retry-After": str(max(1, retry_after))},
                )
            valid.append(now)
            self.history[client_ip] = valid


# Rate limiter instances for public citizen endpoints
report_limiter = InMemoryRateLimiter(requests=10, window_seconds=60)
upvote_limiter = InMemoryRateLimiter(requests=30, window_seconds=60)
reopen_limiter = InMemoryRateLimiter(requests=5, window_seconds=60)

# Brute-force protection for admin login
login_limiter = InMemoryRateLimiter(requests=10, window_seconds=60)
