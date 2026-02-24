import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const PUBLIC_ROUTES = ['/', '/login', '/signup', '/about', '/auth/callback']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Create a response we can modify
  let response = NextResponse.next({ request: { headers: request.headers } })

  // Create Supabase client for middleware (reads session from cookies)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // Validate auth with Supabase server (getUser verifies the JWT, unlike getSession)
  const { data: { user } } = await supabase.auth.getUser()

  // --- Existing view preference logic for root path ---
  if (pathname === '/') {
    const switchApp = request.nextUrl.searchParams.get('switch_app')
    if (switchApp === 'true') {
      response.cookies.delete('preferred_view')
      return response
    }

    const viewOverride = request.nextUrl.searchParams.get('view')
    if (viewOverride === 'desktop' || viewOverride === 'mobile') {
      const redirectResponse = NextResponse.redirect(
        new URL(viewOverride === 'mobile' ? '/mobile' : '/dashboard', request.url)
      )
      redirectResponse.cookies.set('preferred_view', viewOverride, { maxAge: 60 * 60 * 24 * 30, path: '/' })
      return redirectResponse
    }

    // Show homepage (no redirect based on saved preference anymore — homepage is the new landing)
    return response
  }

  // --- Auth protection for non-public routes ---
  const isPublic = PUBLIC_ROUTES.some(route => pathname === route || pathname.startsWith(route + '/'))
  // API routes and static assets should not be auth-gated
  const isApi = pathname.startsWith('/api/')
  const isStatic = pathname.startsWith('/_next/') || pathname.includes('.')

  if (!isPublic && !isApi && !isStatic && !user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: [
    // Match all routes except static files and Next.js internals
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
