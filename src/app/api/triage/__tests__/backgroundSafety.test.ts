import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  invokeBedrockMock,
  runGatewayMock,
  persistGatewayMock,
  runSafetyMock,
  persistModelSafetyMock,
  finalizeTriageAttemptMock,
  runAdjudicatorMock,
  notifyMock,
  createConsultMock,
  linkTriageToConsultMock,
  autoScheduleMock,
  fromMock,
  updateMock,
  eqMock,
  isMock,
  returnSelectMock,
  maybeSingleMock,
} = vi.hoisted(() => ({
  invokeBedrockMock: vi.fn(),
  runGatewayMock: vi.fn(),
  persistGatewayMock: vi.fn(),
  runSafetyMock: vi.fn(),
  persistModelSafetyMock: vi.fn(),
  finalizeTriageAttemptMock: vi.fn(),
  runAdjudicatorMock: vi.fn(),
  notifyMock: vi.fn(),
  createConsultMock: vi.fn(),
  linkTriageToConsultMock: vi.fn(),
  autoScheduleMock: vi.fn(),
  fromMock: vi.fn(),
  updateMock: vi.fn(),
  eqMock: vi.fn(),
  isMock: vi.fn(),
  returnSelectMock: vi.fn(),
  maybeSingleMock: vi.fn(),
}))

vi.mock('@/lib/bedrock', () => ({
  BEDROCK_MODEL: 'test-model',
  invokeBedrockClinicalJSON: invokeBedrockMock,
  // The outpatient scorer now uses the strict tool path; same mock captures it.
  invokeBedrockClinicalTool: invokeBedrockMock,
}))
vi.mock('@/lib/triage/emergencyGateway', () => ({
  runEmergencyGateway: runGatewayMock,
}))
vi.mock('@/lib/triage/gatewayPersistence', () => ({
  persistEmergencyGatewayResult: persistGatewayMock,
}))
vi.mock('@/lib/triage/modelSafetyExtractor', () => ({
  MODEL_SAFETY_EXTRACTION_PROMPT_VERSION: 'test-safety-prompt',
  runModelSafetyExtractor: runSafetyMock,
}))
vi.mock('@/lib/triage/modelSafetyPersistence', () => ({
  persistModelSafetyFusion: persistModelSafetyMock,
}))
vi.mock('@/lib/triage/triageCompletionPersistence', () => ({
  finalizeTriageAttempt: finalizeTriageAttemptMock,
}))
vi.mock('@/lib/triage/modelAdjudicator', () => ({
  TRIAGE_ADJUDICATOR_PROMPT_VERSION: 'test-adjudicator-prompt',
  runTriageAdjudicator: runAdjudicatorMock,
}))
vi.mock('@/lib/notifications', () => ({ notifyTriageUrgent: notifyMock }))
vi.mock('@/lib/db-query', () => ({ from: fromMock }))
vi.mock('@/lib/consult/pipeline', () => ({
  createConsult: createConsultMock,
  linkTriageToConsult: linkTriageToConsultMock,
}))
vi.mock('@/lib/triage/autoSchedule', () => ({
  autoScheduleFromTriage: autoScheduleMock,
}))

import { processTriageInBackground } from '@/lib/triage/processTriageInBackground'

const routineModelResponse = {
  emergent_override: false,
  emergent_reason: null,
  insufficient_data: false,
  missing_information: null,
  confidence: 'high',
  red_flag_override: false,
  dimension_scores: {
    symptom_acuity: { score: 1, rationale: 'Stable chronic symptoms.' },
    diagnostic_concern: { score: 1, rationale: 'No concerning diagnostic feature.' },
    rate_of_progression: { score: 1, rationale: 'No progression described.' },
    functional_impairment: { score: 1, rationale: 'No functional loss described.' },
    red_flag_presence: { score: 1, rationale: 'No red flag described.' },
  },
  clinical_reasons: ['Stable symptoms'],
  red_flags: [],
  suggested_workup: [
    'Medication reconciliation — confirm current therapies.',
    'Focused neurologic examination — document baseline findings.',
  ],
  failed_therapies: [],
  subspecialty_recommendation: 'General Neurology',
  subspecialty_rationale: 'General evaluation',
  redirect_to_non_neuro: false,
  redirect_specialty: null,
  redirect_rationale: null,
  safety_anticoagulation: null,
  safety_symptom_onset_time: null,
  safety_allergies: null,
  safety_implanted_devices: null,
  safety_pregnancy_status: null,
  safety_recent_procedures: null,
  safety_renal_function: null,
}

