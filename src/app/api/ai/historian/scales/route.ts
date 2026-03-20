/**
 * Scale Auto-Administration API (Phase 3)
 *
 * Endpoints:
 *   POST /api/ai/historian/scales/trigger   — evaluate which scales are indicated
 *   POST /api/ai/historian/scales/administer — build administration session for a scale
 *   POST /api/ai/historian/scales/submit    — score + store completed scale responses
 *   GET  /api/ai/historian/scales/results   — list completed scale results for a session
 */

import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'
import { calculateScore } from '@/lib/scales/scoring-engine'
import {
  getTriggeredScales,
  getAdministrationQuestions,
  getConsultScaleById,
  SCALE_AUTO_ADMIN_ENABLED,
} from '@/lib/consult/scales'
import type { LocalizerSnapshot, ScaleResult, SeverityLevel } from '@/lib/consult/scales'

// ─── Route dispatcher ────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')

  try {
    const body = await request.json()

    switch (action) {
      case 'trigger':
        return handleTrigger(body)
      case 'administer':
        return handleAdminister(body)
      case 'submit':
        return handleSubmit(body)
      default:
        return NextResponse.json(
          { error: 'Missing or invalid ?action= param. Valid: trigger | administer | submit' },
          { status: 400 }
        )
    }
  } catch (err: any) {
    console.error('[scales API] error:', err)
    return NextResponse.json({ error: err?.message ?? 'Internal error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get('session_id')
  const consultId = searchParams.get('consult_id')

  if (!sessionId && !consultId) {
    return NextResponse.json(
      { error: 'Provide session_id or consult_id' },
      { status: 400 }
    )
  }

  return handleGetResults({ sessionId, consultId })
}

// ─── Handler: trigger ─────────────────────────────────────────────────────────

/**
 * POST ?action=trigger
 * Body: LocalizerSnapshot + optional trigger mode
 *
 * Returns the ordered list of scales that should be administered.
 */
async function handleTrigger(body: {
  snapshot: LocalizerSnapshot
  mode?: 'strict' | 'broad'
}) {
  if (!SCALE_AUTO_ADMIN_ENABLED) {
    return NextResponse.json({ enabled: false, scales: [] })
  }

  if (!body.snapshot) {
    return NextResponse.json({ error: 'snapshot is required' }, { status: 400 })
  }

  const triggered = getTriggeredScales(body.snapshot, { mode: body.mode })

  return NextResponse.json({
    enabled: true,
    scales: triggered,
    voiceAdministrable: triggered.filter((s) => s.adminMode === 'voice_administrable'),
    examRequired: triggered.filter((s) => s.requiresPhysician),
  })
}

// ─── Handler: administer ──────────────────────────────────────────────────────

/**
 * POST ?action=administer
 * Body: { scale_id: string }
 *
 * Returns the ordered list of conversational questions for the given scale,
 * plus the system-prompt injection block.
 */
async function handleAdminister(body: { scale_id: string }) {
  if (!body.scale_id) {
    return NextResponse.json({ error: 'scale_id is required' }, { status: 400 })
  }

  const scaleDef = getConsultScaleById(body.scale_id)
  if (!scaleDef) {
    return NextResponse.json({ error: `Unknown scale: ${body.scale_id}` }, { status: 404 })
  }

  const questions = getAdministrationQuestions(body.scale_id)
  if (!questions) {
    return NextResponse.json(
      {
        error: `Scale ${scaleDef.abbreviation} requires physician administration and cannot be voice-administered.`,
        requiresPhysician: true,
      },
      { status: 422 }
    )
  }

  // Build prompt injection block
  const { buildScaleAdministrationInstructions } = await import('@/lib/consult/scales')
  const instructionBlock = buildScaleAdministrationInstructions(
    scaleDef.name,
    scaleDef.abbreviation,
    questions
  )

  return NextResponse.json({
    scale_id: body.scale_id,
    scale_name: scaleDef.name,
    scale_abbreviation: scaleDef.abbreviation,
    questions,
    total_questions: questions.length,
    estimated_minutes: scaleDef.timeToComplete ?? null,
    instruction_block: instructionBlock,
  })
}

// ─── Handler: submit ──────────────────────────────────────────────────────────

/**
 * POST ?action=submit
 * Body: {
 *   scale_id: string
 *   responses: Record<string, number>
 *   historian_session_id?: string
 *   consult_id?: string
 *   admin_mode?: 'voice_administrable' | 'exam_required'
 * }
 *
 * Scores the responses and stores the result in scale_results.
 */
async function handleSubmit(body: {
  scale_id: string
  responses: Record<string, number>
  historian_session_id?: string
  consult_id?: string
  admin_mode?: 'voice_administrable' | 'exam_required'
}) {
  const { scale_id, responses, historian_session_id, consult_id } = body

  if (!scale_id || !responses) {
    return NextResponse.json(
      { error: 'scale_id and responses are required' },
      { status: 400 }
    )
  }

  if (!historian_session_id && !consult_id) {
    return NextResponse.json(
      { error: 'Provide historian_session_id or consult_id' },
      { status: 400 }
    )
  }

  const scaleDef = getConsultScaleById(scale_id)
  if (!scaleDef) {
    return NextResponse.json({ error: `Unknown scale: ${scale_id}` }, { status: 404 })
  }

  // Score the responses using the existing scoring engine
  const calculation = calculateScore(scaleDef, responses)

  // Compute optional subscale scores (ALSFRS-R domains)
  const subscaleScores = computeSubscaleScores(scale_id, responses)

  // Map severity to our SeverityLevel type
  const severityLevel: SeverityLevel = calculation.severity ?? 'none'

  const now = new Date().toISOString()
  const adminMode = body.admin_mode ?? 'voice_administrable'

  // Persist to DB
  const pool = await getPool()
  const { rows } = await pool.query(
    `INSERT INTO scale_results (
      historian_session_id,
      consult_id,
      scale_id,
      scale_name,
      scale_abbreviation,
      raw_responses,
      total_score,
      subscale_scores,
      interpretation,
      severity_level,
      triggered_alerts,
      admin_mode,
      administered_at,
      completed_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    RETURNING *`,
    [
      historian_session_id ?? null,
      consult_id ?? null,
      scale_id,
      scaleDef.name,
      scaleDef.abbreviation,
      JSON.stringify(responses),
      calculation.rawScore,
      subscaleScores ? JSON.stringify(subscaleScores) : null,
      calculation.interpretation,
      severityLevel,
      calculation.triggeredAlerts.length > 0
        ? JSON.stringify(calculation.triggeredAlerts)
        : null,
      adminMode,
      now,
      now,
    ]
  )

  const stored = rows[0]

  const result: ScaleResult = {
    id: stored.id,
    historianSessionId: stored.historian_session_id,
    consultId: stored.consult_id,
    scaleName: stored.scale_name,
    scaleAbbreviation: stored.scale_abbreviation,
    rawResponses: stored.raw_responses,
    totalScore: stored.total_score,
    subscaleScores: stored.subscale_scores ?? undefined,
    interpretation: stored.interpretation,
    severityLevel: stored.severity_level,
    triggeredAlerts: stored.triggered_alerts ?? [],
    adminMode: stored.admin_mode,
    administeredAt: stored.administered_at,
    completedAt: stored.completed_at,
  }

  return NextResponse.json({
    result,
    calculation,
    hasCriticalAlerts: calculation.triggeredAlerts.some((a) => a.type === 'critical'),
  })
}

// ─── Handler: GET results ──────────────────────────────────────────────────────

async function handleGetResults(params: {
  sessionId: string | null
  consultId: string | null
}) {
  const pool = await getPool()

  const conditions: string[] = []
  const values: unknown[] = []

  if (params.sessionId) {
    conditions.push(`historian_session_id = $${values.length + 1}`)
    values.push(params.sessionId)
  }
  if (params.consultId) {
    conditions.push(`consult_id = $${values.length + 1}`)
    values.push(params.consultId)
  }

  const { rows } = await pool.query(
    `SELECT * FROM scale_results
     WHERE ${conditions.join(' OR ')}
     ORDER BY administered_at ASC`,
    values
  )

  const results: ScaleResult[] = rows.map((r) => ({
    id: r.id,
    historianSessionId: r.historian_session_id,
    consultId: r.consult_id,
    scaleName: r.scale_name,
    scaleAbbreviation: r.scale_abbreviation,
    rawResponses: r.raw_responses,
    totalScore: r.total_score,
    subscaleScores: r.subscale_scores ?? undefined,
    interpretation: r.interpretation,
    severityLevel: r.severity_level,
    triggeredAlerts: r.triggered_alerts ?? [],
    adminMode: r.admin_mode,
    administeredAt: r.administered_at,
    completedAt: r.completed_at,
  }))

  return NextResponse.json({ results })
}

// ─── Subscale scoring ─────────────────────────────────────────────────────────

/**
 * Computes domain subscores for scales that have meaningful sub-groupings.
 * Currently: ALSFRS-R (bulbar / fine motor / gross motor / respiratory).
 */
function computeSubscaleScores(
  scaleId: string,
  responses: Record<string, number>
): Record<string, number> | null {
  if (scaleId !== 'alsfrs_r') return null

  const get = (id: string) => Number(responses[id] ?? 0)

  return {
    bulbar: get('q1') + get('q2') + get('q3'),          // 0–12
    fine_motor: get('q4') + get('q5') + get('q6'),      // 0–12
    gross_motor: get('q7') + get('q8') + get('q9'),     // 0–12
    respiratory: get('q10') + get('q11') + get('q12'),  // 0–12
  }
}
