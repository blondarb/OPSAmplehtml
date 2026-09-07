/**
 * Lean thoroughness for the simulator.
 *
 * The production thoroughness judge (eval/thoroughnessJudge.ts) is a single
 * heavy Sonnet call scoring 6 dimensions against an inlined rubric — on a full
 * transcript it runs past the ~30s Amplify gateway (504) and can't be split
 * (it's one call). This is a fast, compact replacement: a single Haiku call
 * that emits the same shape the simulator dashboard renders (overall,
 * confidence, per-dimension scores, missed critical questions).
 *
 * Same output KEYS as ThoroughnessEvaluation so the dashboard's ThoroughnessTab
 * reads it unchanged. Haiku (fast) so it comfortably fits the gateway.
 */

import { invokeBedrockClinicalTool } from '@/lib/bedrock'
import { computeCostUsd } from '@/lib/historian/eval/constants'
import type { HistorianTranscriptEntry } from '@/lib/historianTypes'

// Haiku 4.5 on Bedrock (same id agreement/adjudication uses). Hardcoded rather
// than imported from independentDdx to avoid pulling that module's heavier deps.
const HAIKU_MODEL_ID = 'us.anthropic.claude-haiku-4-5-20251001-v1:0'
const SIM_THOROUGHNESS_MAX_TOKENS = 900

const DIMENSION_KEYS = [
  'hpi_completeness',
  'oldcarts',
  'red_flags',
  'pmh_meds_allergies',
  'fh_sh',
  'question_quality',
  'closure',
] as const

export interface SimThoroughness {
  overall: number
  confidence: { level: 'High' | 'Moderate' | 'Low'; reason: string }
  hpi_completeness: { score: number }
  oldcarts: { score: number }
  red_flags: { score: number }
  pmh_meds_allergies: { score: number }
  fh_sh: { score: number }
  question_quality: { score: number }
  closure: { score: number }
  missed_critical_questions: Array<{ severity: 'critical' | 'important' | 'minor'; why_it_matters: string }>
  /** Marks this as the lean sim judge, not the full production rubric. */
  lean: true
}

const SYSTEM_PROMPT = `You are a neurologist grading how THOROUGH a completed patient intake interview was (not whether the diagnosis is right — only how complete and well-conducted the history-taking was).

Score each dimension 0-10 (10 = excellent, complete; 0 = not addressed):
- hpi_completeness: history of present illness fully characterized.
- oldcarts: onset, location, duration, character, aggravating/relieving, timing, severity covered.
- red_flags: relevant danger symptoms screened for.
- pmh_meds_allergies: past medical history, medications, allergies asked.
- fh_sh: family history and social history asked.
- question_quality: one-at-a-time, plain language, followed the patient's leads, no re-asking.
- closure: wrapped up appropriately, gave the patient a chance to add anything.

Also give:
- overall: 0-10 overall thoroughness.
- confidence: { level: High|Moderate|Low, reason: one sentence }.
- missed_critical_questions: up to 3 important things the interviewer should have asked but didn't; each { severity: critical|important|minor, why_it_matters: one sentence }. Empty array if none.

Base everything only on what actually happened in the transcript.`

const SCHEMA = {
  type: 'object',
  properties: {
    overall: { type: 'number', minimum: 0, maximum: 10 },
    confidence: {
      type: 'object',
      properties: {
        level: { type: 'string', enum: ['High', 'Moderate', 'Low'] },
        reason: { type: 'string' },
      },
      required: ['level', 'reason'],
    },
    hpi_completeness: { type: 'object', properties: { score: { type: 'number' } }, required: ['score'] },
    oldcarts: { type: 'object', properties: { score: { type: 'number' } }, required: ['score'] },
    red_flags: { type: 'object', properties: { score: { type: 'number' } }, required: ['score'] },
    pmh_meds_allergies: { type: 'object', properties: { score: { type: 'number' } }, required: ['score'] },
    fh_sh: { type: 'object', properties: { score: { type: 'number' } }, required: ['score'] },
    question_quality: { type: 'object', properties: { score: { type: 'number' } }, required: ['score'] },
    closure: { type: 'object', properties: { score: { type: 'number' } }, required: ['score'] },
    missed_critical_questions: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['critical', 'important', 'minor'] },
          why_it_matters: { type: 'string' },
        },
        required: ['severity', 'why_it_matters'],
      },
    },
  },
  required: ['overall', 'confidence', ...DIMENSION_KEYS, 'missed_critical_questions'],
} as const

function numberedTranscript(transcript: HistorianTranscriptEntry[]): string {
  return transcript
    .map((t, i) => `Turn ${i} (${t.role === 'user' ? 'Patient' : 'Historian'}): ${t.text}`)
    .join('\n')
}

function clampScore(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(10, Math.max(0, Math.round(v * 10) / 10)) : 0
}

export async function generateSimThoroughness(
  transcript: HistorianTranscriptEntry[],
  chiefComplaint?: string,
): Promise<{ result: SimThoroughness; modelId: string; costUsd: number | null }> {
  const { parsed, inputTokens, outputTokens } = await invokeBedrockClinicalTool<Record<string, any>>({
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: JSON.stringify({ chiefComplaint: chiefComplaint ?? null, transcript: numberedTranscript(transcript) }),
      },
    ],
    maxTokens: SIM_THOROUGHNESS_MAX_TOKENS,
    temperature: 0,
    model: HAIKU_MODEL_ID,
    toolName: 'record_sim_thoroughness',
    toolDescription: 'Record a concise thoroughness evaluation for a synthetic simulator interview.',
    inputSchema: SCHEMA,
  })

  const dim = (k: string) => ({ score: clampScore(parsed?.[k]?.score) })
  const conf = parsed?.confidence
  const missed = Array.isArray(parsed?.missed_critical_questions) ? parsed.missed_critical_questions : []

  const result: SimThoroughness = {
    overall: clampScore(parsed?.overall),
    confidence: {
      level: conf?.level === 'High' || conf?.level === 'Low' ? conf.level : 'Moderate',
      reason: typeof conf?.reason === 'string' ? conf.reason.trim() : '',
    },
    hpi_completeness: dim('hpi_completeness'),
    oldcarts: dim('oldcarts'),
    red_flags: dim('red_flags'),
    pmh_meds_allergies: dim('pmh_meds_allergies'),
    fh_sh: dim('fh_sh'),
    question_quality: dim('question_quality'),
    closure: dim('closure'),
    missed_critical_questions: missed
      .slice(0, 3)
      .filter((m: any) => m && typeof m.why_it_matters === 'string')
      .map((m: any) => ({
        severity: ['critical', 'important', 'minor'].includes(m.severity) ? m.severity : 'important',
        why_it_matters: String(m.why_it_matters).trim(),
      })),
    lean: true,
  }

  return {
    result,
    modelId: HAIKU_MODEL_ID,
    costUsd: computeCostUsd(HAIKU_MODEL_ID, { inputTokens, outputTokens }),
  }
}
