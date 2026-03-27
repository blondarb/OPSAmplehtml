'use client'

export interface AuthUser {
  id: string
  email: string
}

/**
 * Get the currently authenticated user from the server
 */
export async function getAuthenticatedUser(): Promise<AuthUser | null> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/**
 * Attempt to refresh the session using the refresh token cookie
 */
export async function refreshSession(): Promise<AuthUser | null> {
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'same-origin',
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/**
 * Redirect to Cognito Hosted UI login
 */
export function redirectToLogin(returnTo?: string): void {
  const params = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''
  window.location.href = `/api/auth/login${params}`
}

/**
 * Sign out: clear cookies and Cognito session
 */
export function signOut(): void {
  window.location.href = '/api/auth/logout'
}

/**
 * Check if user is currently authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const user = await getAuthenticatedUser()
  return user !== null
}

/**
 * Stub for backward compatibility — tokens are now in httpOnly cookies
 */
export async function getIdToken(): Promise<string> {
  return 'cookie-auth'
}

// Re-export for backward compatibility
export { getAuthenticatedUser as getCurrentUser }
export async function getCurrentSession(): Promise<null> {
  return null
}
