/**
 * CivicResolve — Admin Authentication Utilities
 *
 * The admin session lives in an HttpOnly, Secure, SameSite=Lax cookie that the
 * backend issues on /api/admin/login. It holds an opaque server-side session token
 * (never the admin key) and is unreadable from JS. The browser attaches it to
 * same-origin /api requests automatically; nothing is stored client-side.
 */

/** Same-origin fetch for admin endpoints — the session cookie is sent automatically. */
export function adminFetch(input: string, init: RequestInit = {}): Promise<Response> {
  return fetch(input, { ...init, credentials: 'same-origin' })
}

/** Exchange the admin key for a session cookie. The key is sent once, never persisted. */
export async function loginAdmin(key: string): Promise<boolean> {
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  })
  return res.ok
}

/** Revoke the server-side session and clear the HttpOnly cookie (JS cannot clear it). */
export async function clearAdminSession(): Promise<void> {
  if (typeof window === 'undefined') return
  try {
    await fetch('/api/admin/logout', {
      method: 'POST',
      credentials: 'same-origin',
      keepalive: true,
    })
  } catch {
    // Network failure: the session still expires server-side.
  }
}
