'use client'
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
// Loaded with this lazily imported (ssr: false) chunk, not on every page.
import 'leaflet/dist/leaflet.css'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { adminFetch, clearAdminSession } from '../lib/auth'
import { escapeHtml } from '../lib/escapeHtml'
import type { Analytics, HeatmapPoint } from './admin/types'
import HeatmapSidebar from './heatmap/HeatmapSidebar'
import { CATEGORY_COLORS, drawHeatmap } from './heatmap/drawHeatmap'

export default function HeatmapPanel() {
  const router = useRouter()
  const mapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const [points, setPoints] = useState<HeatmapPoint[]>([])
  const [filterCategory, setFilterCategory] = useState('')
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [showDots, setShowDots] = useState(true)
  const markersRef = useRef<L.LayerGroup | null>(null)

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return

    const map = L.map(mapRef.current).setView([12.95, 77.62], 12)
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

    markersRef.current = L.layerGroup().addTo(map)

    // Overlay canvas for heatmap
    const overlayPane = map.getPanes().overlayPane
    const canvas = document.createElement('canvas')
    canvas.style.position = 'absolute'
    canvas.style.top = '0'
    canvas.style.left = '0'
    canvas.style.pointerEvents = 'none'
    canvas.style.zIndex = '400'
    canvas.style.borderRadius = '8px'
    canvas.setAttribute('aria-hidden', 'true') // described by the role="img" wrapper + text table
    overlayPane.appendChild(canvas)
    canvasRef.current = canvas

    const resize = () => {
      const rect = mapRef.current?.getBoundingClientRect()
      if (rect && canvas) {
        canvas.width = rect.width
        canvas.height = rect.height
      }
    }
    resize()

    map.on('moveend zoomend resize', () => resize())
    new ResizeObserver(resize).observe(mapRef.current!)

    return () => {
      map.remove()
      mapInstanceRef.current = null
    }
  }, [])

  const fetchData = async () => {
    const params = new URLSearchParams()
    if (filterCategory) params.set('category', filterCategory)

    try {
      const [resH, resA] = await Promise.all([
        adminFetch(`/api/admin/heatmap?${params}`),
        adminFetch('/api/admin/analytics'),
      ])

      if (resH.status === 401 || resA.status === 401) {
        await clearAdminSession()
        router.push('/admin/login')
        return
      }

      setPoints(await resH.json())
      setAnalytics(await resA.json())
    } catch (err) {
      console.error('Heatmap fetch error:', err)
    }
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch only when these inputs change
  }, [filterCategory])

  useEffect(() => {
    if (!mapInstanceRef.current || !canvasRef.current) return

    const map = mapInstanceRef.current
    const canvas = canvasRef.current

    // Draw heatmap
    const render = () => drawHeatmap(canvas, points, map)
    render()
    map.on('moveend zoomend', render)

    // Add dot markers
    if (markersRef.current) {
      markersRef.current.clearLayers()
      if (showDots) {
        points.forEach(p => {
          const color = CATEGORY_COLORS[p.category] || '#6B7280'
          const size = Math.max(6, Math.min(18, p.weight * 1.5))
          const icon = L.divIcon({
            className: '',
            html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>`,
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
          })
          L.marker([p.latitude, p.longitude], { icon })
            .bindPopup(
              `<b>${escapeHtml(p.title)}</b><br>P${escapeHtml(p.urgency)} · ${escapeHtml(p.category)}<br><a href="/track/${encodeURIComponent(p.id)}" style="color:#1D4ED8;font-size:12px">View →</a>`,
            )
            .addTo(markersRef.current!)
        })
      }
    }

    return () => {
      map.off('moveend zoomend', render)
    }
  }, [points, showDots])

  const hotspots = [...points].sort((a, b) => b.weight - a.weight).slice(0, 5)
  const mapDescription =
    points.length === 0
      ? 'Issue heatmap of Bengaluru. No issues match the current filter.'
      : `Issue heatmap of Bengaluru showing ${points.length} issues${filterCategory ? ` in category ${filterCategory.replace('_', ' ')}` : ''}. ` +
        `Highest-weight hotspot: ${hotspots[0].title} (${hotspots[0].category.replace('_', ' ')}, P${hotspots[0].urgency}). ` +
        'A text list of the top hotspots follows.'

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Dark header */}
      <div className="bg-gray-900 border-b border-gray-700 px-6 py-4 flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Link href="/admin" className="text-gray-300 hover:text-white text-sm">
              ← Admin
            </Link>
            <span className="text-gray-400" aria-hidden="true">
              /
            </span>
            <h1 className="text-white font-bold text-lg">🔥 Issue Heatmap</h1>
          </div>
          <p className="text-gray-300 text-sm mt-0.5">Hotspot intensity = urgency × corroboration weight</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-1" role="group" aria-label="Filter heatmap by category">
            {Object.keys(CATEGORY_COLORS).map(cat => (
              <button
                key={cat}
                aria-pressed={filterCategory === cat}
                onClick={() => setFilterCategory(filterCategory === cat ? '' : cat)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-all ${filterCategory === cat ? 'border-current' : 'border-gray-600 text-gray-300 hover:border-gray-400'}`}
                style={
                  filterCategory === cat
                    ? {
                        backgroundColor: CATEGORY_COLORS[cat] + '30',
                        color: CATEGORY_COLORS[cat],
                        borderColor: CATEGORY_COLORS[cat],
                      }
                    : {}
                }
              >
                {filterCategory === cat && <span aria-hidden="true">✓ </span>}
                {cat.replace('_', ' ')}
              </button>
            ))}
          </div>
          <label
            htmlFor="heatmap-show-markers"
            className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer"
          >
            <input
              id="heatmap-show-markers"
              type="checkbox"
              checked={showDots}
              onChange={e => setShowDots(e.target.checked)}
              className="rounded"
            />
            Show markers
          </label>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <HeatmapSidebar points={points} hotspots={hotspots} analytics={analytics} />

        {/* Map */}
        <div className="flex-1 relative">
          <div role="img" aria-label={mapDescription} className="absolute inset-0 pointer-events-none z-0" />
          <div ref={mapRef} style={{ height: '100%', width: '100%' }} />
          <table className="sr-only">
            <caption>Top {hotspots.length} hotspots by weight (urgency × corroboration)</caption>
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Issue</th>
                <th scope="col">Category</th>
                <th scope="col">Urgency</th>
                <th scope="col">Weight</th>
                <th scope="col">Coordinates</th>
              </tr>
            </thead>
            <tbody>
              {hotspots.map((p, i) => (
                <tr key={p.id}>
                  <td>{i + 1}</td>
                  <td>{p.title}</td>
                  <td>{p.category.replace('_', ' ')}</td>
                  <td>P{p.urgency}</td>
                  <td>{p.weight.toFixed(1)}</td>
                  <td>
                    {p.latitude.toFixed(4)}, {p.longitude.toFixed(4)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
