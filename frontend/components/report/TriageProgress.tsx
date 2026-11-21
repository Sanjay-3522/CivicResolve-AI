/** Shown while Gemini AI categorizes the issue, scores urgency and recommends a department. */
export default function TriageProgress() {
  return (
    <div className="min-h-screen flex items-center justify-center" role="status" aria-live="polite">
      <div className="text-center space-y-4">
        <div className="relative mx-auto w-16 h-16" aria-hidden="true">
          <div className="absolute inset-0 rounded-full border-4 border-blue-200 animate-ping"></div>
          <div className="relative w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
            <span className="text-2xl">🤖</span>
          </div>
        </div>
        <h2 className="text-xl font-bold text-gray-900">AI Triage in Progress</h2>
        <p className="text-gray-600 max-w-sm">
          Analysing your report for category, urgency, and department routing. Checking for nearby similar reports…
        </p>
        <div className="flex flex-col items-center gap-1 mt-4" role="list" aria-label="Triage steps">
          {[
            'Classifying category…',
            'Scoring urgency by safety impact…',
            'Routing to department…',
            'Checking for nearby duplicates…',
          ].map((s, i) => (
            <div key={i} role="listitem" className="flex items-center gap-2 text-sm text-gray-600">
              <div
                aria-hidden="true"
                className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              ></div>
              {s}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
