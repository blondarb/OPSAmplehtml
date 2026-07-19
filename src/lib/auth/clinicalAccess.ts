import { getUser } from '@/lib/cognito/server'
import { getPool } from '@/lib/db'
import { getTenantServer } from '@/lib/tenant'

export type ClinicalRole = 'clinician' | 'scheduler' | 'admin' | 'viewer'

export type ClinicalAction =
  | 'triage.create'
  | 'triage.read'
  | 'triage.link_patient'
  | 'triage.extract'
  | 'triage.escalate'
  | 'triage.emergency_action'
  | 'triage.finalize_outpatient'
  | 'triage.fuse'
  | 'triage.schedule'
  | 'consult.read'
  | 'consult.update'
  | 'consult.initiate_intake'
  | 'consult.sdne_write'
  | 'historian.start'
  | 'historian.renew'
  | 'historian.save'
  | 'historian.scale_write'
  | 'historian.scale_read'
  | 'historian.localize'
  | 'historian.patient_report'
  | 'patient.context_read'
  | 'patient.lookup'
  | 'patient.list'
  | 'patient.create'
  | 'patient.read'
  | 'patient.register'
  | 'patient.message_read'
  | 'patient.message_write'
  | 'patient.message_draft_review'
  | 'patient.tools_read'
  | 'patient.tools_write'
  | 'follow_up.message'
  | 'follow_up.read'
  | 'follow_up.billing_read'
  | 'follow_up.billing_write'
  | 'follow_up.sms_send'
  | 'visit.sign'
  | 'appointment.read'
  | 'appointment.write'
  | 'patient.intake_read'
  | 'patient.intake_write'
  | 'patient.capability_issue'
  | 'notification.read'
  | 'notification.write'
  | 'notification.create'

export interface ClinicalAccessContext {
  userId: string
  email: string
  tenantId: string
  role: ClinicalRole
}

export type ClinicalAccessResult =
  | { ok: true; context: ClinicalAccessContext }
  | {
      ok: false
      status: 401 | 403 | 503
      reason: 'unauthenticated' | 'forbidden' | 'authorization_unavailable'
    }

export function clinicalAccessDeniedMessage(
  reason: 'unauthenticated' | 'forbidden' | 'authorization_unavailable',
): string {
  switch (reason) {
    case 'unauthenticated':
      return 'Please sign in to continue.'
    case 'forbidden':
      return 'Your account is not provisioned for clinical triage access. Ask an administrator to grant it.'
    case 'authorization_unavailable':
      return 'Authorization is temporarily unavailable. Please try again shortly.'
  }
}

export async function authorizeClinicalAccess(input: {
  action: ClinicalAction
  allowedRoles: readonly ClinicalRole[]
}): Promise<ClinicalAccessResult> {
  const user = await getUser()
  if (!user) {
    return { ok: false, status: 401, reason: 'unauthenticated' }
  }

  try {
    const tenantId = getTenantServer()
    const pool = await getPool()
    const { rows } = await pool.query(
      `SELECT user_id, tenant_id, role
         FROM clinical_access_memberships
        WHERE user_id = $1
          AND tenant_id = $2
          AND active = true
        LIMIT 1`,
      [user.id, tenantId],
    )
    const membership = rows[0] as
      | { user_id: string; tenant_id: string; role: ClinicalRole }
      | undefined

    if (!membership || !input.allowedRoles.includes(membership.role)) {
      return { ok: false, status: 403, reason: 'forbidden' }
    }

    return {
      ok: true,
      context: {
        userId: user.id,
        email: user.email,
        tenantId: membership.tenant_id,
        role: membership.role,
      },
    }
  } catch {
    console.error('[clinical-access] authorization store unavailable', {
      action: input.action,
    })
    return {
      ok: false,
      status: 503,
      reason: 'authorization_unavailable',
    }
  }
}
