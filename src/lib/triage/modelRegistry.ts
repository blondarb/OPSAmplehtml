export interface TriageModelRegistry {
  safetyExtractor: string
  outpatientScorer: string
  adjudicator: string
  longPacketMapper: string
}

type Environment = Record<string, string | undefined>

export const EVALUATED_CLINICAL_MODEL_CANDIDATES = Object.freeze([
  'us.anthropic.claude-sonnet-5',
  'us.anthropic.claude-opus-4-8',
  'us.anthropic.claude-opus-4-7',
  'us.anthropic.claude-sonnet-4-6',
  'us.anthropic.claude-opus-4-6-v1',
  'us.anthropic.claude-haiku-4-5-20251001-v1:0',
] as const)

const EVALUATED_CLINICAL_CANDIDATES = new Set<string>(
  EVALUATED_CLINICAL_MODEL_CANDIDATES,
)

export class TriageModelConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TriageModelConfigurationError'
  }
}

export function resolveTriageModelRegistry(
  env: Environment = process.env,
): TriageModelRegistry {
  const registry: TriageModelRegistry = {
    safetyExtractor:
      env.BEDROCK_TRIAGE_SAFETY_MODEL || 'us.anthropic.claude-sonnet-5',
    outpatientScorer:
      env.BEDROCK_TRIAGE_SCORING_MODEL ||
      env.BEDROCK_TRIAGE_MODEL ||
      'us.anthropic.claude-sonnet-4-6',
    adjudicator:
      env.BEDROCK_TRIAGE_ADJUDICATOR_MODEL ||
      'us.anthropic.claude-opus-4-8',
    longPacketMapper:
      env.BEDROCK_TRIAGE_LONG_PACKET_MODEL ||
      'us.anthropic.claude-haiku-4-5-20251001-v1:0',
  }

  for (const [role, model] of Object.entries(registry)) {
    if (model.includes('fable')) {
      throw new TriageModelConfigurationError(
        `${role} cannot use Fable for clinical or deidentified patient data`,
      )
    }
    if (!model.startsWith('us.')) {
      throw new TriageModelConfigurationError(
        `${role} must use a US inference profile pending separate privacy approval`,
      )
    }
    if (!EVALUATED_CLINICAL_CANDIDATES.has(model)) {
      throw new TriageModelConfigurationError(
        `${role} model is not in the evaluated clinical candidate registry`,
      )
    }
  }

  if (
    new Set([
      registry.safetyExtractor,
      registry.outpatientScorer,
      registry.adjudicator,
    ]).size !== 3
  ) {
    throw new TriageModelConfigurationError(
      'Safety extraction, outpatient scoring, and adjudication models must be distinct',
    )
  }

  return registry
}
