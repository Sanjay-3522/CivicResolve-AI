import { useRef } from 'react'

interface PhotoFieldProps {
  preview: string | null
  onSelect: (file: File) => void
  onRemove: () => void
}

/** Optional issue photo: keyboard-reachable file input with preview and remove. */
export default function PhotoField({ preview, onSelect, onRemove }: PhotoFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div>
      <p className="block text-sm font-semibold text-gray-700 mb-2">
        Photo <span className="text-xs font-normal text-gray-600">Strongly recommended — improves AI accuracy</span>
      </p>
      {preview ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element -- blob previews / backend uploads, not optimisable by next/image */}
          <img
            src={preview}
            width={640}
            height={192}
            alt="Preview of uploaded issue"
            className="w-full h-48 object-cover rounded-xl border border-gray-200"
          />
          <button
            type="button"
            aria-label="Remove uploaded photo"
            onClick={() => {
              if (inputRef.current) inputRef.current.value = ''
              onRemove()
            }}
            className="absolute top-2 right-2 bg-white rounded-full p-1 shadow-sm text-gray-600 hover:text-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            ✕
          </button>
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors focus-within:ring-2 focus-within:ring-blue-600 focus-within:ring-offset-2">
          <span className="text-3xl mb-2" aria-hidden="true">
            📷
          </span>
          <span className="text-sm text-gray-600">Tap to add photo</span>
          <span className="text-xs text-gray-600">JPG, PNG, WebP up to 8MB</span>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Upload issue photo"
            onChange={e => {
              const file = e.target.files?.[0]
              if (file) onSelect(file)
            }}
            className="sr-only"
          />
        </label>
      )}
    </div>
  )
}
