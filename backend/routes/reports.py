"""
CivicResolve — Reports router: citizens report civic issues, Gemini AI
categorizes them, scores urgency and recommends a department, duplicates are
merged as corroborations, and anyone can track an issue.
Lifecycle actions (status, resolve, reopen) live in routes/report_lifecycle.py.
"""

import json
import logging
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from sqlalchemy.orm import Session

from constants import (
    ADDRESS_MAX,
    DESCRIPTION_MAX,
    DESCRIPTION_MIN,
    LIST_LIMIT_MAX,
    RADIUS_MAX,
    RADIUS_MIN,
    TITLE_MAX,
    TITLE_MIN,
)
from database import Category, Report, ReportStatus, TimelineEvent, get_db, utc_now
from services.auth import report_limiter, upvote_limiter
from services.gemini_triage import get_embedding, run_triage
from services.geo_dedup import bounding_box, find_duplicate, haversine_meters, merge_as_corroboration
from services.pagination import offset_param, set_total_count
from services.sla_engine import compute_sla_deadline
from services.uploads import save_upload

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/reports", tags=["reports"])


def _report_to_dict(report: Report) -> dict:
    d = {c.name: getattr(report, c.name) for c in report.__table__.columns}
    d["escalation_flags"] = report.get_escalation_flags()
    return d


# ───────────────────────────────────────────────
# POST /api/reports — Submit new report (Rate limited)
# ───────────────────────────────────────────────
@router.post("", response_model=dict, dependencies=[Depends(report_limiter)])
async def create_report(
    title: str = Form(..., min_length=TITLE_MIN, max_length=TITLE_MAX),
    description: str = Form(..., min_length=DESCRIPTION_MIN, max_length=DESCRIPTION_MAX),
    latitude: float = Form(..., ge=-90, le=90),
    longitude: float = Form(..., ge=-180, le=180),
    address: str | None = Form(None, max_length=ADDRESS_MAX),
    category: Category | None = Form(None),
    image: UploadFile | None = File(None),
    db: Session = Depends(get_db),
) -> dict:
    """Submit a report: AI triage → geo-semantic dedup → create or merge as corroboration."""
    image_path = None
    if image and image.filename:
        image_path = await save_upload(image, "before")

    # 1. Gemini triage (single multimodal call)
    location_str = address or f"{latitude:.4f},{longitude:.4f}"
    triage = await run_triage(
        title=title,
        description=description,
        category_hint=category.value if category else None,
        location=location_str,
        image_path=image_path,
    )

    # 2. Get embedding for semantic dedup
    dedup_text = f"{triage['category']} {title} {triage['dedup_signal']}"
    embedding = await get_embedding(dedup_text)

    # 3. Geo-semantic deduplication
    existing = find_duplicate(
        db=db,
        latitude=latitude,
        longitude=longitude,
        category=triage["category"],
        embedding=embedding,
    )

    if existing:
        # Merge as corroboration and preserve child report record
        merge_as_corroboration(
            db=db,
            existing=existing,
            title=title,
            description=description,
            latitude=latitude,
            longitude=longitude,
            address=address,
            image_path=image_path,
            embedding=embedding,
        )
        logger.info(f"Report merged as corroboration onto {existing.id}")
        return {
            "merged": True,
            "triage_source": triage.get("triage_source", "rules"),
            "existing_id": existing.id,
            "corroboration_count": existing.corroboration_count,
            "message": (
                f"Your report has been merged with an existing nearby report (#{existing.id[:8]}). "
                f"It now has {existing.corroboration_count} corroborating reports, which increases its priority."
            ),
        }

    # 4. Create new report
    report_id = str(uuid.uuid4())
    cat_enum = triage["category"]
    dept_enum = triage.get("department", "General")

    sla_deadline = compute_sla_deadline(cat_enum, triage["urgency"], utc_now())

    report = Report(
        id=report_id,
        title=title,
        description=description,
        category=cat_enum,
        status=ReportStatus.reported,
        latitude=latitude,
        longitude=longitude,
        address=address,
        urgency=triage["urgency"],
        urgency_reasoning=triage.get("urgency_reasoning"),
        department=dept_enum,
        department_confidence=triage.get("department_confidence", 0.7),
        department_justification=triage.get("department_justification"),
        ai_summary=triage.get("ai_summary"),
        escalation_flags=json.dumps(triage.get("escalation_flags", [])),
        embedding=json.dumps(embedding),
        before_image=image_path,
        sla_deadline=sla_deadline,
        escalation_tier=1,
    )
    db.add(report)

    # Initial timeline event
    event = TimelineEvent(
        report_id=report_id,
        status=ReportStatus.reported,
        note="Report submitted and triaged by AI.",
        actor="system",
    )
    db.add(event)
    db.commit()

    return {
        "merged": False,
        "triage_source": triage.get("triage_source", "rules"),
        "id": report_id,
        "urgency": triage["urgency"],
        "category": cat_enum,
        "department": dept_enum,
        "ai_summary": triage.get("ai_summary"),
        "sla_deadline": sla_deadline.isoformat(),
        "message": "Report submitted successfully.",
    }


