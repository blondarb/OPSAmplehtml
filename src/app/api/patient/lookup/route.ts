import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTenantServer } from '@/lib/tenant'

/**
 * GET /api/patient/lookup?name=Jane+Doe&dob=1990-01-15&tenant_id=default
 *
 * Attempts to match a patient by name and date of birth.
 * Returns { patient_id } if a match is found, or { patient_id: null } if not.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const name = searchParams.get('name')?.trim()
    const dob = searchParams.get('dob')?.trim()
    const tenant = searchParams.get('tenant_id') || getTenantServer()

    if (!name) {
      return NextResponse.json({ patient_id: null })
    }

    const supabase = await createClient()

    // Split name into first and last parts for matching
    const nameParts = name.split(/\s+/)
    const firstName = nameParts[0] || ''
    const lastName = nameParts.slice(1).join(' ') || ''

    // Try to find matching patient by name (case-insensitive) and optionally DOB
    let query = supabase
      .from('patients')
      .select('id, first_name, last_name, date_of_birth')
      .eq('tenant_id', tenant)
      .ilike('first_name', firstName)

    if (lastName) {
      query = query.ilike('last_name', lastName)
    }

    if (dob) {
      query = query.eq('date_of_birth', dob)
    }

    const { data, error } = await query.limit(1).maybeSingle()

    if (error) {
      console.error('Patient lookup error:', error)
      return NextResponse.json({ patient_id: null })
    }

    return NextResponse.json({
      patient_id: data?.id || null,
      patient_name: data ? `${data.first_name} ${data.last_name}` : null,
    })
  } catch (err: any) {
    console.error('Patient lookup API error:', err)
    return NextResponse.json({ patient_id: null })
  }
}
