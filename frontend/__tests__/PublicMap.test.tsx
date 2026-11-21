import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { axe } from 'jest-axe'
import PublicMapView from '../components/PublicMapView'
import { created } from '../__mocks__/leaflet'

const reports = [
  {
    id: 'r<1>',
    title: '<img src=x onerror=alert(1)>Pothole',
    category: 'pothole',
    status: 'in_progress',
    urgency: 4,
    department: 'PWD',
    latitude: 12.97,
    longitude: 77.59,
    ai_summary: 'Deep & dangerous',
    upvote_count: 2,
    corroboration_count: 3,
  },
  {
    id: 'r2',
    title: 'Dark street',
    category: 'streetlight',
    status: 'verified',
    urgency: 2,
    department: null,
    latitude: 12.98,
    longitude: 77.6,
    ai_summary: null,
    upvote_count: 0,
    corroboration_count: 0,
  },
]

describe('Public issue map', () => {
  let fetchMock: jest.Mock
  beforeEach(() => {
    created.markers.length = 0
    fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => reports })
    global.fetch = fetchMock as unknown as typeof fetch
  })

  it('renders one marker per reported issue with HTML-escaped popups', async () => {
    render(<PublicMapView />)
    await waitFor(() => expect(created.markers).toHaveLength(2))
    const popup = created.markers[0].popup
    expect(popup).toContain('&lt;img src=x onerror=alert(1)&gt;Pothole')
    expect(popup).not.toContain('<img src=x')
    expect(popup).toContain('Deep &amp; dangerous')
    expect(popup).toContain('/track/r%3C1%3E')
    expect(popup).toContain('🔗 3 merged')
    expect(screen.getByRole('status')).toHaveTextContent('2 issues')
  })

  it('filters by category (aria-pressed) and status', async () => {
    render(<PublicMapView />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const pothole = screen.getByRole('button', { name: /pothole/ })
    fireEvent.click(pothole)
    expect(pothole).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(fetchMock.mock.calls.at(-1)[0]).toContain('category=pothole'))
    fireEvent.change(screen.getByLabelText('Filter map by status'), { target: { value: 'resolved' } })
    await waitFor(() => expect(fetchMock.mock.calls.at(-1)[0]).toContain('status=resolved'))
    fireEvent.click(pothole)
    expect(pothole).toHaveAttribute('aria-pressed', 'false')
  })

  it('has no detectable accessibility violations', async () => {
    const { container } = render(<PublicMapView />)
    await waitFor(() => expect(created.markers.length).toBeGreaterThan(0))
    expect(await axe(container)).toHaveNoViolations()
  })
})
