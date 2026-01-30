import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTenantServer } from '@/lib/tenant'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const tenant = body.tenant_id || getTenantServer()

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('historian_sessions')
      .insert({
        tenant_id: tenant,
        session_type: body.session_type || 'new_patient',
        patient_name: body.patient_name || '',
        referral_reason: body.referral_reason || null,
        structured_output: body.structured_output || null,
        narrative_summary: body.narrative_summary || null,
        transcript: body.transcript || null,
        red_flags: body.red_flags || null,
        safety_escalated: body.safety_escalated || false,
        duration_seconds: body.duration_seconds || 0,
        question_count: body.question_count || 0,
        status: body.status || 'completed',
        reviewed: false,
        imported_to_note: false,
      })
      .select()
      .single()

    if (error) {
      console.error('Error saving historian session:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ session: data })
  } catch (error: any) {
    console.error('Historian save API error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to save historian session' },
      { status: 500 },
    )
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const tenant = searchParams.get('tenant_id') || getTenantServer()

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('historian_sessions')
      .select('*')
      .eq('tenant_id', tenant)
      .order('created_at', { ascending: false })
      .limit(10)

    if (error) {
      console.error('Error fetching historian sessions:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ sessions: data || [] })
  } catch (error: any) {
    console.error('Historian list API error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch historian sessions' },
      { status: 500 },
    )
  }
}
