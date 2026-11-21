import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { axe } from 'jest-axe'
import AdminLoginPage from '../app/admin/login/page'

const push = jest.fn()
const refresh = jest.fn()
let searchParams = new URLSearchParams()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
  useSearchParams: () => searchParams,
}))

const submitWith = (key: string) => {
  fireEvent.change(screen.getByLabelText(/Admin Secret Key/i), { target: { value: key } })
  fireEvent.click(screen.getByRole('button', { name: /Sign in/i }))
}

describe('Admin login page', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    searchParams = new URLSearchParams()
  })

  it('redirects to the requested admin page after a successful login', async () => {
    searchParams = new URLSearchParams({ from: '/admin/heatmap' })
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch
    render(<AdminLoginPage />)
    submitWith('correct-key')
    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/heatmap'))
    expect(refresh).toHaveBeenCalled()
  })

  it('shows an error message when the key is rejected', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 }) as unknown as typeof fetch
    render(<AdminLoginPage />)
    submitWith('wrong-key')
    expect(await screen.findByRole('alert')).toHaveTextContent(/Invalid admin key/i)
    expect(push).not.toHaveBeenCalled()
  })

  it.each(['//evil.example.com', 'https://evil.example.com/admin', '/administrator', '/track/x'])(
    'blocks open redirect to %s and falls back to /admin',
    async from => {
      searchParams = new URLSearchParams({ from })
      global.fetch = jest.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch
      render(<AdminLoginPage />)
      submitWith('correct-key')
      await waitFor(() => expect(push).toHaveBeenCalledWith('/admin'))
    },
  )

  it('has no detectable accessibility violations', async () => {
    const { container } = render(<AdminLoginPage />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
