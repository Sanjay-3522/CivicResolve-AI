/** Shared admin-dashboard types mirroring the FastAPI responses. */

export type ReportStatus =
  'reported' | 'acknowledged' | 'in_progress' | 'resolved' | 'verified' | 'flagged' | 'reopened' | 'merged'

export type AdminTab = 'queue' | 'analytics' | 'sla'

/** One row of GET /api/admin/queue. */
export interface QueueReport {
  id: string
  title: string
  category: string
  status: ReportStatus | string
  urgency: number
  department: string | null
  address: string | null
  latitude?: number
  longitude?: number
  upvote_count: number
  corroboration_count: number
  sla_deadline: string | null
  escalation_tier: number
  escalation_tier_label: string
  created_at: string
  ai_summary: string | null
  escalation_flags: string[]
  sla_breached: boolean
  minutes_overdue?: number | null
}

export interface CategoryStats {
  total: number
  resolved: number
}

/** GET /api/admin/analytics. */
export interface Analytics {
  total_reports: number
  resolved_this_week: number
  avg_resolution_hours: number
  by_category: Record<string, CategoryStats>
  by_department: Record<string, number>
  by_status: Record<string, number>
  sla_breach_count: number
}

/** One row of GET /api/admin/sla-log. */
export interface SlaLogEntry {
  id: number
  report_id: string
  report_title: string
  category: string
  escalated_to_tier: number
  escalated_to_label: string
  breach_minutes: number
  hours_overdue: number
  note: string | null
  created_at: string
}

/** One point of GET /api/admin/heatmap. */
export interface HeatmapPoint {
  id: string
  latitude: number
  longitude: number
  weight: number
  category: string
  title: string
  urgency: number
}

export interface QueueFilters {
  department: string
  category: string
  status: string
  minUrgency: number
  slaRisk: boolean
}
