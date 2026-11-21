"""
Tests for Geo-Semantic Deduplication and Corroboration Engine
"""

from datetime import timedelta

import pytest

from database import Category, Department, Report, ReportStatus, TimelineEvent, utc_now
from services.geo_dedup import (
    cosine_similarity,
    find_duplicate,
    haversine_meters,
    merge_as_corroboration,
)


def test_haversine_meters_known_distances():
    # Same point -> 0 meters
    assert haversine_meters(12.9716, 77.5946, 12.9716, 77.5946) == 0.0

    # 1 degree latitude roughly ~111,000 meters
    dist_1deg_lat = haversine_meters(0.0, 0.0, 1.0, 0.0)
    assert 110_000 < dist_1deg_lat < 112_000

    # Two points on MG Road (~50 meters apart)
    dist = haversine_meters(12.9716, 77.5946, 12.9718, 77.5948)
    assert 0 < dist < 100


def test_cosine_similarity_edge_cases():
    # Identical vectors
    v1 = [1.0, 0.5, -0.2]
    assert pytest.approx(cosine_similarity(v1, v1), rel=1e-5) == 1.0

    # Orthogonal vectors
    v2 = [1.0, 0.0]
    v3 = [0.0, 1.0]
    assert cosine_similarity(v2, v3) == 0.0

    # Opposite vectors
    v4 = [1.0, 2.0]
    v5 = [-1.0, -2.0]
    assert pytest.approx(cosine_similarity(v4, v5), rel=1e-5) == -1.0

    # Empty vectors
    assert cosine_similarity([], []) == 0.0
    assert cosine_similarity([1.0], []) == 0.0


def test_find_duplicate_within_radius_and_similarity(db):
    embedding = [0.5] * 128
    now = utc_now()

    # Seed parent report
    parent = Report(
        id="parent-rep-1",
        title="Deep pothole on MG Road",
        description="Massive pothole near Trinity Metro",
        category=Category.pothole,
        status=ReportStatus.reported,
        latitude=12.9716,
        longitude=77.5946,
        urgency=3,
        department=Department.PWD,
        embedding=str(embedding),
        created_at=now,
    )
    db.add(parent)
    db.commit()

    # Query duplicate at ~30 meters with identical embedding
    match = find_duplicate(
        db=db,
        latitude=12.9718,
        longitude=77.5947,
        category="pothole",
        embedding=embedding,
    )
    assert match is not None
    assert match.id == "parent-rep-1"


def test_find_duplicate_rejects_distant_or_different_category(db):
    embedding = [0.5] * 128
    now = utc_now()

    parent = Report(
        id="parent-rep-2",
        title="Garbage pile Koramangala",
        description="Garbage blocking road",
        category=Category.garbage,
        status=ReportStatus.reported,
        latitude=12.9352,
        longitude=77.6245,
        urgency=3,
        department=Department.BBMP,
        embedding=str(embedding),
        created_at=now,
    )
    db.add(parent)
    db.commit()

    # Beyond 150m (MG Road vs Koramangala is ~5km)
    distant_match = find_duplicate(
        db=db,
        latitude=12.9716,
        longitude=77.5946,
        category="garbage",
        embedding=embedding,
    )
    assert distant_match is None

    # Different category at exact same location
    diff_cat_match = find_duplicate(
        db=db,
        latitude=12.9352,
        longitude=77.6245,
        category="water_leakage",
        embedding=embedding,
    )
    assert diff_cat_match is None


def test_merge_as_corroboration_persists_child_and_tightens_sla(db):
    now = utc_now()
    initial_deadline = now + timedelta(hours=48)

    parent = Report(
        id="parent-corrob-test",
        title="Broken streetlight",
        description="Streetlight pole 4 is out",
        category=Category.streetlight,
        status=ReportStatus.reported,
        latitude=12.9784,
        longitude=77.6408,
        urgency=2,
        corroboration_count=2,  # next corroboration will be 3rd -> urgency bump
        sla_deadline=initial_deadline,
        department=Department.BESCOM,
        created_at=now,
    )
    db.add(parent)
    db.commit()

    # Submit 3rd corroboration
    updated = merge_as_corroboration(
        db=db,
        existing=parent,
        title="Streetlight completely dark",
        description="Dangerous at night, can't see pedestrians",
        latitude=12.9785,
        longitude=77.6409,
        address="100 Feet Road, Indiranagar",
        image_path=None,
        embedding=[0.4] * 128,
    )

    # 1. Corroboration count incremented to 3
    assert updated.corroboration_count == 3

    # 2. Urgency escalated from 2 to 3
    assert updated.urgency == 3

    # 3. SLA deadline tightened (shortened)
    assert updated.sla_deadline is not None
    assert updated.sla_deadline < initial_deadline

    # 4. Child report record persisted with status='merged' and parent_id
    child = db.query(Report).filter(Report.parent_id == "parent-corrob-test").first()
    assert child is not None
    assert child.status == ReportStatus.merged
    assert child.title == "Streetlight completely dark"

    # 5. TimelineEvent created for deadline tightening
    timeline = (
        db.query(TimelineEvent)
        .filter(TimelineEvent.report_id == "parent-corrob-test", TimelineEvent.status == "escalated")
        .first()
    )
    assert timeline is not None
    assert "SLA deadline tightened" in timeline.note
