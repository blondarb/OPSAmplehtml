import { describe, expect, it, vi } from 'vitest'

import {
  buildLongPacketIngestionArtifacts,
  longPacketPipelineToClinicalExtraction,
  longPacketSourceDigest,
} from '@/lib/triage/longPacketIngestion'
import {
  hashLongPacketEmergency,
  hashLongPacketPlan,
} from '@/lib/triage/longPacketCanonicalHash'
import {
  LONG_PACKET_EMERGENCY_VERSION,
  scanLongPacketEmergency,
} from '@/lib/triage/longPacketEmergency'
import { LONG_PACKET_CLINICAL_MAPPER_PROMPT_VERSION } from '@/lib/triage/longPacketClinicalMapper'
import {
  LONG_PACKET_MODEL_PIPELINE_VERSION,
  LONG_PACKET_NARRATIVE_REDUCER_MODEL,
  LONG_PACKET_NARRATIVE_REDUCER_PROMPT_VERSION,
  runLongPacketModelPipeline,
  type LongPacketModelPipelineResult,
} from '@/lib/triage/longPacketModelPipeline'
import {
  LONG_PACKET_PLANNER_VERSION,
  assertCompleteLongPacketCoverage,
  planLongPacketChunks,
  type LongPacketPlan,
  type LongPacketSourceDocument,
} from '@/lib/triage/longPacketPlanner'
import {
  validatePersistedSourceExtractionAuthority,
  validatePersistedSourceSafetyAuthority,
  type SourceExtractionAuthorityRow,
} from '@/lib/triage/sourceExtractionAuthority'
import { validateModelSafetyExtraction } from '@/lib/triage/modelSafetyExtraction'
import { MODEL_SAFETY_EXTRACTION_PROMPT_VERSION } from '@/lib/triage/modelSafetyExtractor'
import {
  LONG_PACKET_PARTIAL_SAFETY_DEFAULT_BINDINGS,
  mergeLongPacketPartialSafetyHold,
} from '@/lib/triage/longPacketPartialSafetyHold'

const ROUTINE_PAGE_ONE =
  'Synthetic referral page one documents stable chronic symptoms for authority validation.'
const ROUTINE_PAGE_TWO =
  'Synthetic referral page two documents unchanged function and routine outpatient follow-up.'
const EMERGENCY_PAGE =
  'Synthetic current update: sudden right facial droop and aphasia began 20 minutes ago.'
const SAME_DAY_PAGE =
  'Synthetic referral reports possible new aphasia, but onset and current status are unclear.'
const PARTIAL_HOLD_PROMPT_BINDINGS =
  LONG_PACKET_PARTIAL_SAFETY_DEFAULT_BINDINGS
const FULL_PIPELINE_PROMPT_BINDINGS = Object.freeze({
  planner: LONG_PACKET_PLANNER_VERSION,
  deterministicEmergency: LONG_PACKET_EMERGENCY_VERSION,
  clinicalMapper: LONG_PACKET_CLINICAL_MAPPER_PROMPT_VERSION,
  safetyExtractor: MODEL_SAFETY_EXTRACTION_PROMPT_VERSION,
  narrativeReducer: LONG_PACKET_NARRATIVE_REDUCER_PROMPT_VERSION,
  clinicalMapperModel:
    'us.anthropic.claude-haiku-4-5-20251001-v1:0',
  safetyExtractorModel: 'us.anthropic.claude-sonnet-5',
  narrativeReducerModel: LONG_PACKET_NARRATIVE_REDUCER_MODEL,
})

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

function authoritativeRow(input: {
  pageTexts?: string[]
  sourceFilename?: string | null
  ingestionMode?: 'single_pass' | 'long_packet'
} = {}): SourceExtractionAuthorityRow {
  const pageTexts = input.pageTexts ?? [ROUTINE_PAGE_ONE, ROUTINE_PAGE_TWO]
  const text = pageTexts.join('\n\n')
  const artifacts = buildLongPacketIngestionArtifacts({
    packetId: 'packet-authority-1',
    documentId: 'document-1',
    text,
    pages: pageTexts.map((pageText, index) => ({
      pageNumber: index + 1,
      text: pageText,
      extractionMethod: 'native_text',
      extractionConfidence: null,
    })),
    singlePassCharacterLimit:
      input.ingestionMode === 'long_packet' ? 50 : 50_000,
  })

  return {
    id: 'extraction-authority-1',
    status: 'complete',
    text_input: text,
    extracted_summary: 'Persisted synthetic extraction summary.',
    source_filename:
      input.sourceFilename === undefined ? null : input.sourceFilename,
    patient_age: 57,
    patient_sex: 'Female',
    extraction_confidence: 'high',
    note_type_detected: 'referral',
    ingestion_mode: artifacts.ingestionMode,
    coverage_status: 'complete',
    coverage_report: artifacts.plan.coverage,
    source_pages: artifacts.sourcePages,
    source_sha256: artifacts.sourceSha256,
    packet_plan: artifacts.plan,
    packet_emergency_result: artifacts.emergency,
    safety_prompt_versions: PARTIAL_HOLD_PROMPT_BINDINGS,
    model_reduce_result: null,
  }
}

