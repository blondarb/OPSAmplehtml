import { NextResponse } from 'next/server'
import { authorizeClinicalAccess } from '@/lib/auth/clinicalAccess'
import { from } from '@/lib/db-query'

// GET /api/patients/list — lightweight patient list for selectors/dropdowns
export async function GET() {
  const access = await authorizeClinicalAccess({
    action: 'patient.list',
    allowedRoles: ['viewer', 'scheduler', 'clinician', 'admin'],
  })
  if (!access.ok) {
    return NextResponse.json(
      { error: 'Access denied', reason: access.reason },
      { status: access.status },
    )
  }

  const { data: patients, error } = await from('patients')
    .select('id, first_name, last_name, date_of_birth')
    .eq('tenant_id', access.context.tenantId)
    .order('last_name')
    .limit(100)

  if (error) {
    console.error('[patients/list] list failed')
    return NextResponse.json(
      { error: 'Failed to fetch patients' },
      { status: 500 },
    )
  }

  return NextResponse.json({ patients: patients || [] })
}
