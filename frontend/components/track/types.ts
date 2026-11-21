/** Types and display constants for the citizen tracking page (GET /api/reports/{id}). */

export interface TimelineEvent {
  id: number
  status: string
  note: string | null
  actor: string
  created_at: string
}
export interface SlaBreach {
  id: number
  escalated_to_tier: number
  breach_minutes: number
  note: string | null
  created_at: string
}
export interface Corroboration {
  id: string
  title: string
  description: string
  before_image: string | null
  address: string | null
  created_at: string | null
}

/** GET /api/reports/{id} — the fields this page renders. */
export interface TrackedReport {
  id: string
  title: string
  description: string
  category: string
  status: string
  urgency: number
  urgency_reasoning?: string | null
  department: string | null
  address: string | null
  latitude?: number
  longitude?: number
  ai_summary?: string | null
  escalation_flags: string[]
  sla_deadline?: string | null
  escalation_tier: number
  escalated_at?: string | null
  reopen_deadline?: string | null
  reopen_count: number
  upvote_count: number
  corroboration_count: number
  nearby_count: number
  resolution_confidence?: number | null
  resolution_reasoning?: string | null
  before_image?: string | null
  after_image?: string | null
  timelines: TimelineEvent[]
  sla_breaches: SlaBreach[]
  corroborations: Corroboration[]
}

export const STATUS_STEPS = ['reported', 'acknowledged', 'in_progress', 'resolved', 'verified']
export const STATUS_LABELS: Record<string, string> = {
  reported: 'Reported',
  acknowledged: 'Acknowledged',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  verified: 'Verified ✓',
  flagged: '⚠️ Under Review',
  reopened: '🔄 Reopened',
  escalated: '⚠️ Escalated',
}
export const STATUS_COLORS: Record<string, string> = {
  reported: 'bg-gray-600',
  acknowledged: 'bg-blue-600',
  in_progress: 'bg-yellow-700',
  resolved: 'bg-green-700',
  verified: 'bg-green-700',
  flagged: 'bg-orange-700',
  reopened: 'bg-red-600',
}
export const URGENCY_LABELS = ['', 'Very Low', 'Low', 'Medium', 'High', 'Critical']
export const URGENCY_COLORS = [
  '',
  'text-green-700',
  'text-yellow-700',
  'text-orange-700',
  'text-red-700',
  'text-red-800 font-black',
]
export const FLAG_LABELS: Record<string, string> = {
  near_electrical: '⚡ Near Electrical',
  near_school: '🏫 Near School',
  near_hospital: '🏥 Near Hospital',
  high_traffic: '🚗 High Traffic',
  flooding_risk: '🌊 Flooding Risk',
  structural_risk: '🏗️ Structural Risk',
  repeated_report: '🔁 Repeated',
}
