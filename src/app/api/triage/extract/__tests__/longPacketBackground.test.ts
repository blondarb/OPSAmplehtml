import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  authorizeMock,
  fromMock,
  insertMock,
  selectMock,
  singleMock,
  updateMock,
  eqMock,
  runInBackgroundMock,
  runPipelineMock,
  persistEscalationMock,
  persistPartialHoldMock,
  persistFailureFloorMock,
  persistAggregateFailureMock,
  persistValidatedCompletionMock,
} = vi.hoisted(() => ({
  authorizeMock: vi.fn(),
  fromMock: vi.fn(),
  insertMock: vi.fn(),
  selectMock: vi.fn(),
  singleMock: vi.fn(),
  updateMock: vi.fn(),
  eqMock: vi.fn(),
  runInBackgroundMock: vi.fn(),
  runPipelineMock: vi.fn(),
  persistEscalationMock: vi.fn(),
  persistPartialHoldMock: vi.fn(),
  persistFailureFloorMock: vi.fn(),
  persistAggregateFailureMock: vi.fn(),
  persistValidatedCompletionMock: vi.fn(),
}))

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
}))
vi.mock('@/lib/db-query', () => ({ from: fromMock }))
vi.mock('@/lib/triage/asyncRunner', () => ({
  runInBackground: runInBackgroundMock,
}))
vi.mock('@/lib/triage/longPacketModelPipeline', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/lib/triage/longPacketModelPipeline')
  >()
  return { ...actual, runLongPacketModelPipeline: runPipelineMock }
})
vi.mock('@/lib/triage/longPacketSafetyEscalation', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/lib/triage/longPacketSafetyEscalation')
  >()
  return {
    ...actual,
    persistLongPacketSafetyEscalation: persistEscalationMock,
  }
})
vi.mock('@/lib/triage/longPacketPartialSafetyHold', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/lib/triage/longPacketPartialSafetyHold')
  >()
  return {
    ...actual,
    persistLongPacketPartialSafetyHold: persistPartialHoldMock,
    persistLongPacketSafetyPersistenceFailureFloor:
      persistFailureFloorMock,
    persistValidatedLongPacketAggregateFailure:
      persistAggregateFailureMock,
    persistValidatedLongPacketCompletion: persistValidatedCompletionMock,
  }
})

import { POST } from '../route'
import { LONG_PACKET_FACT_CATEGORIES } from '@/lib/triage/longPacketClinicalMapper'
import type {
  LongPacketBranchCoverage,
  LongPacketModelPipelineOptions,
  LongPacketModelPipelineResult,
} from '@/lib/triage/longPacketModelPipeline'
import type { LongPacketPlan } from '@/lib/triage/longPacketPlanner'
import { longPacketSafetyPersistenceFailureMessage } from '@/lib/triage/longPacketSafetyPersistenceFailure'

function coverage(expectedChunkCount: number): LongPacketBranchCoverage {
  return {
    status: 'complete',
    expectedChunkCount,
    receivedOutcomeCount: expectedChunkCount,
    acceptedChunkCount: expectedChunkCount,
    completedChunkCount: expectedChunkCount,
    partialChunkCount: 0,
    failedChunkCount: 0,
    missingChunkCount: 0,
    duplicateChunkCount: 0,
    unexpectedChunkCount: 0,
    tamperedChunkCount: 0,
  }
}

function completeResult(plan: LongPacketPlan): LongPacketModelPipelineResult {
  const branchCoverage = coverage(plan.chunks.length)
  return {
    version: 'neurology-long-packet-model-pipeline-v1',
    status: 'completed',
    coverageStatus: 'complete',
    clinicianHold: false,
    carePathway: 'routine_outpatient',
    reviewRequirement: 'clinician_confirmation',
    schedulingLocked: true,
    mapperCoverage: branchCoverage,
    safetyCoverage: branchCoverage,
    mapperOutcomes: [],
    safetyOutcomes: [],
    factsByCategory: Object.fromEntries(
      LONG_PACKET_FACT_CATEGORIES.map((category) => [category, []]),
    ) as unknown as LongPacketModelPipelineResult['factsByCategory'],
    conflicts: [],
    criticalUnknowns: [],
    safetySignals: [],
    requiredSafetyEvidenceIds: [],
    narrativeSafetyManifestId: null,
    narrative: {
      narrative: 'Synthetic complete long-packet referral summary.',
      timelineNarrative: 'Stable symptoms over several years.',
      medicationNarrative: '',
      testNarrative: '',
      functionalNarrative: '',
      conflictNarrative: '',
      preservedSafetyEvidenceIds: [],
    },
    failureCodes: [],
  }
}

