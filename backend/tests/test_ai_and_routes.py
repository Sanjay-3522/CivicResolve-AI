"""
Coverage for the Gemini service (live path with the SDK stubbed, mock fallbacks)
and for route branches not exercised elsewhere (resolve, reopen, queue filters).
"""

import io
import json
from types import SimpleNamespace

import pytest
from PIL import Image

import services.gemini_triage as gt
from database import Category, Department, Report, ReportStatus, utc_now


# ── helpers ───────────────────────────────────────────────────────────────────
def _jpeg_bytes(color=(200, 50, 50)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), color).save(buf, format="JPEG")
    return buf.getvalue()


def _report(db, rid, **kw):
    now = utc_now()
    r = Report(
        id=rid,
        title=kw.get("title", "Pothole on main road"),
        description="Deep pothole near the signal",
        category=kw.get("category", Category.pothole),
        status=kw.get("status", ReportStatus.reported),
        latitude=12.97,
        longitude=77.59,
        urgency=kw.get("urgency", 3),
        department=kw.get("department", Department.PWD),
        before_image=kw.get("before_image"),
        sla_deadline=kw.get("sla_deadline"),
        reopen_deadline=kw.get("reopen_deadline"),
        upvote_count=kw.get("upvote_count", 0),
        corroboration_count=kw.get("corroboration_count", 0),
        created_at=now,
        updated_at=now,
    )
    db.add(r)
    db.commit()
    return r


class _FakeClient:
    """Tiny stand-in for the supported google-genai Client.models API."""

    def __init__(self, text=None, exc=None, embedding=None):
        self.text, self.exc, self.embedding = text, exc, embedding
        self.generate_calls = []
        self.embed_calls = []
        self.closed = False
        self.models = self

    def generate_content(self, **kwargs):
        self.generate_calls.append(kwargs)
        if self.exc:
            raise self.exc
        return SimpleNamespace(text=self.text)

    def embed_content(self, **kwargs):
        self.embed_calls.append(kwargs)
        if self.exc:
            raise self.exc
        return SimpleNamespace(embeddings=[SimpleNamespace(values=self.embedding)])

    def close(self):
        self.closed = True


@pytest.fixture
def live(monkeypatch):
    """Exercise the real SDK call shape without contacting a Gemini endpoint."""
    monkeypatch.setenv("GEMINI_API_KEY", "fake-key")

    def install(client):
        monkeypatch.setattr(gt, "_client", lambda api_key: client)
        return client

    return install


# ── config / mode ─────────────────────────────────────────────────────────────
def test_model_names_default_and_env_override(monkeypatch):
    monkeypatch.delenv("GEMINI_MODEL", raising=False)
    monkeypatch.delenv("GEMINI_EMBED_MODEL", raising=False)
    assert gt.get_model_name() == gt.DEFAULT_GEMINI_MODEL
    assert gt.get_embed_model_name() == f"models/{gt.DEFAULT_GEMINI_EMBED_MODEL}"
    monkeypatch.setenv("GEMINI_MODEL", "gemini-custom")
    monkeypatch.setenv("GEMINI_EMBED_MODEL", "models/embed-custom")
    assert gt.get_model_name() == "gemini-custom"
    assert gt.get_embed_model_name() == "models/embed-custom"


def test_triage_prompt_formats_without_error():
    """Regression: unescaped JSON braces made str.format raise KeyError in LIVE mode."""
    out = gt.TRIAGE_PROMPT.format(title="t", description="d", category_hint="c", location="l", image_instruction="i")
    assert '"category": one of' in out and "Report Title: t" in out


# ── live triage path (supported SDK stubbed) ────────────────────────────────────
@pytest.mark.asyncio
async def test_run_triage_live_parses_fenced_json_and_validates(live, tmp_path, monkeypatch):
    monkeypatch.setenv("GEMINI_MODEL", "gemini-test-model")
    payload = {"category": "spaceship", "department": "NASA", "urgency": 9, "department_confidence": 3}
    fake = live(_FakeClient(text="```json\n" + json.dumps(payload) + "\n```"))
    img = tmp_path / "x.jpg"
    img.write_bytes(_jpeg_bytes())
    result = await gt.run_triage("Pothole", "Big pothole", "pothole", "MG Road", str(img))
    assert fake.generate_calls[0]["model"] == "gemini-test-model"
    assert len(fake.generate_calls[0]["contents"]) == 2
    assert fake.closed
    assert result["category"] == "pothole" and result["department"] == "PWD"
    assert result["urgency"] == 5 and result["department_confidence"] == 0.7
    assert "dedup_signal" in result and "ai_summary" in result


@pytest.mark.asyncio
async def test_run_triage_live_falls_back_to_mock_on_error(live):
    live(_FakeClient(exc=RuntimeError("quota")))
    result = await gt.run_triage("Wire down", "Live electric wire near school", "streetlight", "x")
    assert "near_electrical" in result["escalation_flags"]
    assert result["triage_source"] == "rules"


@pytest.mark.asyncio
async def test_run_triage_live_survives_unreadable_image(live, tmp_path):
    bad = tmp_path / "bad.jpg"
    bad.write_bytes(b"not an image")
    fake = live(_FakeClient(text=json.dumps({"category": "garbage", "department": "BBMP", "urgency": 2})))
    result = await gt.run_triage("Bin", "Overflowing bin", None, "x", str(bad))
    assert result["category"] == "garbage" and len(fake.generate_calls[0]["contents"]) == 1
    assert result["triage_source"] == "gemini"


