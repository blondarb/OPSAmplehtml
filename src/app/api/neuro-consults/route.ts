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
import { authorizeClinicalAccess } from '@/lib/auth/clinicalAccess'
import { getPool } from '@/lib/db'
import {
  buildTriageSummaryForConsult,
  deriveChiefComplaint,
} from '@/lib/consult/contextBuilder'
import { formatTierDisplay } from '@/lib/triage/scoring'
import type { TriageTier } from '@/lib/triage/types'

const TRIAGE_TIERS = new Set<TriageTier>([
  'emergent',
  'urgent',
  'semi_urgent',
  'routine_priority',
  'routine',
  'non_urgent',
  'insufficient_data',
])

function parseJSON(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function stringArray(value: unknown): string[] {
  const parsed = parseJSON(value)
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === 'string')
    : []
}

async function loadTriageConsultData(
  triageSessionId: string,
  tenantId: string,
): Promise<{
  referralText: string
  patientId?: string
  update: TriageConsultUpdate
} | null> {
  const pool = await getPool()
  const { rows } = await pool.query(
    `SELECT id,
            referral_text,
            patient_id,
            processing_status,
            triage_tier,
            clinical_reasons,
            suggested_workup,
            red_flags,
            subspecialty_recommendation,
            subspecialty_rationale,
            ai_raw_response
       FROM triage_sessions
      WHERE id = $1
        AND tenant_id = $2
        AND processing_status = 'complete'
      LIMIT 1`,
    [triageSessionId, tenantId],
  )
  const row = rows[0] as Record<string, unknown> | undefined
  if (!row || !TRIAGE_TIERS.has(row.triage_tier as TriageTier)) return null

  const tier = row.triage_tier as TriageTier
  const clinicalReasons = stringArray(row.clinical_reasons)
  const suggestedWorkup = stringArray(row.suggested_workup)
  const redFlags = stringArray(row.red_flags)
  const subspecialtyRecommendation =
    typeof row.subspecialty_recommendation === 'string'
      ? row.subspecialty_recommendation
      : ''
  const subspecialtyRationale =
    typeof row.subspecialty_rationale === 'string'
      ? row.subspecialty_rationale
      : ''
  const referralText =
    typeof row.referral_text === 'string' ? row.referral_text : ''
  const aiRaw = parseJSON(row.ai_raw_response)
  const redFlagOverride =
    !!aiRaw &&
    typeof aiRaw === 'object' &&
    (aiRaw as Record<string, unknown>).red_flag_override === true
  const tierDisplay = formatTierDisplay(tier, redFlagOverride)

  return {
    referralText,
    patientId:
      typeof row.patient_id === 'string' ? row.patient_id : undefined,
    update: {
      triage_session_id: String(row.id),
      triage_urgency: tier,
      triage_tier_display: tierDisplay,
      triage_summary: buildTriageSummaryForConsult(
        tierDisplay,
        clinicalReasons,
        suggestedWorkup,
        subspecialtyRecommendation,
        subspecialtyRationale,
      ),
      triage_chief_complaint: deriveChiefComplaint(
        clinicalReasons,
        referralText,
        subspecialtyRecommendation,
      ),
      triage_red_flags: redFlags,
      triage_subspecialty: subspecialtyRecommendation,
    },
  }
}

async function patientBelongsToTenant(
  patientId: string,
  tenantId: string,
): Promise<boolean> {
  const pool = await getPool()
  const { rows } = await pool.query(
    `SELECT id
       FROM patients
      WHERE id = $1
        AND tenant_id = $2
      LIMIT 1`,
    [patientId, tenantId],
  )
  return rows.length === 1
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/neuro-consults
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const access = await authorizeClinicalAccess({
      action: 'consult.update',
      allowedRoles: ['clinician', 'admin'],
    })
    if (!access.ok) {
      return NextResponse.json(
        { error: 'Access denied', reason: access.reason },
        { status: access.status },
      )
    }

    const body = await request.json()
    const { referral_text, patient_id, triage_data } = body as {
      referral_text?: string
      patient_id?: string
      triage_data?: TriageConsultUpdate
    }

    let authoritativeReferral = referral_text
    let authoritativePatientId = patient_id
    let authoritativeTriage: TriageConsultUpdate | undefined

    if (triage_data) {
      const triageSessionId =
        typeof triage_data.triage_session_id === 'string'
          ? triage_data.triage_session_id.trim()
          : ''
      if (!triageSessionId) {
        return NextResponse.json(
          { error: 'A completed triage session is required' },
          { status: 400 },
        )
      }
      const resolved = await loadTriageConsultData(
        triageSessionId,
        access.context.tenantId,
      )
      if (!resolved) {
        return NextResponse.json(
          { error: 'Completed triage session not found' },
          { status: 409 },
        )
      }
      authoritativeReferral = resolved.referralText
      authoritativePatientId = resolved.patientId ?? patient_id
      authoritativeTriage = resolved.update
    }

    if (
      authoritativePatientId &&
      !(await patientBelongsToTenant(
        authoritativePatientId,
        access.context.tenantId,
      ))
    ) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
    }

    const result = await createConsult(
      authoritativeReferral,
      authoritativeTriage,
      authoritativePatientId,
      access.context.tenantId,
    )

    if (!result.data) {
      return NextResponse.json(
        { error: 'Failed to create consult record' },
        { status: 500 },
      )
    }

    return NextResponse.json({ consult: result.data }, { status: 201 })
  } catch {
    console.error('[neuro-consults] create failed')
    return NextResponse.json(
      { error: 'Failed to create consult record' },
      { status: 500 },
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/neuro-consults
// ─────────────────────────────────────────────────────────────────────────────

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
    const patientId = searchParams.get('patient_id') || undefined
    const parsedLimit = Number.parseInt(searchParams.get('limit') || '20', 10)
    const limit = Number.isSafeInteger(parsedLimit)
      ? Math.max(1, Math.min(parsedLimit, 100))
      : 20

    const consults = await listConsults(
      patientId,
      limit,
      access.context.tenantId,
    )

    return NextResponse.json({ consults })
  } catch {
    console.error('[neuro-consults] list failed')
    return NextResponse.json(
      { error: 'Failed to list consults' },
      { status: 500 },
    )
  }
}