# ───────────────────────────────────────────────
# GET /api/reports/{id} — Report detail + timeline + corroborations
# ───────────────────────────────────────────────
@router.get("/{report_id}")
async def get_report(report_id: str, db: Session = Depends(get_db)) -> dict:
    """Report detail with timeline, SLA breaches, corroborations and nearby count."""
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    nearby_count = (
        db.query(Report)
        .filter(
            Report.id != report_id,
            Report.category == report.category,
            Report.status.in_([ReportStatus.reported, ReportStatus.acknowledged, ReportStatus.in_progress]),
        )
        .count()
    )

    # Corroborating reports submitted by other citizens
    corroborations = db.query(Report).filter(Report.parent_id == report_id).order_by(Report.created_at.desc()).all()

    return {
        **_report_to_dict(report),
        "timelines": [
            {"id": e.id, "status": e.status, "note": e.note, "actor": e.actor, "created_at": e.created_at.isoformat()}
            for e in sorted(report.timelines, key=lambda x: x.created_at)
        ],
        "sla_breaches": [
            {
                "id": b.id,
                "escalated_to_tier": b.escalated_to_tier,
                "breach_minutes": b.breach_minutes,
                "note": b.note,
                "created_at": b.created_at.isoformat(),
            }
            for b in report.sla_breaches
        ],
        "corroborations": [
            {
                "id": c.id,
                "title": c.title,
                "description": c.description,
                "before_image": c.before_image,
                "address": c.address,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c in corroborations
        ],
        "nearby_count": nearby_count,
    }


# ───────────────────────────────────────────────
# GET /api/reports/nearby — Map cluster fetch
# ───────────────────────────────────────────────
@router.get("")
async def list_reports(
    response: Response,
    lat: float | None = Query(None, ge=-90, le=90),
    lon: float | None = Query(None, ge=-180, le=180),
    radius: float = Query(5000, ge=RADIUS_MIN, le=RADIUS_MAX),
    category: Category | None = None,
    status: ReportStatus | None = None,
    limit: int = Query(100, ge=1, le=LIST_LIMIT_MAX),
    offset: int = offset_param(),
    db: Session = Depends(get_db),
) -> list[dict]:
    """Publicly track reported civic issues, newest first (paginated, total in X-Total-Count).

    With lat/lon, only issues within `radius` metres are returned.
    """
    q = db.query(Report).filter(Report.parent_id.is_(None))
    if category:
        q = q.filter(Report.category == category)
    if status:
        q = q.filter(Report.status == status)

    if lat is not None and lon is not None:
        # Cheap SQL bounding-box prefilter (index-friendly), then exact haversine.
        min_lat, max_lat, min_lon, max_lon = bounding_box(lat, lon, radius)
        q = q.filter(Report.latitude.between(min_lat, max_lat), Report.longitude.between(min_lon, max_lon))
        candidates = q.order_by(Report.created_at.desc()).limit(500).all()
        nearby = [r for r in candidates if haversine_meters(lat, lon, r.latitude, r.longitude) <= radius]
        set_total_count(response, len(nearby))
        page = nearby[offset : offset + limit]
    else:
        set_total_count(response, q.count())
        page = q.order_by(Report.created_at.desc()).offset(offset).limit(limit).all()

    return [_report_to_dict(r) for r in page]


# ───────────────────────────────────────────────
# POST /api/reports/{id}/upvote — Citizen corroboration (Rate limited)
# ───────────────────────────────────────────────
@router.post("/{report_id}/upvote", dependencies=[Depends(upvote_limiter)])
async def upvote_report(report_id: str, db: Session = Depends(get_db)) -> dict:
    """Citizen "me too" upvote."""
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    report.upvote_count += 1
    db.commit()
    return {"upvote_count": report.upvote_count}
