"""
CivicResolve — demo dataset (Bengaluru) loaded by seed_data.seed_if_empty().
"""

import uuid
from typing import Any

# Bangalore demo coordinates (MG Road area)
DEMO_LOCATIONS = [
    # Cluster 1: MG Road potholes (will deduplicate)
    {"lat": 12.9716, "lon": 77.5946, "address": "MG Road, Near Anil Kumble Circle, Bengaluru"},
    {"lat": 12.9718, "lon": 77.5948, "address": "MG Road, Opp. Trinity Metro Station, Bengaluru"},
    {"lat": 12.9715, "lon": 77.5944, "address": "MG Road, Near Cauvery Junction, Bengaluru"},
    # Cluster 2: Koramangala water issues
    {"lat": 12.9352, "lon": 77.6245, "address": "80 Feet Road, Koramangala 4th Block, Bengaluru"},
    {"lat": 12.9354, "lon": 77.6247, "address": "Koramangala 4th Block, Near Forum Mall, Bengaluru"},
    # Indiranagar streetlight
    {"lat": 12.9784, "lon": 77.6408, "address": "100 Feet Road, Indiranagar, Bengaluru"},
    # Whitefield garbage
    {"lat": 12.9698, "lon": 77.7499, "address": "ITPL Main Road, Whitefield, Bengaluru"},
    # HSR Layout road damage
    {"lat": 12.9121, "lon": 77.6446, "address": "HSR Layout Sector 2, Bengaluru"},
    # Critical: water leakage near electrical pole
    {"lat": 12.9550, "lon": 77.6100, "address": "Richmond Road, Near Electrical Sub-station, Bengaluru"},
]


