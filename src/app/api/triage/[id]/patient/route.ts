import { NextResponse } from 'next/server'
import { authorizeClinicalAccess, clinicalAccessDeniedMessage } from '@/lib/auth/clinicalAccess'

// Patient identity must be established on an immutable referral case before
// triage processing. A session id plus caller-selected patient id is not a
// sufficient identity proof and can mix two patients within the same tenant.
export async function PATCH(
  _request: Request,
  _context: { params: Promise<{ id: string }> },
) {
  const access = await authorizeClinicalAccess({
    action: 'triage.link_patient',
    allowedRoles: ['clinician', 'admin'],
  })
  if (!access.ok) {
    return NextResponse.json(
      { error: clinicalAccessDeniedMessage(access.reason), reason: access.reason },
      { status: access.status },
    )
  }

  return NextResponse.json(
    {
      error:
        'Patient binding requires a verified referral identity workflow and is not available from a triage session.',
      reason: 'unverified_patient_binding_not_allowed',
    },
    { status: 409 },
  )
}
