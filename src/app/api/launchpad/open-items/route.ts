/**
 * GET /api/launchpad/open-items — live Asana status for the /launchpad page.
 *
 * Returns, per Portfolio card gid, the card's section (R&D stage), last
 * modified time, and its incomplete roadmap subtasks. Cognito-gated: this is
 * an internal surface and the response names internal work items, so it is
 * not on the unauthenticated /api/ list. No PHI is involved either way.
 */

import { NextResponse } from 'next/server'
import { getUser } from '@/lib/cognito/server'
import { fetchOpenItems } from '@/lib/launchpad/asana'
import { launchpadAsanaGids } from '@/lib/launchpad/data'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await fetchOpenItems(launchpadAsanaGids())
  return NextResponse.json(result, {
    status: result.ok ? 200 : 503,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
