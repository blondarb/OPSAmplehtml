import { NextResponse, type NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Temporarily simplified middleware - just pass through
  return NextResponse.next()
}

export const config = {
  matcher: [
    // Protected routes
    '/dashboard/:path*',
    '/physician/:path*',
  ],
}
