import { invokeBedrockClinicalToolWithMeta } from '@/lib/historian/eval/bedrockMeta'
import {
  COMPREHENSIVE_HISTORY_DOMAINS,
  type HistorianTranscriptEntry,
} from '@/lib/historianTypes'
import {
  LIVE_INTERVIEW_REVIEW_PROMPT_VERSION,
  LIVE_INTERVIEW_REVIEW_VERSION,
  parseLiveInterviewReview,
  type UnsignedLiveInterviewReviewArtifactV1,
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

function numberedTranscript(transcript: HistorianTranscriptEntry[]): string {
  return transcript
    .map((entry) => `Seq ${entry.seq} (${entry.role === 'user' ? 'Patient' : 'Historian'}): ${entry.text}`)
    .join('\n')
}

export async function generateLiveInterviewReview(
  transcript: HistorianTranscriptEntry[],
): Promise<UnsignedLiveInterviewReviewArtifactV1> {
  const latestPatientSeq = [...transcript]
    .reverse()
    .find((entry) => entry.role === 'user')?.seq
  if (!Number.isInteger(latestPatientSeq)) {
    throw new Error('A patient transcript turn is required for live review.')
  }

  const { result, modelId } = await invokeBedrockClinicalToolWithMeta<unknown>({
    model: LIVE_INTERVIEW_REVIEW_MODEL,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: JSON.stringify({
        reviewed_through_seq: latestPatientSeq,
        fixed_domains: COMPREHENSIVE_HISTORY_DOMAINS,
        numbered_transcript: numberedTranscript(transcript),
      }),
    }],
    maxTokens: 3000,
    temperature: 0,
    toolName: TOOL_NAME,
    toolDescription: 'Record the silent in-session coverage and quality review. This result is never shown or spoken to the patient.',
    inputSchema: INPUT_SCHEMA,
  })

  return {
    review: parseLiveInterviewReview(result, transcript),
    provenance: {
      modelId,
      promptVersion: LIVE_INTERVIEW_REVIEW_PROMPT_VERSION,
      generatedAt: new Date().toISOString(),
    },
  }
}
