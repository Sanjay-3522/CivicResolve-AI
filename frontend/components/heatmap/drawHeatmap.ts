import type L from 'leaflet'
import type { HeatmapPoint } from '../admin/types'

export const CATEGORY_COLORS: Record<string, string> = {
  pothole: '#D97706',
  garbage: '#16A34A',
  streetlight: '#CA8A04',
  water_leakage: '#2563EB',
  road_damage: '#DC2626',
  other: '#6B7280',
}

/** Paint radial "halo" gradients for each point onto the overlay canvas. */
export function drawHeatmap(canvas: HTMLCanvasElement, points: HeatmapPoint[], map: L.Map) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.clearRect(0, 0, canvas.width, canvas.height)

  points.forEach(p => {
    const pt = map.latLngToContainerPoint([p.latitude, p.longitude])
    const radius = Math.min(80, 20 + p.weight * 4)
    const color = CATEGORY_COLORS[p.category] || '#6B7280'

    // Parse hex to rgb
    const r = parseInt(color.slice(1, 3), 16)
    const g = parseInt(color.slice(3, 5), 16)
    const b = parseInt(color.slice(5, 7), 16)

    const gradient = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, radius)
    gradient.addColorStop(0, `rgba(${r},${g},${b},0.7)`)
    gradient.addColorStop(0.4, `rgba(${r},${g},${b},0.4)`)
    gradient.addColorStop(1, `rgba(${r},${g},${b},0)`)

    ctx.beginPath()
    ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2)
    ctx.fillStyle = gradient
    ctx.fill()
  })
}
