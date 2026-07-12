import { NextResponse } from 'next/server'
import { authorizeClinicalAccess } from '@/lib/auth/clinicalAccess'
import { rpc } from '@/lib/db-query'


export async function POST(request: Request) {
  try {
    const access = await authorizeClinicalAccess({
      action: 'patient.register',
      allowedRoles: ['scheduler', 'clinician', 'admin'],
    })
    if (!access.ok) {
      return NextResponse.json(
        { error: 'Access denied', reason: access.reason },
        { status: access.status },
      )
    }

    const body = await request.json()
    const { first_name, last_name, referral_reason } = body

    if (!first_name || !last_name) {
      return NextResponse.json(
        { error: 'first_name and last_name are required' },
        { status: 400 },
      )
    }


    const { data, error } = await rpc('portal_register_patient', {
      p_first_name: first_name,
      p_last_name: last_name,
      p_referral_reason: referral_reason || null,
      p_tenant_id: access.context.tenantId,
    })

    if (error) {
      console.error('[patient/register] registration failed')
      return NextResponse.json(
        { error: 'Failed to register patient' },
        { status: 500 },
      )
    }

    return NextResponse.json({ patientId: data })
  } catch {
    console.error('[patient/register] request failed')
    return NextResponse.json(
      { error: 'Failed to register patient' },
      { status: 500 },
    )
  }
}
