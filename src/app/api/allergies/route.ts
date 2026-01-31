import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getTenantServer } from '@/lib/tenant'

// GET /api/allergies?patient_id=X — list allergies for patient
export async function GET(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const patientId = searchParams.get('patient_id')
  if (!patientId) {
    return NextResponse.json({ error: 'patient_id is required' }, { status: 400 })
  }

  const tenant = getTenantServer()
  const showAll = searchParams.get('all') === 'true'

  let query = supabase
    .from('patient_allergies')
    .select('*')
    .eq('patient_id', patientId)
    .eq('tenant_id', tenant)
    .order('created_at', { ascending: false })

  if (!showAll) {
    query = query.eq('is_active', true)
  }

  const { data: allergies, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ allergies })
}

// POST /api/allergies — create allergy
export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { patient_id, allergen, allergen_type, reaction, severity, onset_date, notes, source } = body

  if (!patient_id || !allergen) {
    return NextResponse.json(
      { error: 'patient_id and allergen are required' },
      { status: 400 }
    )
  }

  const tenant = getTenantServer()

  const { data: allergy, error } = await supabase
    .from('patient_allergies')
    .insert({
      patient_id,
      tenant_id: tenant,
      allergen,
      allergen_type: allergen_type || 'drug',
      reaction: reaction || null,
      severity: severity || 'unknown',
      onset_date: onset_date || null,
      notes: notes || null,
      source: source || 'manual',
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ allergy }, { status: 201 })
}
