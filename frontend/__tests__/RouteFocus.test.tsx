import React from 'react'
import { act, render, screen } from '@testing-library/react'
import RouteFocus from '../components/RouteFocus'

let pathname = '/'
jest.mock('next/navigation', () => ({ usePathname: () => pathname }))

describe('RouteFocus', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
      cb(0)
      return 1
    })
  })

  it('does nothing on first load, then focuses <main> and announces the new page', () => {
    const { rerender } = render(
      <>
        <RouteFocus />
        <main id="main" tabIndex={-1}>
          <h1>Report a Civic Issue</h1>
        </main>
      </>,
    )
    expect(screen.getByRole('main')).not.toHaveFocus()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()

    pathname = '/track/abc'
    act(() =>
      rerender(
        <>
          <RouteFocus />
          <main id="main" tabIndex={-1}>
            <h1>Pipe burst</h1>
          </main>
        </>,
      ),
    )
    expect(screen.getByRole('main')).toHaveFocus()
    act(() => jest.advanceTimersByTime(100))
    expect(screen.getByRole('status')).toHaveTextContent('Pipe burst page loaded')
  })

  it('falls back to a generic announcement when the page has no heading', () => {
    pathname = '/a'
    const { rerender } = render(<RouteFocus />)
    pathname = '/b'
    act(() => rerender(<RouteFocus />))
    act(() => jest.advanceTimersByTime(3000))
    expect(screen.getByRole('status')).toHaveTextContent('Page loaded')
  })
})
