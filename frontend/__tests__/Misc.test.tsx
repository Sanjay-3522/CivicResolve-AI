import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { render, screen } from '@testing-library/react'
import { axe } from 'jest-axe'
import RootLayout from '../app/layout'
import { escapeHtml } from '../lib/escapeHtml'
import TriageProgress from '../components/report/TriageProgress'

jest.mock(
  'next/dynamic',
  () => () =>
    function Dyn() {
      return <div data-testid="dynamic-map" />
    },
)

describe('layout and utilities', () => {
  it('renders a skip link that targets the main landmark', () => {
    const html = renderToStaticMarkup(<RootLayout>child</RootLayout>)
    expect(html).toContain('href="#main"')
    expect(html).toContain('id="main"')
    expect(html).toContain('<html lang="en">')
    expect(html).toContain('aria-label="Primary"')
  })

  it('escapeHtml neutralises markup and handles non-strings', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;')
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(5)).toBe('5')
  })

  it('map and heatmap pages lazy-load their Leaflet components', async () => {
    const MapPage = (await import('../app/map/page')).default
    const HeatmapPage = (await import('../app/admin/heatmap/page')).default
    const { container } = render(<MapPage />)
    expect(screen.getByRole('heading', { name: /Live Issue Map/ })).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
    expect(screen.getByTestId('dynamic-map')).toBeInTheDocument()
    render(<HeatmapPage />)
    expect(screen.getAllByTestId('dynamic-map')).toHaveLength(2)
  })

  it('triage progress is announced politely', () => {
    render(<TriageProgress />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
  })
})
