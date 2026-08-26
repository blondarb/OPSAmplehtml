import { invokeBedrockClinicalToolWithMeta } from '@/lib/historian/eval/bedrockMeta'
import {
  COMPREHENSIVE_HISTORY_DOMAINS,
  type HistorianTranscriptEntry,
} from '@/lib/historianTypes'
import {
  LIVE_INTERVIEW_REVIEW_PROMPT_VERSION,
  LIVE_INTERVIEW_REVIEW_VERSION,
  LIVE_INTERVIEW_REVIEW_V2_PROMPT_VERSION,
  LIVE_INTERVIEW_REVIEW_V2_VERSION,
  LIVE_REVIEW_DEPTH_DIMENSIONS,
  liveReviewGapKey,
  parseLiveInterviewReview,
  parseLiveInterviewReviewV2,
  type UnsignedLiveInterviewReviewArtifact,
  type LiveInterviewReviewV2,
} from './liveReviewContract'

/**
 * High-capability, separate-context reviewer. The Claude Sonnet conductor and
 * reviewer never share private reasoning or outputs; the reviewer sees only
 * the numbered transcript. Cross-family diagnostic comparison remains a
 * separate post-session DeepSeek-R1 pass.
 */
export const LIVE_INTERVIEW_REVIEW_MODEL =
  'us.anthropic.claude-sonnet-4-6'

const TOOL_NAME = 'record_live_interview_review'
const DOMAIN_ENUM = COMPREHENSIVE_HISTORY_DOMAINS.map(({ id }) => id)

const SYSTEM_PROMPT = `You are a silent, independent quality reviewer for an in-progress neurologic history interview.

You cannot speak to the patient, diagnose, recommend treatment, or alter emergency instructions. You are blind to the interview conductor's differential, suggested questions, and private reasoning. Review only the numbered transcript supplied to you.

For every fixed history domain, classify the PATIENT'S own evidence as:
- covered: the patient supplied clinically usable information or a clear pertinent negative;
- uncertain: the patient was asked or volunteered information but did not know, declined, or gave unresolved conflicting information;
- missing: no patient statement in the transcript meaningfully addresses the domain.

Grounding requirements:
- Every covered or uncertain domain MUST cite one or more exact PATIENT transcript sequence numbers in patient_seqs.
- A missing domain MUST cite no sequences.
- Never count referral context, historian wording, a suggested question, silence, or your own inference as patient evidence.
- Do not mark a domain covered merely because a broad generic question was asked; the patient response must actually address it.
- Flag clinically important gaps, contradictions in patient statements, and materially repetitive historian questions.
- Extract every prescription medicine, over-the-counter medicine, vitamin, or supplement the patient names. Copy name_span EXACTLY from one cited patient turn; do not expand abbreviations, select a likely drug, fix spelling, map brands/generics, or silently substitute one name for another.
- For each medication mention, classify dose and frequency separately as known, unknown, declined, or missing. A known value_span must be copied EXACTLY from a cited patient turn. Use null and no citations for missing. Never infer a dose or schedule.
- active_safety_concern may be true only when the patient's words state a current emergency or self-harm/harm-to-others concern. This reviewer can raise concern but can never clear or downgrade the application's deterministic safety handling.
- ready_to_close may be true only when every domain is covered or explicitly uncertain, no critical gap remains, and no active safety concern is present.
- next_question_intents are short private clinical targets, not scripts and not diagnoses. Never include a diagnosis name, treatment, test recommendation, or advice.

Return the tool exactly once. Do not include prose outside the tool call.`

const SYSTEM_PROMPT_V2 = `${SYSTEM_PROMPT}

ADDITIONAL CASE-DEPTH AUDIT:
- Do not treat this as a checklist-completion task. Decide whether the complaint-led history is deep enough that a physician could responsibly prioritize a provisional neurologic differential from the patient's own account.
- Classify all eight diagnostic-depth dimensions. "adequate" means case-specific patient evidence is clinically usable; "uncertain" means the patient was asked but does not know, declined, or remains internally conflicting; "missing" means the transcript lacks meaningful patient evidence.
- Every adequate or uncertain depth dimension must cite exact PATIENT sequence numbers. Missing cites none.
- depth_sufficient may be true only when every depth dimension is adequate or explicitly uncertain, the chronology and symptom phenotype are clinically discriminating for this presentation, and no case-specific critical gap remains.
- If depth is not sufficient, provide at least one next_question_intent targeting the highest-value missing discriminator. Keep it non-diagnostic, one-question-at-a-time, and do not prescribe a test or treatment.
- Low confidence can never support closure.
- ready_to_close may be true only when the original coverage rules AND this depth audit permit it.`

