import { useEffect, useRef } from 'react'
import type { SubmitResult } from './types'

interface SubmissionResultProps {
  result: SubmitResult
  onTrack: (id: string) => void
  onReset: () => void
}

/** AI triage outcome (or merge notice) shown after a civic issue is reported. */
export default function SubmissionResult({ result, onTrack, onReset }: SubmissionResultProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  // The form is replaced by this view, so move focus to its heading (WCAG 2.4.3).
  useEffect(() => headingRef.current?.focus(), [])

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 max-w-lg w-full overflow-hidden">
        {result.merged ? (
          <>
            <div className="bg-blue-50 border-b border-blue-100 p-6">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-3xl" aria-hidden="true">
                  🔗
                </span>
                <h2 ref={headingRef} tabIndex={-1} className="text-xl font-bold text-blue-900 focus:outline-none">
                  Report Merged!
                </h2>
              </div>
              <p className="text-blue-700 text-sm">{result.message}</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-blue-50 rounded-xl p-4">
                <p className="text-xs text-blue-700 font-medium uppercase tracking-wide mb-1">
                  Nearby reports corroborated
                </p>
                <p className="text-2xl font-bold text-blue-700">{result.corroboration_count}</p>
                <p className="text-xs text-blue-700 mt-1">Severity automatically increased</p>
              </div>
              <button
                onClick={() => onTrack(result.existing_id)}
                className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors"
              >
                Track Original Report →
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="bg-green-50 border-b border-green-100 p-6">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-3xl" aria-hidden="true">
                  ✅
                </span>
                <h2 ref={headingRef} tabIndex={-1} className="text-xl font-bold text-green-900 focus:outline-none">
                  Report Submitted!
                </h2>
              </div>
              <p className="text-green-700 text-sm">Your report has been assessed and queued for action.</p>
            </div>
            <div className="p-6 space-y-4">
              {/* AI Reasoning Card */}
              <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl p-4 border border-purple-100">
                <p className="text-xs text-purple-700 font-semibold uppercase tracking-wide mb-2">
                  Assessment summary
                </p>
                <p className="text-sm text-gray-800 font-medium">{result.ai_summary}</p>
                {result.triage_source === 'gemini' && (
                  <p className="text-xs text-gray-600 mt-2">
                    Source: Google Gemini AI. Recommendations may require human review.
                  </p>
                )}
                {result.triage_source === 'rules' && (
                  <p className="text-xs text-gray-600 mt-2">
                    Source: rule-based fallback (demo assessment), not a live Gemini response.
                  </p>
                )}
                {!result.triage_source && (
                  <p className="text-xs text-gray-600 mt-2">Assessment source not reported by this API version.</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-600 mb-1">Priority</p>
                  <div className={`text-sm font-bold urgency-${result.urgency} px-2 py-1 rounded-full text-center`}>
                    P{result.urgency} / 5 <span className="sr-only">urgency</span>
                  </div>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-600 mb-1">Assigned To</p>
                  <p className="text-sm font-bold text-gray-800">{result.department}</p>
                </div>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-600 mb-1">SLA Deadline</p>
                <p className="text-sm font-semibold text-gray-800">
                  {new Date(result.sla_deadline).toLocaleString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </p>
                <p className="text-xs text-gray-600 mt-0.5">If not resolved by this time, it escalates automatically</p>
              </div>
              <button
                onClick={() => onTrack(result.id)}
                className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors"
              >
                Track My Report →
              </button>
              <button onClick={onReset} className="w-full text-sm text-gray-600 hover:text-gray-800 py-2">
                Report another issue
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
