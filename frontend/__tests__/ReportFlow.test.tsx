import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { axe } from 'jest-axe'
import ReportPage from '../app/page'

const push = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: jest.fn() }) }))
jest.mock('../components/LocationPicker', () => {
  return function MockLocationPicker({
    onLocationSelect,
  }: {
    onLocationSelect: (l: { lat: number; lon: number }) => void
  }) {
    return (
      <button type="button" onClick={() => onLocationSelect({ lat: 12.97, lon: 77.59 })}>
        Mock Pin Location
      </button>
    )
  }
})

const fill = async () => {
  fireEvent.click(await screen.findByText('Mock Pin Location'))
  fireEvent.change(screen.getByLabelText(/Issue Title/), { target: { value: 'Deep pothole on MG Road' } })
  fireEvent.change(screen.getByLabelText(/Describe the Issue/), {
    target: { value: 'Two-wheelers swerving near the signal' },
  })
  fireEvent.click(screen.getByRole('button', { name: /Category: Pothole/ }))
}

const respond = (body: unknown, ok = true) =>
  (global.fetch = jest
    .fn()
    .mockResolvedValue({ ok, json: async () => body, text: async () => String(body) }) as unknown as typeof fetch)

describe('Report → AI triage result flow', () => {
  beforeEach(() => jest.clearAllMocks())

  it('submits the report and shows the AI category, urgency, department and SLA', async () => {
    respond({
      merged: false,
      id: 'new-1',
      urgency: 4,
      category: 'pothole',
      department: 'PWD',
      ai_summary: 'Classified as High Priority: deep pothole',
      triage_source: 'rules',
      sla_deadline: '2026-11-22T10:00:00',
      message: 'ok',
    })
    const { container } = render(<ReportPage />)
    await fill()
    fireEvent.click(screen.getByRole('button', { name: /Submit Report/ }))
    expect(await screen.findByText('Report Submitted!')).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
    const body = (global.fetch as jest.Mock).mock.calls[0][1].body as FormData
    expect(body.get('category')).toBe('pothole')
    expect(body.get('latitude')).toBe('12.97')
    expect(screen.getByText('Classified as High Priority: deep pothole')).toBeInTheDocument()
    expect(screen.getByText('PWD')).toBeInTheDocument()
    expect(screen.getByText(/rule-based fallback.*not a live Gemini response/i)).toBeInTheDocument()
    expect(screen.getByText(/P4 \/ 5/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Track My Report/ }))
    expect(push).toHaveBeenCalledWith('/track/new-1')
    fireEvent.click(screen.getByRole('button', { name: /Report another issue/ }))
    expect(screen.getByLabelText(/Issue Title/)).toHaveValue('')
  })

  it('labels live Gemini decisions without overstating their certainty', async () => {
    respond({
      merged: false,
      id: 'gemini-case',
      urgency: 3,
      category: 'garbage',
      department: 'BBMP',
      ai_summary: 'Overflowing garbage near a playground',
      triage_source: 'gemini',
      sla_deadline: '2026-11-22T10:00:00',
      message: 'ok',
    })
    render(<ReportPage />)
    await fill()
    fireEvent.click(screen.getByRole('button', { name: /Submit Report/ }))
    expect(await screen.findByText(/Source: Google Gemini AI/)).toBeInTheDocument()
  })

  it('explains when the report was merged into an existing nearby issue', async () => {
    respond({ merged: true, existing_id: 'old-9', corroboration_count: 4, message: 'Merged with #old-9' })
    render(<ReportPage />)
    await fill()
    fireEvent.click(screen.getByRole('button', { name: /Submit Report/ }))
    expect(await screen.findByText('Report Merged!')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Track Original Report/ }))
    expect(push).toHaveBeenCalledWith('/track/old-9')
  })

  it('returns to the form with an error when the API rejects the report', async () => {
    respond('title too short', false)
    render(<ReportPage />)
    await fill()
    fireEvent.click(screen.getByRole('button', { name: /Submit Report/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('title too short')
  })

  it('shows the triage progress screen while the AI is working', async () => {
    let resolve!: (v: unknown) => void
    global.fetch = jest.fn(() => new Promise(r => (resolve = r))) as unknown as typeof fetch
    render(<ReportPage />)
    await fill()
    fireEvent.click(screen.getByRole('button', { name: /Submit Report/ }))
    expect(await screen.findByText('AI Triage in Progress')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(4)
    resolve({ ok: false, text: async () => '' })
    expect(await screen.findByRole('alert')).toHaveTextContent('Submission failed')
  })

  it('previews and removes an attached photo', async () => {
    global.URL.createObjectURL = jest.fn(() => 'blob:preview')
    render(<ReportPage />)
    const file = new File(['x'], 'pothole.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByLabelText('Upload issue photo'), { target: { files: [file] } })
    expect(screen.getByAltText('Preview of uploaded issue')).toHaveAttribute('src', 'blob:preview')
    fireEvent.click(screen.getByRole('button', { name: 'Remove uploaded photo' }))
    expect(screen.queryByAltText('Preview of uploaded issue')).not.toBeInTheDocument()
  })

  it('validates fields, links an error summary to them and moves focus to it', async () => {
    global.fetch = jest.fn() as unknown as typeof fetch
    const { container } = render(<ReportPage />)
    fireEvent.click(await screen.findByText('Mock Pin Location'))
    fireEvent.change(screen.getByLabelText(/Issue Title/), { target: { value: 'ab' } })
    fireEvent.click(screen.getByRole('button', { name: /Submit Report/ }))

    const summary = await screen.findByRole('alert')
    expect(summary).toHaveFocus()
    expect(summary).toHaveTextContent('Please fix the following before submitting:')
    const links = screen.getAllByRole('link', { name: /Title must be|Please describe/ })
    expect(links.map(l => l.getAttribute('href'))).toEqual(['#report-title', '#report-description'])

    const title = screen.getByLabelText(/Issue Title/)
    expect(title).toHaveAttribute('aria-invalid', 'true')
    expect(title).toHaveAccessibleDescription('Title must be at least 3 characters')
    expect(screen.getByLabelText(/Describe the Issue/)).toHaveAccessibleDescription('Please describe the issue')
    expect(global.fetch).not.toHaveBeenCalled()
    expect(await axe(container)).toHaveNoViolations()

    fireEvent.change(title, { target: { value: 'Pothole on MG Road' } })
    fireEvent.change(screen.getByLabelText(/Describe the Issue/), { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: /Submit Report/ }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Description must be at least 10 characters'),
    )
    expect(title).not.toHaveAttribute('aria-invalid')
  })
})