const COHERENT_GAP_RULES = `

COHERENT V2 GAP CONTRACT:
- Explicit patient negatives are evidence and may satisfy a domain or depth dimension.
- Medication completeness is owned exclusively by the application's deterministic medication ledger. Never emit a critical gap for medications.
- Each critical_gap must contain domain, depth_dimension, basis, patient_seqs, reason, and question_intent.
- A critical gap may never target a covered domain or an adequate depth dimension.
- basis not_asked requires both the domain and depth dimension to be missing, with no patient citations anywhere in that gap.
- basis partial_answer requires both findings to be uncertain and at least one cited patient sequence shared by the domain, depth dimension, and gap.
- basis conflicting_answer requires both findings to be uncertain, at least two shared patient citations, and those same citations in a contradiction.
- next_question_intents must be exactly the de-duplicated question_intent values from valid critical_gaps; do not add any other intents.
- The application recomputes ready_to_close and depth_sufficient. Return your honest classifications, but do not rely on those booleans to override this contract.`

const SYSTEM_PROMPT_V2_COHERENT = `${SYSTEM_PROMPT_V2}${COHERENT_GAP_RULES}`

const INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    version: { type: 'integer', enum: [LIVE_INTERVIEW_REVIEW_VERSION] },
    reviewed_through_seq: { type: 'integer', minimum: 1 },
    domains: {
      type: 'array',
      minItems: COMPREHENSIVE_HISTORY_DOMAINS.length,
      maxItems: COMPREHENSIVE_HISTORY_DOMAINS.length,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          domain: { type: 'string', enum: DOMAIN_ENUM },
          status: { type: 'string', enum: ['covered', 'uncertain', 'missing'] },
          patient_seqs: {
            type: 'array',
            maxItems: 20,
            items: { type: 'integer', minimum: 1 },
          },
        },
        required: ['domain', 'status', 'patient_seqs'],
      },
    },
    critical_gaps: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          domain: { type: 'string', enum: DOMAIN_ENUM },
          reason: { type: 'string', maxLength: 240 },
          question_intent: { type: 'string', maxLength: 240 },
        },
        required: ['domain', 'reason', 'question_intent'],
      },
    },
    contradictions: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          patient_seqs: {
            type: 'array',
            minItems: 2,
            maxItems: 6,
            items: { type: 'integer', minimum: 1 },
          },
          description: { type: 'string', maxLength: 240 },
        },
        required: ['patient_seqs', 'description'],
      },
    },
    repetitions: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          assistant_seqs: {
            type: 'array',
            minItems: 2,
            maxItems: 6,
            items: { type: 'integer', minimum: 1 },
          },
          description: { type: 'string', maxLength: 240 },
        },
        required: ['assistant_seqs', 'description'],
      },
    },
    medications: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name_span: { type: 'string', maxLength: 80 },
          patient_seq: { type: 'integer', minimum: 1 },
          dose: {
            type: 'object',
            additionalProperties: false,
            properties: {
              status: { type: 'string', enum: ['known', 'unknown', 'declined', 'missing'] },
              value_span: { type: ['string', 'null'], maxLength: 80 },
              patient_seqs: {
                type: 'array',
                maxItems: 6,
                items: { type: 'integer', minimum: 1 },
              },
            },
            required: ['status', 'value_span', 'patient_seqs'],
          },
          frequency: {
            type: 'object',
            additionalProperties: false,
            properties: {
              status: { type: 'string', enum: ['known', 'unknown', 'declined', 'missing'] },
              value_span: { type: ['string', 'null'], maxLength: 80 },
              patient_seqs: {
                type: 'array',
                maxItems: 6,
                items: { type: 'integer', minimum: 1 },
              },
            },
            required: ['status', 'value_span', 'patient_seqs'],
          },
        },
        required: ['name_span', 'patient_seq', 'dose', 'frequency'],
      },
    },
    active_safety_concern: {
      type: 'object',
      additionalProperties: false,
      properties: {
        present: { type: 'boolean' },
        patient_seqs: {
          type: 'array',
          maxItems: 6,
          items: { type: 'integer', minimum: 1 },
        },
      },
      required: ['present', 'patient_seqs'],
    },
    ready_to_close: { type: 'boolean' },
    next_question_intents: {
      type: 'array',
      maxItems: 3,
      items: { type: 'string', maxLength: 240 },
    },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
  required: [
    'version',
    'reviewed_through_seq',
    'domains',
    'critical_gaps',
    'contradictions',
    'repetitions',
    'medications',
    'active_safety_concern',
    'ready_to_close',
    'next_question_intents',
    'confidence',
  ],
} as const

