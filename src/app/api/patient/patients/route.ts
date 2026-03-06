import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rpc } from '@/lib/db-query'


export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const tenantId = searchParams.get('tenant_id') || 'default'


    const { data, error } = await rpc('get_patients_for_portal', {
      p_tenant_id: tenantId,
    })

    if (error) {
      console.error('Error fetching patients for portal:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ patients: data || [] })
  } catch (error: any) {
    console.error('Patient list API error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch patients' },
      { status: 500 },
    )
  }
}
