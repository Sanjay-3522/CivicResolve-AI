'use client'
import Link from 'next/link'
import type { SlaLogEntry } from './types'

/** Public transparency log of SLA breaches. */
export default function SlaLogPanel({ entries }: { entries: SlaLogEntry[] }) {
  return (
    <div className="space-y-4">
      <div className="bg-red-50 border border-red-200 rounded-xl p-4">
        <h2 className="font-semibold text-red-900 mb-1">
          <span aria-hidden="true">⚠️ </span>Public Transparency Log
        </h2>
        <p className="text-sm text-red-700">
          SLA breaches are logged publicly. This creates accountability — citizens can see when the municipality fails
          to respond within committed timelines.
        </p>
      </div>
      {entries.length === 0 ? (
        <div className="text-center py-16 text-gray-600">
          <p className="text-4xl mb-3" aria-hidden="true">
            ✅
          </p>
          <p>No SLA breaches recorded</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {entries.map(b => (
            <li key={b.id} className="bg-white rounded-xl border border-red-200 shadow-sm p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-gray-900">{b.report_title}</span>
                    <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{b.category}</span>
                  </div>
                  <p className="text-sm text-red-700">{b.note}</p>
                  <p className="text-xs text-gray-600 mt-1">
                    {new Date(b.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-lg font-black text-red-700">{b.hours_overdue}h</p>
                  <p className="text-xs text-gray-600">overdue</p>
                  <p className="text-xs text-gray-600 mt-1">→ {b.escalated_to_label}</p>
                </div>
              </div>
              <Link href={`/track/${b.report_id}`} className="mt-2 inline-block text-xs text-blue-700 hover:underline">
                View Report<span className="sr-only">: {b.report_title}</span> →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
