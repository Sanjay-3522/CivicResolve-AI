'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'

import PhotoField from '../components/report/PhotoField'
import SubmissionResult from '../components/report/SubmissionResult'
import TriageProgress from '../components/report/TriageProgress'
import type { SubmitResult } from '../components/report/types'
import {
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  FIELD_TARGET,
  TITLE_MAX,
  TITLE_MIN,
  validateReport,
  type FieldErrors,
  type ReportField,
} from '../components/report/validation'

const LocationPicker = dynamic(() => import('../components/LocationPicker'), { ssr: false })

const CATEGORIES = [
  { value: 'pothole', label: '🕳️ Pothole', color: 'bg-orange-50 border-orange-200 text-orange-700' },
  { value: 'garbage', label: '🗑️ Garbage', color: 'bg-green-50 border-green-200 text-green-700' },
  { value: 'streetlight', label: '💡 Streetlight', color: 'bg-yellow-50 border-yellow-200 text-yellow-700' },
  { value: 'water_leakage', label: '💧 Water Leakage', color: 'bg-blue-50 border-blue-200 text-blue-700' },
  { value: 'road_damage', label: '🚧 Road Damage', color: 'bg-red-50 border-red-200 text-red-700' },
  { value: 'other', label: '📋 Other', color: 'bg-gray-50 border-gray-200 text-gray-700' },
]

