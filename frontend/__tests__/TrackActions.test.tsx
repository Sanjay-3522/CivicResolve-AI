import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import TrackPage from '../app/track/[id]/page'

const push = jest.fn()
jest.mock('next/navigation', () => ({ useParams: () => ({ id: 'r1' }), useRouter: () => ({ push }) }))

const base = {
  id: 'r1',
  title: 'Pipe burst',
  description: 'Flooded road',
  category: 'water_leakage',
  status: 'resolved',
  urgency: 3,
  department: 'BWSSB',
  address: null,
  latitude: 12.9716,
  longitude: 77.5946,
  upvote_count: 1,
  corroboration_count: 0,
  nearby_count: 0,
  reopen_count: 1,
  escalation_tier: 2,
  escalation_flags: [],
  escalated_at: '2026-11-20T10:00:00',
  reopen_deadline: new Date(Date.now() + 5 * 3600000).toISOString(),
  resolution_confidence: 0.5,
  resolution_reasoning: 'Partially fixed',
  urgency_reasoning: 'Water near road',
  ai_summary: 'Water leak',
  sla_deadline: new Date(Date.now() - 3600000).toISOString(),
  timelines: [],
  sla_breaches: [],
  corroborations: [],
}

describe('Track page actions', () => {
  beforeEach(() => jest.clearAllMocks())

  it('upvotes and refreshes the count', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => base })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...base, upvote_count: 2 }) })
    global.fetch = fetchMock as unknown as typeof fetch
    render(<TrackPage />)
    fireEvent.click(await screen.findByRole('button', { name: /upvote this report \(currently 1/ }))
    expect(await screen.findByRole('button', { name: /currently 2 upvotes/ })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/reports/r1/upvote', { method: 'POST' })
    expect(screen.getByText('12.9716, 77.5946', { exact: false })).toBeInTheDocument()
    expect(screen.getByText(/Low confidence/)).toBeInTheDocument()
  })

  it('lets a citizen reopen within the 72h window with a reason', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => base })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...base, status: 'reopened', reopen_count: 2 }) })
    global.fetch = fetchMock as unknown as typeof fetch
    render(<TrackPage />)
    fireEvent.click(await screen.findByRole('button', { name: /Issue Not Fixed \(5h left\)/ }))
    const reason = screen.getByLabelText('Why should this be reopened?')
    fireEvent.change(reason, { target: { value: 'Still leaking' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reopen Report' }))
    await waitFor(() => expect(screen.queryByLabelText('Why should this be reopened?')).not.toBeInTheDocument())
    const form = fetchMock.mock.calls[1][1].body as FormData
    expect(form.get('reason')).toBe('Still leaking')
    expect(await screen.findByText(/Reopened 2×/)).toBeInTheDocument()
  })

  it('cancels the reopen form', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => base }) as unknown as typeof fetch
    render(<TrackPage />)
    fireEvent.click(await screen.findByRole('button', { name: /Issue Not Fixed/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByLabelText('Why should this be reopened?')).not.toBeInTheDocument()
  })

  it('shows a not-found state', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch
    render(<TrackPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Back to home' }))
    expect(push).toHaveBeenCalledWith('/')
  })
})
