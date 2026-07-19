import { readFileSync } from 'node:fs'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  authorizeMock,
  fromMock,
  insertMock,
  updateMock,
  eqMock,
  updateEqMock,
  updateSelectMock,
  updateSingleMock,
  selectMock,
  singleMock,
  runInBackgroundMock,
  createIngressMock,
  notifyMock,
  extractPdfTextMock,
  buildExtractionUserPromptMock,
  invokeBedrockClinicalJSONMock,
} = vi.hoisted(() => ({
  authorizeMock: vi.fn(),
  fromMock: vi.fn(),
  insertMock: vi.fn(),
  updateMock: vi.fn(),
  eqMock: vi.fn(),
  updateEqMock: vi.fn(),
  updateSelectMock: vi.fn(),
  updateSingleMock: vi.fn(),
  selectMock: vi.fn(),
  singleMock: vi.fn(),
  runInBackgroundMock: vi.fn(),
  createIngressMock: vi.fn(),
  notifyMock: vi.fn(),
  extractPdfTextMock: vi.fn(),
  buildExtractionUserPromptMock: vi.fn(),
  invokeBedrockClinicalJSONMock: vi.fn(),
}))

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
  clinicalAccessDeniedMessage: () => 'Access denied',
}))
vi.mock('@/lib/db-query', () => ({ from: fromMock }))
vi.mock('@/lib/triage/asyncRunner', () => ({
  runInBackground: runInBackgroundMock,
}))
vi.mock('@/lib/triage/ingressSafetyWorkflow', () => ({
  createIngressSafetyWorkflow: createIngressMock,
}))
vi.mock('@/lib/notifications', () => ({ notifyTriageUrgent: notifyMock }))
vi.mock('unpdf', () => ({ extractText: extractPdfTextMock }))
vi.mock('@/lib/triage/extractionPrompt', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/lib/triage/extractionPrompt')
  >()
  return {
    ...actual,
    buildExtractionUserPrompt: (
      ...args: Parameters<typeof actual.buildExtractionUserPrompt>
    ) => {
      buildExtractionUserPromptMock(...args)
      return actual.buildExtractionUserPrompt(...args)
    },
  }
})
vi.mock('@/lib/bedrock', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/bedrock')>()
  return {
    ...actual,
    invokeBedrockClinicalJSON: invokeBedrockClinicalJSONMock,
  }
})

import { POST } from '../route'
import { longPacketSourceDigest } from '@/lib/triage/longPacketIngestion'

