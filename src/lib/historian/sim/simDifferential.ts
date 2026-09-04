/**
 * Lightweight differential for the on-demand / live simulator.
 *
 * The production/batch grader (eval/finalDifferential.ts) asks for up to 6
 * diagnoses each with up to 12 VERBATIM transcript quotes at a 4000-token
 * budget — a genuinely large generation that exceeds the ~30s Amplify request
 * limit (504). That quote-grounding is an audit feature the simulator's
 * hit/miss grading does not need.
 *
 * This is a leaner, single-call version: same Claude model, same
 * DifferentialItem output shape (so the dashboard, persistSimCase, and
 * ground-truth scoring all consume it unchanged — supporting/contradicting
 * quotes are simply empty), but 4 diagnoses, no quotes, and a small token
 * budget so it comes back well under the gateway limit. Leaves the production
 * grader untouched (no regression to the batch harness or the save route).
 */

import { invokeBedrockClinicalTool, BEDROCK_MODEL } from '@/lib/bedrock'
import type { HistorianTranscriptEntry } from '@/lib/historianTypes'

export interface SimDifferentialItem {
  diagnosis: string
  icd10: string | null
  likelihood: 'High' | 'Moderate' | 'Low'
  likelihood_pct: number
  rationale: string
  supporting_quotes: never[]
  contradicting_quotes: never[]
}

export interface SimDifferential {
  differential: SimDifferentialItem[]
  summary: string
  provenance: { model_id: string; prompt_version: string; generated_at: string }
  status: 'ok' | 'insufficient_transcript'
}

const SIM_MAX_ITEMS = 4
const SIM_MAX_TOKENS = 1200
const MIN_PATIENT_TURNS = 2

const SIM_DDX_SYSTEM_PROMPT = `You are a neurologist producing a concise differential diagnosis from a completed patient intake transcript, for a synthetic quality-review dashboard.

Produce up to ${SIM_MAX_ITEMS} candidate diagnoses, ranked most likely first, plus a one-paragraph summary.

Rules:
- diagnosis: display name (e.g. "Migraine without aura").
- icd10: an ICD-10 code if you are reasonably confident, else null.
- likelihood: exactly one of "High", "Moderate", "Low".
- likelihood_pct: your estimated probability 0-100, consistent with the likelihood band.
- rationale: ONE sentence grounded in what the patient actually reported.
- summary: one short paragraph on the overall picture and the ranking.
- Base everything on what the patient/historian actually said — never invent findings. Do not include any quotes.`

const SIM_DDX_SCHEMA = {
  type: 'object',
  properties: {
    differential: {
      type: 'array',
      minItems: 1,
      maxItems: SIM_MAX_ITEMS,
      items: {
        type: 'object',
        properties: {
          diagnosis: { type: 'string' },
          icd10: { type: ['string', 'null'] },
          likelihood: { type: 'string', enum: ['High', 'Moderate', 'Low'] },
          likelihood_pct: { type: 'number', minimum: 0, maximum: 100 },
          rationale: { type: 'string' },
        },
        required: ['diagnosis', 'icd10', 'likelihood', 'likelihood_pct', 'rationale'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['differential', 'summary'],
} as const

function numberedTranscript(transcript: HistorianTranscriptEntry[]): string {
  return transcript
    .map((t, i) => `Turn ${i} (${t.role === 'user' ? 'Patient' : 'Historian'}): ${t.text}`)
    .join('\n')
}

function sanitizeLikelihood(v: unknown): SimDifferentialItem['likelihood'] {
  return v === 'High' || v === 'Moderate' || v === 'Low' ? v : 'Moderate'
}

export async function generateSimDifferential(
  transcript: HistorianTranscriptEntry[],
  chiefComplaint?: string,
): Promise<SimDifferential> {
  const patientTurns = transcript.filter((t) => t.role === 'user' && t.text.trim().length > 0).length
  const provenanceBase = { prompt_version: 'sim-ddx-v1', generated_at: new Date().toISOString() }
  if (patientTurns < MIN_PATIENT_TURNS) {
    return {
      differential: [],
      summary: 'Insufficient transcript for a differential.',
      provenance: { model_id: 'none', ...provenanceBase },
      status: 'insufficient_transcript',
    }
  }

  const { parsed } = await invokeBedrockClinicalTool<{ differential: unknown[]; summary: string }>({
    system: SIM_DDX_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: JSON.stringify({
          chiefComplaint: chiefComplaint ?? null,
          transcript: numberedTranscript(transcript),
        }),
      },
    ],
    maxTokens: SIM_MAX_TOKENS,
    temperature: 0,
    toolName: 'record_sim_differential',
    toolDescription: 'Record a concise differential diagnosis for a synthetic simulator interview.',
    inputSchema: SIM_DDX_SCHEMA,
  })

  const raw = Array.isArray(parsed?.differential) ? parsed.differential : []
  const differential: SimDifferentialItem[] = raw
    .slice(0, SIM_MAX_ITEMS)
    .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object' && typeof (e as any).diagnosis === 'string')
    .map((e) => ({
      diagnosis: String(e.diagnosis).trim(),
      icd10: typeof e.icd10 === 'string' && e.icd10.trim() ? e.icd10.trim() : null,
      likelihood: sanitizeLikelihood(e.likelihood),
      likelihood_pct:
        typeof e.likelihood_pct === 'number' && Number.isFinite(e.likelihood_pct)
          ? Math.min(100, Math.max(0, Math.round(e.likelihood_pct)))
          : 0,
      rationale: typeof e.rationale === 'string' ? e.rationale.trim() : '',
      supporting_quotes: [],
      contradicting_quotes: [],
    }))

  return {
    differential,
    summary: typeof parsed?.summary === 'string' ? parsed.summary.trim() : '',
    provenance: { model_id: BEDROCK_MODEL, ...provenanceBase },
    status: 'ok',
  }
}
