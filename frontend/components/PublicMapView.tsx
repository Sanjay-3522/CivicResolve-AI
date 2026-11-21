'use client'
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
// Loaded with this lazily imported (ssr: false) chunk, not on every page.
import 'leaflet/dist/leaflet.css'
import { escapeHtml } from '../lib/escapeHtml'

/** Subset of GET /api/reports fields used by the public map. */
interface PublicReport {
  id: string
  title: string
  category: string
  status: string
  urgency: number
  department: string | null
  latitude: number
  longitude: number
  ai_summary: string | null
  upvote_count: number
  corroboration_count: number
}

const CATEGORY_COLORS: Record<string, string> = {
  pothole: '#D97706',
  garbage: '#16A34A',
  streetlight: '#CA8A04',
  water_leakage: '#2563EB',
  road_damage: '#DC2626',
  other: '#6B7280',
}
const URGENCY_SIZES = [0, 8, 10, 13, 16, 20]

function createMarkerIcon(category: string, urgency: number): L.DivIcon {
  const color = CATEGORY_COLORS[category] || '#6B7280'
  const size = URGENCY_SIZES[urgency] || 12
  return L.divIcon({
    className: '',
    html: `<div style="width:${size * 2}px;height:${size * 2}px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);opacity:0.9;"></div>`,
    iconSize: [size * 2, size * 2],
    iconAnchor: [size, size],
  })
}

export default function PublicMapView() {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const [reports, setReports] = useState<PublicReport[]>([])
  const [filterCategory, setFilterCategory] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return
    const map = L.map(mapRef.current).setView([12.9716, 77.5946], 12)
    mapInstanceRef.current = map

    delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(map)

    return () => {
      map.remove()
      mapInstanceRef.current = null
    }
  }, [])

  const fetchAndRender = async () => {
    const params = new URLSearchParams({ limit: '200' })
    if (filterCategory) params.set('category', filterCategory)
    if (filterStatus) params.set('status', filterStatus)
    const res = await fetch(`/api/reports?${params}`)
    const data: PublicReport[] = await res.json()
    setReports(data)

    if (!mapInstanceRef.current) return
    const map = mapInstanceRef.current
    // Clear existing markers
    map.eachLayer(layer => {
      if (layer instanceof L.Marker || layer instanceof L.CircleMarker) map.removeLayer(layer)
    })

    data.forEach(r => {
      const icon = createMarkerIcon(r.category, r.urgency)
      const marker = L.marker([r.latitude, r.longitude], { icon })
      const statusClass =
        r.status === 'verified' ? '✅' : r.status === 'in_progress' ? '🔧' : r.status === 'reopened' ? '🔄' : '📌'
      marker.bindPopup(`
        <div style="min-width:200px;font-family:sans-serif">
          <p style="font-size:11px;color:#4B5563;margin:0 0 4px">${statusClass} ${escapeHtml(r.status?.toUpperCase().replace('_', ' '))}</p>
          <p style="font-weight:700;font-size:14px;margin:0 0 4px;color:#111">${escapeHtml(r.title)}</p>
          <p style="font-size:12px;color:#374151;margin:0 0 8px">${escapeHtml(r.ai_summary || '')}</p>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
            <span style="font-size:11px;background:#EEF2FF;color:#4338CA;padding:2px 8px;border-radius:999px">P${escapeHtml(r.urgency)}</span>
            <span style="font-size:11px;background:#F3F4F6;color:#374151;padding:2px 8px;border-radius:999px">${escapeHtml(r.department || '')}</span>
            <span style="font-size:11px;background:#F3F4F6;color:#374151;padding:2px 8px;border-radius:999px">👍 ${escapeHtml(r.upvote_count)}</span>
            ${r.corroboration_count > 0 ? `<span style="font-size:11px;background:#EFF6FF;color:#1D4ED8;padding:2px 8px;border-radius:999px">🔗 ${escapeHtml(r.corroboration_count)} merged</span>` : ''}
          </div>
          <a href="/track/${encodeURIComponent(r.id)}" style="display:block;text-align:center;background:#2563EB;color:white;padding:6px;border-radius:8px;font-size:12px;font-weight:600;text-decoration:none">View Details →</a>
        </div>
      `)
      marker.addTo(map)
    })
  }

  useEffect(() => {
    fetchAndRender()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch only when these inputs change
  }, [filterCategory, filterStatus])

  const statuses = ['', 'reported', 'acknowledged', 'in_progress', 'resolved', 'verified', 'reopened']

  return (
    <div className="h-full flex flex-col">
      {/* Filters bar */}
      <div className="bg-white border-b border-gray-100 px-4 py-2 flex gap-3 items-center flex-wrap">
        <div className="flex gap-2 flex-wrap" role="group" aria-label="Filter map by category">
          {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
            <button
              key={cat}
              aria-pressed={filterCategory === cat}
              onClick={() => setFilterCategory(filterCategory === cat ? '' : cat)}
              className={`text-xs px-3 py-1 rounded-full border transition-all ${filterCategory === cat ? 'border-current font-semibold' : 'border-gray-200 text-gray-600'}`}
              style={filterCategory === cat ? { backgroundColor: color + '20', color, borderColor: color } : {}}
            >
              {filterCategory === cat && <span aria-hidden="true">✓ </span>}
              {cat.replace('_', ' ')}
            </button>
          ))}
        </div>
        <label htmlFor="map-status-filter" className="sr-only">
          Filter map by status
        </label>
        <select
          id="map-status-filter"
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1 ml-auto"
        >
          {statuses.map(s => (
            <option key={s} value={s}>
              {s || 'All Statuses'}
            </option>
          ))}
        </select>
        <span className="text-xs text-gray-600" role="status" aria-live="polite">
          {reports.length} issues
        </span>
      </div>
      {/* Legend */}
      <div
        role="note"
        aria-label="Map legend"
        className="absolute bottom-8 left-4 z-[1000] bg-white rounded-xl shadow-lg border border-gray-200 p-3 text-xs space-y-1"
      >
        <p className="font-semibold text-gray-700 mb-2">Legend</p>
        {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
          <div key={cat} className="flex items-center gap-2">
            <div aria-hidden="true" className="w-3 h-3 rounded-full" style={{ backgroundColor: color }}></div>
            <span className="text-gray-600 capitalize">{cat.replace('_', ' ')}</span>
          </div>
        ))}
        <p className="text-gray-600 mt-2">Bigger dot = higher urgency</p>
      </div>
      <div
        ref={mapRef}
        role="region"
        aria-label={`Map of ${reports.length} reported issues. Marker size reflects urgency; open a marker for details, or use the report tracking pages.`}
        className="flex-1"
        style={{ position: 'relative' }}
      />
    </div>
  )
}
