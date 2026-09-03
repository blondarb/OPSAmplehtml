/**
 * POST /api/ai/historian/sim/score/finalize — stage 2 of live scoring.
 *
 * Body: { persona, transcript: {role,text}[], differential, batchId?, batchLabel? }
 *   `differential` = the FinalDifferential from /sim/score/differential.
 * Runs thoroughness + ground-truth scoring against the provided differential,
 * then persists one historian_sim_runs row (with the live transcript).
 * Returns: { batchId, ok, top1Hit }
 *
 * Split from the differential stage so each request stays under the ~30s
 * gateway timeout. Cross-model (R1 + agreement) is intentionally omitted from
 * live/on-demand runs. Synthetic only. Incurs Bedrock cost.
 */

import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import type { HistorianTranscriptEntry } from '@/lib/historianTypes'

export const maxDuration = 120

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const persona = typeof body?.persona === 'string' ? body.persona.replace(/\.json$/, '').trim() : ''
    const raw = Array.isArray(body?.transcript) ? body.transcript : []
    const differential = body?.differential ?? null
    if (!persona) return NextResponse.json({ error: 'persona is required' }, { status: 400 })
    if (raw.length === 0) return NextResponse.json({ error: 'transcript is required' }, { status: 400 })

    const transcript: HistorianTranscriptEntry[] = raw
      .filter((t: any) => t && (t.role === 'assistant' || t.role === 'user') && typeof t.text === 'string')
      .map((t: any, i: number) => ({ role: t.role, text: t.text, timestamp: i, seq: i + 1 }))

    const { buildPersonaTranscript } = await import('@/lib/historian/eval/personaFixtures')
    let expectedDDx: any[] = []
    let chiefComplaint: string | undefined
    try {
      const fixture = buildPersonaTranscript(persona)
      expectedDDx = fixture.expectedDDx
      chiefComplaint = fixture.chiefComplaint || undefined
    } catch {
      return NextResponse.json({ error: `Unknown persona "${persona}".` }, { status: 400 })
    }

    // Thoroughness (with usage for real cost).
    const { generateThoroughnessEvaluationWithUsage } = await import('@/lib/historian/eval/thoroughnessJudge')
    const { computeCostUsd } = await import('@/lib/historian/eval/constants')
    let thoroughnessResult: unknown = null
    let thoroughnessModel: string | null = null
    let thoroughnessCost: number | null = null
    try {
      const { evaluation, usage } = await generateThoroughnessEvaluationWithUsage(transcript, {
        chiefComplaint,
        syndrome: persona,
        structuredOutput: null,
        narrativeSummary: null,
      })
      thoroughnessResult = evaluation
      thoroughnessModel = evaluation.provenance.model_id
      thoroughnessCost = computeCostUsd(evaluation.provenance.model_id, usage)
    } catch (err) {
      console.error('[sim/finalize] thoroughness failed (non-fatal):', err)
    }

    // Ground-truth scoring against the provided differential (high-likelihood
    // expected diagnoses, or all if none are marked high).
    const high = expectedDDx.filter((d) => d?.likelihood === 'high')
    const expectedCandidates = (high.length > 0 ? high : expectedDDx).map((d) => d.diagnosis)
    let pipeline: unknown = null
    if (differential?.differential && expectedCandidates.length > 0) {
      try {
        const { scoreAgainstGroundTruth } = await import('@/lib/historian/eval/agreement')
        const { adjudicateEquivalence } = await import('@/lib/historian/eval/independentDdx')
        pipeline = await scoreAgainstGroundTruth(differential.differential, expectedCandidates, adjudicateEquivalence)
      } catch (err) {
        console.error('[sim/finalize] ground-truth scoring failed (non-fatal):', err)
      }
    }
    const groundTruth = { expectedCandidates, pipeline, independent: null }

    const outcome = {
      caseId: persona,
      source: 'fixture' as const,
      syndrome: persona,
      chiefComplaint: chiefComplaint ?? null,
      turnCount: transcript.length,
      insufficientTranscript: false,
      finalDifferential: {
        result: differential,
        costUsd: null,
        modelId: differential?.provenance?.model_id ?? null,
      },
      thoroughness: { result: thoroughnessResult, costUsd: thoroughnessCost, modelId: thoroughnessModel },
      independentDdx: { result: null },
      agreement: { result: null },
      groundTruth,
    }

    const batchId: string = typeof body?.batchId === 'string' && body.batchId ? body.batchId : randomUUID()
    const batchLabel: string | null =
      typeof body?.batchLabel === 'string' && body.batchLabel
        ? body.batchLabel
        : `Live ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`

    const { getPool } = await import('@/lib/db')
    const pool = await getPool()
    const { persistSimCase } = await import('@/lib/historian/eval/persistSimRun')
    await persistSimCase(pool, batchId, batchLabel, outcome as any, transcript)

    return NextResponse.json({ batchId, ok: Boolean(differential), top1Hit: (pipeline as any)?.top1Hit ?? null })
  } catch (error: any) {
    const pgCode = (error as { code?: string })?.code
    if (pgCode === '42P01') {
      return NextResponse.json(
        { error: 'historian_sim_runs table not present — apply migration 059 first.' },
        { status: 503 },
      )
    }
    console.error('Historian sim score/finalize error:', error)
    return NextResponse.json({ error: error?.message || 'Finalize scoring failed' }, { status: 500 })
  }
}
