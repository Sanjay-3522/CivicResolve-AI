'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { adminFetch, clearAdminSession } from '../../lib/auth'
import FilterBar from '../../components/admin/FilterBar'
import BulkActionBar from '../../components/admin/BulkActionBar'
import ReportQueueTable from '../../components/admin/ReportQueueTable'
import AdminTabs from '../../components/admin/AdminTabs'
import AnalyticsPanel from '../../components/admin/AnalyticsPanel'
import SlaLogPanel from '../../components/admin/SlaLogPanel'
import type { AdminTab, Analytics, QueueFilters, QueueReport, SlaLogEntry } from '../../components/admin/types'

const INITIAL_FILTERS: QueueFilters = { department: '', category: '', status: '', minUrgency: 1, slaRisk: false }

export default function AdminPage() {
  const router = useRouter()
  const [reports, setReports] = useState<QueueReport[]>([])
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [slaLog, setSlaLog] = useState<SlaLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<QueueFilters>(INITIAL_FILTERS)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState('')
  const [bulkNote, setBulkNote] = useState('')
  const [bulkUpdating, setBulkUpdating] = useState(false)
  const [activeTab, setActiveTab] = useState<AdminTab>('queue')
  const [triggeringCheck, setTriggeringCheck] = useState(false)
  const [pendingStatus, setPendingStatus] = useState<Record<string, string>>({})
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')

  const handleAuthError = async () => {
    await clearAdminSession()
    router.push('/admin/login')
  }

  const fetchData = async (): Promise<QueueReport[] | null> => {
    setLoading(true)
    setAnnouncement('Loading reports…')
    const params = new URLSearchParams({ limit: '100' })
    if (filters.department) params.set('department', filters.department)
    if (filters.category) params.set('category', filters.category)
    if (filters.status) params.set('status', filters.status)
    params.set('min_urgency', String(filters.minUrgency))
    if (filters.slaRisk) params.set('sla_at_risk', 'true')

    try {
      const [resQ, resA, resS] = await Promise.all([
        adminFetch(`/api/admin/queue?${params}`),
        adminFetch('/api/admin/analytics'),
        adminFetch('/api/admin/sla-log'),
      ])

      if (resQ.status === 401 || resA.status === 401 || resS.status === 401) {
        handleAuthError()
        return null
      }

      const queue: QueueReport[] = await resQ.json()
      setReports(queue)
      setAnalytics(await resA.json())
      setSlaLog(await resS.json())
      setAnnouncement(`Loaded ${queue.length} reports.`)
      return queue
    } catch (err) {
      console.error('Fetch error:', err)
      setAnnouncement('Failed to load reports.')
      return null
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch only when these inputs change
  }, [filters])

  const toggleSelect = (id: string) => {
    const s = new Set(selected)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    setSelected(s)
  }

  const handleBulkUpdate = async () => {
    if (!bulkStatus || selected.size === 0) return
    setBulkUpdating(true)
    const form = new FormData()
    form.append('report_ids', Array.from(selected).join(','))
    form.append('status', bulkStatus)
    if (bulkNote) form.append('note', bulkNote)
    const res = await adminFetch('/api/admin/reports/bulk-status', { method: 'PATCH', body: form })
    if (res.status === 401) {
      handleAuthError()
      return
    }
    const body = await res.json().catch(() => ({}))
    const appliedStatus = bulkStatus
    setSelected(new Set())
    setBulkStatus('')
    setBulkNote('')
    await fetchData()
    setBulkUpdating(false)
    setAnnouncement(
      res.ok
        ? `Updated ${body.updated ?? 0} reports to ${appliedStatus.replace('_', ' ')}.`
        : `Bulk update failed: ${body.detail ?? res.status}.`,
    )
  }

  const handleSingleStatus = async (id: string) => {
    const status = pendingStatus[id]
    if (!status) return
    setUpdatingId(id)
    const form = new FormData()
    form.append('status', status)
    const res = await adminFetch(`/api/reports/${id}/status`, { method: 'POST', body: form })
    if (res.status === 401) {
      handleAuthError()
      return
    }
    await fetchData()
    setUpdatingId(null)
    setAnnouncement(res.ok ? `Status updated to ${status.replace('_', ' ')}.` : 'Status update failed.')
  }

  const handleTriggerSLA = async () => {
    setTriggeringCheck(true)
    setAnnouncement('Running SLA check…')
    const res = await adminFetch('/api/admin/trigger-sla-check', { method: 'POST' })
    if (res.status === 401) {
      handleAuthError()
      return
    }
    const queue = await fetchData()
    setTriggeringCheck(false)
    const breached = queue ? queue.filter(r => r.sla_breached).length : 0
    setAnnouncement(res.ok ? `SLA check complete. ${breached} reports in breach.` : 'SLA check failed.')
  }

  const handleSignOut = async () => {
    await clearAdminSession()
    router.push('/admin/login')
  }

  const breachedCount = reports.filter(r => r.sla_breached).length
  const criticalCount = reports.filter(r => r.urgency === 5).length

  return (
    <div className="min-h-screen bg-gray-50">
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {/* Admin Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Admin Dashboard</h1>
            <p className="text-sm text-gray-600">Civic issue management · Bengaluru Municipal Corporation</p>
          </div>
          <div className="flex items-center gap-3">
            {breachedCount > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-1.5 text-sm font-semibold text-red-700">
                <span aria-hidden="true">⚠️ </span>
                {breachedCount} SLA Breach{breachedCount > 1 ? 'es' : ''}
              </div>
            )}
            {criticalCount > 0 && (
              <div className="bg-red-100 border border-red-300 rounded-lg px-3 py-1.5 text-sm font-bold text-red-800 animate-pulse">
                <span aria-hidden="true">🚨 </span>
                {criticalCount} Critical
              </div>
            )}
            <button
              onClick={handleTriggerSLA}
              disabled={triggeringCheck}
              aria-busy={triggeringCheck}
              className="text-xs bg-gray-100 text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              {triggeringCheck ? '⏳ Checking SLA…' : '⚡ Trigger SLA Check'}
            </button>
            <Link
              href="/admin/heatmap"
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700"
            >
              <span aria-hidden="true">🗺️ </span>Heatmap
            </Link>
            <button
              onClick={handleSignOut}
              className="text-xs bg-red-50 text-red-700 border border-red-200 px-3 py-2 rounded-lg font-medium hover:bg-red-100 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Stat cards */}
        {analytics && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total Reports', value: analytics.total_reports, icon: '📋', color: 'text-blue-700' },
              { label: 'Resolved This Week', value: analytics.resolved_this_week, icon: '✅', color: 'text-green-700' },
              {
                label: 'Avg Resolution',
                value: `${analytics.avg_resolution_hours}h`,
                icon: '⏱️',
                color: 'text-yellow-700',
              },
              { label: 'SLA Breaches', value: analytics.sla_breach_count, icon: '⚠️', color: 'text-red-700' },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl" aria-hidden="true">
                    {s.icon}
                  </span>
                  <p className="text-xs text-gray-600 font-medium">{s.label}</p>
                </div>
                <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
        )}

        <AdminTabs active={activeTab} onChange={setActiveTab} slaCount={slaLog.length} />

        {activeTab === 'queue' && (
          <div role="tabpanel" id="panel-queue" aria-labelledby="tab-queue" tabIndex={0} className="space-y-4">
            <FilterBar filters={filters} onChange={setFilters} resultCount={reports.length} />
            <BulkActionBar
              selectedCount={selected.size}
              status={bulkStatus}
              note={bulkNote}
              updating={bulkUpdating}
              onStatusChange={setBulkStatus}
              onNoteChange={setBulkNote}
              onApply={handleBulkUpdate}
              onClear={() => setSelected(new Set())}
            />
            <div aria-busy={loading}>
              {loading ? (
                <div className="text-center py-16 text-gray-600">Loading…</div>
              ) : (
                <ReportQueueTable
                  reports={reports}
                  selected={selected}
                  onToggle={toggleSelect}
                  pendingStatus={pendingStatus}
                  onPendingStatusChange={(id, status) => setPendingStatus(prev => ({ ...prev, [id]: status }))}
                  onApplyStatus={handleSingleStatus}
                  updatingId={updatingId}
                />
              )}
            </div>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div
            role="tabpanel"
            id="panel-analytics"
            aria-labelledby="tab-analytics"
            tabIndex={0}
            aria-busy={loading && !analytics}
          >
            {analytics && <AnalyticsPanel analytics={analytics} />}
          </div>
        )}

        {activeTab === 'sla' && (
          <div role="tabpanel" id="panel-sla" aria-labelledby="tab-sla" tabIndex={0}>
            <SlaLogPanel entries={slaLog} />
          </div>
        )}
      </div>
    </div>
  )
}
