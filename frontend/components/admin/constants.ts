export const URGENCY_COLORS = [
  '',
  'bg-green-100 text-green-800',
  'bg-yellow-100 text-yellow-800',
  'bg-orange-100 text-orange-800',
  'bg-red-100 text-red-800',
  'bg-red-200 text-red-900 font-bold',
]
export const URGENCY_LABELS = ['', 'Very low', 'Low', 'Medium', 'High', 'Critical']

export const STATUS_COLORS: Record<string, string> = {
  reported: 'bg-gray-100 text-gray-700',
  acknowledged: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-yellow-100 text-yellow-800',
  resolved: 'bg-green-100 text-green-800',
  verified: 'bg-green-200 text-green-800',
  flagged: 'bg-orange-100 text-orange-800',
  reopened: 'bg-red-100 text-red-700',
}

export const FLAG_ICONS: Record<string, string> = {
  near_electrical: '⚡',
  near_school: '🏫',
  near_hospital: '🏥',
  high_traffic: '🚗',
  flooding_risk: '🌊',
  structural_risk: '🏗️',
}

export const DEPARTMENTS = ['PWD', 'BESCOM', 'BBMP', 'BWSSB', 'Traffic', 'General']
export const CATEGORIES = ['pothole', 'garbage', 'streetlight', 'water_leakage', 'road_damage', 'other']
export const FILTER_STATUSES = [
  'reported',
  'acknowledged',
  'in_progress',
  'resolved',
  'verified',
  'flagged',
  'reopened',
]
export const BULK_STATUSES = ['acknowledged', 'in_progress', 'resolved', 'verified']
export const ROW_STATUSES = ['acknowledged', 'in_progress', 'resolved']

export const humanize = (s: string) => s.replace('_', ' ')
