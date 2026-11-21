"""
CivicResolve — Report lifecycle router: status updates, resolution with AI
photo verification, and the citizen 72-hour reopen window.
"""

import logging
from datetime import timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from constants import NOTE_MAX
from database import Report, ReportStatus, TimelineEvent, get_db, utc_now
from services.auth import reopen_limiter, verify_admin_key
from services.gemini_triage import verify_resolution
from services.sla_engine import compute_sla_deadline
from services.uploads import save_upload

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/reports", tags=["reports"])


# ───────────────────────────────────────────────
# POST /api/reports/{id}/status — Admin status update (Admin auth required)
# ───────────────────────────────────────────────
@router.post("/{report_id}/status", dependencies=[Depends(verify_admin_key)])
async def update_status(
    report_id: str,
    status: str = Form(...),
    note: str | None = Form(None, max_length=NOTE_MAX),
    db: Session = Depends(get_db),
) -> dict:
    """Admin: set a single report status and log it on the timeline."""
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    try:
        new_status = ReportStatus(status)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid status: {status}") from None

    report.status = new_status
    event = TimelineEvent(
        report_id=report_id,
        status=status,
        note=note or f"Status updated to {status}",
        actor="admin",
        created_at=utc_now(),
    )
    db.add(event)
    db.commit()
    return {"status": status, "message": "Status updated."}


# ───────────────────────────────────────────────
# POST /api/reports/{id}/resolve — Submit after-photo + verify (Admin auth required)
# ───────────────────────────────────────────────
@router.post("/{report_id}/resolve", dependencies=[Depends(verify_admin_key)])
async def resolve_report(
    report_id: str,
    note: str | None = Form(None, max_length=NOTE_MAX),
    after_image: UploadFile | None = File(None),
    db: Session = Depends(get_db),
) -> dict:
    """Admin: resolve with optional after-photo; AI compares before/after when both exist."""
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    after_path = None
    if after_image and after_image.filename:
        after_path = await save_upload(after_image, "after")
        report.after_image = after_path

    # Vision verification if we have both images
    if report.before_image and after_path:
        verify = await verify_resolution(
            category=str(report.category),
            original_description=report.description,
            before_image_path=report.before_image,
            after_image_path=after_path,
        )
        report.resolution_confidence = verify.get("confidence", 0.5)
        report.resolution_reasoning = verify.get("reasoning", "")

        if verify.get("flag_for_review"):
            report.status = ReportStatus.flagged
            report.reopen_deadline = utc_now() + timedelta(hours=72)
            status_note = (
                f"⚠️ AI confidence: {verify.get('confidence', 0):.0%}. {verify.get('reasoning', '')} "
                "Citizens have 72h to request re-open."
            )
            event_status = "flagged"
        else:
            report.status = ReportStatus.verified
            report.reopen_deadline = utc_now() + timedelta(hours=72)
            status_note = (
                f"✅ AI verified resolution ({verify.get('confidence', 0):.0%} confidence). "
                f"{verify.get('reasoning', '')}"
            )
            event_status = "verified"
    else:
        report.status = ReportStatus.resolved
        report.reopen_deadline = utc_now() + timedelta(hours=72)
        status_note = note or "Marked as resolved (no after-image provided — lower trust signal)."
        event_status = "resolved"

    event = TimelineEvent(
        report_id=report_id,
        status=event_status,
        note=status_note,
        actor="admin",
        created_at=utc_now(),
    )
    db.add(event)
    db.commit()

    return {
        "status": report.status,
        "resolution_confidence": report.resolution_confidence,
        "resolution_reasoning": report.resolution_reasoning,
        "reopen_deadline": report.reopen_deadline.isoformat() if report.reopen_deadline else None,
    }


# ───────────────────────────────────────────────
# POST /api/reports/{id}/reopen — Citizen re-open within 72h (Rate limited)
# ───────────────────────────────────────────────
@router.post("/{report_id}/reopen", dependencies=[Depends(reopen_limiter)])
async def reopen_report(
    report_id: str,
    reason: str = Form(..., min_length=1, max_length=NOTE_MAX),
    db: Session = Depends(get_db),
) -> dict:
    """Citizen: reopen within 72h of resolution; bumps urgency and tightens the SLA."""
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    if report.reopen_deadline and utc_now() > report.reopen_deadline:
        raise HTTPException(status_code=400, detail="72-hour reopen window has expired.")

    if report.status not in [ReportStatus.resolved, ReportStatus.verified, ReportStatus.flagged]:
        raise HTTPException(status_code=400, detail="Report is not in a resolvable state.")

    report.status = ReportStatus.reopened
    report.reopen_count += 1

    # Escalate urgency and recompute SLA deadline
    old_urgency = report.urgency
    new_urgency = min(5, report.urgency + 1)
    report.urgency = new_urgency

    old_deadline = report.sla_deadline
    new_deadline = compute_sla_deadline(str(report.category), new_urgency, utc_now())
    report.sla_deadline = new_deadline

    old_str = old_deadline.strftime("%Y-%m-%d %H:%M UTC") if old_deadline else "none"
    new_str = new_deadline.strftime("%Y-%m-%d %H:%M UTC")

    event = TimelineEvent(
        report_id=report_id,
        status="reopened",
        note=(
            f"🔄 Citizen reopened: {reason}. Reopen #{report.reopen_count}. "
            f"SLA deadline tightened from {old_str} to {new_str} "
            f"due to escalated urgency (P{old_urgency} → P{new_urgency})."
        ),
        actor="citizen",
        created_at=utc_now(),
    )
    db.add(event)
    db.commit()

    return {
        "status": "reopened",
        "reopen_count": report.reopen_count,
        "new_urgency": report.urgency,
        "new_sla_deadline": new_deadline.isoformat(),
    }
