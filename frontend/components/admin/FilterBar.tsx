'use client'
import { CATEGORIES, DEPARTMENTS, FILTER_STATUSES } from './constants'
import type { QueueFilters } from './types'

interface FilterBarProps {
  filters: QueueFilters
  onChange: (next: QueueFilters) => void
  resultCount: number
}

const selectClass = 'text-sm border border-gray-200 rounded-lg px-3 py-2'

/** Queue filters: department, category, status, minimum urgency, SLA-at-risk. */
export default function FilterBar({ filters, onChange, resultCount }: FilterBarProps) {
  const set = <K extends keyof QueueFilters>(key: K, value: QueueFilters[K]) => onChange({ ...filters, [key]: value })

  return (
    <div
      className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-wrap gap-3 items-center"
      role="search"
      aria-label="Filter report queue"
    >
      <label htmlFor="filter-department" className="sr-only">
        Department
      </label>
      <select
        id="filter-department"
        value={filters.department}
        onChange={e => set('department', e.target.value)}
        className={selectClass}
      >
        <option value="">All Departments</option>
        {DEPARTMENTS.map(d => (
          <option key={d}>{d}</option>
        ))}
      </select>
      <label htmlFor="filter-category" className="sr-only">
        Category
      </label>
      <select
        id="filter-category"
        value={filters.category}
        onChange={e => set('category', e.target.value)}
        className={selectClass}
      >
        <option value="">All Categories</option>
        {CATEGORIES.map(c => (
          <option key={c}>{c}</option>
        ))}
      </select>
      <label htmlFor="filter-status" className="sr-only">
        Status
      </label>
      <select
        id="filter-status"
        value={filters.status}
        onChange={e => set('status', e.target.value)}
        className={selectClass}
      >
        <option value="">All Statuses</option>
        {FILTER_STATUSES.map(s => (
          <option key={s}>{s}</option>
        ))}
      </select>
      <label htmlFor="filter-urgency" className="sr-only">
        Minimum urgency
      </label>
      <select
        id="filter-urgency"
        value={filters.minUrgency}
        onChange={e => set('minUrgency', Number(e.target.value))}
        className={selectClass}
      >
        {[1, 2, 3, 4, 5].map(n => (
          <option key={n} value={n}>
            P{n}+ Urgency
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
        <input
          type="checkbox"
          checked={filters.slaRisk}
          onChange={e => set('slaRisk', e.target.checked)}
          className="rounded"
        />
        SLA At Risk Only
      </label>
      <span className="ml-auto text-sm text-gray-600">{resultCount} reports</span>
    </div>
  )
}
