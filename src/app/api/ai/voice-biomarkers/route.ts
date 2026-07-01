/**
 * POST /api/ai/voice-biomarkers
 *
 * Phase A scaffold (2026-06-30). Acoustic speech-biomarker analysis for the
 * neuro voice-task battery (sustained vowel / pa-ta-ka / reading).
 *
 * Stack fit: the browser decodes + downsamples audio to mono 16-bit PCM and
 * POSTs the raw bytes here (no ffmpeg / no Python in the Node Lambda). This
 * route runs the pure-TS engine and returns a GREEN/YELLOW/RED panel.
 *
 * Gated behind VOICE_BIOMARKERS_ENABLED (default OFF) until the test-week
 * bake-off validates thresholds. SCREENING ONLY — not a diagnosis.
 *
 * Request:
 *   ?task=sustained_vowel|ddk|reading&sampleRate=16000[&patientId=...&visitId=...]
 *   body: application/octet-stream, little-endian Int16 mono PCM
 * Response: { panel: BiomarkerPanel, persisted: boolean }
 *
 * See docs/plans/2026-06-30-acoustic-speech-biomarkers-spec.md.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/cognito/server'
import { getTenantServer } from '@/lib/tenant'
import { from } from '@/lib/db-query'
import { analyzeAcoustic } from '@/lib/voice/acoustic'
import { buildPanel, isVoiceBiomarkersEnabled } from '@/lib/voice/flagging'
import { scoreAllEngines } from '@/lib/voice/engines'
import type { VoiceTask, BiomarkerPanel } from '@/lib/voice/types'

const VALID_TASKS: VoiceTask[] = ['sustained_vowel', 'ddk', 'reading']

// Map a panel's overall flag to a 0–3 severity (for scale_results.raw_score).
const FLAG_SCORE: Record<string, number> = { GREEN: 0, INVALID: 0, NOT_PERFORMED: 0, YELLOW: 1, RED: 2 }

export async function POST(request: NextRequest) {
  if (!isVoiceBiomarkersEnabled()) {
    return NextResponse.json(
      { error: 'Voice biomarkers are disabled. Set VOICE_BIOMARKERS_ENABLED to enable.' },
      { status: 503 }
    )
  }

  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const task = searchParams.get('task') as VoiceTask | null
  const sampleRate = parseInt(searchParams.get('sampleRate') || '0', 10)
  const patientId = searchParams.get('patientId')
  const visitId = searchParams.get('visitId')
  // Research/trials mode: score with EVERY registered engine in parallel (pure-TS
  // + Praat sidecar if VOICE_PRAAT_URL is set) so a capture yields both engines'
  // numbers on the identical audio for the bake-off.
  const allEngines = ['1', 'true', 'on'].includes((searchParams.get('allEngines') || '').toLowerCase())

  if (!task || !VALID_TASKS.includes(task)) {
    return NextResponse.json(
      { error: `task must be one of: ${VALID_TASKS.join(', ')}` },
      { status: 400 }
    )
  }
  if (!sampleRate || sampleRate < 8000 || sampleRate > 48000) {
    return NextResponse.json({ error: 'sampleRate (8000–48000) is required' }, { status: 400 })
  }

  // Read raw Int16 mono PCM from the request body.
  let pcm: Int16Array
  try {
    const buf = await request.arrayBuffer()
    if (buf.byteLength === 0) {
      return NextResponse.json({ error: 'Empty audio body' }, { status: 400 })
    }
    if (buf.byteLength > 20 * 1024 * 1024) {
      return NextResponse.json({ error: 'Audio too long (max ~10 min of 16 kHz PCM)' }, { status: 400 })
    }
    // byteLength may be odd if the client appended a stray byte — floor to samples.
    const samples = Math.floor(buf.byteLength / 2)
    pcm = new Int16Array(buf, 0, samples)
  } catch (e) {
    return NextResponse.json(
      { error: `Failed to read audio body: ${e instanceof Error ? e.message : String(e)}` },
      { status: 400 }
    )
  }

  // Int16 → Float32 in [-1, 1).
  const samples = new Float32Array(pcm.length)
  for (let i = 0; i < pcm.length; i++) samples[i] = pcm[i] / 32768

  // Research/trials mode: return every engine's result (no persistence — the
  // offline bench owns archival + comparison).
  if (allEngines) {
    try {
      const engines = await scoreAllEngines(task, { samples, sampleRate })
      return NextResponse.json({ task, sampleRate, engines })
    } catch (e) {
      return NextResponse.json(
        { error: `Multi-engine scoring failed: ${e instanceof Error ? e.message : String(e)}` },
        { status: 500 }
      )
    }
  }

  let panel: BiomarkerPanel
  try {
    const raw = analyzeAcoustic(task, { samples, sampleRate })
    panel = buildPanel(raw)
    panel.meta.sampleRate = sampleRate
  } catch (e) {
    // Engine should never throw on real audio, but never 500 the demo either.
    console.error('[voice-biomarkers] analysis error:', e)
    return NextResponse.json(
      { error: `Analysis failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 }
    )
  }

  // Best-effort persistence: only when a patient context is supplied. Maps to
  // the MDS-UPDRS speech item so it joins the longitudinal scale-trend infra.
  // A DB failure must not fail the analysis response.
  let persisted = false
  if (patientId) {
    try {
      const tenant = getTenantServer()
      const { error } = await from('scale_results').insert({
        tenant_id: tenant,
        patient_id: patientId,
        visit_id: visitId || null,
        scale_id: `mds_updrs_speech_${task}`,
        responses: panel,
        raw_score: FLAG_SCORE[panel.overallFlag] ?? 0,
        interpretation: `Acoustic ${task} screen: ${panel.overallFlag}`,
        severity_level: panel.overallFlag,
        notes: `engine=${panel.meta.engine}; screening only, not diagnostic`,
        completed_by: user.id,
        completed_at: new Date().toISOString(),
      })
      persisted = !error
      if (error) console.warn('[voice-biomarkers] scale_results insert failed:', error.message)
    } catch (e) {
      console.warn('[voice-biomarkers] persistence skipped:', e instanceof Error ? e.message : String(e))
    }
  }

  return NextResponse.json({ panel, persisted })
}
