import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTenantServer } from '@/lib/tenant'

// POST /api/patient/intake — Submit a patient intake form
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const tenant = body.tenant_id || getTenantServer()

    const { patient_name, chief_complaint } = body
    if (!patient_name || !chief_complaint) {
      return NextResponse.json(
        { error: 'patient_name and chief_complaint are required' },
        { status: 400 },
      )
    }

    const supabase = await createClient()

    const insertData: Record<string, any> = {
      tenant_id: tenant,
      patient_name: body.patient_name,
      date_of_birth: body.date_of_birth || null,
      email: body.email || null,
      phone: body.phone || null,
      chief_complaint: body.chief_complaint,
      current_medications: body.current_medications || null,
      allergies: body.allergies || null,
      medical_history: body.medical_history || null,
      family_history: body.family_history || null,
      notes: body.notes || null,
    }

    // Link to patient record if patient_id is provided
    if (body.patient_id) {
      insertData.patient_id = body.patient_id
    }

    const { data, error } = await supabase
      .from('patient_intake_forms')
      .insert(insertData)
      .select()
      .single()

    if (error) {
      console.error('Intake insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ intake: data }, { status: 201 })
  } catch (err: any) {
    console.error('Intake API error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET /api/patient/intake — List intake forms for current tenant
export async function GET() {
  try {
    const supabase = await createClient()
    const tenant = getTenantServer()

    const { data, error } = await supabase
      .from('patient_intake_forms')
      .select('*')
      .eq('tenant_id', tenant)
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ intakes: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
