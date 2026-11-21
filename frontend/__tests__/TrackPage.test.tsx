import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { axe } from 'jest-axe'
import TrackPage from '../app/track/[id]/page'

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'test-report-123' }),
  useRouter: () => ({
    push: jest.fn(),
    refresh: jest.fn(),
  }),
}))

describe('TrackPage Component', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders report details and timeline events correctly', async () => {
    const mockReport = {
      id: 'test-report-123',
      title: 'Water pipe leak on Richmond Road',
      description: 'Major leak near electrical substation',
      category: 'water_leakage',
      status: 'in_progress',
      urgency: 4,
      department: 'BWSSB',
      address: 'Richmond Road, Bengaluru',
      upvote_count: 12,
      corroboration_count: 2,
      nearby_count: 3,
      sla_deadline: new Date(Date.now() + 3600000 * 5).toISOString(),
      escalation_tier: 1,
      reopen_count: 0,
      escalation_flags: ['near_electrical'],
      timelines: [
        {
          id: 1,
          status: 'reported',
          note: 'AI triage complete',
          actor: 'system',
          created_at: new Date().toISOString(),
        },
        {
          id: 2,
          status: 'in_progress',
          note: 'Dispatched repair crew',
          actor: 'admin',
          created_at: new Date().toISOString(),
        },
      ],
      sla_breaches: [],
      corroborations: [],
    }

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => mockReport,
    }) as unknown as typeof fetch

    render(<TrackPage />)

    await waitFor(() => {
      expect(screen.getByText('Water pipe leak on Richmond Road')).toBeInTheDocument()
    })

    expect(screen.getByText('Status Timeline')).toBeInTheDocument()
    expect(screen.getByText('Dispatched repair crew')).toBeInTheDocument()
    expect(screen.getByText('P4')).toBeInTheDocument()

    // When in_progress, reopen button should NOT be shown
    expect(screen.queryByText(/Issue Not Fixed/i)).not.toBeInTheDocument()
  })

  it('shows reopen button only when status is resolved/verified and within 72h window', async () => {
    const futureDeadline = new Date(Date.now() + 3600000 * 24).toISOString() // 24h remaining
    const mockResolvedReport = {
      id: 'test-resolved-123',
      title: 'Pothole on 100ft road',
      description: 'Filled pothole',
      category: 'pothole',
      status: 'resolved',
      urgency: 3,
      department: 'PWD',
      address: 'Indiranagar, Bengaluru',
      upvote_count: 4,
      corroboration_count: 0,
      nearby_count: 1,
      reopen_deadline: futureDeadline,
      reopen_count: 0,
      escalation_flags: [],
      timelines: [
        {
          id: 1,
          status: 'resolved',
          note: 'Marked resolved with after photo',
          actor: 'admin',
          created_at: new Date().toISOString(),
        },
      ],
      sla_breaches: [],
      corroborations: [],
    }

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResolvedReport,
    }) as unknown as typeof fetch

    render(<TrackPage />)

    await waitFor(() => {
      expect(screen.getByText('Pothole on 100ft road')).toBeInTheDocument()
    })

    // Reopen button MUST be displayed because status is resolved and deadline is in the future
    const reopenBtn = screen.getByRole('button', { name: /Issue Not Fixed/i })
    expect(reopenBtn).toBeInTheDocument()
  })

  it('has no detectable accessibility violations', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'a11y-1',
        title: 'Broken streetlight',
        description: 'Dark at night',
        category: 'streetlight',
        status: 'verified',
        urgency: 3,
        department: 'BESCOM',
        address: 'Indiranagar',
        upvote_count: 1,
        corroboration_count: 1,
        nearby_count: 0,
        reopen_count: 0,
        escalation_tier: 1,
        reopen_deadline: new Date(Date.now() + 3600000).toISOString(),
        resolution_confidence: 0.9,
        before_image: './uploads/before_x.jpg',
        after_image: './uploads/after_x.jpg',
        escalation_flags: ['high_traffic'],
        timelines: [{ id: 1, status: 'verified', note: 'Fixed', actor: 'admin', created_at: new Date().toISOString() }],
        sla_breaches: [
          { id: 1, escalated_to_tier: 2, breach_minutes: 30, note: 'Late', created_at: new Date().toISOString() },
        ],
        corroborations: [
          {
            id: 'c1',
            title: 'Same light',
            description: 'Still dark',
            before_image: './uploads/c.jpg',
            address: null,
            created_at: null,
          },
        ],
      }),
    }) as unknown as typeof fetch
    const { container } = render(<TrackPage />)
    await waitFor(() => expect(screen.getByText('Broken streetlight')).toBeInTheDocument())
    expect(await axe(container)).toHaveNoViolations()
    expect(screen.getByAltText('Before repair: Broken streetlight')).toBeInTheDocument()
  })
})
