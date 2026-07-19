import { NextResponse } from 'next/server'

import { clinicalAccessDeniedMessage } from '@/lib/auth/clinicalAccess'

import {
  recordEmergencyContactAttempt,
  type EmergencyContactChannel,
  type EmergencyContactOutcomeCode,
} from '@/lib/triage/emergencyActionLifecycle'
import {
  authorizeEmergencyActionMutation,
  boundedBodyString,
  emergencyActionResponse,
  readIdempotencyKey,
  readJsonObject,
  type EmergencyActionRouteParams,
} from '../routeSupport'

export async function POST(
  request: Request,
  { params }: EmergencyActionRouteParams,
) {
  const access = await authorizeEmergencyActionMutation()
  if (!access.ok) {
    return NextResponse.json(
      { error: clinicalAccessDeniedMessage(access.reason), reason: access.reason },
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
  const body = await readJsonObject(request)
  const channel = body && boundedBodyString(body, 'channel', 64)
  const instructionGiven =
    body && boundedBodyString(body, 'instruction_given', 2_000)
  const deliveryStatus =
    body && boundedBodyString(body, 'delivery_status', 32)
  const understandingStatus =
    body && boundedBodyString(body, 'understanding_status', 32)
  const outcomeCode = body && boundedBodyString(body, 'outcome_code', 64)
  const outcomeSummary =
    body && boundedBodyString(body, 'outcome_summary', 2_000)
  if (
    !body ||
    !channel ||
    !instructionGiven ||
    !deliveryStatus ||
    !understandingStatus ||
    !outcomeCode ||
    !outcomeSummary
  ) {
    return NextResponse.json(
      { error: 'Complete bounded contact evidence is required' },
      { status: 400 },
    )
  }
  const { id, actionId } = await params
  return emergencyActionResponse(
    await recordEmergencyContactAttempt({
      triageSessionId: id,
      actionId,
      tenantId: access.context.tenantId,
      actorUserId: access.context.userId,
      actorRole: access.context.role as 'clinician' | 'admin',
      idempotencyKey,
      channel: channel as EmergencyContactChannel,
      instructionGiven,
      deliveryStatus: deliveryStatus as 'delivered' | 'failed' | 'not_applicable',
      understandingStatus: understandingStatus as
        | 'confirmed'
        | 'not_confirmed'
        | 'not_applicable',
      outcomeCode: outcomeCode as EmergencyContactOutcomeCode,
      outcomeSummary,
    }),
  )
}
