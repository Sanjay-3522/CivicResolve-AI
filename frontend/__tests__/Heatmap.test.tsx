import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { axe } from 'jest-axe'
import HeatmapPanel from '../components/HeatmapPanel'
import { drawHeatmap } from '../components/heatmap/drawHeatmap'
import { created } from '../__mocks__/leaflet'
import type L from 'leaflet'

const push = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: jest.fn() }) }))

const points = [
  {
    id: 'h1',
    latitude: 12.97,
    longitude: 77.59,
    weight: 12.5,
    category: 'water_leakage',
    title: 'Pipe <b>burst</b>',
    urgency: 5,
  },
  { id: 'h2', latitude: 12.95, longitude: 77.62, weight: 3, category: 'garbage', title: 'Bin overflow', urgency: 2 },
]
const analytics = {
  total_reports: 2,
  resolved_this_week: 0,
  avg_resolution_hours: 0,
  sla_breach_count: 0,
  by_department: {},
  by_status: {},
  by_category: { water_leakage: { total: 1, resolved: 1 }, garbage: { total: 0, resolved: 0 } },
}

function mockApi(status = 200) {
  const fetchMock = jest.fn((url: string) =>
    Promise.resolve({ ok: status < 400, status, json: async () => (url.includes('heatmap') ? points : analytics) }),
  )
  global.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}

describe('Hotspot heatmap', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    created.markers.length = 0
  })

  it('describes the heatmap as an image and lists hotspots in a text table', async () => {
    mockApi()
    render(<HeatmapPanel />)
    const img = await screen.findByRole('img', { name: /showing 2 issues/ })
    expect(img).toHaveAccessibleName(expect.stringContaining('Highest-weight hotspot: Pipe <b>burst</b>'))
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('row')).toHaveLength(3)
    expect(within(table).getByText('12.5')).toBeInTheDocument()
    expect(screen.getByText('100%')).toBeInTheDocument()
    await waitFor(() => expect(created.markers).toHaveLength(2))
    expect(created.markers[0].popup).toContain('Pipe &lt;b&gt;burst&lt;/b&gt;')
  })

  it('toggles markers and filters by category', async () => {
    const fetchMock = mockApi()
    render(<HeatmapPanel />)
    await waitFor(() => expect(created.markers).toHaveLength(2))
    fireEvent.click(screen.getByLabelText('Show markers'))
    const water = screen.getByRole('button', { name: /water leakage/ })
    fireEvent.click(water)
    expect(water).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(fetchMock.mock.calls.some(c => c[0].includes('category=water_leakage'))).toBe(true))
  })

  it('redirects to login on 401', async () => {
    mockApi(401)
    render(<HeatmapPanel />)
    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/login'))
  })

  it('describes an empty result', async () => {
    global.fetch = jest.fn((url: string) =>
      Promise.resolve({ ok: true, status: 200, json: async () => (url.includes('heatmap') ? [] : analytics) }),
    ) as unknown as typeof fetch
    render(<HeatmapPanel />)
    expect(await screen.findByRole('img', { name: /No issues match/ })).toBeInTheDocument()
  })

  it('has no detectable accessibility violations', async () => {
    mockApi()
    const { container } = render(<HeatmapPanel />)
    await screen.findByRole('img', { name: /showing 2 issues/ })
    expect(await axe(container)).toHaveNoViolations()
  })

  it('drawHeatmap paints one radial gradient per point', () => {
    const gradient = { addColorStop: jest.fn() }
    const ctx = {
      clearRect: jest.fn(),
      createRadialGradient: jest.fn(() => gradient),
      beginPath: jest.fn(),
      arc: jest.fn(),
      fill: jest.fn(),
      fillStyle: '',
    }
    const canvas = { width: 100, height: 100, getContext: () => ctx } as unknown as HTMLCanvasElement
    const map = { latLngToContainerPoint: ([lat, lng]: [number, number]) => ({ x: lng, y: lat }) } as unknown as L.Map
    drawHeatmap(canvas, [...points, { ...points[1], category: 'unknown' }], map)
    expect(ctx.fill).toHaveBeenCalledTimes(3)
    expect(gradient.addColorStop).toHaveBeenCalledWith(0, 'rgba(37,99,235,0.7)')
    drawHeatmap({ getContext: () => null } as unknown as HTMLCanvasElement, points, map)
  })
})
