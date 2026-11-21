import { STATUS_COLORS, STATUS_LABELS, STATUS_STEPS, type TrackedReport } from './types'

/** Resolution progress bar plus the full, timestamped event history. */
export default function StatusTimeline({ report }: { report: TrackedReport }) {
  const currentStepIdx = STATUS_STEPS.indexOf(report.status)
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <h2 className="font-semibold text-gray-900 mb-4">Status Timeline</h2>
      {/* Progress bar */}
      <ol className="flex items-center gap-1 mb-6" aria-label="Resolution progress">
        {STATUS_STEPS.map((s, i) => (
          <li key={s} className="flex items-center flex-1">
            <span className="sr-only">
              {STATUS_LABELS[s]}:{' '}
              {i < currentStepIdx ? 'completed' : i === currentStepIdx ? 'current step' : 'not yet reached'}
            </span>
            <div
              aria-hidden="true"
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                i < currentStepIdx
                  ? 'bg-blue-600 text-white'
                  : i === currentStepIdx
                    ? `${STATUS_COLORS[report.status]} text-white`
                    : 'bg-gray-100 text-gray-600'
              }`}
            >
              {i < currentStepIdx ? '✓' : i + 1}
            </div>
            {i < STATUS_STEPS.length - 1 && (
              <div
                aria-hidden="true"
                className={`h-1 flex-1 mx-1 rounded ${i < currentStepIdx ? 'bg-blue-400' : 'bg-gray-100'}`}
              />
            )}
          </li>
        ))}
      </ol>
      {/* Events */}
      <div className="space-y-3">
        {report.timelines?.map((event, i) => (
          <div key={event.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div
                aria-hidden="true"
                className={`w-3 h-3 rounded-full mt-1 flex-shrink-0 ${STATUS_COLORS[event.status] || 'bg-gray-300'}`}
              />
              {i < report.timelines.length - 1 && <div aria-hidden="true" className="w-0.5 h-full bg-gray-100 mt-1" />}
            </div>
            <div className="pb-3 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-gray-700 uppercase">
                  {STATUS_LABELS[event.status] || event.status}
                </span>
                <span className="text-xs text-gray-600">{event.actor}</span>
              </div>
              <p className="text-sm text-gray-600 mt-0.5">{event.note}</p>
              <p className="text-xs text-gray-600 mt-0.5">
                {new Date(event.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
