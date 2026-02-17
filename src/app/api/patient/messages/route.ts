import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTenantServer } from '@/lib/tenant'

// POST /api/patient/messages — Send a patient message
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const tenant = body.tenant_id || getTenantServer()

    const { patient_name, body: msgBody } = body
    if (!patient_name || !msgBody) {
      return NextResponse.json(
        { error: 'patient_name and body are required' },
        { status: 400 },
      )
    }

    const supabase = await createClient()

    const insertData: Record<string, any> = {
      tenant_id: tenant,
      patient_name: body.patient_name,
      subject: body.subject || '',
      body: msgBody,
      direction: 'inbound',
    }

    // Link to patient record if patient_id is provided
    if (body.patient_id) {
      insertData.patient_id = body.patient_id
    }

    const { data, error } = await supabase
      .from('patient_messages')
      .insert(insertData)
      .select()
      .single()

    if (error) {
      console.error('Message insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ message: data }, { status: 201 })
  } catch (err: any) {
    console.error('Messages API error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET /api/patient/messages — List messages for current tenant
export async function GET() {
  try {
    const supabase = await createClient()
    const tenant = getTenantServer()

    const { data, error } = await supabase
      .from('patient_messages')
      .select('*')
      .eq('tenant_id', tenant)
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ messages: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
