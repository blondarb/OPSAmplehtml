import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getPoolMock, connectMock, queryMock, releaseMock } = vi.hoisted(() => ({
  getPoolMock: vi.fn(),
  connectMock: vi.fn(),
  queryMock: vi.fn(),
  releaseMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))

import { hashLongPacketPlan } from '@/lib/triage/longPacketCanonicalHash'
import {
  buildLongPacketIngestionArtifacts,
  longPacketPipelineToPersistedClinicalExtraction,
} from '@/lib/triage/longPacketIngestion'
import { scanLongPacketEmergency } from '@/lib/triage/longPacketEmergency'
import {
  LONG_PACKET_MODEL_PIPELINE_VERSION,
  runLongPacketModelPipeline,
  type LongPacketMapperBranchOutcome,
  type LongPacketModelPipelineResult,
  type LongPacketSafetyBranchOutcome,
} from '@/lib/triage/longPacketModelPipeline'
import {
  LONG_PACKET_PARTIAL_SAFETY_DEFAULT_BINDINGS,
  LONG_PACKET_PARTIAL_SAFETY_HOLD_VERSION,
  mergeLongPacketPartialSafetyHold,
  persistLongPacketPartialSafetyHold,
  persistLongPacketSafetyPersistenceFailureFloor,
  persistValidatedLongPacketAggregateFailure,
  persistValidatedLongPacketCompletion,
  validateLongPacketSafetyAuditReplacement,
  validateLongPacketPartialSafetyHold,
} from '@/lib/triage/longPacketPartialSafetyHold'
import type { LongPacketChunk, LongPacketPlan } from '@/lib/triage/longPacketPlanner'
import { validateModelSafetyExtraction } from '@/lib/triage/modelSafetyExtraction'
import { resolveTriageModelRegistry } from '@/lib/triage/modelRegistry'

const PARTIAL_HOLD_PROMPT_BINDINGS =
  LONG_PACKET_PARTIAL_SAFETY_DEFAULT_BINDINGS

function packet() {
  const text = Array.from(
    { length: 12 },
    (_, index) => `Page ${index + 1}: ${'bounded synthetic source detail '.repeat(30)}`,
  ).join('\n\n')
  return buildLongPacketIngestionArtifacts({
    packetId: 'packet-partial-hold',
    documentId: 'document-partial-hold',
    text,
    singlePassCharacterLimit: 50,
  })
}

function singleChunkPacket() {
  return buildLongPacketIngestionArtifacts({
    packetId: 'packet-partial-hold-single-chunk',
    documentId: 'document-partial-hold-single-chunk',
    text: 'Bounded single-chunk source detail. '.repeat(20),
    singlePassCharacterLimit: 50,
  })
}

function emptyMap(chunk: LongPacketChunk) {
  return {
    chunkId: chunk.id,
    chunkProvenanceSha256: chunk.provenanceSha256,
    sourceCharacterCount: chunk.text.length,
    coverageStatus: 'complete' as const,
    facts: [],
    conflicts: [],
  }
}

function mapperRedFlag(chunk: LongPacketChunk) {
  const span = chunk.sourceSpans[0]
  const quote = chunk.text.slice(
    span.chunkStartOffset,
    Math.min(span.chunkEndOffset, span.chunkStartOffset + 40),
  )
  return {
    ...emptyMap(chunk),
    facts: [
      {
        category: 'red_flag' as const,
        key: 'partial_hold_red_flag',
        statement: 'Validated current red flag requires same-day review.',
        assertion: 'present' as const,
        temporality: 'current' as const,
        eventDateText: null,
        evidence: [
          {
            packetId: chunk.packetId,
            documentId: chunk.documentId,
            pageNumber: span.pageNumber,
            startOffset: span.pageStartOffset,
            endOffset: span.pageStartOffset + quote.length,
            quote,
            extractionMethod: span.extractionMethod,
            extractionConfidence: span.extractionConfidence,
          },
        ],
      },
    ],
  }
}

async function capturedOutcomes(
  plan: LongPacketPlan,
): Promise<{
  emergency: LongPacketSafetyBranchOutcome
  sameDay: LongPacketSafetyBranchOutcome
  mapper: LongPacketMapperBranchOutcome
  pipeline: LongPacketModelPipelineResult
}> {
  const safety: LongPacketSafetyBranchOutcome[] = []
  const mapper: LongPacketMapperBranchOutcome[] = []
  const emergencyChunk = plan.chunks[0]
  const sameDayChunk = plan.chunks[1]
  const pipeline = await runLongPacketModelPipeline(plan, {
    mapChunk: async (chunk) =>
      chunk.id === sameDayChunk.id ? mapperRedFlag(chunk) : emptyMap(chunk),
    extractSafety: async (chunk) => {
      const quote = chunk.text.slice(0, Math.min(40, chunk.text.length))
      return validateModelSafetyExtraction(
        chunk.id === emergencyChunk.id
          ? {
              care_pathway: 'emergency_now',
              data_quality: 'sufficient',
              critical_unknowns: [],
              signals: [
                {
                  code: 'partial_hold_emergency',
                  syndrome: 'other_time_critical',
                  assertion: 'present',
                  temporality: 'current',
                  experiencer: 'patient',
                  action: 'emergency_now',
                  evidence: [{ quote, occurrence_index: 0 }],
                },
              ],
            }
          : chunk.id === sameDayChunk.id
            ? {
                care_pathway: 'same_day_clinician_review',
                data_quality: 'sufficient',
                critical_unknowns: [],
                signals: [
                  {
                    code: 'partial_hold_same_day',
                    syndrome: 'other_time_critical',
                    assertion: 'uncertain',
                    temporality: 'unknown',
                    experiencer: 'patient',
                    action: 'immediate_clinician_review',
                    evidence: [{ quote, occurrence_index: 0 }],
                  },
                ],
              }
            : {
                care_pathway: 'no_time_critical_signal',
                data_quality: 'sufficient',
                critical_unknowns: [],
                signals: [],
              },
        chunk.text,
      )
    },
    onSafetyOutcome: async (outcome) => {
      safety.push(outcome)
    },
    onMapperOutcome: async (outcome) => {
      mapper.push(outcome)
    },
    reduceNarrative: async (input) => ({
      narrative: 'Synthetic partial-hold source narrative.',
      timelineNarrative: '',
      medicationNarrative: '',
      testNarrative: '',
      functionalNarrative: '',
      conflictNarrative: '',
      preservedSafetyEvidenceIds: input.requiredSafetyEvidenceIds,
    }),
  })
  return {
    emergency: safety.find(
      (outcome) => outcome.result?.carePathway === 'emergency_now',
    )!,
    sameDay: safety.find(
      (outcome) =>
        outcome.result?.carePathway === 'same_day_clinician_review',
    )!,
    mapper: mapper.find((outcome) => outcome.chunkId === sameDayChunk.id)!,
    pipeline,
  }
}

async function crossChunkNarrativeFailureAggregate() {
  const artifacts = packet()
  const pipeline = await runLongPacketModelPipeline(artifacts.plan, {
    mapChunk: async (chunk) => {
      const span = chunk.sourceSpans[0]
      const quote = chunk.text.slice(
        span.chunkStartOffset,
        Math.min(span.chunkEndOffset, span.chunkStartOffset + 40),
      )
      return {
        ...emptyMap(chunk),
        facts: [
          {
            category: 'medication' as const,
            key: 'current_lamotrigine_dose',
            statement: `Current lamotrigine dose is ${100 + chunk.chunkIndex * 50} mg twice daily.`,
            assertion: 'present' as const,
            temporality: 'current' as const,
            eventDateText: null,
            evidence: [
              {
                packetId: chunk.packetId,
                documentId: chunk.documentId,
                pageNumber: span.pageNumber,
                startOffset: span.pageStartOffset,
                endOffset: span.pageStartOffset + quote.length,
                quote,
                extractionMethod: span.extractionMethod,
                extractionConfidence: span.extractionConfidence,
              },
            ],
          },
        ],
      }
    },
    extractSafety: async (chunk) =>
      validateModelSafetyExtraction(
        {
          care_pathway: 'no_time_critical_signal',
          data_quality: 'sufficient',
          critical_unknowns: [],
          signals: [],
        },
        chunk.text,
      ),
    reduceNarrative: async () => {
      throw new Error('synthetic narrative reducer failure')
    },
  })
  return { artifacts, pipeline }
}

function canonicalPersistedExtraction(
  plan: LongPacketPlan,
  pipeline: LongPacketModelPipelineResult,
) {
  return longPacketPipelineToPersistedClinicalExtraction({
    pipeline,
    deterministicGateway: scanLongPacketEmergency(plan),
  })
}

async function captureSafetyOutcome(
  plan: LongPacketPlan,
  chunkId: string,
  pathway:
    | 'emergency_now'
    | 'same_day_clinician_review'
    | 'no_time_critical_signal',
  code: string,
) {
  let captured: LongPacketSafetyBranchOutcome | undefined
  await runLongPacketModelPipeline(plan, {
    mapChunk: async (chunk) => emptyMap(chunk),
    extractSafety: async (chunk) => {
      const target = chunk.id === chunkId
      const quote = chunk.text.slice(0, Math.min(40, chunk.text.length))
      return validateModelSafetyExtraction(
        target && pathway !== 'no_time_critical_signal'
          ? {
              care_pathway: pathway,
              data_quality: 'sufficient',
              critical_unknowns: [],
              signals: [
                {
                  code,
                  syndrome: 'other_time_critical',
                  assertion:
                    pathway === 'emergency_now' ? 'present' : 'uncertain',
                  temporality:
                    pathway === 'emergency_now' ? 'current' : 'unknown',
                  experiencer: 'patient',
                  action:
                    pathway === 'emergency_now'
                      ? 'emergency_now'
                      : 'immediate_clinician_review',
                  evidence: [{ quote, occurrence_index: 0 }],
                },
              ],
            }
          : {
              care_pathway: 'no_time_critical_signal',
              data_quality: 'sufficient',
              critical_unknowns: [],
              signals: [],
            },
        chunk.text,
      )
    },
    onSafetyOutcome: async (outcome) => {
      if (outcome.chunkId === chunkId) captured = outcome
    },
  })
  return captured!
}

function projection(
  outcome: LongPacketSafetyBranchOutcome | LongPacketMapperBranchOutcome,
) {
  return {
    outcome,
    modelProfile:
      outcome.branch === 'safety_extractor'
        ? PARTIAL_HOLD_PROMPT_BINDINGS.safetyExtractorModel
        : PARTIAL_HOLD_PROMPT_BINDINGS.clinicalMapperModel,
    promptVersion:
      outcome.branch === 'safety_extractor'
        ? PARTIAL_HOLD_PROMPT_BINDINGS.safetyExtractor
        : PARTIAL_HOLD_PROMPT_BINDINGS.clinicalMapper,
    pipelineVersion: LONG_PACKET_MODEL_PIPELINE_VERSION,
  }
}

describe('long-packet partial safety hold', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPoolMock.mockResolvedValue({ connect: connectMock })
    connectMock.mockResolvedValue({ query: queryMock, release: releaseMock })
  })

  it.each([
    ['emergency', 'emergency'],
    ['same-day', 'sameDay'],
  ] as const)(
    'validates a provenance-bound %s projection without authorizing completion',
    async (_label, key) => {
      const artifacts = packet()
      const outcomes = await capturedOutcomes(artifacts.plan)
      const artifact = mergeLongPacketPartialSafetyHold({
        plan: artifacts.plan,
        sourceSha256: artifacts.sourceSha256,
        safetyPromptVersions: PARTIAL_HOLD_PROMPT_BINDINGS,
        existing: null,
        projection: projection(outcomes[key]),
      })

      const validated = validateLongPacketPartialSafetyHold({
        plan: artifacts.plan,
        sourceSha256: artifacts.sourceSha256,
        safetyPromptVersions: PARTIAL_HOLD_PROMPT_BINDINGS,
        value: artifact,
      })
      expect(artifact).toMatchObject({
        version: LONG_PACKET_PARTIAL_SAFETY_HOLD_VERSION,
        kind: 'partial_safety_hold',
        mode: 'workflow_persistence_failed',
        completionAuthorized: false,
        sourceSha256: artifacts.sourceSha256,
        packetPlanSha256: hashLongPacketPlan(artifacts.plan),
      })
      expect(validated).toMatchObject({
        pipelineComplete: false,
        safetyResult: {
          carePathway:
            key === 'emergency'
              ? 'emergency_now'
              : 'same_day_clinician_review',
        },
      })
    },
  )

  it('derives a same-day projection from a validated mapper red flag', async () => {
    const artifacts = packet()
    const outcomes = await capturedOutcomes(artifacts.plan)
    const artifact = mergeLongPacketPartialSafetyHold({
      plan: artifacts.plan,
      sourceSha256: artifacts.sourceSha256,
      safetyPromptVersions: PARTIAL_HOLD_PROMPT_BINDINGS,
      existing: null,
      projection: projection(outcomes.mapper),
    })

    expect(
      validateLongPacketPartialSafetyHold({
        plan: artifacts.plan,
        sourceSha256: artifacts.sourceSha256,
        safetyPromptVersions: PARTIAL_HOLD_PROMPT_BINDINGS,
        value: artifact,
      }),
    ).toMatchObject({
      pipelineComplete: false,
      safetyResult: {
        carePathway: 'same_day_clinician_review',
        criticalUnknowns: expect.arrayContaining([
          expect.stringMatching(/mapper red flag/i),
        ]),
        signals: expect.arrayContaining([
          expect.objectContaining({
            code: 'mapper_red_flag_0',
            evidence: expect.arrayContaining([
              expect.objectContaining({ pageNumber: expect.any(Number) }),
            ]),
          }),
        ]),
      },
    })
  })

  it('merges concurrent same-day and emergency projections without downgrade', async () => {
    const artifacts = packet()
    const outcomes = await capturedOutcomes(artifacts.plan)
    const sameDay = mergeLongPacketPartialSafetyHold({
      plan: artifacts.plan,
      sourceSha256: artifacts.sourceSha256,
      safetyPromptVersions: PARTIAL_HOLD_PROMPT_BINDINGS,
      existing: null,
      projection: projection(outcomes.sameDay),
    })
    const merged = mergeLongPacketPartialSafetyHold({
      plan: artifacts.plan,
      sourceSha256: artifacts.sourceSha256,
      safetyPromptVersions: PARTIAL_HOLD_PROMPT_BINDINGS,
      existing: sameDay,
      projection: projection(outcomes.emergency),
    })

    expect(merged).toMatchObject({
      carePathway: 'emergency_now',
      completionAuthorized: false,
    })
    expect(merged.projections).toHaveLength(2)
  })

  it('deduplicates an idempotent projection without dropping evidence', async () => {
    const artifacts = packet()
    const outcomes = await capturedOutcomes(artifacts.plan)
    const first = mergeLongPacketPartialSafetyHold({
      plan: artifacts.plan,
      sourceSha256: artifacts.sourceSha256,
      safetyPromptVersions: PARTIAL_HOLD_PROMPT_BINDINGS,
      existing: null,
      projection: projection(outcomes.emergency),
    })
    const duplicate = mergeLongPacketPartialSafetyHold({
      plan: artifacts.plan,
      sourceSha256: artifacts.sourceSha256,
      safetyPromptVersions: PARTIAL_HOLD_PROMPT_BINDINGS,
      existing: first,
      projection: projection(outcomes.emergency),
    })

    expect(duplicate.projections).toHaveLength(1)
    expect(duplicate).toEqual(first)
  })

  it('retains differing validated same-chunk observations and takes the stronger path', async () => {
    const artifacts = packet()
    const chunkId = artifacts.plan.chunks[0].id
    const sameDay = await captureSafetyOutcome(
      artifacts.plan,
      chunkId,
      'same_day_clinician_review',
      'same_chunk_same_day',
    )
    const emergency = await captureSafetyOutcome(
      artifacts.plan,
      chunkId,
      'emergency_now',
      'same_chunk_emergency',
    )
    const first = mergeLongPacketPartialSafetyHold({
      plan: artifacts.plan,
      sourceSha256: artifacts.sourceSha256,
      safetyPromptVersions: PARTIAL_HOLD_PROMPT_BINDINGS,
      existing: null,
      projection: projection(sameDay),
    })
    const merged = mergeLongPacketPartialSafetyHold({
      plan: artifacts.plan,
      sourceSha256: artifacts.sourceSha256,
      safetyPromptVersions: PARTIAL_HOLD_PROMPT_BINDINGS,
      existing: first,
      projection: projection(emergency),
    })
    const validated = validateLongPacketPartialSafetyHold({
      plan: artifacts.plan,
      sourceSha256: artifacts.sourceSha256,
      safetyPromptVersions: PARTIAL_HOLD_PROMPT_BINDINGS,
      value: merged,
    })

    expect(merged.projections).toHaveLength(2)
    expect(validated.safetyResult).toMatchObject({
      carePathway: 'emergency_now',
      signals: expect.arrayContaining([
        expect.objectContaining({ code: 'same_chunk_same_day' }),
        expect.objectContaining({ code: 'same_chunk_emergency' }),
      ]),
    })
  })

  it('reserves a bounded monotonic slot so retries cannot crowd out a later emergency', async () => {
    const artifacts = singleChunkPacket()
    expect(artifacts.plan.chunks).toHaveLength(1)
    const chunkId = artifacts.plan.chunks[0].id
    const firstSameDay = await captureSafetyOutcome(
      artifacts.plan,
      chunkId,
      'same_day_clinician_review',
      'bounded_same_day_one',
    )
    const secondSameDay = await captureSafetyOutcome(
      artifacts.plan,
      chunkId,
      'same_day_clinician_review',
      'bounded_same_day_two',
    )
    const emergency = await captureSafetyOutcome(
      artifacts.plan,
      chunkId,
      'emergency_now',
      'bounded_emergency',
    )
    const thirdSameDay = await captureSafetyOutcome(
      artifacts.plan,
      chunkId,
      'same_day_clinician_review',
      'bounded_same_day_three',
    )
    const first = mergeLongPacketPartialSafetyHold({
      plan: artifacts.plan,
      sourceSha256: artifacts.sourceSha256,
      safetyPromptVersions: PARTIAL_HOLD_PROMPT_BINDINGS,
      existing: null,
      projection: projection(firstSameDay),
    })
    const full = mergeLongPacketPartialSafetyHold({
      plan: artifacts.plan,
      sourceSha256: artifacts.sourceSha256,
      safetyPromptVersions: PARTIAL_HOLD_PROMPT_BINDINGS,
      existing: first,
      projection: projection(secondSameDay),
    })
    expect(() =>
      mergeLongPacketPartialSafetyHold({
        plan: artifacts.plan,
        sourceSha256: artifacts.sourceSha256,
        safetyPromptVersions: PARTIAL_HOLD_PROMPT_BINDINGS,
        existing: full,
        projection: projection(thirdSameDay),
      }),
    ).toThrow()
    const forgedReserve = {
      ...full,
      projections: [...full.projections, projection(thirdSameDay)],
    }
    expect(() =>
      validateLongPacketPartialSafetyHold({
        plan: artifacts.plan,
        sourceSha256: artifacts.sourceSha256,
        safetyPromptVersions: PARTIAL_HOLD_PROMPT_BINDINGS,
        value: forgedReserve,
      }),
    ).toThrow()
    const lifted = mergeLongPacketPartialSafetyHold({
      plan: artifacts.plan,
      sourceSha256: artifacts.sourceSha256,
      safetyPromptVersions: PARTIAL_HOLD_PROMPT_BINDINGS,
      existing: full,
      projection: projection(emergency),
    })
    expect(lifted.projections).toHaveLength(3)
    expect(lifted.carePathway).toBe('emergency_now')
    expect(JSON.stringify(lifted)).toContain('bounded_emergency')
  })

  it('does not manufacture a hold from a routine-only projection', async () => {
    const artifacts = packet()
    const routine = await captureSafetyOutcome(
      artifacts.plan,
      artifacts.plan.chunks[0].id,
      'no_time_critical_signal',
      'unused_routine',
    )

    expect(() =>
      mergeLongPacketPartialSafetyHold({
        plan: artifacts.plan,
        sourceSha256: artifacts.sourceSha256,
        safetyPromptVersions: PARTIAL_HOLD_PROMPT_BINDINGS,
        existing: null,
        projection: projection(routine),
      }),
    ).toThrow()
  })

  it('accepts evaluated environment model overrides and rejects an unevaluated model', async () => {
    const artifacts = packet()
    const outcomes = await capturedOutcomes(artifacts.plan)
    const registry = resolveTriageModelRegistry({
      BEDROCK_TRIAGE_SAFETY_MODEL: 'us.anthropic.claude-opus-4-7',
      BEDROCK_TRIAGE_LONG_PACKET_MODEL: 'us.anthropic.claude-sonnet-4-6',
    })
    const bindings = {
      ...PARTIAL_HOLD_PROMPT_BINDINGS,
      clinicalMapperModel: registry.longPacketMapper,
      safetyExtractorModel: registry.safetyExtractor,
    }
    const evaluatedProjection = {
      ...projection(outcomes.emergency),
      modelProfile: registry.safetyExtractor,
    }

    expect(() =>
      mergeLongPacketPartialSafetyHold({
        plan: artifacts.plan,
        sourceSha256: artifacts.sourceSha256,
        safetyPromptVersions: bindings,
        existing: null,
        projection: evaluatedProjection,
      }),
    ).not.toThrow()
    expect(() =>
      mergeLongPacketPartialSafetyHold({
        plan: artifacts.plan,
        sourceSha256: artifacts.sourceSha256,
        safetyPromptVersions: {
          ...bindings,
          safetyExtractorModel: 'us.synthetic.unevaluated-model',
        },
        existing: null,
        projection: {
          ...evaluatedProjection,
          modelProfile: 'us.synthetic.unevaluated-model',
        },
      }),
    ).toThrow()
  })

  it.each([
    ['source digest', (value: Record<string, unknown>) => {
      value.sourceSha256 = 'f'.repeat(64)
    }],
    ['plan digest', (value: Record<string, unknown>) => {
      value.packetPlanSha256 = 'f'.repeat(64)
    }],
    ['artifact version', (value: Record<string, unknown>) => {
      value.version = 'forged-version'
    }],
    ['completion authorization', (value: Record<string, unknown>) => {
      value.completionAuthorized = true
    }],
    ['extra top-level key', (value: Record<string, unknown>) => {
      value.forged = true
    }],
    ['empty projection set', (value: Record<string, unknown>) => {
      value.projections = []
    }],
    ['oversized projection set', (value: Record<string, unknown>) => {
      const projections = value.projections as Array<Record<string, unknown>>
      value.projections = Array.from(
        { length: packet().plan.chunks.length * 2 + 1 },
        () => structuredClone(projections[0]),
      )
    }],
    ['extra projection key', (value: Record<string, unknown>) => {
      const projections = value.projections as Array<Record<string, unknown>>
      projections[0].forged = true
    }],
    ['extra outcome key', (value: Record<string, unknown>) => {
      const projections = value.projections as Array<Record<string, unknown>>
      const outcome = projections[0].outcome as Record<string, unknown>
      outcome.forged = true
    }],
    ['safety outcome state coupling', (value: Record<string, unknown>) => {
      const projections = value.projections as Array<Record<string, unknown>>
      const outcome = projections[0].outcome as Record<string, unknown>
      const result = outcome.result as Record<string, unknown>
      result.dataQuality = 'partial'
    }],
    ['completed outcome failure code', (value: Record<string, unknown>) => {
      const projections = value.projections as Array<Record<string, unknown>>
      const outcome = projections[0].outcome as Record<string, unknown>
      outcome.failureCode = 'forged_completed_failure'
    }],
    ['pipeline version', (value: Record<string, unknown>) => {
      const projections = value.projections as Array<Record<string, unknown>>
      projections[0].pipelineVersion = 'forged-pipeline'
    }],
    ['model binding', (value: Record<string, unknown>) => {
      const projections = value.projections as Array<Record<string, unknown>>
      projections[0].modelProfile = 'forged-model'
    }],
    ['prompt binding', (value: Record<string, unknown>) => {
      const projections = value.projections as Array<Record<string, unknown>>
      projections[0].promptVersion = 'forged-prompt'
    }],
    ['chunk id', (value: Record<string, unknown>) => {
      const projections = value.projections as Array<Record<string, unknown>>
      const outcome = projections[0].outcome as Record<string, unknown>
      outcome.chunkId = 'forged-chunk'
    }],
    ['chunk provenance', (value: Record<string, unknown>) => {
      const projections = value.projections as Array<Record<string, unknown>>
      const outcome = projections[0].outcome as Record<string, unknown>
      outcome.chunkProvenanceSha256 = 'f'.repeat(64)
    }],
    ['source evidence', (value: Record<string, unknown>) => {
      const projections = value.projections as Array<Record<string, unknown>>
      const outcome = projections[0].outcome as Record<string, unknown>
      const result = outcome.result as Record<string, unknown>
      const signals = result.signals as Array<Record<string, unknown>>
      const evidence = signals[0].evidence as Array<Record<string, unknown>>
      evidence[0].quote = 'forged source quote'
    }],
  ] as const)('rejects a forged %s binding', async (_label, mutate) => {
    const artifacts = packet()
    const outcomes = await capturedOutcomes(artifacts.plan)
    const artifact = mergeLongPacketPartialSafetyHold({
      plan: artifacts.plan,
      sourceSha256: artifacts.sourceSha256,
      safetyPromptVersions: PARTIAL_HOLD_PROMPT_BINDINGS,
      existing: null,
      projection: projection(outcomes.emergency),
    })
    const forged = structuredClone(artifact) as unknown as Record<string, unknown>
    mutate(forged)

    expect(() =>
      validateLongPacketPartialSafetyHold({
        plan: artifacts.plan,
        sourceSha256: artifacts.sourceSha256,
        safetyPromptVersions: PARTIAL_HOLD_PROMPT_BINDINGS,
        value: forged,
      }),
    ).toThrow()
  })

  it('derives mapper status and pathway instead of trusting redundant persisted fields', async () => {
    const artifacts = packet()
    const outcomes = await capturedOutcomes(artifacts.plan)
    const artifact = mergeLongPacketPartialSafetyHold({
      plan: artifacts.plan,
      sourceSha256: artifacts.sourceSha256,
      safetyPromptVersions: PARTIAL_HOLD_PROMPT_BINDINGS,
      existing: null,
      projection: projection(outcomes.mapper),
    })
    const forgedPath = structuredClone(artifact) as unknown as Record<
      string,
      unknown
    >
    forgedPath.carePathway = 'emergency_now'
    expect(() =>
      validateLongPacketPartialSafetyHold({
        plan: artifacts.plan,
        sourceSha256: artifacts.sourceSha256,
        safetyPromptVersions: PARTIAL_HOLD_PROMPT_BINDINGS,
        value: forgedPath,
      }),
    ).toThrow()

    const forgedState = structuredClone(artifact) as unknown as Record<
      string,
      unknown
    >
    const projections = forgedState.projections as Array<
      Record<string, unknown>
    >
    const outcome = projections[0].outcome as Record<string, unknown>
    const result = outcome.result as Record<string, unknown>
    result.coverageStatus = 'partial'
    expect(() =>
      validateLongPacketPartialSafetyHold({
        plan: artifacts.plan,
        sourceSha256: artifacts.sourceSha256,
        safetyPromptVersions: PARTIAL_HOLD_PROMPT_BINDINGS,
        value: forgedState,
      }),
    ).toThrow()
  })

  it('keeps a checkpoint nonterminal and makes workflow failure mode absorbing', async () => {
    const artifacts = packet()
    const outcomes = await capturedOutcomes(artifacts.plan)
    const checkpoint = mergeLongPacketPartialSafetyHold({
      plan: artifacts.plan,
      sourceSha256: artifacts.sourceSha256,
      safetyPromptVersions: PARTIAL_HOLD_PROMPT_BINDINGS,
      existing: null,
      mode: 'safety_checkpoint',
      projection: projection(outcomes.sameDay),
    })
    const terminal = mergeLongPacketPartialSafetyHold({
      plan: artifacts.plan,
      sourceSha256: artifacts.sourceSha256,
      safetyPromptVersions: PARTIAL_HOLD_PROMPT_BINDINGS,
      existing: checkpoint,
      mode: 'workflow_persistence_failed',
      projection: projection(outcomes.emergency),
    })
    const replayedCheckpoint = mergeLongPacketPartialSafetyHold({
      plan: artifacts.plan,
      sourceSha256: artifacts.sourceSha256,
      safetyPromptVersions: PARTIAL_HOLD_PROMPT_BINDINGS,
      existing: terminal,
      mode: 'safety_checkpoint',
      projection: projection(outcomes.sameDay),
    })

    expect(checkpoint).toMatchObject({
      mode: 'safety_checkpoint',
      completionAuthorized: false,
      carePathway: 'same_day_clinician_review',
    })
    expect(terminal).toMatchObject({
      mode: 'workflow_persistence_failed',
      carePathway: 'emergency_now',
    })
    expect(replayedCheckpoint.mode).toBe('workflow_persistence_failed')
  })

  it('allows a checkpoint replacement only when a validated complete pipeline contains every exact projection', async () => {
    const artifacts = packet()
    let emergency: LongPacketSafetyBranchOutcome | undefined
    const pipeline = await runLongPacketModelPipeline(artifacts.plan, {
      mapChunk: async (chunk) => emptyMap(chunk),
      extractSafety: async (chunk) => {
        const target = chunk.id === artifacts.plan.chunks[0].id
        const quote = chunk.text.slice(0, Math.min(40, chunk.text.length))
        return validateModelSafetyExtraction(
          target
            ? {
                care_pathway: 'emergency_now',
                data_quality: 'sufficient',
                critical_unknowns: [],
                signals: [{
                  code: 'replacement_emergency',
                  syndrome: 'other_time_critical',
                  assertion: 'present',
                  temporality: 'current',
                  experiencer: 'patient',
                  action: 'emergency_now',
                  evidence: [{ quote, occurrence_index: 0 }],
                }],
              }
            : {
                care_pathway: 'no_time_critical_signal',
                data_quality: 'sufficient',
                critical_unknowns: [],
                signals: [],
              },
          chunk.text,
        )
      },
      onSafetyOutcome: async (outcome) => {
        if (outcome.result?.carePathway === 'emergency_now') emergency = outcome
      },
      reduceNarrative: async (input) => ({
        narrative: 'Synthetic complete replacement narrative.',
        timelineNarrative: '',
        medicationNarrative: '',
        testNarrative: '',
        functionalNarrative: '',
        conflictNarrative: '',
        preservedSafetyEvidenceIds: input.requiredSafetyEvidenceIds,
      }),
    })
    const checkpoint = mergeLongPacketPartialSafetyHold({
      plan: artifacts.plan,
      sourceSha256: artifacts.sourceSha256,
      safetyPromptVersions: PARTIAL_HOLD_PROMPT_BINDINGS,
      existing: null,
      mode: 'safety_checkpoint',
      projection: projection(emergency!),
    })

    expect(() =>
      validateLongPacketSafetyAuditReplacement({
        plan: artifacts.plan,
        sourceSha256: artifacts.sourceSha256,
        safetyPromptVersions: PARTIAL_HOLD_PROMPT_BINDINGS,
        existing: checkpoint,
        modelMapResult: pipeline.mapperCoverage,
        modelReduceResult: pipeline,
      }),
    ).not.toThrow()

    const missingProjection = structuredClone(pipeline)
    missingProjection.safetyOutcomes = missingProjection.safetyOutcomes.map(
      (outcome) => outcome.chunkId === emergency!.chunkId
        ? { ...outcome, result: { ...outcome.result!, carePathway: 'no_time_critical_signal', signals: [] } }
        : outcome,
    )
    expect(() =>
      validateLongPacketSafetyAuditReplacement({
        plan: artifacts.plan,
        sourceSha256: artifacts.sourceSha256,
        safetyPromptVersions: PARTIAL_HOLD_PROMPT_BINDINGS,
        existing: checkpoint,
        modelMapResult: pipeline.mapperCoverage,
        modelReduceResult: missingProjection,
      }),
    ).toThrow()
  })

  it('persists a checkpoint under row lock without terminalizing the extraction', async () => {
    const artifacts = packet()
    const outcomes = await capturedOutcomes(artifacts.plan)
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT') && sql.includes('FROM triage_extractions')) {
        return {
          rows: [{
            id: 'extraction-1',
            status: 'pending',
            source_sha256: artifacts.sourceSha256,
            packet_plan: artifacts.plan,
            safety_prompt_versions: PARTIAL_HOLD_PROMPT_BINDINGS,
            model_reduce_result: null,
          }],
          rowCount: 1,
        }
      }
      if (sql.includes('UPDATE triage_extractions')) {
        return { rows: [{ id: 'extraction-1' }], rowCount: 1 }
      }
      return { rows: [], rowCount: 1 }
    })

    await expect(
      persistLongPacketPartialSafetyHold({
        extractionId: 'extraction-1',
        tenantId: 'tenant-1',
        plan: artifacts.plan,
        sourceSha256: artifacts.sourceSha256,
        mode: 'safety_checkpoint',
        projection: projection(outcomes.emergency),
      }),
    ).resolves.toMatchObject({
      ok: true,
      artifact: { mode: 'safety_checkpoint' },
    })

    const update = queryMock.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE triage_extractions'),
    )
    expect(String(update?.[0])).not.toMatch(/status = 'error'/)
    expect(JSON.parse(String(update?.[1]?.[2]))).toMatchObject({
      mode: 'safety_checkpoint',
      completionAuthorized: false,
    })
  })

  it('locks a valid exact durable lease before locking and checkpointing the extraction', async () => {
    const artifacts = packet()
    const outcomes = await capturedOutcomes(artifacts.plan)
    const safetyProjection = projection(outcomes.emergency)
    const durableAuthority = {
      jobId: 'job-safety-1',
      leaseToken: 'lease-1',
      branch: 'safety' as const,
      chunkId: outcomes.emergency.chunkId,
      chunkProvenanceSha256: outcomes.emergency.chunkProvenanceSha256,
      modelId: safetyProjection.modelProfile,
      promptVersion: safetyProjection.promptVersion,
      sourceSha256: artifacts.sourceSha256,
      planSha256: hashLongPacketPlan(artifacts.plan),
      plannerVersion: artifacts.plan.version,
      pipelineVersion: LONG_PACKET_MODEL_PIPELINE_VERSION,
    }
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM triage_long_packet_chunk_jobs')) {
        return { rows: [{ id: 'job-safety-1' }], rowCount: 1 }
      }
      if (sql.includes('FROM triage_extractions')) {
        return {
          rows: [{
            id: 'extraction-1',
            status: 'pending',
            source_sha256: artifacts.sourceSha256,
            packet_plan: artifacts.plan,
            safety_prompt_versions: PARTIAL_HOLD_PROMPT_BINDINGS,
            model_reduce_result: null,
          }],
          rowCount: 1,
        }
      }
      if (sql.includes('UPDATE triage_extractions')) {
        return { rows: [{ id: 'extraction-1' }], rowCount: 1 }
      }
      return { rows: [], rowCount: 1 }
    })

    await expect(
      persistLongPacketPartialSafetyHold({
        extractionId: 'extraction-1',
        tenantId: 'tenant-1',
        plan: artifacts.plan,
        sourceSha256: artifacts.sourceSha256,
        mode: 'safety_checkpoint',
        durableAuthority,
        projection: safetyProjection,
      }),
    ).resolves.toMatchObject({ ok: true })

    const statements = queryMock.mock.calls.map(([sql]) => String(sql))
    expect(
      statements.findIndex((sql) =>
        sql.includes('FROM triage_long_packet_chunk_jobs'),
      ),
    ).toBeLessThan(
      statements.findIndex((sql) => sql.includes('FROM triage_extractions')),
    )
  })

  it('rejects a stale durable lease without reading or mutating the extraction', async () => {
    const artifacts = packet()
    const outcomes = await capturedOutcomes(artifacts.plan)
    const safetyProjection = projection(outcomes.emergency)
    queryMock.mockImplementation(async (sql: string) =>
      sql.includes('FROM triage_long_packet_chunk_jobs')
        ? { rows: [], rowCount: 0 }
        : { rows: [], rowCount: 1 },
    )

    await expect(
      persistLongPacketPartialSafetyHold({
        extractionId: 'extraction-1',
        tenantId: 'tenant-1',
        plan: artifacts.plan,
        sourceSha256: artifacts.sourceSha256,
        mode: 'safety_checkpoint',
        durableAuthority: {
          jobId: 'job-safety-1',
          leaseToken: 'stale-lease',
          branch: 'safety',
          chunkId: outcomes.emergency.chunkId,
          chunkProvenanceSha256: outcomes.emergency.chunkProvenanceSha256,
          modelId: safetyProjection.modelProfile,
          promptVersion: safetyProjection.promptVersion,
          sourceSha256: artifacts.sourceSha256,
          planSha256: hashLongPacketPlan(artifacts.plan),
          plannerVersion: artifacts.plan.version,
          pipelineVersion: LONG_PACKET_MODEL_PIPELINE_VERSION,
        },
        projection: safetyProjection,
      }),
    ).resolves.toEqual({ ok: false, reason: 'persistence_failed' })
    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes('FROM triage_extractions'),
      ),
    ).toBe(false)
    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes('UPDATE triage_extractions'),
      ),
    ).toBe(false)
  })

  it('terminally persists a source-bound narrative-failure aggregate when its workflow transaction rolled back', async () => {
    const { artifacts, pipeline } =
      await crossChunkNarrativeFailureAggregate()
    expect(pipeline).toMatchObject({
      status: 'partial',
      coverageStatus: 'partial',
      carePathway: 'same_day_clinician_review',
      failureCodes: ['narrative_reducer_failed'],
    })
    const fullBindings = {
      ...PARTIAL_HOLD_PROMPT_BINDINGS,
      planner: 'neurology-long-packet-planner-v1',
      deterministicEmergency: 'neurology-long-packet-emergency-map-reduce-v3',
      narrativeReducer: 'neurology-long-packet-narrative-reducer-v1',
      narrativeReducerModel: 'us.anthropic.claude-sonnet-4-6',
    }
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT') && sql.includes('FROM triage_extractions')) {
        return {
          rows: [{
            id: 'extraction-1',
            status: 'pending',
            source_sha256: artifacts.sourceSha256,
            packet_plan: artifacts.plan,
            safety_prompt_versions: fullBindings,
            model_map_result: null,
            model_reduce_result: null,
          }],
          rowCount: 1,
        }
      }
      if (sql.includes('UPDATE triage_extractions')) {
        return { rows: [{ id: 'extraction-1' }], rowCount: 1 }
      }
      return { rows: [], rowCount: 1 }
    })

    await expect(
      persistValidatedLongPacketAggregateFailure({
        extractionId: 'extraction-1',
        tenantId: 'tenant-1',
        plan: artifacts.plan,
        sourceSha256: artifacts.sourceSha256,
        safetyPromptVersions: fullBindings,
        modelMapResult: pipeline.mapperCoverage,
        modelReduceResult: pipeline,
        terminalErrorMessage:
          'Validated aggregate workflow persistence failed.',
      }),
    ).resolves.toEqual({ ok: true })

    const update = queryMock.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE triage_extractions'),
    )
    expect(String(update?.[0])).toContain("status = 'error'")
    expect(String(update?.[0])).toContain('model_reduce_result = $4::jsonb')
    expect(JSON.parse(String(update?.[1]?.[3]))).toEqual(pipeline)
    expect(queryMock).toHaveBeenCalledWith('COMMIT')
  })

  it('monotonically upgrades a persisted same-day failure floor to emergency under row lock', async () => {
    let status: 'pending' | 'error' = 'pending'
    let errorMessage: string | null = null
    queryMock.mockImplementation(async (sql: string, values?: unknown[]) => {
      if (sql.includes('SELECT') && sql.includes('FROM triage_extractions')) {
        return {
          rows: [{
            id: 'extraction-1',
            status,
            error_message: errorMessage,
          }],
          rowCount: 1,
        }
      }
      if (sql.includes('UPDATE triage_extractions')) {
        status = 'error'
        errorMessage = String(values?.[2])
        return { rows: [{ id: 'extraction-1' }], rowCount: 1 }
      }
      return { rows: [], rowCount: 1 }
    })

    for (const carePathway of [
      'same_day_clinician_review',
      'emergency_now',
      'same_day_clinician_review',
    ] as const) {
      await expect(
        persistLongPacketSafetyPersistenceFailureFloor({
          extractionId: 'extraction-1',
          tenantId: 'tenant-1',
          carePathway,
        }),
      ).resolves.toEqual({ ok: true })
    }

    expect(errorMessage).toContain(':EMERGENCY_NOW:')
    const lockStatements = queryMock.mock.calls.filter(([sql]) =>
      String(sql).includes('SELECT') &&
      String(sql).includes('FROM triage_extractions'),
    )
    expect(lockStatements).toHaveLength(3)
    expect(lockStatements.every(([sql]) => String(sql).includes('FOR UPDATE')))
      .toBe(true)
  })

  it('atomically replaces a checkpoint only with its validated complete safety superset while preserving full prompt provenance', async () => {
    const artifacts = packet()
    const outcomes = await capturedOutcomes(artifacts.plan)
    const clinical = canonicalPersistedExtraction(
      artifacts.plan,
      outcomes.pipeline,
    )
    const fullBindings = {
      ...PARTIAL_HOLD_PROMPT_BINDINGS,
      planner: 'neurology-long-packet-planner-v1',
      deterministicEmergency: 'neurology-long-packet-emergency-map-reduce-v3',
      narrativeReducer: 'neurology-long-packet-narrative-reducer-v1',
      narrativeReducerModel: 'us.anthropic.claude-sonnet-4-6',
    }
    const checkpoint = mergeLongPacketPartialSafetyHold({
      plan: artifacts.plan,
      sourceSha256: artifacts.sourceSha256,
      safetyPromptVersions: fullBindings,
      existing: null,
      mode: 'safety_checkpoint',
      projection: projection(outcomes.emergency),
    })
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT') && sql.includes('FROM triage_extractions')) {
        return {
          rows: [{
            id: 'extraction-1',
            status: 'pending',
            source_sha256: artifacts.sourceSha256,
            packet_plan: artifacts.plan,
            safety_prompt_versions: fullBindings,
            model_reduce_result: checkpoint,
          }],
          rowCount: 1,
        }
      }
      if (sql.includes('UPDATE triage_extractions')) {
        return { rows: [{ id: 'extraction-1' }], rowCount: 1 }
      }
      return { rows: [], rowCount: 1 }
    })

    await expect(
      persistValidatedLongPacketCompletion({
        extractionId: 'extraction-1',
        tenantId: 'tenant-1',
        plan: artifacts.plan,
        sourceSha256: artifacts.sourceSha256,
        safetyPromptVersions: fullBindings,
        modelMapResult: outcomes.pipeline.mapperCoverage,
        modelReduceResult: outcomes.pipeline,
        ...clinical,
      }),
    ).resolves.toEqual({ ok: true })

    const lock = queryMock.mock.calls.find(([sql]) =>
      String(sql).includes('SELECT') &&
      String(sql).includes('FROM triage_extractions'),
    )
    const update = queryMock.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE triage_extractions'),
    )
    expect(String(lock?.[0])).toContain('FOR UPDATE')
    expect(String(update?.[0])).toContain("status = 'complete'")
    expect(String(update?.[0])).not.toContain('safety_prompt_versions =')
    expect(queryMock).toHaveBeenCalledWith('COMMIT')
  })

  it('completes only when an already staged full-pipeline checkpoint is byte-for-byte identical', async () => {
    const artifacts = packet()
    const outcomes = await capturedOutcomes(artifacts.plan)
    const clinical = canonicalPersistedExtraction(
      artifacts.plan,
      outcomes.pipeline,
    )
    const fullBindings = {
      ...PARTIAL_HOLD_PROMPT_BINDINGS,
      planner: 'neurology-long-packet-planner-v1',
      deterministicEmergency: 'neurology-long-packet-emergency-map-reduce-v3',
      narrativeReducer: 'neurology-long-packet-narrative-reducer-v1',
      narrativeReducerModel: 'us.anthropic.claude-sonnet-4-6',
    }
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT') && sql.includes('FROM triage_extractions')) {
        return {
          rows: [{
            id: 'extraction-1',
            status: 'pending',
            source_sha256: artifacts.sourceSha256,
            packet_plan: artifacts.plan,
            safety_prompt_versions: fullBindings,
            model_map_result: outcomes.pipeline.mapperCoverage,
            model_reduce_result: outcomes.pipeline,
          }],
          rowCount: 1,
        }
      }
      if (sql.includes('UPDATE triage_extractions')) {
        return { rows: [{ id: 'extraction-1' }], rowCount: 1 }
      }
      return { rows: [], rowCount: 1 }
    })

    await expect(
      persistValidatedLongPacketCompletion({
        extractionId: 'extraction-1',
        tenantId: 'tenant-1',
        plan: artifacts.plan,
        sourceSha256: artifacts.sourceSha256,
        safetyPromptVersions: fullBindings,
        modelMapResult: outcomes.pipeline.mapperCoverage,
        modelReduceResult: outcomes.pipeline,
        ...clinical,
      }),
    ).resolves.toEqual({ ok: true })
    expect(queryMock).toHaveBeenCalledWith('COMMIT')
  })

  it('rolls back a complete inline pipeline when caller-supplied clinical fields differ from the canonical source-bound extraction', async () => {
    const artifacts = packet()
    const outcomes = await capturedOutcomes(artifacts.plan)
    const clinical = canonicalPersistedExtraction(
      artifacts.plan,
      outcomes.pipeline,
    )
    const fullBindings = {
      ...PARTIAL_HOLD_PROMPT_BINDINGS,
      planner: 'neurology-long-packet-planner-v1',
      deterministicEmergency: 'neurology-long-packet-emergency-map-reduce-v3',
      narrativeReducer: 'neurology-long-packet-narrative-reducer-v1',
      narrativeReducerModel: 'us.anthropic.claude-sonnet-4-6',
    }
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT') && sql.includes('FROM triage_extractions')) {
        return {
          rows: [{
            id: 'extraction-1',
            status: 'pending',
            source_sha256: artifacts.sourceSha256,
            packet_plan: artifacts.plan,
            safety_prompt_versions: fullBindings,
            model_map_result: outcomes.pipeline.mapperCoverage,
            model_reduce_result: outcomes.pipeline,
          }],
          rowCount: 1,
        }
      }
      if (sql.includes('UPDATE triage_extractions')) {
        return { rows: [{ id: 'extraction-1' }], rowCount: 1 }
      }
      return { rows: [], rowCount: 1 }
    })

    await expect(
      persistValidatedLongPacketCompletion({
        extractionId: 'extraction-1',
        tenantId: 'tenant-1',
        plan: artifacts.plan,
        sourceSha256: artifacts.sourceSha256,
        safetyPromptVersions: fullBindings,
        modelMapResult: outcomes.pipeline.mapperCoverage,
        modelReduceResult: outcomes.pipeline,
        ...clinical,
        extractedSummary: `${clinical.extractedSummary}\nForged caller addition.`,
      }),
    ).resolves.toEqual({ ok: false, reason: 'persistence_failed' })
    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes('UPDATE triage_extractions'),
      ),
    ).toBe(false)
    expect(queryMock).toHaveBeenCalledWith('ROLLBACK')
  })

  it('rolls back completion when full prompt provenance differs from the locked source row', async () => {
    const artifacts = packet()
    const outcomes = await capturedOutcomes(artifacts.plan)
    const lockedBindings = {
      ...PARTIAL_HOLD_PROMPT_BINDINGS,
      planner: 'planner-locked',
      narrativeReducer: 'reducer-locked',
    }
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT') && sql.includes('FROM triage_extractions')) {
        return {
          rows: [{
            id: 'extraction-1',
            status: 'pending',
            source_sha256: artifacts.sourceSha256,
            packet_plan: artifacts.plan,
            safety_prompt_versions: lockedBindings,
            model_reduce_result: null,
          }],
          rowCount: 1,
        }
      }
      return { rows: [], rowCount: 1 }
    })

    await expect(
      persistValidatedLongPacketCompletion({
        extractionId: 'extraction-1',
        tenantId: 'tenant-1',
        plan: artifacts.plan,
        sourceSha256: artifacts.sourceSha256,
        safetyPromptVersions: {
          ...lockedBindings,
          narrativeReducer: 'reducer-drifted',
        },
        modelMapResult: outcomes.pipeline.mapperCoverage,
        modelReduceResult: outcomes.pipeline,
        noteTypeDetected: 'unknown',
        extractionConfidence: 'high',
        extractedSummary: 'Must not persist.',
        keyFindings: {
          chief_complaint: '',
          neurological_symptoms: [],
          timeline: '',
          relevant_history: '',
          medications_and_therapies: [],
          failed_therapies: [],
          imaging_results: [],
          red_flags_noted: [],
          functional_status: '',
        },
      }),
    ).resolves.toEqual({ ok: false, reason: 'persistence_failed' })
    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes('UPDATE triage_extractions'),
      ),
    ).toBe(false)
    expect(queryMock).toHaveBeenCalledWith('ROLLBACK')
  })

  it('persists and row-locks a terminal partial hold in existing JSONB', async () => {
    const artifacts = packet()
    const outcomes = await capturedOutcomes(artifacts.plan)
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT') && sql.includes('FROM triage_extractions')) {
        return {
          rows: [{
            id: 'extraction-1',
            status: 'pending',
            source_sha256: artifacts.sourceSha256,
            packet_plan: artifacts.plan,
            safety_prompt_versions: PARTIAL_HOLD_PROMPT_BINDINGS,
            model_reduce_result: null,
          }],
          rowCount: 1,
        }
      }
      if (sql.includes('UPDATE triage_extractions')) {
        return { rows: [{ id: 'extraction-1' }], rowCount: 1 }
      }
      return { rows: [], rowCount: 1 }
    })

    await expect(
      persistLongPacketPartialSafetyHold({
        extractionId: 'extraction-1',
        tenantId: 'tenant-1',
        plan: artifacts.plan,
        sourceSha256: artifacts.sourceSha256,
        projection: projection(outcomes.emergency),
      }),
    ).resolves.toMatchObject({ ok: true })

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringMatching(/FOR UPDATE/),
      ['extraction-1', 'tenant-1'],
    )
    const update = queryMock.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE triage_extractions'),
    )
    expect(String(update?.[0])).toMatch(/status = 'error'/)
    expect(String(update?.[0])).toContain('model_reduce_result')
    expect(JSON.parse(String(update?.[1]?.[2]))).toMatchObject({
      kind: 'partial_safety_hold',
      completionAuthorized: false,
      carePathway: 'emergency_now',
    })
    expect(queryMock).toHaveBeenCalledWith('COMMIT')
    expect(releaseMock).toHaveBeenCalledOnce()
  })

  it('conservatively attaches a validated urgent hold after an artifact-free terminal error wins the lock race', async () => {
    const artifacts = packet()
    const outcomes = await capturedOutcomes(artifacts.plan)
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM triage_extractions')) {
        return {
          rows: [{
            id: 'extraction-1',
            status: 'error',
            source_sha256: artifacts.sourceSha256,
            packet_plan: artifacts.plan,
            safety_prompt_versions: PARTIAL_HOLD_PROMPT_BINDINGS,
            model_reduce_result: null,
          }],
          rowCount: 1,
        }
      }
      if (sql.includes('UPDATE triage_extractions')) {
        return { rows: [{ id: 'extraction-1' }], rowCount: 1 }
      }
      return { rows: [], rowCount: 1 }
    })

    await expect(
      persistLongPacketPartialSafetyHold({
        extractionId: 'extraction-1',
        tenantId: 'tenant-1',
        plan: artifacts.plan,
        sourceSha256: artifacts.sourceSha256,
        projection: projection(outcomes.emergency),
      }),
    ).resolves.toMatchObject({
      ok: true,
      artifact: { carePathway: 'emergency_now' },
    })
    expect(queryMock).toHaveBeenCalledWith('COMMIT')
  })

  it('merges a late emergency checkpoint into an error row without changing its terminal fields', async () => {
    const artifacts = packet()
    const outcomes = await capturedOutcomes(artifacts.plan)
    const existingSameDay = mergeLongPacketPartialSafetyHold({
      plan: artifacts.plan,
      sourceSha256: artifacts.sourceSha256,
      safetyPromptVersions: PARTIAL_HOLD_PROMPT_BINDINGS,
      existing: null,
      mode: 'safety_checkpoint',
      projection: projection(outcomes.sameDay),
    })
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM triage_extractions')) {
        return {
          rows: [{
            id: 'extraction-1',
            status: 'error',
            source_sha256: artifacts.sourceSha256,
            packet_plan: artifacts.plan,
            safety_prompt_versions: PARTIAL_HOLD_PROMPT_BINDINGS,
            model_reduce_result: existingSameDay,
          }],
          rowCount: 1,
        }
      }
      if (sql.includes('UPDATE triage_extractions')) {
        return { rows: [{ id: 'extraction-1' }], rowCount: 1 }
      }
      return { rows: [], rowCount: 1 }
    })

    await expect(
      persistLongPacketPartialSafetyHold({
        extractionId: 'extraction-1',
        tenantId: 'tenant-1',
        plan: artifacts.plan,
        sourceSha256: artifacts.sourceSha256,
        mode: 'safety_checkpoint',
        projection: projection(outcomes.emergency),
      }),
    ).resolves.toMatchObject({
      ok: true,
      artifact: { mode: 'safety_checkpoint', carePathway: 'emergency_now' },
    })
    const update = queryMock.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE triage_extractions'),
    )
    expect(String(update?.[0])).toContain("status IN ('pending', 'error')")
    expect(String(update?.[0])).not.toContain("SET status = 'error'")
    expect(String(update?.[0])).not.toContain('error_message =')
    expect(JSON.parse(String(update?.[1]?.[2])).projections).toHaveLength(2)
  })

  it.each([
    ['completed row', 'complete', null],
    ['foreign artifact', 'error', { kind: 'untrusted' }],
  ] as const)(
    'refuses to replace a %s',
    async (_label, status, modelReduceResult) => {
      const artifacts = packet()
      const outcomes = await capturedOutcomes(artifacts.plan)
      queryMock.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM triage_extractions')) {
          return {
            rows: [{
              id: 'extraction-1',
              status,
              source_sha256: artifacts.sourceSha256,
              packet_plan: artifacts.plan,
              safety_prompt_versions: PARTIAL_HOLD_PROMPT_BINDINGS,
              model_reduce_result: modelReduceResult,
            }],
            rowCount: 1,
          }
        }
        return { rows: [], rowCount: 1 }
      })

      await expect(
        persistLongPacketPartialSafetyHold({
          extractionId: 'extraction-1',
          tenantId: 'tenant-1',
          plan: artifacts.plan,
          sourceSha256: artifacts.sourceSha256,
          projection: projection(outcomes.emergency),
        }),
      ).resolves.toEqual({ ok: false, reason: 'persistence_failed' })
      expect(
        queryMock.mock.calls.some(([sql]) =>
          String(sql).includes('UPDATE triage_extractions'),
        ),
      ).toBe(false)
      expect(queryMock).toHaveBeenCalledWith('ROLLBACK')
    },
  )
})
