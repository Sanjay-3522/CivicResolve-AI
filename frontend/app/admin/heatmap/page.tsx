'use client'
import dynamic from 'next/dynamic'

const HeatmapPanel = dynamic(() => import('../../../components/HeatmapPanel'), { ssr: false })

export default function HeatmapPage() {
  return <HeatmapPanel />
}
