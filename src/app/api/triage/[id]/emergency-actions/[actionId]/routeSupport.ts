import { NextResponse } from 'next/server'

import { authorizeClinicalAccess } from '@/lib/auth/clinicalAccess'
import type {
  EmergencyActionCommandResult,
} from '@/lib/triage/emergencyActionLifecycle'

export interface EmergencyActionRouteParams {
  params: Promise<{ id: string; actionId: string }>
}

export async function authorizeEmergencyActionMutation() {
  return authorizeClinicalAccess({
    action: 'triage.emergency_action',
    allowedRoles: ['clinician', 'admin'],
  })
}

export function readIdempotencyKey(request: Request): string | null {
  const value = request.headers.get('idempotency-key')?.trim() ?? ''
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(value)
    ? value
    : null
}

export async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const value = await request.json()
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

export function boundedBodyString(
  body: Record<string, unknown>,
  field: string,
  maximum: number,
): string | null {
  const value = body[field]
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed && trimmed.length <= maximum ? trimmed : null
}

export function emergencyActionResponse(
  result: EmergencyActionCommandResult,
) {
  if (result.ok) {
    return NextResponse.json({
      success: true,
      replayed: result.replayed,
      action: {
        id: result.action.id,
        status: result.action.status,
        owner_user_id: result.action.ownerUserId,
      },
    })
  }
  const status =
    result.reason === 'action_not_found'
      ? 404
      : result.reason === 'persistence_failed'
        ? 503
        : [
              'invalid_command',
              'invalid_idempotency_key',
              'invalid_contact_evidence',
              'invalid_disposition_evidence',
            ].includes(result.reason)
          ? 400
          : 409
  return NextResponse.json(
    {
      error: 'Emergency action command was not applied',
      reason: result.reason,
    },
    { status },
  )
}
