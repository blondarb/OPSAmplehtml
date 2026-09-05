import { NextResponse } from 'next/server'
import { authorizeClinicalAccess, clinicalAccessDeniedMessage } from '@/lib/auth/clinicalAccess'
import { getPool } from '@/lib/db'

export type ValidationPermission = 'review' | 'manage' | 'results'

/** No implicit access to legacy studies, including the study named default. */
export async function authorizeValidationStudy(
  studyName: unknown,
  permission: ValidationPermission = 'review',
) {
  const access = await authorizeClinicalAccess({
    action: 'triage.validate', allowedRoles: ['clinician', 'admin'],
  })
  if (!access.ok) return { ok: false as const, response: NextResponse.json(
    { error: clinicalAccessDeniedMessage(access.reason) }, { status: access.status },
  ) }
  if (typeof studyName !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(studyName)) {
    return { ok: false as const, response: NextResponse.json({ error: 'Invalid study' }, { status: 400 }) }
  }
  try {
    const { rows } = await (await getPool()).query(
      `SELECT s.phase, m.role FROM triage_validation_studies s
       JOIN triage_validation_memberships m ON m.study_name = s.study_name
       WHERE s.study_name = $1 AND s.tenant_id = $2 AND m.user_id = $3 AND m.active = true`,
      [studyName, access.context.tenantId, access.context.userId],
    )
    const member = rows[0]
    if (!member || !['reviewer', 'admin'].includes(member.role) ||
        !['draft', 'labeling', 'unblinded'].includes(member.phase) ||
        (permission === 'manage' && member.role !== 'admin')) {
      return { ok: false as const, response: NextResponse.json({ error: 'Study access denied' }, { status: 403 }) }
    }
    if (permission === 'results' && member.phase !== 'unblinded') {
      return { ok: false as const, response: NextResponse.json({ error: 'Study answers remain blinded' }, { status: 409 }) }
    }
    return { ok: true as const, context: access.context, studyName, phase: member.phase as 'draft' | 'labeling' | 'unblinded' }
  } catch {
    // Missing migration or unavailable membership store must never open a study.
    return { ok: false as const, response: NextResponse.json({ error: 'Study authorization unavailable' }, { status: 503 }) }
  }
}

export const BLINDED_CASE_FIELDS =
  'id,case_number,title,referral_text,patient_age,patient_sex,study_name,is_calibration,active,created_at'

export function lockedValidationResponse() {
  return NextResponse.json({ error: 'Study records are locked. Create a new study revision for changes.' }, { status: 409 })
}
