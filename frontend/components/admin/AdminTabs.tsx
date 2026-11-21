'use client'
import { KeyboardEvent, useRef } from 'react'
import type { AdminTab } from './types'

const TABS: { id: AdminTab; label: string }[] = [
  { id: 'queue', label: '📋 Queue' },
  { id: 'analytics', label: '📊 Analytics' },
  { id: 'sla', label: '⚠️ SLA Breaches' },
]

interface AdminTabsProps {
  active: AdminTab
  onChange: (tab: AdminTab) => void
  slaCount: number
}

/** WAI-ARIA tablist with roving tabIndex and ←/→/Home/End keyboard support. */
export default function AdminTabs({ active, onChange, slaCount }: AdminTabsProps) {
  const refs = useRef<Record<AdminTab, HTMLButtonElement | null>>({ queue: null, analytics: null, sla: null })

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const idx = TABS.findIndex(t => t.id === active)
    let next = idx
    if (e.key === 'ArrowRight') next = (idx + 1) % TABS.length
    else if (e.key === 'ArrowLeft') next = (idx - 1 + TABS.length) % TABS.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = TABS.length - 1
    else return
    e.preventDefault()
    onChange(TABS[next].id)
    refs.current[TABS[next].id]?.focus()
  }

  return (
    <div role="tablist" aria-label="Dashboard sections" className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
      {TABS.map(tab => {
        const isActive = active === tab.id
        return (
          <button
            key={tab.id}
            ref={el => {
              refs.current[tab.id] = el
            }}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={isActive}
            aria-controls={`panel-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={onKeyDown}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${isActive ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-800'}`}
          >
            {tab.label}
            {tab.id === 'sla' && slaCount > 0 && (
              <span className="ml-1 bg-red-700 text-white text-xs px-1.5 py-0.5 rounded-full">
                {slaCount}
                <span className="sr-only"> entries</span>
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
