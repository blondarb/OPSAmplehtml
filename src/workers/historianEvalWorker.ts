import type { SQSBatchResponse, SQSEvent } from 'aws-lambda'
import { getPool } from '@/lib/db'
import {
  HistorianEvalJobService,
  parseHistorianEvalMessage,
  safeHistorianEvalErrorCode,
} from '@/lib/historian/eval/durableJobs'
import { generateFinalDifferential } from '@/lib/historian/eval/finalDifferential'
import { runThoroughnessJudge } from '@/lib/historian/eval/thoroughnessJudge'
import { runIndependentDdxAndAgreement } from '@/lib/historian/eval/independentDdx'
import {
  clinicianHistoryReportInputDigest,
  generateClinicianHistoryReport,
  type ClinicianHistoryReportInput,
  type ClinicianHistoryReportV1,
} from '@/lib/historian/eval/clinicianHistoryReport'
import {
  buildWithheldFinalDifferential,
  deriveDiagnosticSufficiency,
  diagnosticSufficiencyAllowsDdx,
  type DiagnosticSufficiencyV1,
} from '@/lib/historian/diagnosticSufficiency'
import { parseLiveInterviewReviewArtifact } from '@/lib/historian/liveReviewContract'
import {
  createMedicationReconciliationState,
  parseMedicationReconciliationState,
} from '@/lib/historian/medicationReconciliation'
import type { ClaimedHistorianEvalJob } from '@/lib/historian/eval/durableJobs'
import { buildDiagnosticInputProjection } from '@/lib/historian/eval/diagnosticInput'

class HistorianEvaluationIntegrityError extends Error {
  readonly name = 'HistorianEvaluationIntegrityError'
}

function sufficiencyIntegrityView(value: DiagnosticSufficiencyV1): unknown {
  return {
    version: value.version,
    outcome: value.outcome,
    ddx_allowed: value.ddx_allowed,
    termination_reason: value.termination_reason,
    reviewed_through_seq: value.reviewed_through_seq,
    patient_turn_count: value.patient_turn_count,
    dimensions: value.dimensions,
    blocking_gaps: value.blocking_gaps,
    uncertainty_domains: value.uncertainty_domains,
    medication: value.medication,
    input_digest: value.input_digest,
    provenance: {
      review_version: value.provenance.review_version,
      model_id: value.provenance.model_id,
      prompt_version: value.provenance.prompt_version,
    },
  }
}

function configuredLeaseSeconds(): number {
  const parsed = Number(process.env.HISTORIAN_EVAL_LEASE_SECONDS || 360)
  return Number.isSafeInteger(parsed) && parsed >= 60 && parsed <= 900 ? parsed : 360
}

function deriveClaimSufficiency(claim: ClaimedHistorianEvalJob): {
  sufficiency: DiagnosticSufficiencyV1
  medication: ReturnType<typeof createMedicationReconciliationState>
} {
  const rawMedication = claim.structuredOutput?.medication_reconciliation_v1
  const medication = rawMedication == null
    ? createMedicationReconciliationState()
    : parseMedicationReconciliationState(rawMedication, claim.transcript)
  const rawReview = claim.promptVersion === 'comprehensive-v4'
    ? claim.structuredOutput?.live_review_v2
    : claim.structuredOutput?.live_review_v1
  let reviewArtifact = null
  if (rawReview != null) {
    reviewArtifact = parseLiveInterviewReviewArtifact(rawReview, claim.transcript)
  }
  const sufficiency = deriveDiagnosticSufficiency({
    transcript: claim.transcript,
    promptVersion: claim.promptVersion ?? 'comprehensive-v1',
    completionStatus: claim.completionStatus ?? 'ended_early',
    terminationReason: claim.terminationReason ?? 'manual_end',
    reviewArtifact,
    medicationState: rawMedication == null ? null : medication,
  })
  if (claim.diagnosticSufficiency) {
    const persisted = claim.diagnosticSufficiency
    if (JSON.stringify(sufficiencyIntegrityView(persisted)) !== JSON.stringify(sufficiencyIntegrityView(sufficiency))) {
      throw new HistorianEvaluationIntegrityError('Diagnostic sufficiency does not match immutable session inputs.')
    }
    return { sufficiency: persisted, medication }
  }
  return { sufficiency, medication }
}

function reportInputForClaim(
  claim: ClaimedHistorianEvalJob,
  sufficiency: DiagnosticSufficiencyV1,
  medication: ReturnType<typeof createMedicationReconciliationState>,
): ClinicianHistoryReportInput {
  const limitations: string[] = []
  if (sufficiency.outcome === 'insufficient_partial') {
    limitations.push(`Interview ended before normal completion: ${sufficiency.termination_reason}.`)
  } else if (!sufficiency.ddx_allowed) {
    limitations.push(`Diagnostic-depth gate did not permit completion: ${sufficiency.outcome}.`)
  }
  if (sufficiency.uncertainty_domains.length > 0) {
    limitations.push(`Uncertain history domains: ${sufficiency.uncertainty_domains.join(', ')}.`)
  }
  if (sufficiency.medication.status !== 'closed') {
    limitations.push('Medication reconciliation contains unresolved or unobtained information.')
  }
  return {
    transcript: claim.transcript,
    medicationReconciliation: medication,
    reportStatus: sufficiency.outcome === 'sufficient'
      ? 'complete'
      : sufficiency.outcome === 'sufficient_with_uncertainty'
        ? 'complete_with_uncertainty'
        : 'partial',
    limitations,
    terminationReason: sufficiency.termination_reason,
    patientTurnCount: sufficiency.patient_turn_count,
    reviewedThroughSeq: sufficiency.reviewed_through_seq,
  }
}

