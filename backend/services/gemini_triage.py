"""Gemini-powered report triage, semantic deduplication and image verification.

Uses the supported ``google-genai`` SDK. Without an API key (or when an upstream
request fails) the prototype keeps working using visibly rule-based fallbacks.
"""

import asyncio
import json
import logging
import os
import re
from pathlib import Path
from typing import Any

from google import genai
from google.genai import types
from PIL import Image

from constants import ALLOWED_IMAGE_FORMATS
from services.mock_ai import _mock_embedding, _mock_triage
from services.prompts import RESOLUTION_VERIFY_PROMPT, TRIAGE_PROMPT, _get_image_instruction

__all__ = ["TRIAGE_PROMPT", "_get_image_instruction", "_mock_embedding", "_mock_triage"]

logger = logging.getLogger(__name__)

# Model names are overridable so projects can choose a model they can access.
DEFAULT_GEMINI_MODEL = "gemini-3.8-flash"
DEFAULT_GEMINI_EMBED_MODEL = "gemini-embedding-2"
EMBED_DIMENSIONS = 768


def get_model_name() -> str:
    """Generation model used for triage and resolution verification."""
    return os.getenv("GEMINI_MODEL", DEFAULT_GEMINI_MODEL)


def get_embed_model_name() -> str:
    """Embedding model used for deduplication (``models/``-prefixed)."""
    name = os.getenv("GEMINI_EMBED_MODEL", DEFAULT_GEMINI_EMBED_MODEL)
    return name if name.startswith("models/") else f"models/{name}"


def ai_mode() -> str:
    """'live' means a key is configured; individual calls may still fall back."""
    return "live" if os.getenv("GEMINI_API_KEY") else "mock"


def _client(api_key: str) -> genai.Client:
    """Use a bounded HTTP timeout so a judge's live demo cannot hang indefinitely."""
    return genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=30000))


def _image_part(path: str) -> types.Part:
    """Verify an existing image and send the original bytes with a trusted MIME type."""
    with Image.open(path, formats=list(ALLOWED_IMAGE_FORMATS)) as img:
        img.verify()
        image_format = img.format
    mime_types = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}
    if not image_format or image_format not in mime_types:
        raise ValueError("Unsupported image format")
    return types.Part.from_bytes(data=Path(path).read_bytes(), mime_type=mime_types[image_format])


def _json_response(text: str | None) -> dict[str, Any]:
    if not text:
        raise ValueError("The model returned an empty response")
    clean = re.sub(r"^```(?:json)?\s*", "", text.strip())
    clean = re.sub(r"\s*```$", "", clean)
    value = json.loads(clean)
    if not isinstance(value, dict):
        raise ValueError("The model returned a non-object JSON value")
    return value


def _validate_triage(result: dict[str, Any], category_hint: str | None) -> dict[str, Any]:
    """Constrain the LLM response to known departments, priorities and safe lengths."""
    categories = {"pothole", "garbage", "streetlight", "water_leakage", "road_damage", "other"}
    departments = {"PWD", "BESCOM", "BBMP", "BWSSB", "Traffic", "General"}
    flags = {
        "near_electrical",
        "near_school",
        "near_hospital",
        "high_traffic",
        "flooding_risk",
        "structural_risk",
        "repeated_report",
    }

    category = result.get("category")
    if category not in categories:
        category = category_hint if category_hint in categories else "other"
    result["category"] = category
    if result.get("department") not in departments:
        fallback_department = {
            "pothole": "PWD",
            "garbage": "BBMP",
            "streetlight": "BESCOM",
            "water_leakage": "BWSSB",
            "road_damage": "PWD",
        }
        result["department"] = fallback_department.get(category, "General")

    try:
        result["urgency"] = max(1, min(5, int(result.get("urgency", 3))))
    except (ValueError, TypeError, OverflowError):
        result["urgency"] = 3
    try:
        confidence = float(result.get("department_confidence", 0.7))
        if not 0 <= confidence <= 1:  # also handles NaN
            confidence = 0.7
        result["department_confidence"] = confidence
    except (ValueError, TypeError, OverflowError):
        result["department_confidence"] = 0.7

    for field, fallback, limit in [
        ("urgency_reasoning", "Assessed based on the report description.", 500),
        ("department_justification", "Assigned according to the issue type.", 500),
        ("dedup_signal", f"{category} issue reported", 500),
    ]:
        value = result.get(field)
        result[field] = value[:limit] if isinstance(value, str) and value.strip() else fallback

    received = result.get("escalation_flags")
    result["escalation_flags"] = (
        [f for f in received if isinstance(f, str) and f in flags][:5] if isinstance(received, list) else []
    )
    summary = result.get("ai_summary")
    result["ai_summary"] = (
        summary[:500]
        if isinstance(summary, str) and summary.strip()
        else f"Priority {result['urgency']}: {result['urgency_reasoning'][:160]}"
    )
    return result


