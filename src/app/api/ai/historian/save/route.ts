import { NextResponse } from 'next/server'
import { getUser } from '@/lib/cognito/server'
import { getTenantServer } from '@/lib/tenant'
import { from } from '@/lib/db-query'
import { linkHistorianToConsult } from '@/lib/consult/pipeline'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const tenant = body.tenant_id || getTenantServer()


    const { data, error } = await from('historian_sessions')
      .insert({
        tenant_id: tenant,
        patient_id: body.patient_id || null,
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

    // Phase 1 pipeline: link the saved historian session back to the consult
    const consultId: string | undefined = body.consult_id
    if (consultId && data) {
      try {
        await linkHistorianToConsult(
          consultId,
          data.id,
          body.narrative_summary || '',
          body.structured_output || {},
          body.red_flags || [],
          body.safety_escalated || false,
        )
      } catch (pipelineErr) {
        // Non-fatal — historian session is saved regardless
        console.error('[historian/save] consult linkage error (non-fatal):', pipelineErr)
      }
    }

    return NextResponse.json({ session: data, consult_id: consultId || null })
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
    const patientId = searchParams.get('patient_id')

    const { getPool } = await import('@/lib/db')
    const pool = await getPool()

    const conditions = ['hs."tenant_id" = $1']
    const values: unknown[] = [tenant]

    if (patientId) {
      conditions.push(`hs."patient_id" = $2`)
      values.push(patientId)
    }

    const sql = `
      SELECT
        hs.*,
        CASE WHEN p."id" IS NOT NULL THEN json_build_object(
          'id', p."id", 'first_name', p."first_name", 'last_name', p."last_name", 'mrn', p."mrn"
        ) ELSE NULL END AS patient
      FROM "historian_sessions" hs
      LEFT JOIN "patients" p ON p."id" = hs."patient_id"
      WHERE ${conditions.join(' AND ')}
      ORDER BY hs."created_at" DESC
      LIMIT 10
    `
    const { rows } = await pool.query(sql, values)

    return NextResponse.json({ sessions: rows || [] })
  } catch (error: any) {
    console.error('Historian list API error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch historian sessions' },
      { status: 500 },
    )
  }
}
