/** Client-side mirror of the API's input bounds (backend/constants.py). */
export const TITLE_MIN = 3
export const TITLE_MAX = 120
export const DESCRIPTION_MIN = 10
export const DESCRIPTION_MAX = 2000
export const NOTE_MAX = 500

export type ReportField = 'title' | 'description' | 'location'
export type FieldErrors = Partial<Record<ReportField, string>>

export interface ReportDraft {
  title: string
  description: string
  hasLocation: boolean
}

/** Returns one message per invalid field, in on-screen order; empty object when valid. */
export function validateReport({ title, description, hasLocation }: ReportDraft): FieldErrors {
  const errors: FieldErrors = {}
  const t = title.trim()
  const d = description.trim()
  if (!t) errors.title = 'Please enter a title'
  else if (t.length < TITLE_MIN) errors.title = `Title must be at least ${TITLE_MIN} characters`
  if (!d) errors.description = 'Please describe the issue'
  else if (d.length < DESCRIPTION_MIN) errors.description = `Description must be at least ${DESCRIPTION_MIN} characters`
  if (!hasLocation) errors.location = 'Please select a location on the map'
  return errors
}

/** id of the input each error summary link points to. */
export const FIELD_TARGET: Record<ReportField, string> = {
  title: 'report-title',
  description: 'report-description',
  location: 'manual-latitude',
}
