import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildLongPacketIngestionArtifacts,
  LONG_PACKET_FULL_PIPELINE_DEFAULT_BINDINGS,
  longPacketPipelineToPersistedClinicalExtraction,
} from '@/lib/triage/longPacketIngestion'
import { LONG_PACKET_FACT_CATEGORIES } from '@/lib/triage/longPacketClinicalMapper'
import {
  runLongPacketModelPipeline,
  type LongPacketModelPipelineResult,
} from '@/lib/triage/longPacketModelPipeline'
import type { LongPacketPlan } from '@/lib/triage/longPacketPlanner'
import { validateModelSafetyExtraction } from '@/lib/triage/modelSafetyExtraction'

import { POST } from '../route'

const {
  authorizeMock,
  fromMock,
  insertMock,
  selectMock,
  singleMock,
  runInBackgroundMock,
  processTriageMock,
  startSessionMock,
  extractionSelectMock,
  extractionEqMock,
  extractionSingleMock,
  validateBindingsMock,
  persistGatewayMock,
  updateMock,
  updateEqMock,
  updateSelectMock,
  updateSingleMock,
} = vi.hoisted(() => ({
  authorizeMock: vi.fn(),
  fromMock: vi.fn(),
  insertMock: vi.fn(),
  selectMock: vi.fn(),
  singleMock: vi.fn(),
  runInBackgroundMock: vi.fn(),
  processTriageMock: vi.fn(),
  startSessionMock: vi.fn(),
  extractionSelectMock: vi.fn(),
  extractionEqMock: vi.fn(),
  extractionSingleMock: vi.fn(),
  validateBindingsMock: vi.fn(),
  persistGatewayMock: vi.fn(),
  updateMock: vi.fn(),
  updateEqMock: vi.fn(),
  updateSelectMock: vi.fn(),
  updateSingleMock: vi.fn(),
}))

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
}))
vi.mock('@/lib/db-query', () => ({ from: fromMock }))
vi.mock('@/lib/triage/asyncRunner', () => ({
  runInBackground: runInBackgroundMock,
}))
vi.mock('@/lib/triage/processTriageInBackground', () => ({
  TRIAGE_MODEL: 'test-triage-model',
  processTriageInBackground: processTriageMock,
}))
vi.mock('@/lib/triage/sessionStart', () => ({
  startOrReuseTriageSession: startSessionMock,
}))
vi.mock('@/lib/triage/inputBindings', () => ({
  validateTriageInputBindings: validateBindingsMock,
}))
vi.mock('@/lib/triage/gatewayPersistence', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/lib/triage/gatewayPersistence')
  >()
  return {
    ...actual,
    persistEmergencyGatewayResult: persistGatewayMock,
  }
})

function request(overrides: Record<string, unknown> = {}) {
  return new Request('http://localhost/api/triage', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      referral_text:
        'Synthetic referral note with more than fifty characters for safe triage testing only.',
      ...overrides,
    }),
  })
}

function validAuthoritativeExtractionRow(input: {
  rawText?: string
  pageTexts?: string[]
  extractedSummary?: string | null
  sourceFilename?: string | null
  patientAge?: number | null
  patientSex?: string | null
  ingestionMode?: 'single_pass' | 'long_packet'
} = {}): Record<string, unknown> {
  const rawText =
    input.rawText ??
    'Raw persisted source says sudden aphasia today and contains enough synthetic text for triage.'
  const pageTexts = input.pageTexts ?? [rawText]
  const artifacts = buildLongPacketIngestionArtifacts({
    packetId: 'packet-route-authority',
    documentId: 'document-1',
    text: pageTexts.join('\n\n'),
    pages: pageTexts.map((text, index) => ({
      pageNumber: index + 1,
      text,
      extractionMethod: 'native_text',
      extractionConfidence: null,
    })),
    singlePassCharacterLimit:
      input.ingestionMode === 'long_packet' ? 50 : 50_000,
  })

  return {
    id: 'extraction-1',
    status: 'complete',
    text_input: artifacts.sourcePages.map((page) => page.text).join('\n\n'),
    extracted_summary:
      input.extractedSummary === undefined
        ? 'Persisted authoritative extraction summary.'
        : input.extractedSummary,
    source_filename:
      input.sourceFilename === undefined ? 'referral.PDF' : input.sourceFilename,
    patient_age: input.patientAge === undefined ? 68 : input.patientAge,
    patient_sex: input.patientSex === undefined ? 'Female' : input.patientSex,
    extraction_confidence: 'high',
    note_type_detected: 'referral',
    ingestion_mode: artifacts.ingestionMode,
    coverage_status: 'complete',
    coverage_report: artifacts.plan.coverage,
    source_pages: artifacts.sourcePages,
    source_sha256: artifacts.sourceSha256,
    packet_plan: artifacts.plan,
    packet_emergency_result: artifacts.emergency,
    model_reduce_result: null,
  }
}

async function attachGenuinePipeline(
  row: ReturnType<typeof validAuthoritativeExtractionRow>,
  pathway:
    | 'routine_outpatient'
    | 'emergency_now'
    | 'same_day_clinician_review' = 'routine_outpatient',
) {
  const summaryWasMissing =
    row.extracted_summary === null || row.extracted_summary === undefined
  const plan = row.packet_plan as LongPacketPlan
  const targetChunkId = plan.chunks[0].id
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
      const target = chunk.id === targetChunkId
      const quote = chunk.text.slice(0, Math.min(48, chunk.text.length))
      const raw =
        target && pathway === 'emergency_now'
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
          : target && pathway === 'same_day_clinician_review'
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
              }
      return validateModelSafetyExtraction(raw, chunk.text)
    },
    reduceNarrative: async (input) => ({
      narrative: 'Synthetic verified packet narrative.',
      timelineNarrative: '',
      medicationNarrative: '',
      testNarrative: '',
      functionalNarrative: '',
      conflictNarrative: '',
      preservedSafetyEvidenceIds: input.requiredSafetyEvidenceIds,
    }),
  })
  const clinical = longPacketPipelineToPersistedClinicalExtraction({
    pipeline,
    deterministicGateway: row.packet_emergency_result as ReturnType<
      typeof buildLongPacketIngestionArtifacts
    >['emergency'],
  })
  row.model_map_result = pipeline.mapperCoverage
  row.model_reduce_result = pipeline
  row.safety_prompt_versions = LONG_PACKET_FULL_PIPELINE_DEFAULT_BINDINGS
  row.extracted_summary = summaryWasMissing
    ? null
    : clinical.extractedSummary
  row.key_findings = clinical.keyFindings
  row.note_type_detected = clinical.noteTypeDetected
  row.extraction_confidence = clinical.extractionConfidence
  return row
}

