import { describe, expect, it } from 'vitest'
import {
  TriageModelConfigurationError,
  resolveTriageModelRegistry,
} from '@/lib/triage/modelRegistry'

describe('triage model registry', () => {
  it('pins the evaluated US inference profiles by branch role', () => {
    expect(resolveTriageModelRegistry({})).toEqual({
      safetyExtractor: 'us.anthropic.claude-sonnet-5',
      outpatientScorer: 'us.anthropic.claude-sonnet-4-6',
      adjudicator: 'us.anthropic.claude-opus-4-8',
      longPacketMapper: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
    })
  })

  it('does not place Fable on a clinical branch', () => {
    expect(() =>
      resolveTriageModelRegistry({
        BEDROCK_TRIAGE_SAFETY_MODEL: 'us.anthropic.claude-fable-5',
      }),
    ).toThrow(TriageModelConfigurationError)
  })

  it('requires independently configured safety, scoring, and adjudication profiles', () => {
    expect(() =>
      resolveTriageModelRegistry({
        BEDROCK_TRIAGE_SAFETY_MODEL: 'us.anthropic.claude-sonnet-5',
        BEDROCK_TRIAGE_SCORING_MODEL: 'us.anthropic.claude-sonnet-5',
      }),
    ).toThrow(/distinct/)
  })

  it('rejects non-US profiles pending separate privacy approval', () => {
    expect(() =>
      resolveTriageModelRegistry({
        BEDROCK_TRIAGE_ADJUDICATOR_MODEL: 'global.anthropic.claude-opus-4-8',
      }),
    ).toThrow(/US inference profile/)
  })
})