export default function ReportPage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [location, setLocation] = useState<{ lat: number; lon: number; address?: string } | null>(null)
  const [image, setImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<SubmitResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const errorSummaryRef = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState<'form' | 'processing' | 'done'>('form')

  const errorEntries = Object.entries(fieldErrors) as [ReportField, string][]
  const hasErrors = errorEntries.length > 0 || error !== null

  // Move focus to the error summary whenever validation or submission fails (WCAG 3.3.1).
  useEffect(() => {
    if (hasErrors && step === 'form') errorSummaryRef.current?.focus()
  }, [fieldErrors, error, hasErrors, step])

  const describedBy = (field: ReportField) => (fieldErrors[field] ? `error-${field}` : undefined)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errors = validateReport({ title, description, hasLocation: location !== null })
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0 || !location) {
      setError(null)
      return
    }

    setSubmitting(true)
    setStep('processing')
    setError(null)

    const formData = new FormData()
    formData.append('title', title)
    formData.append('description', description)
    formData.append('latitude', String(location.lat))
    formData.append('longitude', String(location.lon))
    if (location.address) formData.append('address', location.address)
    if (category) formData.append('category', category)
    if (image) formData.append('image', image)

    try {
      const res = await fetch('/api/reports', { method: 'POST', body: formData })
      if (!res.ok) throw new Error(await res.text())
      const data: SubmitResult = await res.json()
      setResult(data)
      setStep('done')
    } catch (err: unknown) {
      setError(err instanceof Error && err.message ? err.message : 'Submission failed. Please try again.')
      setFieldErrors({})
      setStep('form')
    } finally {
      setSubmitting(false)
    }
  }

  if (step === 'processing') return <TriageProgress />

  if (step === 'done' && result) {
    return (
      <SubmissionResult
        result={result}
        onTrack={reportId => router.push(`/track/${reportId}`)}
        onReset={() => {
          setStep('form')
          setResult(null)
          setTitle('')
          setDescription('')
          setCategory('')
          setLocation(null)
          setImage(null)
          setImagePreview(null)
        }}
      />
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Report a Civic Issue</h1>
        <p className="text-gray-600">
          Describe the issue and mark its location. When available, Google Gemini suggests a category, urgency and
          responsible department. If AI is unavailable, clearly labelled demo rules keep reporting functional.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        {hasErrors && (
          <div
            ref={errorSummaryRef}
            role="alert"
            tabIndex={-1}
            aria-labelledby="error-summary-heading"
            className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm flex items-start gap-2"
          >
            <span aria-hidden="true">⚠️</span>
            <div>
              <p id="error-summary-heading" className={errorEntries.length ? 'font-semibold' : undefined}>
                {error ?? 'Please fix the following before submitting:'}
              </p>
              {errorEntries.length > 0 && (
                <ul className="mt-1 list-disc pl-5">
                  {errorEntries.map(([field, msg]) => (
                    <li key={field} id={`error-${field}`}>
                      <a href={`#${FIELD_TARGET[field]}`} className="underline">
                        {msg}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* Category */}
        <div>
          <p id="category-label" className="block text-sm font-semibold text-gray-700 mb-3">
            Category <span className="text-gray-600 font-normal">(optional — AI will classify if unsure)</span>
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" role="group" aria-labelledby="category-label">
            {CATEGORIES.map(c => (
              <button
                key={c.value}
                type="button"
                aria-pressed={category === c.value}
                aria-label={`Category: ${c.label.replace(/^[^\s]+\s*/, '')}`}
                onClick={() => setCategory(category === c.value ? '' : c.value)}
                className={`p-3 rounded-xl border-2 text-sm font-medium transition-all text-left ${
                  category === c.value
                    ? c.color + ' border-current shadow-sm scale-95'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Title */}
        <div>
          <label htmlFor="report-title" className="block text-sm font-semibold text-gray-700 mb-2">
            Issue Title <span aria-hidden="true">*</span>
          </label>
          <input
            id="report-title"
            type="text"
            minLength={TITLE_MIN}
            maxLength={TITLE_MAX}
            aria-invalid={fieldErrors.title ? true : undefined}
            aria-describedby={describedBy('title')}
            aria-required="true"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Deep pothole on MG Road near signal"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-400 text-base"
            required
          />
        </div>

        {/* Description */}
        <div>
          <label htmlFor="report-description" className="block text-sm font-semibold text-gray-700 mb-2">
            Describe the Issue <span aria-hidden="true">*</span>
            <span className="text-xs font-normal text-gray-600 ml-2">
              More detail = better AI triage (10–2000 characters)
            </span>
          </label>
          <textarea
            id="report-description"
            minLength={DESCRIPTION_MIN}
            maxLength={DESCRIPTION_MAX}
            aria-invalid={fieldErrors.description ? true : undefined}
            aria-describedby={describedBy('description')}
            aria-required="true"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Describe the problem in detail. Mention nearby landmarks, how long it's been there, any safety risks (e.g. near school, electrical wires, busy road)..."
            rows={4}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-400 text-base resize-none"
            required
          />
        </div>

        {/* Location */}
        <div>
          <p className="block text-sm font-semibold text-gray-700 mb-2">
            Location <span aria-hidden="true">*</span>{' '}
            <span className="text-xs font-normal text-gray-600">Pin the exact location</span>
          </p>
          <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
            <LocationPicker
              onLocationSelect={setLocation}
              invalid={Boolean(fieldErrors.location)}
              errorId={describedBy('location')}
            />
          </div>
          {location && (
            <div className="mt-2 flex items-center gap-2 text-sm text-green-700">
              <span aria-hidden="true">📍</span>
              <span>{location.address || `${location.lat.toFixed(4)}, ${location.lon.toFixed(4)}`}</span>
            </div>
          )}
        </div>

        <PhotoField
          preview={imagePreview}
          onSelect={file => {
            setImage(file)
            setImagePreview(URL.createObjectURL(file))
          }}
          onRemove={() => {
            setImage(null)
            setImagePreview(null)
          }}
        />

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting || !location}
          className="w-full bg-blue-600 text-white py-4 rounded-xl font-semibold text-base hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <span aria-hidden="true" className="animate-spin">
                ⏳
              </span>{' '}
              Submitting…
            </>
          ) : (
            <>
              <span aria-hidden="true">🚀</span> Submit Report — AI Triage Runs Automatically
            </>
          )}
        </button>
        <p className="text-center text-xs text-gray-600">
          Your report will be classified, prioritised, and routed by Gemini AI. Duplicate reports within 150m are
          auto-merged.
        </p>
      </form>
    </div>
  )
}
