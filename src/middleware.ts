import { NextResponse, type NextRequest } from 'next/server'
import { createRemoteJWKSet, jwtVerify } from 'jose'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || ''
const PUBLIC_ROUTES = ['/', '/login', '/about', '/patient', '/triage']

const COGNITO_REGION = process.env.NEXT_PUBLIC_COGNITO_REGION || 'us-east-2'
const COGNITO_POOL_ID = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || 'us-east-2_9y6XyJnXC'
const ISSUER = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_POOL_ID}`
const JWKS_URL = `${ISSUER}/.well-known/jwks.json`

let cachedJWKS: ReturnType<typeof createRemoteJWKSet> | null = null

function getJWKS() {
  if (!cachedJWKS) {
    cachedJWKS = createRemoteJWKSet(new URL(JWKS_URL))
  }
  return cachedJWKS
}

async function verifyIdToken(token: string): Promise<boolean> {
  try {
    const jwks = getJWKS()
    await jwtVerify(token, jwks, { issuer: ISSUER })
    return true
  } catch {
    return false
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const response = NextResponse.next({ request: { headers: request.headers } })

  // Check ID token from cookie (new OAuth cookie name)
  const idToken = request.cookies.get('id_token')?.value
  const isAuthenticated = idToken ? await verifyIdToken(idToken) : false

  // --- View preference logic for root path ---
  if (pathname === '/') {
    const switchApp = request.nextUrl.searchParams.get('switch_app')
    if (switchApp === 'true') {
      response.cookies.delete('preferred_view')
      return response
    }

    const viewOverride = request.nextUrl.searchParams.get('view')
    if (viewOverride === 'desktop' || viewOverride === 'mobile') {
      const base = APP_URL || request.url
      const redirectResponse = NextResponse.redirect(
        new URL(viewOverride === 'mobile' ? '/mobile' : '/dashboard', base)
      )
      redirectResponse.cookies.set('preferred_view', viewOverride, { maxAge: 60 * 60 * 24 * 30, path: '/' })
      return redirectResponse
    }

    return response
  }

  // --- Auth protection for non-public routes ---
  const isPublic = PUBLIC_ROUTES.some(route => pathname === route || pathname.startsWith(route + '/'))
  const isApi = pathname.startsWith('/api/')
  const isStatic = pathname.startsWith('/_next/') || pathname.includes('.')

  if (!isPublic && !isApi && !isStatic && !isAuthenticated) {
    const loginBase = APP_URL || request.url
    const loginUrl = new URL('/login', loginBase)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
