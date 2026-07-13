import { getPool } from '@/lib/db'

export type TriageInputBindingDecision =
  | { allowed: true }
  | {
      allowed: false
      reason:
        | 'patient_not_found'
        | 'consult_not_found'
        | 'patient_consult_mismatch'
    }

export async function validateTriageInputBindings(input: {
  tenantId: string
  patientId?: string
  consultId?: string
}): Promise<TriageInputBindingDecision> {
  const pool = await getPool()

  if (input.patientId) {
    const { rows } = await pool.query(
      `SELECT id
         FROM patients
        WHERE id = $1
          AND tenant_id = $2
        LIMIT 1`,
      [input.patientId, input.tenantId],
    )
    if (!rows[0]) return { allowed: false, reason: 'patient_not_found' }
  }

  if (input.consultId) {
    const { rows } = await pool.query(
      `SELECT id, patient_id
         FROM neurology_consults
        WHERE id = $1
          AND tenant_id = $2
        LIMIT 1`,
      [input.consultId, input.tenantId],
    )
    const consult = rows[0] as
      | { id: string; patient_id: string | null }
      | undefined
    if (!consult) return { allowed: false, reason: 'consult_not_found' }
    if (
      input.patientId &&
      consult.patient_id &&
      consult.patient_id !== input.patientId
    ) {
      return { allowed: false, reason: 'patient_consult_mismatch' }
    }
  }

  return { allowed: true }
}
