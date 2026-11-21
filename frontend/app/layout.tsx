import type { Metadata } from 'next'
import './globals.css'
import Link from 'next/link'
import RouteFocus from '../components/RouteFocus'

export const metadata: Metadata = {
  title: 'CivicResolve — Report & Track Civic Issues',
  description: 'AI-powered civic issue reporting with real accountability',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50">
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        <RouteFocus />
        <nav aria-label="Primary" className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-14">
              <Link href="/" className="flex items-center gap-2">
                <div aria-hidden="true" className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">CR</span>
                </div>
                <span className="font-bold text-gray-900 text-lg">CivicResolve</span>
                <span className="hidden sm:inline text-xs text-gray-600 ml-1">Beta</span>
              </Link>
              <div className="flex items-center gap-1 sm:gap-4">
                <Link
                  href="/"
                  className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-md hover:bg-gray-100 transition-colors"
                >
                  Report Issue
                </Link>
                <Link
                  href="/map"
                  className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-md hover:bg-gray-100 transition-colors"
                >
                  Map
                </Link>
                <Link
                  href="/admin"
                  prefetch={false}
                  className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 transition-colors font-medium"
                >
                  Admin
                </Link>
              </div>
            </div>
          </div>
        </nav>
        <main id="main" tabIndex={-1} className="focus:outline-none">
          {children}
        </main>
        <footer className="mt-16 border-t border-gray-200 py-8 text-center text-sm text-gray-600">
          CivicResolve — Built for transparent governance.
          <span className="ml-2">AI-powered • Open data • Accountable.</span>
        </footer>
      </body>
    </html>
  )
}