SEED_REPORTS: list[dict[str, Any]] = [
    # ── Cluster 1: MG Road potholes (parent + 2 corroborations) ──
    {
        "id": "demo-" + uuid.uuid4().hex[:8],
        "title": "Deep pothole causing accidents on MG Road",
        "description": "There is a very deep pothole on MG Road near Anil Kumble Circle. Multiple two-wheelers have swerved to avoid it. It is on a busy junction with high traffic.",
        "category": "pothole",
        "latitude": DEMO_LOCATIONS[0]["lat"],
        "longitude": DEMO_LOCATIONS[0]["lon"],
        "address": DEMO_LOCATIONS[0]["address"],
        "urgency": 4,
        "urgency_reasoning": "Deep pothole on a high-traffic main road junction is causing vehicles to swerve, creating accident risk. Near Anil Kumble Circle which is a busy intersection.",
        "department": "PWD",
        "department_confidence": 0.95,
        "department_justification": "Road maintenance falls under PWD for major arterial roads in Bangalore.",
        "escalation_flags": ["high_traffic"],
        "ai_summary": "Classified as High Priority: deep pothole on high-traffic MG Road junction causing accident risk",
        "status": "acknowledged",
        "corroboration_count": 7,
        "upvote_count": 23,
        "escalation_tier": 1,
        "is_parent": True,
        "timeline": [
            ("reported", "Report submitted and triaged by AI.", "system"),
            ("acknowledged", "Acknowledged by PWD Ward Officer. Inspection scheduled.", "admin"),
        ],
        "sla_offset_hours": -18,  # SLA deadline was 18h ago (BREACHED)
    },
    # ── Critical: Water leakage near electrical pole ──
    {
        "id": "demo-" + uuid.uuid4().hex[:8],
        "title": "Water leakage near electrical transformer — URGENT",
        "description": "A major pipe has burst near the BESCOM electrical sub-station on Richmond Road. Water is flowing towards the transformer base. Children walk through this area on the way to school nearby.",
        "category": "water_leakage",
        "latitude": DEMO_LOCATIONS[8]["lat"],
        "longitude": DEMO_LOCATIONS[8]["lon"],
        "address": DEMO_LOCATIONS[8]["address"],
        "urgency": 5,
        "urgency_reasoning": "Water leakage near an electrical transformer poses immediate electrocution risk. Children from nearby school pass through this area. Flooding risk if unaddressed within hours.",
        "department": "BWSSB",
        "department_confidence": 0.88,
        "department_justification": "BWSSB handles water supply and sewerage; BESCOM should be co-notified due to electrical proximity.",
        "escalation_flags": ["near_electrical", "near_school", "flooding_risk"],
        "ai_summary": "🚨 CRITICAL: Water leakage near electrical transformer poses electrocution risk. Children in area. Immediate action required.",
        "status": "reported",
        "corroboration_count": 3,
        "upvote_count": 41,
        "escalation_tier": 2,  # Already escalated
        "is_parent": True,
        "timeline": [
            (
                "reported",
                "Report submitted and triaged by AI. Urgency auto-set to 5 due to electrical proximity.",
                "ai",
            ),
            (
                "escalated",
                "⚠️ SLA breached — escalated to Zonal Commissioner after 2h delay. This event is public.",
                "system",
            ),
        ],
        "sla_offset_hours": -4,  # SLA was 4h ago (CRITICAL BREACH)
    },
    # ── Indiranagar streetlight failure ──
    {
        "id": "demo-" + uuid.uuid4().hex[:8],
        "title": "5 streetlights broken on 100 Feet Road",
        "description": "The stretch from BDA complex to CMH Road has 5 consecutive streetlights not working since 3 days. The road is very dark at night and there have been 2 chain snatching incidents here this week.",
        "category": "streetlight",
        "latitude": DEMO_LOCATIONS[5]["lat"],
        "longitude": DEMO_LOCATIONS[5]["lon"],
        "address": DEMO_LOCATIONS[5]["address"],
        "urgency": 4,
        "urgency_reasoning": "Multiple consecutive streetlight failures on a busy road have already resulted in criminal activity (chain snatching). Safety risk is escalating with each night of outage.",
        "department": "BESCOM",
        "department_confidence": 0.97,
        "department_justification": "BESCOM is responsible for streetlighting infrastructure in Bangalore.",
        "escalation_flags": ["high_traffic"],
        "ai_summary": "Classified as High Priority: 5 consecutive streetlights out for 3 days, 2 crimes already reported in darkness",
        "status": "in_progress",
        "corroboration_count": 4,
        "upvote_count": 18,
        "escalation_tier": 1,
        "is_parent": True,
        "timeline": [
            ("reported", "Report submitted and triaged by AI.", "system"),
            ("acknowledged", "BESCOM team notified. Inspection within 24h.", "admin"),
            ("in_progress", "Repair team dispatched. Replacement bulbs ordered.", "admin"),
        ],
        "sla_offset_hours": 2,  # SLA in 2 hours (AT RISK)
    },
    # ── Whitefield garbage ──
    {
        "id": "demo-" + uuid.uuid4().hex[:8],
        "title": "Garbage pile blocking footpath for 5 days",
        "description": "A large pile of garbage has not been collected from ITPL Main Road near the bus stop for 5 days. It is blocking the footpath and the smell is unbearable. Stray dogs are scavenging.",
        "category": "garbage",
        "latitude": DEMO_LOCATIONS[6]["lat"],
        "longitude": DEMO_LOCATIONS[6]["lon"],
        "address": DEMO_LOCATIONS[6]["address"],
        "urgency": 3,
        "urgency_reasoning": "5-day old garbage pile near a public bus stop. Health risk from stray dogs and decomposing waste. Footpath blocked affects daily commuters.",
        "department": "BBMP",
        "department_confidence": 0.93,
        "department_justification": "BBMP is responsible for solid waste management in Bangalore.",
        "escalation_flags": [],
        "ai_summary": "Classified as Medium Priority: 5-day uncollected garbage blocking footpath and creating health hazard near busy bus stop",
        "status": "reported",
        "corroboration_count": 2,
        "upvote_count": 9,
        "escalation_tier": 1,
        "is_parent": True,
        "timeline": [
            ("reported", "Report submitted and triaged by AI.", "system"),
        ],
        "sla_offset_hours": 6,  # SLA in 6 hours
    },
    # ── HSR Layout road damage ──
    {
        "id": "demo-" + uuid.uuid4().hex[:8],
        "title": "Road completely dug up — no warning signs",
        "description": "The road in HSR Sector 2 near the park has been dug up for some pipeline work and left without any barricades or warning signs for 2 weeks. A scooter fell into it last night.",
        "category": "road_damage",
        "latitude": DEMO_LOCATIONS[7]["lat"],
        "longitude": DEMO_LOCATIONS[7]["lon"],
        "address": DEMO_LOCATIONS[7]["address"],
        "urgency": 4,
        "urgency_reasoning": "Open excavation without safety barriers is a direct hazard — an accident has already occurred. Liability risk for the municipality if unaddressed.",
        "department": "PWD",
        "department_confidence": 0.82,
        "department_justification": "PWD handles road construction and maintenance; contractor may also be accountable.",
        "escalation_flags": ["structural_risk"],
        "ai_summary": "Classified as High Priority: open road excavation with no safety barriers — accident already reported",
        "status": "resolved",
        "corroboration_count": 1,
        "upvote_count": 14,
        "escalation_tier": 1,
        "is_parent": True,
        "resolution_confidence": 0.52,
        "resolution_reasoning": "After-image shows some filling material but the excavation appears partially open. Recommend citizen verification before closing.",
        "reopen_offset_hours": 48,  # Still within reopen window
        "timeline": [
            ("reported", "Report submitted and triaged by AI.", "system"),
            ("acknowledged", "PWD team assigned.", "admin"),
            ("in_progress", "Repair work in progress.", "admin"),
            (
                "resolved",
                "⚠️ AI confidence: 52%. After-image shows partial filling. Citizens have 72h to request re-open.",
                "admin",
            ),
        ],
        "sla_offset_hours": -24,
    },
    # ── Koramangala water leakage (resolved + reopened) ──
    {
        "id": "demo-" + uuid.uuid4().hex[:8],
        "title": "Water pipe burst — road flooded near Forum Mall",
        "description": "A major water pipe has burst near Forum Mall on 80 Feet Road, Koramangala. The road is flooded up to 6 inches. Traffic is severely disrupted and water is entering ground floor shops.",
        "category": "water_leakage",
        "latitude": DEMO_LOCATIONS[3]["lat"],
        "longitude": DEMO_LOCATIONS[3]["lon"],
        "address": DEMO_LOCATIONS[3]["address"],
        "urgency": 4,
        "urgency_reasoning": "Active water main burst flooding a major road near a large commercial complex. Business disruption and flooding risk to adjacent properties.",
        "department": "BWSSB",
        "department_confidence": 0.91,
        "department_justification": "BWSSB manages water mains and burst pipe response.",
        "escalation_flags": ["flooding_risk", "high_traffic"],
        "ai_summary": "Classified as High Priority: water main burst flooding major road near commercial zone",
        "status": "reopened",
        "corroboration_count": 5,
        "upvote_count": 31,
        "escalation_tier": 1,
        "reopen_count": 1,
        "is_parent": True,
        "timeline": [
            ("reported", "Report submitted and triaged by AI.", "system"),
            ("acknowledged", "BWSSB emergency team notified.", "admin"),
            ("in_progress", "Pipe repair underway.", "admin"),
            ("resolved", "Pipe repaired. Road cleared.", "admin"),
            (
                "reopened",
                "🔄 Citizen reopened: Road still has standing water and pipe is leaking again after 2 days. Urgency auto-escalated.",
                "citizen",
            ),
        ],
        "sla_offset_hours": -12,
    },
]