const INPUT_SCHEMA_V2 = {
  ...INPUT_SCHEMA,
  properties: {
    ...INPUT_SCHEMA.properties,
    version: { type: 'integer', enum: [LIVE_INTERVIEW_REVIEW_V2_VERSION] },
    diagnostic_depth: {
      type: 'object',
      additionalProperties: false,
      properties: {
        dimensions: {
          type: 'array',
          minItems: LIVE_REVIEW_DEPTH_DIMENSIONS.length,
          maxItems: LIVE_REVIEW_DEPTH_DIMENSIONS.length,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              dimension: { type: 'string', enum: LIVE_REVIEW_DEPTH_DIMENSIONS },
              status: { type: 'string', enum: ['adequate', 'uncertain', 'missing'] },
              patient_seqs: {
                type: 'array',
                maxItems: 20,
                items: { type: 'integer', minimum: 1 },
              },
            },
            required: ['dimension', 'status', 'patient_seqs'],
          },
        },
        depth_sufficient: { type: 'boolean' },
      },
      required: ['dimensions', 'depth_sufficient'],
    },
    critical_gaps: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          domain: { type: 'string', enum: DOMAIN_ENUM.filter((domain) => domain !== 'medications') },
          depth_dimension: { type: 'string', enum: LIVE_REVIEW_DEPTH_DIMENSIONS },
          basis: { type: 'string', enum: ['not_asked', 'partial_answer', 'conflicting_answer'] },
          patient_seqs: {
            type: 'array',
            maxItems: 6,
            items: { type: 'integer', minimum: 1 },
          },
          reason: { type: 'string', maxLength: 240 },
          question_intent: { type: 'string', maxLength: 240 },
        },
        required: ['domain', 'depth_dimension', 'basis', 'patient_seqs', 'reason', 'question_intent'],
      },
    },
  },
  required: [
    ...INPUT_SCHEMA.required,
    'diagnostic_depth',
  ],
} as const

function numberedTranscript(transcript: HistorianTranscriptEntry[]): string {
  return transcript
    .map((entry) => `Seq ${entry.seq} (${entry.role === 'user' ? 'Patient' : 'Historian'}): ${entry.text}`)
    .join('\n')
}

function inconsistentV2Review(transcript: HistorianTranscriptEntry[]) {
  const latestPatientSeq = [...transcript]
    .reverse()
    .find((entry) => entry.role === 'user')!.seq!
  const patientTurnCount = transcript.filter((entry) => entry.role === 'user').length
  return {
    version: LIVE_INTERVIEW_REVIEW_V2_VERSION,
    reviewedThroughSeq: latestPatientSeq,
    patientTurnCount,
    integrity: 'inconsistent' as const,
    domains: COMPREHENSIVE_HISTORY_DOMAINS.map(({ id }) => ({
      domain: id,
      status: 'missing' as const,
      patientSeqs: [],
    })),
    criticalGaps: [],
    contradictions: [],
    repetitions: [],
    medications: [],
    activeSafetyConcern: { present: false, patientSeqs: [] },
    diagnosticDepth: {
      dimensions: LIVE_REVIEW_DEPTH_DIMENSIONS.map((dimension) => ({
        dimension,
        status: 'missing' as const,
        patientSeqs: [],
      })),
      depthSufficient: false,
    },
    readyToClose: false,
    nextQuestionIntents: [],
    confidence: 'low' as const,
  }
}

