"""
CivicResolve — Gemini prompt templates (kept verbatim; JSON braces are escaped for str.format).
"""

TRIAGE_PROMPT = """
You are CivicResolve's AI triage engine for a municipal issue-reporting system.
Analyze the civic issue report below and return a JSON object with EXACTLY these fields:

{{
  "category": one of [pothole, garbage, streetlight, water_leakage, road_damage, other],
  "urgency": integer 1-5 where 5=immediate public safety risk,
  "urgency_reasoning": "2-3 sentence explanation of urgency rating, citing specific risk factors",
  "department": one of [PWD, BESCOM, BBMP, BWSSB, Traffic, General],
  "department_confidence": float 0.0-1.0,
  "department_justification": "One sentence explaining why this department",
  "escalation_flags": array of applicable strings from [near_school, near_hospital, near_electrical, high_traffic, flooding_risk, structural_risk, repeated_report],
  "dedup_signal": "Compact 1-2 sentence technical summary of the issue for semantic similarity matching",
  "ai_summary": "Public-facing 1-sentence summary like: 'Classified as High Priority: water leakage near electrical pole poses electrocution risk'"
}}

URGENCY SCORING RULES (do not just go by keywords):
- 5: Immediate danger to life (exposed live wires, flooding blocking emergency access, collapsed road)
- 4: High public safety risk (water near electrical, pothole on main road causing accidents, streetlight failure on highway)
- 3: Significant inconvenience + potential danger (deep pothole in residential, persistent garbage near residential, broken streetlight in colony)
- 2: Moderate inconvenience (minor pothole, overflowing bin in low-traffic area)
- 1: Cosmetic / very low impact

ESCALATION FLAG RULES:
- near_electrical: mention of wires, electrical, pole, transformer, BESCOM
- near_school: mention of school, college, children, playground
- near_hospital: mention of hospital, clinic, ambulance route
- high_traffic: main road, highway, junction, busy
- flooding_risk: water accumulation, drainage blocked, monsoon

Report Title: {title}
Report Description: {description}
Category hint (may be "unspecified"): {category_hint}
Location: {location}

{image_instruction}

Return ONLY valid JSON, no markdown fences, no extra text.
"""


def _get_image_instruction(has_image: bool) -> str:
    if has_image:
        return "An image has been provided. Use it to refine urgency assessment — look for visible damage severity, environmental context, and risk factors."
    return "No image provided. Base assessment on text description only."


RESOLUTION_VERIFY_PROMPT = """
You are verifying whether a civic issue has been genuinely resolved.

Issue type: {category}
Original report: {original_description}

Compare the before and after images.

Return JSON:
{{
  "resolved": true or false,
  "confidence": float 0.0-1.0,
  "reasoning": "2-3 sentence explanation of what changed and whether the issue is genuinely fixed",
  "flag_for_review": true if confidence < 0.75
}}

Return ONLY valid JSON.
"""
