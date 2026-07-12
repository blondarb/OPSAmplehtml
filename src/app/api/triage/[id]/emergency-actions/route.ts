import { NextResponse } from 'next/server'

import { authorizeClinicalAccess } from '@/lib/auth/clinicalAccess'
import { loadEmergencyActions } from '@/lib/triage/emergencyActionRead'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await authorizeClinicalAccess({
    action: 'triage.read',
    allowedRoles: ['clinician', 'admin'],
  })
  if (!access.ok) {
    return NextResponse.json(
      { error: 'Access denied', reason: access.reason },
      { status: access.status },
    )
  }

  const { id } = await params
  const result = await loadEmergencyActions(id, access.context.tenantId)
  if (!result.ok) {
    return NextResponse.json(
      {
        error:
          result.reason === 'triage_session_not_found'
            ? 'Triage session not found'
            : 'Emergency actions are temporarily unavailable',
        reason: result.reason,
      },
      { status: result.reason === 'triage_session_not_found' ? 404 : 503 },
    )
  }

  return NextResponse.json({ actions: result.actions })
}
