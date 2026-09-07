/**
 * In-depth physician summary for the simulator — its OWN generation step.
 *
 * Kept separate from the (lean, latency-bounded) differential call: folding a
 * full physician write-up into that call made it heavy enough to 504 at the
 * ~30s gateway. This is a single dedicated Bedrock call over the finished
 * transcript + the already-computed differential.
 *
 * Same Claude model. Output is a structured SimPhysicianSummary that the
 * dashboard renders (one-liner + HPI + Assessment & reasoning + workup).
 */

import { invokeBedrockClinicalTool } from '@/lib/bedrock'
import type { HistorianTranscriptEntry } from '@/lib/historianTypes'
import type { SimDifferential, SimPhysicianSummary } from '@/lib/historian/sim/simDifferential'

const SUMMARY_MAX_TOKENS = 900

const SUMMARY_SYSTEM_PROMPT = `You are a neurologist writing an in-depth physician summary of a completed patient intake, for a quality-review dashboard.

You are given the interview transcript and a ranked differential (with exclusion reasoning) already produced for this case. Write a concise but substantive physician summary — the synthesis a neurologist wants at a glance.

Return:
- one_liner: age/sex + the chief problem + the most salient context, in ONE sentence (e.g. "35F with 6 months of chronic daily headache on a background of migraine with aura, with analgesic overuse.").
- hpi: a narrative paragraph synthesizing the history actually gathered — onset, course, character, associated features, and relevant PMH / medications / social history. Clinical prose, not a bullet dump.
- assessment: the clinical reasoning — name the leading diagnosis and why, then the key conditions ruled out and why (consistent with the provided differential). 2-4 sentences.
- workup: suggested next steps (studies, labs, referral, monitoring). No drug doses. "" if nothing is warranted.

Base everything on what the patient/historian actually said and the provided differential — never invent findings.`

const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    one_liner: { type: 'string' },
    hpi: { type: 'string' },
    assessment: { type: 'string' },
    workup: { type: 'string' },
  },
  required: ['one_liner', 'hpi', 'assessment', 'workup'],
} as const

function numberedTranscript(transcript: HistorianTranscriptEntry[]): string {
  return transcript
    .map((t, i) => `Turn ${i} (${t.role === 'user' ? 'Patient' : 'Historian'}): ${t.text}`)
    .join('\n')
}

export async function generateSimPhysicianSummary(
  transcript: HistorianTranscriptEntry[],
  differential: SimDifferential | null,
  chiefComplaint?: string,
): Promise<SimPhysicianSummary> {
  const { parsed } = await invokeBedrockClinicalTool<Record<string, unknown>>({
    system: SUMMARY_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: JSON.stringify({
          chiefComplaint: chiefComplaint ?? null,
          differential: differential?.differential ?? [],
          excluded: differential?.excluded ?? [],
          transcript: numberedTranscript(transcript),
        }),
      },
    ],
    maxTokens: SUMMARY_MAX_TOKENS,
    temperature: 0,
    toolName: 'record_physician_summary',
    toolDescription: 'Record an in-depth physician summary for a synthetic simulator interview.',
    inputSchema: SUMMARY_SCHEMA,
  })

  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  return {
    one_liner: str(parsed?.one_liner),
    hpi: str(parsed?.hpi),
    assessment: str(parsed?.assessment),
    workup: str(parsed?.workup),
  }
}
