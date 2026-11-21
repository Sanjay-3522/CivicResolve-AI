import { NOTE_MAX } from '../report/validation'

interface ReopenFormProps {
  reason: string
  submitting: boolean
  onReasonChange: (reason: string) => void
  onSubmit: () => void
  onCancel: () => void
}

/** Citizen's 72-hour "issue not fixed" form. */
export default function ReopenForm({ reason, submitting, onReasonChange, onSubmit, onCancel }: ReopenFormProps) {
  return (
    <div className="bg-orange-50 border border-orange-200 rounded-2xl p-6 space-y-3">
      <h3 className="font-semibold text-orange-900">
        <label htmlFor="reopen-reason">Why should this be reopened?</label>
      </h3>
      <textarea
        id="reopen-reason"
        maxLength={NOTE_MAX}
        value={reason}
        onChange={e => onReasonChange(e.target.value)}
        placeholder="Describe why the issue is still present..."
        rows={3}
        className="w-full px-3 py-2 rounded-xl border border-orange-200 focus:outline-none focus:ring-2 focus:ring-orange-400 text-sm bg-white"
      />
      <div className="flex gap-2">
        <button
          onClick={onSubmit}
          disabled={submitting || !reason.trim()}
          className="flex-1 bg-orange-600 text-white py-2 rounded-xl font-semibold hover:bg-orange-700 disabled:opacity-50"
        >
          {submitting ? 'Submitting…' : 'Reopen Report'}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
