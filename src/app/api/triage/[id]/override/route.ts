import { NextResponse } from 'next/server'

import { authorizeClinicalAccess } from '@/lib/auth/clinicalAccess'
import { recordClinicianTierEscalation } from '@/lib/triage/clinicianEscalation'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await authorizeClinicalAccess({
    action: 'triage.escalate',
    allowedRoles: ['clinician', 'admin'],
  })
  if (!access.ok) {
    return NextResponse.json(
      { error: 'Access denied', reason: access.reason },
      { status: access.status },
    )
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { id } = await params
  const newTier =
    typeof body.new_tier === 'string' ? body.new_tier.trim() : ''
  const reason =
    typeof body.override_reason === 'string'
      ? body.override_reason.trim()
      : ''
  if (!newTier || !reason) {
    return NextResponse.json(
      { error: 'new_tier and override_reason are required' },
      { status: 400 },
    )
  }
  if (reason.length > 1000) {
    return NextResponse.json(
      { error: 'override_reason exceeds 1,000 characters' },
      { status: 400 },
    )
  }

  const result = await recordClinicianTierEscalation({
    triageSessionId: id,
    tenantId: access.context.tenantId,
    actorUserId: access.context.userId,
    actorRole: access.context.role as 'clinician' | 'admin',
    newTier,
    reason,
  })
  if (!result.ok) {
    const status =
      result.reason === 'triage_session_not_found'
        ? 404
        : result.reason === 'escalation_persistence_failed'
          ? 503
          : 409
    return NextResponse.json(
      { error: 'Triage escalation was not applied', reason: result.reason },
      { status },
    )
  }

  return NextResponse.json({ success: true, new_tier: newTier })
}
