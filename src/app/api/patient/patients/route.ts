import { NextResponse } from 'next/server'
import { authorizeClinicalAccess } from '@/lib/auth/clinicalAccess'
import { rpc } from '@/lib/db-query'


export async function GET() {
  try {
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


    const { data, error } = await rpc('get_patients_for_portal', {
      p_tenant_id: access.context.tenantId,
    })

    if (error) {
      console.error('[patient/patients] list failed')
      return NextResponse.json(
        { error: 'Failed to fetch patients' },
        { status: 500 },
      )
    }

    return NextResponse.json({ patients: data || [] })
  } catch {
    console.error('[patient/patients] request failed')
    return NextResponse.json(
      { error: 'Failed to fetch patients' },
      { status: 500 },
    )
  }
}
