/** @type {import('next').NextConfig} */
const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN || 'http://localhost:8000'
const isDev = process.env.NODE_ENV !== 'production'

// Leaflet tiles (OSM), marker icons (unpkg) and reverse geocoding (Nominatim).
// Next's App Router injects inline bootstrap scripts, hence 'unsafe-inline' for
// scripts; dev mode additionally needs 'unsafe-eval' for fast refresh.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://tile.openstreetmap.org https://unpkg.com",
  `connect-src 'self' https://nominatim.openstreetmap.org${isDev ? ' ws: http://localhost:8000' : ''}`,
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(self), microphone=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
]

const nextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  compress: true,
  // The app never uses next/image; disabling the optimizer removes the /_next/image
  // attack surface (see security/npm-audit-allowlist.json).
  images: { unoptimized: true },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${BACKEND_ORIGIN}/api/:path*` },
      { source: '/uploads/:path*', destination: `${BACKEND_ORIGIN}/uploads/:path*` },
      { source: '/health', destination: `${BACKEND_ORIGIN}/health` },
    ]
  },
}

module.exports = nextConfig