describe('triage route access and initial safety state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authorizeMock.mockResolvedValue({
      ok: true,
      context: {
        userId: 'user-1',
        email: 'clinician@example.test',
        tenantId: 'tenant-1',
        role: 'clinician',
      },
    })
    singleMock.mockResolvedValue({ data: { id: 'triage-1' }, error: null })
    selectMock.mockReturnValue({ single: singleMock })
    insertMock.mockReturnValue({ select: selectMock })
    const extractionChain = {
      eq: extractionEqMock,
      single: extractionSingleMock,
    }
    extractionEqMock.mockReturnValue(extractionChain)
    extractionSelectMock.mockReturnValue(extractionChain)
    extractionSingleMock.mockResolvedValue({
      data: validAuthoritativeExtractionRow(),
      error: null,
    })
    const updateChain = {
      eq: updateEqMock,
      select: updateSelectMock,
      single: updateSingleMock,
    }
    updateEqMock.mockReturnValue(updateChain)
    updateSelectMock.mockReturnValue(updateChain)
    updateSingleMock.mockResolvedValue({
      data: { id: 'triage-1' },
      error: null,
    })
    updateMock.mockReturnValue(updateChain)
    fromMock.mockImplementation((table: string) =>
      table === 'triage_extractions'
        ? { select: extractionSelectMock }
        : table === 'triage_sessions'
          ? { update: updateMock }
          : { insert: insertMock },
    )
    runInBackgroundMock.mockImplementation((work: () => Promise<void>) => work())
    processTriageMock.mockResolvedValue(undefined)
    startSessionMock.mockImplementation(
      async (input: { patientId?: string; consultId?: string }) => ({
        ok: true,
        triageSessionId: 'triage-1',
        launchProcessing: true,
        reused: false,
        processingStatus: 'pending',
        processingAttemptCount: 1,
        patientId: input.patientId,
        consultId: input.consultId,
      }),
    )
    validateBindingsMock.mockResolvedValue({ allowed: true })
    persistGatewayMock.mockResolvedValue(true)
  })

  it('rejects an unauthorized caller before referral persistence', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await POST(request())

    expect(response.status).toBe(401)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('returns a structured scoring block without inventing a pathway when the bound extraction is not found', async () => {
    extractionSingleMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'synthetic not found' },
    })

    const response = await POST(
      request({ source_extraction_id: 'missing-extraction' }),
    )
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body).toMatchObject({
      reason: 'source_extraction_not_found',
      outpatient_scoring_blocked: true,
      human_review_required: true,
      immediate_action_required: false,
    })
    expect(body).not.toHaveProperty('safety_pathway')
    expect(startSessionMock).not.toHaveBeenCalled()
    expect(processTriageMock).not.toHaveBeenCalled()
  })

  it('uses the authoritative tenant and starts locked pending safety review', async () => {
    const response = await POST(request())

    expect(response.status).toBe(202)
    expect(startSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        sourceType: 'paste',
        coverageStatus: 'not_applicable',
      }),
    )
    expect(runInBackgroundMock).toHaveBeenCalledOnce()
  })

  it('persists a safety workflow for a short explicit stroke emergency without running outpatient scoring', async () => {
    const shortEmergency = 'Sudden aphasia and right facial droop now.'

    const response = await POST(request({ referral_text: shortEmergency }))
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body).toMatchObject({
      session_id: 'triage-1',
      reason: 'referral_text_below_minimum_time_critical',
      safety_pathway: 'emergency_now',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
      safety_triage_session_id: 'triage-1',
      packet_safety: {
        care_pathway: 'emergency_now',
        review_requirement: 'emergency_action',
        clinician_hold: true,
        signals: [
          expect.objectContaining({
            action: 'emergency_now',
            evidence: [
              expect.objectContaining({ quote: shortEmergency }),
            ],
          }),
        ],
      },
    })
    expect(startSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        referralText: shortEmergency,
        tenantId: 'tenant-1',
        coverageStatus: 'not_applicable',
      }),
    )
    expect(persistGatewayMock).toHaveBeenCalledWith(
      'triage-1',
      'tenant-1',
      expect.objectContaining({ carePathway: 'emergency_now' }),
      1,
    )
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ processing_status: 'error' }),
    )
    expect(runInBackgroundMock).not.toHaveBeenCalled()
    expect(processTriageMock).not.toHaveBeenCalled()
  })

  it('keeps a short routine note rejected without creating a workflow or authorizing routine care', async () => {
    const response = await POST(request({ referral_text: 'Stable headache.' }))
    const body = await response.json()

    expect(response.status).toBe(413)
    expect(body).toMatchObject({
      error: expect.stringContaining('at least 50 characters'),
    })
    expect(body).not.toHaveProperty('safety_pathway')
    expect(startSessionMock).not.toHaveBeenCalled()
    expect(persistGatewayMock).not.toHaveBeenCalled()
    expect(processTriageMock).not.toHaveBeenCalled()
  })

  it('preserves short emergency evidence when a stale patient binding is rejected', async () => {
    const shortEmergency = 'Sudden aphasia and right facial droop now.'

    const response = await POST(
      request({
        referral_text: shortEmergency,
        patient_id: 'missing-patient',
      }),
    )
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body).toMatchObject({
      reason: 'unverified_patient_binding_not_allowed',
      safety_pathway: 'emergency_now',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
      packet_safety: {
        care_pathway: 'emergency_now',
        signals: [
          expect.objectContaining({
            evidence: [expect.objectContaining({ quote: shortEmergency })],
          }),
        ],
      },
    })
    expect(body).not.toHaveProperty('session_id')
    expect(body).not.toHaveProperty('safety_triage_session_id')
    expect(startSessionMock).not.toHaveBeenCalled()
    expect(persistGatewayMock).not.toHaveBeenCalled()
    expect(runInBackgroundMock).not.toHaveBeenCalled()
    expect(processTriageMock).not.toHaveBeenCalled()
  })

  it('preserves short same-day evidence when a consult binding is rejected', async () => {
    const shortUncertain = 'Possible new aphasia; current status unclear.'

    const response = await POST(
      request({
        referral_text: shortUncertain,
        consult_id: 'stale-consult',
      }),
    )
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body).toMatchObject({
      reason: 'unverified_patient_binding_not_allowed',
      safety_pathway: 'same_day_clinician_review',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      packet_safety: {
        care_pathway: 'same_day_clinician_review',
        review_requirement: 'immediate_clinician_review',
      },
    })
    expect(body).not.toHaveProperty('session_id')
    expect(body).not.toHaveProperty('safety_triage_session_id')
    expect(startSessionMock).not.toHaveBeenCalled()
    expect(runInBackgroundMock).not.toHaveBeenCalled()
    expect(processTriageMock).not.toHaveBeenCalled()
  })

  it('preserves short emergency evidence while rejecting unbound source filename metadata', async () => {
    const shortEmergency = 'Sudden aphasia and right facial droop now.'

    const response = await POST(
      request({
        referral_text: shortEmergency,
        source_filename: 'unbound-referral.pdf',
      }),
    )
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body).toMatchObject({
      reason: 'raw_source_binding_required',
      safety_pathway: 'emergency_now',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      packet_safety: {
        care_pathway: 'emergency_now',
        signals: [
          expect.objectContaining({
            evidence: [expect.objectContaining({ quote: shortEmergency })],
          }),
        ],
      },
    })
    expect(body).not.toHaveProperty('session_id')
    expect(body).not.toHaveProperty('safety_triage_session_id')
    expect(validateBindingsMock).not.toHaveBeenCalled()
    expect(startSessionMock).not.toHaveBeenCalled()
    expect(runInBackgroundMock).not.toHaveBeenCalled()
    expect(processTriageMock).not.toHaveBeenCalled()
  })

  it('preserves short same-day evidence while rejecting an invalid source type', async () => {
    const shortUncertain = 'Possible new aphasia; current status unclear.'

    const response = await POST(
      request({
        referral_text: shortUncertain,
        source_type: 'fax-machine',
      }),
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toMatchObject({
      reason: 'invalid_source_type',
      safety_pathway: 'same_day_clinician_review',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      packet_safety: {
        care_pathway: 'same_day_clinician_review',
      },
    })
    expect(body).not.toHaveProperty('session_id')
    expect(body).not.toHaveProperty('safety_triage_session_id')
    expect(startSessionMock).not.toHaveBeenCalled()
    expect(runInBackgroundMock).not.toHaveBeenCalled()
    expect(processTriageMock).not.toHaveBeenCalled()
  })

  it('preserves a short uncertain neurologic signal as same-day review', async () => {
    const shortUncertain = 'Possible new aphasia; current status unclear.'

    const response = await POST(request({ referral_text: shortUncertain }))
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body).toMatchObject({
      safety_pathway: 'same_day_clinician_review',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      safety_triage_session_id: 'triage-1',
      packet_safety: {
        care_pathway: 'same_day_clinician_review',
        review_requirement: 'immediate_clinician_review',
      },
    })
    expect(persistGatewayMock).toHaveBeenCalledWith(
      'triage-1',
      'tenant-1',
      expect.objectContaining({
        carePathway: 'same_day_clinician_review',
      }),
      1,
    )
    expect(processTriageMock).not.toHaveBeenCalled()
  })

  it('returns an explicit manual emergency hold without inventing a workflow id when short-note safety persistence fails', async () => {
    const shortEmergency = 'Sudden aphasia and right facial droop now.'
    persistGatewayMock.mockResolvedValueOnce(false)

    const response = await POST(request({ referral_text: shortEmergency }))
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body).toMatchObject({
      reason: 'short_referral_safety_workflow_unavailable',
      safety_pathway: 'emergency_now',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
      packet_safety: {
        care_pathway: 'emergency_now',
        signals: [
          expect.objectContaining({
            evidence: [expect.objectContaining({ quote: shortEmergency })],
          }),
        ],
      },
    })
    expect(body).not.toHaveProperty('safety_triage_session_id')
    expect(processTriageMock).not.toHaveBeenCalled()
  })

  it('preserves a manual emergency hold when short-note safety persistence rejects', async () => {
    const shortEmergency = 'Sudden aphasia and right facial droop now.'
    persistGatewayMock.mockRejectedValueOnce(
      new Error('synthetic gateway connection failure'),
    )

    const response = await POST(request({ referral_text: shortEmergency }))
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body).toMatchObject({
      reason: 'short_referral_safety_workflow_unavailable',
      safety_pathway: 'emergency_now',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
      packet_safety: {
        care_pathway: 'emergency_now',
        signals: [
          expect.objectContaining({
            evidence: [expect.objectContaining({ quote: shortEmergency })],
          }),
        ],
      },
    })
    expect(body).not.toHaveProperty('session_id')
    expect(body).not.toHaveProperty('safety_triage_session_id')
    expect(updateSingleMock).toHaveBeenCalledOnce()
    expect(runInBackgroundMock).not.toHaveBeenCalled()
    expect(processTriageMock).not.toHaveBeenCalled()
  })

  it('does not advertise a poll target when the short-note scoring block cannot be persisted', async () => {
    const shortEmergency = 'Sudden aphasia and right facial droop now.'
    updateSingleMock.mockResolvedValueOnce({
      data: null,
      error: new Error('synthetic scoring-block persistence failure'),
    })

    const response = await POST(request({ referral_text: shortEmergency }))
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body).toMatchObject({
      reason: 'short_referral_scoring_block_unavailable',
      safety_pathway: 'emergency_now',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
      packet_safety: {
        care_pathway: 'emergency_now',
        signals: [
          expect.objectContaining({
            evidence: [expect.objectContaining({ quote: shortEmergency })],
          }),
        ],
      },
    })
    expect(body).not.toHaveProperty('session_id')
    expect(body).not.toHaveProperty('safety_triage_session_id')
    expect(persistGatewayMock).toHaveBeenCalledOnce()
    expect(updateSelectMock).toHaveBeenCalledWith('id')
    expect(updateSingleMock).toHaveBeenCalledOnce()
    expect(runInBackgroundMock).not.toHaveBeenCalled()
    expect(processTriageMock).not.toHaveBeenCalled()
  })

  it('uses raw pasted source for both safety and scoring and ignores an unbound caller summary', async () => {
    const rawSource =
      'Raw source documents sudden aphasia today and contains enough characters for triage.'
    const editedSummary =
      'Clinician-edited extraction describes stable symptoms without the omitted emergency.'

    await POST(
      request({ referral_text: rawSource, extracted_summary: editedSummary }),
    )

    expect(processTriageMock).toHaveBeenCalledWith(
      'triage-1',
      expect.objectContaining({
        gatewayText: rawSource,
        textForScoring: rawSource,
        referral_text: rawSource,
        processingAttemptCount: 1,
      }),
    )
    expect(startSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        referralText: rawSource,
        extractedSummary: undefined,
        coverageStatus: 'not_applicable',
      }),
    )
  })

  it('uses every persisted bound-source field and ignores forged caller content and metadata', async () => {
    const response = await POST(
      request({
        referral_text:
          'Forged caller source describes only stable symptoms and must be ignored completely.',
        extracted_summary:
          'Forged caller summary describes only stable symptoms and must be ignored completely.',
        source_type: 'caller-forged-invalid-value',
        source_filename: 'caller-forged.txt',
        extraction_confidence: 'low',
        note_type_detected: 'imaging_report',
        patient_age: 22,
        patient_sex: 'Other',
        referring_provider_type: 'caller-forged-provider',
        source_extraction_id: 'extraction-1',
      }),
    )

    expect(response.status).toBe(202)
    expect(extractionEqMock).toHaveBeenCalledWith('id', 'extraction-1')
    expect(extractionEqMock).toHaveBeenCalledWith('tenant_id', 'tenant-1')
    expect(extractionSelectMock).toHaveBeenCalledWith(
      expect.stringContaining('patient_age'),
    )
    expect(extractionSelectMock).toHaveBeenCalledWith(
      expect.stringContaining('coverage_report'),
    )
    expect(startSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceExtractionId: 'extraction-1',
        referralText:
          'Raw persisted source says sudden aphasia today and contains enough synthetic text for triage.',
        extractedSummary: 'Persisted authoritative extraction summary.',
        sourceType: 'pdf',
        sourceFilename: 'referral.PDF',
        extractionConfidence: 'high',
        noteTypeDetected: 'referral',
        patientAge: 68,
        patientSex: 'Female',
        referringProviderType: undefined,
      }),
    )
    expect(processTriageMock).toHaveBeenCalledWith(
      'triage-1',
      expect.objectContaining({
        gatewayText:
          'Raw persisted source says sudden aphasia today and contains enough synthetic text for triage.',
        referral_text:
          'Raw persisted source says sudden aphasia today and contains enough synthetic text for triage.',
        textForScoring: 'Persisted authoritative extraction summary.',
        patient_age: 68,
        patient_sex: 'Female',
        referring_provider_type: undefined,
        precomputedGateway: expect.objectContaining({
          carePathway: 'emergency_now',
        }),
      }),
    )
  })

  it('rejects caller-selected patient and consult bindings after preserving bound-source emergency evidence', async () => {
    const response = await POST(
      request({
        source_extraction_id: 'extraction-1',
        patient_id: 'patient-1',
        consult_id: 'consult-1',
      }),
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      reason: 'unverified_patient_binding_not_allowed',
      safety_pathway: 'emergency_now',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
    })
    expect(validateBindingsMock).not.toHaveBeenCalled()
    expect(startSessionMock).not.toHaveBeenCalled()
    expect(runInBackgroundMock).not.toHaveBeenCalled()
  })

  it.each([
    ['patient_id', { patient_id: 'patient-1' }],
    ['consult_id', { consult_id: 'consult-1' }],
    ['create_consult', { create_consult: true }],
  ] as const)(
    'rejects unverified %s on a direct pasted referral before session or downstream workflow creation',
    async (_label, unsafeBinding) => {
      const response = await POST(request(unsafeBinding))

      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({
        reason: 'unverified_patient_binding_not_allowed',
        outpatient_scoring_blocked: true,
        human_review_required: true,
        scheduling_locked: true,
      })
      expect(validateBindingsMock).not.toHaveBeenCalled()
      expect(startSessionMock).not.toHaveBeenCalled()
      expect(runInBackgroundMock).not.toHaveBeenCalled()
    },
  )

  it('does not let an unverified patient binding hide a direct-paste emergency', async () => {
    const emergencyText =
      'Sudden aphasia and right facial droop began twenty minutes ago and remain present.'
    const response = await POST(
      request({ referral_text: emergencyText, patient_id: 'patient-1' }),
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      reason: 'unverified_patient_binding_not_allowed',
      safety_pathway: 'emergency_now',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
    })
    expect(startSessionMock).not.toHaveBeenCalled()
    expect(runInBackgroundMock).not.toHaveBeenCalled()
  })

  it('launches a retry with canonical stored bindings when the caller omits them', async () => {
    startSessionMock.mockResolvedValueOnce({
      ok: true,
      triageSessionId: 'triage-retry',
      launchProcessing: true,
      reused: true,
      processingStatus: 'pending',
      processingAttemptCount: 3,
      patientId: 'patient-stored',
      consultId: 'consult-stored',
    })

    const response = await POST(
      request({ source_extraction_id: 'extraction-1' }),
    )

    expect(response.status).toBe(202)
    expect(processTriageMock).toHaveBeenCalledWith(
      'triage-retry',
      expect.objectContaining({
        patient_id: 'patient-stored',
        existingConsultId: 'consult-stored',
        processingAttemptCount: 3,
      }),
    )
  })

  it('keeps source_type validation for an unbound legacy request', async () => {
    const response = await POST(
      request({ source_type: 'caller-forged-invalid-value' }),
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'Invalid source_type' })
    expect(startSessionMock).not.toHaveBeenCalled()
  })

  it.each([
    ['pdf filename', 'referral.pdf'],
    ['docx filename', 'referral.docx'],
    ['txt filename', 'referral.txt'],
    ['unknown filename', 'referral.bin'],
    ['whitespace filename', '   '],
  ] as const)(
    'rejects an unbound paste request carrying a %s',
    async (_label, sourceFilename) => {
      const response = await POST(
        request({
          source_type: 'paste',
          source_filename: sourceFilename,
        }),
      )

      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({
        reason: 'raw_source_binding_required',
      })
      expect(startSessionMock).not.toHaveBeenCalled()
      expect(processTriageMock).not.toHaveBeenCalled()
    },
  )

  it('continues to accept a legitimate unbound paste without filename metadata', async () => {
    const response = await POST(request({ source_type: 'paste' }))

    expect(response.status).toBe(202)
    expect(startSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: 'paste',
        sourceFilename: undefined,
      }),
    )
  })

  it.each([
    ['blank', '   '],
    ['non-string', { forged: 'extraction-1' }],
    ['null', null],
  ] as const)(
    'rejects a %s supplied source_extraction_id instead of falling back to caller authority',
    async (_label, sourceExtractionId) => {
      const response = await POST(
        request({
          source_extraction_id: sourceExtractionId,
          source_type: 'pdf',
          extracted_summary:
            'Forged caller summary must not become an unbound legacy request.',
        }),
      )

      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({
        reason: 'invalid_source_extraction_id',
      })
      expect(startSessionMock).not.toHaveBeenCalled()
      expect(processTriageMock).not.toHaveBeenCalled()
    },
  )

  it('returns a structured safety hold when routine paste session startup rejects', async () => {
    startSessionMock.mockRejectedValueOnce(
      new Error('synthetic pool connection rejection'),
    )

    const response = await POST(request())

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({
      reason: 'triage_session_start_failed',
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
      immediate_action_required: false,
    })
    expect(runInBackgroundMock).not.toHaveBeenCalled()
    expect(processTriageMock).not.toHaveBeenCalled()
  })

  it('retains deterministic emergency safety when session startup rejects', async () => {
    startSessionMock.mockRejectedValueOnce(
      new Error('synthetic rollback rejection'),
    )

    const response = await POST(
      request({ source_extraction_id: 'extraction-1' }),
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({
      reason: 'triage_session_start_failed',
      safety_pathway: 'emergency_now',
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
      immediate_action_required: true,
    })
    expect(runInBackgroundMock).not.toHaveBeenCalled()
    expect(processTriageMock).not.toHaveBeenCalled()
  })

  it('returns a source-bound 409 while preserving emergency safety when caller identity fields are supplied', async () => {
    const response = await POST(
      request({
        source_extraction_id: 'extraction-1',
        patient_id: 'patient-1',
        consult_id: 'consult-1',
      }),
    )
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body).toMatchObject({
      reason: 'unverified_patient_binding_not_allowed',
      safety_pathway: 'emergency_now',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
    })
    expect(runInBackgroundMock).not.toHaveBeenCalled()
    expect(processTriageMock).not.toHaveBeenCalled()
  })

  it('retains model-only emergency safety when session startup rejects', async () => {
    const rawText = 'Synthetic stable chronic packet detail. '.repeat(1_600)
    const row = await attachGenuinePipeline(
      validAuthoritativeExtractionRow({
        rawText,
        pageTexts: [rawText],
        sourceFilename: 'packet.pdf',
        ingestionMode: 'long_packet',
      }),
      'emergency_now',
    )
    extractionSingleMock.mockResolvedValueOnce({ data: row, error: null })
    startSessionMock.mockRejectedValueOnce(
      new Error('synthetic pool connection rejection'),
    )

    const response = await POST(
      request({ source_extraction_id: 'extraction-1' }),
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({
      reason: 'triage_session_start_failed',
      safety_pathway: 'emergency_now',
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
      immediate_action_required: true,
    })
    expect(runInBackgroundMock).not.toHaveBeenCalled()
    expect(processTriageMock).not.toHaveBeenCalled()
  })

  it.each([
    [
      'routine source',
      'Synthetic stable chronic headache follow-up remains unchanged without new symptoms or functional decline.',
      false,
      undefined,
    ],
    [
      'emergency source',
      'Synthetic current update: sudden right facial droop and aphasia began 20 minutes ago.',
      true,
      'emergency_now',
    ],
    [
      'same-day source',
      'Synthetic referral reports possible new aphasia, but onset and current status are unclear.',
      true,
      'same_day_clinician_review',
    ],
  ] as const)(
    'blocks outpatient scoring for a missing persisted summary while retaining the %s action',
    async (_label, rawText, immediateActionRequired, safetyPathway) => {
      extractionSingleMock.mockResolvedValueOnce({
        data: validAuthoritativeExtractionRow({
          rawText,
          extractedSummary: '   ',
          sourceFilename: null,
        }),
        error: null,
      })

      const response = await POST(
        request({
          source_extraction_id: 'extraction-1',
          extracted_summary: 'Forged nonempty caller summary must not unblock scoring.',
        }),
      )
      const body = await response.json()

      expect(response.status).toBe(409)
      expect(body).toMatchObject({
        reason: 'source_extraction_summary_missing',
        outpatient_scoring_blocked: true,
        human_review_required: true,
        immediate_action_required: immediateActionRequired,
      })
      if (safetyPathway) expect(body.safety_pathway).toBe(safetyPathway)
      else expect(body).not.toHaveProperty('safety_pathway')
      expect(startSessionMock).not.toHaveBeenCalled()
      expect(processTriageMock).not.toHaveBeenCalled()
    },
  )

  it('preserves bounded unlocated emergency evidence on an invalid-manifest 409 hold', async () => {
    const row = validAuthoritativeExtractionRow({
      rawText: `${'Synthetic stable background '.repeat(300)}current update: sudden right facial droop and aphasia began 20 minutes ago`,
    })
    row.source_pages = []
    extractionSingleMock.mockResolvedValueOnce({ data: row, error: null })

    const response = await POST(
      request({ source_extraction_id: 'extraction-1' }),
    )
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body).toMatchObject({
      reason: 'source_extraction_manifest_invalid',
      safety_pathway: 'emergency_now',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
      packet_safety: {
        care_pathway: 'emergency_now',
        review_requirement: 'emergency_action',
        clinician_hold: true,
        signals: expect.arrayContaining([
          expect.objectContaining({
            evidence: expect.arrayContaining([
              expect.objectContaining({
                documentId: null,
                pageNumber: null,
                quote: expect.stringContaining('sudden right facial droop'),
              }),
            ]),
          }),
        ]),
      },
    })
    const projectedQuote = body.packet_safety.signals[0].evidence[0].quote
    expect(projectedQuote.length).toBeLessThanOrEqual(2_000)
    expect(startSessionMock).not.toHaveBeenCalled()
    expect(processTriageMock).not.toHaveBeenCalled()
  })

  it('retains evidence supporting the dominant emergency assertion after six earlier uncertain hits', async () => {
    const uncertain = Array.from(
      { length: 6 },
      (_, index) =>
        `Possible new aphasia episode ${index + 1} today, but onset and current status are unclear.`,
    ).join(' ')
    const present =
      'The patient developed sudden aphasia and right facial droop 20 minutes ago.'
    const row = validAuthoritativeExtractionRow({
      rawText: `${uncertain} ${present}`,
    })
    row.source_pages = []
    extractionSingleMock.mockResolvedValueOnce({ data: row, error: null })

    const body = await (
      await POST(request({ source_extraction_id: 'extraction-1' }))
    ).json()
    const strokeSignal = body.packet_safety.signals.find(
      (signal: { syndrome: string }) =>
        signal.syndrome === 'acute_cerebrovascular',
    )

    expect(strokeSignal).toMatchObject({
      action: 'emergency_now',
      evidence: expect.arrayContaining([
        expect.objectContaining({
          quote: expect.stringContaining('developed sudden aphasia'),
        }),
      ]),
    })
    expect(strokeSignal.evidence).toHaveLength(5)
  })

  it.each([
    [
      'oversized emergency model artifact',
      'Synthetic current update: sudden right facial droop and aphasia began 20 minutes ago.',
      (row: Record<string, unknown>) => {
        row.model_reduce_result = 'x'.repeat(10 * 1024 * 1024 + 1)
      },
      'source_extraction_size_limit_exceeded',
      'emergency_now',
    ],
    [
      'malformed same-day model artifact',
      'Synthetic referral reports possible new aphasia, but onset and current status are unclear.',
      (row: Record<string, unknown>) => {
        row.model_reduce_result = '{"safetyOutcomes":'
      },
      'source_extraction_packet_safety_invalid',
      'same_day_clinician_review',
    ],
  ] as const)(
    'retains deterministic action through a %s hold',
    async (_label, rawText, mutate, reason, safetyPathway) => {
      const row = validAuthoritativeExtractionRow({ rawText })
      mutate(row)
      extractionSingleMock.mockResolvedValueOnce({ data: row, error: null })

      const response = await POST(
        request({ source_extraction_id: 'extraction-1' }),
      )

      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({
        reason,
        safety_pathway: safetyPathway,
        immediate_action_required: true,
        outpatient_scoring_blocked: true,
        human_review_required: true,
        scheduling_locked: true,
      })
      expect(startSessionMock).not.toHaveBeenCalled()
      expect(processTriageMock).not.toHaveBeenCalled()
    },
  )

  it.each([
    [
      'pending status',
      (row: Record<string, unknown>) => {
        row.status = 'pending'
      },
      'source_extraction_not_complete',
    ],
    [
      'legacy coverage',
      (row: Record<string, unknown>) => {
        row.coverage_status = 'legacy_unknown'
      },
      'source_extraction_coverage_incomplete',
    ],
    [
      'reordered pages',
      (row: Record<string, unknown>) => {
        row.source_pages = [
          ...(row.source_pages as unknown[]),
        ].reverse()
      },
      'source_extraction_manifest_invalid',
    ],
    [
      'source digest mismatch',
      (row: Record<string, unknown>) => {
        row.source_sha256 = '0'.repeat(64)
      },
      'source_extraction_digest_invalid',
    ],
    [
      'packet plan mismatch',
      (row: Record<string, unknown>) => {
        const plan = structuredClone(row.packet_plan) as {
          chunks: Array<{ text: string }>
        }
        plan.chunks[0].text = 'tampered source window'
        row.packet_plan = plan
      },
      'source_extraction_packet_plan_invalid',
    ],
    [
      'packet safety mismatch',
      (row: Record<string, unknown>) => {
        row.packet_emergency_result = { status: 'completed' }
      },
      'source_extraction_packet_safety_invalid',
    ],
  ] as const)(
    'returns a structured human-review hold and never starts background scoring for %s',
    async (_label, mutate, reason) => {
      const pageTexts = [
        'Synthetic first page contains stable background history for source authority.',
        'Synthetic second page contains sudden aphasia today and right facial droop.',
      ]
      const row = validAuthoritativeExtractionRow({
        rawText: pageTexts.join('\n\n'),
        pageTexts,
      })
      mutate(row)
      extractionSingleMock.mockResolvedValueOnce({ data: row, error: null })

      const response = await POST(
        request({ source_extraction_id: 'extraction-1' }),
      )
      const body = await response.json()

      expect(response.status).toBe(409)
      expect(body).toMatchObject({
        reason,
        outpatient_scoring_blocked: true,
        human_review_required: true,
      })
      expect(startSessionMock).not.toHaveBeenCalled()
      expect(processTriageMock).not.toHaveBeenCalled()
    },
  )

  it('rejects extracted file triage without a tenant-bound raw source', async () => {
    const response = await POST(
      request({
        referral_text:
          'Stable symptoms in a sufficiently long clinician-edited extraction summary.',
        extracted_summary:
          'Stable symptoms in a sufficiently long clinician-edited extraction summary.',
        source_type: 'pdf',
      }),
    )

    expect(response.status).toBe(409)
    expect(processTriageMock).not.toHaveBeenCalled()
  })

  it('rejects an uploaded source type without a bound extraction even when no summary is supplied', async () => {
    const response = await POST(
      request({
        referral_text:
          'Caller-supplied raw text labeled as a PDF must not bypass persisted source authority.',
        source_type: 'pdf',
      }),
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      reason: 'raw_source_binding_required',
    })
    expect(startSessionMock).not.toHaveBeenCalled()
    expect(processTriageMock).not.toHaveBeenCalled()
  })

  it('rejects an unverified unbound-paste patient binding with a structured routine hold', async () => {
    const response = await POST(
      request({ patient_id: 'missing-patient' }),
    )
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(validateBindingsMock).not.toHaveBeenCalled()
    expect(body).toMatchObject({
      reason: 'unverified_patient_binding_not_allowed',
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
      immediate_action_required: false,
    })
    expect(body).not.toHaveProperty('safety_pathway')
    expect(extractionSingleMock).not.toHaveBeenCalled()
    expect(startSessionMock).not.toHaveBeenCalled()
    expect(runInBackgroundMock).not.toHaveBeenCalled()
    expect(processTriageMock).not.toHaveBeenCalled()
  })

  it.each(['deterministic', 'model-only'] as const)(
    'preserves %s emergency safety while rejecting unverified caller binding fields',
    async (authorityKind) => {
      const row =
        authorityKind === 'model-only'
          ? await attachGenuinePipeline(
              validAuthoritativeExtractionRow({
                rawText: 'Synthetic stable chronic packet detail. '.repeat(1_600),
                sourceFilename: 'packet.pdf',
                ingestionMode: 'long_packet',
              }),
              'emergency_now',
            )
          : validAuthoritativeExtractionRow()
      if (authorityKind === 'model-only') {
        expect(row.packet_emergency_result).toMatchObject({
          carePathway: 'routine_outpatient',
        })
      }
      extractionSingleMock.mockResolvedValueOnce({ data: row, error: null })
      const response = await POST(
        request({
          source_extraction_id: 'extraction-1',
          patient_id: 'patient-1',
          consult_id: 'consult-1',
        }),
      )
      const body = await response.json()

      expect(response.status).toBe(409)
      expect(body).toMatchObject({
        reason: 'unverified_patient_binding_not_allowed',
        outpatient_scoring_blocked: true,
        human_review_required: true,
        scheduling_locked: true,
        immediate_action_required: true,
        safety_pathway: 'emergency_now',
      })
      expect(extractionSingleMock).toHaveBeenCalled()
      expect(validateBindingsMock).not.toHaveBeenCalled()
      expect(startSessionMock).not.toHaveBeenCalled()
      expect(runInBackgroundMock).not.toHaveBeenCalled()
      expect(processTriageMock).not.toHaveBeenCalled()
    },
  )

  it('returns a structured pathless hold for a routine source with unverified caller binding fields', async () => {
    const routineText =
      'Synthetic stable chronic headache follow-up remains unchanged without new symptoms or functional decline.'
    extractionSingleMock.mockResolvedValueOnce({
      data: validAuthoritativeExtractionRow({ rawText: routineText }),
      error: null,
    })
    const response = await POST(
      request({
        source_extraction_id: 'extraction-1',
        consult_id: 'missing-consult',
      }),
    )
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body).toMatchObject({
      reason: 'unverified_patient_binding_not_allowed',
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
      immediate_action_required: false,
    })
    expect(body).not.toHaveProperty('safety_pathway')
    expect(startSessionMock).not.toHaveBeenCalled()
    expect(runInBackgroundMock).not.toHaveBeenCalled()
    expect(processTriageMock).not.toHaveBeenCalled()
  })

  it('accepts a verified long extraction and passes precomputed full-packet safety instead of one-shot raw modeling', async () => {
    const rawText = `${'Stable synthetic packet background. '.repeat(1_700)}The patient developed sudden aphasia and right facial droop 20 minutes ago.`
    const row = await attachGenuinePipeline(
      validAuthoritativeExtractionRow({
        rawText,
        pageTexts: [rawText],
        extractedSummary: 'Verified summary with sudden aphasia.',
        sourceFilename: 'packet.pdf',
        patientAge: 72,
        patientSex: 'Male',
        ingestionMode: 'long_packet',
      }),
    )
    const canonicalSummary = row.extracted_summary as string
    extractionSingleMock.mockResolvedValueOnce({
      data: row,
      error: null,
    })

    const response = await POST(
      request({
        source_type: 'pdf',
        source_extraction_id: 'extraction-1',
        extracted_summary: 'Verified summary with sudden aphasia.',
      }),
    )

    expect(response.status).toBe(202)
    expect(processTriageMock).toHaveBeenCalledWith(
      'triage-1',
      expect.objectContaining({
        gatewayText: rawText,
        textForScoring: expect.stringContaining(
          'Canonical source-bound extraction summary:',
        ),
        coverageStatus: 'complete',
        precomputedGateway: expect.objectContaining({
          carePathway: 'emergency_now',
        }),
        precomputedSafetyResult: expect.objectContaining({
          carePathway: 'no_time_critical_signal',
        }),
        adjudicationText: expect.stringContaining(
          canonicalSummary,
        ),
      }),
    )
    const backgroundInput = processTriageMock.mock.calls[0][1]
    expect(backgroundInput.textForScoring).toContain(canonicalSummary)
    expect(backgroundInput.textForScoring).toContain(
      'Deterministic safety evidence:',
    )
    expect(backgroundInput.textForScoring).toContain('Model safety evidence:')
    expect(backgroundInput.textForScoring.length).toBeLessThanOrEqual(40_000)
  })

  it('puts model-only emergency evidence into the bounded outpatient scoring text', async () => {
    const rawText = 'Synthetic stable packet background. '.repeat(1_700)
    const row = await attachGenuinePipeline(
      validAuthoritativeExtractionRow({
        rawText,
        pageTexts: [rawText],
        sourceFilename: 'packet.pdf',
        ingestionMode: 'long_packet',
      }),
      'emergency_now',
    )
    extractionSingleMock.mockResolvedValueOnce({ data: row, error: null })

    const response = await POST(
      request({ source_extraction_id: 'extraction-1' }),
    )
    const backgroundInput = processTriageMock.mock.calls[0][1]

    expect(response.status).toBe(202)
    expect(backgroundInput.precomputedGateway).toMatchObject({
      carePathway: 'routine_outpatient',
    })
    expect(backgroundInput.precomputedSafetyResult).toMatchObject({
      carePathway: 'emergency_now',
    })
    expect(backgroundInput.textForScoring).toContain('Model safety evidence:')
    expect(backgroundInput.textForScoring).toContain('model_only_emergency')
    expect(backgroundInput.textForScoring).toContain(
      'Synthetic stable packet background',
    )
    expect(backgroundInput.textForScoring.length).toBeLessThanOrEqual(40_000)
  })

  it('blocks a persisted stable long-packet summary that does not match the validated pipeline before it can become scoring text', async () => {
    const rawText = 'Synthetic stable packet background. '.repeat(1_700)
    const row = await attachGenuinePipeline(
      validAuthoritativeExtractionRow({
        rawText,
        pageTexts: [rawText],
        sourceFilename: 'packet.pdf',
        ingestionMode: 'long_packet',
      }),
    )
    row.extracted_summary =
      'Fabricated stable summary that is not derived from the validated packet pipeline.'
    extractionSingleMock.mockResolvedValueOnce({ data: row, error: null })

    const response = await POST(
      request({ source_extraction_id: 'extraction-1' }),
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      reason: 'source_extraction_metadata_invalid',
      outpatient_scoring_blocked: true,
      human_review_required: true,
    })
    expect(extractionSelectMock).toHaveBeenCalledWith(
      expect.stringContaining('key_findings'),
    )
    expect(startSessionMock).not.toHaveBeenCalled()
    expect(processTriageMock).not.toHaveBeenCalled()
  })

  it('blocks scoring for an exact ten-chunk row with fabricated complete counters and zero outcomes', async () => {
    const rawText = 'x'.repeat(71_000)
    const row = validAuthoritativeExtractionRow({
      rawText,
      pageTexts: [rawText],
      sourceFilename: 'ten-chunk-packet.pdf',
      ingestionMode: 'long_packet',
    })
    const plan = row.packet_plan as LongPacketPlan
    expect(plan.chunks).toHaveLength(10)
    const expectedChunkCount = plan.chunks.length
    const coverage = {
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
    row.model_map_result = coverage
    row.model_reduce_result = {
      version: 'neurology-long-packet-model-pipeline-v1',
      status: 'completed',
      coverageStatus: 'complete',
      clinicianHold: false,
      carePathway: 'routine_outpatient',
      reviewRequirement: 'clinician_confirmation',
      schedulingLocked: true,
      mapperCoverage: coverage,
      safetyCoverage: coverage,
      mapperOutcomes: [],
      safetyOutcomes: [],
      factsByCategory: Object.fromEntries(
        LONG_PACKET_FACT_CATEGORIES.map((category) => [category, []]),
      ),
      conflicts: [],
      criticalUnknowns: [],
      safetySignals: [],
      requiredSafetyEvidenceIds: [],
      narrativeSafetyManifestId: null,
      narrative: null,
      failureCodes: [],
    }
    extractionSingleMock.mockResolvedValueOnce({ data: row, error: null })

    const response = await POST(
      request({ source_extraction_id: 'extraction-1' }),
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      reason: 'source_extraction_packet_safety_invalid',
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
    })
    expect(startSessionMock).not.toHaveBeenCalled()
    expect(processTriageMock).not.toHaveBeenCalled()
  })

  it.each([
    [
      'partial outcomes',
      (pipeline: LongPacketModelPipelineResult) => {
        pipeline.mapperOutcomes = pipeline.mapperOutcomes.slice(1)
      },
    ],
    [
      'duplicate outcomes',
      (pipeline: LongPacketModelPipelineResult) => {
        pipeline.safetyOutcomes.push(pipeline.safetyOutcomes[0])
      },
    ],
    [
      'tampered provenance',
      (pipeline: LongPacketModelPipelineResult) => {
        pipeline.mapperOutcomes[0] = {
          ...pipeline.mapperOutcomes[0],
          chunkProvenanceSha256: 'f'.repeat(64),
        }
      },
    ],
  ] as const)('blocks scoring for %s', async (_label, mutate) => {
    const rawText = 'Synthetic stable chronic packet detail. '.repeat(1_600)
    const row = await attachGenuinePipeline(
      validAuthoritativeExtractionRow({
        rawText,
        pageTexts: [rawText],
        sourceFilename: 'packet.pdf',
        ingestionMode: 'long_packet',
      }),
    )
    const pipeline = structuredClone(
      row.model_reduce_result,
    ) as LongPacketModelPipelineResult
    mutate(pipeline)
    row.model_reduce_result = pipeline
    extractionSingleMock.mockResolvedValueOnce({ data: row, error: null })

    const response = await POST(
      request({ source_extraction_id: 'extraction-1' }),
    )

    expect(response.status).toBe(409)
    expect(startSessionMock).not.toHaveBeenCalled()
    expect(processTriageMock).not.toHaveBeenCalled()
  })

  it.each([
    ['emergency_now', 'emergency_now'],
    ['same_day_clinician_review', 'same_day_clinician_review'],
  ] as const)(
    'preserves model-only %s when the persisted summary is missing',
    async (modelPathway, expectedPathway) => {
      const rawText = 'Synthetic stable chronic packet detail. '.repeat(1_600)
      const row = await attachGenuinePipeline(
        validAuthoritativeExtractionRow({
          rawText,
          pageTexts: [rawText],
          extractedSummary: null,
          sourceFilename: 'packet.pdf',
          ingestionMode: 'long_packet',
        }),
        modelPathway,
      )
      expect(row.packet_emergency_result).toMatchObject({
        carePathway: 'routine_outpatient',
      })
      extractionSingleMock.mockResolvedValueOnce({ data: row, error: null })

      const response = await POST(
        request({ source_extraction_id: 'extraction-1' }),
      )

      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({
        reason: 'source_extraction_summary_missing',
        safety_pathway: expectedPathway,
        immediate_action_required: true,
      })
      expect(startSessionMock).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['emergency_now', 'emergency_now'],
    ['same_day_clinician_review', 'same_day_clinician_review'],
  ] as const)(
    'preserves model-only %s when session startup fails',
    async (modelPathway, expectedPathway) => {
      const rawText = 'Synthetic stable chronic packet detail. '.repeat(1_600)
      const row = await attachGenuinePipeline(
        validAuthoritativeExtractionRow({
          rawText,
          pageTexts: [rawText],
          sourceFilename: 'packet.pdf',
          ingestionMode: 'long_packet',
        }),
        modelPathway,
      )
      extractionSingleMock.mockResolvedValueOnce({ data: row, error: null })
      startSessionMock.mockResolvedValueOnce({
        ok: false,
        reason: 'persistence_failed',
      })

      const response = await POST(
        request({ source_extraction_id: 'extraction-1' }),
      )

      expect(response.status).toBe(503)
      expect(await response.json()).toMatchObject({
        reason: 'triage_session_start_failed',
        safety_pathway: expectedPathway,
        immediate_action_required: true,
      })
      expect(processTriageMock).not.toHaveBeenCalled()
    },
  )

  it('reuses an ingestion safety session and does not duplicate an active model run', async () => {
    startSessionMock.mockResolvedValueOnce({
      ok: true,
      triageSessionId: 'triage-ingress-1',
      launchProcessing: false,
      reused: true,
      processingStatus: 'pending',
    })

    const response = await POST(
      request({
        source_type: 'pdf',
        source_extraction_id: 'extraction-1',
      }),
    )
    const body = await response.json()

    expect(response.status).toBe(202)
    expect(body).toMatchObject({
      session_id: 'triage-ingress-1',
      status: 'pending',
      reused: true,
      processing_started: false,
    })
    expect(runInBackgroundMock).not.toHaveBeenCalled()
    expect(processTriageMock).not.toHaveBeenCalled()
  })

  it('returns the canonical completed session without starting another run', async () => {
    startSessionMock.mockResolvedValueOnce({
      ok: true,
      triageSessionId: 'triage-complete-1',
      launchProcessing: false,
      reused: true,
      processingStatus: 'complete',
    })

    const response = await POST(
      request({
        source_type: 'pdf',
        source_extraction_id: 'extraction-1',
      }),
    )
    const body = await response.json()

    expect(response.status).toBe(202)
    expect(body.status).toBe('complete')
    expect(body.session_id).toBe('triage-complete-1')
    expect(runInBackgroundMock).not.toHaveBeenCalled()
  })

  it('returns verified source-bound emergency state in every successful start response', async () => {
    const response = await POST(
      request({ source_extraction_id: 'extraction-1' }),
    )
    const body = await response.json()

    expect(response.status).toBe(202)
    expect(body).toMatchObject({
      session_id: 'triage-1',
      status: 'pending',
      safety_pathway: 'emergency_now',
      immediate_review_required: true,
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
      safety_triage_session_id: 'triage-1',
    })
  })

  it('preserves the authoritative emergency pathway when session startup fails', async () => {
    startSessionMock.mockResolvedValueOnce({
      ok: false,
      reason: 'persistence_failed',
    })

    const response = await POST(
      request({ source_extraction_id: 'extraction-1' }),
    )
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body).toMatchObject({
      reason: 'triage_session_start_failed',
      safety_pathway: 'emergency_now',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      human_review_required: true,
    })
    expect(runInBackgroundMock).not.toHaveBeenCalled()
    expect(processTriageMock).not.toHaveBeenCalled()
  })
})
