"""
CivicResolve — Admin dashboard router for issue management: filterable queue,
bulk status updates, analytics, hotspot heatmap and the SLA breach log.
Admin sign-in/out lives in routes/admin_auth.py.
"""

import logging
from datetime import timedelta

from fastapi import APIRouter, Depends, Form, HTTPException, Query, Response
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from constants import BULK_MAX_IDS, HEATMAP_LIMIT_DEFAULT, HEATMAP_LIMIT_MAX, LIST_LIMIT_MAX, NOTE_MAX
from database import Category, Department, Report, ReportStatus, SLABreach, TimelineEvent, get_db, utc_now
from services.auth import verify_admin_key
from services.pagination import offset_param, set_total_count
from services.sla_engine import ESCALATION_TIER_LABELS

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ───────────────────────────────────────────────
# GET /api/admin/queue — Filterable admin queue
# ───────────────────────────────────────────────
@router.get("/queue", dependencies=[Depends(verify_admin_key)])
async def admin_queue(
    response: Response,
    department: Department | None = None,
    category: Category | None = None,
    status: ReportStatus | None = None,
    min_urgency: int = Query(1, ge=1, le=5),
    sla_at_risk: bool = False,
    limit: int = Query(100, ge=1, le=LIST_LIMIT_MAX),
    offset: int = offset_param(),
    db: Session = Depends(get_db),
) -> list[dict]:
    """Issue-management queue for admins: highest urgency first, with SLA breach details (paginated)."""
    q = db.query(Report).filter(Report.parent_id.is_(None))

    if department:
        q = q.filter(Report.department == department)
    if category:
        q = q.filter(Report.category == category)
    if status:
        q = q.filter(Report.status == status)
    q = q.filter(Report.urgency >= min_urgency)
    if sla_at_risk:
        threshold = utc_now() + timedelta(hours=6)
        q = q.filter(
            Report.sla_deadline <= threshold,
            Report.status.in_([ReportStatus.reported, ReportStatus.acknowledged, ReportStatus.in_progress]),
        )

    set_total_count(response, q.count())
    reports = q.order_by(Report.urgency.desc(), Report.created_at.asc()).offset(offset).limit(limit).all()
    now = utc_now()

    result = []
    for r in reports:
        sla_breached = bool(
            r.sla_deadline
            and r.sla_deadline < now
            and r.status in [ReportStatus.reported, ReportStatus.acknowledged, ReportStatus.in_progress]
        )
        minutes_overdue = None
        if sla_breached and r.sla_deadline:
            minutes_overdue = int((now - r.sla_deadline).total_seconds() / 60)

        result.append(
            {
                "id": r.id,
                "title": r.title,
                "category": r.category,
                "status": r.status,
                "urgency": r.urgency,
                "department": r.department,
                "address": r.address,
                "latitude": r.latitude,
                "longitude": r.longitude,
                "upvote_count": r.upvote_count,
                "corroboration_count": r.corroboration_count,
                "sla_deadline": r.sla_deadline.isoformat() if r.sla_deadline else None,
                "escalation_tier": r.escalation_tier,
                "escalation_tier_label": ESCALATION_TIER_LABELS.get(r.escalation_tier, "Unknown"),
                "created_at": r.created_at.isoformat(),
                "ai_summary": r.ai_summary,
                "escalation_flags": r.get_escalation_flags(),
                "sla_breached": sla_breached,
                "minutes_overdue": minutes_overdue,
            }
        )

    return result


# ───────────────────────────────────────────────
# PATCH /api/admin/reports/bulk-status — Bulk update
# ───────────────────────────────────────────────
@router.patch("/reports/bulk-status", dependencies=[Depends(verify_admin_key)])
async def bulk_status_update(
    report_ids: str = Form(...),  # comma-separated
    status: str = Form(...),
    note: str | None = Form(None, max_length=NOTE_MAX),
    db: Session = Depends(get_db),
) -> dict:
    """Set the same status on up to BULK_MAX_IDS reports with a single IN query."""
    try:
        new_status = ReportStatus(status)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid status: {status}") from None

    ids = list(dict.fromkeys(i.strip() for i in report_ids.split(",") if i.strip()))
    if not ids:
        raise HTTPException(status_code=400, detail="No report IDs supplied.")
    if len(ids) > BULK_MAX_IDS:
        raise HTTPException(status_code=400, detail=f"Too many report IDs (max {BULK_MAX_IDS}).")

    reports = db.query(Report).filter(Report.id.in_(ids)).all()
    event_note = note or f"Bulk status update to {new_status.value}"
    for r in reports:
        r.status = new_status
        db.add(TimelineEvent(report_id=r.id, status=new_status.value, note=event_note, actor="admin"))
    db.commit()
    return {"updated": len(reports)}


