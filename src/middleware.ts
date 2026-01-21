import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    // If env vars are missing, just pass through
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.next()
    }

    let supabaseResponse = NextResponse.next({
      request,
    })

    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            supabaseResponse = NextResponse.next({
              request,
            })
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    // Refresh session if expired - wrap in try-catch
    let user = null
    try {
      const { data } = await supabase.auth.getUser()
      user = data?.user ?? null
    } catch {
      // Auth check failed, continue without user
      user = null
    }

    // Protected routes - redirect to login if not authenticated
    const protectedPaths = ['/dashboard', '/app', '/clinical']
    const isProtectedPath = protectedPaths.some(path =>
      request.nextUrl.pathname.startsWith(path)
    )

    if (isProtectedPath && !user) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('redirectTo', request.nextUrl.pathname)
      return NextResponse.redirect(url)
    }

    // Redirect logged-in users away from auth pages
    const authPaths = ['/login', '/signup']
    const isAuthPath = authPaths.some(path =>
      request.nextUrl.pathname.startsWith(path)
    )

    if (isAuthPath && user) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }

    return supabaseResponse
  } catch {
    // If anything fails, just pass through
    return NextResponse.next()
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
