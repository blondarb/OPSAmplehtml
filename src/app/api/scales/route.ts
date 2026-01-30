import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTenantServer } from '@/lib/tenant'

// GET - Fetch scale results for a patient
export async function GET(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const patientId = searchParams.get('patientId')
  const scaleId = searchParams.get('scaleId')
  const limit = parseInt(searchParams.get('limit') || '10')

  if (!patientId) {
    return NextResponse.json({ error: 'patientId is required' }, { status: 400 })
  }

  const tenant = getTenantServer()

  // Fetch scale results for the patient
  let query = supabase
    .from('scale_results')
    .select('*')
    .eq('patient_id', patientId)
    .eq('tenant_id', tenant)
    .order('completed_at', { ascending: false })
    .limit(limit)

  if (scaleId) {
    query = query.eq('scale_id', scaleId)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ results: data })
}

// POST - Save a scale result
export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const {
    patientId,
    visitId,
    scaleId,
    responses,
    rawScore,
    interpretation,
    severityLevel,
    grade,
    triggeredAlerts,
    notes,
  } = body

  if (!patientId || !scaleId || !responses || rawScore === undefined) {
    return NextResponse.json(
      { error: 'patientId, scaleId, responses, and rawScore are required' },
      { status: 400 }
    )
  }

  const tenant = getTenantServer()

  const { data, error } = await supabase
    .from('scale_results')
    .insert({
      tenant_id: tenant,
      patient_id: patientId,
      visit_id: visitId || null,
      scale_id: scaleId,
      responses,
      raw_score: rawScore,
      interpretation,
      severity_level: severityLevel,
      grade,
      triggered_alerts: triggeredAlerts,
      notes,
      completed_by: user.id,
      completed_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ result: data })
}
