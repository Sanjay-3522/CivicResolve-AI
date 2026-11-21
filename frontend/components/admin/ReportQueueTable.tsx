'use client'
import Link from 'next/link'
import { FLAG_ICONS, ROW_STATUSES, STATUS_COLORS, URGENCY_COLORS, URGENCY_LABELS, humanize } from './constants'
import type { QueueReport } from './types'

interface ReportQueueTableProps {
  reports: QueueReport[]
  selected: Set<string>
  onToggle: (id: string) => void
  pendingStatus: Record<string, string>
  onPendingStatusChange: (id: string, status: string) => void
  onApplyStatus: (id: string) => void
  updatingId: string | null
}

const formatSla = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' })

/**
 * Admin queue as a semantic table (caption + column headers for screen readers)
 * while each row keeps the original card appearance.
 */
export default function ReportQueueTable(props: ReportQueueTableProps) {
  const { reports, selected, onToggle, pendingStatus, onPendingStatusChange, onApplyStatus, updatingId } = props

  if (reports.length === 0) {
    return (
      <div className="text-center py-16 text-gray-600">
        <p className="text-4xl mb-3" aria-hidden="true">
          🎉
        </p>
        <p>No issues matching current filters</p>
      </div>
    )
  }

  return (
    <table className="w-full border-separate border-spacing-x-0 border-spacing-y-3 -my-3">
      <caption className="sr-only">
        Report queue: {reports.length} reports, highest urgency first. Select rows for bulk actions or update a
        row&apos;s status.
      </caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">Select</th>
          <th scope="col">Report</th>
          <th scope="col">Update status</th>
        </tr>
      </thead>
      <tbody>
        {reports.map(r => {
          const border = r.sla_breached ? 'border-red-300' : r.urgency >= 4 ? 'border-orange-200' : 'border-gray-200'
          const cell = `bg-white ${border} border-y shadow-sm align-top py-4`
          return (
            <tr key={r.id}>
              <td className={`${cell} border-l rounded-l-xl pl-4 pr-3 w-8`}>
                <input
                  type="checkbox"
                  checked={selected.has(r.id)}
                  onChange={() => onToggle(r.id)}
                  aria-label={`Select report ${r.title}`}
                  className="mt-1 rounded"
                />
              </td>
              <td className={`${cell} min-w-0`}>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${URGENCY_COLORS[r.urgency]}`}>
                    <span className="sr-only">Urgency </span>P{r.urgency}
                    <span className="sr-only"> ({URGENCY_LABELS[r.urgency]})</span>
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[r.status] || 'bg-gray-100 text-gray-700'}`}
                  >
                    <span className="sr-only">Status: </span>
                    {humanize(r.status)}
                  </span>
                  <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{r.department}</span>
                  <span className="text-xs bg-gray-50 text-gray-700 px-2 py-0.5 rounded-full">
                    {humanize(r.category)}
                  </span>
                  {r.escalation_flags?.map(f => (
                    <span
                      key={f}
                      role="img"
                      aria-label={`Risk: ${humanize(f)}`}
                      title={f}
                      className="text-xs bg-orange-50 text-orange-800 px-1.5 py-0.5 rounded-full"
                    >
                      {FLAG_ICONS[f] || '⚑'}
                    </span>
                  ))}
                  {r.sla_breached && (
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold">
                      <span aria-hidden="true">⚠️ </span>SLA breached · {Math.round((r.minutes_overdue || 0) / 60)}h
                      overdue
                    </span>
                  )}
                </div>
                <Link href={`/track/${r.id}`} className="font-semibold text-gray-900 hover:text-blue-700 text-sm">
                  {r.title}
                </Link>
                {r.ai_summary && <p className="text-xs text-purple-700 mt-0.5 italic">{r.ai_summary}</p>}
                <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-600">
                  <span>
                    <span aria-hidden="true">📍 </span>
                    {r.address || 'Unknown location'}
                  </span>
                  <span>
                    <span aria-hidden="true">👍 </span>
                    <span className="sr-only">Upvotes: </span>
                    {r.upvote_count}
                  </span>
                  {r.corroboration_count > 0 && (
                    <span className="text-blue-700">
                      <span aria-hidden="true">🔗 </span>
                      {r.corroboration_count} merged
                    </span>
                  )}
                  <span>
                    Tier {r.escalation_tier} — {r.escalation_tier_label}
                  </span>
                </div>
                {r.sla_deadline && (
                  <div
                    className={`mt-2 text-xs flex items-center gap-1 ${r.sla_breached ? 'text-red-700' : 'text-gray-600'}`}
                  >
                    <span aria-hidden="true">⏱️</span> SLA: {formatSla(r.sla_deadline)}
                  </div>
                )}
              </td>
              <td className={`${cell} border-r rounded-r-xl pr-4 pl-3 w-px whitespace-nowrap`}>
                <div className="flex items-center gap-2">
                  <label htmlFor={`row-status-${r.id}`} className="sr-only">
                    New status for {r.title}
                  </label>
                  <select
                    id={`row-status-${r.id}`}
                    value={pendingStatus[r.id] || ''}
                    onChange={e => onPendingStatusChange(r.id, e.target.value)}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1"
                  >
                    <option value="">Update…</option>
                    {ROW_STATUSES.map(s => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => onApplyStatus(r.id)}
                    disabled={!pendingStatus[r.id] || updatingId === r.id}
                    aria-label={`Apply status to ${r.title}`}
                    className="text-xs bg-blue-600 text-white px-2 py-1 rounded-lg disabled:opacity-30 hover:bg-blue-700"
                  >
                    {updatingId === r.id ? '…' : '✓'}
                  </button>
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
