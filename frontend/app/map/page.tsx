'use client'
import dynamic from 'next/dynamic'

const PublicMapView = dynamic(() => import('../../components/PublicMapView'), { ssr: false })

export default function MapPage() {
  return (
    <div className="h-[calc(100vh-56px)] flex flex-col">
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <h1 className="font-bold text-gray-900">🗺️ Live Issue Map — Bengaluru</h1>
        <p className="text-sm text-gray-600">Click any marker to see issue details. Cluster size = issue density.</p>
      </div>
      <div className="flex-1">
        <PublicMapView />
      </div>
    </div>
  )
}
