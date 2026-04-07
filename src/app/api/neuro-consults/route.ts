/**
 * POST /api/neuro-consults  — Create a new pipeline consult record
 * GET  /api/neuro-consults  — List recent consults (optionally filtered by patient)
 *
 * A neuro-consult record is the backbone of the Phase 1 intake pipeline.
 * It tracks a referral from Triage → Intake Agent → AI Historian.
 *
 * Note: /api/consults is the existing provider-to-provider consult request
 * system and is unrelated to this pipeline.
 */

import { NextResponse } from 'next/server'
import { createConsult, listConsults } from '@/lib/consult/pipeline'
import type { TriageConsultUpdate } from '@/lib/consult/types'

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/neuro-consults
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { referral_text, patient_id, triage_data } = body as {
      referral_text?: string
      patient_id?: string
      triage_data?: TriageConsultUpdate
    }

    const result = await createConsult(referral_text, triage_data, patient_id)

    if (!result.data) {
      return NextResponse.json(
        { error: result.error || 'Failed to create consult record. Please try again.' },
        { status: 500 },
      )
    }

    return NextResponse.json({ consult: result.data }, { status: 201 })
  } catch (error: unknown) {
    console.error('POST /api/neuro-consults error:', error)
    const message = error instanceof Error ? error.message : 'Failed to create consult record. Please try again.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/neuro-consults
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const patientId = searchParams.get('patient_id') || undefined
    const limit = parseInt(searchParams.get('limit') || '20', 10)

    const consults = await listConsults(patientId, Math.min(limit, 100))

    return NextResponse.json({ consults })
  } catch (error: unknown) {
    console.error('GET /api/neuro-consults error:', error)
    const message = error instanceof Error ? error.message : 'Failed to list consults'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
