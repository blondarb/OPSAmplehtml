import { describe, expect, it, vi } from 'vitest'

import {
  reduceLongPacketModelOutcomes,
  runLongPacketModelPipeline,
  type LongPacketMapperBranchOutcome,
  type LongPacketNarrativeReductionInput,
  type LongPacketSafetyBranchOutcome,
} from '@/lib/triage/longPacketModelPipeline'
import {
  planLongPacketChunks,
  type LongPacketChunk,
  type LongPacketSourceDocument,
} from '@/lib/triage/longPacketPlanner'
import { validateModelSafetyExtraction } from '@/lib/triage/modelSafetyExtraction'
import type { LongPacketChunkClinicalMap } from '@/lib/triage/longPacketClinicalMapper'

function packetWithPages(
  pageTexts: string[],
  options: { maxChunkCharacters?: number; overlapCharacters?: number } = {},
) {
  const documents: LongPacketSourceDocument[] = [
    {
      packetId: 'packet-model-pipeline',
      expectedDocumentCount: 1,
      documentId: 'document-model-pipeline',
      documentOrder: 1,
      expectedPageCount: pageTexts.length,
      pages: pageTexts.map((text, index) => ({
        pageNumber: index + 1,
        text,
        extractionMethod: 'native_text',
        extractionConfidence: null,
      })),
    },
  ]
  return {
    documents,
    plan: planLongPacketChunks(documents, {
      maxChunkCharacters: options.maxChunkCharacters ?? 180,
      overlapCharacters: options.overlapCharacters ?? 24,
    }),
  }
}

function emptyMap(chunk: LongPacketChunk): LongPacketChunkClinicalMap {
  return {
    chunkId: chunk.id,
    chunkProvenanceSha256: chunk.provenanceSha256,
    sourceCharacterCount: chunk.text.length,
    coverageStatus: 'complete',
    facts: [],
    conflicts: [],
  }
}

function mapWithFact(
  chunk: LongPacketChunk,
  statement = `fact-${chunk.chunkIndex}`,
): LongPacketChunkClinicalMap {
  const span = chunk.sourceSpans[0]
  const localOffset = span.chunkStartOffset
  const quote = chunk.text.substring(
    localOffset,
    Math.min(span.chunkEndOffset, localOffset + 48),
  )
  const mappedStart = span.pageStartOffset
  return {
    ...emptyMap(chunk),
    facts: [
      {
        category: 'timeline_event',
        key: statement,
        statement,
        assertion: 'present',
        temporality: 'historical',
        eventDateText: null,
        evidence: [
          {
            packetId: chunk.packetId,
            documentId: chunk.documentId,
            pageNumber: span.pageNumber,
            startOffset: mappedStart,
            endOffset: mappedStart + quote.length,
            quote,
            extractionMethod: span.extractionMethod,
            extractionConfidence: span.extractionConfidence,
          },
        ],
      },
    ],
  }
}

function noSafety(chunk: LongPacketChunk) {
  return validateModelSafetyExtraction(
    {
      care_pathway: 'no_time_critical_signal',
      data_quality: 'sufficient',
      critical_unknowns: [],
      signals: [],
    },
    chunk.text,
  )
}

function callbackPersistenceFailure(
  carePathway: 'emergency_now' | 'same_day_clinician_review',
) {
  return Object.assign(new Error(`synthetic ${carePathway} persistence failure`), {
    carePathway,
  })
}

async function narrativeReducer(input: LongPacketNarrativeReductionInput) {
  return {
    narrative: `Fused ${input.units.length + input.fragments.length} inputs.`,
    timelineNarrative: '',
    medicationNarrative: '',
    testNarrative: '',
    functionalNarrative: '',
    conflictNarrative: '',
    preservedSafetyEvidenceIds: [...input.requiredSafetyEvidenceIds],
  }
}

