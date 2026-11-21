"""
CivicResolve — Geo-Semantic Deduplication Service

Algorithm:
1. Query open reports within 150m radius, same category
2. Haversine distance for each candidate
3. Cosine similarity of embeddings
4. If similarity > 0.82 AND distance < 150m → merge as corroboration
5. Persist child report record with status='merged' and parent_id
6. Auto-tighten SLA deadline and log TimelineEvent when urgency escalates
"""

import json
import logging
import math
import uuid

import numpy as np
from sqlalchemy.orm import Session

from database import Report, ReportStatus, TimelineEvent, utc_now
from services.sla_engine import compute_sla_deadline

logger = logging.getLogger(__name__)

GEO_RADIUS_METERS = 150
SIMILARITY_THRESHOLD = 0.82


def haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return distance in meters between two lat/lon points."""
    R = 6_371_000  # Earth radius in metres
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def bounding_box(latitude: float, longitude: float, radius_m: float) -> tuple:
    """(min_lat, max_lat, min_lon, max_lon) enclosing a circle of radius_m metres.
    Slightly generous so it never excludes a point the exact haversine would keep."""
    lat_delta = radius_m / 111_000  # < true m/deg, so the box errs on the large side
    cos_lat = math.cos(math.radians(latitude))
    lon_delta = 180.0 if cos_lat < 1e-6 else min(180.0, radius_m / (111_000 * cos_lat))
    return latitude - lat_delta, latitude + lat_delta, longitude - lon_delta, longitude + lon_delta


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Cosine similarity via numpy.

    Mirrors the original pure-Python semantics exactly: the dot product covers the
    overlapping prefix (like ``zip``) while each magnitude uses the full vector.
    """
    if not a or not b:
        return 0.0
    va = np.asarray(a, dtype=np.float64)
    vb = np.asarray(b, dtype=np.float64)
    n = min(va.size, vb.size)
    mag_a = float(np.linalg.norm(va))
    mag_b = float(np.linalg.norm(vb))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return float(np.dot(va[:n], vb[:n])) / (mag_a * mag_b)


def find_duplicate(
    db: Session,
    latitude: float,
    longitude: float,
    category: str,
    embedding: list[float],
) -> Report | None:
    """
    Find an existing open report that is geo-semantically similar.
    Returns the best matching Report or None.
    """
    # Rough bounding-box filter first (much faster than scanning all records)
    lat_delta = GEO_RADIUS_METERS / 111_320  # ~1 degree lat = 111320m
    lon_delta = GEO_RADIUS_METERS / (111_320 * math.cos(math.radians(latitude)))

    candidates = (
        db.query(Report)
        .filter(
            Report.category == category,
            Report.status.in_(
                [
                    ReportStatus.reported,
                    ReportStatus.acknowledged,
                    ReportStatus.in_progress,
                ]
            ),
            Report.parent_id.is_(None),  # only top-level reports
            Report.latitude.between(latitude - lat_delta, latitude + lat_delta),
            Report.longitude.between(longitude - lon_delta, longitude + lon_delta),
        )
        .all()
    )

    best_match = None
    best_score = 0.0

    for report in candidates:
        dist = haversine_meters(latitude, longitude, report.latitude, report.longitude)
        if dist > GEO_RADIUS_METERS:
            continue

        try:
            report_emb = json.loads(report.embedding or "[]")
        except Exception:
            report_emb = []

        sim = cosine_similarity(embedding, report_emb)
        logger.debug(f"Candidate {report.id}: dist={dist:.0f}m, sim={sim:.3f}")

        # Combined score: weight similarity higher than distance
        combined = sim * 0.7 + (1 - dist / GEO_RADIUS_METERS) * 0.3

        if sim >= SIMILARITY_THRESHOLD and combined > best_score:
            best_score = combined
            best_match = report

    return best_match


def merge_as_corroboration(
    db: Session,
    existing: Report,
    title: str,
    description: str,
    latitude: float,
    longitude: float,
    address: str | None = None,
    image_path: str | None = None,
    embedding: list[float] | None = None,
) -> Report:
    """
    Persist child corroborating report record linked via parent_id.
    Bumps corroboration count on existing report.
    If every 3rd corroboration, auto-escalates urgency and recalculates SLA deadline.
    Logs TimelineEvents for both the corroboration and deadline tightening.
    """
    existing.corroboration_count += 1

    # 1. Persist the child report record with status='merged'
    child_id = str(uuid.uuid4())
    child_report = Report(
        id=child_id,
        title=title,
        description=description,
        category=existing.category,
        status=ReportStatus.merged,
        latitude=latitude,
        longitude=longitude,
        address=address,
        urgency=existing.urgency,
        department=existing.department,
        parent_id=existing.id,
        before_image=image_path,
        embedding=json.dumps(embedding) if embedding else None,
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    db.add(child_report)

    # 2. Timeline event for corroboration
    db.add(
        TimelineEvent(
            report_id=existing.id,
            status="corroborated",
            note=f"Corroborating report received: '{title}'. Total corroborations: {existing.corroboration_count}.",
            actor="citizen",
            created_at=utc_now(),
        )
    )

    # 3. Auto-escalate urgency if heavily corroborated (every 3 corroborations)
    if existing.corroboration_count % 3 == 0 and existing.urgency < 5:
        old_urgency = existing.urgency
        new_urgency = min(5, existing.urgency + 1)
        existing.urgency = new_urgency

        # Recompute SLA deadline
        old_deadline = existing.sla_deadline
        cat_key = existing.category.value if hasattr(existing.category, "value") else str(existing.category)
        new_deadline = compute_sla_deadline(cat_key, new_urgency, utc_now())
        existing.sla_deadline = new_deadline

        old_str = old_deadline.strftime("%Y-%m-%d %H:%M UTC") if old_deadline else "none"
        new_str = new_deadline.strftime("%Y-%m-%d %H:%M UTC")

        db.add(
            TimelineEvent(
                report_id=existing.id,
                status="escalated",
                note=(
                    f"SLA deadline tightened from {old_str} to {new_str} due to escalated urgency "
                    f"(P{old_urgency} → P{new_urgency} via corroborations)."
                ),
                actor="system",
                created_at=utc_now(),
            )
        )
        logger.info(f"Report {existing.id} urgency escalated to {new_urgency}; SLA tightened to {new_str}")

    db.commit()
    db.refresh(existing)
    return existing
