/**
 * APP_MODE helpers.
 *
 * Two modes:
 *   - "full_demo"       → landing page at "/" with physician + patient selection
 *   - "physician_only"  → "/" redirects straight to /physician
 *
 * The env var is NEXT_PUBLIC_APP_MODE so it is available on client and server.
 * Falls back to "physician_only" for backwards compatibility with existing deploys.
 */

export type AppMode = 'full_demo' | 'physician_only'

export function getAppMode(): AppMode {
  const raw = process.env.NEXT_PUBLIC_APP_MODE
  if (raw === 'full_demo') return 'full_demo'
  return 'physician_only'
}

/**
 * Server-side check: are demo/seed/reset endpoints allowed?
 *
 * Set DEMO_ENDPOINTS_ENABLED=true in environment to allow demo data operations.
 * Defaults to false in production to prevent accidental data manipulation.
 */
export function isDemoEndpointsEnabled(): boolean {
  return process.env.DEMO_ENDPOINTS_ENABLED === 'true'
}
