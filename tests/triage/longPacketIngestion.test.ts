import { describe, expect, it } from 'vitest'

import {
  buildLongPacketIngestionArtifacts,
  buildLongPacketAdjudicationText,
  LONG_PACKET_FULL_PIPELINE_DEFAULT_BINDINGS,
  longPacketSourceDigest,
  longPacketPipelineToClinicalExtraction,
  validatePersistedLongPacketArtifacts,
  type ValidatedLongPacketSafetyArtifacts,
} from '@/lib/triage/longPacketIngestion'
import { LONG_PACKET_FACT_CATEGORIES } from '@/lib/triage/longPacketClinicalMapper'
import type { LongPacketModelPipelineResult } from '@/lib/triage/longPacketModelPipeline'
import { runLongPacketModelPipeline } from '@/lib/triage/longPacketModelPipeline'
import { validateModelSafetyExtraction } from '@/lib/triage/modelSafetyExtraction'

function emptyFacts() {
  return Object.fromEntries(
    LONG_PACKET_FACT_CATEGORIES.map((category) => [category, []]),
  ) as LongPacketModelPipelineResult['factsByCategory']
}

function completedPipeline(
  overrides: Partial<LongPacketModelPipelineResult> = {},
): LongPacketModelPipelineResult {
  return {
    version: 'neurology-long-packet-model-pipeline-v1',
    status: 'completed',
    coverageStatus: 'complete',
    clinicianHold: false,
    carePathway: 'routine_outpatient',
    reviewRequirement: 'clinician_confirmation',
    schedulingLocked: true,
    mapperCoverage: {
      status: 'complete',
      expectedChunkCount: 1,
      receivedOutcomeCount: 1,
      acceptedChunkCount: 1,
      completedChunkCount: 1,
      partialChunkCount: 0,
      failedChunkCount: 0,
      missingChunkCount: 0,
      duplicateChunkCount: 0,
      unexpectedChunkCount: 0,
      tamperedChunkCount: 0,
    },
    safetyCoverage: {
      status: 'complete',
      expectedChunkCount: 1,
      receivedOutcomeCount: 1,
      acceptedChunkCount: 1,
      completedChunkCount: 1,
      partialChunkCount: 0,
      failedChunkCount: 0,
      missingChunkCount: 0,
      duplicateChunkCount: 0,
      unexpectedChunkCount: 0,
      tamperedChunkCount: 0,
    },
    mapperOutcomes: [],
    safetyOutcomes: [],
    factsByCategory: emptyFacts(),
    conflicts: [],
    criticalUnknowns: [],
    safetySignals: [],
    requiredSafetyEvidenceIds: [],
    narrativeSafetyManifestId: null,
    narrative: {
      narrative: 'Stable chronic tremor without acute change.',
      timelineNarrative: 'Symptoms have been unchanged for five years.',
      medicationNarrative: '',
      testNarrative: '',
      functionalNarrative: 'Independent in activities of daily living.',
      conflictNarrative: '',
      preservedSafetyEvidenceIds: [],
    },
    failureCodes: [],
    ...overrides,
  }
}

async function genuinePipeline(
  artifacts: ReturnType<typeof buildLongPacketIngestionArtifacts>,
) {
  return runLongPacketModelPipeline(artifacts.plan, {
    mapChunk: async (chunk) => ({
      chunkId: chunk.id,
      chunkProvenanceSha256: chunk.provenanceSha256,
      sourceCharacterCount: chunk.text.length,
      coverageStatus: 'complete',
      facts: [],
      conflicts: [],
    }),
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
    reduceNarrative: async (input) => ({
      narrative: 'Synthetic verified summary.',
      timelineNarrative: '',
      medicationNarrative: '',
      testNarrative: '',
      functionalNarrative: '',
      conflictNarrative: '',
      preservedSafetyEvidenceIds: input.requiredSafetyEvidenceIds,
    }),
  })
}

function reverseObjectKeyOrder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseObjectKeyOrder)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .reverse()
        .map(([key, item]) => [key, reverseObjectKeyOrder(item)]),
    )
  }
  return value
}

