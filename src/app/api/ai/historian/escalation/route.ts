import { NextResponse } from 'next/server'
import { getTenantServer } from '@/lib/tenant'
import { getPool } from '@/lib/db'
import { detectRedFlags, resolveEscalationTier } from '@/lib/consult/red-flags/red-flag-detector'
import type { EscalationTier } from '@/lib/consult/red-flags/red-flag-types'

// POST /api/ai/historian/escalation
// body: { action: 'check', consult_id, transcript } | { action: 'escalate', consult_id, flag_name, from_tier, to_tier, detected_symptoms, confidence }
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { action } = body

    if (action === 'check') {
      return handleCheck(body)
    }
    if (action === 'escalate') {
      return handleEscalate(body)
    }

    return NextResponse.json({ error: 'Invalid action. Use "check" or "escalate".' }, { status: 400 })
  } catch (error: any) {
    console.error('Escalation API error:', error)
    return NextResponse.json(
      { error: error?.message || 'Escalation check failed' },
      { status: 500 },
    )
  }
}

async function handleCheck(body: { consult_id: string; transcript: string }) {
  const { consult_id, transcript } = body

  if (!consult_id || !transcript) {
    return NextResponse.json(
      { error: 'consult_id and transcript are required' },
      { status: 400 },
    )
  }

  const detection = detectRedFlags(transcript, consult_id)
  const tier = resolveEscalationTier(detection)

  return NextResponse.json({
    detection,
    recommended_tier: tier,
    flag_count: detection.detected_flags.length,
    requires_escalation: detection.detected_flags.length > 0,
  })
}

async function handleEscalate(body: {
  consult_id: string
  flag_name: string
  severity: string
  from_tier: EscalationTier
  to_tier: EscalationTier
  detected_symptoms: string[]
  confidence: number
}) {
  const { consult_id, flag_name, severity, from_tier, to_tier, detected_symptoms, confidence } = body

  if (!consult_id || !flag_name) {
    return NextResponse.json(
      { error: 'consult_id and flag_name are required' },
      { status: 400 },
    )
  }

  const pool = await getPool()

  const { rows } = await pool.query(
    `INSERT INTO red_flag_events
       (consult_id, flag_name, severity, detected_symptoms, confidence,
        escalation_from_tier, escalation_to_tier)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      consult_id,
      flag_name,
      severity || 'high',
      JSON.stringify(detected_symptoms || []),
      confidence || 0.8,
      from_tier || 'routine',
      to_tier || 'urgent',
    ],
  )

  // Bump red_flag_count on the consult record
  await pool.query(
    `UPDATE neurology_consults
     SET red_flag_count = COALESCE(red_flag_count, 0) + 1,
         updated_at = NOW()
     WHERE id = $1`,
    [consult_id],
  )

  return NextResponse.json({ event: rows[0] })
}

// GET /api/ai/historian/escalation?consult_id=...
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const consultId = searchParams.get('consult_id')

    if (!consultId) {
      return NextResponse.json({ error: 'consult_id is required' }, { status: 400 })
    }

    const pool = await getPool()

    const { rows } = await pool.query(
      `SELECT * FROM red_flag_events
       WHERE consult_id = $1
       ORDER BY detected_at DESC`,
      [consultId],
    )

    return NextResponse.json({ events: rows })
  } catch (error: any) {
    console.error('Escalation GET error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch escalation events' },
      { status: 500 },
    )
  }
}
