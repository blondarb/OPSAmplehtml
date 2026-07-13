import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildLongPacketIngestionArtifacts,
  LONG_PACKET_FULL_PIPELINE_DEFAULT_BINDINGS,
  longPacketPipelineToPersistedClinicalExtraction,
} from '@/lib/triage/longPacketIngestion'
import { runLongPacketModelPipeline } from '@/lib/triage/longPacketModelPipeline'
import { validateModelSafetyExtraction } from '@/lib/triage/modelSafetyExtraction'
import {
  LONG_PACKET_PARTIAL_SAFETY_DEFAULT_BINDINGS,
  mergeLongPacketPartialSafetyHold,
} from '@/lib/triage/longPacketPartialSafetyHold'
import {
  MODEL_SAFETY_EVIDENCE_PERSISTENCE_FAILED_REASON,
  longPacketSafetyPersistenceFailureMessage,
} from '@/lib/triage/longPacketSafetyPersistenceFailure'
import { runEmergencyGateway } from '@/lib/triage/emergencyGateway'
import { screenPartialPdfEmergencyGateway } from '@/lib/triage/partialPdfSafetyAuthority'

const PARTIAL_HOLD_PROMPT_BINDINGS =
  LONG_PACKET_PARTIAL_SAFETY_DEFAULT_BINDINGS

const {
  authorizeMock,
  fromMock,
  selectMock,
  eqMock,
  singleMock,
  workflowEqMock,
  workflowSingleMock,
  getPoolMock,
  readProgressMock,
  validateAuthorityMock,
} = vi.hoisted(
  () => ({
    authorizeMock: vi.fn(),
    fromMock: vi.fn(),
    selectMock: vi.fn(),
    eqMock: vi.fn(),
    singleMock: vi.fn(),
    workflowEqMock: vi.fn(),
    workflowSingleMock: vi.fn(),
    getPoolMock: vi.fn(),
    readProgressMock: vi.fn(),
    validateAuthorityMock: vi.fn(),
  }),
)

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
}))
vi.mock('@/lib/db-query', () => ({ from: fromMock }))
vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))
vi.mock('@/lib/triage/longPacketProgressRead', () => ({
  readLongPacketProgress: readProgressMock,
}))
vi.mock('@/lib/triage/sourceExtractionAuthority', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/lib/triage/sourceExtractionAuthority')
  >()
  return {
    ...actual,
    validatePersistedSourceSafetyAuthority: (...args: Parameters<
      typeof actual.validatePersistedSourceSafetyAuthority
    >) => {
      validateAuthorityMock(...args)
      return actual.validatePersistedSourceSafetyAuthority(...args)
    },
  }
})

import { GET } from '../route'

function callGet() {
  return GET(new Request('http://localhost/api/triage/extract/extraction-1'), {
    params: Promise.resolve({ id: 'extraction-1' }),
  })
}

async function authoritativeLongPacketRow(input: {
  status: 'complete' | 'error'
  deterministicEmergency?: boolean
  modelPathway?:
    | 'routine_outpatient'
    | 'emergency_now'
    | 'same_day_clinician_review'
}) {
  const text = input.deterministicEmergency
    ? `${'Synthetic stable packet detail. '.repeat(1_600)}Sudden aphasia and right facial droop began 20 minutes ago.`
    : 'Synthetic stable chronic packet detail. '.repeat(1_600)
  const artifacts = buildLongPacketIngestionArtifacts({
    packetId: 'packet-poll-authority',
    documentId: 'document-1',
    text,
    singlePassCharacterLimit: 50_000,
  })
  const targetChunkId = artifacts.plan.chunks[0].id
  const modelPathway = input.modelPathway ?? 'routine_outpatient'
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
      const target = chunk.id === targetChunkId
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
    reduceNarrative: async (reduction) => ({
      narrative: 'Synthetic verified packet narrative.',
      timelineNarrative: '',
      medicationNarrative: '',
      testNarrative: '',
      functionalNarrative: '',
      conflictNarrative: '',
      preservedSafetyEvidenceIds: reduction.requiredSafetyEvidenceIds,
    }),
  })
  const clinical = longPacketPipelineToPersistedClinicalExtraction({
    pipeline,
    deterministicGateway: artifacts.emergency,
  })
  return {
    id: 'extraction-1',
    status: input.status,
    error_message:
      input.status === 'error' ? 'Synthetic terminal extraction failure.' : null,
    text_input: text,
    source_filename: 'packet.pdf',
    note_type_detected: clinical.noteTypeDetected,
    extraction_confidence: clinical.extractionConfidence,
    extracted_summary: clinical.extractedSummary,
    key_findings: clinical.keyFindings,
    original_text_length: text.length,
    ingestion_mode: 'long_packet',
    coverage_status: 'complete',
    coverage_report: artifacts.plan.coverage,
    source_pages: artifacts.sourcePages,
    source_sha256: artifacts.sourceSha256,
    packet_plan: artifacts.plan,
    packet_plan_sha256: null,
    packet_emergency_result: artifacts.emergency,
    safety_prompt_versions: LONG_PACKET_FULL_PIPELINE_DEFAULT_BINDINGS,
    model_map_result: pipeline.mapperCoverage,
    model_reduce_result: pipeline,
  }
}

async function authoritativePartialHoldRow(
  modelPathway: 'emergency_now' | 'same_day_clinician_review',
  input: {
    mode?: 'safety_checkpoint' | 'workflow_persistence_failed'
    status?: 'pending' | 'error'
  } = {},
) {
  const baseRow = await authoritativeLongPacketRow({
    status: 'error',
    modelPathway,
  })
  const row = {
    ...baseRow,
    status: (input.status ?? 'error') as 'pending' | 'error' | 'complete',
  }
  const pipeline = row.model_reduce_result
  const outcome = pipeline.safetyOutcomes.find(
    (candidate) => candidate.result?.carePathway === modelPathway,
  )!
  row.model_map_result = null as never
  row.model_reduce_result = mergeLongPacketPartialSafetyHold({
    plan: row.packet_plan,
    sourceSha256: row.source_sha256,
    safetyPromptVersions: PARTIAL_HOLD_PROMPT_BINDINGS,
    existing: null,
    mode: input.mode,
    projection: {
      outcome,
      modelProfile: PARTIAL_HOLD_PROMPT_BINDINGS.safetyExtractorModel,
      promptVersion: PARTIAL_HOLD_PROMPT_BINDINGS.safetyExtractor,
      pipelineVersion: 'neurology-long-packet-model-pipeline-v1',
    },
  }) as never
  return row
}

