'use client'
import { BULK_STATUSES } from './constants'

interface BulkActionBarProps {
  selectedCount: number
  status: string
  note: string
  updating: boolean
  onStatusChange: (status: string) => void
  onNoteChange: (note: string) => void
  onApply: () => void
  onClear: () => void
}

/** Shown when one or more queue rows are selected. */
export default function BulkActionBar(props: BulkActionBarProps) {
  const { selectedCount, status, note, updating, onStatusChange, onNoteChange, onApply, onClear } = props
  if (selectedCount === 0) return null

  return (
    <div
      className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3 flex-wrap"
      role="region"
      aria-label="Bulk actions"
    >
      <span className="text-sm font-semibold text-blue-700">{selectedCount} selected</span>
      <label htmlFor="bulk-status" className="sr-only">
        New status for selected reports
      </label>
      <select
        id="bulk-status"
        value={status}
        onChange={e => onStatusChange(e.target.value)}
        className="text-sm border border-blue-200 rounded-lg px-3 py-2 bg-white"
      >
        <option value="">Change Status To…</option>
        {BULK_STATUSES.map(s => (
          <option key={s}>{s}</option>
        ))}
      </select>
      <label htmlFor="bulk-note" className="sr-only">
        Optional note for the timeline
      </label>
      <input
        id="bulk-note"
        value={note}
        maxLength={500}
        onChange={e => onNoteChange(e.target.value)}
        placeholder="Optional note…"
        className="text-sm border border-blue-200 rounded-lg px-3 py-2 bg-white flex-1 min-w-[150px]"
      />
      <button
        onClick={onApply}
        disabled={updating || !status}
        aria-busy={updating}
        className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
      >
        {updating ? 'Updating…' : 'Apply'}
      </button>
      <button onClick={onClear} className="text-sm text-gray-600 hover:text-gray-800">
        Clear
      </button>
    </div>
  )
}