describe('buildLongPacketIngestionArtifacts', () => {
  it('preserves ordered pages, proves complete coverage, and scans the final page', () => {
    const pages = [
      {
        pageNumber: 1,
        text: 'Stable synthetic history. '.repeat(400),
        extractionMethod: 'native_text' as const,
        extractionConfidence: null,
      },
      {
        pageNumber: 2,
        text: `${'Routine background. '.repeat(400)}The patient developed sudden aphasia and right facial droop 20 minutes ago.`,
        extractionMethod: 'native_text' as const,
        extractionConfidence: null,
      },
    ]
    const text = pages.map((page) => page.text).join('\n\n')

    const artifacts = buildLongPacketIngestionArtifacts({
      packetId: 'packet-1',
      documentId: 'document-1',
      text,
      pages,
      singlePassCharacterLimit: 1_000,
    })

    expect(artifacts.ingestionMode).toBe('long_packet')
    expect(artifacts.plan.coverage).toMatchObject({
      status: 'complete',
      uncoveredCharacterCount: 0,
      pageCount: 2,
    })
    expect(artifacts.emergency.carePathway).toBe('emergency_now')
    expect(artifacts.emergency.signals.some((signal) =>
      signal.evidence.some((evidence) => evidence.pageNumber === 2),
    )).toBe(true)
  })

  it('changes the canonical digest when any page text changes', () => {
    const base = {
      packetId: 'packet-1',
      documentId: 'document-1',
      text: 'Synthetic stable referral text with sufficient detail for testing.',
      singlePassCharacterLimit: 50_000,
    }
    const first = buildLongPacketIngestionArtifacts(base)
    const second = buildLongPacketIngestionArtifacts({
      ...base,
      text: `${base.text} changed`,
    })

    expect(first.sourceSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(second.sourceSha256).not.toBe(first.sourceSha256)
  })

  it('rejects page metadata that does not reconstruct the immutable text', () => {
    expect(() =>
      buildLongPacketIngestionArtifacts({
        packetId: 'packet-1',
        documentId: 'document-1',
        text: 'Authoritative text',
        pages: [
          {
            pageNumber: 1,
            text: 'Different text',
            extractionMethod: 'native_text',
            extractionConfidence: null,
          },
        ],
        singlePassCharacterLimit: 50_000,
      }),
    ).toThrow('reconstruct')
  })
})

describe('longPacketPipelineToClinicalExtraction', () => {
  it('creates a bounded triage summary and structured findings without losing narrative sections', () => {
    const result = completedPipeline({
      factsByCategory: {
        ...emptyFacts(),
        chief_complaint: [
          {
            category: 'chief_complaint',
            key: 'tremor',
            statement: 'Stable hand tremor',
            assertion: 'present',
            temporality: 'current',
            eventDateText: null,
            evidence: [],
          },
        ],
        medication: [
          {
            category: 'medication',
            key: 'propranolol',
            statement: 'Propranolol 20 mg twice daily',
            assertion: 'present',
            temporality: 'current',
            eventDateText: null,
            evidence: [],
          },
        ],
      },
    })

    const extraction = longPacketPipelineToClinicalExtraction(result)

    expect(extraction.extractedSummary).toContain('Stable chronic tremor')
    expect(extraction.extractedSummary).toContain('unchanged for five years')
    expect(extraction.keyFindings.chief_complaint).toBe('Stable hand tremor')
    expect(extraction.keyFindings.medications_and_therapies).toEqual([
      'Propranolol 20 mg twice daily',
    ])
  })

  it('refuses to represent partial model coverage as a complete clinical extraction', () => {
    expect(() =>
      longPacketPipelineToClinicalExtraction(
        completedPipeline({
          status: 'partial',
          coverageStatus: 'partial',
          clinicianHold: true,
          failureCodes: ['safety_extractor_missing_chunk'],
        }),
      ),
    ).toThrow('complete')
  })
})

describe('buildLongPacketAdjudicationText', () => {
  it('keeps one emergency signal per distinct syndrome plus unknowns and conflicts within 40k', () => {
    const evidence = (quote: string) => ({
      packetId: 'packet-adjudication',
      documentId: 'document-1',
      pageNumber: 1,
      startOffset: 0,
      endOffset: quote.length,
      quote,
      extractionMethod: 'native_text' as const,
      extractionConfidence: null,
    })
    const syndromes = [
      'acute_cerebrovascular',
      'intracranial_hemorrhage_or_sah',
      'status_or_recurrent_seizure',
      'acute_spinal_cord_or_cauda_equina',
      'acute_cns_infection',
      'acute_vision_threat',
      'altered_mental_status_or_coma',
    ] as const
    const modelSignals = syndromes.map((syndrome, index) => ({
      code: `model_emergency_${index + 1}`,
      syndrome,
      source: 'safety_model' as const,
      action: 'emergency_now' as const,
      assertion: 'present' as const,
      temporality: 'current' as const,
      experiencer: 'patient' as const,
      evidence: [evidence(`Synthetic exact model emergency quote ${index + 1}`)],
    }))
    const conflictEvidence = evidence('Synthetic conflicting source quote.')
    const pipeline = completedPipeline({
      safetySignals: modelSignals,
      criticalUnknowns: [
        {
          text: 'Current airway status is not documented.',
          source: 'safety_extractor',
          chunkIds: ['chunk-1'],
          evidence: [],
        },
      ],
      conflicts: [
        {
          topic: 'symptom_timing',
          description: 'Source documents conflict about symptom onset.',
          evidence: [conflictEvidence],
        },
      ],
    })
    const deterministicQuote =
      'The patient developed sudden aphasia and facial droop 20 minutes ago.'
    const safetyArtifacts: ValidatedLongPacketSafetyArtifacts = {
      gateway: {
        status: 'completed',
        failureCode: null,
        carePathway: 'emergency_now',
        reviewRequirement: 'emergency_action',
        schedulingLocked: true,
        signals: [
          {
            code: 'deterministic_stroke',
            syndrome: 'acute_cerebrovascular',
            source: 'deterministic',
            action: 'emergency_now',
            assertion: 'present',
            temporality: 'current',
            experiencer: 'patient',
            evidence: [evidence(deterministicQuote)],
          },
        ],
        lexicalHits: [],
        version: 'neurology-long-packet-emergency-map-reduce-v3',
      },
      safetyResult: {
        carePathway: 'emergency_now',
        dataQuality: 'conflicting',
        criticalUnknowns: ['Current airway status is not documented.'],
        signals: modelSignals,
      },
      evidenceLines: [],
      pipelineComplete: true,
      validatedPipeline: pipeline,
    }

    const text = buildLongPacketAdjudicationText({
      extractedSummary: 'Synthetic canonical summary. '.repeat(4_000),
      safetyArtifacts,
    })

    expect(text.length).toBeLessThanOrEqual(40_000)
    expect(text).toContain('deterministic_stroke')
    for (let index = 1; index <= syndromes.length; index += 1) {
      expect(text).toContain(`model_emergency_${index}`)
    }
    expect(text).toContain('Current airway status is not documented.')
    expect(text).toContain('Source documents conflict about symptom onset.')
    expect(text).toContain('Canonical source-bound extraction summary:')
  })
})

describe('validatePersistedLongPacketArtifacts', () => {
  it('revalidates source digest, plan coverage, deterministic scan, and model safety evidence', async () => {
    const text = 'Synthetic stable referral history without acute change. '.repeat(40)
    const artifacts = buildLongPacketIngestionArtifacts({
      packetId: 'packet-validate',
      documentId: 'document-1',
      text,
      singlePassCharacterLimit: 100,
    })
    const pipeline = await runLongPacketModelPipeline(artifacts.plan, {
      mapChunk: async (chunk) => ({
        chunkId: chunk.id,
        chunkProvenanceSha256: chunk.provenanceSha256,
        sourceCharacterCount: chunk.text.length,
        coverageStatus: 'complete',
        facts: [],
        conflicts: [],
      }),
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
      reduceNarrative: async (input) => ({
        narrative: 'Synthetic stable referral summary.',
        timelineNarrative: '',
        medicationNarrative: '',
        testNarrative: '',
        functionalNarrative: '',
        conflictNarrative: '',
        preservedSafetyEvidenceIds: input.requiredSafetyEvidenceIds,
      }),
    })

    const validated = validatePersistedLongPacketArtifacts({
      text,
      sourcePages: artifacts.sourcePages,
      sourceSha256: artifacts.sourceSha256,
      packetPlan: artifacts.plan,
      packetEmergencyResult: reverseObjectKeyOrder(artifacts.emergency),
      modelMapResult: pipeline.mapperCoverage,
      modelReduceResult: pipeline,
      safetyPromptVersions: LONG_PACKET_FULL_PIPELINE_DEFAULT_BINDINGS,
      extractedSummary: 'Synthetic stable referral summary.',
    })

    expect(validated.gateway.version).toBe(
      'neurology-long-packet-emergency-map-reduce-v3',
    )
    expect(validated.safetyResult).toMatchObject({
      carePathway: 'no_time_critical_signal',
      dataQuality: 'sufficient',
    })
    expect(validated.adjudicationText).toContain(
      'Synthetic stable referral summary.',
    )
  })

  it('accepts JSONB-reordered nested safety evidence without changing protected manifest ids', async () => {
    const text =
      'Synthetic model-only symptom evidence requiring immediate evaluation. '.repeat(
        20,
      )
    const artifacts = buildLongPacketIngestionArtifacts({
      packetId: 'packet-jsonb-evidence',
      documentId: 'document-1',
      text,
      singlePassCharacterLimit: 100,
    })
    const targetChunkId = artifacts.plan.chunks[0].id
    const pipeline = await runLongPacketModelPipeline(artifacts.plan, {
      mapChunk: async (chunk) => ({
        chunkId: chunk.id,
        chunkProvenanceSha256: chunk.provenanceSha256,
        sourceCharacterCount: chunk.text.length,
        coverageStatus: 'complete',
        facts: [],
        conflicts: [],
      }),
      extractSafety: async (chunk) => {
        const quote = 'Synthetic model-only symptom evidence'
        return validateModelSafetyExtraction(
          chunk.id === targetChunkId
            ? {
                care_pathway: 'emergency_now',
                data_quality: 'sufficient',
                critical_unknowns: [],
                signals: [
                  {
                    code: 'model_only_emergency',
                    syndrome: 'other_time_critical',
                    action: 'emergency_now',
                    assertion: 'present',
                    temporality: 'current',
                    experiencer: 'patient',
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
      reduceNarrative: async (input) => ({
        narrative: 'Synthetic safety-bound summary.',
        timelineNarrative: '',
        medicationNarrative: '',
        testNarrative: '',
        functionalNarrative: '',
        conflictNarrative: '',
        preservedSafetyEvidenceIds: input.requiredSafetyEvidenceIds,
      }),
    })
    const jsonbReorderedPipeline = reverseObjectKeyOrder(
      pipeline,
    ) as LongPacketModelPipelineResult

    const validated = validatePersistedLongPacketArtifacts({
      text,
      sourcePages: artifacts.sourcePages,
      sourceSha256: artifacts.sourceSha256,
      packetPlan: artifacts.plan,
      packetEmergencyResult: artifacts.emergency,
      modelMapResult: reverseObjectKeyOrder(pipeline.mapperCoverage),
      modelReduceResult: jsonbReorderedPipeline,
      safetyPromptVersions: LONG_PACKET_FULL_PIPELINE_DEFAULT_BINDINGS,
      extractedSummary: 'Synthetic safety-bound summary.',
    })

    expect(validated.safetyResult.carePathway).toBe('emergency_now')
    expect(jsonbReorderedPipeline.narrativeSafetyManifestId).toBe(
      pipeline.narrativeSafetyManifestId,
    )
  })

  it('rejects fabricated complete counters with zero outcomes for an exact ten-chunk packet', () => {
    const text = 'x'.repeat(71_000)
    const artifacts = buildLongPacketIngestionArtifacts({
      packetId: 'packet-ten-chunks',
      documentId: 'document-1',
      text,
      singlePassCharacterLimit: 100,
    })
    expect(artifacts.plan.chunks).toHaveLength(10)
    const expectedChunkCount = artifacts.plan.chunks.length
    const completeCoverage = {
      status: 'complete' as const,
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
    const fabricated = completedPipeline({
      mapperCoverage: completeCoverage,
      safetyCoverage: completeCoverage,
      mapperOutcomes: [],
      safetyOutcomes: [],
      narrative: null,
    })

    expect(() =>
      validatePersistedLongPacketArtifacts({
        text,
        sourcePages: artifacts.sourcePages,
        sourceSha256: artifacts.sourceSha256,
        packetPlan: artifacts.plan,
        packetEmergencyResult: artifacts.emergency,
        modelMapResult: completeCoverage,
        modelReduceResult: fabricated,
        safetyPromptVersions: LONG_PACKET_FULL_PIPELINE_DEFAULT_BINDINGS,
        extractedSummary: 'Synthetic summary.',
      }),
    ).toThrow('model')
  })

  it.each([
    [
      'missing mapper outcome',
      (pipeline: LongPacketModelPipelineResult) => {
        pipeline.mapperOutcomes = pipeline.mapperOutcomes.slice(1)
      },
    ],
    [
      'duplicate safety outcome',
      (pipeline: LongPacketModelPipelineResult) => {
        pipeline.safetyOutcomes = [
          ...pipeline.safetyOutcomes,
          pipeline.safetyOutcomes[0],
        ]
      },
    ],
    [
      'tampered mapper provenance',
      (pipeline: LongPacketModelPipelineResult) => {
        pipeline.mapperOutcomes[0] = {
          ...pipeline.mapperOutcomes[0],
          chunkProvenanceSha256: 'f'.repeat(64),
        }
      },
    ],
    [
      'unknown mapper result field',
      (pipeline: LongPacketModelPipelineResult) => {
        pipeline.mapperOutcomes[0].result = {
          ...pipeline.mapperOutcomes[0].result!,
          injected: true,
        } as typeof pipeline.mapperOutcomes[number]['result']
      },
    ],
  ] as const)('rejects a persisted pipeline with %s', async (_label, mutate) => {
    const text = 'Synthetic stable referral history. '.repeat(350)
    const artifacts = buildLongPacketIngestionArtifacts({
      packetId: 'packet-outcome-authority',
      documentId: 'document-1',
      text,
      singlePassCharacterLimit: 100,
    })
    const pipeline = structuredClone(await genuinePipeline(artifacts))
    mutate(pipeline)

    expect(() =>
      validatePersistedLongPacketArtifacts({
        text,
        sourcePages: artifacts.sourcePages,
        sourceSha256: artifacts.sourceSha256,
        packetPlan: artifacts.plan,
        packetEmergencyResult: artifacts.emergency,
        modelMapResult: pipeline.mapperCoverage,
        modelReduceResult: pipeline,
        safetyPromptVersions: LONG_PACKET_FULL_PIPELINE_DEFAULT_BINDINGS,
        extractedSummary: 'Synthetic stable referral summary.',
      }),
    ).toThrow('model')
  })

  it('rejects a persisted mapper aggregate that does not match recomputed outcomes', async () => {
    const text = 'Synthetic stable referral history. '.repeat(350)
    const artifacts = buildLongPacketIngestionArtifacts({
      packetId: 'packet-map-aggregate',
      documentId: 'document-1',
      text,
      singlePassCharacterLimit: 100,
    })
    const pipeline = await genuinePipeline(artifacts)

    expect(() =>
      validatePersistedLongPacketArtifacts({
        text,
        sourcePages: artifacts.sourcePages,
        sourceSha256: artifacts.sourceSha256,
        packetPlan: artifacts.plan,
        packetEmergencyResult: artifacts.emergency,
        modelMapResult: {
          ...pipeline.mapperCoverage,
          completedChunkCount: 0,
        },
        modelReduceResult: pipeline,
        safetyPromptVersions: LONG_PACKET_FULL_PIPELINE_DEFAULT_BINDINGS,
        extractedSummary: 'Synthetic stable referral summary.',
      }),
    ).toThrow('model')
  })

  it('rejects a sufficient undetermined chunk with no signal or critical unknown', async () => {
    const text = 'Synthetic stable referral history. '.repeat(350)
    const artifacts = buildLongPacketIngestionArtifacts({
      packetId: 'packet-undetermined-outcome',
      documentId: 'document-1',
      text,
      singlePassCharacterLimit: 100,
    })
    const pipeline = structuredClone(await genuinePipeline(artifacts))
    pipeline.safetyOutcomes[0].result = {
      carePathway: 'undetermined',
      dataQuality: 'sufficient',
      criticalUnknowns: [],
      signals: [],
    }

    expect(() =>
      validatePersistedLongPacketArtifacts({
        text,
        sourcePages: artifacts.sourcePages,
        sourceSha256: artifacts.sourceSha256,
        packetPlan: artifacts.plan,
        packetEmergencyResult: artifacts.emergency,
        modelMapResult: pipeline.mapperCoverage,
        modelReduceResult: pipeline,
        safetyPromptVersions: LONG_PACKET_FULL_PIPELINE_DEFAULT_BINDINGS,
        extractedSummary: 'Synthetic stable referral summary.',
      }),
    ).toThrow('model')
  })

  it('rejects a source digest that does not match immutable pages', () => {
    const text = 'Synthetic stable referral text with enough detail.'
    const artifacts = buildLongPacketIngestionArtifacts({
      packetId: 'packet-validate',
      documentId: 'document-1',
      text,
      singlePassCharacterLimit: 10,
    })

    expect(() =>
      validatePersistedLongPacketArtifacts({
        text,
        sourcePages: artifacts.sourcePages,
        sourceSha256: 'f'.repeat(64),
        packetPlan: artifacts.plan,
        packetEmergencyResult: artifacts.emergency,
        modelMapResult: completedPipeline().mapperCoverage,
        modelReduceResult: completedPipeline(),
        safetyPromptVersions: LONG_PACKET_FULL_PIPELINE_DEFAULT_BINDINGS,
        extractedSummary: 'Synthetic summary.',
      }),
    ).toThrow('digest')
  })

  it('rejects reversed persisted source-page order in the inner validator', async () => {
    const pages = [
      {
        pageNumber: 1,
        text: 'Synthetic first page stable referral detail. '.repeat(30),
        extractionMethod: 'native_text' as const,
        extractionConfidence: null,
      },
      {
        pageNumber: 2,
        text: 'Synthetic second page stable referral detail. '.repeat(30),
        extractionMethod: 'native_text' as const,
        extractionConfidence: null,
      },
    ]
    const text = pages.map((page) => page.text).join('\n\n')
    const artifacts = buildLongPacketIngestionArtifacts({
      packetId: 'packet-inner-page-order',
      documentId: 'document-1',
      text,
      pages,
      singlePassCharacterLimit: 100,
    })
    const pipeline = await genuinePipeline(artifacts)
    const reversedPages = [...artifacts.sourcePages].reverse()

    expect(() =>
      validatePersistedLongPacketArtifacts({
        text,
        sourcePages: reversedPages,
        sourceSha256: longPacketSourceDigest(
          artifacts.plan.packetId,
          reversedPages,
        ),
        packetPlan: artifacts.plan,
        packetEmergencyResult: artifacts.emergency,
        modelMapResult: pipeline.mapperCoverage,
        modelReduceResult: pipeline,
        safetyPromptVersions: LONG_PACKET_FULL_PIPELINE_DEFAULT_BINDINGS,
        extractedSummary: 'Synthetic stable referral summary.',
      }),
    ).toThrow(/page order/i)
  })
})
