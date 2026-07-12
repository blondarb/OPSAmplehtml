import {
  authorizeClinicalAccess,
  type ClinicalAccessResult,
  type ClinicalAction,
  type ClinicalRole,
} from '@/lib/auth/clinicalAccess'
import type { PatientAccessScope } from './capability'
import {
  authorizePatientRequest,
  type PatientRequestAuthorizationResult,
} from './requestAuthorization'

export type ClinicalOrPatientAccessResult =
  | {
      ok: true
      principal: 'clinical'
      context: Extract<ClinicalAccessResult, { ok: true }>['context']
    }
  | {
      ok: true
      principal: 'patient'
      context: Extract<PatientRequestAuthorizationResult, { ok: true }>['context']
    }
  | {
      ok: false
      status: 401 | 403 | 503
      reason:
        | Extract<ClinicalAccessResult, { ok: false }>['reason']
        | Extract<PatientRequestAuthorizationResult, { ok: false }>['reason']
    }

export async function authorizeClinicalOrPatientAccess(input: {
  clinicalAction: ClinicalAction
  clinicalRoles: readonly ClinicalRole[]
  patientScopes: readonly PatientAccessScope[]
  expectedPatientId?: string
  expectedConsultId?: string | null
}): Promise<ClinicalOrPatientAccessResult> {
  const clinical = await authorizeClinicalAccess({
    action: input.clinicalAction,
    allowedRoles: input.clinicalRoles,
  })
  if (clinical.ok) {
    return { ok: true, principal: 'clinical', context: clinical.context }
  }

  const patient = await authorizePatientRequest({
    requiredScopes: input.patientScopes,
    ...(input.expectedPatientId !== undefined
      ? { expectedPatientId: input.expectedPatientId }
      : {}),
    ...(input.expectedConsultId !== undefined
      ? { expectedConsultId: input.expectedConsultId }
      : {}),
  })
  if (patient.ok) {
    return { ok: true, principal: 'patient', context: patient.context }
  }

  if (patient.reason === 'missing_patient_session') {
    return clinical
  }
  return patient
}
