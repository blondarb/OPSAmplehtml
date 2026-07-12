import { NextResponse } from 'next/server'

import { claimEmergencyAction } from '@/lib/triage/emergencyActionLifecycle'
import {
  authorizeEmergencyActionMutation,
  emergencyActionResponse,
  readIdempotencyKey,
  type EmergencyActionRouteParams,
} from '../routeSupport'

export async function POST(
  request: Request,
  { params }: EmergencyActionRouteParams,
) {
  const access = await authorizeEmergencyActionMutation()
  if (!access.ok) {
    return NextResponse.json(
      { error: 'Access denied', reason: access.reason },
      { status: access.status },
    )
  }
  const idempotencyKey = readIdempotencyKey(request)
  if (!idempotencyKey) {
    return NextResponse.json(
      { error: 'A valid Idempotency-Key header is required' },
      { status: 400 },
    )
  }
  const { id, actionId } = await params
  return emergencyActionResponse(
    await claimEmergencyAction({
      triageSessionId: id,
      actionId,
      tenantId: access.context.tenantId,
      actorUserId: access.context.userId,
      actorRole: access.context.role as 'clinician' | 'admin',
      idempotencyKey,
    }),
  )
}
