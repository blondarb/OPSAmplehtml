import { cookies } from 'next/headers'

import { getPool } from '@/lib/db'
import {
  loadPatientAccessKeyRing,
  type PatientAccessScope,
} from './capability'
import { PATIENT_ACCESS_COOKIE_NAME } from './cookie'
import { createPostgresPatientAccessRepository } from './postgresRepository'
import {
  PatientAccessServiceError,
  authorizePatientSession,
} from './service'

export type PatientRequestAuthorizationResult =
  | {
      ok: true
      context: {
        tenantId: string
        patientId: string
        consultId?: string
        scopes: readonly PatientAccessScope[]
        expiresAtEpochSeconds: number
      }
    }
  | {
      ok: false
      status: 401 | 403 | 503
      reason:
        | 'missing_patient_session'
        | 'invalid_patient_session'
        | 'binding_mismatch'
        | 'scope_denied'
        | 'authorization_unavailable'
    }

export async function authorizePatientRequest(input: {
  expectedTenantId?: string
  expectedPatientId?: string
  expectedConsultId?: string | null
  requiredScopes: readonly PatientAccessScope[]
}): Promise<PatientRequestAuthorizationResult> {
  let token: string | undefined
  try {
    const cookieStore = await cookies()
    token = cookieStore.get(PATIENT_ACCESS_COOKIE_NAME)?.value
  } catch {
    console.error('[patient-access] authorization unavailable')
    return { ok: false, status: 503, reason: 'authorization_unavailable' }
  }
  if (!token) {
    return { ok: false, status: 401, reason: 'missing_patient_session' }
  }

  try {
    const keys = loadPatientAccessKeyRing()
    const repository = createPostgresPatientAccessRepository(await getPool())
    const claims = await authorizePatientSession(
      {
        token,
        ...(input.expectedTenantId !== undefined
          ? { expectedTenantId: input.expectedTenantId }
          : {}),
        ...(input.expectedPatientId !== undefined
          ? { expectedPatientId: input.expectedPatientId }
          : {}),
        ...(input.expectedConsultId !== undefined
          ? { expectedConsultId: input.expectedConsultId }
          : {}),
        requiredScopes: input.requiredScopes,
      },
      { repository, keys },
    )
    return {
      ok: true,
      context: {
        tenantId: claims.tenant_id,
        patientId: claims.patient_id,
        ...(claims.consult_id ? { consultId: claims.consult_id } : {}),
        scopes: claims.scopes,
        expiresAtEpochSeconds: claims.exp,
      },
    }
  } catch (error) {
    if (error instanceof PatientAccessServiceError) {
      if (error.code === 'scope_denied') {
        return { ok: false, status: 403, reason: 'scope_denied' }
      }
      if (error.code === 'binding_invalid') {
        return { ok: false, status: 403, reason: 'binding_mismatch' }
      }
      if (
        error.code === 'expired' ||
        error.code === 'revoked' ||
        error.code === 'unknown_capability' ||
        error.code === 'invalid_capability'
      ) {
        return { ok: false, status: 401, reason: 'invalid_patient_session' }
      }
    }
    console.error('[patient-access] authorization unavailable')
    return { ok: false, status: 503, reason: 'authorization_unavailable' }
  }
}
