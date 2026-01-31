import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getTenantServer } from '@/lib/tenant'

// GET /api/medications?patient_id=X — list medications for patient
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
  const statusFilter = searchParams.get('status')
  const showAll = searchParams.get('all') === 'true'

  let query = supabase
    .from('patient_medications')
    .select('*')
    .eq('patient_id', patientId)
    .eq('tenant_id', tenant)
    .order('created_at', { ascending: false })

  if (statusFilter) {
    query = query.eq('status', statusFilter)
  } else if (!showAll) {
    query = query.eq('is_active', true)
  }

  const { data: medications, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ medications })
}

// POST /api/medications — create medication
export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { patient_id, medication_name, generic_name, dosage, frequency, route, start_date, prescriber, indication, notes, source } = body

  if (!patient_id || !medication_name) {
    return NextResponse.json(
      { error: 'patient_id and medication_name are required' },
      { status: 400 }
    )
  }

  const tenant = getTenantServer()

  const { data: medication, error } = await supabase
    .from('patient_medications')
    .insert({
      patient_id,
      tenant_id: tenant,
      medication_name,
      generic_name: generic_name || null,
      dosage: dosage || null,
      frequency: frequency || null,
      route: route || 'PO',
      start_date: start_date || null,
      prescriber: prescriber || null,
      indication: indication || null,
      notes: notes || null,
      source: source || 'manual',
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ medication }, { status: 201 })
}
