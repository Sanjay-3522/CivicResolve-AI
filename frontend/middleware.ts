import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Gate /admin and all subpaths EXCEPT /admin/login
  if (pathname.startsWith('/admin') && !pathname.startsWith('/admin/login')) {
    const adminKey = request.cookies.get('admin_key')?.value

    if (!adminKey) {
      const loginUrl = new URL('/admin/login', request.url)
      loginUrl.searchParams.set('from', pathname)
      const res = NextResponse.redirect(loginUrl)
      res.headers.set('Cache-Control', 'no-store')
      return res
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin', '/admin/:path*'],
}
