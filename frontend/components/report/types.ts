/** Response of POST /api/reports: either a new triaged report or a merge into an existing one. */
export type SubmitResult =
  | { merged: true; existing_id: string; corroboration_count: number; message: string; triage_source?: 'gemini' | 'rules' }
  | {
      merged: false
      triage_source?: 'gemini' | 'rules'
      id: string
      urgency: number
      category: string
      department: string
      ai_summary: string
      sla_deadline: string
      message: string
    }