function completedOutcomes(plan: ReturnType<typeof planLongPacketChunks>): {
  mapper: LongPacketMapperBranchOutcome[]
  safety: LongPacketSafetyBranchOutcome[]
} {
  return {
    mapper: plan.chunks.map((chunk) => ({
      branch: 'clinical_mapper',
      chunkId: chunk.id,
      chunkProvenanceSha256: chunk.provenanceSha256,
      status: 'completed',
      result: emptyMap(chunk),
      failureCode: null,
    })),
    safety: plan.chunks.map((chunk) => ({
      branch: 'safety_extractor',
      chunkId: chunk.id,
      chunkProvenanceSha256: chunk.provenanceSha256,
      status: 'completed',
      result: noSafety(chunk),
      failureCode: null,
    })),
  }
}

describe('runLongPacketModelPipeline', () => {
  it.each(['onSafetyOutcome', 'onMapperOutcome'] as const)(
    'propagates a rejected %s callback before narrative reduction',
    async (callbackName) => {
      const { plan } = packetWithPages([
        'Synthetic source detail that produces a mapper fact before persistence fails.',
      ])
      const reducer = vi.fn(narrativeReducer)
      const callback = vi.fn(async () => {
        throw new Error('synthetic callback persistence failure')
      })

      await expect(
        runLongPacketModelPipeline(plan, {
          mapChunk: async (chunk) => mapWithFact(chunk),
          extractSafety: async (chunk) => noSafety(chunk),
          reduceNarrative: reducer,
          [callbackName]: callback,
        }),
      ).rejects.toThrow('synthetic callback persistence failure')
      expect(callback).toHaveBeenCalledOnce()
      expect(reducer).not.toHaveBeenCalled()
    },
  )

  it('propagates emergency when same-chunk mapper and safety callbacks both fail persistence', async () => {
    const { plan } = packetWithPages([
      'Synthetic same-chunk dual callback persistence failure.',
    ])

    await expect(
      runLongPacketModelPipeline(plan, {
        mapChunk: async (chunk) => mapWithFact(chunk),
        extractSafety: async (chunk) => noSafety(chunk),
        onMapperOutcome: async () => {
          throw callbackPersistenceFailure('same_day_clinician_review')
        },
        onSafetyOutcome: async () => {
          throw callbackPersistenceFailure('emergency_now')
        },
      }),
    ).rejects.toMatchObject({
      cause: { carePathway: 'emergency_now' },
    })
  })

  it('awaits every active chunk callback and propagates a later emergency failure floor', async () => {
    const { plan } = packetWithPages(
      Array.from(
        { length: 8 },
        (_, index) => `Synthetic page ${index + 1}. ${'detail '.repeat(25)}`,
      ),
      { maxChunkCharacters: 120, overlapCharacters: 12 },
    )
    const visited: string[] = []
    const firstChunkId = plan.chunks[0].id
    const lastChunkId = plan.chunks.at(-1)!.id

    await expect(
      runLongPacketModelPipeline(plan, {
        maxConcurrentChunks: 2,
        mapChunk: async (chunk) => mapWithFact(chunk),
        extractSafety: async (chunk) => noSafety(chunk),
        onSafetyOutcome: async (outcome) => {
          visited.push(outcome.chunkId)
          if (outcome.chunkId === firstChunkId) {
            throw callbackPersistenceFailure('same_day_clinician_review')
          }
          if (outcome.chunkId === lastChunkId) {
            throw callbackPersistenceFailure('emergency_now')
          }
        },
      }),
    ).rejects.toMatchObject({
      cause: { carePathway: 'emergency_now' },
    })
    expect(visited).toContain(firstChunkId)
    expect(visited).toContain(lastChunkId)
  })

  it('maps both independent branches over every chunk and preserves an emergency only in the final chunk', async () => {
    const pageTexts = Array.from({ length: 20 }, (_, index) =>
      index === 19
        ? `${'Routine copied background. '.repeat(12)}Final addendum: sudden aphasia and right facial droop began 20 minutes ago.`
        : `Page ${index + 1}: stable chronic history without acute change.`,
    )
    const { documents, plan } = packetWithPages(pageTexts, {
      maxChunkCharacters: 90,
      overlapCharacters: 16,
    })
    const mapChunk = vi.fn(async (chunk: LongPacketChunk) => mapWithFact(chunk))
    const extractSafety = vi.fn(async (chunk: LongPacketChunk) => {
      const isFinal = chunk.id === plan.chunks.at(-1)?.id
      return validateModelSafetyExtraction(
        isFinal
          ? {
              care_pathway: 'emergency_now',
              data_quality: 'sufficient',
              critical_unknowns: [],
              signals: [
                {
                  code: 'acute_aphasia',
                  syndrome: 'acute_cerebrovascular',
                  assertion: 'present',
                  temporality: 'recent',
                  experiencer: 'patient',
                  action: 'emergency_now',
                  evidence: [
                    {
                      quote: 'right facial droop began 20 minutes ago.',
                      occurrence_index: 0,
                    },
                  ],
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
    })

    const result = await runLongPacketModelPipeline(plan, {
      mapChunk,
      extractSafety,
      reduceNarrative: narrativeReducer,
      maxConcurrentChunks: 7,
    })

    expect(mapChunk).toHaveBeenCalledTimes(plan.chunks.length)
    expect(extractSafety).toHaveBeenCalledTimes(plan.chunks.length)
    expect(result.failureCodes).toEqual([])
    expect(result.status).toBe('completed')
    expect(result.carePathway).toBe('emergency_now')
    const evidence = result.safetySignals[0].evidence[0]
    expect(evidence.pageNumber).toBe(20)
    expect(
      documents[0].pages[19].text.slice(
        evidence.startOffset,
        evidence.endOffset,
      ),
    ).toBe(evidence.quote)
  })

  it('fails completeness and holds for clinician review when a mapper result is missing', async () => {
    const { plan } = packetWithPages(['Stable history. '.repeat(40)])
    const outcomes = completedOutcomes(plan)

    const result = await reduceLongPacketModelOutcomes(
      plan,
      outcomes.mapper.slice(0, -1),
      outcomes.safety,
      { reduceNarrative: narrativeReducer },
    )

    expect(result.status).toBe('failed')
    expect(result.coverageStatus).toBe('failed')
    expect(result.clinicianHold).toBe(true)
    expect(result.carePathway).not.toBe('routine_outpatient')
    expect(result.failureCodes).toContain('clinical_mapper_missing_chunk')
  })

  it('rejects duplicate and tampered chunk outcomes instead of choosing one', async () => {
    const { plan } = packetWithPages(['Stable history. '.repeat(30)])
    const outcomes = completedOutcomes(plan)
    const duplicate = outcomes.mapper[0]
    const tampered = {
      ...outcomes.safety[1],
      chunkProvenanceSha256: 'f'.repeat(64),
    }

    const result = await reduceLongPacketModelOutcomes(
      plan,
      [...outcomes.mapper, duplicate],
      outcomes.safety.map((outcome, index) =>
        index === 1 ? tampered : outcome,
      ),
      { reduceNarrative: narrativeReducer },
    )

    expect(result.status).toBe('failed')
    expect(result.failureCodes).toEqual(
      expect.arrayContaining([
        'clinical_mapper_duplicate_chunk',
        'safety_extractor_tampered_chunk',
      ]),
    )
    expect(result.clinicianHold).toBe(true)
  })

  it('maps exact repeated safety evidence to the correct source page offsets', async () => {
    const repeated = 'The patient reports sudden monocular vision loss today.'
    const { documents, plan } = packetWithPages([repeated, repeated], {
      maxChunkCharacters: 200,
      overlapCharacters: 20,
    })
    expect(plan.chunks).toHaveLength(1)
    const chunk = plan.chunks[0]

    const result = await runLongPacketModelPipeline(plan, {
      mapChunk: async () => emptyMap(chunk),
      extractSafety: async () =>
        validateModelSafetyExtraction(
          {
            care_pathway: 'emergency_now',
            data_quality: 'sufficient',
            critical_unknowns: [],
            signals: [
              {
                code: 'acute_vision_loss',
                syndrome: 'acute_vision_threat',
                assertion: 'present',
                temporality: 'current',
                experiencer: 'patient',
                action: 'emergency_now',
                evidence: [{ quote: repeated, occurrence_index: 1 }],
              },
            ],
          },
          chunk.text,
        ),
      reduceNarrative: narrativeReducer,
    })

    const evidence = result.safetySignals[0].evidence[0]
    expect(evidence.pageNumber).toBe(2)
    expect(evidence.startOffset).toBe(0)
    expect(documents[0].pages[1].text.slice(0, evidence.endOffset)).toBe(
      repeated,
    )
  })

  it('recursively reduces bounded inputs without truncating any fact or safety pin', async () => {
    const { plan } = packetWithPages(
      Array.from(
        { length: 18 },
        (_, index) => `Page ${index + 1}: ${'bounded clinical detail '.repeat(5)}`,
      ),
      { maxChunkCharacters: 140, overlapCharacters: 20 },
    )
    const calls: LongPacketNarrativeReductionInput[] = []
    const reducer = vi.fn(async (input: LongPacketNarrativeReductionInput) => {
      calls.push(input)
      return {
        narrative: `group-${calls.length}`,
        timelineNarrative: '',
        medicationNarrative: '',
        testNarrative: '',
        functionalNarrative: '',
        conflictNarrative: '',
        preservedSafetyEvidenceIds: [...input.requiredSafetyEvidenceIds],
      }
    })

    const result = await runLongPacketModelPipeline(plan, {
      mapChunk: async (chunk) => mapWithFact(chunk),
      extractSafety: async (chunk) => noSafety(chunk),
      reduceNarrative: reducer,
      maxReducerInputCharacters: 1_800,
    })

    expect(calls.length).toBeGreaterThan(1)
    expect(calls.some((call) => call.stage > 0)).toBe(true)
    expect(
      calls.every((call) => JSON.stringify(call).length <= 1_800),
    ).toBe(true)
    expect(result.factsByCategory.timeline_event).toHaveLength(
      plan.chunks.length,
    )
    expect(result.failureCodes).not.toContain('narrative_reducer_failed')
  })

  it('keeps 499 successful maps but marks partial coverage and a hold when one of 500 pages is malformed', async () => {
    const { plan } = packetWithPages(
      Array.from(
        { length: 500 },
        (_, index) => `Page ${index + 1}: stable synthetic clinical fact.`,
      ),
      { maxChunkCharacters: 60, overlapCharacters: 8 },
    )
    expect(plan.chunks).toHaveLength(500)
    const mapChunk = vi.fn(async (chunk: LongPacketChunk) => {
      if (chunk.chunkIndex === 237) throw new Error('malformed map schema')
      return mapWithFact(chunk)
    })

    const result = await runLongPacketModelPipeline(plan, {
      mapChunk,
      extractSafety: async (chunk) => noSafety(chunk),
      reduceNarrative: narrativeReducer,
      maxConcurrentChunks: 19,
      maxReducerInputCharacters: 8_000,
    })

    expect(mapChunk).toHaveBeenCalledTimes(500)
    expect(result.status).toBe('partial')
    expect(result.coverageStatus).toBe('partial')
    expect(result.clinicianHold).toBe(true)
    expect(result.factsByCategory.timeline_event).toHaveLength(499)
    expect(result.carePathway).not.toBe('routine_outpatient')
  })

  it('holds when one safety extraction fails even though every clinical map succeeds', async () => {
    const { plan } = packetWithPages(
      Array.from(
        { length: 8 },
        (_, index) => `Page ${index + 1}: stable synthetic detail.`,
      ),
      { maxChunkCharacters: 60, overlapCharacters: 8 },
    )

    const result = await runLongPacketModelPipeline(plan, {
      mapChunk: async (chunk) => mapWithFact(chunk),
      extractSafety: async (chunk) => {
        if (chunk.chunkIndex === 3) throw new Error('safety model timeout')
        return noSafety(chunk)
      },
      reduceNarrative: narrativeReducer,
    })

    expect(result.status).toBe('partial')
    expect(result.clinicianHold).toBe(true)
    expect(result.carePathway).toBe('undetermined')
    expect(result.factsByCategory.timeline_event).toHaveLength(
      plan.chunks.length,
    )
    expect(result.failureCodes).toContain('safety_extractor_chunk_failed')
  })

  it('cannot reduce an evidence-free undetermined safety chunk to routine', async () => {
    const { plan } = packetWithPages(
      ['Synthetic stable detail with unresolved model safety state.'],
      { maxChunkCharacters: 100, overlapCharacters: 8 },
    )

    const result = await runLongPacketModelPipeline(plan, {
      mapChunk: async (chunk) => mapWithFact(chunk),
      extractSafety: async () => ({
        carePathway: 'undetermined',
        dataQuality: 'sufficient',
        criticalUnknowns: [],
        signals: [],
      }),
      reduceNarrative: narrativeReducer,
    })

    expect(result.carePathway).toBe('undetermined')
    expect(result.clinicianHold).toBe(true)
    expect(result.status).not.toBe('completed')
  })

  it('creates an explicit cross-chunk conflict without choosing between incompatible current medication claims', async () => {
    const { plan } = packetWithPages(
      [
        'Medication reconciliation lists levetiracetam 500 mg twice daily.',
        'Medication reconciliation lists levetiracetam 1000 mg twice daily.',
      ],
      { maxChunkCharacters: 75, overlapCharacters: 12 },
    )

    const result = await runLongPacketModelPipeline(plan, {
      mapChunk: async (chunk) => {
        const mapped = mapWithFact(chunk)
        mapped.facts[0] = {
          ...mapped.facts[0],
          category: 'medication',
          key: 'levetiracetam',
          statement: chunk.text.includes('1000 mg')
            ? 'levetiracetam 1000 mg twice daily'
            : 'levetiracetam 500 mg twice daily',
          temporality: 'current',
        }
        return mapped
      },
      extractSafety: async (chunk) => noSafety(chunk),
      reduceNarrative: narrativeReducer,
    })

    expect(result.factsByCategory.medication).toHaveLength(2)
    expect(result.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ topic: 'medication:levetiracetam' }),
      ]),
    )
    expect(
      new Set(result.conflicts[0].evidence.map((item) => item.pageNumber)),
    ).toEqual(new Set([1, 2]))
    expect(result.carePathway).toBe('same_day_clinician_review')
    expect(result.clinicianHold).toBe(true)
  })

  it('turns a malformed canonical mapper result into a failed hold instead of throwing during union', async () => {
    const { plan } = packetWithPages(['Stable synthetic history.'])

    const result = await runLongPacketModelPipeline(plan, {
      mapChunk: async (chunk) => {
        const malformed = mapWithFact(chunk)
        malformed.facts[0] = {
          ...malformed.facts[0],
          category: 'invented_category',
        } as typeof malformed.facts[number]
        return malformed
      },
      extractSafety: async (chunk) => noSafety(chunk),
      reduceNarrative: narrativeReducer,
    })

    expect(result.status).toBe('failed')
    expect(result.failureCodes).toContain('clinical_mapper_tampered_chunk')
    expect(result.clinicianHold).toBe(true)
  })

  it('deterministically preserves medication, therapy, test, timeline, function, red-flag, and critical-unknown facts', async () => {
    const { plan } = packetWithPages([
      'Synthetic source evidence supporting a bounded clinical fact map.',
    ])
    const categories = [
      'medication',
      'failed_therapy',
      'test_result',
      'timeline_event',
      'functional_finding',
      'red_flag',
      'critical_unknown',
    ] as const

    const result = await runLongPacketModelPipeline(plan, {
      mapChunk: async (chunk) => {
        const mapped = mapWithFact(chunk)
        const evidence = mapped.facts[0].evidence
        mapped.facts = categories.map((category) => ({
          category,
          key: `${category}-key`,
          statement: `${category} statement`,
          assertion: category === 'critical_unknown' ? 'uncertain' : 'present',
          temporality: 'current',
          eventDateText: null,
          evidence,
        }))
        return mapped
      },
      extractSafety: async (chunk) =>
        validateModelSafetyExtraction(
          {
            care_pathway: 'same_day_clinician_review',
            data_quality: 'partial',
            critical_unknowns: ['Exact last-known-well time is unavailable.'],
            signals: [],
          },
          chunk.text,
        ),
      reduceNarrative: narrativeReducer,
    })

    for (const category of categories) {
      expect(result.factsByCategory[category]).toHaveLength(1)
    }
    expect(result.criticalUnknowns.map((unknown) => unknown.source)).toEqual(
      expect.arrayContaining(['clinical_mapper', 'safety_extractor']),
    )
    expect(result.carePathway).toBe('same_day_clinician_review')
    expect(result.clinicianHold).toBe(true)
  })
})
