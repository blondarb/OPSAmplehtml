import {
  copyBedrockTokenUsage,
  invokeBedrockClinicalTool,
  type BedrockTokenUsage,
} from '@/lib/bedrock'
import type { CarePathway } from './types'
import { resolveTriageModelRegistry } from './modelRegistry'
import { CLINICAL_SOURCE_TRUST_BOUNDARY } from './promptSafety'

export const TRIAGE_ADJUDICATOR_PROMPT_VERSION =
  'neurology-triage-adjudicator-v1'

export interface TriageAdjudicatorContext {
  deterministicPathway: string
  safetyModelPathway: string
  scoringPathway: string
  fusionReasons: string[]
}

export interface TriageAdjudicatorEvidence {
  quote: string
  startOffset: number
  endOffset: number
}

export interface ValidatedTriageAdjudicatorDecision {
  carePathway: CarePathway
  rationale: string
  evidence: TriageAdjudicatorEvidence[]
  unresolvedConflicts: string[]
}

const CARE_PATHWAYS = new Set<CarePathway>([
  'emergency_now',
  'same_day_clinician_review',
  'expedited_outpatient',
  'routine_outpatient',
  'redirect',
  'undetermined',
])

export const TRIAGE_ADJUDICATOR_SYSTEM_PROMPT = `You are a sparse neurology triage disagreement adjudicator. You are called only after a deterministic emergency gateway, an independent high-recall safety extractor, and an outpatient scorer disagree or one branch is uncertain.

${CLINICAL_SOURCE_TRUST_BOUNDARY}

You do not diagnose, schedule, or give patient advice. Review the exact source and branch pathways. Preserve the most safety-conservative credible interpretation. You may recommend a more urgent pathway, but downstream deterministic code will never permit you to lower an established safety floor or clear a failed branch.

Evidence rules:
- Copy evidence quotes character-for-character from the source.
- occurrence_index is the zero-based occurrence of that exact quote in source order.
- emergency_now or same_day_clinician_review requires at least one exact evidence quote.
- If evidence is missing, conflicting, or cannot be located exactly, choose undetermined.
- Negated, historical, family, hypothetical, copied education, or ruled-out text is not a current patient emergency.

Return only complete JSON:
{
  "care_pathway": "emergency_now | same_day_clinician_review | expedited_outpatient | routine_outpatient | redirect | undetermined",
  "rationale": "brief evidence-based rationale",
  "evidence": [{"quote":"exact source substring","occurrence_index":0}],
  "unresolved_conflicts": ["bounded conflict"]
}`

const ADJUDICATOR_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    care_pathway: {
      type: 'string',
      enum: [
        'emergency_now',
        'same_day_clinician_review',
        'expedited_outpatient',
        'routine_outpatient',
        'redirect',
        'undetermined',
      ],
    },
    rationale: { type: 'string' },
    evidence: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          quote: { type: 'string' },
          occurrence_index: { type: 'integer', minimum: 0 },
        },
        required: ['quote', 'occurrence_index'],
      },
    },
    unresolved_conflicts: {
      type: 'array',
      maxItems: 20,
      items: { type: 'string' },
    },
  },
  required: [
    'care_pathway',
    'rationale',
    'evidence',
    'unresolved_conflicts',
  ],
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function occurrences(source: string, quote: string): number[] {
  const result: number[] = []
  let cursor = 0
  while (cursor <= source.length - quote.length) {
    const found = source.indexOf(quote, cursor)
    if (found < 0) break
    result.push(found)
    cursor = found + Math.max(1, quote.length)
  }
  return result
}

export function validateTriageAdjudicatorDecision(
  value: unknown,
  sourceText: string,
): ValidatedTriageAdjudicatorDecision {
  if (!isRecord(value)) throw new Error('Invalid adjudicator output object')
  const carePathway = value.care_pathway
  if (
    typeof carePathway !== 'string' ||
    !CARE_PATHWAYS.has(carePathway as CarePathway)
  ) {
    throw new Error('Invalid adjudicator care_pathway')
  }
  if (
    typeof value.rationale !== 'string' ||
    !value.rationale.trim() ||
    value.rationale.length > 4_000
  ) {
    throw new Error('Invalid adjudicator rationale')
  }
  if (!Array.isArray(value.evidence) || value.evidence.length > 10) {
    throw new Error('Invalid adjudicator evidence')
  }
  if (
    ['emergency_now', 'same_day_clinician_review'].includes(carePathway) &&
    value.evidence.length === 0
  ) {
    throw new Error('Time-critical adjudication requires exact evidence')
  }
  const evidence = value.evidence.map((raw, index) => {
    if (!isRecord(raw)) throw new Error(`Invalid adjudicator evidence[${index}]`)
    const quote = raw.quote
    const occurrenceIndex = raw.occurrence_index
    if (
      typeof quote !== 'string' ||
      !quote.trim() ||
      quote.length > 2_000 ||
      !Number.isSafeInteger(occurrenceIndex) ||
      (occurrenceIndex as number) < 0
    ) {
      throw new Error(`Invalid adjudicator evidence[${index}]`)
    }
    const startOffset = occurrences(sourceText, quote)[occurrenceIndex as number]
    if (startOffset === undefined) {
      throw new Error(`Invalid adjudicator evidence[${index}]: quote not found`)
    }
    return {
      quote,
      startOffset,
      endOffset: startOffset + quote.length,
    }
  })
  if (
    !Array.isArray(value.unresolved_conflicts) ||
    value.unresolved_conflicts.length > 20 ||
    value.unresolved_conflicts.some(
      (conflict) =>
        typeof conflict !== 'string' ||
        !conflict.trim() ||
        conflict.length > 2_000,
    )
  ) {
    throw new Error('Invalid adjudicator unresolved_conflicts')
  }

  return {
    carePathway: carePathway as CarePathway,
    rationale: value.rationale,
    evidence,
    unresolvedConflicts: value.unresolved_conflicts,
  }
}

export async function runTriageAdjudicator(
  sourceText: string,
  branchContext: TriageAdjudicatorContext,
  options: {
    model?: string
    signal?: AbortSignal
    onUsage?: (usage: BedrockTokenUsage) => void
  } = {},
): Promise<ValidatedTriageAdjudicatorDecision> {
  const model = options.model ?? resolveTriageModelRegistry().adjudicator
  const result = await invokeBedrockClinicalTool<unknown>({
    system: TRIAGE_ADJUDICATOR_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Adjudicate this branch disagreement.\n\nBranch pathways:\n${JSON.stringify(branchContext)}\n\n--- SOURCE START ---\n${sourceText}\n--- SOURCE END ---`,
      },
    ],
    maxTokens: 2_000,
    temperature: 0,
    model,
    signal: options.signal,
    toolName: 'emit_triage_adjudication',
    toolDescription:
      'Emit the complete source-grounded triage disagreement adjudication.',
    inputSchema: ADJUDICATOR_SCHEMA,
  })
  options.onUsage?.(copyBedrockTokenUsage(result))
  return validateTriageAdjudicatorDecision(result.parsed, sourceText)
}
