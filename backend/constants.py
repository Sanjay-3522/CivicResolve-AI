"""
CivicResolve — shared enums and validation constants.

Single source of truth for the issue taxonomy (category, status, department)
and the input bounds enforced by the API and mirrored by the frontend form.
"""

import enum


class ReportStatus(str, enum.Enum):
    """Lifecycle of a civic issue from submission through tracking to resolution."""

    reported = "reported"
    acknowledged = "acknowledged"
    in_progress = "in_progress"
    resolved = "resolved"
    verified = "verified"
    flagged = "flagged"  # low-confidence resolution, pending re-confirm
    reopened = "reopened"
    merged = "merged"


class Category(str, enum.Enum):
    """Issue categories Gemini AI classifies a citizen report into."""

    pothole = "pothole"
    garbage = "garbage"
    streetlight = "streetlight"
    water_leakage = "water_leakage"
    road_damage = "road_damage"
    other = "other"


class Department(str, enum.Enum):
    """Municipal departments the AI can recommend for handling an issue."""

    PWD = "PWD"
    BESCOM = "BESCOM"
    BBMP = "BBMP"
    BWSSB = "BWSSB"
    Traffic = "Traffic"
    General = "General"


# ── Input validation bounds ───────────────────────────────────────────────────
TITLE_MIN, TITLE_MAX = 3, 120
DESCRIPTION_MIN, DESCRIPTION_MAX = 10, 2000
ADDRESS_MAX = 300
NOTE_MAX = 500
RADIUS_MIN, RADIUS_MAX = 1, 50_000
LIST_LIMIT_MAX = 200
HEATMAP_LIMIT_DEFAULT, HEATMAP_LIMIT_MAX = 1000, 5000
BULK_MAX_IDS = 200

# ── File uploads ──────────────────────────────────────────────────────────────
MAX_UPLOAD_BYTES = 8 * 1024 * 1024  # 8 MB
ALLOWED_IMAGE_FORMATS = {"JPEG": ".jpg", "PNG": ".png", "WEBP": ".webp"}

# ── Citizen reopen window ─────────────────────────────────────────────────────
REOPEN_WINDOW_HOURS = 72
