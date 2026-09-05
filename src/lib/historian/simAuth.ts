/**
 * Auth guard for the historian simulator's API routes.
 *
 * These routes back /rnd/historian/simulator, which the middleware already
 * gates behind Cognito. But the middleware short-circuits everything under
 * /api/ (`const isApi = pathname.startsWith('/api/')` in src/middleware.ts,
 * deliberate — see CLAUDE.md on avoiding edge-function issues), so the page
 * was protected while the data behind it was not: an unauthenticated GET on
 * /api/ai/historian/sim/runs returned whole run records including transcript
 * narrative, and POST /api/ai/historian/sim/import wrote into a prod table.
 *
 * Deliberately NOT applied to the patient-facing historian routes (session,
 * transcript-flush, save, scales, evidence-query, localizer, escalation,
 * patient-report). `/patient` is in PUBLIC_ROUTES and interviewees have no
 * Cognito session, so gating those on getUser() would break the live
 * interview. Those need a different mechanism (an invite/session token) and a
 * separate change — this one only covers the clinician-only R&D surface,
 * where the correct posture is unambiguous.
 */
import { NextResponse } from 'next/server'

import { getUser } from '@/lib/cognito/server'

/**
 * Returns a 401 response to hand straight back, or null when the caller is
 * authenticated. Usage at the top of a handler:
 *
 *   const denied = await requireSimUser()
 *   if (denied) return denied
 */
export async function requireSimUser(): Promise<NextResponse | null> {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}
