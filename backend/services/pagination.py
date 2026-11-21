"""
CivicResolve — limit/offset pagination helpers shared by every list endpoint.
"""

from fastapi import Query, Response

TOTAL_COUNT_HEADER = "X-Total-Count"
OFFSET_MAX = 100_000


def offset_param() -> int:
    """Default `offset` query parameter (0, capped to keep scans bounded)."""
    return Query(0, ge=0, le=OFFSET_MAX, description="Number of items to skip (pagination).")


def set_total_count(response: Response, total: int) -> None:
    """Expose the unpaginated result size so clients can page through results."""
    response.headers[TOTAL_COUNT_HEADER] = str(total)
