import type { TrackedReport } from './types'

/** Before/after photos used for AI resolution verification. */
export default function ReportPhotos({ report }: { report: TrackedReport }) {
  if (!report.before_image && !report.after_image) return null
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <h2 className="font-semibold text-gray-900 mb-4">📷 Photos</h2>
      <div className="grid grid-cols-2 gap-4">
        {report.before_image && (
          <div>
            <p className="text-xs text-gray-600 mb-2 font-medium">BEFORE</p>
            {/* eslint-disable-next-line @next/next/no-img-element -- blob previews / backend uploads, not optimisable by next/image */}
            <img
              width={640}
              height={160}
              loading="lazy"
              src={`/uploads/${report.before_image.split('/').pop()}`}
              alt={`Before repair: ${report.title}`}
              className="w-full h-40 object-cover rounded-xl border border-gray-200"
            />
          </div>
        )}
        {report.after_image && (
          <div>
            <p className="text-xs text-gray-600 mb-2 font-medium">AFTER</p>
            {/* eslint-disable-next-line @next/next/no-img-element -- blob previews / backend uploads, not optimisable by next/image */}
            <img
              width={640}
              height={160}
              loading="lazy"
              src={`/uploads/${report.after_image.split('/').pop()}`}
              alt={`After repair: ${report.title}`}
              className="w-full h-40 object-cover rounded-xl border border-gray-200"
            />
          </div>
        )}
      </div>
    </div>
  )
}
