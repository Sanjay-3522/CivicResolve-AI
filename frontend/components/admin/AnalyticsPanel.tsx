'use client'
import Link from 'next/link'
import { STATUS_COLORS, humanize } from './constants'
import type { Analytics } from './types'

/** Category resolution rates, status counts and a heatmap link. */
export default function AnalyticsPanel({ analytics }: { analytics: Analytics }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <section
          className="bg-white rounded-xl border border-gray-200 shadow-sm p-5"
          aria-labelledby="by-category-heading"
        >
          <h2 id="by-category-heading" className="font-semibold text-gray-900 mb-4">
            <span aria-hidden="true">📊 </span>By Category
          </h2>
          <div className="space-y-3">
            {Object.entries(analytics.by_category).map(([cat, stats]) => {
              const pct = stats.total > 0 ? Math.round((stats.resolved / stats.total) * 100) : 0
              return (
                <div key={cat}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium capitalize text-gray-700">{humanize(cat)}</span>
                    <span className="text-gray-600">
                      {stats.resolved}/{stats.total} resolved ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden" aria-hidden="true">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </section>
        <section
          className="bg-white rounded-xl border border-gray-200 shadow-sm p-5"
          aria-labelledby="by-status-heading"
        >
          <h2 id="by-status-heading" className="font-semibold text-gray-900 mb-4">
            <span aria-hidden="true">📈 </span>By Status
          </h2>
          <div className="space-y-2">
            {Object.entries(analytics.by_status).map(([status, count]) => (
              <div key={status} className="flex justify-between items-center">
                <span
                  className={`text-xs px-2 py-1 rounded-full ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-700'}`}
                >
                  {humanize(status)}
                </span>
                <span className="font-semibold text-gray-800">{count}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h2 className="font-semibold text-gray-900 mb-2">
          <span aria-hidden="true">🗺️ </span>Hotspot Heatmap
        </h2>
        <p className="text-sm text-gray-600 mb-3">View the full interactive heatmap with intensity clustering.</p>
        <Link
          href="/admin/heatmap"
          className="inline-block bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700"
        >
          Open Heatmap →
        </Link>
      </section>
    </div>
  )
}
