import { NextResponse } from 'next/server'

import { clinicalAccessDeniedMessage } from '@/lib/auth/clinicalAccess'

import {
  closeEmergencyAction,
  type EmergencyDispositionCode,
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
  const dispositionCode =
    body && boundedBodyString(body, 'disposition_code', 100)
  const dispositionEvidence =
    body && boundedBodyString(body, 'disposition_evidence', 2_000)
  const recipientOrAgency =
    body && boundedBodyString(body, 'recipient_or_agency', 500)
  const destination = body && boundedBodyString(body, 'destination', 500)
  if (
    !body ||
    !dispositionCode ||
    !dispositionEvidence ||
    !recipientOrAgency ||
    !destination
  ) {
    return NextResponse.json(
      { error: 'Complete bounded disposition evidence is required' },
      { status: 400 },
    )
  }
  const { id, actionId } = await params
  return emergencyActionResponse(
    await closeEmergencyAction({
      triageSessionId: id,
      actionId,
      tenantId: access.context.tenantId,
      actorUserId: access.context.userId,
      actorRole: access.context.role as 'clinician' | 'admin',
      idempotencyKey,
      dispositionCode: dispositionCode as EmergencyDispositionCode,
      dispositionEvidence,
      recipientOrAgency,
      destination,
    }),
  )
}
