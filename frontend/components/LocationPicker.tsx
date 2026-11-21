'use client'
import { useEffect, useState, useRef } from 'react'
import L from 'leaflet'
// Loaded with this lazily imported (ssr: false) chunk, not on every page.
import 'leaflet/dist/leaflet.css'

interface Props {
  onLocationSelect: (loc: { lat: number; lon: number; address?: string }) => void
  /** Set by the report form when no location has been chosen yet. */
  invalid?: boolean
  /** id of the form's error-summary entry describing the problem. */
  errorId?: string
}

export default function LocationPicker({ onLocationSelect, invalid = false, errorId }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)

  // Manual coordinate inputs for full keyboard accessibility
  const [manualLat, setManualLat] = useState<string>('12.9716')
  const [manualLon, setManualLon] = useState<string>('77.5946')
  const [statusMessage, setStatusMessage] = useState<string>('')

  const updateMarkerAndCallback = async (lat: number, lng: number) => {
    setManualLat(lat.toFixed(6))
    setManualLon(lng.toFixed(6))

    if (mapInstanceRef.current) {
      const map = mapInstanceRef.current
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng])
      } else {
        markerRef.current = L.marker([lat, lng]).addTo(map)
      }
      map.panTo([lat, lng])
    }

    // Reverse geocode via Nominatim
    let address: string | undefined
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`)
      const data = await res.json()
      address = data.display_name?.split(',').slice(0, 3).join(', ').slice(0, 300)
    } catch {}

    setStatusMessage(`Location selected: ${lat.toFixed(4)}, ${lng.toFixed(4)}${address ? ` (${address})` : ''}`)
    onLocationSelect({ lat, lon: lng, address })
  }

  const handleApplyManual = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const parsedLat = parseFloat(manualLat)
    const parsedLon = parseFloat(manualLon)

    if (isNaN(parsedLat) || parsedLat < -90 || parsedLat > 90) {
      setStatusMessage('Error: Latitude must be between -90 and 90')
      return
    }
    if (isNaN(parsedLon) || parsedLon < -180 || parsedLon > 180) {
      setStatusMessage('Error: Longitude must be between -180 and 180')
      return
    }

    updateMarkerAndCallback(parsedLat, parsedLon)
  }

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return

    // Default to Bangalore
    const map = L.map(mapRef.current).setView([12.9716, 77.5946], 13)
    mapInstanceRef.current = map

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)

    // Fix Leaflet default icon
    delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    })

    map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng
      updateMarkerAndCallback(lat, lng)
    })

    // Try to get user's geolocation
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          map.setView([pos.coords.latitude, pos.coords.longitude], 15)
          setManualLat(pos.coords.latitude.toFixed(6))
          setManualLon(pos.coords.longitude.toFixed(6))
        },
        () => {},
      )
    }

    return () => {
      map.remove()
      mapInstanceRef.current = null
    }
    // Map must be created once; updateMarkerAndCallback only reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onLocationSelect])

  return (
    <div className="space-y-3">
      {/* Map visual aid with accessibility landmarks */}
      <div
        role="region"
        aria-label="Interactive map visual aid for location selection. Use map click or the numeric inputs below."
      >
        <div ref={mapRef} style={{ height: '220px', width: '100%' }} />
      </div>

      {/* Keyboard accessible manual-entry fallback */}
      <div className="p-3 bg-gray-50 border-t border-gray-100 rounded-b-xl space-y-2">
        <p className="text-xs font-semibold text-gray-700">Keyboard Accessible Location Input</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label htmlFor="manual-latitude" className="block text-xs font-medium text-gray-600 mb-1">
              Latitude (-90 to 90)
            </label>
            <input
              id="manual-latitude"
              type="number"
              step="any"
              aria-label="Latitude coordinate"
              aria-invalid={invalid || undefined}
              aria-describedby={errorId}
              value={manualLat}
              onChange={e => setManualLat(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleApplyManual(e)}
              placeholder="e.g. 12.9716"
              className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
          <div>
            <label htmlFor="manual-longitude" className="block text-xs font-medium text-gray-600 mb-1">
              Longitude (-180 to 180)
            </label>
            <input
              id="manual-longitude"
              type="number"
              step="any"
              aria-label="Longitude coordinate"
              aria-invalid={invalid || undefined}
              aria-describedby={errorId}
              value={manualLon}
              onChange={e => setManualLon(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleApplyManual(e)}
              placeholder="e.g. 77.5946"
              className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
        </div>
        <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
          <button
            type="button"
            onClick={handleApplyManual}
            aria-label="Use these manual coordinates for the report"
            className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium px-3 py-1.5 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Use this location
          </button>
          <span aria-live="polite" className="text-xs text-gray-600">
            {statusMessage || 'Enter coordinates and press "Use this location" or click map'}
          </span>
        </div>
      </div>
    </div>
  )
}