async function authoritativeCrossChunkNarrativeFailureRow() {
  const row = await authoritativeLongPacketRow({ status: 'error' })
  const pipeline = await runLongPacketModelPipeline(row.packet_plan, {
    mapChunk: async (chunk) => {
      const span = chunk.sourceSpans[0]
      const quote = chunk.text.slice(
        span.chunkStartOffset,
        Math.min(span.chunkEndOffset, span.chunkStartOffset + 40),
      )
      return {
        chunkId: chunk.id,
        chunkProvenanceSha256: chunk.provenanceSha256,
        sourceCharacterCount: chunk.text.length,
        coverageStatus: 'complete' as const,
        facts: [
          {
            category: 'medication' as const,
            key: 'current_valproate_dose',
            statement: `Current valproate dose is ${500 + chunk.chunkIndex * 250} mg twice daily.`,
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
  row.note_type_detected = null as never
  row.extraction_confidence = null as never
  row.extracted_summary = null as never
  row.key_findings = null as never
  row.model_map_result = pipeline.mapperCoverage
  row.model_reduce_result = pipeline
  return row
}

async function authoritativeMapperPartialHoldRow() {
  const row = await authoritativeLongPacketRow({ status: 'error' })
  const pipeline = row.model_reduce_result
  const outcome = structuredClone(pipeline.mapperOutcomes[0])
  const chunk = row.packet_plan.chunks.find(
    (candidate) => candidate.id === outcome.chunkId,
  )!
  const span = chunk.sourceSpans[0]
  const quote = chunk.text.slice(
    span.chunkStartOffset,
    span.chunkStartOffset + 40,
  )
  outcome.result!.facts = [
    {
      category: 'red_flag',
      key: 'mapper_poll_red_flag',
      statement: 'Validated current mapper red flag.',
      assertion: 'present',
      temporality: 'current',
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
  ]
  row.model_map_result = null as never
  row.model_reduce_result = mergeLongPacketPartialSafetyHold({
    plan: row.packet_plan,
    sourceSha256: row.source_sha256,
    safetyPromptVersions: PARTIAL_HOLD_PROMPT_BINDINGS,
    existing: null,
    projection: {
      outcome,
      modelProfile: PARTIAL_HOLD_PROMPT_BINDINGS.clinicalMapperModel,
      promptVersion: PARTIAL_HOLD_PROMPT_BINDINGS.clinicalMapper,
      pipelineVersion: 'neurology-long-packet-model-pipeline-v1',
    },
  }) as never
  return row
}

function partialPdfOcrRow(input: {
  pages: Array<{ pageNumber: number; text: string }>
  missingPageNumbers: number[]
  packetEmergencyResult?: ReturnType<typeof runEmergencyGateway> | null
}) {
  const totalPageCount = input.pages.length + input.missingPageNumbers.length
  const sourcePages = input.pages.map((page) => ({
    documentId: 'document-1',
    pageNumber: page.pageNumber,
    text: page.text,
    extractionMethod: 'native_text' as const,
    extractionConfidence: null,
  }))
  const text = sourcePages.map((page) => page.text).join('\n\n')
  return {
    id: 'extraction-1',
    status: 'error',
    error_message:
      `Native text could not be extracted from PDF pages ${input.missingPageNumbers.join(', ')}. OCR is required.`,
    text_input: text,
    source_filename: 'partial-referral.pdf',
    patient_age: null,
    patient_sex: null,
    original_text_length: text.length,
    ingestion_mode: 'legacy_unknown',
    source_pages: sourcePages,
    source_sha256: null,
    packet_plan: null,
    packet_plan_sha256: null,
    coverage_status: 'failed',
    coverage_report: {
      status: 'failed',
      reason: 'ocr_required',
      totalPageCount,
      availablePageNumbers: sourcePages.map((page) => page.pageNumber),
      missingPageNumbers: input.missingPageNumbers,
      nativeTextCharacterCount: text.length,
    },
    packet_emergency_result: input.packetEmergencyResult ?? null,
    model_map_result: null,
    model_reduce_result: null,
  }
}

function pageGateway(pageNumber: number, text: string) {
  return runEmergencyGateway(text, {
    documentId: 'document-1',
    pageNumber,
    extractionMethod: 'native_text',
    extractionConfidence: null,
  })
}

function contiguousBoundaryGateway(
  firstPage: string,
  secondPage: string,
) {
  const result = screenPartialPdfEmergencyGateway({
    sourceType: 'pdf',
    filename: 'partial-referral.pdf',
    originalSize: 1,
    text: `${firstPage}\n\n${secondPage}`,
    totalPageCount: 3,
    missingPageNumbers: [3],
    pages: [firstPage, secondPage].map((text, index) => ({
      pageNumber: index + 1,
      text,
      extractionMethod: 'native_text' as const,
      extractionConfidence: null,
    })),
  })
  if (result.kind !== 'valid' || !result.gateway) {
    throw new Error('Expected a contiguous partial-PDF gateway.')
  }
  return result.gateway
}

describe('triage extraction poll safety', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPoolMock.mockResolvedValue({ pool: 'synthetic' })
    readProgressMock.mockResolvedValue(null)
    authorizeMock.mockResolvedValue({
      ok: true,
      context: {
        userId: 'viewer-1',
        email: 'viewer@example.test',
        tenantId: 'tenant-1',
        role: 'viewer',
      },
    })
    singleMock.mockResolvedValue({
      data: { id: 'extraction-1', status: 'pending' },
      error: null,
    })
    workflowSingleMock.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'No rows found' },
    })
    const chain = { eq: eqMock, single: singleMock }
    const workflowChain = {
      eq: workflowEqMock,
      single: workflowSingleMock,
    }
    eqMock.mockReturnValue(chain)
    workflowEqMock.mockReturnValue(workflowChain)
    selectMock.mockReturnValue(chain)
    fromMock.mockImplementation((table: string) =>
      table === 'triage_sessions'
        ? { select: () => workflowChain }
        : { select: selectMock },
    )
  })

  it('rejects unauthenticated polling before reading source data', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await callGet()

    expect(response.status).toBe(401)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('tenant-scopes the extraction row', async () => {
    const response = await callGet()

    expect(response.status).toBe(200)
    expect(eqMock).toHaveBeenCalledWith('id', 'extraction-1')
    expect(eqMock).toHaveBeenCalledWith('tenant_id', 'tenant-1')
  })

  it('returns only sanitized aggregate progress for a pending tenant-bound long packet', async () => {
    const row = await authoritativeLongPacketRow({ status: 'complete' })
    row.status = 'pending' as never
    row.model_map_result = null as never
    row.model_reduce_result = null as never
    singleMock.mockResolvedValueOnce({
      data: row,
      error: null,
    })
    readProgressMock.mockResolvedValueOnce({
      runStatus: 'running',
      expectedChunks: 8,
      mapper: { completed: 3, failed: 1, leased: 2 },
      safety: { completed: 4, failed: 0, leased: 1 },
      finalizerStatus: 'pending',
    })

    const response = await callGet()
    const body = await response.json()

    expect(getPoolMock).toHaveBeenCalledOnce()
    expect(readProgressMock).toHaveBeenCalledWith(
      { pool: 'synthetic' },
      { extractionId: 'extraction-1', tenantId: 'tenant-1' },
    )
    expect(body).toEqual({
      extraction_id: 'extraction-1',
      status: 'pending',
      long_packet_progress: {
        run_status: 'running',
        expected_chunks: 8,
        mapper: { completed: 3, failed: 1, leased: 2 },
        safety: { completed: 4, failed: 0, leased: 1 },
        finalizer_status: 'pending',
      },
    })
    expect(JSON.stringify(body)).not.toMatch(
      /run_id|job_id|result|model|prompt|source_sha|plan_sha|lease_token|lease_owner/i,
    )
    expect(validateAuthorityMock).not.toHaveBeenCalled()
  })

  it('gracefully omits progress when no durable run exists', async () => {
    singleMock.mockResolvedValueOnce({
      data: {
        id: 'extraction-1',
        status: 'pending',
        ingestion_mode: 'long_packet',
      },
      error: null,
    })

    const response = await callGet()
    const body = await response.json()

    expect(readProgressMock).toHaveBeenCalledOnce()
    expect(body).toEqual({
      extraction_id: 'extraction-1',
      status: 'pending',
    })
  })

  it('omits progress without fabricating completion when the progress read fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    singleMock.mockResolvedValueOnce({
      data: {
        id: 'extraction-1',
        status: 'pending',
        ingestion_mode: 'long_packet',
      },
      error: null,
    })
    readProgressMock.mockRejectedValueOnce(
      new Error('synthetic database detail that must not be returned'),
    )

    const response = await callGet()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      extraction_id: 'extraction-1',
      status: 'pending',
    })
    expect(body.status).not.toBe('complete')
    expect(consoleError).toHaveBeenCalledWith(
      '[triage/extract/poll] long-packet progress unavailable',
    )
    expect(JSON.stringify(body)).not.toContain('synthetic database detail')
    consoleError.mockRestore()
  })

  it.each([
    { status: 'pending', ingestion_mode: 'short_note' },
    { status: 'complete', ingestion_mode: 'long_packet' },
  ])('does not read durable progress for an ineligible extraction: %o', async (data) => {
    singleMock.mockResolvedValueOnce({
      data: {
        id: 'extraction-1',
        note_type_detected: 'unknown',
        extraction_confidence: 'high',
        extracted_summary: 'Synthetic summary',
        key_findings: {},
        original_text_length: 100,
        ...data,
      },
      error: null,
    })

    await callGet()

    expect(readProgressMock).not.toHaveBeenCalled()
    expect(getPoolMock).not.toHaveBeenCalled()
  })

  it('returns the complete-source safety floor and page evidence with a completed extraction', async () => {
    const row = await authoritativeLongPacketRow({
      status: 'complete',
      deterministicEmergency: true,
    })
    // Persisted length is display metadata, not source authority. The response
    // must derive both review fields from the validated tenant-bound source.
    row.original_text_length = 1
    singleMock.mockResolvedValueOnce({
      data: row,
      error: null,
    })

    const response = await callGet()
    const body = await response.json()

    expect(body).toMatchObject({
      extraction_id: 'extraction-1',
      status: 'complete',
      ingestion_mode: 'long_packet',
      coverage_status: 'complete',
      original_text: row.text_input,
      original_text_length: row.text_input.length,
      packet_safety: {
        care_pathway: 'emergency_now',
        review_requirement: 'emergency_action',
        clinician_hold: true,
        signals: expect.arrayContaining([
          expect.objectContaining({
            evidence: expect.arrayContaining([
              expect.objectContaining({ pageNumber: 1 }),
            ]),
          }),
        ]),
      },
    })
    expect(body).not.toHaveProperty('session_id')
  })

  it('returns an invalid-manifest emergency hold with explicitly unlocated raw-text evidence', async () => {
    const row = await authoritativeLongPacketRow({
      status: 'complete',
      deterministicEmergency: true,
    })
    row.source_pages = [] as never
    singleMock.mockResolvedValueOnce({ data: row, error: null })

    const body = await (await callGet()).json()

    expect(body).toMatchObject({
      status: 'error',
      reason: 'source_extraction_manifest_invalid',
      safety_pathway: 'emergency_now',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      human_review_required: true,
      packet_safety: {
        care_pathway: 'emergency_now',
        signals: expect.arrayContaining([
          expect.objectContaining({
            evidence: expect.arrayContaining([
              expect.objectContaining({
                documentId: null,
                pageNumber: null,
                quote: expect.stringContaining('Sudden aphasia'),
              }),
            ]),
          }),
        ]),
      },
    })
  })

  it('never synthesizes an emergency phrase across available pages separated by an OCR gap', async () => {
    const row = partialPdfOcrRow({
      pages: [
        { pageNumber: 1, text: 'The patient today developed sudden' },
        { pageNumber: 3, text: 'right-sided weakness and aphasia.' },
      ],
      missingPageNumbers: [2],
    })
    singleMock.mockResolvedValueOnce({ data: row, error: null })

    const body = await (await callGet()).json()

    expect(body).toMatchObject({
      extraction_id: 'extraction-1',
      status: 'error',
      reason: 'ocr_required',
      source_hold_reason: 'ocr_required',
      coverage_status: 'failed',
      total_page_count: 3,
      available_page_numbers: [1, 3],
      missing_page_numbers: [2],
      immediate_action_required: false,
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
    })
    expect(body).not.toHaveProperty('safety_pathway')
    expect(body).not.toHaveProperty('packet_safety')
    expect(body).not.toHaveProperty('safety_triage_session_id')
    expect(workflowSingleMock).not.toHaveBeenCalled()
  })

  it('fails closed when a routine partial-PDF safety artifact is malformed instead of treating it as absent', async () => {
    const row = partialPdfOcrRow({
      pages: [
        { pageNumber: 1, text: 'Stable native referral context.' },
        { pageNumber: 3, text: 'Routine outpatient follow up.' },
      ],
      missingPageNumbers: [2],
    })
    row.packet_emergency_result = '{"status":' as never
    singleMock.mockResolvedValueOnce({ data: row, error: null })

    const body = await (await callGet()).json()

    expect(body).toMatchObject({
      extraction_id: 'extraction-1',
      status: 'error',
      reason: 'source_extraction_packet_safety_invalid',
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
    })
    expect(body).not.toHaveProperty('safety_triage_session_id')
    expect(workflowSingleMock).not.toHaveBeenCalled()
  })

  it('recovers a partial-PDF emergency only from its exact available page and retains a consistent workflow id', async () => {
    const emergencyText =
      'Sudden aphasia and right facial droop began 20 minutes ago.'
    const gateway = pageGateway(3, emergencyText)
    expect(gateway.carePathway).toBe('emergency_now')
    const row = partialPdfOcrRow({
      pages: [
        { pageNumber: 1, text: 'Stable native referral context.' },
        { pageNumber: 3, text: emergencyText },
      ],
      missingPageNumbers: [2],
      packetEmergencyResult: gateway,
    })
    singleMock.mockResolvedValueOnce({ data: row, error: null })
    workflowSingleMock.mockResolvedValueOnce({
      data: {
        id: 'partial-emergency-workflow-1',
        care_pathway: 'emergency_now',
        review_requirement: 'emergency_action',
        scheduling_locked: true,
        workflow_status: 'emergency_hold',
      },
      error: null,
    })

    const body = await (await callGet()).json()

    expect(body).toMatchObject({
      status: 'error',
      reason: 'ocr_required',
      source_hold_reason: 'ocr_required',
      coverage_status: 'failed',
      total_page_count: 3,
      available_page_numbers: [1, 3],
      missing_page_numbers: [2],
      safety_pathway: 'emergency_now',
      safety_triage_session_id: 'partial-emergency-workflow-1',
      packet_safety: {
        care_pathway: 'emergency_now',
        review_requirement: 'emergency_action',
        signals: expect.arrayContaining([
          expect.objectContaining({
            evidence: expect.arrayContaining([
              expect.objectContaining({
                documentId: 'document-1',
                pageNumber: 3,
                startOffset: 0,
                endOffset: emergencyText.length,
                quote: emergencyText,
              }),
            ]),
          }),
        ]),
      },
    })
    expect(JSON.stringify(body)).not.toContain('"pageNumber":null')
  })

  it('recovers an emergency clause split across contiguous available pages with only page-local evidence', async () => {
    const firstPage = 'The patient today developed sudden'
    const secondPage = 'right-sided weakness and aphasia.'
    const gateway = contiguousBoundaryGateway(firstPage, secondPage)
    expect(gateway.carePathway).toBe('emergency_now')
    const row = partialPdfOcrRow({
      pages: [
        { pageNumber: 1, text: firstPage },
        { pageNumber: 2, text: secondPage },
      ],
      missingPageNumbers: [3],
      packetEmergencyResult: gateway,
    })
    singleMock.mockResolvedValueOnce({ data: row, error: null })
    workflowSingleMock.mockResolvedValueOnce({
      data: {
        id: 'contiguous-emergency-workflow-1',
        care_pathway: 'emergency_now',
        review_requirement: 'emergency_action',
        scheduling_locked: true,
        workflow_status: 'emergency_hold',
      },
      error: null,
    })

    const body = await (await callGet()).json()

    expect(body).toMatchObject({
      reason: 'ocr_required',
      safety_pathway: 'emergency_now',
      safety_triage_session_id: 'contiguous-emergency-workflow-1',
      packet_safety: {
        signals: expect.arrayContaining([
          expect.objectContaining({
            evidence: expect.arrayContaining([
              expect.objectContaining({
                pageNumber: 1,
                startOffset: 0,
                endOffset: firstPage.length,
                quote: firstPage,
              }),
              expect.objectContaining({
                pageNumber: 2,
                startOffset: 0,
                endOffset: secondPage.length,
                quote: secondPage,
              }),
            ]),
          }),
        ]),
      },
    })
    expect(JSON.stringify(body)).not.toContain('"pageNumber":null')
  })

  it('recovers a partial-PDF same-day hold from exact page evidence and retains only a consistent workflow id', async () => {
    const sameDayText = 'Possible meningitis with fever today.'
    const gateway = pageGateway(1, sameDayText)
    expect(gateway.carePathway).toBe('same_day_clinician_review')
    const row = partialPdfOcrRow({
      pages: [
        { pageNumber: 1, text: sameDayText },
        { pageNumber: 3, text: 'Stable native referral context.' },
      ],
      missingPageNumbers: [2],
      packetEmergencyResult: gateway,
    })
    singleMock.mockResolvedValueOnce({ data: row, error: null })
    workflowSingleMock.mockResolvedValueOnce({
      data: {
        id: 'partial-same-day-workflow-1',
        care_pathway: 'same_day_clinician_review',
        review_requirement: 'immediate_clinician_review',
        scheduling_locked: true,
        workflow_status: 'clinician_review',
      },
      error: null,
    })

    const body = await (await callGet()).json()

    expect(body).toMatchObject({
      status: 'error',
      reason: 'ocr_required',
      source_hold_reason: 'ocr_required',
      safety_pathway: 'same_day_clinician_review',
      safety_triage_session_id: 'partial-same-day-workflow-1',
      packet_safety: {
        care_pathway: 'same_day_clinician_review',
        signals: expect.arrayContaining([
          expect.objectContaining({
            evidence: expect.arrayContaining([
              expect.objectContaining({
                documentId: 'document-1',
                pageNumber: 1,
                quote: sameDayText,
              }),
            ]),
          }),
        ]),
      },
    })
  })

  it('recovers a same-day clause split across contiguous available pages with only page-local evidence', async () => {
    const firstPage = 'Possible sudden'
    const secondPage = 'right-sided weakness and aphasia.'
    const gateway = contiguousBoundaryGateway(firstPage, secondPage)
    expect(gateway.carePathway).toBe('same_day_clinician_review')
    const row = partialPdfOcrRow({
      pages: [
        { pageNumber: 1, text: firstPage },
        { pageNumber: 2, text: secondPage },
      ],
      missingPageNumbers: [3],
      packetEmergencyResult: gateway,
    })
    singleMock.mockResolvedValueOnce({ data: row, error: null })
    workflowSingleMock.mockResolvedValueOnce({
      data: {
        id: 'contiguous-same-day-workflow-1',
        care_pathway: 'same_day_clinician_review',
        review_requirement: 'immediate_clinician_review',
        scheduling_locked: true,
        workflow_status: 'clinician_review',
      },
      error: null,
    })

    const body = await (await callGet()).json()

    expect(body).toMatchObject({
      reason: 'ocr_required',
      safety_pathway: 'same_day_clinician_review',
      safety_triage_session_id: 'contiguous-same-day-workflow-1',
      packet_safety: {
        signals: expect.arrayContaining([
          expect.objectContaining({
            evidence: expect.arrayContaining([
              expect.objectContaining({ pageNumber: 1, quote: firstPage }),
              expect.objectContaining({ pageNumber: 2, quote: secondPage }),
            ]),
          }),
        ]),
      },
    })
  })

  it('accepts the original case of an uploaded PDF filename without weakening manifest validation', async () => {
    const emergencyText =
      'Sudden aphasia and right facial droop began 20 minutes ago.'
    const gateway = pageGateway(3, emergencyText)
    const row = partialPdfOcrRow({
      pages: [
        { pageNumber: 1, text: 'Stable native referral context.' },
        { pageNumber: 3, text: emergencyText },
      ],
      missingPageNumbers: [2],
      packetEmergencyResult: gateway,
    })
    row.source_filename = 'PARTIAL-REFERRAL.PDF'
    singleMock.mockResolvedValueOnce({ data: row, error: null })
    workflowSingleMock.mockResolvedValueOnce({
      data: {
        id: 'uppercase-pdf-workflow-1',
        care_pathway: 'emergency_now',
        review_requirement: 'emergency_action',
        scheduling_locked: true,
        workflow_status: 'emergency_hold',
      },
      error: null,
    })

    const body = await (await callGet()).json()

    expect(body).toMatchObject({
      reason: 'ocr_required',
      safety_pathway: 'emergency_now',
      safety_triage_session_id: 'uppercase-pdf-workflow-1',
    })
  })

  it('withholds the workflow id when the OCR manifest does not exactly cover available and missing pages', async () => {
    const emergencyText =
      'Sudden aphasia and right facial droop began 20 minutes ago.'
    const gateway = pageGateway(3, emergencyText)
    const row = partialPdfOcrRow({
      pages: [
        { pageNumber: 1, text: 'Stable native referral context.' },
        { pageNumber: 3, text: emergencyText },
      ],
      missingPageNumbers: [2],
      packetEmergencyResult: gateway,
    })
    row.coverage_report.availablePageNumbers = [1, 2, 3]
    singleMock.mockResolvedValueOnce({ data: row, error: null })
    workflowSingleMock.mockResolvedValueOnce({
      data: {
        id: 'must-not-leak-for-invalid-partial-manifest',
        care_pathway: 'emergency_now',
        review_requirement: 'emergency_action',
        scheduling_locked: true,
        workflow_status: 'emergency_hold',
      },
      error: null,
    })

    const body = await (await callGet()).json()

    expect(body).toMatchObject({
      status: 'error',
      reason: 'source_extraction_manifest_invalid',
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
    })
    expect(body).not.toHaveProperty('safety_triage_session_id')
    expect(JSON.stringify(body)).not.toContain(
      'must-not-leak-for-invalid-partial-manifest',
    )
  })

  it('does not let the pending-poll fast path bypass partial-PDF manifest validation or leak its workflow id', async () => {
    const emergencyText =
      'Sudden aphasia and right facial droop began 20 minutes ago.'
    const gateway = pageGateway(3, emergencyText)
    const row = partialPdfOcrRow({
      pages: [
        { pageNumber: 1, text: 'Stable native referral context.' },
        { pageNumber: 3, text: emergencyText },
      ],
      missingPageNumbers: [2],
      packetEmergencyResult: gateway,
    })
    row.status = 'pending'
    row.coverage_report.missingPageNumbers = [2, 2]
    singleMock.mockResolvedValueOnce({ data: row, error: null })
    workflowSingleMock.mockResolvedValueOnce({
      data: {
        id: 'pending-invalid-manifest-workflow-must-not-leak',
        care_pathway: 'emergency_now',
        review_requirement: 'emergency_action',
        scheduling_locked: true,
        workflow_status: 'emergency_hold',
      },
      error: null,
    })

    const body = await (await callGet()).json()

    expect(body).toMatchObject({
      status: 'error',
      reason: 'source_extraction_manifest_invalid',
      safety_pathway: 'emergency_now',
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
    })
    expect(body).not.toHaveProperty('safety_triage_session_id')
    expect(JSON.stringify(body)).not.toContain(
      'pending-invalid-manifest-workflow-must-not-leak',
    )
  })

  it('keeps a valid pending partial-PDF workflow explicitly OCR-held and scoring-blocked', async () => {
    const emergencyText =
      'Sudden aphasia and right facial droop began 20 minutes ago.'
    const gateway = pageGateway(3, emergencyText)
    const row = partialPdfOcrRow({
      pages: [
        { pageNumber: 1, text: 'Stable native referral context.' },
        { pageNumber: 3, text: emergencyText },
      ],
      missingPageNumbers: [2],
      packetEmergencyResult: gateway,
    })
    row.status = 'pending'
    singleMock.mockResolvedValueOnce({ data: row, error: null })
    workflowSingleMock.mockResolvedValueOnce({
      data: {
        id: 'pending-valid-partial-workflow-1',
        care_pathway: 'emergency_now',
        review_requirement: 'emergency_action',
        scheduling_locked: true,
        workflow_status: 'emergency_hold',
      },
      error: null,
    })

    const body = await (await callGet()).json()

    expect(body).toMatchObject({
      status: 'pending',
      reason: 'ocr_required',
      source_hold_reason: 'ocr_required',
      safety_pathway: 'emergency_now',
      safety_triage_session_id: 'pending-valid-partial-workflow-1',
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
    })
  })

  it('does not hide an emergency floor when long-packet model coverage fails', async () => {
    singleMock.mockResolvedValueOnce({
      data: await authoritativeLongPacketRow({
        status: 'error',
        deterministicEmergency: true,
      }),
      error: null,
    })

    const response = await callGet()
    const body = await response.json()

    expect(body).toMatchObject({
      extraction_id: 'extraction-1',
      status: 'error',
      packet_safety: {
        care_pathway: 'emergency_now',
        clinician_hold: true,
      },
      safety_pathway: 'emergency_now',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      human_review_required: true,
    })
    expect(body).not.toHaveProperty('session_id')
  })

  it.each([
    ['emergency_now', 'emergency_action'],
    ['same_day_clinician_review', 'immediate_clinician_review'],
  ] as const)(
    'surfaces a validated model-only %s before triage starts',
    async (modelPathway, reviewRequirement) => {
      singleMock.mockResolvedValueOnce({
        data: await authoritativeLongPacketRow({
          status: 'complete',
          modelPathway,
        }),
        error: null,
      })

      const response = await callGet()
      const body = await response.json()

      expect(body).toMatchObject({
        status: 'complete',
        packet_safety: {
          care_pathway: modelPathway,
          review_requirement: reviewRequirement,
          clinician_hold: true,
        },
        safety_pathway: modelPathway,
        immediate_action_required: true,
        human_review_required: true,
        scheduling_locked: true,
      })
    },
  )

  it.each(['emergency_now', 'same_day_clinician_review'] as const)(
    'retains a successful %s checkpoint when a later terminal error and workflow query failure occur',
    async (modelPathway) => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const row = await authoritativePartialHoldRow(modelPathway, {
        mode: 'safety_checkpoint',
        status: 'error',
      })
      row.error_message = 'Synthetic later generic extraction failure.'
      singleMock.mockResolvedValueOnce({ data: row, error: null })
      workflowSingleMock.mockResolvedValueOnce({
          data: null,
          error: { code: 'DB_ERROR', message: 'synthetic hidden detail' },
        })

      const response = await callGet()
      const body = await response.json()

      expect(body).toMatchObject({
        status: 'error',
        reason: 'source_safety_workflow_unavailable_manual_hold',
        safety_pathway: modelPathway,
        immediate_action_required: true,
        outpatient_scoring_blocked: true,
        human_review_required: true,
        scheduling_locked: true,
        packet_safety: {
          care_pathway: modelPathway,
          signals: expect.arrayContaining([
            expect.objectContaining({
              evidence: expect.arrayContaining([
                expect.objectContaining({ pageNumber: 1 }),
              ]),
            }),
          ]),
        },
      })
      expect(body).not.toHaveProperty('safety_triage_session_id')
      expect(JSON.stringify(body)).not.toContain('synthetic hidden detail')
      consoleError.mockRestore()
    },
  )

  it('fails closed on a malformed workflow while preserving checkpoint evidence and no workflow id', async () => {
    const row = await authoritativePartialHoldRow('emergency_now', {
      mode: 'safety_checkpoint',
      status: 'error',
    })
    singleMock.mockResolvedValueOnce({ data: row, error: null })
    workflowSingleMock.mockResolvedValueOnce({
        data: {
          id: 'malformed-workflow-must-not-leak',
          care_pathway: 'emergency_now',
          review_requirement: 'immediate_clinician_review',
          scheduling_locked: false,
          workflow_status: 'decision_ready',
        },
        error: null,
      })

    const body = await (await callGet()).json()

    expect(body).toMatchObject({
      reason: 'source_safety_workflow_inconsistent_manual_hold',
      safety_pathway: 'emergency_now',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      scheduling_locked: true,
    })
    expect(body).not.toHaveProperty('safety_triage_session_id')
    expect(JSON.stringify(body)).not.toContain('malformed-workflow-must-not-leak')
  })

  it('treats an absent workflow as inconsistent when an actionable checkpoint exists', async () => {
    const row = await authoritativePartialHoldRow('same_day_clinician_review', {
      mode: 'safety_checkpoint',
      status: 'error',
    })
    singleMock.mockResolvedValueOnce({ data: row, error: null })
    workflowSingleMock.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116', message: 'No rows found' },
      })

    const body = await (await callGet()).json()

    expect(body).toMatchObject({
      reason: 'source_safety_workflow_inconsistent_manual_hold',
      safety_pathway: 'same_day_clinician_review',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      scheduling_locked: true,
    })
    expect(body).not.toHaveProperty('safety_triage_session_id')
  })

  it('treats a truly absent workflow as benign when there is no actionable source hold', async () => {
    const row = await authoritativeLongPacketRow({ status: 'error' })
    singleMock.mockResolvedValueOnce({ data: row, error: null })
    workflowSingleMock.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116', message: 'No rows found' },
      })

    const body = await (await callGet()).json()

    expect(body).toMatchObject({
      status: 'error',
      error: 'Synthetic terminal extraction failure.',
      outpatient_scoring_blocked: true,
    })
    expect(body).not.toHaveProperty('reason')
    expect(body).not.toHaveProperty('safety_triage_session_id')
  })

  it('projects an actionable checkpoint while pending and fails closed if its workflow is unavailable', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const row = await authoritativePartialHoldRow('emergency_now', {
      mode: 'safety_checkpoint',
      status: 'pending',
    })
    singleMock.mockResolvedValueOnce({ data: row, error: null })
    workflowSingleMock.mockResolvedValueOnce({
        data: null,
        error: { code: 'DB_ERROR', message: 'synthetic hidden detail' },
      })

    const body = await (await callGet()).json()

    expect(body).toMatchObject({
      status: 'pending',
      reason: 'source_safety_workflow_unavailable_manual_hold',
      safety_pathway: 'emergency_now',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      scheduling_locked: true,
      packet_safety: { care_pathway: 'emergency_now' },
    })
    expect(body).not.toHaveProperty('safety_triage_session_id')
    consoleError.mockRestore()
  })

  it('recovers the deterministic emergency pathway from pending source authority when its workflow read fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const row = await authoritativeLongPacketRow({
      status: 'error',
      deterministicEmergency: true,
    })
    row.status = 'pending' as never
    row.model_map_result = null as never
    row.model_reduce_result = null as never
    singleMock.mockResolvedValueOnce({ data: row, error: null })
    workflowSingleMock.mockResolvedValueOnce({
      data: null,
      error: { code: 'DB_ERROR', message: 'synthetic hidden detail' },
    })

    const body = await (await callGet()).json()

    expect(body).toMatchObject({
      status: 'pending',
      reason: 'source_safety_workflow_unavailable_manual_hold',
      safety_pathway: 'emergency_now',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
      packet_safety: {
        care_pathway: 'emergency_now',
        signals: expect.arrayContaining([
          expect.objectContaining({
            evidence: expect.arrayContaining([
              expect.objectContaining({ pageNumber: 1 }),
            ]),
          }),
        ]),
      },
    })
    expect(body).not.toHaveProperty('safety_triage_session_id')
    consoleError.mockRestore()
  })

  it.each(['missing', 'malformed', 'version-tampered'] as const)(
    'fails closed when a pending deterministic artifact is %s and its workflow is absent',
    async (description) => {
      const row = await authoritativeLongPacketRow({ status: 'error' })
      row.status = 'pending' as never
      row.model_map_result = null as never
      row.model_reduce_result = null as never
      row.packet_emergency_result =
        description === 'missing'
          ? null as never
          : description === 'malformed'
            ? '{"status":' as never
            : {
                ...row.packet_emergency_result,
                version: 'tampered-emergency-version',
              } as never
      singleMock.mockResolvedValueOnce({ data: row, error: null })
      workflowSingleMock.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116', message: 'No rows found' },
      })

      const body = await (await callGet()).json()

      expect(validateAuthorityMock).toHaveBeenCalledOnce()
      expect(body).toMatchObject({
        status: 'error',
        outpatient_scoring_blocked: true,
        human_review_required: true,
        scheduling_locked: true,
      })
      expect(body.reason).toEqual(expect.any(String))
      expect(body).not.toHaveProperty('safety_triage_session_id')
    },
  )

  it('keeps an absent-workflow pending routine poll on the cheap path only for a strict completed routine envelope', async () => {
    const row = await authoritativeLongPacketRow({ status: 'error' })
    row.status = 'pending' as never
    row.model_map_result = null as never
    row.model_reduce_result = null as never
    singleMock.mockResolvedValueOnce({ data: row, error: null })
    workflowSingleMock.mockResolvedValueOnce({
      data: null,
      error: { code: 'PGRST116', message: 'No rows found' },
    })

    const body = await (await callGet()).json()

    expect(validateAuthorityMock).not.toHaveBeenCalled()
    expect(body).toMatchObject({ status: 'pending' })
    expect(body).not.toHaveProperty('reason')
    expect(body).not.toHaveProperty('safety_pathway')
    expect(body).not.toHaveProperty('safety_triage_session_id')
  })

  it('revalidates a routine-looking pending artifact whose governed version is malformed', async () => {
    const row = await authoritativeLongPacketRow({ status: 'error' })
    row.status = 'pending' as never
    row.model_map_result = null as never
    row.model_reduce_result = null as never
    row.packet_emergency_result = {
      ...row.packet_emergency_result,
      version: 'forged-emergency-version',
    } as never
    singleMock.mockResolvedValueOnce({ data: row, error: null })
    workflowSingleMock.mockResolvedValueOnce({
      data: null,
      error: { code: 'PGRST116', message: 'No rows found' },
    })

    const body = await (await callGet()).json()

    expect(validateAuthorityMock).toHaveBeenCalledOnce()
    expect(body).toMatchObject({
      status: 'error',
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
    })
    expect(body).not.toHaveProperty('safety_triage_session_id')
  })

  it('locks scoring and scheduling when a pending workflow read is unavailable even without a recoverable pathway', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    singleMock.mockResolvedValueOnce({
      data: {
        id: 'extraction-1',
        status: 'pending',
        ingestion_mode: 'long_packet',
        model_reduce_result: null,
      },
      error: null,
    })
    workflowSingleMock.mockResolvedValueOnce({
      data: null,
      error: { code: 'DB_ERROR', message: 'synthetic hidden detail' },
    })

    const body = await (await callGet()).json()

    expect(body).toMatchObject({
      status: 'pending',
      reason: 'source_safety_workflow_unavailable_manual_hold',
      immediate_action_required: false,
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
    })
    expect(body).not.toHaveProperty('safety_pathway')
    expect(body).not.toHaveProperty('safety_triage_session_id')
    consoleError.mockRestore()
  })

  it('projects source page and quote evidence for a mapper-only partial same-day hold', async () => {
    singleMock.mockResolvedValueOnce({
      data: await authoritativeMapperPartialHoldRow(),
      error: null,
    })

    const response = await callGet()
    const body = await response.json()

    expect(body).toMatchObject({
      status: 'error',
      reason: 'model_safety_workflow_persistence_failed',
      safety_pathway: 'same_day_clinician_review',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
      packet_safety: {
        care_pathway: 'same_day_clinician_review',
        signals: expect.arrayContaining([
          expect.objectContaining({
            code: 'mapper_red_flag_0',
            evidence: expect.arrayContaining([
              expect.objectContaining({
                pageNumber: 1,
                quote: expect.stringContaining('Synthetic'),
              }),
            ]),
          }),
        ]),
      },
    })
    expect(body).not.toHaveProperty('safety_triage_session_id')
  })

  it('retains validated model same-day safety on a terminal extraction error', async () => {
    singleMock.mockResolvedValueOnce({
      data: await authoritativeLongPacketRow({
        status: 'error',
        modelPathway: 'same_day_clinician_review',
      }),
      error: null,
    })

    const response = await callGet()
    const body = await response.json()

    expect(body).toMatchObject({
      status: 'error',
      safety_pathway: 'same_day_clinician_review',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      human_review_required: true,
      packet_safety: {
        care_pathway: 'same_day_clinician_review',
      },
    })
  })

  it('retains a cross-chunk same-day aggregate after narrative and workflow persistence fail', async () => {
    const row = await authoritativeCrossChunkNarrativeFailureRow()
    expect(row.model_reduce_result).toMatchObject({
      status: 'partial',
      coverageStatus: 'partial',
      carePathway: 'same_day_clinician_review',
      failureCodes: ['narrative_reducer_failed'],
    })
    singleMock.mockResolvedValueOnce({ data: row, error: null })

    const body = await (await callGet()).json()

    expect(body).toMatchObject({
      status: 'error',
      reason: 'source_safety_workflow_inconsistent_manual_hold',
      safety_pathway: 'same_day_clinician_review',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
      packet_safety: {
        care_pathway: 'same_day_clinician_review',
        clinician_hold: true,
      },
    })
    expect(body).not.toHaveProperty('safety_triage_session_id')
    expect(validateAuthorityMock).toHaveBeenCalledOnce()
  })

  it('projects an explicit safety floor when all exact actionable artifact writes failed', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const row = await authoritativeLongPacketRow({ status: 'error' })
    row.model_map_result = null as never
    row.model_reduce_result = null as never
    row.error_message = longPacketSafetyPersistenceFailureMessage(
      'same_day_clinician_review',
    )
    singleMock.mockResolvedValueOnce({ data: row, error: null })

    const body = await (await callGet()).json()

    expect(body).toMatchObject({
      status: 'error',
      reason: MODEL_SAFETY_EVIDENCE_PERSISTENCE_FAILED_REASON,
      safety_pathway: 'same_day_clinician_review',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
      packet_safety: {
        care_pathway: 'same_day_clinician_review',
        clinician_hold: true,
      },
    })
    expect(body).not.toHaveProperty('safety_triage_session_id')
    consoleError.mockRestore()
  })

  it.each([
    ['emergency_now', 'emergency_action'],
    ['same_day_clinician_review', 'immediate_clinician_review'],
  ] as const)(
    'projects a validated partial %s hold while keeping scoring terminally blocked',
    async (modelPathway, reviewRequirement) => {
      singleMock.mockResolvedValueOnce({
        data: await authoritativePartialHoldRow(modelPathway),
        error: null,
      })

      const response = await callGet()
      const body = await response.json()

      expect(body).toMatchObject({
        status: 'error',
        reason: 'model_safety_workflow_persistence_failed',
        safety_pathway: modelPathway,
        immediate_action_required: true,
        outpatient_scoring_blocked: true,
        human_review_required: true,
        scheduling_locked: true,
        packet_safety: {
          care_pathway: modelPathway,
          review_requirement: reviewRequirement,
          clinician_hold: true,
          signals: expect.arrayContaining([
            expect.objectContaining({
              evidence: expect.arrayContaining([
                expect.objectContaining({ pageNumber: 1 }),
              ]),
            }),
          ]),
        },
      })
      expect(body.status).not.toBe('complete')
      expect(body).not.toHaveProperty('safety_triage_session_id')
    },
  )

  it('keeps an existing same-floor workflow reachable after a later checkpoint write fails', async () => {
    const row = await authoritativePartialHoldRow(
      'same_day_clinician_review',
      { mode: 'workflow_persistence_failed', status: 'error' },
    )
    singleMock.mockResolvedValueOnce({ data: row, error: null })
    workflowSingleMock.mockResolvedValueOnce({
      data: {
        id: 'triage-existing-same-day',
        care_pathway: 'same_day_clinician_review',
        review_requirement: 'immediate_clinician_review',
        scheduling_locked: true,
        workflow_status: 'clinician_review',
      },
      error: null,
    })

    const body = await (await callGet()).json()

    expect(body).toMatchObject({
      status: 'error',
      reason: 'model_safety_workflow_persistence_failed',
      safety_pathway: 'same_day_clinician_review',
      safety_triage_session_id: 'triage-existing-same-day',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      scheduling_locked: true,
    })
  })

  it('retains a complete model safety branch when narrative finalization failed', async () => {
    const row = await authoritativeLongPacketRow({
      status: 'error',
      modelPathway: 'emergency_now',
    })
    row.model_reduce_result.status = 'partial'
    row.model_reduce_result.narrative = null
    row.model_reduce_result.failureCodes = ['narrative_reducer_failed']
    singleMock.mockResolvedValueOnce({ data: row, error: null })

    const response = await callGet()
    const body = await response.json()

    expect(body).toMatchObject({
      status: 'error',
      safety_pathway: 'emergency_now',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      packet_safety: {
        care_pathway: 'emergency_now',
        clinician_hold: true,
      },
    })
  })

  it('does not return a completed extraction with a missing authoritative summary', async () => {
    const row = await authoritativeLongPacketRow({ status: 'complete' })
    row.extracted_summary = '   '
    singleMock.mockResolvedValueOnce({ data: row, error: null })

    const response = await callGet()
    const body = await response.json()

    expect(body).toMatchObject({
      status: 'error',
      reason: 'source_extraction_summary_missing',
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
    })
  })

  it('does not return a completed extraction without tenant-bound original text', async () => {
    singleMock.mockResolvedValueOnce({
      data: {
        id: 'extraction-1',
        status: 'complete',
        text_input: null,
        source_filename: 'legacy-referral.txt',
        note_type_detected: 'referral',
        extraction_confidence: 'high',
        extracted_summary: 'Synthetic legacy extraction summary.',
        key_findings: {},
        original_text_length: 0,
        ingestion_mode: 'legacy_unknown',
        coverage_status: 'legacy_unknown',
      },
      error: null,
    })

    const response = await callGet()
    const body = await response.json()

    expect(body).toMatchObject({
      extraction_id: 'extraction-1',
      status: 'error',
      reason: 'source_extraction_original_text_missing',
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
    })
  })

  it('surfaces a source-bound pending model workflow floor and explicit safety id', async () => {
    const row = await authoritativeLongPacketRow({
      status: 'complete',
    })
    row.status = 'pending' as never
    row.model_map_result = null as never
    row.model_reduce_result = null as never
    singleMock.mockResolvedValueOnce({ data: row, error: null })
    workflowSingleMock.mockResolvedValueOnce({
        data: {
          id: 'triage-model-workflow-1',
          care_pathway: 'emergency_now',
          review_requirement: 'emergency_action',
          scheduling_locked: true,
          workflow_status: 'emergency_hold',
        },
        error: null,
      })

    const response = await callGet()
    const body = await response.json()

    expect(body).toMatchObject({
      status: 'pending',
      packet_safety: {
        care_pathway: 'emergency_now',
        review_requirement: 'emergency_action',
        clinician_hold: true,
      },
      safety_pathway: 'emergency_now',
      safety_triage_session_id: 'triage-model-workflow-1',
      scheduling_locked: true,
    })
    expect(fromMock).toHaveBeenCalledWith('triage_sessions')
    expect(workflowEqMock).toHaveBeenCalledWith(
      'source_extraction_id',
      'extraction-1',
    )
    expect(workflowEqMock).toHaveBeenCalledWith('tenant_id', 'tenant-1')
  })

  it('blocks a pending emergency checkpoint when its found workflow remains on a lower pathway', async () => {
    const row = await authoritativePartialHoldRow('emergency_now', {
      mode: 'safety_checkpoint',
      status: 'pending',
    })
    singleMock.mockResolvedValueOnce({ data: row, error: null })
    workflowSingleMock.mockResolvedValueOnce({
        data: {
          id: 'triage-same-day-only',
          care_pathway: 'same_day_clinician_review',
          review_requirement: 'immediate_clinician_review',
          scheduling_locked: true,
          workflow_status: 'clinician_review',
        },
        error: null,
      })

    const response = await callGet()
    const body = await response.json()

    expect(body).toMatchObject({
      packet_safety: { care_pathway: 'emergency_now' },
      safety_pathway: 'emergency_now',
      reason: 'source_safety_workflow_inconsistent_manual_hold',
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
    })
    expect(body).not.toHaveProperty('safety_triage_session_id')
  })

  it('preserves source quote and page evidence when a valid workflow raises the checkpoint pathway', async () => {
    const row = await authoritativePartialHoldRow(
      'same_day_clinician_review',
      { mode: 'safety_checkpoint', status: 'error' },
    )
    singleMock.mockResolvedValueOnce({ data: row, error: null })
    workflowSingleMock.mockResolvedValueOnce({
      data: {
        id: 'triage-emergency-raised',
        care_pathway: 'emergency_now',
        review_requirement: 'emergency_action',
        scheduling_locked: true,
        workflow_status: 'emergency_hold',
      },
      error: null,
    })

    const body = await (await callGet()).json()

    expect(body).toMatchObject({
      safety_pathway: 'emergency_now',
      safety_triage_session_id: 'triage-emergency-raised',
      packet_safety: {
        care_pathway: 'emergency_now',
        signals: expect.arrayContaining([
          expect.objectContaining({
            code: 'model_only_same_day',
            evidence: expect.arrayContaining([
              expect.objectContaining({ pageNumber: 1 }),
            ]),
          }),
        ]),
      },
    })
  })

  it('turns a tampered mapper result into an error while retaining independent model safety', async () => {
    const row = await authoritativeLongPacketRow({
      status: 'complete',
      modelPathway: 'emergency_now',
    })
    row.model_reduce_result.mapperOutcomes = []
    singleMock.mockResolvedValueOnce({ data: row, error: null })

    const response = await callGet()
    const body = await response.json()

    expect(body).toMatchObject({
      status: 'error',
      reason: 'source_extraction_packet_safety_invalid',
      outpatient_scoring_blocked: true,
      human_review_required: true,
      safety_pathway: 'emergency_now',
      immediate_action_required: true,
    })
  })
})