# ───────────────────────────────────────────────
# GET /api/admin/analytics — Resolution analytics
# ───────────────────────────────────────────────
@router.get("/analytics", dependencies=[Depends(verify_admin_key)])
async def get_analytics(db: Session = Depends(get_db)) -> dict:
    """Resolution analytics computed with SQL aggregates (no full-table Python loops)."""
    now = utc_now()
    week_ago = now - timedelta(days=7)
    done = [ReportStatus.verified, ReportStatus.resolved]
    top_level = Report.parent_id.is_(None)

    total = db.query(func.count(Report.id)).filter(top_level).scalar() or 0
    resolved_week = (
        db.query(func.count(Report.id)).filter(Report.status.in_(done), Report.updated_at >= week_ago).scalar()
    ) or 0

    # SQLite stores DateTime as text; julianday() gives fractional days.
    avg_days = (
        db.query(func.avg(func.julianday(Report.updated_at) - func.julianday(Report.created_at)))
        .filter(Report.status.in_(done), top_level)
        .scalar()
    )
    avg_hours = float(avg_days) * 24 if avg_days is not None else 0.0

    is_done = case((Report.status.in_(done), 1), else_=0)
    by_category = {
        str(cat): {"total": int(n), "resolved": int(r or 0)}
        for cat, n, r in db.query(Report.category, func.count(Report.id), func.sum(is_done))
        .filter(top_level)
        .group_by(Report.category)
        .all()
    }
    by_dept = {
        str(dept): int(n)
        for dept, n in db.query(Report.department, func.count(Report.id))
        .filter(top_level)
        .group_by(Report.department)
        .all()
    }
    by_status = {
        str(st): int(n)
        for st, n in db.query(Report.status, func.count(Report.id)).filter(top_level).group_by(Report.status).all()
    }
    sla_breach_count = db.query(func.count(SLABreach.id)).scalar() or 0

    return {
        "total_reports": total,
        "resolved_this_week": resolved_week,
        "avg_resolution_hours": round(avg_hours, 1),
        "by_category": by_category,
        "by_department": by_dept,
        "by_status": by_status,
        "sla_breach_count": sla_breach_count,
    }


# ───────────────────────────────────────────────
# GET /api/admin/heatmap — Hotspot data
# ───────────────────────────────────────────────
@router.get("/heatmap", dependencies=[Depends(verify_admin_key)])
async def get_heatmap(
    response: Response,
    category: Category | None = None,
    limit: int = Query(HEATMAP_LIMIT_DEFAULT, ge=1, le=HEATMAP_LIMIT_MAX),
    offset: int = offset_param(),
    db: Session = Depends(get_db),
) -> list[dict]:
    """Hotspot points weighted by urgency, corroborations and upvotes."""
    q = db.query(Report).filter(Report.parent_id.is_(None))
    if category:
        q = q.filter(Report.category == category)

    set_total_count(response, q.count())
    reports = q.order_by(Report.created_at.desc()).offset(offset).limit(limit).all()
    points = []
    for r in reports:
        weight = r.urgency * (1 + r.corroboration_count * 0.5 + r.upvote_count * 0.1)
        points.append(
            {
                "latitude": r.latitude,
                "longitude": r.longitude,
                "weight": round(weight, 2),
                "category": str(r.category),
                "id": r.id,
                "title": r.title,
                "urgency": r.urgency,
            }
        )

    return points


# ───────────────────────────────────────────────
# GET /api/admin/sla-log — Public transparency log
# ───────────────────────────────────────────────
# Note: SLA log can also be public, but route under /api/admin/sla-log is protected by admin auth
@router.get("/sla-log", dependencies=[Depends(verify_admin_key)])
async def get_sla_log(
    response: Response,
    limit: int = Query(50, ge=1, le=LIST_LIMIT_MAX),
    offset: int = offset_param(),
    db: Session = Depends(get_db),
) -> list[dict]:
    """Most recent SLA breaches joined to their report in a single query."""
    set_total_count(response, db.query(func.count(SLABreach.id)).scalar() or 0)
    rows = (
        db.query(SLABreach, Report.title, Report.category)
        .outerjoin(Report, Report.id == SLABreach.report_id)
        .order_by(SLABreach.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    result = []
    for b, title, category in rows:
        result.append(
            {
                "id": b.id,
                "report_id": b.report_id,
                "report_title": title if title is not None else "Unknown",
                "category": str(category) if category is not None else "unknown",
                "escalated_to_tier": b.escalated_to_tier,
                "escalated_to_label": ESCALATION_TIER_LABELS.get(b.escalated_to_tier, "Unknown"),
                "breach_minutes": b.breach_minutes,
                "hours_overdue": round(b.breach_minutes / 60, 1),
                "note": b.note,
                "created_at": b.created_at.isoformat(),
            }
        )

    return result