function jsonRequest(
  text: string,
  metadata: { patientAge?: unknown; patientSex?: unknown } = {},
) {
  const body: Record<string, unknown> = { text }
  if ('patientAge' in metadata) body.patient_age = metadata.patientAge
  if ('patientSex' in metadata) body.patient_sex = metadata.patientSex

  return new Request('http://localhost/api/triage/extract', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function multipartRequest(
  files: File[],
  metadata: {
    patientAge?: string
    patientSex?: string
    additionalEntries?: Array<[string, string | File]>
  } = {},
) {
  const formData = new FormData()
  for (const file of files) {
    formData.append('file', file)
  }
  if (metadata.patientAge !== undefined) {
    formData.set('patient_age', metadata.patientAge)
  }
  if (metadata.patientSex !== undefined) {
    formData.set('patient_sex', metadata.patientSex)
  }
  for (const [key, value] of metadata.additionalEntries ?? []) {
    if (typeof value === 'string') {
      formData.append(key, value)
    } else {
      formData.append(key, value)
    }
  }

  return new Request('http://localhost/api/triage/extract', {
    method: 'POST',
    body: formData,
  })
}

function validReferralFile() {
  return new File(
    [
      'Synthetic referral with stable symptoms and routine outpatient neurology evaluation requested.',
    ],
    'synthetic-referral.txt',
    { type: 'text/plain' },
  )
}

describe('triage extraction route safety', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authorizeMock.mockResolvedValue({
      ok: true,
      context: {
        userId: 'clinician-1',
        email: 'clinician@example.test',
        tenantId: 'tenant-1',
        role: 'clinician',
      },
    })
    singleMock.mockResolvedValue({ data: { id: 'extraction-1' }, error: null })
    selectMock.mockReturnValue({ single: singleMock })
    insertMock.mockReturnValue({ select: selectMock })
    eqMock.mockReturnValue({ eq: eqMock })
    const updateChain = {
      eq: updateEqMock,
      select: updateSelectMock,
      single: updateSingleMock,
    }
    updateEqMock.mockReturnValue(updateChain)
    updateSelectMock.mockReturnValue(updateChain)
    updateSingleMock.mockResolvedValue({
      data: { id: 'extraction-1' },
      error: null,
    })
    updateMock.mockReturnValue(updateChain)
    fromMock.mockReturnValue({ insert: insertMock, update: updateMock })
    createIngressMock.mockResolvedValue({
      ok: true,
      triageSessionId: 'triage-ingress-1',
    })
    invokeBedrockClinicalJSONMock.mockResolvedValue({
      parsed: {
        note_type_detected: 'referral',
        extraction_confidence: 'high',
        extracted_summary: 'Synthetic outpatient referral summary.',
        key_findings: {
          chief_complaint: 'Stable synthetic symptom',
          neurological_symptoms: [],
          timeline: '',
          relevant_history: '',
          medications_and_therapies: [],
          failed_therapies: [],
          imaging_results: [],
          red_flags_noted: [],
          functional_status: '',
        },
      },
      inputTokens: 10,
      outputTokens: 20,
    })
  })

  it('rejects unauthenticated extraction before parsing or persistence', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await POST(jsonRequest('x'.repeat(100)))

    expect(response.status).toBe(401)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('rejects multipart input with no referral file before persistence or model work', async () => {
    const response = await POST(multipartRequest([]))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toMatchObject({
      reason: 'exactly_one_referral_file_required',
    })
    expect(fromMock).not.toHaveBeenCalled()
    expect(runInBackgroundMock).not.toHaveBeenCalled()
    expect(extractPdfTextMock).not.toHaveBeenCalled()
  })

  it('continues normally for one valid multipart referral file', async () => {
    const response = await POST(multipartRequest([validReferralFile()]))

    expect(response.status).toBe(202)
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source_filename: 'synthetic-referral.txt',
        patient_age: null,
        patient_sex: null,
      }),
    )
    expect(runInBackgroundMock).toHaveBeenCalledOnce()
  })

  it('persists a bound emergency workflow for a short explicit stroke note and blocks extraction scoring', async () => {
    const shortEmergency = 'Sudden aphasia and right facial droop now.'

    const response = await POST(jsonRequest(shortEmergency))
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body).toMatchObject({
      extraction_id: 'extraction-1',
      reason: 'referral_text_below_minimum_time_critical',
      safety_pathway: 'emergency_now',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
      safety_triage_session_id: 'triage-ingress-1',
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
    expect(insertMock).toHaveBeenCalledOnce()
    expect(createIngressMock).toHaveBeenCalledWith(
      expect.objectContaining({
        extractionId: 'extraction-1',
        tenantId: 'tenant-1',
        gateway: expect.objectContaining({ carePathway: 'emergency_now' }),
      }),
    )
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error' }),
    )
    expect(runInBackgroundMock).not.toHaveBeenCalled()
    expect(invokeBedrockClinicalJSONMock).not.toHaveBeenCalled()
  })

  it('keeps a short routine note rejected without persistence or routine authorization', async () => {
    const response = await POST(jsonRequest('Stable headache.'))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toMatchObject({
      error: expect.stringContaining('at least 50 characters'),
    })
    expect(body).not.toHaveProperty('safety_pathway')
    expect(fromMock).not.toHaveBeenCalled()
    expect(createIngressMock).not.toHaveBeenCalled()
    expect(runInBackgroundMock).not.toHaveBeenCalled()
  })

  it('persists a tenant-bound emergency workflow before rejecting invalid JSON age metadata', async () => {
    const shortEmergency = 'Sudden aphasia and right facial droop now.'

    const response = await POST(
      jsonRequest(shortEmergency, { patientAge: 'malformed' }),
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toMatchObject({
      reason: 'invalid_patient_age',
      safety_pathway: 'emergency_now',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
      safety_triage_session_id: 'triage-ingress-1',
      packet_safety: {
        care_pathway: 'emergency_now',
        signals: [
          expect.objectContaining({
            evidence: [expect.objectContaining({ quote: shortEmergency })],
          }),
        ],
      },
    })
    expect(body).toMatchObject({ extraction_id: 'extraction-1' })
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 'tenant-1',
        text_input: shortEmergency,
        source_filename: null,
        patient_age: null,
        patient_sex: null,
        coverage_status: 'complete',
        packet_emergency_result: expect.objectContaining({
          carePathway: 'emergency_now',
        }),
        status: 'error',
        error_message:
          'patient_age must be a whole number from 0 through 130.',
      }),
    )
    expect(createIngressMock).toHaveBeenCalledWith(
      expect.objectContaining({
        extractionId: 'extraction-1',
        tenantId: 'tenant-1',
        sourceType: 'paste',
        coverageStatus: 'complete',
        gateway: expect.objectContaining({ carePathway: 'emergency_now' }),
      }),
    )
    expect(runInBackgroundMock).not.toHaveBeenCalled()
    expect(invokeBedrockClinicalJSONMock).not.toHaveBeenCalled()
  })

  it('retains the OCR, manual-review, and scoring hold for a routine partial PDF with invalid demographics', async () => {
    extractPdfTextMock.mockResolvedValueOnce({
      text: [
        'Stable synthetic native referral context.',
        '',
        'Routine outpatient follow up requested.',
      ],
      totalPages: 3,
    })

    const response = await POST(
      multipartRequest(
        [
          new File(['synthetic PDF bytes'], 'invalid-age-routine.pdf', {
            type: 'application/pdf',
          }),
        ],
        { patientAge: '131' },
      ),
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toMatchObject({
      reason: 'invalid_patient_age',
      source_hold_reason: 'ocr_required',
      coverage_status: 'failed',
      total_page_count: 3,
      available_page_numbers: [1, 3],
      missing_page_numbers: [2],
      immediate_review_required: false,
      immediate_action_required: false,
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
      safety_triage_session_id: null,
    })
    expect(body).not.toHaveProperty('packet_safety')
    expect(body).not.toHaveProperty('extraction_id')
    expect(fromMock).not.toHaveBeenCalled()
    expect(createIngressMock).not.toHaveBeenCalled()
    expect(runInBackgroundMock).not.toHaveBeenCalled()
    expect(invokeBedrockClinicalJSONMock).not.toHaveBeenCalled()
  })

  it('persists a tenant-bound same-day workflow before rejecting invalid JSON sex metadata', async () => {
    const shortUncertain = 'Possible new aphasia; current status unclear.'

    const response = await POST(
      jsonRequest(shortUncertain, { patientSex: 'Unknown' }),
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toMatchObject({
      reason: 'invalid_patient_sex',
      safety_pathway: 'same_day_clinician_review',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
      safety_triage_session_id: 'triage-ingress-1',
      packet_safety: {
        care_pathway: 'same_day_clinician_review',
        review_requirement: 'immediate_clinician_review',
      },
    })
    expect(body).toMatchObject({ extraction_id: 'extraction-1' })
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 'tenant-1',
        text_input: shortUncertain,
        patient_age: null,
        patient_sex: null,
        status: 'error',
        error_message: 'patient_sex must be Male, Female, or Other.',
      }),
    )
    expect(createIngressMock).toHaveBeenCalledWith(
      expect.objectContaining({
        extractionId: 'extraction-1',
        tenantId: 'tenant-1',
        sourceType: 'paste',
        coverageStatus: 'complete',
        gateway: expect.objectContaining({
          carePathway: 'same_day_clinician_review',
        }),
      }),
    )
    expect(runInBackgroundMock).not.toHaveBeenCalled()
    expect(invokeBedrockClinicalJSONMock).not.toHaveBeenCalled()
  })

  it('persists exact complete native-PDF evidence before rejecting invalid sex metadata', async () => {
    const firstPage =
      'Synthetic complete referral page one with baseline neurologic history.'
    const emergencyPage =
      'The patient developed sudden aphasia and right facial droop 20 minutes ago.'
    extractPdfTextMock.mockResolvedValueOnce({
      text: [firstPage, emergencyPage],
      totalPages: 2,
    })

    const response = await POST(
      multipartRequest(
        [
          new File(['synthetic PDF bytes'], 'invalid-sex-complete.pdf', {
            type: 'application/pdf',
          }),
        ],
        { patientSex: 'Unknown' },
      ),
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toMatchObject({
      error: 'patient_sex must be Male, Female, or Other.',
      reason: 'invalid_patient_sex',
      extraction_id: 'extraction-1',
      safety_pathway: 'emergency_now',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
      safety_triage_session_id: 'triage-ingress-1',
    })
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 'tenant-1',
        text_input: `${firstPage}\n\n${emergencyPage}`,
        source_filename: 'invalid-sex-complete.pdf',
        patient_age: null,
        patient_sex: null,
        original_text_length: `${firstPage}\n\n${emergencyPage}`.length,
        ingestion_mode: 'single_pass',
        coverage_status: 'complete',
        packet_emergency_result: expect.objectContaining({
          carePathway: 'emergency_now',
        }),
        status: 'error',
        error_message: 'patient_sex must be Male, Female, or Other.',
      }),
    )
    expect(
      JSON.parse(String(insertMock.mock.calls[0][0].source_pages)),
    ).toStrictEqual([
      {
        documentId: 'document-1',
        pageNumber: 1,
        text: firstPage,
        extractionMethod: 'native_text',
        extractionConfidence: null,
      },
      {
        documentId: 'document-1',
        pageNumber: 2,
        text: emergencyPage,
        extractionMethod: 'native_text',
        extractionConfidence: null,
      },
    ])
    expect(createIngressMock).toHaveBeenCalledWith(
      expect.objectContaining({
        extractionId: 'extraction-1',
        tenantId: 'tenant-1',
        sourceType: 'pdf',
        coverageStatus: 'complete',
        gateway: expect.objectContaining({ carePathway: 'emergency_now' }),
      }),
    )
    expect(runInBackgroundMock).not.toHaveBeenCalled()
    expect(invokeBedrockClinicalJSONMock).not.toHaveBeenCalled()
  })

  it('fails closed when invalid-demographic complete-source safety persistence is unavailable', async () => {
    const text =
      'Synthetic complete referral: sudden aphasia and right facial droop began 20 minutes ago.'
    singleMock.mockResolvedValueOnce({
      data: null,
      error: new Error('synthetic invalid-demographic insert failure'),
    })

    const response = await POST(
      jsonRequest(text, { patientAge: 'malformed' }),
    )
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body).toMatchObject({
      error: expect.stringMatching(/escalate manually now/i),
      reason: 'extraction_persistence_unavailable',
      validation_reason: 'invalid_patient_age',
      safety_pathway: 'emergency_now',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
      safety_triage_session_id: null,
    })
    expect(body).not.toHaveProperty('extraction_id')
    expect(createIngressMock).not.toHaveBeenCalled()
    expect(runInBackgroundMock).not.toHaveBeenCalled()
    expect(invokeBedrockClinicalJSONMock).not.toHaveBeenCalled()
  })

  it('fails closed when an invalid-demographic complete-PDF safety workflow is unavailable', async () => {
    extractPdfTextMock.mockResolvedValueOnce({
      text: [
        'Synthetic complete referral context with sudden aphasia and right facial droop now.',
      ],
      totalPages: 1,
    })
    createIngressMock.mockResolvedValueOnce({
      ok: false,
      reason: 'persistence_failed',
    })

    const response = await POST(
      multipartRequest(
        [
          new File(['synthetic PDF bytes'], 'workflow-failure-complete.pdf', {
            type: 'application/pdf',
          }),
        ],
        { patientSex: 'Unknown' },
      ),
    )
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body).toMatchObject({
      error: expect.stringMatching(/escalate manually now/i),
      reason: 'ingress_safety_workflow_unavailable',
      validation_reason: 'invalid_patient_sex',
      extraction_id: 'extraction-1',
      safety_pathway: 'emergency_now',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
      safety_triage_session_id: null,
    })
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 'tenant-1',
        patient_age: null,
        patient_sex: null,
        status: 'error',
      }),
    )
    expect(runInBackgroundMock).not.toHaveBeenCalled()
    expect(invokeBedrockClinicalJSONMock).not.toHaveBeenCalled()
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('persists a short uncertain neurologic signal as a same-day workflow', async () => {
    const shortUncertain = 'Possible new aphasia; current status unclear.'

    const response = await POST(jsonRequest(shortUncertain))
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body).toMatchObject({
      safety_pathway: 'same_day_clinician_review',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      safety_triage_session_id: 'triage-ingress-1',
      packet_safety: {
        care_pathway: 'same_day_clinician_review',
        review_requirement: 'immediate_clinician_review',
      },
    })
    expect(createIngressMock).toHaveBeenCalledWith(
      expect.objectContaining({
        gateway: expect.objectContaining({
          carePathway: 'same_day_clinician_review',
        }),
      }),
    )
    expect(runInBackgroundMock).not.toHaveBeenCalled()
  })

  it('preserves short-note emergency evidence in the manual hold when workflow persistence fails', async () => {
    const shortEmergency = 'Sudden aphasia and right facial droop now.'
    createIngressMock.mockResolvedValueOnce({
      ok: false,
      reason: 'persistence_failed',
    })

    const response = await POST(jsonRequest(shortEmergency))
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body).toMatchObject({
      reason: 'ingress_safety_workflow_unavailable',
      safety_pathway: 'emergency_now',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      safety_triage_session_id: null,
      packet_safety: {
        care_pathway: 'emergency_now',
        signals: [
          expect.objectContaining({
            evidence: [expect.objectContaining({ quote: shortEmergency })],
          }),
        ],
      },
    })
    expect(runInBackgroundMock).not.toHaveBeenCalled()
  })

  it('does not advertise a pending extraction when the short-note terminal block cannot be confirmed', async () => {
    const shortEmergency = 'Sudden aphasia and right facial droop now.'
    updateSingleMock.mockResolvedValueOnce({
      data: null,
      error: new Error('synthetic terminal checkpoint failure'),
    })

    const response = await POST(jsonRequest(shortEmergency))
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body).toMatchObject({
      reason: 'short_referral_extraction_block_unavailable',
      safety_pathway: 'emergency_now',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
      safety_triage_session_id: 'triage-ingress-1',
      packet_safety: {
        care_pathway: 'emergency_now',
        signals: [
          expect.objectContaining({
            evidence: [expect.objectContaining({ quote: shortEmergency })],
          }),
        ],
      },
    })
    expect(body).not.toHaveProperty('extraction_id')
    expect(createIngressMock).toHaveBeenCalledOnce()
    expect(runInBackgroundMock).not.toHaveBeenCalled()
    expect(invokeBedrockClinicalJSONMock).not.toHaveBeenCalled()
  })

  it('preserves the actionable workflow when the short-note terminal checkpoint rejects', async () => {
    const shortEmergency = 'Sudden aphasia and right facial droop now.'
    updateSingleMock.mockRejectedValueOnce(
      new Error('synthetic terminal checkpoint rejection'),
    )

    const response = await POST(jsonRequest(shortEmergency))
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body).toMatchObject({
      reason: 'short_referral_extraction_block_unavailable',
      safety_pathway: 'emergency_now',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      safety_triage_session_id: 'triage-ingress-1',
    })
    expect(body).not.toHaveProperty('extraction_id')
    expect(createIngressMock).toHaveBeenCalledOnce()
    expect(runInBackgroundMock).not.toHaveBeenCalled()
    expect(invokeBedrockClinicalJSONMock).not.toHaveBeenCalled()
  })

  it('rejects two multipart file parts before parsing, persistence, or model work', async () => {
    const response = await POST(
      multipartRequest([
        new File(['synthetic PDF one'], 'synthetic-one.pdf', {
          type: 'application/pdf',
        }),
        new File(['synthetic PDF two'], 'synthetic-two.pdf', {
          type: 'application/pdf',
        }),
      ]),
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toMatchObject({
      reason: 'exactly_one_referral_file_required',
    })
    expect(extractPdfTextMock).not.toHaveBeenCalled()
    expect(fromMock).not.toHaveBeenCalled()
    expect(runInBackgroundMock).not.toHaveBeenCalled()
  })

  it('rejects a non-file multipart value at the file trust boundary', async () => {
    const formData = new FormData()
    formData.set('file', 'not-a-file')

    const response = await POST(
      new Request('http://localhost/api/triage/extract', {
        method: 'POST',
        body: formData,
      }),
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toMatchObject({
      reason: 'exactly_one_referral_file_required',
    })
    expect(fromMock).not.toHaveBeenCalled()
    expect(runInBackgroundMock).not.toHaveBeenCalled()
  })

  it('safety-screens then rejects duplicate multipart patient age fields without persistence', async () => {
    extractPdfTextMock.mockResolvedValueOnce({
      text: ['Stable synthetic routine referral context.'],
      totalPages: 1,
    })
    const response = await POST(
      multipartRequest(
        [
          new File(['synthetic PDF'], 'synthetic-referral.pdf', {
            type: 'application/pdf',
          }),
        ],
        {
          patientAge: '65',
          additionalEntries: [['patient_age', '66']],
        },
      ),
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toMatchObject({ reason: 'invalid_patient_age' })
    expect(extractPdfTextMock).toHaveBeenCalledOnce()
    expect(fromMock).not.toHaveBeenCalled()
    expect(runInBackgroundMock).not.toHaveBeenCalled()
  })

  it('safety-screens then rejects duplicate multipart patient sex fields without persistence', async () => {
    extractPdfTextMock.mockResolvedValueOnce({
      text: ['Stable synthetic routine referral context.'],
      totalPages: 1,
    })
    const response = await POST(
      multipartRequest(
        [
          new File(['synthetic PDF'], 'synthetic-referral.pdf', {
            type: 'application/pdf',
          }),
        ],
        {
          patientSex: 'Female',
          additionalEntries: [['patient_sex', 'Other']],
        },
      ),
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toMatchObject({ reason: 'invalid_patient_sex' })
    expect(extractPdfTextMock).toHaveBeenCalledOnce()
    expect(fromMock).not.toHaveBeenCalled()
    expect(runInBackgroundMock).not.toHaveBeenCalled()
  })

  it('rejects an additional binary multipart entry under a noncanonical key', async () => {
    const response = await POST(
      multipartRequest(
        [
          new File(['canonical PDF'], 'canonical-referral.pdf', {
            type: 'application/pdf',
          }),
        ],
        {
          additionalEntries: [
            [
              'attachment',
              new File(['extra PDF'], 'extra-referral.pdf', {
                type: 'application/pdf',
              }),
            ],
          ],
        },
      ),
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toMatchObject({
      reason: 'exactly_one_referral_file_required',
    })
    expect(extractPdfTextMock).not.toHaveBeenCalled()
    expect(fromMock).not.toHaveBeenCalled()
    expect(runInBackgroundMock).not.toHaveBeenCalled()
  })

  it('uses a runtime-safe structural binary check without the global File constructor', () => {
    const routeSource = readFileSync(
      `${process.cwd()}/src/app/api/triage/extract/route.ts`,
      'utf8',
    )

    expect(routeSource).not.toContain('instanceof File')
    expect(routeSource).toContain('isBinaryFormDataValue')
  })

  it.each(['malformed', '42.5', 'NaN', '-1', '131', '1e2', ' 65 '])(
    'rejects invalid multipart patient age %s before persistence or model work',
    async (patientAge) => {
      const response = await POST(
        multipartRequest([validReferralFile()], { patientAge }),
      )
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body).toMatchObject({ reason: 'invalid_patient_age' })
      expect(fromMock).not.toHaveBeenCalled()
      expect(runInBackgroundMock).not.toHaveBeenCalled()
    },
  )

  it('treats blank multipart patient metadata as absent', async () => {
    const response = await POST(
      multipartRequest([validReferralFile()], {
        patientAge: '   ',
        patientSex: '   ',
      }),
    )

    expect(response.status).toBe(202)
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ patient_age: null, patient_sex: null }),
    )
  })

  it.each([
    ['0', 0],
    ['130', 130],
  ])(
    'accepts multipart patient age %s at the governed boundary',
    async (patientAge, expectedAge) => {
      const response = await POST(
        multipartRequest([validReferralFile()], { patientAge }),
      )

      expect(response.status).toBe(202)
      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({ patient_age: expectedAge }),
      )
    },
  )

  it.each(['Male', 'Female', 'Other'])(
    'accepts governed multipart patient sex %s',
    async (patientSex) => {
      const response = await POST(
        multipartRequest([validReferralFile()], { patientSex }),
      )

      expect(response.status).toBe(202)
      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({ patient_sex: patientSex }),
      )
    },
  )

  it.each(['Unknown', 'male', ' Male', 'Male '])(
    'rejects invalid multipart patient sex %s before persistence or model work',
    async (patientSex) => {
      const response = await POST(
        multipartRequest([validReferralFile()], { patientSex }),
      )
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body).toMatchObject({ reason: 'invalid_patient_sex' })
      expect(fromMock).not.toHaveBeenCalled()
      expect(runInBackgroundMock).not.toHaveBeenCalled()
    },
  )

  it.each([42.5, -1, 131, 'malformed', 'NaN', '1e2', ' 65 '])(
    'rejects invalid JSON patient age %s before persistence or model work',
    async (patientAge) => {
      const response = await POST(
        jsonRequest('Stable synthetic referral history. '.repeat(3), {
          patientAge,
        }),
      )
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body).toMatchObject({ reason: 'invalid_patient_age' })
      expect(fromMock).not.toHaveBeenCalled()
      expect(runInBackgroundMock).not.toHaveBeenCalled()
    },
  )

  it('rejects a non-finite JSON number before persistence or model work', async () => {
    const text = 'Stable synthetic referral history. '.repeat(3)
    const response = await POST(
      new Request('http://localhost/api/triage/extract', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: `{"text":${JSON.stringify(text)},"patient_age":1e999}`,
      }),
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toMatchObject({ reason: 'invalid_patient_age' })
    expect(fromMock).not.toHaveBeenCalled()
    expect(runInBackgroundMock).not.toHaveBeenCalled()
  })

  it.each([0, 130])(
    'accepts JSON patient age %s at the governed boundary',
    async (patientAge) => {
      const response = await POST(
        jsonRequest('Stable synthetic referral history. '.repeat(3), {
          patientAge,
        }),
      )

      expect(response.status).toBe(202)
      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({ patient_age: patientAge }),
      )
    },
  )

  it('treats blank and null JSON demographics as absent', async () => {
    const response = await POST(
      jsonRequest('Stable synthetic referral history. '.repeat(3), {
        patientAge: '   ',
        patientSex: null,
      }),
    )

    expect(response.status).toBe(202)
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ patient_age: null, patient_sex: null }),
    )
  })

  it.each(['Unknown', 'male', ' Female', 'Female '])(
    'rejects invalid JSON patient sex %s before persistence or model work',
    async (patientSex) => {
      const response = await POST(
        jsonRequest('Stable synthetic referral history. '.repeat(3), {
          patientSex,
        }),
      )
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body).toMatchObject({ reason: 'invalid_patient_sex' })
      expect(fromMock).not.toHaveBeenCalled()
      expect(runInBackgroundMock).not.toHaveBeenCalled()
    },
  )

  it('retains JSON age 0 in persistence and background prompt metadata', async () => {
    const text = 'Stable synthetic referral history. '.repeat(3)
    const response = await POST(jsonRequest(text, { patientAge: 0 }))
    const work = runInBackgroundMock.mock.calls[0][0] as () => Promise<void>

    await work()

    expect(response.status).toBe(202)
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ patient_age: 0 }),
    )
    expect(buildExtractionUserPromptMock).toHaveBeenCalledWith(
      text,
      expect.objectContaining({ patientAge: 0 }),
    )
  })

  it('persists the authoritative tenant on the source extraction', async () => {
    const response = await POST(jsonRequest('x'.repeat(100)))

    expect(response.status).toBe(202)
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: 'tenant-1' }),
    )
  })

  it('routes a source above the single-pass limit through complete long-packet planning without truncation', async () => {
    const text = 'x'.repeat(50_001)
    const response = await POST(jsonRequest(text))

    expect(response.status).toBe(202)
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        text_input: text,
        original_text_length: text.length,
        ingestion_mode: 'long_packet',
        coverage_status: 'complete',
        coverage_report: expect.objectContaining({
          status: 'complete',
          uncoveredCharacterCount: 0,
        }),
        source_pages: expect.any(String),
        packet_plan: expect.objectContaining({
          chunks: expect.any(Array),
        }),
        packet_emergency_result: expect.objectContaining({
          status: 'completed',
        }),
      }),
    )
    const inserted = insertMock.mock.calls[0][0]
    const sourcePageManifestInOrder = JSON.parse(inserted.source_pages)
    expect(sourcePageManifestInOrder).toStrictEqual([
      {
        documentId: 'document-1',
        pageNumber: 1,
        text,
        extractionMethod: 'native_text',
        extractionConfidence: null,
      },
    ])
    expect(runInBackgroundMock).toHaveBeenCalledOnce()
  })

  it('persists the complete ordered multi-page source manifest as a JSON string', async () => {
    const firstPage =
      'Synthetic referral page one with a stable outpatient symptom history.'
    const secondPage =
      'Synthetic referral page two with routine follow-up information.'
    extractPdfTextMock.mockResolvedValueOnce({
      text: [firstPage, secondPage],
      totalPages: 2,
    })
    const formData = new FormData()
    formData.set(
      'file',
      new File(['synthetic PDF bytes'], 'synthetic-referral.pdf', {
        type: 'application/pdf',
      }),
    )

    const response = await POST(
      new Request('http://localhost/api/triage/extract', {
        method: 'POST',
        body: formData,
      }),
    )

    expect(response.status).toBe(202)
    const inserted = insertMock.mock.calls[0][0]
    expect(typeof inserted.source_pages).toBe('string')
    expect(JSON.parse(inserted.source_pages)).toStrictEqual([
      {
        documentId: 'document-1',
        pageNumber: 1,
        text: firstPage,
        extractionMethod: 'native_text',
        extractionConfidence: null,
      },
      {
        documentId: 'document-1',
        pageNumber: 2,
        text: secondPage,
        extractionMethod: 'native_text',
        extractionConfidence: null,
      },
    ])
  })

  it('persists the exact real native-PDF manifest and complete text before model work', async () => {
    const actualUnpdf = await vi.importActual<{
      extractText: (
        data: Uint8Array,
      ) => Promise<{ text: string[]; totalPages: number }>
    }>('unpdf')
    const fixtureBytes = readFileSync(
      new URL(
        '../../../../../../public/samples/triage/outpatient/09_Washington_Eugene.pdf',
        import.meta.url,
      ),
    )
    const actualExtraction = await actualUnpdf.extractText(
      new Uint8Array(fixtureBytes),
    )
    const expectedPageTexts = actualExtraction.text.map((text) => text.trim())
    const expectedCompleteText = expectedPageTexts.join('\n\n')
    extractPdfTextMock.mockImplementationOnce(actualUnpdf.extractText)

    const response = await POST(
      multipartRequest([
        new File([fixtureBytes], '09_Washington_Eugene.pdf', {
          type: 'application/pdf',
        }),
      ]),
    )

    expect(response.status).toBe(202)
    expect(expectedPageTexts).toHaveLength(2)
    expect(expectedPageTexts[1]).toContain(
      'acute-onset right facial droop, right hand numbness, and expressive language difficulty',
    )
    const inserted = insertMock.mock.calls[0][0]
    const sourcePages = JSON.parse(String(inserted.source_pages))
    expect(sourcePages).toStrictEqual(
      expectedPageTexts.map((text, index) => ({
        documentId: 'document-1',
        pageNumber: index + 1,
        text,
        extractionMethod: 'native_text',
        extractionConfidence: null,
      })),
    )
    expect(inserted).toMatchObject({
      text_input: expectedCompleteText,
      original_text_length: expectedCompleteText.length,
      source_filename: '09_Washington_Eugene.pdf',
      ingestion_mode: 'single_pass',
      coverage_status: 'complete',
      coverage_report: {
        status: 'complete',
        uncoveredCharacterCount: 0,
        documentCount: 1,
        pageCount: 2,
        chunkCount: 1,
      },
      packet_emergency_result: {
        status: 'completed',
        carePathway: 'emergency_now',
        reviewRequirement: 'emergency_action',
      },
    })
    expect(inserted.source_sha256).toBe(
      longPacketSourceDigest(inserted.packet_plan.packetId, sourcePages),
    )
    expect(runInBackgroundMock).toHaveBeenCalledOnce()
    expect(invokeBedrockClinicalJSONMock).not.toHaveBeenCalled()
  })

  it('screens the final long-packet chunk before accepting background model work', async () => {
    const text = `${'Stable synthetic background. '.repeat(2_000)}The patient developed sudden aphasia and right facial droop 20 minutes ago.`
    const response = await POST(jsonRequest(text))
    const body = await response.json()

    expect(response.status).toBe(202)
    const inserted = insertMock.mock.calls[0][0]
    expect(inserted.packet_emergency_result).toMatchObject({
      status: 'completed',
      carePathway: 'emergency_now',
    })
    expect(
      inserted.packet_emergency_result.signals.some(
        (signal: { evidence: Array<{ quote: string }> }) =>
          signal.evidence.some((evidence) =>
            evidence.quote.includes('sudden aphasia'),
          ),
      ),
    ).toBe(true)
    expect(createIngressMock).toHaveBeenCalledWith(
      expect.objectContaining({
        extractionId: 'extraction-1',
        tenantId: 'tenant-1',
        gateway: expect.objectContaining({ carePathway: 'emergency_now' }),
      }),
    )
    expect(body).toMatchObject({
      immediate_review_required: true,
      safety_triage_session_id: 'triage-ingress-1',
    })
  })

  it('fails closed and does not start model work when the mandatory ingress workflow cannot persist', async () => {
    const text = `${'Stable synthetic background. '.repeat(2_000)}The patient developed sudden aphasia and right facial droop 20 minutes ago.`
    createIngressMock.mockResolvedValueOnce({
      ok: false,
      reason: 'persistence_failed',
    })

    const response = await POST(jsonRequest(text))
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body).toMatchObject({
      reason: 'ingress_safety_workflow_unavailable',
      extraction_id: 'extraction-1',
      safety_pathway: 'emergency_now',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
      safety_triage_session_id: null,
    })
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        error_message: expect.stringMatching(/mandatory safety workflow/i),
      }),
    )
    expect(runInBackgroundMock).not.toHaveBeenCalled()
  })

  it('fails closed with manual escalation guidance when the mandatory ingress workflow rejects', async () => {
    const text = `${'Stable synthetic background. '.repeat(2_000)}The patient developed sudden aphasia and right facial droop 20 minutes ago.`
    createIngressMock.mockRejectedValueOnce(
      new Error('synthetic ingress persistence failure'),
    )

    const responsePromise = POST(jsonRequest(text))

    await expect(responsePromise).resolves.toMatchObject({ status: 503 })
    const response = await responsePromise
    const body = await response.json()
    expect(body).toMatchObject({
      error: expect.stringMatching(/escalate manually now/i),
      reason: 'ingress_safety_workflow_unavailable',
      extraction_id: 'extraction-1',
      safety_pathway: 'emergency_now',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
      safety_triage_session_id: null,
    })
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        error_message: expect.stringMatching(/mandatory safety workflow/i),
      }),
    )
    expect(runInBackgroundMock).not.toHaveBeenCalled()
  })

  it('retains known deterministic emergency safety when extraction-row persistence fails', async () => {
    const text = `${'Stable synthetic background. '.repeat(2_000)}The patient developed sudden aphasia and right facial droop 20 minutes ago.`
    singleMock.mockResolvedValueOnce({
      data: null,
      error: new Error('synthetic insert failure'),
    })

    const response = await POST(jsonRequest(text))
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body).toMatchObject({
      reason: 'extraction_persistence_unavailable',
      safety_pathway: 'emergency_now',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
      safety_triage_session_id: null,
    })
    expect(createIngressMock).not.toHaveBeenCalled()
    expect(runInBackgroundMock).not.toHaveBeenCalled()
  })

  it('creates a governed emergency hold from late native text in a 200-page mixed PDF while requiring OCR', async () => {
    const pages = Array.from(
      { length: 200 },
      (_, index) => `Stable synthetic native text on page ${index + 1}.`,
    )
    pages[100] = '   '
    pages[199] =
      'The patient developed sudden aphasia and right facial droop now.'
    extractPdfTextMock.mockResolvedValueOnce({ text: pages, totalPages: 200 })

    const response = await POST(
      multipartRequest(
        [
          new File(['synthetic PDF bytes'], 'large-mixed-referral.pdf', {
            type: 'application/pdf',
          }),
        ],
        { patientAge: '72', patientSex: 'Female' },
      ),
    )
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body).toMatchObject({
      reason: 'ocr_required',
      extraction_id: 'extraction-1',
      coverage_status: 'failed',
      missing_page_numbers: [101],
      safety_pathway: 'emergency_now',
      immediate_review_required: true,
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
      safety_triage_session_id: 'triage-ingress-1',
      packet_safety: {
        care_pathway: 'emergency_now',
        review_requirement: 'emergency_action',
        clinician_hold: true,
        signals: expect.arrayContaining([
          expect.objectContaining({
            action: 'emergency_now',
            evidence: expect.arrayContaining([
              expect.objectContaining({
                quote: expect.stringContaining('sudden aphasia'),
                documentId: 'document-1',
                pageNumber: 200,
              }),
            ]),
          }),
        ]),
      },
    })
    expect(body.packet_safety.signals.length).toBeLessThanOrEqual(20)
    for (const signal of body.packet_safety.signals) {
      expect(signal.evidence.length).toBeLessThanOrEqual(5)
      for (const evidence of signal.evidence) {
        expect(evidence.quote.length).toBeLessThanOrEqual(2_000)
      }
    }
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 'tenant-1',
        source_filename: 'large-mixed-referral.pdf',
        patient_age: 72,
        patient_sex: 'Female',
        ingestion_mode: 'legacy_unknown',
        coverage_status: 'failed',
        coverage_report: expect.objectContaining({
          status: 'failed',
          reason: 'ocr_required',
          totalPageCount: 200,
          missingPageNumbers: [101],
        }),
        packet_emergency_result: expect.objectContaining({
          carePathway: 'emergency_now',
          signals: expect.arrayContaining([
            expect.objectContaining({
              evidence: expect.arrayContaining([
                expect.objectContaining({
                  documentId: 'document-1',
                  pageNumber: 200,
                  quote: expect.stringContaining('sudden aphasia'),
                }),
              ]),
            }),
          ]),
        }),
        status: 'error',
      }),
    )
    const insertedSourcePages = JSON.parse(
      String(insertMock.mock.calls[0][0].source_pages),
    )
    expect(insertedSourcePages).toHaveLength(199)
    expect(insertedSourcePages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          documentId: 'document-1',
          pageNumber: 200,
          text: expect.stringContaining('sudden aphasia'),
        }),
      ]),
    )
    expect(createIngressMock).toHaveBeenCalledWith(
      expect.objectContaining({
        extractionId: 'extraction-1',
        tenantId: 'tenant-1',
        sourceType: 'pdf',
        gateway: expect.objectContaining({ carePathway: 'emergency_now' }),
        coverageStatus: 'failed',
      }),
    )
    expect(runInBackgroundMock).not.toHaveBeenCalled()
    expect(invokeBedrockClinicalJSONMock).not.toHaveBeenCalled()
  })

  it('treats letterhead-only native extraction as missing while preserving page-bound stroke evidence', async () => {
    const emergencyPage =
      'The patient developed sudden aphasia and right facial droop 20 minutes ago.'
    extractPdfTextMock.mockResolvedValueOnce({
      text: [
        'Mayo Clinic\n200 First Street SW\nRochester, MN 55905\nPhone: (507) 555-0100 | Fax: (507) 555-0101',
        emergencyPage,
      ],
      totalPages: 2,
    })

    const response = await POST(
      multipartRequest([
        new File(['synthetic PDF bytes'], 'scanned-stroke-referral.pdf', {
          type: 'application/pdf',
        }),
      ]),
    )
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body).toMatchObject({
      reason: 'ocr_required',
      coverage_status: 'failed',
      missing_page_numbers: [1],
      safety_pathway: 'emergency_now',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
      packet_safety: {
        signals: expect.arrayContaining([
          expect.objectContaining({
            evidence: expect.arrayContaining([
              expect.objectContaining({
                documentId: 'document-1',
                pageNumber: 2,
                quote: expect.stringContaining('sudden aphasia'),
              }),
            ]),
          }),
        ]),
      },
    })
    const insertedSourcePages = JSON.parse(
      String(insertMock.mock.calls[0][0].source_pages),
    )
    expect(insertedSourcePages).toEqual([
      expect.objectContaining({
        documentId: 'document-1',
        pageNumber: 2,
        text: emergencyPage,
      }),
    ])
    expect(runInBackgroundMock).not.toHaveBeenCalled()
    expect(invokeBedrockClinicalJSONMock).not.toHaveBeenCalled()
  })

  it('preserves page-bound mixed-PDF emergency evidence while rejecting invalid demographic metadata', async () => {
    const emergencyPage =
      'The patient developed sudden aphasia and right facial droop now.'
    extractPdfTextMock.mockResolvedValueOnce({
      text: [
        'Stable synthetic native referral context.',
        '',
        emergencyPage,
      ],
      totalPages: 3,
    })

    const response = await POST(
      multipartRequest(
        [
          new File(['synthetic PDF bytes'], 'invalid-sex-mixed.pdf', {
            type: 'application/pdf',
          }),
        ],
        { patientSex: 'Unknown' },
      ),
    )
    // On the RED implementation the demographic rejection occurs before file
    // parsing, so do not leak this one-shot parser result into the next test.
    extractPdfTextMock.mockReset()
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toMatchObject({
      reason: 'invalid_patient_sex',
      source_hold_reason: 'ocr_required',
      coverage_status: 'failed',
      missing_page_numbers: [2],
      safety_pathway: 'emergency_now',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
      safety_triage_session_id: 'triage-ingress-1',
      extraction_id: 'extraction-1',
      packet_safety: {
        care_pathway: 'emergency_now',
        signals: expect.arrayContaining([
          expect.objectContaining({
            evidence: expect.arrayContaining([
              expect.objectContaining({
                quote: emergencyPage,
                documentId: 'document-1',
                pageNumber: 3,
                startOffset: 0,
                endOffset: emergencyPage.length,
              }),
            ]),
          }),
        ]),
      },
    })
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        patient_age: null,
        patient_sex: null,
        coverage_status: 'failed',
        status: 'error',
      }),
    )
    expect(createIngressMock).toHaveBeenCalledWith(
      expect.objectContaining({
        extractionId: 'extraction-1',
        tenantId: 'tenant-1',
        coverageStatus: 'failed',
        gateway: expect.objectContaining({ carePathway: 'emergency_now' }),
      }),
    )
    expect(runInBackgroundMock).not.toHaveBeenCalled()
    expect(invokeBedrockClinicalJSONMock).not.toHaveBeenCalled()
  })

  it('persists the canonical partial-PDF filename used by the poll validator', async () => {
    extractPdfTextMock.mockResolvedValueOnce({
      text: [
        'Sudden aphasia and right facial droop began now.',
        '',
      ],
      totalPages: 2,
    })

    const response = await POST(
      multipartRequest([
        new File(['synthetic PDF bytes'], ' partial-referral.PDF', {
          type: 'application/pdf',
        }),
      ]),
    )
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body).toMatchObject({
      extraction_id: 'extraction-1',
      safety_pathway: 'emergency_now',
    })
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ source_filename: 'partial-referral.PDF' }),
    )
  })

  it('does not construct a time-critical phrase across a missing PDF page', async () => {
    extractPdfTextMock.mockResolvedValueOnce({
      text: [
        'The patient developed sudden',
        '',
        'right arm weakness.',
      ],
      totalPages: 3,
    })

    const response = await POST(
      multipartRequest([
        new File(['synthetic PDF bytes'], 'split-phrase-mixed-referral.pdf', {
          type: 'application/pdf',
        }),
      ]),
    )
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body).toMatchObject({
      reason: 'ocr_required',
      coverage_status: 'failed',
      missing_page_numbers: [2],
      immediate_action_required: false,
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
    })
    expect(body).not.toHaveProperty('safety_pathway')
    expect(body).not.toHaveProperty('packet_safety')
    expect(fromMock).not.toHaveBeenCalled()
    expect(createIngressMock).not.toHaveBeenCalled()
  })

  it('creates an emergency workflow when a stroke clause spans two contiguous native PDF pages', async () => {
    const firstPage = 'The patient today developed sudden'
    const secondPage = 'right-sided weakness and aphasia.'
    extractPdfTextMock.mockResolvedValueOnce({
      text: [firstPage, secondPage, ''],
      totalPages: 3,
    })

    const response = await POST(
      multipartRequest([
        new File(['synthetic PDF bytes'], 'contiguous-stroke-clause.pdf', {
          type: 'application/pdf',
        }),
      ]),
    )
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body).toMatchObject({
      reason: 'ocr_required',
      missing_page_numbers: [3],
      safety_pathway: 'emergency_now',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      safety_triage_session_id: 'triage-ingress-1',
      packet_safety: {
        care_pathway: 'emergency_now',
        signals: expect.arrayContaining([
          expect.objectContaining({
            evidence: expect.arrayContaining([
              expect.objectContaining({
                documentId: 'document-1',
                pageNumber: 1,
                startOffset: 0,
                endOffset: firstPage.length,
                quote: firstPage,
              }),
              expect.objectContaining({
                documentId: 'document-1',
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
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        coverage_status: 'failed',
        packet_emergency_result: expect.objectContaining({
          carePathway: 'emergency_now',
          signals: expect.arrayContaining([
            expect.objectContaining({
              evidence: expect.arrayContaining([
                expect.objectContaining({ pageNumber: 1, quote: firstPage }),
                expect.objectContaining({ pageNumber: 2, quote: secondPage }),
              ]),
            }),
          ]),
        }),
      }),
    )
    expect(createIngressMock).toHaveBeenCalledWith(
      expect.objectContaining({
        gateway: expect.objectContaining({ carePathway: 'emergency_now' }),
        coverageStatus: 'failed',
      }),
    )
  })

  it('creates a same-day workflow when an uncertain stroke clause spans two contiguous native PDF pages', async () => {
    const firstPage = 'Possible sudden'
    const secondPage = 'right-sided weakness and aphasia.'
    extractPdfTextMock.mockResolvedValueOnce({
      text: [firstPage, secondPage, ''],
      totalPages: 3,
    })

    const response = await POST(
      multipartRequest([
        new File(['synthetic PDF bytes'], 'contiguous-uncertain-clause.pdf', {
          type: 'application/pdf',
        }),
      ]),
    )
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body).toMatchObject({
      reason: 'ocr_required',
      safety_pathway: 'same_day_clinician_review',
      immediate_action_required: true,
      safety_triage_session_id: 'triage-ingress-1',
      packet_safety: {
        care_pathway: 'same_day_clinician_review',
        signals: expect.arrayContaining([
          expect.objectContaining({
            action: 'immediate_clinician_review',
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
    expect(createIngressMock).toHaveBeenCalledWith(
      expect.objectContaining({
        gateway: expect.objectContaining({
          carePathway: 'same_day_clinician_review',
        }),
      }),
    )
  })

  it('does not let a truncated boundary window promote a one-page family-history phrase', async () => {
    const firstPage =
      `Family history:\n${'stable family detail '.repeat(40)}` +
      'status epilepticus'
    extractPdfTextMock.mockResolvedValueOnce({
      text: [firstPage, 'Stable continuation page.', ''],
      totalPages: 3,
    })

    const response = await POST(
      multipartRequest([
        new File(['synthetic PDF bytes'], 'family-history-boundary.pdf', {
          type: 'application/pdf',
        }),
      ]),
    )
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body).toMatchObject({
      reason: 'ocr_required',
      immediate_action_required: false,
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
    })
    expect(body).not.toHaveProperty('safety_pathway')
    expect(body).not.toHaveProperty('packet_safety')
    expect(createIngressMock).not.toHaveBeenCalled()
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('creates a governed same-day hold from uncertain native text in a mixed PDF while requiring OCR', async () => {
    extractPdfTextMock.mockResolvedValueOnce({
      text: [
        'Stable synthetic native referral context.',
        ' ',
        'Possible sudden aphasia and facial droop now.',
      ],
      totalPages: 3,
    })

    const response = await POST(
      multipartRequest([
        new File(['synthetic PDF bytes'], 'uncertain-mixed-referral.pdf', {
          type: 'application/pdf',
        }),
      ]),
    )
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body).toMatchObject({
      reason: 'ocr_required',
      safety_pathway: 'same_day_clinician_review',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
      safety_triage_session_id: 'triage-ingress-1',
    })
    expect(createIngressMock).toHaveBeenCalledWith(
      expect.objectContaining({
        gateway: expect.objectContaining({
          carePathway: 'same_day_clinician_review',
        }),
        coverageStatus: 'failed',
      }),
    )
    expect(runInBackgroundMock).not.toHaveBeenCalled()
  })

  it('keeps a routine-appearing mixed PDF on an OCR and human-review hold without routine authorization', async () => {
    extractPdfTextMock.mockResolvedValueOnce({
      text: [
        'Stable synthetic headache history without recent change.',
        '',
        'Routine outpatient neurology referral requested.',
      ],
      totalPages: 3,
    })

    const response = await POST(
      multipartRequest([
        new File(['synthetic PDF bytes'], 'routine-mixed-referral.pdf', {
          type: 'application/pdf',
        }),
      ]),
    )
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body).toMatchObject({
      reason: 'ocr_required',
      coverage_status: 'failed',
      missing_page_numbers: [2],
      immediate_review_required: false,
      immediate_action_required: false,
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
      safety_triage_session_id: null,
    })
    expect(body).not.toHaveProperty('safety_pathway')
    expect(body).not.toHaveProperty('extraction_id')
    expect(body).not.toHaveProperty('packet_safety')
    expect(fromMock).not.toHaveBeenCalled()
    expect(createIngressMock).not.toHaveBeenCalled()
    expect(runInBackgroundMock).not.toHaveBeenCalled()
    expect(invokeBedrockClinicalJSONMock).not.toHaveBeenCalled()
  })

  it('retains page-bound mixed-PDF emergency evidence when extraction persistence is unavailable', async () => {
    extractPdfTextMock.mockResolvedValueOnce({
      text: [
        'Stable synthetic native referral context.',
        '',
        'The patient developed sudden aphasia and right facial droop now.',
      ],
      totalPages: 3,
    })
    singleMock.mockResolvedValueOnce({
      data: null,
      error: new Error('synthetic partial extraction insert failure'),
    })

    const response = await POST(
      multipartRequest([
        new File(['synthetic PDF bytes'], 'failed-insert-mixed.pdf', {
          type: 'application/pdf',
        }),
      ]),
    )
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body).toMatchObject({
      reason: 'extraction_persistence_unavailable',
      source_hold_reason: 'ocr_required',
      safety_pathway: 'emergency_now',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
      safety_triage_session_id: null,
      packet_safety: {
        signals: expect.arrayContaining([
          expect.objectContaining({
            evidence: expect.arrayContaining([
              expect.objectContaining({
                documentId: 'document-1',
                pageNumber: 3,
                quote: expect.stringContaining('sudden aphasia'),
              }),
            ]),
          }),
        ]),
      },
    })
    expect(createIngressMock).not.toHaveBeenCalled()
    expect(runInBackgroundMock).not.toHaveBeenCalled()
  })

  it('retains page-bound mixed-PDF emergency evidence when workflow persistence is unavailable', async () => {
    extractPdfTextMock.mockResolvedValueOnce({
      text: [
        'Stable synthetic native referral context.',
        '',
        'The patient developed sudden aphasia and right facial droop now.',
      ],
      totalPages: 3,
    })
    createIngressMock.mockResolvedValueOnce({
      ok: false,
      reason: 'persistence_failed',
    })

    const response = await POST(
      multipartRequest([
        new File(['synthetic PDF bytes'], 'failed-workflow-mixed.pdf', {
          type: 'application/pdf',
        }),
      ]),
    )
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body).toMatchObject({
      reason: 'ingress_safety_workflow_unavailable',
      source_hold_reason: 'ocr_required',
      extraction_id: 'extraction-1',
      safety_pathway: 'emergency_now',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
      safety_triage_session_id: null,
      packet_safety: {
        signals: expect.arrayContaining([
          expect.objectContaining({
            evidence: expect.arrayContaining([
              expect.objectContaining({
                documentId: 'document-1',
                pageNumber: 3,
              }),
            ]),
          }),
        ]),
      },
    })
    expect(runInBackgroundMock).not.toHaveBeenCalled()
    expect(notifyMock).not.toHaveBeenCalled()
  })
})
