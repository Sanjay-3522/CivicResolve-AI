'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import CorroborationsList from '../../../components/track/CorroborationsList'
import ReopenForm from '../../../components/track/ReopenForm'
import ReportPhotos from '../../../components/track/ReportPhotos'
import StatusTimeline from '../../../components/track/StatusTimeline'
import {
  FLAG_LABELS,
  STATUS_LABELS,
  URGENCY_COLORS,
  URGENCY_LABELS,
  type TrackedReport,
} from '../../../components/track/types'

export default function TrackPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [report, setReport] = useState<TrackedReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [upvoting, setUpvoting] = useState(false)
  const [reopening, setReopening] = useState(false)
  const [reopenReason, setReopenReason] = useState('')
  const [showReopenForm, setShowReopenForm] = useState(false)

  const fetchReport = async () => {
    try {
      const res = await fetch(`/api/reports/${id}`)
      if (!res.ok) throw new Error('Not found')
      setReport(await res.json())
    } catch {
      setReport(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchReport()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch only when these inputs change
  }, [id])

  const handleUpvote = async () => {
    setUpvoting(true)
    await fetch(`/api/reports/${id}/upvote`, { method: 'POST' })
    await fetchReport()
    setUpvoting(false)
  }

  const handleReopen = async () => {
    if (!reopenReason.trim()) return
    setReopening(true)
    const form = new FormData()
    form.append('reason', reopenReason)
    const res = await fetch(`/api/reports/${id}/reopen`, { method: 'POST', body: form })
    if (res.ok) {
      await fetchReport()
      setShowReopenForm(false)
    }
    setReopening(false)
  }

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center" role="status" aria-live="polite" aria-busy="true">
        <div className="text-center space-y-3">
          <div
            aria-hidden="true"
            className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto"
          ></div>
          <p className="text-gray-600">Loading report…</p>
        </div>
      </div>
    )

  if (!report)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-5xl mb-4" aria-hidden="true">
            🔍
          </p>
          <h2 className="text-xl font-bold text-gray-900">Report Not Found</h2>
          <button onClick={() => router.push('/')} className="mt-4 text-blue-600 hover:underline">
            Back to home
          </button>
        </div>
      </div>
    )

  const isResolvable = ['resolved', 'verified', 'flagged'].includes(report.status)
  const reopenDeadline = report.reopen_deadline ? new Date(report.reopen_deadline) : null
  const canReopen = isResolvable && reopenDeadline !== null && reopenDeadline > new Date()
  const hoursToReopen = canReopen && reopenDeadline ? Math.round((reopenDeadline.getTime() - Date.now()) / 3600000) : 0

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className={`text-xs px-2 py-1 rounded-full status-${report.status}`}>
                  {STATUS_LABELS[report.status] || report.status}
                </span>
                {report.reopen_count > 0 && (
                  <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700">
                    🔄 Reopened {report.reopen_count}×
                  </span>
                )}
              </div>
              <h1 className="text-xl font-bold text-gray-900">{report.title}</h1>
              <p className="text-sm text-gray-600 mt-1">
                📍 {report.address || `${report.latitude?.toFixed(4)}, ${report.longitude?.toFixed(4)}`}
              </p>
            </div>
            <div className="text-center bg-gray-50 rounded-xl p-3 min-w-[64px]">
              <p className={`text-2xl font-black ${URGENCY_COLORS[report.urgency]}`}>
                <span className="sr-only">Urgency </span>P{report.urgency}
              </p>
              <p className="text-xs text-gray-600">{URGENCY_LABELS[report.urgency]}</p>
            </div>
          </div>
          <p className="text-gray-700 text-sm">{report.description}</p>
        </div>

        {/* AI Reasoning */}
        {report.ai_summary && (
          <div className="border-t border-gray-100 bg-gradient-to-r from-purple-50 to-blue-50 p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-sm" aria-hidden="true">
                  🤖
                </span>
              </div>
              <div>
                <p className="text-xs font-semibold text-purple-700 mb-1">AI TRIAGE REASONING</p>
                <p className="text-sm text-gray-800">{report.ai_summary}</p>
                {report.urgency_reasoning && <p className="text-xs text-gray-600 mt-1">{report.urgency_reasoning}</p>}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Escalation flags */}
      {report.escalation_flags?.length > 0 && (
        <div
          className="bg-orange-50 border border-orange-200 rounded-xl p-4"
          role="region"
          aria-label="Escalation risk flags"
        >
          <p className="text-xs font-semibold text-orange-700 mb-2">⚠️ ESCALATION FLAGS</p>
          <div className="flex flex-wrap gap-2">
            {report.escalation_flags.map((f: string) => (
              <span
                key={f}
                role="note"
                aria-label={`Flag: ${FLAG_LABELS[f] || f}`}
                className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded-full border border-orange-200"
              >
                {FLAG_LABELS[f] || f}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* SLA info */}
      {report.sla_deadline && !['verified', 'resolved'].includes(report.status) && (
        <div
          className={`rounded-xl p-4 border ${
            new Date(report.sla_deadline) < new Date() ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'
          }`}
        >
          <p
            className={`text-xs font-semibold mb-1 ${new Date(report.sla_deadline) < new Date() ? 'text-red-800' : 'text-gray-700'}`}
          >
            {new Date(report.sla_deadline) < new Date() ? '⚠️ SLA BREACHED' : '⏱️ SLA DEADLINE'}
          </p>
          <p className="text-sm font-bold text-gray-900">
            {new Date(report.sla_deadline).toLocaleString('en-IN', {
              timeZone: 'Asia/Kolkata',
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </p>
          <p className="text-xs text-gray-600 mt-1">
            Assigned to: <span className="font-medium">{report.department}</span> (Tier {report.escalation_tier})
            {report.escalated_at && ` · Escalated ${new Date(report.escalated_at).toLocaleDateString('en-IN')}`}
          </p>
        </div>
      )}

      <StatusTimeline report={report} />

      {/* SLA Breaches — public transparency */}
      {report.sla_breaches?.length > 0 && (
        <div className="bg-red-50 rounded-2xl border border-red-200 p-6">
          <h2 className="font-semibold text-red-900 mb-3">⚠️ Public Accountability Log</h2>
          <p className="text-xs text-red-700 mb-3">
            SLA breaches are public by design — this is a transparency feature.
          </p>
          {report.sla_breaches.map(b => (
            <div key={b.id} className="bg-white rounded-xl border border-red-200 p-3 mb-2">
              <p className="text-sm text-red-800 font-medium">Escalated to Tier {b.escalated_to_tier}</p>
              <p className="text-xs text-red-700">{b.note}</p>
              <p className="text-xs text-gray-600 mt-1">
                {new Date(b.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Resolution verification */}
      {report.resolution_confidence != null && (
        <div
          className={`rounded-2xl border p-6 ${report.resolution_confidence >= 0.75 ? 'bg-green-50 border-green-200' : 'bg-orange-50 border-orange-200'}`}
        >
          <h2 className="font-semibold mb-2">🤖 AI Resolution Verification</h2>
          <div className="flex items-center gap-3 mb-3">
            <div className="text-2xl font-black text-gray-900">{Math.round(report.resolution_confidence * 100)}%</div>
            <div>
              <p className="text-xs text-gray-600">AI confidence score</p>
              <p className="text-sm text-gray-700">
                {report.resolution_confidence >= 0.75
                  ? '✅ Verified as resolved'
                  : '⚠️ Low confidence — may need re-inspection'}
              </p>
            </div>
          </div>
          {report.resolution_reasoning && <p className="text-sm text-gray-700">{report.resolution_reasoning}</p>}
        </div>
      )}

      {/* Stats & actions */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{report.upvote_count}</p>
          <p className="text-xs text-gray-600">Upvotes</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-blue-700">{report.corroboration_count}</p>
          <p className="text-xs text-gray-600">Corroborations</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{report.nearby_count}</p>
          <p className="text-xs text-gray-600">Nearby issues</p>
        </div>
      </div>

      <CorroborationsList corroborations={report.corroborations} />

      <div className="flex gap-3 flex-wrap">
        <button
          onClick={handleUpvote}
          disabled={upvoting}
          aria-label={`Me too — upvote this report (currently ${report.upvote_count} upvotes)`}
          className="flex-1 min-w-[140px] bg-blue-50 text-blue-700 border border-blue-200 py-3 rounded-xl font-semibold hover:bg-blue-100 transition-colors disabled:opacity-50"
        >
          👍 Me Too! ({report.upvote_count})
        </button>
        {canReopen && (
          <button
            onClick={() => setShowReopenForm(true)}
            className="flex-1 min-w-[140px] bg-orange-50 text-orange-700 border border-orange-200 py-3 rounded-xl font-semibold hover:bg-orange-100 transition-colors"
          >
            🔄 Issue Not Fixed ({hoursToReopen}h left)
          </button>
        )}
      </div>

      {showReopenForm && (
        <ReopenForm
          reason={reopenReason}
          submitting={reopening}
          onReasonChange={setReopenReason}
          onSubmit={handleReopen}
          onCancel={() => setShowReopenForm(false)}
        />
      )}

      <ReportPhotos report={report} />
    </div>
  )
}
