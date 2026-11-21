import Link from 'next/link'
import type { Analytics, HeatmapPoint } from '../admin/types'
import { CATEGORY_COLORS } from './drawHeatmap'

interface HeatmapSidebarProps {
  points: HeatmapPoint[]
  hotspots: HeatmapPoint[]
  analytics: Analytics | null
}

/** Summary, top hotspots, legend and per-category resolution rate. */
export default function HeatmapSidebar({ points, hotspots, analytics }: HeatmapSidebarProps) {
  const totalWeight = points.reduce((sum, p) => sum + p.weight, 0)
  return (
    <aside
      aria-label="Heatmap summary"
      className="w-72 bg-gray-800 border-r border-gray-700 flex flex-col overflow-y-auto flex-shrink-0"
    >
      <div className="p-4 space-y-4">
        {/* Summary */}
        <div>
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-2">Summary</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-gray-700 rounded-lg p-3">
              <p className="text-2xl font-black text-white">{points.length}</p>
              <p className="text-xs text-gray-400">Total issues</p>
            </div>
            <div className="bg-gray-700 rounded-lg p-3">
              <p className="text-2xl font-black text-orange-300">{Math.round(totalWeight)}</p>
              <p className="text-xs text-gray-400">Risk score</p>
            </div>
          </div>
        </div>

        {/* Top 5 Hotspots */}
        <div>
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-2">🔥 Top Hotspots</p>
          <div className="space-y-2">
            {hotspots.map((p, i) => (
              <Link
                key={p.id}
                href={`/track/${p.id}`}
                className="block bg-gray-700 hover:bg-gray-600 rounded-lg p-3 transition-colors"
              >
                <div className="flex items-start gap-2">
                  <span className="text-orange-300 font-black text-sm w-5">#{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-xs font-semibold truncate">{p.title}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <div
                        aria-hidden="true"
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: CATEGORY_COLORS[p.category] }}
                      />
                      <span className="text-xs text-gray-300">
                        {p.category.replace('_', ' ')} · P{p.urgency}
                      </span>
                    </div>
                    <p className="text-xs text-orange-300 mt-0.5">Weight: {p.weight.toFixed(1)}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div>
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-2">Legend</p>
          {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
            <div key={cat} className="flex items-center gap-2 mb-1.5">
              <div aria-hidden="true" className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-xs text-gray-300 capitalize">{cat.replace('_', ' ')}</span>
            </div>
          ))}
          <p className="text-xs text-gray-300 mt-2">Halo size = urgency × (1 + corroborations)</p>
        </div>

        {/* By category breakdown */}
        {analytics && (
          <div>
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-2">Resolution Rate</p>
            {Object.entries(analytics.by_category).map(([cat, stats]) => {
              const pct = stats.total > 0 ? Math.round((stats.resolved / stats.total) * 100) : 0
              return (
                <div key={cat} className="mb-2">
                  <div className="flex justify-between text-xs text-gray-300 mb-0.5">
                    <span className="capitalize">{cat.replace('_', ' ')}</span>
                    <span>{pct}%</span>
                  </div>
                  <div aria-hidden="true" className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: CATEGORY_COLORS[cat] || '#6B7280' }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </aside>
  )
}
