import { NextResponse } from 'next/server'
import { from } from '@/lib/db-query'
import { getConsult } from '@/lib/consult/pipeline'
import {
  notifyHistorianRedFlag,
  notifyHistorianSafetyEscalation,
} from '@/lib/notifications'
import { recordHistorianSafetyEscalation } from '@/lib/triage/historianSafetyEscalation'
import { authorizeClinicalAccess } from '@/lib/auth/clinicalAccess'
import { authorizeClinicalOrPatientAccess } from '@/lib/patientAccess/routeAuthorization'
import { recordReferralClarificationCompletion } from '@/lib/triage/historianClarificationCompletion'
import { getPool } from '@/lib/db'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const requestedConsultId =
      typeof body.consult_id === 'string' && body.consult_id.trim()
        ? body.consult_id.trim()
        : undefined
    const requestedPatientId =
      typeof body.patient_id === 'string' && body.patient_id.trim()
        ? body.patient_id.trim()
        : undefined
    const clarificationRequested =
      body.session_type === 'referral_clarification' ||
      requestedConsultId !== undefined
    const access = await authorizeClinicalOrPatientAccess({
      clinicalAction: 'historian.save',
      clinicalRoles: ['clinician', 'admin'],
      patientScopes: clarificationRequested
        ? ['patient:clarification:answer']
        : ['patient:historian:save'],
      ...(requestedPatientId ? { expectedPatientId: requestedPatientId } : {}),
      ...(requestedConsultId ? { expectedConsultId: requestedConsultId } : {}),
    })
    if (!access.ok) {
      return NextResponse.json(
        { error: 'Access denied', reason: access.reason },
        { status: access.status },
      )
    }

    if (
      access.principal === 'patient' &&
      requestedPatientId &&
      requestedPatientId !== access.context.patientId
    ) {
      return NextResponse.json(
        { error: 'Access denied', reason: 'binding_mismatch' },
        { status: 403 },
      )
    }
    const tenant = access.context.tenantId
    const consultId =
      requestedConsultId ??
      (clarificationRequested && access.principal === 'patient'
        ? access.context.consultId
        : undefined)
    if (
      access.principal === 'patient' &&
      clarificationRequested &&
      (!consultId || access.context.consultId !== consultId)
    ) {
      return NextResponse.json(
        { error: 'Access denied', reason: 'binding_mismatch' },
        { status: 403 },
      )
    }
    const consult = consultId
      ? await getConsult(consultId, tenant)
      : null
    if (consultId && !consult) {
      return NextResponse.json({ error: 'Consult not found' }, { status: 404 })
    }
    if (
      access.principal === 'patient' &&
      consult &&
      consult.patient_id !== access.context.patientId
    ) {
      return NextResponse.json(
        { error: 'Access denied', reason: 'binding_mismatch' },
        { status: 403 },
      )
    }
    if (!consultId && body.session_type === 'referral_clarification') {
      return NextResponse.json(
        { error: 'Referral clarification requires a consult binding' },
        { status: 409 },
      )
    }
    const patientId =
      access.principal === 'patient'
        ? access.context.patientId
        : consult
          ? consult.patient_id || null
          : requestedPatientId ?? null
    if (access.principal === 'clinical' && !consult && patientId) {
      const pool = await getPool()
      const { rows } = await pool.query(
        `SELECT id
           FROM patients
          WHERE id = $1
            AND tenant_id = $2
          LIMIT 1`,
        [patientId, tenant],
      )
      if (!rows[0]) {
        return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
      }
    }
    const sessionType = consult
      ? 'referral_clarification'
      : body.session_type || 'new_patient'
    const safetyEscalated = body.safety_escalated === true
    const redFlags = Array.isArray(body.red_flags) ? body.red_flags : []
    const structuredOutput =
      body.structured_output && typeof body.structured_output === 'object'
        ? body.structured_output
        : {}
    const rawClarificationAnswers = structuredOutput.clarification_answers
    if (
      consult &&
      !safetyEscalated &&
      !Array.isArray(rawClarificationAnswers)
    ) {
      return NextResponse.json(
        { error: 'Approved clarification answers are required' },
        { status: 400 },
      )
    }
    const clarificationAnswers = Array.isArray(rawClarificationAnswers)
      ? rawClarificationAnswers.map((answer: unknown) => {
          const candidate = answer as Record<string, unknown>
          return {
            questionId:
              typeof candidate?.question_id === 'string'
                ? candidate.question_id
                : '',
            answer:
              typeof candidate?.answer === 'string' ? candidate.answer : '',
          }
        })
      : []

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
        patient_id: patientId,
        session_type: sessionType,
        patient_name: body.patient_name || '',
        referral_reason: body.referral_reason || null,
        structured_output: toJSON(structuredOutput),
        narrative_summary: body.narrative_summary || null,
        transcript: toJSON(body.transcript),
        red_flags: toJSON(body.red_flags),
        safety_escalated: safetyEscalated,
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
    if (consultId && data) {
      if (safetyEscalated) {
        const recorded = await recordHistorianSafetyEscalation({
          consultId,
          historianSessionId: data.id,
          summary: body.narrative_summary || '',
          structuredOutput,
          redFlags,
          safetyEscalated: true,
          completionStatus,
          tenantId: tenant,
        })
        if (!recorded) {
          return NextResponse.json(
            { error: 'Emergency safety hold could not be recorded' },
            { status: 503 },
          )
        }
      } else {
        const completion = await recordReferralClarificationCompletion({
          consultId,
          tenantId: tenant,
          historianSessionId: data.id,
          summary: body.narrative_summary || '',
          structuredOutput,
          redFlags,
          completionStatus,
          answers: clarificationAnswers,
        })
        if (!completion.ok) {
          const persistenceFailure =
            completion.reason === 'clarification_persistence_failed'
          return NextResponse.json(
            {
              error: 'Referral clarification could not be reconciled',
              reason: completion.reason,
            },
            { status: persistenceFailure ? 503 : 409 },
          )
        }
      }
    }

    // ── Notification: alert staff if red flags were detected ──────────
    try {
      if (safetyEscalated && data) {
        await notifyHistorianSafetyEscalation(
          data.id,
          body.patient_name || 'Unknown patient',
          redFlags,
          patientId,
          tenant,
        )
      } else if (redFlags.length > 0 && data) {
        await notifyHistorianRedFlag(
          data.id,
          body.patient_name || 'Unknown patient',
          redFlags,
          patientId,
          tenant,
        )
      }
    } catch (notifErr) {
      console.error('[historian/save] Notification error (non-fatal):', notifErr)
    }

    return NextResponse.json({ session: data, consult_id: consultId || null })
  } catch (error: unknown) {
    console.error('Historian save API error:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to save historian session',
      },
      { status: 500 },
    )
  }
}

export async function GET(request: Request) {
  try {
    const access = await authorizeClinicalAccess({
      action: 'consult.read',
      allowedRoles: ['viewer', 'scheduler', 'clinician', 'admin'],
    })
    if (!access.ok) {
      return NextResponse.json(
        { error: 'Access denied', reason: access.reason },
        { status: access.status },
      )
    }

    const { searchParams } = new URL(request.url)
    const tenant = access.context.tenantId
    const patientId = searchParams.get('patient_id')

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
  } catch (error: unknown) {
    console.error('Historian list API error:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch historian sessions',
      },
      { status: 500 },
    )
  }
}
