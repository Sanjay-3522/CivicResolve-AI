import type { Corroboration } from './types'

/** "Also reported by others": citizen reports merged by geo-semantic deduplication. */
export default function CorroborationsList({ corroborations }: { corroborations: Corroboration[] }) {
  if (!corroborations || corroborations.length === 0) return null
  return (
    <div className="bg-white rounded-2xl border border-blue-200 shadow-sm p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <span>🔗 Also reported by others</span>
            <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-bold">
              {corroborations.length}
            </span>
          </h2>
          <p className="text-xs text-gray-600 mt-0.5">
            These nearby citizen reports were automatically merged by geo-semantic deduplication.
          </p>
        </div>
      </div>
      <div className="divide-y divide-gray-100">
        {corroborations.map(c => (
          <div key={c.id} className="pt-3 pb-3 first:pt-0 last:pb-0 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-gray-800">{c.title}</p>
              {c.created_at && (
                <span className="text-xs text-gray-600 whitespace-nowrap">
                  {new Date(c.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short' })}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-600">{c.description}</p>
            {c.address && <p className="text-xs text-gray-600">📍 {c.address}</p>}
            {c.before_image && (
              <div className="mt-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- blob previews / backend uploads, not optimisable by next/image */}
                <img
                  src={`/uploads/${c.before_image.split('/').pop()}`}
                  width={128}
                  height={96}
                  loading="lazy"
                  alt={`Corroborating report: ${c.title}`}
                  className="w-32 h-24 object-cover rounded-lg border border-gray-200"
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