async function invokeReviewTool(
  transcript: HistorianTranscriptEntry[],
  diagnosticDepth: boolean,
  repairCodes: string[] = [],
) {
  const latestPatientSeq = [...transcript]
    .reverse()
    .find((entry) => entry.role === 'user')!.seq!
  return invokeBedrockClinicalToolWithMeta<unknown>({
    model: LIVE_INTERVIEW_REVIEW_MODEL,
    system: diagnosticDepth
      ? `${SYSTEM_PROMPT_V2_COHERENT}${repairCodes.length
        ? `\nREPAIR: Your prior tool result violated fixed contract code(s): ${repairCodes.join(', ')}. Return a newly validated tool payload only.`
        : ''}`
      : SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: JSON.stringify({
        reviewed_through_seq: latestPatientSeq,
        fixed_domains: COMPREHENSIVE_HISTORY_DOMAINS,
        ...(diagnosticDepth
          ? { diagnostic_depth_dimensions: LIVE_REVIEW_DEPTH_DIMENSIONS }
          : {}),
        numbered_transcript: numberedTranscript(transcript),
      }),
    }],
    maxTokens: 3000,
    temperature: 0,
    toolName: TOOL_NAME,
    toolDescription: 'Record the silent in-session coverage and quality review. This result is never shown or spoken to the patient.',
    inputSchema: diagnosticDepth ? INPUT_SCHEMA_V2 : INPUT_SCHEMA,
  })
}

export async function generateLiveInterviewReview(
  transcript: HistorianTranscriptEntry[],
  options: {
    diagnosticDepth?: boolean
    exhaustedGapKeys?: readonly string[]
    clarificationBudgetExhausted?: boolean
  } = {},
): Promise<UnsignedLiveInterviewReviewArtifact> {
  const latestPatientSeq = [...transcript]
    .reverse()
    .find((entry) => entry.role === 'user')?.seq
  if (!Number.isInteger(latestPatientSeq)) {
    throw new Error('A patient transcript turn is required for live review.')
  }

  if (!options.diagnosticDepth) {
    const { result, modelId } = await invokeReviewTool(transcript, false)
    return {
      review: parseLiveInterviewReview(result, transcript),
      provenance: {
        modelId,
        promptVersion: LIVE_INTERVIEW_REVIEW_PROMPT_VERSION,
        generatedAt: new Date().toISOString(),
      },
    }
  }

  const applyClarificationBudget = (review: LiveInterviewReviewV2): LiveInterviewReviewV2 => {
    const exhausted = new Set(options.exhaustedGapKeys ?? [])
    if (
      review.criticalGaps.length > 0 &&
      (
        options.clarificationBudgetExhausted === true ||
        review.criticalGaps.some((gap) => exhausted.has(liveReviewGapKey(gap)))
      )
    ) {
      return { ...review, integrity: 'clarification_exhausted' }
    }
    return review
  }

  const first = await invokeReviewTool(transcript, true)
  try {
    return {
      review: applyClarificationBudget(parseLiveInterviewReviewV2(first.result, transcript)),
      provenance: {
        modelId: first.modelId,
        promptVersion: LIVE_INTERVIEW_REVIEW_V2_PROMPT_VERSION,
        generatedAt: new Date().toISOString(),
      },
    }
  } catch {
    // The retry carries only a fixed code, never model prose, parser text, or
    // patient transcript beyond the identical original review input.
    const retry = await invokeReviewTool(transcript, true, ['LIVE_REVIEW_CONTRACT_INVALID'])
    try {
      return {
        review: applyClarificationBudget(parseLiveInterviewReviewV2(retry.result, transcript)),
        provenance: {
          modelId: retry.modelId,
          promptVersion: LIVE_INTERVIEW_REVIEW_V2_PROMPT_VERSION,
          generatedAt: new Date().toISOString(),
        },
      }
    } catch {
      return {
        review: inconsistentV2Review(transcript),
        provenance: {
          modelId: retry.modelId,
          promptVersion: LIVE_INTERVIEW_REVIEW_V2_PROMPT_VERSION,
          generatedAt: new Date().toISOString(),
        },
      }
    }
  }
}
