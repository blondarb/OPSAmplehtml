import { NextResponse } from 'next/server'
import { authorizeClinicalAccess, clinicalAccessDeniedMessage } from '@/lib/auth/clinicalAccess'

export async function GET() {
  const access = await authorizeClinicalAccess({
    action: 'follow_up.billing_read',
    allowedRoles: ['clinician', 'admin'],
  })
  if (!access.ok) {
    return NextResponse.json(
      { error: clinicalAccessDeniedMessage(access.reason), reason: access.reason },
      { status: access.status },
    )
  }

  // The tracked schema has no tenant_id on followup_billing_entries and no
  // verified tenant-bound relationship available to scope this export. Do not
  // export cross-tenant billing data until the schema supports that boundary.
  return NextResponse.json(
    {
      error: 'Billing export is unavailable because tenant-scoped billing storage is not configured.',
      code: 'BILLING_TENANT_SCOPE_UNAVAILABLE',
    },
    { status: 503 },
  )
}
