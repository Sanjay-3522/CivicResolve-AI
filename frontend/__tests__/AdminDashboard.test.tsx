import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { axe } from 'jest-axe'
import AdminPage from '../app/admin/page'

const push = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: jest.fn() }) }))

const queue = [
  {
    id: 'r1',
    title: 'Exposed wires near school',
    category: 'streetlight',
    status: 'reported',
    urgency: 5,
    department: 'BESCOM',
    address: 'MG Road',
    upvote_count: 3,
    corroboration_count: 2,
    sla_deadline: new Date(Date.now() - 3600000).toISOString(),
    escalation_tier: 2,
    escalation_tier_label: 'Zonal Commissioner',
    created_at: new Date().toISOString(),
    ai_summary: 'Critical electrical hazard',
    escalation_flags: ['near_electrical'],
    sla_breached: true,
    minutes_overdue: 120,
  },
  {
    id: 'r2',
    title: 'Overflowing bin',
    category: 'garbage',
    status: 'acknowledged',
    urgency: 2,
    department: 'BBMP',
    address: null,
    upvote_count: 0,
    corroboration_count: 0,
    sla_deadline: null,
    escalation_tier: 1,
    escalation_tier_label: 'Ward Officer',
    created_at: new Date().toISOString(),
    ai_summary: null,
    escalation_flags: [],
    sla_breached: false,
    minutes_overdue: null,
  },
]
const analytics = {
  total_reports: 2,
  resolved_this_week: 0,
  avg_resolution_hours: 0,
  by_category: { streetlight: { total: 1, resolved: 0 } },
  by_department: {},
  by_status: { reported: 1 },
  sla_breach_count: 1,
}
const slaLog = [
  {
    id: 1,
    report_id: 'r1',
    report_title: 'Exposed wires near school',
    category: 'streetlight',
    escalated_to_tier: 2,
    escalated_to_label: 'Zonal Commissioner',
    breach_minutes: 120,
    hours_overdue: 2,
    note: 'Breached',
    created_at: new Date().toISOString(),
  },
]

const json = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body })

function mockApi(overrides: Record<string, () => Promise<unknown>> = {}) {
  const fetchMock = jest.fn((url: string, _init?: RequestInit) => {
    for (const [prefix, handler] of Object.entries(overrides)) if (url.startsWith(prefix)) return handler()
    if (url.startsWith('/api/admin/queue')) return json(queue)
    if (url.startsWith('/api/admin/analytics')) return json(analytics)
    if (url.startsWith('/api/admin/sla-log')) return json(slaLog)
    return json({})
  })
  global.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}

describe('Admin dashboard', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders the queue as a captioned table with labelled row checkboxes', async () => {
    mockApi()
    render(<AdminPage />)
    const table = await screen.findByRole('table')
    expect(within(table).getByText(/Report queue: 2 reports/i)).toBeInTheDocument()
    expect(within(table).getAllByRole('columnheader')).toHaveLength(3)
    expect(screen.getByRole('checkbox', { name: 'Select report Exposed wires near school' })).toBeInTheDocument()
    expect(screen.getByText(/SLA breached · 2h overdue/)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Loaded 2 reports.')
  })

  it('sends admin requests with same-origin credentials', async () => {
    const fetchMock = mockApi()
    render(<AdminPage />)
    await screen.findByRole('table')
    for (const call of fetchMock.mock.calls) expect(call[1]).toMatchObject({ credentials: 'same-origin' })
  })

  it('redirects to login (and clears the session) on 401', async () => {
    const fetchMock = mockApi({ '/api/admin/queue': () => json({ detail: 'Unauthorized' }, 401) })
    render(<AdminPage />)
    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/login'))
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/logout', expect.objectContaining({ method: 'POST' }))
  })

  it('supports arrow-key navigation between tabs', async () => {
    mockApi()
    render(<AdminPage />)
    await screen.findByRole('table')
    const queueTab = screen.getByRole('tab', { name: /Queue/ })
    expect(queueTab).toHaveAttribute('aria-selected', 'true')
    queueTab.focus()
    fireEvent.keyDown(queueTab, { key: 'ArrowRight' })
    const analyticsTab = screen.getByRole('tab', { name: /Analytics/ })
    expect(analyticsTab).toHaveAttribute('aria-selected', 'true')
    expect(analyticsTab).toHaveFocus()
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'tab-analytics')
    fireEvent.keyDown(analyticsTab, { key: 'End' })
    expect(screen.getByRole('tab', { name: /SLA Breaches/ })).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(screen.getByRole('tab', { name: /SLA Breaches/ }), { key: 'ArrowRight' })
    expect(queueTab).toHaveAttribute('aria-selected', 'true')
  })

  it('announces the result of a bulk update', async () => {
    mockApi({ '/api/admin/reports/bulk-status': () => json({ updated: 1 }) })
    render(<AdminPage />)
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select report Overflowing bin' }))
    fireEvent.change(screen.getByLabelText('New status for selected reports'), { target: { value: 'in_progress' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Updated 1 reports to in progress.'))
  })

  it('announces the SLA check result', async () => {
    mockApi({ '/api/admin/trigger-sla-check': () => json({ message: 'ok' }) })
    render(<AdminPage />)
    await screen.findByRole('table')
    fireEvent.click(screen.getByRole('button', { name: /Trigger SLA Check/ }))
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('SLA check complete. 1 reports in breach.'),
    )
  })

  it.each(['queue', 'analytics', 'sla'])('has no detectable accessibility violations (%s tab)', async tab => {
    mockApi()
    const { container } = render(<AdminPage />)
    await screen.findByRole('table')
    if (tab !== 'queue')
      fireEvent.click(screen.getByRole('tab', { name: tab === 'sla' ? /SLA Breaches/ : /Analytics/ }))
    expect(await axe(container)).toHaveNoViolations()
  })
})
