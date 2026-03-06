import { NextResponse, type NextRequest } from 'next/server'
import { createRemoteJWKSet, jwtVerify } from 'jose'

const PUBLIC_ROUTES = ['/', '/login', '/signup', '/about', '/auth/confirm', '/patient', '/triage']

const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID
const COGNITO_REGION = process.env.COGNITO_REGION || process.env.NEXT_PUBLIC_COGNITO_REGION || 'us-east-2'
const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID || process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID

const ISSUER = COGNITO_USER_POOL_ID
  ? `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}`
  : ''

const JWKS_URL = ISSUER ? `${ISSUER}/.well-known/jwks.json` : ''

let cachedJWKS: ReturnType<typeof createRemoteJWKSet> | null = null

function getJWKS() {
  if (!cachedJWKS && JWKS_URL) {
    cachedJWKS = createRemoteJWKSet(new URL(JWKS_URL))
  }
  return cachedJWKS
}

async function verifyIdToken(token: string): Promise<boolean> {
  if (!COGNITO_USER_POOL_ID || !COGNITO_CLIENT_ID) return false

  try {
    const jwks = getJWKS()
    if (!jwks) return false

    await jwtVerify(token, jwks, {
      issuer: ISSUER,
      audience: COGNITO_CLIENT_ID,
    })
    return true
  } catch {
    return false
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const response = NextResponse.next({ request: { headers: request.headers } })

  // Check Cognito ID token from cookie
  const idToken = request.cookies.get('cognito-id-token')?.value
  const isAuthenticated = idToken ? await verifyIdToken(idToken) : false

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

    return response
  }

  // --- Auth protection for non-public routes ---
  const isPublic = PUBLIC_ROUTES.some(route => pathname === route || pathname.startsWith(route + '/'))
  const isApi = pathname.startsWith('/api/')
  const isStatic = pathname.startsWith('/_next/') || pathname.includes('.')

  if (!isPublic && !isApi && !isStatic && !isAuthenticated) {
    const loginUrl = new URL('/login', request.url)
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
