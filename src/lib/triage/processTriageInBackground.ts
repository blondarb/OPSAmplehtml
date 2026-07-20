import { invokeBedrockClinicalTool } from '@/lib/bedrock'
import { TRIAGE_SCORING_SCHEMA } from '@/lib/triage/scoringToolSchema'
import { deriveChiefComplaint } from '@/lib/consult/contextBuilder'
import { from } from '@/lib/db-query'
import { notifyTriageUrgent } from '@/lib/notifications'
import { autoScheduleFromTriage } from '@/lib/triage/autoSchedule'
import { runEmergencyGateway } from '@/lib/triage/emergencyGateway'
import { persistEmergencyGatewayResult } from '@/lib/triage/gatewayPersistence'
import type { PersistableEmergencyGatewayResult } from '@/lib/triage/gatewayPersistence'
import {
  applyAdjudicatorDecision,
  fuseTriageBranches,
  type ClinicalBranch,
} from '@/lib/triage/ensemblePolicy'
import {
  MODEL_SAFETY_EXTRACTION_PROMPT_VERSION,
  runModelSafetyExtractor,
} from '@/lib/triage/modelSafetyExtractor'
import type { ValidatedModelSafetyExtraction } from '@/lib/triage/modelSafetyExtraction'
import { persistModelSafetyFusion } from '@/lib/triage/modelSafetyPersistence'
import { finalizeTriageAttempt } from '@/lib/triage/triageCompletionPersistence'
import {
  runTriageAdjudicator,
  TRIAGE_ADJUDICATOR_PROMPT_VERSION,
  type ValidatedTriageAdjudicatorDecision,
} from '@/lib/triage/modelAdjudicator'
import {
  calculateTriageDecision,
  calculateTriageTier,
  extractScoringEmergencyEnvelope,
  formatTierDisplay,
  parseAndNormalizeAIResponse,
} from '@/lib/triage/scoring'
import {
  TRIAGE_SCORING_PROMPT_VERSION,
  TRIAGE_SYSTEM_PROMPT,
  buildTriageUserPrompt,
} from '@/lib/triage/systemPrompt'
import { resolveTriageModelRegistry } from '@/lib/triage/modelRegistry'
import {
  ClinicalModelTimeoutError,
  runClinicalModelWithTimeout,
} from '@/lib/triage/modelTimeout'
import {
  AITriageResponse,
  type CoverageStatus,
  type TriageTier,
} from '@/lib/triage/types'

const TRIAGE_MODELS = resolveTriageModelRegistry()
export const TRIAGE_MODEL = TRIAGE_MODELS.outpatientScorer
const MODEL_BRANCH_TIMEOUT_MS = 45_000

type ScoringBranchResult = {
  aiResponse: AITriageResponse
  scoring: ReturnType<typeof calculateTriageTier>
  decision: ReturnType<typeof calculateTriageDecision>
  inputTokens?: number
  outputTokens?: number
}

type ScoringBranchOutcome = {
  branch: ClinicalBranch<ScoringBranchResult>
  emergencyEnvelope: ReturnType<typeof extractScoringEmergencyEnvelope>
}

function failedModelBranch(error: unknown): ClinicalBranch<never> {
  if (error instanceof ClinicalModelTimeoutError) {
    return { status: 'timeout', reason: 'deadline_exceeded' }
  }
  return {
    status: 'failed',
    reason:
      error instanceof Error ? error.name : 'unknown_model_branch_failure',
  }
}

export interface TriageBackgroundParams {
  /** Complete raw source text used only by the deterministic safety gateway. */
  gatewayText: string
  /** Clinician-reviewed extraction or raw source used for model scoring. */
  textForScoring: string
  patient_age?: number
  patient_sex?: string
  referring_provider_type?: string
  patient_id?: string
  referral_text: string
  temperature: number
  createConsultFlag: boolean
  existingConsultId?: string
  coverageStatus: CoverageStatus
  tenantId: string
  precomputedGateway?: PersistableEmergencyGatewayResult
  precomputedSafetyResult?: ValidatedModelSafetyExtraction
  adjudicationText?: string
  processingAttemptCount?: number
}

