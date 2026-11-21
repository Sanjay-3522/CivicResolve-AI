import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { axe } from 'jest-axe'
import ReportPage from '../app/page'

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    refresh: jest.fn(),
  }),
}))

// Mock LocationPicker dynamic Leaflet import
jest.mock('../components/LocationPicker', () => {
  return function MockLocationPicker({
    onLocationSelect,
  }: {
    onLocationSelect: (loc: { lat: number; lon: number; address?: string }) => void
  }) {
    return (
      <div data-testid="mock-location-picker">
        <button
          type="button"
          onClick={() => onLocationSelect({ lat: 12.9716, lon: 77.5946, address: 'MG Road, Bengaluru' })}
        >
          Mock Pin Location
        </button>
      </div>
    )
  }
})

describe('ReportPage Component', () => {
  it('renders report form with title, description, and submit button', () => {
    render(<ReportPage />)

    expect(screen.getByText('Report a Civic Issue')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/e\.g\. Deep pothole on MG Road near signal/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Describe the problem in detail/i)).toBeInTheDocument()

    const submitBtn = screen.getByRole('button', { name: /Submit Report/i })
    expect(submitBtn).toBeInTheDocument()
    // Submit button is disabled until location is selected
    expect(submitBtn).toBeDisabled()
  })

  it('enables submit button after location is selected', () => {
    render(<ReportPage />)

    const submitBtn = screen.getByRole('button', { name: /Submit Report/i })
    expect(submitBtn).toBeDisabled()

    // Trigger mock location selection
    const pinBtn = screen.getByText('Mock Pin Location')
    fireEvent.click(pinBtn)

    // Now submit button should be enabled
    expect(submitBtn).toBeEnabled()
  })

  it('allows toggling category options with accessible aria-pressed state', () => {
    render(<ReportPage />)

    const potholeBtn = screen.getByRole('button', { name: /Category: Pothole/i })
    expect(potholeBtn).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(potholeBtn)
    expect(potholeBtn).toHaveAttribute('aria-pressed', 'true')

    // Click again to unselect
    fireEvent.click(potholeBtn)
    expect(potholeBtn).toHaveAttribute('aria-pressed', 'false')
  })

  it('has no detectable accessibility violations', async () => {
    const { container } = render(<ReportPage />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('associates labels and length limits with the title and description fields', () => {
    render(<ReportPage />)
    const title = screen.getByLabelText(/Issue Title/i)
    expect(title).toHaveAttribute('minLength', '3')
    expect(title).toHaveAttribute('maxLength', '120')
    const desc = screen.getByLabelText(/Describe the Issue/i)
    expect(desc).toHaveAttribute('minLength', '10')
    expect(desc).toHaveAttribute('maxLength', '2000')
  })
})
