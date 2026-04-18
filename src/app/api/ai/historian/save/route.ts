import { NextResponse } from 'next/server'
import { getUser } from '@/lib/cognito/server'
import { getTenantServer } from '@/lib/tenant'
import { from } from '@/lib/db-query'
import { linkHistorianToConsult } from '@/lib/consult/pipeline'
import { notifyHistorianRedFlag } from '@/lib/notifications'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const tenant = body.tenant_id || getTenantServer()


    const completionStatus: 'complete' | 'ended_early' | null =
      body.interview_completion_status === 'complete' ||
      body.interview_completion_status === 'ended_early'
        ? body.interview_completion_status
        : null

    // Pre-stringify jsonb array/object fields. The shared query builder
    // auto-stringifies plain objects but passes arrays through raw (for
    // text[] compat), which breaks jsonb inserts of transcript/red_flags
    // — same root cause as the triage_sessions fix (2d1e445).
    const toJSON = (v: unknown) => (v != null ? JSON.stringify(v) : null)

    const { data, error } = await from('historian_sessions')
      .insert({
        tenant_id: tenant,
        patient_id: body.patient_id || null,
        session_type: body.session_type || 'new_patient',
        patient_name: body.patient_name || '',
        referral_reason: body.referral_reason || null,
        structured_output: toJSON(body.structured_output),
        narrative_summary: body.narrative_summary || null,
        transcript: toJSON(body.transcript),
        red_flags: toJSON(body.red_flags),
        safety_escalated: body.safety_escalated || false,
        duration_seconds: body.duration_seconds || 0,
        question_count: body.question_count || 0,
        status: body.status || 'completed',
        interview_completion_status: completionStatus,
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
          completionStatus,
        )
      } catch (pipelineErr) {
        // Non-fatal — historian session is saved regardless
        console.error('[historian/save] consult linkage error (non-fatal):', pipelineErr)
      }
    }

    // ── Notification: alert staff if red flags were detected ──────────
    try {
      const redFlags = body.red_flags || []
      if (redFlags.length > 0 && data) {
        await notifyHistorianRedFlag(
          data.id,
          body.patient_name || 'Unknown patient',
          redFlags,
          body.patient_id || null,
        )
      }
    } catch (notifErr) {
      console.error('[historian/save] Notification error (non-fatal):', notifErr)
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
