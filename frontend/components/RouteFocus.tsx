'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

/**
 * After client-side navigation, move keyboard focus to <main> and announce the new page's
 * heading, as a full page load would. (Next's own announcer only speaks when <title>
 * changes, and every page here shares one title, so the two never double up.)
 */
const HEADING_POLL_MS = 100
const HEADING_WAIT_TRIES = 30

export default function RouteFocus() {
  const pathname = usePathname()
  const firstRender = useRef(true)
  const [announcement, setAnnouncement] = useState('')

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    const id = requestAnimationFrame(() => document.getElementById('main')?.focus())
    // Pages that fetch data render their <h1> a moment later; wait briefly for it.
    let tries = 0
    const timer = setInterval(() => {
      const heading = document.querySelector('main h1')?.textContent?.trim()
      if (heading || ++tries >= HEADING_WAIT_TRIES) {
        clearInterval(timer)
        setAnnouncement(heading ? `${heading} page loaded` : 'Page loaded')
      }
    }, HEADING_POLL_MS)
    return () => {
      cancelAnimationFrame(id)
      clearInterval(timer)
    }
  }, [pathname])

  return (
    <p role="status" aria-live="polite" className="sr-only">
      {announcement}
    </p>
  )
}
