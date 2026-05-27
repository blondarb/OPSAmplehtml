/**
 * Scale Auto-Administration API
 *
 * Actions on POST /api/ai/historian/scales:
 *   ?action=trigger    — evaluate which scales are indicated (Localizer caller)
 *   ?action=administer — build bulk administration session for a scale (legacy)
 *   ?action=submit     — score + store completed scale responses (legacy)
 *   ?action=step       — paginated single-item administration for the
 *                        model-callable scale_step tool (Phase 4 of 2026-05-27
 *                        AI Historian Realtime API upgrade)
 *   default action when no ?action param: 'step' (matches the scale_step tool's
 *                                            no-query-param fetch)
 *
 * GET /api/ai/historian/scales?session_id=... — list completed results
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
import type { ScaleStepResponse } from '@/lib/historianTypes'

// ─── Route dispatcher ────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') ?? 'step'

  try {
    const body = await request.json()

    switch (action) {
      case 'trigger':
        return handleTrigger(body)
      case 'administer':
        return handleAdminister(body)
      case 'submit':
        return handleSubmit(body)
      case 'step':
        return handleStep(body)
      default:
        return NextResponse.json(
          { error: 'Invalid ?action= param. Valid: trigger | administer | submit | step' },
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

// ─── Handler: step (paginated scale_step tool) ────────────────────────────────

/**
 * POST ?action=step  (default when no ?action param)
 *
 * Body shapes:
 *   First call:       { scale_id, reason, historian_session_id, consult_id? }
 *   Subsequent calls: { scale_id, prev_index, prev_response, historian_session_id }
 *
 * Returns ScaleStepResponse:
 *   - { done: false, index, item: { text, choices? } } per item
 *   - { done: true, total_score, interpretation, severity_level } when complete
 *   - { status: 'unknown_scale', available } if scale_id not found
 *   - { status: 'bad_index', expected_index } if pagination state out of sync
 *
 * Server-enforces single-item pacing — model literally cannot bulk-read because
 * it only ever has one item in context at a time.
 */
async function handleStep(body: {
  scale_id?: string
  reason?: string
  prev_index?: number
  prev_response?: string | number
  historian_session_id?: string
  consult_id?: string
}): Promise<NextResponse> {
  const scaleId = body.scale_id?.toLowerCase()
  if (!scaleId) {
    return NextResponse.json(
      { error: 'scale_id is required' },
      { status: 400 },
    )
  }

  const scaleDef = getConsultScaleById(scaleId)
  if (!scaleDef) {
    const { CONSULT_SCALE_DEFINITIONS } = await import('@/lib/consult/scales/scale-library')
    const available = Object.keys(CONSULT_SCALE_DEFINITIONS)
    return NextResponse.json<ScaleStepResponse>(
      { status: 'unknown_scale', available },
      { status: 200 },
    )
  }

  const questions = getAdministrationQuestions(scaleId)
  if (!questions || questions.length === 0) {
    return NextResponse.json(
      {
        error: `Scale ${scaleDef.abbreviation} cannot be voice-administered (exam_required).`,
        requiresPhysician: true,
      },
      { status: 422 },
    )
  }

  const sessionId = body.historian_session_id
  if (!sessionId) {
    return NextResponse.json(
      { error: 'historian_session_id is required' },
      { status: 400 },
    )
  }

  const isFirstCall = body.prev_index == null

  if (isFirstCall) {
    // INSERT new in-progress row, return item 0
    const pool = await getPool()
    await pool.query(
      `INSERT INTO scale_results (
        historian_session_id,
        consult_id,
        scale_id,
        scale_name,
        scale_abbreviation,
        raw_responses,
        status,
        current_index,
        admin_mode,
        administered_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())`,
      [
        sessionId,
        body.consult_id ?? null,
        scaleDef.id,
        scaleDef.name,
        scaleDef.abbreviation,
        JSON.stringify({}),
        'in_progress',
        0,
        'voice_administrable',
      ],
    )

    const item0 = questions[0]
    return NextResponse.json<ScaleStepResponse>(
      {
        done: false,
        index: 0,
        item: {
          text: item0.text,
          choices: item0.options?.map((o) => ({ label: o.label, value: o.value })),
        },
      },
      { status: 200 },
    )
  }

  // Subsequent call: record prev_response into raw_responses JSONB, return next item
  const prevIndex = body.prev_index!
  const prevResponse = body.prev_response

  const pool = await getPool()
  const { rows } = await pool.query(
    `SELECT id, current_index, raw_responses
     FROM scale_results
     WHERE historian_session_id = $1 AND scale_id = $2 AND status = 'in_progress'
     ORDER BY administered_at DESC
     LIMIT 1`,
    [sessionId, scaleDef.id],
  )

  if (rows.length === 0) {
    return NextResponse.json<ScaleStepResponse>(
      { status: 'bad_index', expected_index: 0 },
      { status: 200 },
    )
  }

  const row = rows[0]
  if (row.current_index !== prevIndex) {
    return NextResponse.json<ScaleStepResponse>(
      { status: 'bad_index', expected_index: row.current_index },
      { status: 200 },
    )
  }

  // Record response — raw_responses is JSONB; node-postgres may give it
  // back as a parsed object or as a string depending on driver config
  const existingResponses =
    typeof row.raw_responses === 'string'
      ? JSON.parse(row.raw_responses)
      : row.raw_responses ?? {}
  existingResponses[questions[prevIndex].id] = prevResponse

  const nextIndex = prevIndex + 1
  const isLast = nextIndex >= questions.length

  if (!isLast) {
    await pool.query(
      `UPDATE scale_results
       SET raw_responses = $1, current_index = $2
       WHERE id = $3`,
      [JSON.stringify(existingResponses), nextIndex, row.id],
    )

    const itemN = questions[nextIndex]
    return NextResponse.json<ScaleStepResponse>(
      {
        done: false,
        index: nextIndex,
        item: {
          text: itemN.text,
          choices: itemN.options?.map((o) => ({ label: o.label, value: o.value })),
        },
      },
      { status: 200 },
    )
  }

  // Final item: score + flip status to complete
  const calculation = calculateScore(scaleDef, existingResponses)
  const subscaleScores = computeSubscaleScores(scaleDef.id, existingResponses)
  const severityLevel: SeverityLevel = calculation.severity ?? 'none'

  await pool.query(
    `UPDATE scale_results
     SET raw_responses = $1,
         current_index = $2,
         total_score = $3,
         subscale_scores = $4,
         interpretation = $5,
         severity_level = $6,
         triggered_alerts = $7,
         completed_at = NOW(),
         status = 'complete'
     WHERE id = $8`,
    [
      JSON.stringify(existingResponses),
      nextIndex,
      calculation.rawScore,
      subscaleScores ? JSON.stringify(subscaleScores) : null,
      calculation.interpretation,
      severityLevel,
      calculation.triggeredAlerts.length > 0
        ? JSON.stringify(calculation.triggeredAlerts)
        : null,
      row.id,
    ],
  )

  return NextResponse.json<ScaleStepResponse>(
    {
      done: true,
      total_score: calculation.rawScore,
      interpretation: calculation.interpretation,
      severity_level: severityLevel as any,
    },
    { status: 200 },
  )
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
