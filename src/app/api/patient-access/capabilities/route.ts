import { NextResponse } from 'next/server'

import { authorizeClinicalAccess } from '@/lib/auth/clinicalAccess'
import { getPool } from '@/lib/db'
import {
  PATIENT_ACCESS_SCOPES,
  loadPatientAccessKeyRing,
  type PatientAccessScope,
} from '@/lib/patientAccess/capability'
import { createPostgresPatientAccessRepository } from '@/lib/patientAccess/postgresRepository'
import {
  PatientAccessServiceError,
  issuePatientInvite,
} from '@/lib/patientAccess/service'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SCOPE_SET = new Set<string>(PATIENT_ACCESS_SCOPES)
const MAX_ISSUANCE_BODY_BYTES = 16 * 1024

function noStoreJson(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { 'cache-control': 'no-store' },
  })
}

export async function POST(request: Request) {
  const access = await authorizeClinicalAccess({
    action: 'patient.capability_issue',
    allowedRoles: ['clinician', 'admin'],
  })
  if (!access.ok) {
    return noStoreJson(
      { error: 'Access denied', reason: access.reason },
      access.status,
    )
  }

  let body: Record<string, unknown>
  try {
    const rawBody = await request.text()
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_ISSUANCE_BODY_BYTES) {
      return noStoreJson({ error: 'Request too large' }, 413)
    }
    const parsed: unknown = JSON.parse(rawBody)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return noStoreJson({ error: 'Invalid request' }, 400)
    }
    body = parsed as Record<string, unknown>
  } catch {
    return noStoreJson({ error: 'Invalid request' }, 400)
  }

  const patientId = typeof body.patient_id === 'string' ? body.patient_id : ''
  const consultId = typeof body.consult_id === 'string' ? body.consult_id : undefined
  const scopes = body.scopes
  const ttlSeconds = body.ttl_seconds === undefined ? undefined : body.ttl_seconds
  if (
    !UUID_PATTERN.test(patientId) ||
    (consultId !== undefined && !UUID_PATTERN.test(consultId)) ||
    !Array.isArray(scopes) ||
    scopes.length < 1 ||
    scopes.length > PATIENT_ACCESS_SCOPES.length ||
    scopes.some((scope) => typeof scope !== 'string' || !SCOPE_SET.has(scope)) ||
    new Set(scopes).size !== scopes.length ||
    (ttlSeconds !== undefined && !Number.isSafeInteger(ttlSeconds))
  ) {
    return noStoreJson({ error: 'Invalid request' }, 400)
  }

  try {
    const keys = loadPatientAccessKeyRing()
    const pool = await getPool()
    const repository = createPostgresPatientAccessRepository(pool)
    const result = await issuePatientInvite(
      {
        tenantId: access.context.tenantId,
        patientId,
        ...(consultId ? { consultId } : {}),
        scopes: scopes as PatientAccessScope[],
        ...(typeof ttlSeconds === 'number' ? { ttlSeconds } : {}),
        actorUserId: access.context.userId,
        actorRole: access.context.role as 'clinician' | 'admin',
      },
      { repository, keys },
    )
    return noStoreJson(
      {
        capability_token: result.token,
        expires_at: result.claims.exp,
        exchange: {
          transport: 'url_fragment',
          fragment_parameter: 'capability',
          method: 'POST',
          endpoint: '/api/patient-access/redeem',
        },
      },
      201,
    )
  } catch (error) {
    if (error instanceof PatientAccessServiceError) {
      if (error.code === 'binding_invalid') {
        return noStoreJson({ error: 'Patient or consult not found' }, 404)
      }
      if (error.code === 'invalid_request') {
        return noStoreJson({ error: 'Invalid request' }, 400)
      }
      if (error.code === 'actor_forbidden') {
        return noStoreJson({ error: 'Access denied' }, 403)
      }
    }
    console.error('[patient-access/issue] issuance unavailable')
    return noStoreJson({ error: 'Patient access issuance unavailable' }, 503)
  }
}
