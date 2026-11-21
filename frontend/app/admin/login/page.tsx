'use client'
import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { loginAdmin } from '../../../lib/auth'

function AdminLoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const rawFrom = searchParams.get('from') || '/admin'
  // Only allow redirects back into the admin area (blocks open redirects like ?from=//evil.com)
  const from = /^\/admin(\/|$|\?)/.test(rawFrom) ? rawFrom : '/admin'

  const [key, setKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!key.trim()) {
      setError('Please enter the Admin API Key')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const ok = await loginAdmin(key.trim())
      if (!ok) {
        throw new Error('Invalid admin key, or too many attempts. Please try again.')
      }

      setKey('')
      router.push(from)
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error && err.message ? err.message : 'Login failed. Please check the admin key.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div
          aria-hidden="true"
          className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-3 shadow-md"
        >
          <span className="text-white font-bold text-xl">CR</span>
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">CivicResolve Admin Portal</h2>
        <p className="mt-1 text-sm text-gray-600">
          Enter the administrative security key to access municipal queues and controls.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white py-8 px-6 shadow-sm border border-gray-200 rounded-2xl sm:px-10">
          <form className="space-y-6" onSubmit={handleLogin}>
            {error && (
              <div
                role="alert"
                aria-live="assertive"
                className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 flex items-center gap-2"
              >
                <span aria-hidden="true">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <div>
              <label htmlFor="admin-key" className="block text-sm font-semibold text-gray-700 mb-2">
                Admin Secret Key (ADMIN_API_KEY)
              </label>
              <div className="mt-1">
                <input
                  id="admin-key"
                  name="key"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={key}
                  onChange={e => setKey(e.target.value)}
                  placeholder="Enter ADMIN_API_KEY"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-400 text-sm"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading || !key.trim()}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Authenticating…' : 'Sign in to Admin Dashboard'}
              </button>
            </div>
          </form>

          <div className="mt-6 border-t border-gray-100 pt-4 text-center">
            <Link href="/" className="text-xs text-blue-700 hover:underline">
              ← Return to Citizen Reporting
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AdminLoginPage() {
  // useSearchParams() requires a Suspense boundary for static prerendering
  return (
    <Suspense fallback={null}>
      <AdminLoginForm />
    </Suspense>
  )
}