function existingReportForInput(
  report: ClinicianHistoryReportV1 | null,
  input: ClinicianHistoryReportInput,
): ClinicianHistoryReportV1 | null {
  if (!report) return null
  if (report.input_digest !== clinicianHistoryReportInputDigest(input)) {
    throw new HistorianEvaluationIntegrityError('Persisted clinician report input digest changed.')
  }
  return report
}

export async function processHistorianEvalEvent(
  event: SQSEvent,
  service: HistorianEvalJobService,
): Promise<SQSBatchResponse> {
  const batchItemFailures: SQSBatchResponse['batchItemFailures'] = []

  for (const record of event.Records) {
    let message
    try {
      message = parseHistorianEvalMessage(record.body)
    } catch {
      batchItemFailures.push({ itemIdentifier: record.messageId })
      continue
    }

    let claim
    try {
      claim = await service.claim(message.job_id, configuredLeaseSeconds())
    } catch {
      batchItemFailures.push({ itemIdentifier: record.messageId })
      continue
    }
    // Duplicate delivery for completed, actively leased, retry-delayed, or
    // terminal work is safe to acknowledge. The database is authoritative.
    if (!claim) continue

    try {
      if (claim.pipelineVersion === 1) {
        // Migration 064 deliberately leaves pre-existing work on pipeline 1.
        // Preserve that historical contract instead of reinterpreting an
        // in-flight legacy session through v4 sufficiency/report rules.
        if (!claim.finalDifferential) {
          const legacyDifferential = await generateFinalDifferential(
            claim.transcript,
            claim.chiefComplaint,
          )
          await service.persistFinalDifferential(claim, legacyDifferential)
          if (process.env.HISTORIAN_EVAL_QA_AUTORUN !== 'false') {
            await runThoroughnessJudge(claim.sessionId, claim.transcript, {
              chiefComplaint: claim.chiefComplaint,
              structuredOutput: claim.structuredOutput,
              narrativeSummary: claim.narrativeSummary,
              reports: claim.narrativeSummary
                ? { narrative_summary: claim.narrativeSummary }
                : undefined,
            })
            await runIndependentDdxAndAgreement(
              claim.sessionId,
              claim.transcript,
              claim.chiefComplaint,
            )
          }
        }
        await service.complete(claim)
        continue
      }
      if (claim.pipelineVersion !== 2) {
        throw new HistorianEvaluationIntegrityError('Historian evaluation pipeline version is unsupported.')
      }

      const derived = deriveClaimSufficiency(claim)
      if (!claim.diagnosticSufficiency) {
        await service.persistDiagnosticSufficiency(claim, derived.sufficiency)
      }

      const reportInput = reportInputForClaim(claim, derived.sufficiency, derived.medication)
      const report = existingReportForInput(claim.clinicianHistoryReport, reportInput) ??
        await generateClinicianHistoryReport(reportInput)
      if (!claim.clinicianHistoryReport) {
        await service.persistClinicianHistoryReport(claim, report)
      }

      let finalDifferential: unknown
      if (!diagnosticSufficiencyAllowsDdx(derived.sufficiency)) {
        finalDifferential = buildWithheldFinalDifferential(derived.sufficiency)
        const existingDigest = claim.finalDifferential && typeof claim.finalDifferential === 'object'
          ? (claim.finalDifferential as Record<string, unknown>).input_digest
          : null
        if (existingDigest !== derived.sufficiency.input_digest) {
          await service.persistFinalDifferential(claim, finalDifferential, {
            inputDigest: derived.sufficiency.input_digest,
            withheld: true,
          })
        }
      } else {
        const diagnosticInput = buildDiagnosticInputProjection(
          claim.transcript,
          derived.medication,
        )
        const existingDigest = claim.finalDifferential && typeof claim.finalDifferential === 'object'
          ? (claim.finalDifferential as Record<string, unknown>).input_digest
          : null
        if (existingDigest === derived.sufficiency.input_digest) {
          finalDifferential = claim.finalDifferential
        } else {
          finalDifferential = await generateFinalDifferential(
            diagnosticInput.transcript,
            claim.chiefComplaint,
            diagnosticInput.trustedMedicationContext,
          )
          await service.persistFinalDifferential(claim, finalDifferential, {
            inputDigest: derived.sufficiency.input_digest,
          })
        }
      }

      // These are physician/QI supplements, not the required product output.
      // Await them so Lambda never abandons work after returning, while their
      // established wrappers remain fail-open and cannot erase the required
      // final differential already persisted above.
      if (
        diagnosticSufficiencyAllowsDdx(derived.sufficiency) &&
        process.env.HISTORIAN_EVAL_QA_AUTORUN !== 'false'
      ) {
        const diagnosticInput = buildDiagnosticInputProjection(
          claim.transcript,
          derived.medication,
        )
        await runThoroughnessJudge(claim.sessionId, claim.transcript, {
          chiefComplaint: claim.chiefComplaint,
          structuredOutput: claim.structuredOutput,
          narrativeSummary: claim.narrativeSummary,
          reports: { clinician_history_report: JSON.stringify(report) },
        }, derived.sufficiency.input_digest)
        await runIndependentDdxAndAgreement(
          claim.sessionId,
          diagnosticInput.transcript,
          claim.chiefComplaint,
          derived.sufficiency.input_digest,
          diagnosticInput.trustedMedicationContext,
        )
      }

      await service.complete(claim)
    } catch (error) {
      try {
        await service.fail(claim, safeHistorianEvalErrorCode(error))
      } catch {
        batchItemFailures.push({ itemIdentifier: record.messageId })
      }
    }
  }

  return { batchItemFailures }
}

export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  return processHistorianEvalEvent(event, new HistorianEvalJobService(await getPool()))
}
