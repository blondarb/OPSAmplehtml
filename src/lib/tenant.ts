/**
 * Tenant helpers for multi-tenant demo isolation.
 *
 * Server code reads process.env.DEMO_TENANT.
 * Client code reads process.env.NEXT_PUBLIC_DEMO_TENANT.
 *
 * Both fall back to 'default' so existing single-tenant behaviour is preserved.
 */

const FALLBACK_TENANT = 'default'

/** Call from Server Components / Route Handlers / middleware. */
export function getTenantServer(): string {
  return process.env.DEMO_TENANT || FALLBACK_TENANT
}

/** Call from Client Components ('use client'). */
export function getTenantClient(): string {
  return process.env.NEXT_PUBLIC_DEMO_TENANT || FALLBACK_TENANT
}