describe('triage background safety ordering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runGatewayMock.mockReturnValue({
      status: 'completed',
      failureCode: null,
      carePathway: 'emergency_now',
      reviewRequirement: 'emergency_action',
      schedulingLocked: true,
      signals: [],
      lexicalHits: [],
      version: 'neurology-emergency-gateway-v1',
    })
    persistGatewayMock.mockResolvedValue(true)
    runSafetyMock.mockResolvedValue({
      carePathway: 'no_time_critical_signal',
      dataQuality: 'sufficient',
      criticalUnknowns: [],
      signals: [],
    })
    persistModelSafetyMock.mockImplementation(async (input) => ({
      ok: true,
      carePathway: input.fusion.carePathway,
      dataQuality: input.fusion.dataQuality,
      reviewRequirement: input.fusion.reviewRequirement,
      workflowStatus:
        input.fusion.carePathway === 'emergency_now'
          ? 'emergency_hold'
          : 'clinician_review',
    }))
    finalizeTriageAttemptMock.mockImplementation(async (input) => ({
      ok: true,
      triageTier:
        input.proposedCarePathway === 'emergency_now'
          ? 'emergent'
          : input.proposedCarePathway === 'same_day_clinician_review'
            ? 'urgent'
            : input.proposedCarePathway === 'undetermined'
              ? 'insufficient_data'
              : input.scoringTier,
      carePathway: input.proposedCarePathway,
      dataQuality: 'sufficient',
      reviewRequirement:
        input.proposedCarePathway === 'emergency_now'
          ? 'emergency_action'
          : input.proposedCarePathway === 'same_day_clinician_review'
            ? 'immediate_clinician_review'
            : 'clinician_confirmation',
      workflowStatus:
        input.proposedCarePathway === 'emergency_now'
          ? 'emergency_hold'
          : 'clinician_review',
      consultId:
        input.explicitConsult?.id ??
        (input.systemConsult ? 'consult-system-canonical' : null),
    }))
    runAdjudicatorMock.mockResolvedValue({
      carePathway: 'routine_outpatient',
      rationale: 'Synthetic attempted downgrade.',
      evidence: [],
      unresolvedConflicts: [],
    })
    invokeBedrockMock.mockResolvedValue({
      parsed: routineModelResponse,
      inputTokens: 100,
      outputTokens: 100,
    })
    createConsultMock.mockResolvedValue({
      data: { id: 'consult-system-created' },
      error: null,
    })
    linkTriageToConsultMock.mockResolvedValue(true)
    autoScheduleMock.mockResolvedValue(null)
    const queryChain = {
      eq: eqMock,
      is: isMock,
      select: returnSelectMock,
      maybeSingle: maybeSingleMock,
    }
    eqMock.mockReturnValue(queryChain)
    isMock.mockReturnValue(queryChain)
    returnSelectMock.mockReturnValue(queryChain)
    maybeSingleMock.mockResolvedValue({ data: { id: 'triage-1' }, error: null })
    updateMock.mockReturnValue(queryChain)
    fromMock.mockReturnValue({ update: updateMock })
  })

  it('persists the deterministic screen before invoking the model and prevents downgrade', async () => {
    await processTriageInBackground('triage-1', {
      gatewayText:
        'Raw source says sudden aphasia today in this synthetic referral.',
      textForScoring:
        'Edited extraction says only stable follow-up symptoms.',
      referral_text:
        'Raw source says sudden aphasia today in this synthetic referral.',
      temperature: 0,
      createConsultFlag: false,
      coverageStatus: 'not_applicable',
      tenantId: 'tenant-1',
    })

    expect(persistGatewayMock.mock.invocationCallOrder[0]).toBeLessThan(
      invokeBedrockMock.mock.invocationCallOrder[0],
    )
    expect(runGatewayMock).toHaveBeenCalledWith(
      'Raw source says sudden aphasia today in this synthetic referral.',
    )
    expect(runSafetyMock).toHaveBeenCalledWith(
      'Raw source says sudden aphasia today in this synthetic referral.',
      expect.objectContaining({
        model: 'us.anthropic.claude-sonnet-5',
        signal: expect.any(AbortSignal),
      }),
    )
    expect(invokeBedrockMock).toHaveBeenCalledWith(
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        messages: [
          expect.objectContaining({
            content: expect.stringContaining(
              'Edited extraction says only stable follow-up symptoms.',
            ),
          }),
        ],
      }),
    )
    expect(finalizeTriageAttemptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        triageSessionId: 'triage-1',
        tenantId: 'tenant-1',
        processingAttemptCount: 1,
        proposedCarePathway: 'emergency_now',
        scoringTier: 'emergent',
      }),
    )
    expect(persistModelSafetyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        triageSessionId: 'triage-1',
        tenantId: 'tenant-1',
        modelProfile: 'us.anthropic.claude-sonnet-5',
        adjudicatorModelProfile: 'us.anthropic.claude-opus-4-8',
        adjudicatorResult: expect.objectContaining({
          carePathway: 'routine_outpatient',
        }),
      }),
    )
    expect(runAdjudicatorMock).toHaveBeenCalledOnce()
    expect(runAdjudicatorMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('requests a system consult only inside atomic finalization', async () => {
    await processTriageInBackground('triage-1', {
      gatewayText:
        'Synthetic referral with enough source text for safe consult creation.',
      textForScoring:
        'Synthetic referral with enough source text for safe consult creation.',
      referral_text:
        'Synthetic referral with enough source text for safe consult creation.',
      patient_id: 'patient-1',
      temperature: 0,
      createConsultFlag: true,
      coverageStatus: 'not_applicable',
      tenantId: 'tenant-1',
    })

    expect(finalizeTriageAttemptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        systemConsult: {
          expectedPatientId: 'patient-1',
          referralText:
            'Synthetic referral with enough source text for safe consult creation.',
          chiefComplaint: expect.any(String),
        },
      }),
    )
    expect(createConsultMock).not.toHaveBeenCalled()
    expect(
      updateMock.mock.calls.some(
        ([value]) =>
          (value as Record<string, unknown>).consult_id !== undefined,
      ),
    ).toBe(false)
  })

  it('keeps an explicit consult inside atomic finalization', async () => {
    await processTriageInBackground('triage-1', {
      gatewayText:
        'Synthetic referral with enough source text for explicit consult linking.',
      textForScoring:
        'Synthetic referral with enough source text for explicit consult linking.',
      referral_text:
        'Synthetic referral with enough source text for explicit consult linking.',
      patient_id: 'patient-1',
      temperature: 0,
      createConsultFlag: false,
      existingConsultId: 'consult-explicit',
      coverageStatus: 'not_applicable',
      tenantId: 'tenant-1',
    })

    expect(finalizeTriageAttemptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        explicitConsult: expect.objectContaining({
          id: 'consult-explicit',
          expectedPatientId: 'patient-1',
        }),
      }),
    )
    expect(linkTriageToConsultMock).not.toHaveBeenCalled()
    expect(createConsultMock).not.toHaveBeenCalled()
    expect(isMock).not.toHaveBeenCalledWith('consult_id', null)
  })

  it('cannot clear an atomically established consult when appointment persistence continues', async () => {
    autoScheduleMock.mockResolvedValueOnce({
      id: 'appointment-after-link-failure',
    })

    await processTriageInBackground('triage-1', {
      gatewayText: 'Synthetic complete source for a bound consult.',
      textForScoring: 'Synthetic scoring source for a bound consult.',
      referral_text: 'Synthetic complete source for a bound consult.',
      patient_id: 'patient-1',
      existingConsultId: 'consult-explicit',
      temperature: 0,
      createConsultFlag: false,
      coverageStatus: 'not_applicable',
      tenantId: 'tenant-1',
    })

    const appointmentPersistence = updateMock.mock.calls
      .map(([value]) => value as Record<string, unknown>)
      .find(
        (value) =>
          value.scheduled_appointment_id ===
          'appointment-after-link-failure',
      )
    expect(appointmentPersistence).toEqual({
      scheduled_appointment_id: 'appointment-after-link-failure',
    })
    expect(appointmentPersistence).not.toHaveProperty('consult_id')
  })

  it('uses the canonical atomic system consult as the appointment persistence guard', async () => {
    autoScheduleMock.mockResolvedValueOnce({
      id: 'appointment-after-system-consult',
    })

    await processTriageInBackground('triage-1', {
      gatewayText: 'Synthetic complete source for a system consult.',
      textForScoring: 'Synthetic scoring source for a system consult.',
      referral_text: 'Synthetic complete source for a system consult.',
      patient_id: 'patient-1',
      temperature: 0,
      createConsultFlag: true,
      coverageStatus: 'not_applicable',
      tenantId: 'tenant-1',
    })

    const appointmentPersistence = updateMock.mock.calls
      .map(([value]) => value as Record<string, unknown>)
      .find(
        (value) =>
          value.scheduled_appointment_id ===
          'appointment-after-system-consult',
      )
    expect(appointmentPersistence).toEqual({
      scheduled_appointment_id: 'appointment-after-system-consult',
    })
    expect(appointmentPersistence).not.toHaveProperty('consult_id')
    expect(eqMock).toHaveBeenCalledWith(
      'consult_id',
      'consult-system-canonical',
    )
    expect(createConsultMock).not.toHaveBeenCalled()
  })

  it('blocks mixed-patient notification and scheduling when the explicit consult CAS is rejected', async () => {
    finalizeTriageAttemptMock.mockResolvedValueOnce({
      ok: false,
      reason: 'claim_or_binding_changed',
    })

    await processTriageInBackground('triage-1', {
      gatewayText: 'Synthetic complete source for patient A.',
      textForScoring: 'Synthetic scoring source for patient A.',
      referral_text: 'Synthetic complete source for patient A.',
      patient_id: 'patient-a',
      existingConsultId: 'consult-reassigned-to-patient-b',
      temperature: 0,
      createConsultFlag: false,
      coverageStatus: 'not_applicable',
      tenantId: 'tenant-1',
    })

    expect(finalizeTriageAttemptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        processingAttemptCount: 1,
        explicitConsult: expect.objectContaining({
          id: 'consult-reassigned-to-patient-b',
          expectedPatientId: 'patient-a',
        }),
      }),
    )
    expect(notifyMock).not.toHaveBeenCalled()
    expect(autoScheduleMock).not.toHaveBeenCalled()
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        processing_status: 'error',
      }),
    )
    expect(
      updateMock.mock.calls.some(
        ([value]) =>
          (value as Record<string, unknown>).processing_status === 'complete',
      ),
    ).toBe(false)
    expect(
      updateMock.mock.calls.some(
        ([value]) =>
          (value as Record<string, unknown>).consult_id ===
          'consult-reassigned-to-patient-b',
      ),
    ).toBe(false)
  })

  it('blocks every post-completion side effect when atomic finalization updates no claim', async () => {
    runGatewayMock.mockReturnValueOnce({
      status: 'completed',
      failureCode: null,
      carePathway: 'routine_outpatient',
      reviewRequirement: 'clinician_confirmation',
      schedulingLocked: true,
      signals: [],
      lexicalHits: [],
      version: 'neurology-emergency-gateway-v1',
    })
    finalizeTriageAttemptMock.mockResolvedValueOnce({
      ok: false,
      reason: 'claim_or_binding_changed',
    })

    await processTriageInBackground('triage-1', {
      gatewayText: 'Synthetic stable source for a stale processing claim.',
      textForScoring: 'Synthetic stable source for a stale processing claim.',
      referral_text: 'Synthetic stable source for a stale processing claim.',
      patient_id: 'patient-1',
      temperature: 0,
      createConsultFlag: true,
      coverageStatus: 'not_applicable',
      tenantId: 'tenant-1',
      processingAttemptCount: 7,
    })

    expect(finalizeTriageAttemptMock).toHaveBeenCalledWith(
      expect.objectContaining({ processingAttemptCount: 7 }),
    )
    expect(notifyMock).not.toHaveBeenCalled()
    expect(autoScheduleMock).not.toHaveBeenCalled()
    expect(createConsultMock).not.toHaveBeenCalled()
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ processing_status: 'error' }),
    )
    expect(eqMock).toHaveBeenCalledWith('processing_attempt_count', 7)
  })

  it('uses the floor returned by atomic finalization for every downstream consumer', async () => {
    runGatewayMock.mockReturnValueOnce({
      status: 'completed',
      failureCode: null,
      carePathway: 'routine_outpatient',
      reviewRequirement: 'clinician_confirmation',
      schedulingLocked: true,
      signals: [],
      lexicalHits: [],
      version: 'neurology-emergency-gateway-v1',
    })
    finalizeTriageAttemptMock.mockResolvedValueOnce({
      ok: true,
      triageTier: 'emergent',
      carePathway: 'emergency_now',
      dataQuality: 'conflicting',
      reviewRequirement: 'emergency_action',
      workflowStatus: 'emergency_hold',
      consultId: null,
    })

    await processTriageInBackground('triage-1', {
      gatewayText: 'Synthetic stable source with a concurrent emergency hold.',
      textForScoring:
        'Synthetic stable source with a concurrent emergency hold.',
      referral_text:
        'Synthetic stable source with a concurrent emergency hold.',
      patient_id: 'patient-1',
      temperature: 0,
      createConsultFlag: false,
      coverageStatus: 'not_applicable',
      tenantId: 'tenant-1',
      processingAttemptCount: 9,
    })

    expect(finalizeTriageAttemptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        proposedCarePathway: 'routine_outpatient',
        processingAttemptCount: 9,
      }),
    )
    expect(notifyMock).toHaveBeenCalledWith(
      'triage-1',
      'emergent',
      expect.stringContaining('EMERGENT'),
      expect.any(String),
      'patient-1',
      'tenant-1',
    )
    expect(autoScheduleMock).toHaveBeenCalledWith(
      'triage-1',
      'emergent',
      'patient-1',
      expect.any(Array),
      expect.any(String),
      expect.objectContaining({
        carePathway: 'emergency_now',
        workflowStatus: 'emergency_hold',
        dataQuality: 'conflicting',
        reviewRequirement: 'emergency_action',
        openEmergencyActions: 1,
      }),
    )
  })

  it('blocks downstream work when atomic system-consult finalization fails', async () => {
    runGatewayMock.mockReturnValueOnce({
      status: 'completed',
      failureCode: null,
      carePathway: 'routine_outpatient',
      reviewRequirement: 'clinician_confirmation',
      schedulingLocked: true,
      signals: [],
      lexicalHits: [],
      version: 'neurology-emergency-gateway-v1',
    })
    finalizeTriageAttemptMock.mockResolvedValueOnce({
      ok: false,
      reason: 'persistence_failed',
    })

    await processTriageInBackground('triage-1', {
      gatewayText:
        'Synthetic referral with enough source text for failed consult compare-and-set.',
      textForScoring:
        'Synthetic referral with enough source text for failed consult compare-and-set.',
      referral_text:
        'Synthetic referral with enough source text for failed consult compare-and-set.',
      patient_id: 'patient-1',
      temperature: 0,
      createConsultFlag: true,
      coverageStatus: 'not_applicable',
      tenantId: 'tenant-1',
    })

    expect(finalizeTriageAttemptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        systemConsult: expect.objectContaining({
          expectedPatientId: 'patient-1',
        }),
      }),
    )
    expect(createConsultMock).not.toHaveBeenCalled()
    expect(notifyMock).not.toHaveBeenCalled()
    expect(autoScheduleMock).not.toHaveBeenCalled()
  })

  it('fails closed to an undetermined hold when the independent safety model fails', async () => {
    runGatewayMock.mockReturnValueOnce({
      status: 'completed',
      failureCode: null,
      carePathway: 'routine_outpatient',
      reviewRequirement: 'clinician_confirmation',
      schedulingLocked: true,
      signals: [],
      lexicalHits: [],
      version: 'neurology-emergency-gateway-v1',
    })
    runSafetyMock.mockRejectedValueOnce(new Error('synthetic timeout'))

    await processTriageInBackground('triage-1', {
      gatewayText:
        'Synthetic referral with stable symptoms and enough text for testing.',
      textForScoring:
        'Synthetic referral with stable symptoms and enough text for testing.',
      referral_text:
        'Synthetic referral with stable symptoms and enough text for testing.',
      temperature: 0,
      createConsultFlag: false,
      coverageStatus: 'not_applicable',
      tenantId: 'tenant-1',
    })

    expect(persistModelSafetyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        safetyResult: null,
        safetyFailure: 'Error',
        fusion: expect.objectContaining({
          carePathway: 'undetermined',
          reviewRequirement: 'immediate_clinician_review',
        }),
      }),
    )
    expect(finalizeTriageAttemptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        proposedCarePathway: 'undetermined',
        scoringTier: 'insufficient_data',
      }),
    )
  })

  it('does not spend an adjudicator call when safety branches agree', async () => {
    runGatewayMock.mockReturnValueOnce({
      status: 'completed',
      failureCode: null,
      carePathway: 'routine_outpatient',
      reviewRequirement: 'clinician_confirmation',
      schedulingLocked: true,
      signals: [],
      lexicalHits: [],
      version: 'neurology-emergency-gateway-v1',
    })

    await processTriageInBackground('triage-1', {
      gatewayText:
        'Synthetic stable referral with enough text for branch agreement.',
      textForScoring:
        'Synthetic stable referral with enough text for branch agreement.',
      referral_text:
        'Synthetic stable referral with enough text for branch agreement.',
      temperature: 0,
      createConsultFlag: false,
      coverageStatus: 'not_applicable',
      tenantId: 'tenant-1',
    })

    expect(runAdjudicatorMock).not.toHaveBeenCalled()
    expect(persistModelSafetyMock).toHaveBeenCalledWith(
      expect.objectContaining({ adjudicatorResult: null }),
    )
  })

  it('persists an independent safety emergency even when scorer output is invalid', async () => {
    runGatewayMock.mockReturnValueOnce({
      status: 'completed',
      failureCode: null,
      carePathway: 'routine_outpatient',
      reviewRequirement: 'clinician_confirmation',
      schedulingLocked: true,
      signals: [],
      lexicalHits: [],
      version: 'neurology-emergency-gateway-v1',
    })
    runSafetyMock.mockResolvedValueOnce({
      carePathway: 'emergency_now',
      dataQuality: 'partial',
      criticalUnknowns: [],
      signals: [{ code: 'synthetic_time_critical_signal' }],
    })
    invokeBedrockMock.mockResolvedValueOnce({ parsed: {} })

    await processTriageInBackground('triage-1', {
      gatewayText: 'Synthetic exact source with a current emergency signal.',
      textForScoring: 'Synthetic extracted source.',
      referral_text: 'Synthetic exact source with a current emergency signal.',
      temperature: 0,
      createConsultFlag: false,
      coverageStatus: 'not_applicable',
      tenantId: 'tenant-1',
    })

    expect(persistModelSafetyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        safetyResult: expect.objectContaining({
          carePathway: 'emergency_now',
        }),
        fusion: expect.objectContaining({
          carePathway: 'emergency_now',
          reviewRequirement: 'emergency_action',
        }),
      }),
    )
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        processing_status: 'error',
        processing_claimed_at: null,
        processing_lease_expires_at: null,
      }),
    )
  })

  it('preserves a scorer emergency marker when unrelated outpatient fields are invalid', async () => {
    runGatewayMock.mockReturnValueOnce({
      status: 'completed',
      failureCode: null,
      carePathway: 'routine_outpatient',
      reviewRequirement: 'clinician_confirmation',
      schedulingLocked: true,
      signals: [],
      lexicalHits: [],
      version: 'neurology-emergency-gateway-v1',
    })
    invokeBedrockMock.mockResolvedValueOnce({
      parsed: {
        ...routineModelResponse,
        emergent_override: true,
        emergent_reason: null,
        suggested_workup: [],
        subspecialty_recommendation: 'Imaginary Precision Neurology',
      },
      inputTokens: 100,
      outputTokens: 100,
    })

    await processTriageInBackground('triage-1', {
      gatewayText: 'Synthetic source with an emergency visible only to scorer.',
      textForScoring: 'Synthetic source with an emergency visible only to scorer.',
      referral_text: 'Synthetic source with an emergency visible only to scorer.',
      temperature: 0,
      createConsultFlag: false,
      coverageStatus: 'not_applicable',
      tenantId: 'tenant-1',
    })

    expect(persistModelSafetyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scoringStatus: 'invalid',
        scoringFailure: 'schema_invalid',
        fusion: expect.objectContaining({
          carePathway: 'emergency_now',
          reviewRequirement: 'emergency_action',
          schedulingLocked: true,
        }),
      }),
    )
    expect(notifyMock).toHaveBeenCalledWith(
      'triage-1',
      'emergent',
      expect.stringMatching(/EMERGENT/),
      expect.stringMatching(/independent neurology safety review/i),
      null,
      'tenant-1',
    )
    expect(finalizeTriageAttemptMock).not.toHaveBeenCalled()
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        processing_status: 'error',
        processing_claimed_at: null,
        processing_lease_expires_at: null,
      }),
    )
  })

  it('persists only the normalized scorer contract after model validation', async () => {
    runGatewayMock.mockReturnValueOnce({
      status: 'completed',
      failureCode: null,
      carePathway: 'routine_outpatient',
      reviewRequirement: 'clinician_confirmation',
      schedulingLocked: true,
      signals: [],
      lexicalHits: [],
      version: 'neurology-emergency-gateway-v1',
    })
    invokeBedrockMock.mockResolvedValueOnce({
      parsed: {
        ...routineModelResponse,
        clinical_reasons: ['  Stable synthetic symptoms.  '],
        failed_therapies: [
          { therapy: '  Synthetic therapy  ', reason_stopped: '   ' },
        ],
      },
      inputTokens: 100,
      outputTokens: 100,
    })

    await processTriageInBackground('triage-1', {
      gatewayText: 'Synthetic stable source with no time-critical feature.',
      textForScoring: 'Synthetic stable source with no time-critical feature.',
      referral_text: 'Synthetic stable source with no time-critical feature.',
      temperature: 0,
      createConsultFlag: false,
      coverageStatus: 'not_applicable',
      tenantId: 'tenant-1',
    })

    expect(finalizeTriageAttemptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicalReasons: ['Stable synthetic symptoms.'],
        failedTherapies: [
          { therapy: 'Synthetic therapy', reason_stopped: '' },
        ],
        aiRawResponse: expect.objectContaining({
          clinical_reasons: ['Stable synthetic symptoms.'],
          failed_therapies: [
            { therapy: 'Synthetic therapy', reason_stopped: '' },
          ],
        }),
      }),
    )
  })

  it('uses verified full-packet gateway and safety results without sending oversized raw text to one model', async () => {
    const packetGateway = {
      status: 'completed' as const,
      failureCode: null,
      carePathway: 'emergency_now' as const,
      reviewRequirement: 'emergency_action' as const,
      schedulingLocked: true as const,
      signals: [],
      lexicalHits: [],
      version: 'neurology-long-packet-emergency-map-reduce-v1',
    }
    const packetSafety = {
      carePathway: 'emergency_now' as const,
      dataQuality: 'sufficient' as const,
      criticalUnknowns: [],
      signals: [],
    }

    await processTriageInBackground('triage-1', {
      gatewayText: 'x'.repeat(100_000),
      textForScoring: 'Complete verified packet summary with acute findings.',
      adjudicationText: 'Complete verified packet summary with acute findings.',
      precomputedGateway: packetGateway,
      precomputedSafetyResult: packetSafety,
      referral_text: 'x'.repeat(100_000),
      temperature: 0,
      createConsultFlag: false,
      coverageStatus: 'complete',
      tenantId: 'tenant-1',
    })

    expect(runGatewayMock).not.toHaveBeenCalled()
    expect(runSafetyMock).not.toHaveBeenCalled()
    expect(persistGatewayMock).toHaveBeenCalledWith(
      'triage-1',
      'tenant-1',
      packetGateway,
      1,
    )
    expect(persistModelSafetyMock).toHaveBeenCalledWith(
      expect.objectContaining({ safetyResult: packetSafety }),
    )
  })
})
