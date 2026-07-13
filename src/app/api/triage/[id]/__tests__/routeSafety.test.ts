import { beforeEach, describe, expect, it, vi } from 'vitest'

const { authorizeMock, fromMock, selectMock, eqMock, singleMock } = vi.hoisted(
  () => ({
    authorizeMock: vi.fn(),
    fromMock: vi.fn(),
    selectMock: vi.fn(),
    eqMock: vi.fn(),
    singleMock: vi.fn(),
  }),
)

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
}))
vi.mock('@/lib/db-query', () => ({ from: fromMock }))

import { GET } from '../route'

function callGet() {
  return GET(new Request('http://localhost/api/triage/triage-1'), {
    params: Promise.resolve({ id: 'triage-1' }),
  })
}

describe('triage result route safety', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
      data: { id: 'triage-1', processing_status: 'pending' },
      error: null,
    })
    const chain = { eq: eqMock, single: singleMock }
    eqMock.mockReturnValue(chain)
    selectMock.mockReturnValue(chain)
    fromMock.mockReturnValue({ select: selectMock })
  })

  it('rejects unauthenticated polling before reading clinical data', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await callGet()

    expect(response.status).toBe(401)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('scopes the triage result to the authoritative tenant', async () => {
    const response = await callGet()

    expect(response.status).toBe(200)
    expect(eqMock).toHaveBeenCalledWith('id', 'triage-1')
    expect(eqMock).toHaveBeenCalledWith('tenant_id', 'tenant-1')
  })

  it('does not turn the fresh pending initialization sentinel into a retained safety hold', async () => {
    singleMock.mockResolvedValueOnce({
      data: {
        id: 'triage-1',
        processing_status: 'pending',
        care_pathway: 'undetermined',
        workflow_status: 'pending_safety_screen',
        scheduling_locked: true,
        safety_shadow_result: null,
      },
      error: null,
    })

    const response = await callGet()
    const body = await response.json()

    expect(body).not.toHaveProperty('packet_safety')
    expect(body).not.toHaveProperty('safety_triage_session_id')
    expect(body).not.toHaveProperty('outpatient_scoring_blocked')
  })

  it('does not advertise final-disposition capability before the governed recommendation milestone', async () => {
    const viewerResponse = await callGet()
    expect(await viewerResponse.json()).toMatchObject({
      outpatient_finalization_allowed: false,
    })

    authorizeMock.mockResolvedValueOnce({
      ok: true,
      context: {
        userId: 'clinician-1',
        email: 'clinician@example.test',
        tenantId: 'tenant-1',
        role: 'clinician',
      },
    })
    const clinicianResponse = await callGet()
    expect(await clinicianResponse.json()).toMatchObject({
      outpatient_finalization_allowed: false,
    })
  })

  it('surfaces a durable emergency hold while model processing is still pending', async () => {
    singleMock.mockResolvedValueOnce({
      data: {
        id: 'triage-1',
        processing_status: 'pending',
        care_pathway: 'emergency_now',
        data_quality: 'partial',
        coverage_status: 'complete',
        review_requirement: 'emergency_action',
        workflow_status: 'emergency_hold',
        scheduling_locked: true,
        safety_shadow_result: {
          carePathway: 'emergency_now',
          signals: [{ code: 'acute_focal_deficit' }],
        },
      },
      error: null,
    })

    const response = await callGet()
    const body = await response.json()

    expect(body).toMatchObject({
      session_id: 'triage-1',
      status: 'pending',
      care_pathway: 'emergency_now',
      review_requirement: 'emergency_action',
      workflow_status: 'emergency_hold',
      scheduling_locked: true,
      safety_review: {
        carePathway: 'emergency_now',
      },
      packet_safety: {
        care_pathway: 'emergency_now',
        review_requirement: 'emergency_action',
        clinician_hold: true,
      },
      safety_pathway: 'emergency_now',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      human_review_required: true,
      safety_triage_session_id: 'triage-1',
    })
    expect(body).not.toHaveProperty('extraction_id')
  })

  it('preserves safety state when outpatient model processing errors', async () => {
    singleMock.mockResolvedValueOnce({
      data: {
        id: 'triage-1',
        processing_status: 'error',
        error_message: 'Scoring timed out',
        care_pathway: 'emergency_now',
        coverage_status: 'complete',
        review_requirement: 'emergency_action',
        workflow_status: 'emergency_hold',
        scheduling_locked: true,
        safety_shadow_result: { carePathway: 'emergency_now' },
      },
      error: null,
    })

    const response = await callGet()
    const body = await response.json()

    expect(body).toMatchObject({
      session_id: 'triage-1',
      status: 'error',
      error: 'Scoring timed out',
      care_pathway: 'emergency_now',
      workflow_status: 'emergency_hold',
      safety_review: { carePathway: 'emergency_now' },
      packet_safety: {
        care_pathway: 'emergency_now',
        clinician_hold: true,
      },
      safety_pathway: 'emergency_now',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      human_review_required: true,
      safety_triage_session_id: 'triage-1',
    })
    expect(body).not.toHaveProperty('extraction_id')
  })

  it('returns a structured scoring hold for a routine terminal failure', async () => {
    singleMock.mockResolvedValueOnce({
      data: {
        id: 'triage-1',
        processing_status: 'error',
        error_message: 'Routine scoring failed',
        care_pathway: 'routine_outpatient',
        review_requirement: 'clinician_confirmation',
        workflow_status: 'clinician_review',
        scheduling_locked: true,
      },
      error: null,
    })

    const response = await callGet()
    const body = await response.json()

    expect(body).toMatchObject({
      session_id: 'triage-1',
      status: 'error',
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
    })
    expect(body).not.toHaveProperty('extraction_id')
    expect(body).not.toHaveProperty('safety_pathway')
    expect(body).not.toHaveProperty('safety_triage_session_id')
  })

  it('omits an explicit workflow id when emergency workflow context is inconsistent', async () => {
    singleMock.mockResolvedValueOnce({
      data: {
        id: 'triage-1',
        processing_status: 'error',
        care_pathway: 'emergency_now',
        review_requirement: 'clinician_confirmation',
        workflow_status: 'clinician_review',
        scheduling_locked: true,
      },
      error: null,
    })

    const response = await callGet()
    const body = await response.json()

    expect(body).toMatchObject({
      packet_safety: { care_pathway: 'emergency_now' },
      safety_pathway: 'emergency_now',
      reason: 'source_safety_workflow_inconsistent_manual_hold',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
    })
    expect(body).not.toHaveProperty('safety_triage_session_id')
  })

  it('fails closed when an actionable safety row is unexpectedly unlocked', async () => {
    singleMock.mockResolvedValueOnce({
      data: {
        id: 'triage-1',
        processing_status: 'pending',
        care_pathway: 'same_day_clinician_review',
        review_requirement: 'immediate_clinician_review',
        workflow_status: 'clinician_review',
        scheduling_locked: false,
      },
      error: null,
    })

    const body = await (await callGet()).json()

    expect(body).toMatchObject({
      status: 'pending',
      packet_safety: { care_pathway: 'same_day_clinician_review' },
      safety_pathway: 'same_day_clinician_review',
      reason: 'source_safety_workflow_inconsistent_manual_hold',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
    })
    expect(body).not.toHaveProperty('safety_triage_session_id')
  })

  it('returns orthogonal workflow state and evidence-bearing safety review', async () => {
    singleMock.mockResolvedValueOnce({
      data: {
        id: 'triage-1',
        processing_status: 'complete',
        triage_tier: 'emergent',
        care_pathway: 'emergency_now',
        data_quality: 'sufficient',
        coverage_status: 'complete',
        review_requirement: 'emergency_action',
        workflow_status: 'emergency_hold',
        scheduling_locked: true,
        safety_shadow_result: {
          modelSafety: {
            carePathway: 'emergency_now',
            signals: [{ code: 'acute_focal_deficit', evidence: [] }],
          },
        },
        ai_raw_response: {
          emergent_override: false,
          red_flag_override: false,
        },
      },
      error: null,
    })

    const response = await callGet()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      session_id: 'triage-1',
      care_pathway: 'emergency_now',
      data_quality: 'sufficient',
      coverage_status: 'complete',
      review_requirement: 'emergency_action',
      workflow_status: 'emergency_hold',
      scheduling_locked: true,
      safety_review: {
        modelSafety: { carePathway: 'emergency_now' },
      },
      packet_safety: {
        care_pathway: 'emergency_now',
        clinician_hold: true,
      },
      safety_pathway: 'emergency_now',
      safety_triage_session_id: 'triage-1',
    })
    expect(body).not.toHaveProperty('extraction_id')
    expect(body.emergent_reason).toMatch(/emergency safety review/i)
  })

  it('serializes a missing routine review requirement as clinician confirmation', async () => {
    singleMock.mockResolvedValueOnce({
      data: {
        id: 'triage-1',
        processing_status: 'complete',
        triage_tier: 'routine',
        care_pathway: 'routine_outpatient',
        workflow_status: 'decision_ready',
        scheduling_locked: true,
        safety_shadow_result: null,
        ai_raw_response: {},
      },
      error: null,
    })

    const response = await callGet()
    const body = await response.json()

    expect(body).toMatchObject({
      status: 'complete',
      care_pathway: 'routine_outpatient',
      review_requirement: 'clinician_confirmation',
    })
    expect(body).not.toHaveProperty('safety_pathway')
    expect(body).not.toHaveProperty('packet_safety')
  })
})