async function authoritativeLongPacketRow(
  pageTexts: string[],
  modelPathway:
    | 'no_time_critical_signal'
    | 'emergency_now'
    | 'same_day_clinician_review' = 'no_time_critical_signal',
) {
  const row = authoritativeRow({
    pageTexts,
    sourceFilename: 'synthetic-packet.pdf',
    ingestionMode: 'long_packet',
  })
  const plan = row.packet_plan as LongPacketPlan
  const pipeline = await runLongPacketModelPipeline(plan, {
    mapChunk: async (chunk) => ({
      chunkId: chunk.id,
      chunkProvenanceSha256: chunk.provenanceSha256,
      sourceCharacterCount: chunk.text.length,
      coverageStatus: 'complete',
      facts: [],
      conflicts: [],
    }),
    extractSafety: async (chunk) => {
      const target = chunk.id === plan.chunks[0].id
      const quote = chunk.text.slice(0, Math.min(48, chunk.text.length))
      return validateModelSafetyExtraction(
        target && modelPathway === 'emergency_now'
          ? {
              care_pathway: 'emergency_now',
              data_quality: 'sufficient',
              critical_unknowns: [],
              signals: [
                {
                  code: 'model_only_emergency',
                  syndrome: 'other_time_critical',
                  assertion: 'present',
                  temporality: 'current',
                  experiencer: 'patient',
                  action: 'emergency_now',
                  evidence: [{ quote, occurrence_index: 0 }],
                },
              ],
            }
          : target && modelPathway === 'same_day_clinician_review'
            ? {
                care_pathway: 'same_day_clinician_review',
                data_quality: 'sufficient',
                critical_unknowns: [],
                signals: [
                  {
                    code: 'model_only_same_day',
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
    reduceNarrative: async (input) => ({
      narrative: 'Synthetic verified long-packet summary.',
      timelineNarrative: '',
      medicationNarrative: '',
      testNarrative: '',
      functionalNarrative: '',
      conflictNarrative: '',
      preservedSafetyEvidenceIds: input.requiredSafetyEvidenceIds,
    }),
  })
  row.model_map_result = pipeline.mapperCoverage
  row.model_reduce_result = pipeline
  row.safety_prompt_versions = FULL_PIPELINE_PROMPT_BINDINGS
  const clinical = longPacketPipelineToClinicalExtraction(pipeline)
  const deterministicSafetyLines = [
    ...new Set(
      scanLongPacketEmergency(plan).signals
        .filter((signal) => signal.assertion !== 'negated')
        .flatMap((signal) =>
          signal.evidence.map((evidence) => evidence.quote),
        )
        .filter(Boolean),
    ),
  ]
  row.extracted_summary =
    deterministicSafetyLines.length > 0
      ? `Complete-source safety evidence: ${deterministicSafetyLines.join(' / ')}\n\n${clinical.extractedSummary}`
      : clinical.extractedSummary
  row.key_findings = {
    ...clinical.keyFindings,
    red_flags_noted: [
      ...new Set([
        ...clinical.keyFindings.red_flags_noted,
        ...deterministicSafetyLines,
      ]),
    ],
  }
  row.note_type_detected = clinical.noteTypeDetected
  row.extraction_confidence = clinical.extractionConfidence
  return row
}

async function authoritativePartialSafetyHoldRow(
  modelPathway: 'emergency_now' | 'same_day_clinician_review',
) {
  const row = await authoritativeLongPacketRow(
    [ROUTINE_PAGE_ONE.repeat(700)],
    modelPathway,
  )
  const pipeline = row.model_reduce_result as LongPacketModelPipelineResult
  const outcome = pipeline.safetyOutcomes.find(
    (candidate) => candidate.result?.carePathway === modelPathway,
  )!
  row.status = 'error'
  row.model_map_result = null
  row.model_reduce_result = mergeLongPacketPartialSafetyHold({
    plan: row.packet_plan as LongPacketPlan,
    sourceSha256: row.source_sha256 as string,
    safetyPromptVersions: PARTIAL_HOLD_PROMPT_BINDINGS,
    existing: null,
    projection: {
      outcome,
      modelProfile: PARTIAL_HOLD_PROMPT_BINDINGS.safetyExtractorModel,
      promptVersion: PARTIAL_HOLD_PROMPT_BINDINGS.safetyExtractor,
      pipelineVersion: LONG_PACKET_MODEL_PIPELINE_VERSION,
    },
  })
  return row
}

async function authoritativeCrossChunkNarrativeFailureRow() {
  const row = authoritativeRow({
    pageTexts: [ROUTINE_PAGE_ONE.repeat(700)],
    sourceFilename: 'synthetic-cross-chunk.pdf',
    ingestionMode: 'long_packet',
  })
  const plan = row.packet_plan as LongPacketPlan
  const pipeline = await runLongPacketModelPipeline(plan, {
    mapChunk: async (chunk) => {
      const span = chunk.sourceSpans[0]
      const quote = chunk.text.slice(
        span.chunkStartOffset,
        Math.min(span.chunkEndOffset, span.chunkStartOffset + 48),
      )
      return {
        chunkId: chunk.id,
        chunkProvenanceSha256: chunk.provenanceSha256,
        sourceCharacterCount: chunk.text.length,
        coverageStatus: 'complete' as const,
        facts: [
          {
            category: 'medication' as const,
            key: 'current_topiramate_dose',
            statement: `Current topiramate dose is ${50 + chunk.chunkIndex * 25} mg twice daily.`,
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
        conflicts: [],
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
  row.status = 'error'
  row.model_map_result = pipeline.mapperCoverage
  row.model_reduce_result = pipeline
  row.safety_prompt_versions = FULL_PIPELINE_PROMPT_BINDINGS
  return row
}

function expectGovernedHold(
  row: SourceExtractionAuthorityRow,
  reason: string,
) {
  const decision = validatePersistedSourceExtractionAuthority(row)
  expect(decision).toMatchObject({
    ok: false,
    reason,
    outpatientScoringBlocked: true,
    humanReviewRequired: true,
  })
  return decision
}

describe('validatePersistedSourceExtractionAuthority', () => {
  it('recovers cross-chunk same-day authority when narrative reduction alone fails', async () => {
    const row = await authoritativeCrossChunkNarrativeFailureRow()
    const decision = validatePersistedSourceSafetyAuthority(row)

    expect(decision, JSON.stringify(decision)).toMatchObject({
      ok: true,
      authority: {
        longPacketSafety: {
          pipelineComplete: false,
          safetyResult: {
            carePathway: 'same_day_clinician_review',
            dataQuality: 'conflicting',
          },
        },
      },
    })
  })

  it('accepts a complete single-pass paste and returns only persisted authority', () => {
    const decision = validatePersistedSourceExtractionAuthority(
      authoritativeRow(),
    )

    expect(decision).toMatchObject({
      ok: true,
      authority: {
        rawText: `${ROUTINE_PAGE_ONE}\n\n${ROUTINE_PAGE_TWO}`,
        sourceType: 'paste',
        sourceFilename: undefined,
        extractedSummary: 'Persisted synthetic extraction summary.',
        patientAge: 57,
        patientSex: 'Female',
        extractionConfidence: 'high',
        noteTypeDetected: 'referral',
        ingestionMode: 'single_pass',
        coverageStatus: 'complete',
        deterministicGateway: {
          status: 'completed',
          carePathway: 'routine_outpatient',
        },
      },
    })
  })

  it('accepts an uppercase PDF filename for a complete single-pass source', () => {
    const decision = validatePersistedSourceExtractionAuthority(
      authoritativeRow({ sourceFilename: 'synthetic-referral.PDF' }),
    )

    expect(decision).toMatchObject({
      ok: true,
      authority: {
        sourceType: 'pdf',
        sourceFilename: 'synthetic-referral.PDF',
      },
    })
  })

  it('accepts a JSONB manifest whose object keys are returned in a different order', () => {
    const row = authoritativeRow()
    row.source_pages = (
      row.source_pages as Array<Record<string, unknown>>
    ).map((page) => ({
      text: page.text,
      extractionConfidence: page.extractionConfidence,
      pageNumber: page.pageNumber,
      extractionMethod: page.extractionMethod,
      documentId: page.documentId,
    }))

    expect(validatePersistedSourceExtractionAuthority(row)).toMatchObject({
      ok: true,
      authority: { sourceType: 'paste', coverageStatus: 'complete' },
    })
  })

  it('accepts a JSONB packet plan whose chunk and source-span keys are reordered', () => {
    const row = authoritativeRow()
    row.packet_plan = reverseObjectKeyOrder(row.packet_plan)

    expect(validatePersistedSourceExtractionAuthority(row)).toMatchObject({
      ok: true,
      authority: { coverageStatus: 'complete' },
    })
  })

  it.each([
    ['synthetic-referral.pdf', 'pdf'],
    ['synthetic-referral.DOCX', 'docx'],
    ['synthetic-referral.Txt', 'txt'],
  ] as const)('recognizes persisted %s as %s', (filename, sourceType) => {
    const decision = validatePersistedSourceExtractionAuthority(
      authoritativeRow({ sourceFilename: filename }),
    )

    expect(decision).toMatchObject({ ok: true, authority: { sourceType } })
  })

  it('accepts a genuine complete long-packet pipeline authority envelope', async () => {
    const decision = validatePersistedSourceExtractionAuthority(
      await authoritativeLongPacketRow([
        ROUTINE_PAGE_ONE.repeat(350),
        ROUTINE_PAGE_TWO.repeat(350),
      ]),
    )

    expect(decision).toMatchObject({
      ok: true,
      authority: {
        ingestionMode: 'long_packet',
        sourceType: 'pdf',
        coverageStatus: 'complete',
      },
    })
  })

  it.each([
    ['legacy placeholder', { legacy: 'unknown' }],
    [
      'drifted prompt version',
      {
        ...FULL_PIPELINE_PROMPT_BINDINGS,
        narrativeReducer: 'neurology-long-packet-narrative-reducer-v999',
      },
    ],
    [
      'unevaluated mapper model',
      {
        ...FULL_PIPELINE_PROMPT_BINDINGS,
        clinicalMapperModel: 'us.synthetic.unevaluated-model',
      },
    ],
    [
      'jointly relabeled evaluated models',
      {
        ...FULL_PIPELINE_PROMPT_BINDINGS,
        clinicalMapperModel: 'us.anthropic.claude-opus-4-7',
        safetyExtractorModel: 'us.anthropic.claude-opus-4-8',
      },
    ],
  ])('rejects a complete pipeline with %s provenance', async (_label, bindings) => {
    const row = await authoritativeLongPacketRow([
      ROUTINE_PAGE_ONE.repeat(700),
    ])
    row.safety_prompt_versions = bindings

    expect(validatePersistedSourceExtractionAuthority(row)).toMatchObject({
      ok: false,
      reason: 'source_extraction_packet_safety_invalid',
      immediateActionRequired: false,
      outpatientScoringBlocked: true,
    })
  })

  it('preserves only the independently recomputed emergency floor when complete-pipeline bindings are rejected', async () => {
    const row = await authoritativeLongPacketRow([
      `${ROUTINE_PAGE_ONE.repeat(700)} ${EMERGENCY_PAGE}`,
    ])
    row.safety_prompt_versions = { legacy: 'unknown' }

    expect(validatePersistedSourceExtractionAuthority(row)).toMatchObject({
      ok: false,
      reason: 'source_extraction_packet_safety_invalid',
      immediateActionRequired: true,
      safetyPathway: 'emergency_now',
      deterministicGateway: { carePathway: 'emergency_now' },
    })
  })

  it.each([
    [
      'summary',
      (row: SourceExtractionAuthorityRow) => {
        row.extracted_summary =
          'Stable chronic symptoms without acute change. This forged summary must never be scored.'
      },
    ],
    [
      'key findings',
      (row: SourceExtractionAuthorityRow) => {
        row.key_findings = {
          chief_complaint: 'Fabricated stable finding',
          neurological_symptoms: [],
          timeline: '',
          relevant_history: '',
          medications_and_therapies: [],
          failed_therapies: [],
          imaging_results: [],
          red_flags_noted: [],
          functional_status: '',
        }
      },
    ],
    [
      'note type',
      (row: SourceExtractionAuthorityRow) => {
        row.note_type_detected = 'referral'
      },
    ],
    [
      'confidence',
      (row: SourceExtractionAuthorityRow) => {
        row.extraction_confidence =
          row.extraction_confidence === 'low' ? 'high' : 'low'
      },
    ],
  ] as const)(
    'rejects a persisted long-packet %s that differs from the validated pipeline derivation',
    async (_label, mutate) => {
      const row = await authoritativeLongPacketRow([
        ROUTINE_PAGE_ONE.repeat(700),
      ])
      mutate(row)

      expect(validatePersistedSourceExtractionAuthority(row)).toMatchObject({
        ok: false,
        reason: 'source_extraction_metadata_invalid',
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
      })
    },
  )

  it('requires the deterministic emergency prefix and red-flag projection to match exactly', async () => {
    const row = await authoritativeLongPacketRow([
      `${ROUTINE_PAGE_ONE.repeat(700)} ${EMERGENCY_PAGE}`,
    ])
    expect(row.extracted_summary).toContain('Complete-source safety evidence:')

    row.extracted_summary = String(row.extracted_summary).replace(
      /^Complete-source safety evidence:[^\n]+\n\n/,
      '',
    )
    const findings = structuredClone(row.key_findings) as {
      red_flags_noted: string[]
    }
    findings.red_flags_noted = []
    row.key_findings = findings

    expect(validatePersistedSourceExtractionAuthority(row)).toMatchObject({
      ok: false,
      reason: 'source_extraction_metadata_invalid',
      safetyPathway: 'emergency_now',
      immediateActionRequired: true,
    })
  })

  it('blocks a long packet whose model pipeline outcomes are absent', () => {
    const row = authoritativeRow({
      pageTexts: [ROUTINE_PAGE_ONE.repeat(700)],
      sourceFilename: 'synthetic-packet.pdf',
      ingestionMode: 'long_packet',
    })

    expectGovernedHold(row, 'source_extraction_packet_safety_invalid')
  })

  it.each(['emergency_now', 'same_day_clinician_review'] as const)(
    'accepts a validated partial %s hold only as incomplete safety authority',
    async (modelPathway) => {
      const row = await authoritativePartialSafetyHoldRow(modelPathway)

      expect(validatePersistedSourceSafetyAuthority(row)).toMatchObject({
        ok: true,
        authority: {
          longPacketSafety: {
            pipelineComplete: false,
            safetyResult: {
              carePathway: modelPathway,
              dataQuality: expect.stringMatching(/^(partial|conflicting)$/),
            },
          },
        },
      })
      expect(validatePersistedSourceExtractionAuthority(row)).toMatchObject({
        ok: false,
        reason: 'source_extraction_not_complete',
        safetyPathway: modelPathway,
        immediateActionRequired: true,
        outpatientScoringBlocked: true,
      })

      row.status = 'complete'
      expect(validatePersistedSourceExtractionAuthority(row)).toMatchObject({
        ok: false,
        reason: 'source_extraction_packet_safety_invalid',
        safetyPathway: modelPathway,
      })
    },
  )

  it('never trusts a partial emergency hold with a mismatched source binding', async () => {
    const row = await authoritativePartialSafetyHoldRow('emergency_now')
    const hold = structuredClone(row.model_reduce_result) as Record<
      string,
      unknown
    >
    hold.sourceSha256 = 'f'.repeat(64)
    row.model_reduce_result = hold

    expect(validatePersistedSourceSafetyAuthority(row)).toMatchObject({
      ok: false,
      reason: 'source_extraction_packet_safety_invalid',
      immediateActionRequired: false,
    })
  })

  it('rejects jointly relabeled row and projection model provenance outside the immutable registry', async () => {
    const row = await authoritativePartialSafetyHoldRow('emergency_now')
    const hold = structuredClone(row.model_reduce_result) as Record<
      string,
      unknown
    >
    const projections = hold.projections as Array<Record<string, unknown>>
    projections[0].modelProfile = 'us.synthetic.unevaluated-model'
    row.safety_prompt_versions = {
      ...PARTIAL_HOLD_PROMPT_BINDINGS,
      safetyExtractorModel: 'us.synthetic.unevaluated-model',
    }
    row.model_reduce_result = hold

    expect(validatePersistedSourceSafetyAuthority(row)).toMatchObject({
      ok: false,
      reason: 'source_extraction_packet_safety_invalid',
    })
  })

  it.each([
    [
      'duplicates',
      (row: SourceExtractionAuthorityRow) => {
        const pages = structuredClone(row.source_pages) as Array<
          Record<string, unknown>
        >
        pages[1].pageNumber = 1
        row.source_pages = pages
      },
    ],
    [
      'gaps',
      (row: SourceExtractionAuthorityRow) => {
        const pages = structuredClone(row.source_pages) as Array<
          Record<string, unknown>
        >
        pages[1].pageNumber = 3
        row.source_pages = pages
      },
    ],
    [
      'reordered pages',
      (row: SourceExtractionAuthorityRow) => {
        row.source_pages = [
          ...(structuredClone(row.source_pages) as unknown[]),
        ].reverse()
      },
    ],
    [
      'reconstruction mismatch',
      (row: SourceExtractionAuthorityRow) => {
        row.text_input = `${ROUTINE_PAGE_TWO}\n\n${ROUTINE_PAGE_ONE}`
      },
    ],
  ] as const)('rejects a manifest with %s', (_label, mutate) => {
    const row = authoritativeRow()
    mutate(row)

    expectGovernedHold(row, 'source_extraction_manifest_invalid')
  })

  it('rejects a source digest that does not bind the manifest to the packet', () => {
    const row = authoritativeRow()
    row.source_sha256 = '0'.repeat(64)

    expectGovernedHold(row, 'source_extraction_digest_invalid')
  })

  it('preserves a recomputed emergency when the persisted source digest is rejected', () => {
    const row = authoritativeRow({ pageTexts: [EMERGENCY_PAGE] })
    row.source_sha256 = '0'.repeat(64)

    const decision = expectGovernedHold(
      row,
      'source_extraction_digest_invalid',
    )
    expect(decision).toMatchObject({
      safetyPathway: 'emergency_now',
      immediateActionRequired: true,
      deterministicGateway: { carePathway: 'emergency_now' },
    })
  })

  it('fails closed instead of throwing for a non-serializable manifest', () => {
    const row = authoritativeRow()
    const pages = row.source_pages as Array<Record<string, unknown>>
    pages[0].cyclic = pages[0]

    expect(() =>
      validatePersistedSourceExtractionAuthority(row),
    ).not.toThrow()
    expectGovernedHold(row, 'source_extraction_manifest_invalid')
  })

  it('rejects a packet plan that no longer covers its source manifest', () => {
    const row = authoritativeRow()
    const plan = structuredClone(row.packet_plan) as {
      chunks: Array<{ text: string }>
    }
    plan.chunks[0].text = 'tampered plan source window'
    row.packet_plan = plan

    expectGovernedHold(row, 'source_extraction_packet_plan_invalid')
  })

  it('preserves a trusted emergency when the persisted packet plan is tampered', () => {
    const row = authoritativeRow({ pageTexts: [EMERGENCY_PAGE] })
    const plan = structuredClone(row.packet_plan) as {
      chunks: Array<{ text: string }>
    }
    plan.chunks[0].text = 'tampered plan source window'
    row.packet_plan = plan

    const decision = expectGovernedHold(
      row,
      'source_extraction_packet_plan_invalid',
    )
    expect(decision).toMatchObject({
      immediateActionRequired: true,
      safetyPathway: 'emergency_now',
      deterministicGateway: { carePathway: 'emergency_now' },
    })
  })

  it('preserves a recomputed emergency when persisted packet id is missing', () => {
    const row = authoritativeRow({ pageTexts: [EMERGENCY_PAGE] })
    const plan = structuredClone(row.packet_plan) as Record<string, unknown>
    delete plan.packetId
    row.packet_plan = plan

    const decision = expectGovernedHold(
      row,
      'source_extraction_packet_plan_invalid',
    )
    expect(decision).toMatchObject({
      immediateActionRequired: true,
      safetyPathway: 'emergency_now',
      deterministicGateway: { carePathway: 'emergency_now' },
    })
  })

  it('preserves positive signals from a failed long-packet gateway result', () => {
    const row = authoritativeRow({ pageTexts: [EMERGENCY_PAGE] })
    const positive = scanLongPacketEmergency(row.packet_plan as LongPacketPlan)
    const decision = validatePersistedSourceExtractionAuthority(row, {
      planLongPacketChunks,
      scanLongPacketEmergency: vi.fn(() => ({
        ...positive,
        status: 'failed' as const,
        failureCode: 'chunk_gateway_failed' as const,
      })),
      hashLongPacketPlan,
      hashLongPacketEmergency,
      longPacketSourceDigest,
      assertCompleteLongPacketCoverage,
    })

    expect(decision).toMatchObject({
      ok: false,
      reason: 'source_extraction_packet_plan_invalid',
      immediateActionRequired: true,
      safetyPathway: 'emergency_now',
      deterministicGateway: {
        status: 'failed',
        carePathway: 'emergency_now',
        signals: expect.arrayContaining([
          expect.objectContaining({ action: 'emergency_now' }),
        ]),
      },
    })
  })

  it.each(['planner', 'scanner'] as const)(
    'uses a positive-only raw emergency fallback when the %s throws',
    (failurePoint) => {
      const row = authoritativeRow({ pageTexts: [EMERGENCY_PAGE] })
      const decision = validatePersistedSourceExtractionAuthority(row, {
        planLongPacketChunks:
          failurePoint === 'planner'
            ? vi.fn(() => {
                throw new Error('synthetic planner failure')
              })
            : planLongPacketChunks,
        scanLongPacketEmergency:
          failurePoint === 'scanner'
            ? vi.fn(() => {
                throw new Error('synthetic scanner failure')
              })
            : scanLongPacketEmergency,
        hashLongPacketPlan,
        hashLongPacketEmergency,
        longPacketSourceDigest,
        assertCompleteLongPacketCoverage,
      })

      expect(decision).toMatchObject({
        ok: false,
        reason: 'source_extraction_packet_plan_invalid',
        immediateActionRequired: true,
        safetyPathway: 'emergency_now',
        deterministicGateway: {
          carePathway: 'emergency_now',
          signals: expect.arrayContaining([
            expect.objectContaining({
              evidence: expect.arrayContaining([
                expect.objectContaining({
                  documentId: null,
                  pageNumber: null,
                }),
              ]),
            }),
          ]),
        },
      })
    },
  )

  it('rejects oversized persisted text before planning, hashing, or scanning', () => {
    const oversizedText = 'x'.repeat(5_250_000)
    const row = authoritativeRow()
    row.text_input = oversizedText
    row.source_pages = [
      {
        documentId: 'document-1',
        pageNumber: 1,
        text: oversizedText,
        extractionMethod: 'native_text',
        extractionConfidence: null,
      },
    ]
    const expensive = {
      planLongPacketChunks: vi.fn(),
      scanLongPacketEmergency: vi.fn(),
      hashLongPacketPlan: vi.fn(),
      hashLongPacketEmergency: vi.fn(),
      longPacketSourceDigest: vi.fn(),
      assertCompleteLongPacketCoverage: vi.fn(),
    }
    const validateWithDependencies =
      validatePersistedSourceExtractionAuthority as unknown as (
        value: unknown,
        dependencies: typeof expensive,
      ) => ReturnType<typeof validatePersistedSourceExtractionAuthority>

    expect(validateWithDependencies(row, expensive)).toMatchObject({
      ok: false,
      reason: 'source_extraction_size_limit_exceeded',
      outpatientScoringBlocked: true,
      humanReviewRequired: true,
    })
    expect(Object.values(expensive).every((spy) => spy.mock.calls.length === 0)).toBe(
      true,
    )
  })

  it('runs the positive-only bounded raw gateway before rejecting oversized source-page metadata', () => {
    const row = authoritativeRow({ pageTexts: [EMERGENCY_PAGE] })
    row.source_pages = 'x'.repeat(10 * 1024 * 1024 + 1)

    expect(validatePersistedSourceExtractionAuthority(row)).toMatchObject({
      ok: false,
      reason: 'source_extraction_size_limit_exceeded',
      immediateActionRequired: true,
      safetyPathway: 'emergency_now',
      deterministicGateway: {
        carePathway: 'emergency_now',
        signals: [
          {
            evidence: [
              {
                packetId: null,
                documentId: null,
                pageNumber: null,
              },
            ],
          },
        ],
      },
    })
  })

  it.each(['model_map_result', 'model_reduce_result'] as const)(
    'recomputes emergency safety before rejecting oversized %s',
    (field) => {
      const row = authoritativeRow({ pageTexts: [EMERGENCY_PAGE] })
      row[field] = 'x'.repeat(10 * 1024 * 1024 + 1)

      expect(validatePersistedSourceExtractionAuthority(row)).toMatchObject({
        ok: false,
        reason: 'source_extraction_size_limit_exceeded',
        immediateActionRequired: true,
        safetyPathway: 'emergency_now',
        deterministicGateway: { carePathway: 'emergency_now' },
      })
    },
  )

  it('recomputes emergency safety before rejecting oversized full-pipeline provenance', () => {
    const row = authoritativeRow({ pageTexts: [EMERGENCY_PAGE] })
    row.safety_prompt_versions = 'x'.repeat(10 * 1024 * 1024 + 1)

    expect(validatePersistedSourceExtractionAuthority(row)).toMatchObject({
      ok: false,
      reason: 'source_extraction_size_limit_exceeded',
      immediateActionRequired: true,
      safetyPathway: 'emergency_now',
      deterministicGateway: { carePathway: 'emergency_now' },
    })
  })

  it.each(['coverage_report', 'packet_emergency_result'] as const)(
    'recomputes emergency safety before rejecting oversized auxiliary %s',
    (field) => {
      const row = authoritativeRow({ pageTexts: [EMERGENCY_PAGE] })
      row[field] = 'x'.repeat(10 * 1024 * 1024 + 1)

      expect(validatePersistedSourceExtractionAuthority(row)).toMatchObject({
        ok: false,
        reason: 'source_extraction_size_limit_exceeded',
        immediateActionRequired: true,
        safetyPathway: 'emergency_now',
        deterministicGateway: { carePathway: 'emergency_now' },
      })
    },
  )

  it('recomputes emergency safety before rejecting oversized non-source filename metadata', () => {
    const row = authoritativeRow({ pageTexts: [EMERGENCY_PAGE] })
    row.source_filename = 'x'.repeat(10 * 1024 * 1024 + 1)

    expect(validatePersistedSourceExtractionAuthority(row)).toMatchObject({
      ok: false,
      reason: 'source_extraction_source_type_invalid',
      immediateActionRequired: true,
      safetyPathway: 'emergency_now',
      deterministicGateway: { carePathway: 'emergency_now' },
    })
  })

  it('recomputes same-day safety before rejecting a model artifact with excessive structure', () => {
    const row = authoritativeRow({ pageTexts: [SAME_DAY_PAGE] })
    row.model_reduce_result = JSON.stringify({
      mapperOutcomes: Array.from({ length: 250_001 }, () => 0),
    })

    expect(validatePersistedSourceExtractionAuthority(row)).toMatchObject({
      ok: false,
      reason: 'source_extraction_size_limit_exceeded',
      immediateActionRequired: true,
      safetyPathway: 'same_day_clinician_review',
      deterministicGateway: {
        carePathway: 'same_day_clinician_review',
      },
    })
  })

  it('recomputes same-day safety before rejecting malformed serialized model JSON', () => {
    const row = authoritativeRow({ pageTexts: [SAME_DAY_PAGE] })
    row.model_reduce_result = '{"safetyOutcomes":'

    expect(validatePersistedSourceExtractionAuthority(row)).toMatchObject({
      ok: false,
      reason: 'source_extraction_packet_safety_invalid',
      immediateActionRequired: true,
      safetyPathway: 'same_day_clinician_review',
      deterministicGateway: {
        carePathway: 'same_day_clinician_review',
      },
    })
  })

  it('rejects a non-null canonical packet-plan digest mismatch', () => {
    const row = authoritativeRow()
    expect(hashLongPacketPlan(row.packet_plan)).not.toBe('0'.repeat(64))
    row.packet_plan_sha256 = '0'.repeat(64)

    expectGovernedHold(row, 'source_extraction_packet_plan_invalid')
  })

  it('accepts a null packet-plan digest only when the persisted plan is the deterministic default rebuild', () => {
    const row = authoritativeRow()
    row.packet_plan_sha256 = null

    expect(validatePersistedSourceExtractionAuthority(row)).toMatchObject({
      ok: true,
      authority: { ingestionMode: 'single_pass' },
    })
  })

  it('rejects an internally complete non-default plan when its optional digest is null', () => {
    const row = authoritativeRow()
    const persistedPlan = row.packet_plan as LongPacketPlan
    const sourcePages = row.source_pages as Array<{
      documentId: string
      pageNumber: number
      text: string
      extractionMethod: 'native_text' | 'ocr'
      extractionConfidence: number | null
    }>
    const documents: LongPacketSourceDocument[] = [
      {
        packetId: persistedPlan.packetId,
        expectedDocumentCount: 1,
        documentId: sourcePages[0].documentId,
        documentOrder: 1,
        expectedPageCount: sourcePages.length,
        pages: sourcePages.map((page) => ({
          pageNumber: page.pageNumber,
          text: page.text,
          extractionMethod: page.extractionMethod,
          extractionConfidence: page.extractionConfidence,
        })),
      },
    ]
    const alternatePlan = planLongPacketChunks(documents, {
      maxChunkCharacters: 100,
      overlapCharacters: 20,
    })
    row.packet_plan = alternatePlan
    row.packet_plan_sha256 = null
    row.coverage_report = alternatePlan.coverage
    row.packet_emergency_result = scanLongPacketEmergency(alternatePlan)

    expectGovernedHold(row, 'source_extraction_packet_plan_invalid')
  })

  it('rejects a long packet relabeled as single-pass while retaining its emergency action', () => {
    const longEmergencyText = [
      'Synthetic stable packet background. '.repeat(1_600),
      EMERGENCY_PAGE,
    ].join('')
    const row = authoritativeRow({
      pageTexts: [longEmergencyText],
      sourceFilename: 'synthetic-long-packet.pdf',
      ingestionMode: 'long_packet',
    })
    row.ingestion_mode = 'single_pass'

    const decision = expectGovernedHold(
      row,
      'source_extraction_ingestion_mode_invalid',
    )
    expect(decision).toMatchObject({
      safetyPathway: 'emergency_now',
      immediateActionRequired: true,
    })
  })

  it('rejects a coverage report that does not reconcile with the plan and pages', () => {
    const row = authoritativeRow()
    row.coverage_report = {
      ...(row.coverage_report as Record<string, unknown>),
      pageCount: 99,
    }

    expectGovernedHold(row, 'source_extraction_packet_plan_invalid')
  })

  it.each(['partial', 'legacy_unknown', undefined] as const)(
    'blocks outpatient scoring for %s coverage',
    (coverageStatus) => {
      const row = authoritativeRow({ pageTexts: [EMERGENCY_PAGE] })
      if (coverageStatus === undefined) delete row.coverage_status
      else row.coverage_status = coverageStatus

      const decision = expectGovernedHold(
        row,
        'source_extraction_coverage_incomplete',
      )
      expect(decision).toMatchObject({
        immediateActionRequired: true,
        safetyPathway: 'emergency_now',
      })
    },
  )

  it.each(['pending', 'error'] as const)(
    'blocks outpatient scoring when source status is %s while preserving recomputed same-day action',
    (status) => {
      const row = authoritativeRow({ pageTexts: [SAME_DAY_PAGE] })
      row.status = status

      const decision = expectGovernedHold(
        row,
        'source_extraction_not_complete',
      )
      expect(decision).toMatchObject({
        immediateActionRequired: true,
        safetyPathway: 'same_day_clinician_review',
      })
    },
  )

  it.each([
    ['emergency_now', 'emergency_now'],
    ['same_day_clinician_review', 'same_day_clinician_review'],
  ] as const)(
    'retains verified model-only %s through every later recoverable authority hold',
    async (modelPathway, expectedPathway) => {
      const base = await authoritativeLongPacketRow(
        [ROUTINE_PAGE_ONE.repeat(700)],
        modelPathway,
      )
      expect(base.packet_emergency_result).toMatchObject({
        carePathway: 'routine_outpatient',
      })

      const cases: Array<{
        label: string
        reason: string
        mutate: (row: SourceExtractionAuthorityRow) => void
      }> = [
        {
          label: 'source digest mismatch',
          reason: 'source_extraction_digest_invalid',
          mutate: (row) => {
            row.source_sha256 = '0'.repeat(64)
          },
        },
        {
          label: 'stored plan mismatch',
          reason: 'source_extraction_packet_plan_invalid',
          mutate: (row) => {
            const plan = structuredClone(row.packet_plan) as LongPacketPlan
            plan.coverage = {
              ...plan.coverage,
              chunkCount: plan.coverage.chunkCount + 1,
            }
            row.packet_plan = plan
          },
        },
        {
          label: 'stored plan source-window mismatch',
          reason: 'source_extraction_packet_plan_invalid',
          mutate: (row) => {
            const plan = structuredClone(row.packet_plan) as LongPacketPlan
            plan.chunks[0].text = 'tampered persisted source window'
            row.packet_plan = plan
          },
        },
        {
          label: 'stored plan digest mismatch',
          reason: 'source_extraction_packet_plan_invalid',
          mutate: (row) => {
            row.packet_plan_sha256 = '0'.repeat(64)
          },
        },
        {
          label: 'coverage report mismatch',
          reason: 'source_extraction_packet_plan_invalid',
          mutate: (row) => {
            const coverage = structuredClone(row.coverage_report) as {
              chunkCount: number
            }
            coverage.chunkCount += 1
            row.coverage_report = coverage
          },
        },
        {
          label: 'persisted deterministic safety mismatch',
          reason: 'source_extraction_packet_safety_invalid',
          mutate: (row) => {
            row.packet_emergency_result = {
              status: 'completed',
              carePathway: 'emergency_now',
            }
          },
        },
        {
          label: 'ingestion label mismatch',
          reason: 'source_extraction_ingestion_mode_invalid',
          mutate: (row) => {
            row.ingestion_mode = 'single_pass'
          },
        },
        {
          label: 'incomplete status',
          reason: 'source_extraction_not_complete',
          mutate: (row) => {
            row.status = 'error'
          },
        },
        {
          label: 'coverage column hold',
          reason: 'source_extraction_coverage_incomplete',
          mutate: (row) => {
            row.coverage_status = 'partial'
          },
        },
        {
          label: 'metadata hold',
          reason: 'source_extraction_metadata_invalid',
          mutate: (row) => {
            row.patient_age = 999
          },
        },
        {
          label: 'source type hold',
          reason: 'source_extraction_source_type_invalid',
          mutate: (row) => {
            row.source_filename = 'synthetic-packet.csv'
          },
        },
        {
          label: 'overlong source filename hold',
          reason: 'source_extraction_source_type_invalid',
          mutate: (row) => {
            row.source_filename = `${'x'.repeat(201)}.pdf`
          },
        },
      ]

      for (const testCase of cases) {
        const row = structuredClone(base)
        testCase.mutate(row)
        const decision = validatePersistedSourceExtractionAuthority(row)
        expect(decision, testCase.label).toMatchObject({
          ok: false,
          reason: testCase.reason,
          outpatientScoringBlocked: true,
          humanReviewRequired: true,
          immediateActionRequired: true,
          safetyPathway: expectedPathway,
        })
      }
    },
  )

  it.each([
    [
      'missing packet id',
      (row: SourceExtractionAuthorityRow) => {
        const plan = structuredClone(row.packet_plan) as Record<string, unknown>
        delete plan.packetId
        row.packet_plan = plan
      },
      'source_extraction_packet_plan_invalid',
    ],
    [
      'reordered source manifest',
      (row: SourceExtractionAuthorityRow) => {
        row.source_pages = [
          ...(structuredClone(row.source_pages) as unknown[]),
        ].reverse()
      },
      'source_extraction_manifest_invalid',
    ],
  ] as const)(
    'does not claim model-only emergency safety with the hard prerequisite %s',
    async (_label, mutate, reason) => {
      const row = await authoritativeLongPacketRow(
        [ROUTINE_PAGE_ONE.repeat(350), ROUTINE_PAGE_TWO.repeat(350)],
        'emergency_now',
      )
      mutate(row)

      const decision = expectGovernedHold(row, reason)
      expect(decision).toMatchObject({ immediateActionRequired: false })
      expect(decision).not.toHaveProperty('safetyPathway')
    },
  )

  it('does not claim model safety from a provenance-invalid outcome behind a digest hold', async () => {
    const row = await authoritativeLongPacketRow(
      [ROUTINE_PAGE_ONE.repeat(700)],
      'emergency_now',
    )
    row.source_sha256 = '0'.repeat(64)
    const pipeline = structuredClone(
      row.model_reduce_result,
    ) as LongPacketModelPipelineResult
    pipeline.safetyOutcomes[0] = {
      ...pipeline.safetyOutcomes[0],
      chunkProvenanceSha256: 'f'.repeat(64),
    }
    row.model_reduce_result = pipeline

    const decision = expectGovernedHold(
      row,
      'source_extraction_digest_invalid',
    )
    expect(decision).toMatchObject({ immediateActionRequired: false })
    expect(decision).not.toHaveProperty('safetyPathway')
  })

  it('retains a provenance-valid safety branch when terminal mapper state is unavailable', async () => {
    const row = await authoritativeLongPacketRow(
      [ROUTINE_PAGE_ONE.repeat(700)],
      'emergency_now',
    )
    row.status = 'error'
    row.model_map_result = null

    const decision = expectGovernedHold(
      row,
      'source_extraction_not_complete',
    )
    expect(decision).toMatchObject({
      immediateActionRequired: true,
      safetyPathway: 'emergency_now',
    })
  })

  it.each([
    [
      'status failure',
      'source_extraction_not_complete',
      (row: SourceExtractionAuthorityRow) => {
        row.status = 'error'
      },
    ],
    [
      'metadata failure',
      'source_extraction_metadata_invalid',
      (row: SourceExtractionAuthorityRow) => {
        row.patient_age = 999
      },
    ],
  ] as const)(
    'preserves a validated model-only emergency through a later %s',
    async (_label, reason, mutate) => {
      const row = await authoritativeLongPacketRow(
        [ROUTINE_PAGE_ONE.repeat(700)],
        'emergency_now',
      )
      mutate(row)

      const decision = expectGovernedHold(row, reason)
      expect(decision).toMatchObject({
        immediateActionRequired: true,
        safetyPathway: 'emergency_now',
      })
    },
  )

  it.each([
    ['unknown extension', 'synthetic-referral.csv'],
    ['no extension', 'synthetic-referral'],
    ['blank', '  \t\n  '],
    ['non-string', 42],
  ] as const)('rejects a persisted filename with %s', (_label, filename) => {
    const row = authoritativeRow()
    row.source_filename = filename

    expectGovernedHold(row, 'source_extraction_source_type_invalid')
  })

  it('rejects an oversized persisted summary before it can enter adjudication or scoring', () => {
    const row = authoritativeRow()
    row.extracted_summary = 'x'.repeat(50_001)

    expectGovernedHold(row, 'source_extraction_metadata_invalid')
  })

  it('rejects a malformed persisted packet safety result without erasing the independently recomputed emergency', () => {
    const row = authoritativeRow({ pageTexts: [EMERGENCY_PAGE] })
    row.packet_emergency_result = {
      status: 'completed',
      carePathway: 'routine_outpatient',
    }

    const decision = expectGovernedHold(
      row,
      'source_extraction_packet_safety_invalid',
    )
    expect(decision).toMatchObject({
      immediateActionRequired: true,
      safetyPathway: 'emergency_now',
      deterministicGateway: {
        status: 'completed',
        carePathway: 'emergency_now',
      },
    })
  })

  it('preserves a positive raw-text emergency with explicitly unlocated evidence when the manifest is invalid', () => {
    const row = authoritativeRow({ pageTexts: [EMERGENCY_PAGE] })
    row.source_pages = []

    const decision = expectGovernedHold(
      row,
      'source_extraction_manifest_invalid',
    )
    expect(decision).toMatchObject({
      immediateActionRequired: true,
      safetyPathway: 'emergency_now',
      deterministicGateway: {
        carePathway: 'emergency_now',
        signals: [
          {
            evidence: [
              {
                packetId: null,
                documentId: null,
                pageNumber: null,
                quote: expect.stringContaining('sudden right facial droop'),
              },
            ],
          },
        ],
      },
    })
  })

  it('preserves a positive raw-text same-day signal before rejecting a reconstruction-mismatched manifest', () => {
    const row = authoritativeRow({ pageTexts: [SAME_DAY_PAGE] })
    const pages = structuredClone(row.source_pages) as Array<
      Record<string, unknown>
    >
    pages[0].text = ROUTINE_PAGE_ONE
    row.source_pages = pages

    expect(validatePersistedSourceExtractionAuthority(row)).toMatchObject({
      ok: false,
      reason: 'source_extraction_manifest_invalid',
      immediateActionRequired: true,
      safetyPathway: 'same_day_clinician_review',
      deterministicGateway: {
        carePathway: 'same_day_clinician_review',
        signals: [
          {
            evidence: [
              {
                packetId: null,
                documentId: null,
                pageNumber: null,
              },
            ],
          },
        ],
      },
    })
  })

  it('never treats a negative raw-text preflight as authority to clear an invalid manifest', () => {
    const row = authoritativeRow({ pageTexts: [ROUTINE_PAGE_ONE] })
    row.source_pages = []

    const decision = expectGovernedHold(
      row,
      'source_extraction_manifest_invalid',
    )
    expect(decision).toMatchObject({ immediateActionRequired: false })
    expect(decision).not.toHaveProperty('safetyPathway')
    expect(decision).not.toHaveProperty('deterministicGateway')
  })
})