@pytest.mark.asyncio
async def test_get_embedding_live_uses_configured_model(live, monkeypatch):
    monkeypatch.setenv("GEMINI_EMBED_MODEL", "gemini-embedding-2")
    fake = live(_FakeClient(embedding=[0.1, 0.2]))
    assert await gt.get_embedding("hello") == [0.1, 0.2]
    assert fake.embed_calls[0]["model"] == "models/gemini-embedding-2"
    assert fake.embed_calls[0]["config"].output_dimensionality == gt.EMBED_DIMENSIONS
    assert fake.closed


@pytest.mark.asyncio
async def test_get_embedding_live_error_falls_back_to_mock(live):
    live(_FakeClient(exc=RuntimeError("x")))
    emb = await gt.get_embedding("hello")
    assert len(emb) == 128 and emb == gt._mock_embedding("hello")


@pytest.mark.asyncio
async def test_verify_resolution_live_and_error(live, tmp_path):
    before, after = tmp_path / "b.jpg", tmp_path / "a.jpg"
    before.write_bytes(_jpeg_bytes())
    after.write_bytes(_jpeg_bytes((10, 200, 10)))
    live(_FakeClient(text=json.dumps({"resolved": True, "confidence": 0.9, "reasoning": "filled"})))
    ok = await gt.verify_resolution("pothole", "hole", str(before), str(after))
    assert ok["confidence"] == 0.9 and ok["flag_for_review"] is False
    live(_FakeClient(text="not json"))
    bad = await gt.verify_resolution("pothole", "hole", str(before), str(after))
    assert bad["flag_for_review"] is True and bad["resolved"] is False


@pytest.mark.asyncio
async def test_verify_resolution_mock_mode(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    res = await gt.verify_resolution("pothole", "hole", "a", "b")
    assert res["flag_for_review"] is True and res["resolved"] is False


def test_validate_triage_malformed_model_response():
    result = gt._validate_triage(
        {
            "category": "hacked",
            "department": "Unknown",
            "urgency": "oops",
            "department_confidence": "nan",
            "escalation_flags": ["near_school", "fake_flag"],
            "urgency_reasoning": ["not a string"],
            "ai_summary": "x" * 900,
        },
        "bad_hint",
    )
    assert result["category"] == "other"
    assert result["department"] == "General"
    assert result["urgency"] == 3
    assert result["department_confidence"] == 0.7
    assert result["escalation_flags"] == ["near_school"]
    assert len(result["ai_summary"]) == 500


@pytest.mark.asyncio
async def test_resolution_rejects_fabricated_claim_when_not_resolved(live, tmp_path):
    before, after = tmp_path / "b.jpg", tmp_path / "a.jpg"
    before.write_bytes(_jpeg_bytes())
    after.write_bytes(_jpeg_bytes())
    live(_FakeClient(text=json.dumps({"resolved": False, "confidence": 0.99, "reasoning": "still open"})))
    result = await gt.verify_resolution("pothole", "hole", str(before), str(after))
    assert result["flag_for_review"] and not result["resolved"]


@pytest.mark.parametrize(
    "text,flag,min_urgency",
    [
        ("exposed electric wire", "near_electrical", 4),
        ("outside the school gate", "near_school", 3),
        ("near the hospital entrance", "near_hospital", 3),
        ("busy main road junction", "high_traffic", 3),
        ("drain overflow flooding", "flooding_risk", 3),
    ],
)
def test_mock_triage_keyword_flags(text, flag, min_urgency):
    result = gt._mock_triage("Issue", text, "other")
    assert flag in result["escalation_flags"] and result["urgency"] >= min_urgency


def test_mock_triage_defaults_and_image_instruction():
    assert gt._mock_triage("x", "y", None)["department"] == "General"
    assert "image has been provided" in gt._get_image_instruction(True)
    assert "No image" in gt._get_image_instruction(False)


@pytest.mark.asyncio
async def test_triage_source_is_rules_without_api_key(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    result = await gt.run_triage("Broken pavement", "Unsafe street crossing", "pothole", "x")
    assert result["triage_source"] == "rules"


@pytest.mark.parametrize(
    "description,category,department",
    [
        ("There is a large pothole at the corner", "pothole", "PWD"),
        ("The streetlamp next to the bus stop is broken", "streetlight", "BESCOM"),
        ("A burst water pipe is leaking on the road", "water_leakage", "BWSSB"),
        ("Overflowing garbage bin near the school", "garbage", "BBMP"),
        ("Damaged pavement along the bridge", "road_damage", "PWD"),
        ("Unfamiliar municipal issue", "other", "General"),
    ],
)
def test_no_category_hint_still_routes_common_issues(description, category, department):
    result = gt._mock_triage("Report", description, None)
    assert (result["category"], result["department"]) == (category, department)


def test_category_hint_remains_user_overridable_in_demo_rules():
    result = gt._mock_triage("Report", "A pothole on the road", "road_damage")
    assert result["category"] == "road_damage"


def test_validated_model_routes_invalid_department_using_category():
    result = gt._validate_triage({"category": "pothole", "department": "fictional"}, None)
    assert result["department"] == "PWD"


def test_validated_model_preserves_supported_escalation_flags():
    result = gt._validate_triage({"escalation_flags": ["structural_risk", "repeated_report"]}, None)
    assert result["escalation_flags"] == ["structural_risk", "repeated_report"]
