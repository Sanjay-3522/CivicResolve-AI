"""
CivicResolve — deterministic AI fallbacks used when GEMINI_API_KEY is not set
(or a live call fails), so the full report → track → resolve flow still works.
"""

import hashlib
import re
import struct


# Rule-based backup for a temporarily unavailable AI service. This is not an LLM.
# Match distinctive category phrases first to avoid routing every report to Other
# when a citizen does not know the name of their municipality's department.
_CATEGORY_PATTERNS = (
    (
        "streetlight",
        (
            r"\bstreet[ -]?lights?\b",
            r"\bstreet[ -]?lamps?\b",
            r"\blampposts?\b",
            r"\b(?:broken|dark)\s+(?:street|road)\s+lights?\b",
        ),
    ),
    (
        "water_leakage",
        (
            r"\bwater\s+leak\w*\b",
            r"\bleak\w*\s+(?:water|pipe)\b",
            r"\bburst\s+(?:water\s+)?pipe\b",
            r"\bleaking\s+pipe\b",
        ),
    ),
    (
        "pothole",
        (
            r"\bpotholes?\b",
            r"\bhole\s+(?:in|on)\s+(?:the\s+)?road\b",
            r"\broad\s+pit\b",
        ),
    ),
    (
        "garbage",
        (
            r"\bgarbage\b",
            r"\btrash\b",
            r"\brubbish\b",
            r"\blitter\b",
            r"\bwaste\s+(?:dump|pile|bin)\b",
            r"\boverflowing\s+(?:bin|dumpster)\b",
        ),
    ),
    (
        "road_damage",
        (
            r"\broad\s+damage\b",
            r"\bdamaged\s+(?:road|pavement|footpath)\b",
            r"\broad\s+cracks?\b",
            r"\bcollapsed\s+road\b",
        ),
    ),
)


def _infer_category(text: str) -> str:
    """Best-effort *demo* category when the resident leaves the category blank."""
    for category, patterns in _CATEGORY_PATTERNS:
        if any(re.search(pattern, text, flags=re.IGNORECASE) for pattern in patterns):
            return category
    return "other"


def _mock_triage(title: str, description: str, category_hint: str | None) -> dict:
    """Fallback triage when no API key is set (for demo/dev)."""
    desc_lower = (title + " " + description).lower()

    # Simple rule-based fallback
    flags = []
    urgency = 2
    if any(w in desc_lower for w in ["electric", "wire", "pole", "bescom", "shock"]):
        flags.append("near_electrical")
        urgency = max(urgency, 4)
    if any(w in desc_lower for w in ["school", "children", "college"]):
        flags.append("near_school")
        urgency = max(urgency, 3)
    if any(w in desc_lower for w in ["hospital", "clinic"]):
        flags.append("near_hospital")
        urgency = max(urgency, 3)
    if any(w in desc_lower for w in ["highway", "main road", "junction", "busy"]):
        flags.append("high_traffic")
        urgency = max(urgency, 3)
    if any(w in desc_lower for w in ["flood", "overflow", "drain"]):
        flags.append("flooding_risk")
        urgency = max(urgency, 3)

    cat_map = {
        "pothole": ("PWD", 0.9),
        "garbage": ("BBMP", 0.9),
        "streetlight": ("BESCOM", 0.95),
        "water_leakage": ("BWSSB", 0.9),
        "road_damage": ("PWD", 0.85),
        "other": ("General", 0.5),
    }
    cat = category_hint if category_hint in cat_map else _infer_category(desc_lower)
    dept, conf = cat_map.get(cat, ("General", 0.5))

    return {
        "category": cat,
        "urgency": urgency,
        "urgency_reasoning": f"Auto-assessed from description keywords. Flags detected: {flags or ['none']}.",
        "department": dept,
        "department_confidence": conf,
        "department_justification": f"{dept} handles {cat.replace('_', ' ')} issues.",
        "escalation_flags": flags,
        "dedup_signal": f"{cat} reported: {description[:100]}",
        "ai_summary": f"Classified as Priority {urgency}: {cat.replace('_', ' ')} issue. Assigned to {dept}.",
    }


def _mock_embedding(text: str) -> list[float]:
    """Deterministic mock embedding for dev (not for real similarity)."""
    h = hashlib.sha256(text.encode()).digest()
    vals = []
    for i in range(0, min(len(h), 128), 4):
        v = struct.unpack("f", h[i : i + 4])[0]
        vals.append(max(-1.0, min(1.0, v / 1e30)))
    while len(vals) < 128:
        vals.append(0.0)
    return vals