export async function processTriageInBackground(
  sessionId: string,
  params: TriageBackgroundParams,
): Promise<void> {
  const processingAttemptCount = params.processingAttemptCount ?? 1
  try {
    // The deterministic screen runs and is durably persisted before any model
    // call. A later LLM result may escalate it, but can never downgrade it.
    const emergencyGateway =
      params.precomputedGateway ?? runEmergencyGateway(params.gatewayText)
    const gatewayPersisted = await persistEmergencyGatewayResult(
      sessionId,
      params.tenantId,
      emergencyGateway,
      processingAttemptCount,
    )
    if (!gatewayPersisted) {
      await markError(
        sessionId,
        params.tenantId,
        'The deterministic safety screen could not be recorded. Immediate manual review is required.',
        processingAttemptCount,
      )
      return
    }

    let deterministicSafetyNotificationSent = false
    if (
      !params.existingConsultId &&
      (emergencyGateway.carePathway === 'emergency_now' ||
        emergencyGateway.carePathway === 'same_day_clinician_review')
    ) {
      try {
        await notifyTriageUrgent(
          sessionId,
          emergencyGateway.carePathway === 'emergency_now' ? 'emergent' : 'urgent',
          emergencyGateway.carePathway === 'emergency_now'
            ? 'EMERGENT — immediate action required'
            : 'SAME-DAY CLINICIAN REVIEW',
          'Deterministic neurology emergency screen requires immediate workflow action.',
          params.patient_id || null,
          params.tenantId,
        )
        deterministicSafetyNotificationSent = true
      } catch {
        // The durable emergency action remains the source of truth; a failed
        // notification channel must not prevent the rest of triage processing.
        console.error('[triage] deterministic safety notification failed')
      }
    }

    const userPrompt = buildTriageUserPrompt(params.textForScoring, {
      patientAge: params.patient_age,
      patientSex: params.patient_sex,
      referringProviderType: params.referring_provider_type,
    })

    const safetyBranchPromise: Promise<
      ClinicalBranch<ValidatedModelSafetyExtraction>
    > = params.precomputedSafetyResult
      ? Promise.resolve({
          status: 'complete',
          result: params.precomputedSafetyResult,
        })
      : runClinicalModelWithTimeout({
          label: 'safety_extractor',
          timeoutMs: MODEL_BRANCH_TIMEOUT_MS,
          operation: (signal) =>
            runModelSafetyExtractor(params.gatewayText, {
              model: TRIAGE_MODELS.safetyExtractor,
              signal,
            }),
        })
          .then((safetyResult) => ({
            status: 'complete' as const,
            result: safetyResult,
          }))
          .catch(failedModelBranch)

    // Strict tool-output path: forces one schema-validated JSON tool call
    // instead of the text-JSON path, whose strict parse fails whenever the
    // model wraps the payload in markdown fences or preamble (the root cause of
    // intermittent outpatient-scoring "invalid JSON" false-holds). The schema
    // enforces structure only; parseAndNormalizeAIResponse still owns all
    // clinical/enum/range validation below, unchanged.
    const invokeOutpatientScorer = () =>
      runClinicalModelWithTimeout({
        label: 'outpatient_scorer',
        timeoutMs: MODEL_BRANCH_TIMEOUT_MS,
        operation: (signal) =>
          invokeBedrockClinicalTool<unknown>({
            system: TRIAGE_SYSTEM_PROMPT,
            messages: [{ role: 'user', content: userPrompt }],
            maxTokens: 4096,
            temperature: params.temperature,
            model: TRIAGE_MODEL,
            cacheSystem: true,
            signal,
            toolName: 'emit_triage_scoring',
            toolDescription:
              'Emit the complete structured outpatient triage scoring result.',
            inputSchema: TRIAGE_SCORING_SCHEMA,
          }),
      })
    const scoringBranchPromise: Promise<ScoringBranchOutcome> =
      invokeOutpatientScorer()
        .catch((error: unknown) => {
          // A deadline overrun already consumed the branch's full time
          // budget; only transient output failures get the single retry.
          if (error instanceof ClinicalModelTimeoutError) throw error
          return invokeOutpatientScorer()
        })
        .then((result): ScoringBranchOutcome => {
          const emergencyEnvelope = extractScoringEmergencyEnvelope(
            result.parsed,
          )
          let aiResponse: AITriageResponse
          try {
            aiResponse = parseAndNormalizeAIResponse(result.parsed)
          } catch (error) {
            console.error(
              'AI response validation failed:',
              error instanceof Error ? error.message : 'unknown schema error',
            )
            return {
              branch: { status: 'invalid', reason: 'schema_invalid' },
              emergencyEnvelope,
            }
          }
          return {
            branch: {
              status: 'complete',
              result: {
                aiResponse,
                scoring: calculateTriageTier(aiResponse),
                decision: calculateTriageDecision(aiResponse),
                inputTokens: result.inputTokens,
                outputTokens: result.outputTokens,
              },
            },
            emergencyEnvelope,
          }
        })
        .catch((error): ScoringBranchOutcome => ({
          branch: failedModelBranch(error),
          emergencyEnvelope: {
            emergentOverride: false,
            emergentReason: null,
          },
        }))

    const [safetyBranch, scoringOutcome] = await Promise.all([
      safetyBranchPromise,
      scoringBranchPromise,
    ])
    const scoringBranch = scoringOutcome.branch

    const scoringDecisionBranch: ClinicalBranch<
      ReturnType<typeof calculateTriageDecision>
    > =
      scoringBranch.status === 'complete'
        ? { status: 'complete', result: scoringBranch.result.decision }
        : scoringBranch
    let fusion = fuseTriageBranches({
      gateway: emergencyGateway,
      safetyBranch,
      scoringBranch: scoringDecisionBranch,
      scoringEmergencyOverride:
        scoringOutcome.emergencyEnvelope.emergentOverride,
    })
    let adjudicatorResult: ValidatedTriageAdjudicatorDecision | null = null
    let adjudicatorFailure: string | null = null
    if (fusion.adjudicationRequired) {
      try {
        adjudicatorResult = await runClinicalModelWithTimeout({
          label: 'adjudicator',
          timeoutMs: MODEL_BRANCH_TIMEOUT_MS,
          operation: (signal) =>
            runTriageAdjudicator(
              params.adjudicationText ?? params.gatewayText,
              {
                deterministicPathway: emergencyGateway.carePathway,
                safetyModelPathway:
                  safetyBranch.status === 'complete'
                    ? safetyBranch.result.carePathway
                    : safetyBranch.status,
                scoringPathway:
                  scoringOutcome.emergencyEnvelope.emergentOverride
                    ? 'emergency_now'
                    : scoringBranch.status === 'complete'
                      ? scoringBranch.result.decision.carePathway
                      : scoringBranch.status,
                fusionReasons: fusion.reasons,
              },
              { model: TRIAGE_MODELS.adjudicator, signal },
            ),
        })
        fusion = applyAdjudicatorDecision(fusion, adjudicatorResult)
      } catch (error: unknown) {
        adjudicatorFailure =
          error instanceof ClinicalModelTimeoutError
            ? 'deadline_exceeded'
            : error instanceof Error
              ? error.name
              : 'unknown_adjudicator_failure'
        fusion = {
          ...fusion,
          reasons: [
            ...fusion.reasons,
            error instanceof ClinicalModelTimeoutError
              ? 'adjudicator_timeout'
              : 'adjudicator_failed',
          ],
        }
      }
    }
    const modelSafetyPersisted = await persistModelSafetyFusion({
      triageSessionId: sessionId,
      tenantId: params.tenantId,
      modelProfile: TRIAGE_MODELS.safetyExtractor,
      promptVersion: MODEL_SAFETY_EXTRACTION_PROMPT_VERSION,
      safetyResult:
        safetyBranch.status === 'complete' ? safetyBranch.result : null,
      safetyFailure:
        safetyBranch.status === 'complete' ? null : safetyBranch.reason,
      scoringStatus: scoringBranch.status,
      scoringFailure:
        scoringBranch.status === 'complete' ? null : scoringBranch.reason,
      scoringModelProfile: TRIAGE_MODEL,
      scoringPromptVersion: TRIAGE_SCORING_PROMPT_VERSION,
      fusion,
      adjudicatorResult,
      adjudicatorFailure,
      adjudicatorModelProfile: fusion.adjudicationRequired
        ? TRIAGE_MODELS.adjudicator
        : null,
      adjudicatorPromptVersion: fusion.adjudicationRequired
        ? TRIAGE_ADJUDICATOR_PROMPT_VERSION
        : null,
      processingAttemptCount,
    })
    if (!modelSafetyPersisted.ok) {
      await markError(
        sessionId,
        params.tenantId,
        'The independent safety review could not be recorded. Immediate manual review is required.',
        processingAttemptCount,
      )
      return
    }

    if (scoringBranch.status !== 'complete') {
      if (
        (fusion.carePathway === 'emergency_now' ||
          fusion.carePathway === 'same_day_clinician_review') &&
        emergencyGateway.carePathway !== 'emergency_now' &&
        emergencyGateway.carePathway !== 'same_day_clinician_review'
      ) {
        try {
          await notifyTriageUrgent(
            sessionId,
            fusion.carePathway === 'emergency_now' ? 'emergent' : 'urgent',
            fusion.carePathway === 'emergency_now'
              ? 'EMERGENT — immediate action required'
              : 'SAME-DAY CLINICIAN REVIEW',
            'Independent neurology safety review requires immediate workflow action; outpatient scoring did not complete.',
            params.patient_id || null,
            params.tenantId,
          )
        } catch {
          console.error('[triage] model safety notification failed')
        }
      }
      await markError(
        sessionId,
        params.tenantId,
        scoringBranch.status === 'invalid'
          ? 'The outpatient scoring response was invalid. The independent safety result was preserved and immediate manual review is required.'
          : 'The outpatient scoring branch did not complete. The independent safety result was preserved and immediate manual review is required.',
        processingAttemptCount,
      )
      return
    }

    const {
      aiResponse,
      scoring,
      decision: scoringDecision,
      inputTokens,
      outputTokens,
    } = scoringBranch.result
    const decision = {
      ...scoringDecision,
      carePathway: modelSafetyPersisted.carePathway,
      dataQuality: modelSafetyPersisted.dataQuality,
      reviewRequirement: modelSafetyPersisted.reviewRequirement,
      schedulingLocked: true,
      appliedFloors: [
        ...scoringDecision.appliedFloors,
        ...fusion.reasons,
      ],
    }
    const proposedTier: TriageTier =
      decision.carePathway === 'emergency_now'
        ? 'emergent'
        : decision.carePathway === 'same_day_clinician_review'
          ? 'urgent'
          : decision.carePathway === 'undetermined'
            ? 'insufficient_data'
            : scoring.tier
    const chiefComplaint = deriveChiefComplaint(
      aiResponse.clinical_reasons || [],
      params.referral_text,
      aiResponse.subspecialty_recommendation || '',
    )
    const completion = await finalizeTriageAttempt({
      triageSessionId: sessionId,
      tenantId: params.tenantId,
      processingAttemptCount,
      proposedCarePathway: decision.carePathway,
      scoringTier: proposedTier,
      confidence: aiResponse.confidence,
      dimensionScores: aiResponse.dimension_scores,
      weightedScore: scoring.weightedScore,
      clinicalReasons: aiResponse.clinical_reasons || [],
      redFlags: aiResponse.red_flags || [],
      suggestedWorkup: aiResponse.suggested_workup || [],
      failedTherapies: aiResponse.failed_therapies || [],
      missingInformation: aiResponse.missing_information,
      subspecialtyRecommendation:
        aiResponse.subspecialty_recommendation || '',
      subspecialtyRationale: aiResponse.subspecialty_rationale || '',
      aiRawResponse: aiResponse,
      aiInputTokens: inputTokens ?? null,
      aiOutputTokens: outputTokens ?? null,
      redFlagOverride: aiResponse.red_flag_override,
      ...(params.existingConsultId
        ? {
            explicitConsult: {
              id: params.existingConsultId,
              expectedPatientId: params.patient_id ?? null,
              chiefComplaint,
            },
          }
        : params.createConsultFlag
          ? {
              systemConsult: {
                expectedPatientId: params.patient_id ?? null,
                referralText: params.referral_text,
                chiefComplaint,
              },
            }
          : {}),
    })
    if (!completion.ok) {
      await markError(
        sessionId,
        params.tenantId,
        completion.reason === 'claim_or_binding_changed'
          ? 'The processing claim or consult binding changed before triage could be finalized. Human review is required; no downstream action was created.'
          : 'The authoritative triage result could not be finalized. Human review is required; no downstream action was created.',
        processingAttemptCount,
      )
      console.error(
        '[triage] atomic finalization rejected; downstream notification and scheduling were blocked',
      )
      return
    }

    const finalTier = completion.triageTier
    const finalTierDisplay = formatTierDisplay(
      finalTier,
      aiResponse.red_flag_override,
    )
    // Urgent triage notification is non-fatal.
    try {
      const deterministicNotificationAlreadySent =
        deterministicSafetyNotificationSent &&
        (emergencyGateway.carePathway === 'emergency_now' ||
          (emergencyGateway.carePathway === 'same_day_clinician_review' &&
            finalTier !== 'emergent'))
      if (!deterministicNotificationAlreadySent) {
        await notifyTriageUrgent(
          sessionId,
          finalTier,
          finalTierDisplay,
          deriveChiefComplaint(
            aiResponse.clinical_reasons || [],
            params.referral_text,
            aiResponse.subspecialty_recommendation || '',
          ),
          params.patient_id || null,
          params.tenantId,
        )
      }
    } catch (notificationError) {
      console.error('Triage notification error (non-fatal):', notificationError)
    }

    // Auto-scheduling is called with a locked, unreviewed state. The policy
    // layer rejects it until a clinician completes final disposition.
    let scheduledAppointmentId: string | null = null
    if (params.patient_id) {
      try {
        const appointment = await autoScheduleFromTriage(
          sessionId,
          finalTier,
          params.patient_id,
          aiResponse.clinical_reasons || [],
          aiResponse.subspecialty_recommendation || '',
          {
            carePathway: completion.carePathway,
            workflowStatus: completion.workflowStatus,
            schedulingLocked: true,
            reviewedAt: null,
            reviewedBy: null,
            finalCarePathway: null,
            finalTriageTier: null,
            openCriticalClarifications: 0,
            openEmergencyActions:
              completion.carePathway === 'emergency_now' ? 1 : 0,
            coverageStatus: 'not_applicable',
            dataQuality: completion.dataQuality,
            reviewRequirement: completion.reviewRequirement,
          },
        )
        scheduledAppointmentId = appointment?.id || null
      } catch (scheduleError) {
        console.error('Triage auto-schedule error (non-fatal):', scheduleError)
      }
    }

    if (scheduledAppointmentId) {
      try {
        const downstreamBindings = {
          scheduled_appointment_id: scheduledAppointmentId,
        }
        let persistence = from('triage_sessions')
          .update(downstreamBindings)
          .eq('id', sessionId)
          .eq('tenant_id', params.tenantId)
          .eq('processing_status', 'complete')
          .eq('processing_attempt_count', processingAttemptCount)

        if (completion.consultId) {
          persistence = persistence.eq('consult_id', completion.consultId)
        }

        const { data, error } = await persistence.select('id').maybeSingle()
        if (error || !data?.id) {
          throw new Error(
            error?.message ??
              'The source-bound triage session rejected appointment persistence.',
          )
        }
      } catch (error) {
        console.error('Failed to persist scheduled_appointment_id:', error)
      }
    }
  } catch (error: unknown) {
    console.error('Background triage failed:', error)
    let message = 'An error occurred while processing your request'
    if (error instanceof Error) {
      const raw = error.message
      if (
        raw.includes('credential') ||
        raw.includes('Could not load') ||
        raw.includes('AWS') ||
        raw.includes('Bedrock')
      ) {
        message =
          'The triage service is temporarily unavailable. Please try again shortly or triage this patient manually.'
      } else {
        message = raw
      }
    }
    await markError(
      sessionId,
      params.tenantId,
      message,
      processingAttemptCount,
    )
  }
}

async function markError(
  sessionId: string,
  tenantId: string,
  message: string,
  processingAttemptCount: number,
): Promise<void> {
  try {
    await from('triage_sessions')
      .update({
        processing_status: 'error',
        processing_claimed_at: null,
        processing_lease_expires_at: null,
        error_message: message,
        completed_at: new Date(),
      })
      .eq('id', sessionId)
      .eq('tenant_id', tenantId)
      .eq('processing_status', 'pending')
      .eq('processing_attempt_count', processingAttemptCount)
  } catch (error) {
    console.error('Failed to mark triage_sessions row as error:', error)
  }
}
