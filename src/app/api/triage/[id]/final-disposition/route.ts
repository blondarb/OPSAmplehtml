import { NextResponse } from 'next/server'

import { authorizeClinicalAccess } from '@/lib/auth/clinicalAccess'
export async function POST(
  _request?: Request,
  _context?: { params: Promise<{ id: string }> },
) {
  const access = await authorizeClinicalAccess({
    action: 'triage.finalize_outpatient',
    allowedRoles: ['clinician', 'admin'],
  })
  if (!access.ok) {
    return NextResponse.json(
      { error: 'Access denied', reason: access.reason },
      { status: access.status },
    )
  }
  return NextResponse.json(
    {
      error:
        'Outpatient finalization is not available until governed recommendation and clarification records are implemented.',
      reason: 'outpatient_finalization_not_available',
      scheduling_locked: true,
    },
    { status: 409 },
  )
}