async def run_triage(
    title: str,
    description: str,
    category_hint: str | None,
    location: str,
    image_path: str | None = None,
) -> dict:
    """Classify and route an issue with Gemini; degrade to deterministic rules."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        result = _mock_triage(title, description, category_hint)
        result["triage_source"] = "rules"
        return result

    prompt = TRIAGE_PROMPT.format(
        title=title,
        description=description,
        category_hint=category_hint or "unspecified",
        location=location,
        image_instruction=_get_image_instruction(bool(image_path)),
    )
    parts: list[types.Part] = [types.Part.from_text(text=prompt)]
    if image_path and os.path.exists(image_path):
        try:
            parts.append(_image_part(image_path))
        except (OSError, ValueError, SyntaxError) as exc:
            logger.warning("Could not load report image for triage: %s", exc)

    try:
        client = _client(api_key)
        try:
            response = await asyncio.to_thread(
                client.models.generate_content,
                model=get_model_name(),
                contents=parts,
                config=types.GenerateContentConfig(response_mime_type="application/json", temperature=0.2),
            )
        finally:
            client.close()
        result = _validate_triage(_json_response(response.text), category_hint)
        result["triage_source"] = "gemini"
        return result
    except Exception:
        logger.exception("Gemini triage unavailable, using rule-based fallback")
        result = _mock_triage(title, description, category_hint)
        result["triage_source"] = "rules"
        return result


async def get_embedding(text: str) -> list[float]:
    """Return a Gemini text embedding; fall back to deterministic demo vectors."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return _mock_embedding(text)
    try:
        client = _client(api_key)
        try:
            response = await asyncio.to_thread(
                client.models.embed_content,
                model=get_embed_model_name(),
                contents=text,
                config=types.EmbedContentConfig(
                    task_type="SEMANTIC_SIMILARITY", output_dimensionality=EMBED_DIMENSIONS
                ),
            )
        finally:
            client.close()
        if not response.embeddings or not response.embeddings[0].values:
            raise ValueError("Missing embedding vector")
        return list(response.embeddings[0].values)
    except Exception:
        logger.exception("Gemini embeddings unavailable, using deterministic fallback")
        return _mock_embedding(text)


async def verify_resolution(
    category: str,
    original_description: str,
    before_image_path: str,
    after_image_path: str,
) -> dict:
    """Flag unverifiable or low-confidence before/after comparisons for review."""
    fallback: dict[str, Any] = {
        "resolved": False,
        "confidence": 0.5,
        "reasoning": "AI photo verification was unavailable; manual review is needed.",
        "flag_for_review": True,
    }
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return fallback

    parts: list[types.Part] = [
        types.Part.from_text(
            text=RESOLUTION_VERIFY_PROMPT.format(category=category, original_description=original_description)
        )
    ]
    for path in [before_image_path, after_image_path]:
        if path and os.path.exists(path):
            try:
                parts.append(_image_part(path))
            except (OSError, ValueError, SyntaxError) as exc:
                logger.warning("Could not load resolution image: %s", exc)
    # Without both photos, the model cannot verify a before/after comparison.
    if len(parts) != 3:
        return fallback

    try:
        client = _client(api_key)
        try:
            response = await asyncio.to_thread(
                client.models.generate_content,
                model=get_model_name(),
                contents=parts,
                config=types.GenerateContentConfig(response_mime_type="application/json", temperature=0.2),
            )
        finally:
            client.close()
        result = _json_response(response.text)
        confidence = float(result.get("confidence", 0))
        if not 0 <= confidence <= 1:
            raise ValueError("Invalid resolution confidence")
        resolved = result.get("resolved") is True
        reasoning = result.get("reasoning", "")
        return {
            "resolved": resolved,
            "confidence": confidence,
            "reasoning": reasoning[:500] if isinstance(reasoning, str) else "Manual review required.",
            "flag_for_review": not resolved or confidence < 0.75,
        }
    except Exception:
        logger.exception("Gemini resolution verification failed; manual review required")
        return fallback
