import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { first_name, last_name, referral_reason, tenant_id } = body

    if (!first_name || !last_name) {
      return NextResponse.json(
        { error: 'first_name and last_name are required' },
        { status: 400 },
      )
    }

    const supabase = await createClient()

    const { data, error } = await supabase.rpc('portal_register_patient', {
      p_first_name: first_name,
      p_last_name: last_name,
      p_referral_reason: referral_reason || null,
      p_tenant_id: tenant_id || 'default',
    })

    if (error) {
      console.error('Error registering patient:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ patientId: data })
  } catch (error: any) {
    console.error('Patient register API error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to register patient' },
      { status: 500 },
    )
  }
}