function request(text: string) {
  return new Request('http://localhost/api/triage/extract', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  })
}

describe('long-packet extraction background persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authorizeMock.mockResolvedValue({
      ok: true,
      context: {
        userId: 'clinician-1',
        tenantId: 'tenant-1',
        role: 'clinician',
      },
    })
    singleMock.mockResolvedValue({ data: { id: 'extraction-1' }, error: null })
    selectMock.mockReturnValue({ single: singleMock })
    insertMock.mockReturnValue({ select: selectMock })
    eqMock.mockReturnValue({ eq: eqMock })
    updateMock.mockReturnValue({ eq: eqMock })
    fromMock.mockReturnValue({ insert: insertMock, update: updateMock })
    runPipelineMock.mockImplementation(async (plan: LongPacketPlan) =>
      completeResult(plan),
    )
    persistEscalationMock.mockResolvedValue({
      ok: true,
      triageSessionId: null,
      emergencyActionId: null,
      actionRequired: false,
    })
    persistPartialHoldMock.mockResolvedValue({
      ok: true,
      carePathway: 'emergency_now',
    })
    persistFailureFloorMock.mockResolvedValue({ ok: true })
    persistAggregateFailureMock.mockResolvedValue({ ok: true })
    persistValidatedCompletionMock.mockResolvedValue({ ok: true })
  })

  it('persists complete mapper and safety coverage before setting status complete', async () => {
    const response = await POST(request('Stable synthetic history. '.repeat(2_100)))
    expect(response.status).toBe(202)
    const work = runInBackgroundMock.mock.calls[0][0] as () => Promise<void>

    await work()

    expect(runPipelineMock).toHaveBeenCalledOnce()
    expect(persistValidatedCompletionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        extractionId: 'extraction-1',
        tenantId: 'tenant-1',
        modelMapResult: expect.objectContaining({ status: 'complete' }),
        modelReduceResult: expect.objectContaining({
          status: 'completed',
          coverageStatus: 'complete',
        }),
        extractedSummary: expect.stringContaining(
          'Synthetic complete long-packet referral summary.',
        ),
      }),
    )
    expect(
      updateMock.mock.calls.some(
        ([value]) => (value as { status?: string }).status === 'complete',
      ),
    ).toBe(false)
  })

  it('persists partial evidence but fails closed when any model branch is incomplete', async () => {
    runPipelineMock.mockImplementationOnce(async (plan: LongPacketPlan) => ({
      ...completeResult(plan),
      status: 'partial',
      coverageStatus: 'partial',
      clinicianHold: true,
      safetyCoverage: {
        ...coverage(plan.chunks.length),
        status: 'partial',
        completedChunkCount: plan.chunks.length - 1,
        partialChunkCount: 1,
      },
      failureCodes: ['safety_extractor_missing_chunk'],
    }))
    await POST(request('Stable synthetic history. '.repeat(2_100)))
    const work = runInBackgroundMock.mock.calls[0][0] as () => Promise<void>

    await work()

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
      }),
    )
    expect(updateMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ model_reduce_result: expect.anything() }),
    )
    expect(
      updateMock.mock.calls.some(
        ([value]) => (value as { status?: string }).status === 'complete',
      ),
    ).toBe(false)
  })

  it('persists a model-only emergency workflow before completing inline extraction', async () => {
    runPipelineMock.mockImplementationOnce(async (plan: LongPacketPlan) => ({
      ...completeResult(plan),
      clinicianHold: true,
      carePathway: 'emergency_now',
      reviewRequirement: 'emergency_action',
      safetySignals: [
        {
          code: 'model_only_emergency',
          syndrome: 'other_time_critical',
          source: 'safety_model',
          action: 'emergency_now',
          assertion: 'present',
          temporality: 'current',
          experiencer: 'patient',
          evidence: [],
        },
      ],
    }))
    persistEscalationMock.mockResolvedValueOnce({
      ok: true,
      triageSessionId: 'triage-model-emergency-1',
      emergencyActionId: 'action-model-emergency-1',
      actionRequired: true,
    })
    await POST(request('Stable synthetic history. '.repeat(2_100)))
    const work = runInBackgroundMock.mock.calls[0][0] as () => Promise<void>

    await work()

    expect(persistEscalationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        extractionId: 'extraction-1',
        tenantId: 'tenant-1',
        safetyResult: expect.objectContaining({
          carePathway: 'emergency_now',
          dataQuality: 'sufficient',
        }),
      }),
    )
    expect(persistValidatedCompletionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        modelReduceResult: expect.objectContaining({
          carePathway: 'emergency_now',
        }),
      }),
    )
    expect(
      persistEscalationMock.mock.invocationCallOrder[0],
    ).toBeLessThan(
      persistValidatedCompletionMock.mock.invocationCallOrder[0],
    )
  })

  it.each([
    ['emergency', 'emergency_now'],
    ['cross-chunk same-day', 'same_day_clinician_review'],
  ] as const)(
    'binds a completed aggregate %s workflow to the exact validated full pipeline',
    async (_label, carePathway) => {
      runPipelineMock.mockImplementationOnce(async (plan: LongPacketPlan) => ({
        ...completeResult(plan),
        clinicianHold: true,
        carePathway,
        reviewRequirement:
          carePathway === 'emergency_now'
            ? 'emergency_action'
            : 'immediate_clinician_review',
        conflicts:
          carePathway === 'same_day_clinician_review'
            ? [
                {
                  topic: 'medication:current_dose',
                  description:
                    'Synthetic incompatible current medication claims across chunks.',
                  evidence: [],
                },
              ]
            : [],
        safetySignals:
          carePathway === 'emergency_now'
            ? [
                {
                  code: 'aggregate_emergency',
                  syndrome: 'other_time_critical',
                  source: 'safety_model',
                  action: 'emergency_now',
                  assertion: 'present',
                  temporality: 'current',
                  experiencer: 'patient',
                  evidence: [],
                },
              ]
            : [],
      }))
      persistEscalationMock.mockResolvedValueOnce({
        ok: true,
        triageSessionId: 'triage-aggregate',
        emergencyActionId:
          carePathway === 'emergency_now' ? 'action-aggregate' : null,
        actionRequired: true,
      })

      await POST(request('Stable synthetic history. '.repeat(2_100)))
      const work = runInBackgroundMock.mock.calls[0][0] as () => Promise<void>
      await work()

      expect(persistEscalationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          safetyResult: expect.objectContaining({ carePathway }),
          checkpoint: expect.objectContaining({
            kind: 'validated_pipeline',
            sourceSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
            modelMapResult: expect.objectContaining({ status: 'complete' }),
            modelReduceResult: expect.objectContaining({
              carePathway,
              coverageStatus: 'complete',
            }),
          }),
        }),
      )
      expect(persistValidatedCompletionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          modelReduceResult: expect.objectContaining({ carePathway }),
        }),
      )
      expect(
        updateMock.mock.calls.some(
          ([value]) => (value as { status?: string }).status === 'error',
        ),
      ).toBe(false)
    },
  )

  it('persists model-only emergency safety before rejecting a failed narrative reduction', async () => {
    runPipelineMock.mockImplementationOnce(async (plan: LongPacketPlan) => ({
      ...completeResult(plan),
      status: 'partial',
      coverageStatus: 'partial',
      clinicianHold: true,
      carePathway: 'emergency_now',
      reviewRequirement: 'emergency_action',
      safetySignals: [
        {
          code: 'model_only_emergency',
          syndrome: 'other_time_critical',
          source: 'safety_model',
          action: 'emergency_now',
          assertion: 'present',
          temporality: 'current',
          experiencer: 'patient',
          evidence: [],
        },
      ],
      narrative: null,
      narrativeSafetyManifestId: null,
      failureCodes: ['narrative_reducer_failed'],
    }))
    persistEscalationMock.mockResolvedValueOnce({
      ok: true,
      triageSessionId: 'triage-model-emergency-2',
      emergencyActionId: 'action-model-emergency-2',
      actionRequired: true,
    })
    await POST(request('Stable synthetic history. '.repeat(2_100)))
    const work = runInBackgroundMock.mock.calls[0][0] as () => Promise<void>

    await work()

    expect(persistEscalationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        safetyResult: expect.objectContaining({
          carePathway: 'emergency_now',
        }),
        checkpoint: expect.objectContaining({
          kind: 'validated_pipeline',
          sourceSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          modelMapResult: expect.objectContaining({ status: 'complete' }),
          modelReduceResult: expect.objectContaining({
            status: 'partial',
            coverageStatus: 'partial',
            failureCodes: ['narrative_reducer_failed'],
          }),
        }),
      }),
    )
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
      }),
    )
    expect(updateMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ model_reduce_result: expect.anything() }),
    )
  })

  it('preserves a complete cross-chunk same-day projection when its final workflow cannot persist', async () => {
    runPipelineMock.mockImplementationOnce(async (plan: LongPacketPlan) => ({
      ...completeResult(plan),
      clinicianHold: true,
      carePathway: 'same_day_clinician_review',
      reviewRequirement: 'immediate_clinician_review',
    }))
    persistEscalationMock.mockResolvedValueOnce({
      ok: false,
      reason: 'persistence_failed',
    })
    await POST(request('Stable synthetic history. '.repeat(2_100)))
    const work = runInBackgroundMock.mock.calls[0][0] as () => Promise<void>

    await work()

    expect(persistValidatedCompletionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        terminalErrorMessage: expect.stringContaining(
          'mandatory workflow',
        ),
        modelReduceResult: expect.objectContaining({
          status: 'completed',
          carePathway: 'same_day_clinician_review',
        }),
      }),
    )
    expect(
      updateMock.mock.calls.some(
        ([value]) => (value as { status?: string }).status === 'complete',
      ),
    ).toBe(false)
  })

  it('terminally preserves a narrative-failure cross-chunk aggregate when its workflow transaction fails', async () => {
    runPipelineMock.mockImplementationOnce(async (plan: LongPacketPlan) => ({
      ...completeResult(plan),
      status: 'partial',
      coverageStatus: 'partial',
      clinicianHold: true,
      carePathway: 'same_day_clinician_review',
      reviewRequirement: 'immediate_clinician_review',
      conflicts: [
        {
          topic: 'medication:current_dose',
          description:
            'Synthetic incompatible current medication claims across chunks.',
          evidence: [],
        },
      ],
      narrative: null,
      narrativeSafetyManifestId: null,
      failureCodes: ['narrative_reducer_failed'],
    }))
    persistEscalationMock.mockResolvedValueOnce({
      ok: false,
      reason: 'persistence_failed',
    })
    await POST(request('Stable synthetic history. '.repeat(2_100)))
    const work = runInBackgroundMock.mock.calls[0][0] as () => Promise<void>

    await work()

    expect(persistAggregateFailureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        extractionId: 'extraction-1',
        sourceSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        modelMapResult: expect.objectContaining({ status: 'complete' }),
        modelReduceResult: expect.objectContaining({
          status: 'partial',
          carePathway: 'same_day_clinician_review',
          failureCodes: ['narrative_reducer_failed'],
        }),
        terminalErrorMessage: expect.stringContaining('mandatory workflow'),
      }),
    )
    expect(
      updateMock.mock.calls.some(
        ([value]) => (value as { status?: string }).status === 'error',
      ),
    ).toBe(false)
  })

  it('stores an explicit same-day fail-safe after bounded aggregate persistence retries fail', async () => {
    runPipelineMock.mockImplementationOnce(async (plan: LongPacketPlan) => ({
      ...completeResult(plan),
      status: 'partial',
      coverageStatus: 'partial',
      clinicianHold: true,
      carePathway: 'same_day_clinician_review',
      reviewRequirement: 'immediate_clinician_review',
      conflicts: [
        {
          topic: 'medication:current_dose',
          description: 'Synthetic cross-chunk current dose conflict.',
          evidence: [],
        },
      ],
      narrative: null,
      narrativeSafetyManifestId: null,
      failureCodes: ['narrative_reducer_failed'],
    }))
    persistEscalationMock.mockResolvedValueOnce({
      ok: false,
      reason: 'persistence_failed',
    })
    persistAggregateFailureMock.mockResolvedValue({
      ok: false,
      reason: 'persistence_failed',
    })
    persistFailureFloorMock.mockResolvedValue({
      ok: false,
      reason: 'persistence_failed',
    })

    await POST(request('Stable synthetic history. '.repeat(2_100)))
    const work = runInBackgroundMock.mock.calls[0][0] as () => Promise<void>
    await work()

    expect(persistAggregateFailureMock).toHaveBeenCalledTimes(3)
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        error_message: longPacketSafetyPersistenceFailureMessage(
          'same_day_clinician_review',
        ),
      }),
    )
  })

  it('persists an early model emergency before a later inline pipeline failure', async () => {
    runPipelineMock.mockImplementationOnce(
      async (
        plan: LongPacketPlan,
        options: LongPacketModelPipelineOptions,
      ) => {
        const chunk = plan.chunks[0]
        await options.onSafetyOutcome?.({
          branch: 'safety_extractor',
          chunkId: chunk.id,
          chunkProvenanceSha256: chunk.provenanceSha256,
          status: 'completed',
          failureCode: null,
          result: {
            carePathway: 'emergency_now',
            dataQuality: 'sufficient',
            criticalUnknowns: [],
            signals: [
              {
                code: 'early_model_emergency',
                syndrome: 'other_time_critical',
                source: 'safety_model',
                action: 'emergency_now',
                assertion: 'present',
                temporality: 'current',
                experiencer: 'patient',
                evidence: [],
              },
            ],
          },
        })
        throw new Error('synthetic later chunk timeout')
      },
    )
    persistEscalationMock.mockResolvedValueOnce({
      ok: true,
      triageSessionId: 'triage-early-emergency',
      emergencyActionId: 'action-early-emergency',
      actionRequired: true,
    })
    await POST(request('Stable synthetic history. '.repeat(2_100)))
    const work = runInBackgroundMock.mock.calls[0][0] as () => Promise<void>

    await work()

    expect(persistEscalationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        extractionId: 'extraction-1',
        safetyResult: expect.objectContaining({
          carePathway: 'emergency_now',
        }),
        checkpoint: expect.objectContaining({
          sourceSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          projection: expect.objectContaining({
          outcome: expect.objectContaining({
            branch: 'safety_extractor',
            result: expect.objectContaining({ carePathway: 'emergency_now' }),
          }),
          }),
        }),
      }),
    )
    expect(persistPartialHoldMock).not.toHaveBeenCalled()
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        error_message: 'synthetic later chunk timeout',
      }),
    )
    expect(eqMock).toHaveBeenCalledWith('status', 'pending')
  })

  it('persists an early mapper red-flag floor before a later inline failure', async () => {
    runPipelineMock.mockImplementationOnce(
      async (
        plan: LongPacketPlan,
        options: LongPacketModelPipelineOptions,
      ) => {
        const chunk = plan.chunks[0]
        await options.onMapperOutcome?.({
          branch: 'clinical_mapper',
          chunkId: chunk.id,
          chunkProvenanceSha256: chunk.provenanceSha256,
          status: 'completed',
          failureCode: null,
          result: {
            chunkId: chunk.id,
            chunkProvenanceSha256: chunk.provenanceSha256,
            sourceCharacterCount: chunk.text.length,
            coverageStatus: 'complete',
            facts: [
              {
                category: 'red_flag',
                key: 'synthetic_red_flag',
                statement: 'Validated mapper red flag requires review.',
                assertion: 'present',
                temporality: 'current',
                eventDateText: null,
                evidence: [],
              },
            ],
            conflicts: [],
          },
        })
        throw new Error('synthetic later mapper timeout')
      },
    )
    persistEscalationMock.mockResolvedValueOnce({
      ok: true,
      triageSessionId: 'triage-early-mapper',
      emergencyActionId: null,
      actionRequired: true,
    })
    await POST(request('Stable synthetic history. '.repeat(2_100)))
    const work = runInBackgroundMock.mock.calls[0][0] as () => Promise<void>

    await work()

    expect(persistEscalationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        safetyResult: expect.objectContaining({
          carePathway: 'same_day_clinician_review',
          criticalUnknowns: expect.arrayContaining([
            expect.stringMatching(/mapper red flag/i),
          ]),
        }),
        checkpoint: expect.objectContaining({
          projection: expect.objectContaining({
            outcome: expect.objectContaining({ branch: 'clinical_mapper' }),
          }),
        }),
      }),
    )
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error' }),
    )
  })

  it('escalates an undetermined chunk hold without writing it into the urgent-only checkpoint schema', async () => {
    runPipelineMock.mockImplementationOnce(
      async (plan: LongPacketPlan, options: LongPacketModelPipelineOptions) => {
        const chunk = plan.chunks[0]
        await options.onSafetyOutcome?.({
          branch: 'safety_extractor',
          chunkId: chunk.id,
          chunkProvenanceSha256: chunk.provenanceSha256,
          status: 'partial',
          failureCode: 'safety_reported_insufficient',
          result: {
            carePathway: 'undetermined',
            dataQuality: 'insufficient',
            criticalUnknowns: ['Synthetic urgent status is unresolved.'],
            signals: [],
          },
        })
        return completeResult(plan)
      },
    )

    await POST(request('Stable synthetic history. '.repeat(2_100)))
    const work = runInBackgroundMock.mock.calls[0][0] as () => Promise<void>
    await work()

    expect(persistEscalationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        safetyResult: expect.objectContaining({ carePathway: 'undetermined' }),
      }),
    )
    expect(persistPartialHoldMock).not.toHaveBeenCalled()
  })

  it.each([
    ['emergency', 'emergency_now', 'sufficient', 'completed', null],
    [
      'same-day',
      'same_day_clinician_review',
      'partial',
      'partial',
      'safety_reported_partial',
    ],
  ] as const)(
    'terminates before finalization when an early %s safety workflow cannot persist',
    async (_label, carePathway, dataQuality, status, failureCode) => {
      let reachedPostCallbackWork = false
      runPipelineMock.mockImplementationOnce(
        async (
          plan: LongPacketPlan,
          options: LongPacketModelPipelineOptions,
        ) => {
          const chunk = plan.chunks[0]
          await options.onSafetyOutcome?.({
            branch: 'safety_extractor',
            chunkId: chunk.id,
            chunkProvenanceSha256: chunk.provenanceSha256,
            status,
            failureCode,
            result: {
              carePathway,
              dataQuality,
              criticalUnknowns:
                carePathway === 'same_day_clinician_review'
                  ? ['Synthetic unresolved urgent detail.']
                  : [],
              signals: [],
            },
          })
          reachedPostCallbackWork = true
          return completeResult(plan)
        },
      )
      persistEscalationMock.mockResolvedValueOnce({
        ok: false,
        reason: 'persistence_failed',
      })

      await POST(request('Stable synthetic history. '.repeat(2_100)))
      const work = runInBackgroundMock.mock.calls[0][0] as () => Promise<void>
      await work()

      expect(persistPartialHoldMock).toHaveBeenCalledWith(
        expect.objectContaining({
          extractionId: 'extraction-1',
          tenantId: 'tenant-1',
          projection: expect.objectContaining({
            outcome: expect.objectContaining({
              branch: 'safety_extractor',
              result: expect.objectContaining({ carePathway }),
            }),
          }),
          mode: 'workflow_persistence_failed',
        }),
      )
      expect(persistPartialHoldMock).toHaveBeenCalledOnce()
      expect(reachedPostCallbackWork).toBe(false)
      expect(persistEscalationMock).toHaveBeenCalledOnce()
      expect(persistEscalationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          checkpoint: expect.objectContaining({
            projection: expect.objectContaining({
              outcome: expect.objectContaining({
                result: expect.objectContaining({ carePathway }),
              }),
            }),
          }),
        }),
      )
      expect(
        updateMock.mock.calls.some(
          ([value]) => (value as { status?: string }).status === 'complete',
        ),
      ).toBe(false)
    },
  )

  it('persists a partial hold when early escalation throws', async () => {
    let reachedPostCallbackWork = false
    runPipelineMock.mockImplementationOnce(
      async (
        plan: LongPacketPlan,
        options: LongPacketModelPipelineOptions,
      ) => {
        const chunk = plan.chunks[0]
        await options.onSafetyOutcome?.({
          branch: 'safety_extractor',
          chunkId: chunk.id,
          chunkProvenanceSha256: chunk.provenanceSha256,
          status: 'completed',
          failureCode: null,
          result: {
            carePathway: 'emergency_now',
            dataQuality: 'sufficient',
            criticalUnknowns: [],
            signals: [],
          },
        })
        reachedPostCallbackWork = true
        return completeResult(plan)
      },
    )
    persistEscalationMock.mockRejectedValueOnce(
      new Error('synthetic escalation throw'),
    )

    await POST(request('Stable synthetic history. '.repeat(2_100)))
    const work = runInBackgroundMock.mock.calls[0][0] as () => Promise<void>
    await work()

    expect(persistPartialHoldMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'workflow_persistence_failed',
        projection: expect.objectContaining({
          outcome: expect.objectContaining({
            branch: 'safety_extractor',
            result: expect.objectContaining({ carePathway: 'emergency_now' }),
          }),
        }),
      }),
    )
    expect(reachedPostCallbackWork).toBe(false)
  })

  it('stores an explicit emergency fail-safe after bounded exact checkpoint persistence retries fail', async () => {
    runPipelineMock.mockImplementationOnce(
      async (
        plan: LongPacketPlan,
        options: LongPacketModelPipelineOptions,
      ) => {
        const chunk = plan.chunks[0]
        await options.onSafetyOutcome?.({
          branch: 'safety_extractor',
          chunkId: chunk.id,
          chunkProvenanceSha256: chunk.provenanceSha256,
          status: 'completed',
          failureCode: null,
          result: {
            carePathway: 'emergency_now',
            dataQuality: 'sufficient',
            criticalUnknowns: [],
            signals: [],
          },
        })
        return completeResult(plan)
      },
    )
    persistEscalationMock.mockResolvedValueOnce({
      ok: false,
      reason: 'persistence_failed',
    })
    persistPartialHoldMock.mockResolvedValue({
      ok: false,
      reason: 'persistence_failed',
    })
    persistFailureFloorMock.mockResolvedValue({
      ok: false,
      reason: 'persistence_failed',
    })

    await POST(request('Stable synthetic history. '.repeat(2_100)))
    const work = runInBackgroundMock.mock.calls[0][0] as () => Promise<void>
    await work()

    expect(persistPartialHoldMock).toHaveBeenCalledTimes(3)
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        error_message:
          longPacketSafetyPersistenceFailureMessage('emergency_now'),
      }),
    )
  })

  it('lets a later emergency upgrade an already-error same-day failure floor', async () => {
    runPipelineMock.mockImplementationOnce(
      async (
        plan: LongPacketPlan,
        options: LongPacketModelPipelineOptions,
      ) => {
        const chunk = plan.chunks[0]
        try {
          await options.onMapperOutcome?.({
            branch: 'clinical_mapper',
            chunkId: chunk.id,
            chunkProvenanceSha256: chunk.provenanceSha256,
            status: 'completed',
            failureCode: null,
            result: {
              chunkId: chunk.id,
              chunkProvenanceSha256: chunk.provenanceSha256,
              sourceCharacterCount: chunk.text.length,
              coverageStatus: 'complete',
              facts: [
                {
                  category: 'red_flag',
                  key: 'same_day_mapper_floor',
                  statement: 'Synthetic current mapper red flag.',
                  assertion: 'present',
                  temporality: 'current',
                  eventDateText: null,
                  evidence: [],
                },
              ],
              conflicts: [],
            },
          })
        } catch {
          // Simulate the paired safety callback continuing after mapper hold.
        }
        await options.onSafetyOutcome?.({
          branch: 'safety_extractor',
          chunkId: chunk.id,
          chunkProvenanceSha256: chunk.provenanceSha256,
          status: 'completed',
          failureCode: null,
          result: {
            carePathway: 'emergency_now',
            dataQuality: 'sufficient',
            criticalUnknowns: [],
            signals: [],
          },
        })
        return completeResult(plan)
      },
    )
    persistEscalationMock.mockResolvedValue({
      ok: false,
      reason: 'persistence_failed',
    })
    persistPartialHoldMock.mockResolvedValue({
      ok: false,
      reason: 'persistence_failed',
    })
    persistFailureFloorMock
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, reason: 'persistence_failed' })
      .mockResolvedValueOnce({ ok: false, reason: 'persistence_failed' })
      .mockResolvedValueOnce({ ok: false, reason: 'persistence_failed' })
      .mockResolvedValueOnce({ ok: true })

    await POST(request('Stable synthetic history. '.repeat(2_100)))
    const work = runInBackgroundMock.mock.calls[0][0] as () => Promise<void>
    await work()

    expect(persistFailureFloorMock).toHaveBeenCalledTimes(5)
    expect(persistFailureFloorMock.mock.calls.at(-1)?.[0]).toMatchObject({
      carePathway: 'emergency_now',
    })
    expect(
      updateMock.mock.calls.some(
        ([value]) => (value as { status?: string }).status === 'error',
      ),
    ).toBe(false)
  })

  it('does not depend on a separate pre-checkpoint write before an atomic emergency escalation', async () => {
    runPipelineMock.mockImplementationOnce(
      async (plan: LongPacketPlan, options: LongPacketModelPipelineOptions) => {
        const chunk = plan.chunks[0]
        await options.onSafetyOutcome?.({
          branch: 'safety_extractor',
          chunkId: chunk.id,
          chunkProvenanceSha256: chunk.provenanceSha256,
          status: 'completed',
          failureCode: null,
          result: {
            carePathway: 'emergency_now',
            dataQuality: 'sufficient',
            criticalUnknowns: [],
            signals: [],
          },
        })
        return completeResult(plan)
      },
    )
    persistPartialHoldMock.mockResolvedValue({
      ok: false,
      reason: 'persistence_failed',
    })
    persistEscalationMock.mockResolvedValueOnce({
      ok: true,
      triageSessionId: 'triage-checkpoint-write-failed',
      emergencyActionId: 'action-checkpoint-write-failed',
      actionRequired: true,
    })

    await POST(request('Stable synthetic history. '.repeat(2_100)))
    const work = runInBackgroundMock.mock.calls[0][0] as () => Promise<void>
    await work()

    expect(persistEscalationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        safetyResult: expect.objectContaining({
          carePathway: 'emergency_now',
        }),
        checkpoint: expect.objectContaining({
          sourceSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          projection: expect.objectContaining({
            outcome: expect.objectContaining({
              branch: 'safety_extractor',
              result: expect.objectContaining({
                carePathway: 'emergency_now',
              }),
            }),
          }),
        }),
      }),
    )
    expect(persistPartialHoldMock).not.toHaveBeenCalled()
  })

  it('terminates before finalization when an early mapper same-day floor cannot persist', async () => {
    let reachedPostCallbackWork = false
    runPipelineMock.mockImplementationOnce(
      async (
        plan: LongPacketPlan,
        options: LongPacketModelPipelineOptions,
      ) => {
        const chunk = plan.chunks[0]
        await options.onMapperOutcome?.({
          branch: 'clinical_mapper',
          chunkId: chunk.id,
          chunkProvenanceSha256: chunk.provenanceSha256,
          status: 'completed',
          failureCode: null,
          result: {
            chunkId: chunk.id,
            chunkProvenanceSha256: chunk.provenanceSha256,
            sourceCharacterCount: chunk.text.length,
            coverageStatus: 'complete',
            facts: [
              {
                category: 'red_flag',
                key: 'synthetic_red_flag',
                statement: 'Validated mapper red flag requires review.',
                assertion: 'present',
                temporality: 'current',
                eventDateText: null,
                evidence: [],
              },
            ],
            conflicts: [],
          },
        })
        reachedPostCallbackWork = true
        return completeResult(plan)
      },
    )
    persistEscalationMock.mockResolvedValueOnce({
      ok: false,
      reason: 'persistence_failed',
    })

    await POST(request('Stable synthetic history. '.repeat(2_100)))
    const work = runInBackgroundMock.mock.calls[0][0] as () => Promise<void>
    await work()

    expect(persistPartialHoldMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'workflow_persistence_failed',
        projection: expect.objectContaining({
          outcome: expect.objectContaining({ branch: 'clinical_mapper' }),
        }),
      }),
    )
    expect(reachedPostCallbackWork).toBe(false)
    expect(persistEscalationMock).toHaveBeenCalledOnce()
    expect(persistEscalationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        checkpoint: expect.objectContaining({
          projection: expect.objectContaining({
            outcome: expect.objectContaining({ branch: 'clinical_mapper' }),
          }),
        }),
      }),
    )
    expect(
      updateMock.mock.calls.some(
        ([value]) => (value as { status?: string }).status === 'complete',
      ),
    ).toBe(false)
  })
})
