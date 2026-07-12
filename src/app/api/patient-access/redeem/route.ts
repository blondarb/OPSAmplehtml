import { NextResponse } from 'next/server'

import { getPool } from '@/lib/db'
import {
  PATIENT_ACCESS_MAX_TOKEN_BYTES,
  loadPatientAccessKeyRing,
} from '@/lib/patientAccess/capability'
import {
  PATIENT_ACCESS_COOKIE_NAME,
  PATIENT_ACCESS_COOKIE_SECURITY,
} from '@/lib/patientAccess/cookie'
import { createPostgresPatientAccessRepository } from '@/lib/patientAccess/postgresRepository'
import {
  PatientAccessServiceError,
  redeemPatientInvite,
} from '@/lib/patientAccess/service'
import { validateSameOriginJsonRequest } from '@/lib/patientAccess/sameOrigin'

const MAX_REDEMPTION_BODY_BYTES = 8192
const SESSION_TTL_SECONDS = 15 * 60

function noStoreJson(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { 'cache-control': 'no-store' },
  })
}

export async function POST(request: Request) {
  const provenance = validateSameOriginJsonRequest(request)
  if (!provenance.ok) {
    return noStoreJson({ error: 'Invalid request' }, provenance.status)
  }

  // Invitations are deliberately exchanged from a same-origin URL fragment.
  // Query-string tokens are never accepted because they leak into logs/history.
  if (new URL(request.url).searchParams.has('capability')) {
    return noStoreJson({ error: 'Invalid request' }, 400)
  }

  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    return noStoreJson({ error: 'Invalid request' }, 400)
  }
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_REDEMPTION_BODY_BYTES) {
    return noStoreJson({ error: 'Request too large' }, 413)
  }

  let body: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(rawBody)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return noStoreJson({ error: 'Invalid request' }, 400)
    }
    body = parsed as Record<string, unknown>
  } catch {
    return noStoreJson({ error: 'Invalid request' }, 400)
  }

  const token =
    typeof body.capability_token === 'string' ? body.capability_token : ''
  if (
    !token ||
    Buffer.byteLength(token, 'utf8') > PATIENT_ACCESS_MAX_TOKEN_BYTES
  ) {
    return noStoreJson({ error: 'Invalid request' }, 400)
  }

  try {
    const keys = loadPatientAccessKeyRing()
    const pool = await getPool()
    const repository = createPostgresPatientAccessRepository(pool)
    const result = await redeemPatientInvite(
      { token },
      { repository, keys },
    )
    const response = noStoreJson(
      {
        success: true,
        expires_at: result.claims.exp,
        redirect_path: '/patient/historian',
      },
      200,
    )
    const now = Math.floor(Date.now() / 1000)
    response.cookies.set(PATIENT_ACCESS_COOKIE_NAME, result.sessionToken, {
      ...PATIENT_ACCESS_COOKIE_SECURITY,
      maxAge: Math.max(
        1,
        Math.min(SESSION_TTL_SECONDS, result.claims.exp - now),
      ),
      expires: new Date(result.claims.exp * 1000),
    })
    return response
  } catch (error) {
    if (error instanceof PatientAccessServiceError) {
      const status = error.code === 'replay_detected' ? 409 : 401
      return noStoreJson(
        {
          error: 'Patient access invitation cannot be redeemed',
          reason: error.code,
        },
        status,
      )
    }
    console.error('[patient-access/redeem] redemption unavailable')
    return noStoreJson({ error: 'Patient access redemption unavailable' }, 503)
  }
}
