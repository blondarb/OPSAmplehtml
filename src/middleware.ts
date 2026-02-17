import { NextResponse, type NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Check for switch_app flag - allow landing page to show when switching apps
  const switchApp = request.nextUrl.searchParams.get('switch_app')
  if (switchApp === 'true') {
    // Clear the preferred_view cookie and show landing page
    const response = NextResponse.next()
    response.cookies.delete('preferred_view')
    return response
  }

  // Check for manual view override via query param
  const viewOverride = request.nextUrl.searchParams.get('view')
  if (viewOverride === 'desktop' || viewOverride === 'mobile') {
    // Set cookie and redirect without the query param
    const response = NextResponse.redirect(
      new URL(viewOverride === 'mobile' ? '/mobile' : '/dashboard', request.url)
    )
    response.cookies.set('preferred_view', viewOverride, {
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
    })
    return response
  }

  // Only auto-redirect from root path
  if (pathname === '/') {
    // Check for saved preference first
    const savedPreference = request.cookies.get('preferred_view')?.value
    if (savedPreference === 'mobile') {
      return NextResponse.redirect(new URL('/mobile', request.url))
    }
    if (savedPreference === 'desktop') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    // No saved preference — show the landing page so users can choose
    return NextResponse.next()
  }

  // Allow all other routes to pass through
  // Users can manually navigate to /dashboard on mobile or /mobile on desktop
  return NextResponse.next()
}

export const config = {
  matcher: [
    // Root path for auto-redirect
    '/',
    // Protected routes
    '/dashboard/:path*',
    '/physician/:path*',
    '/mobile/:path*',
  ],
}
