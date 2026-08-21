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

function configuredLeaseSeconds(): number {
  const parsed = Number(process.env.HISTORIAN_EVAL_LEASE_SECONDS || 360)
  return Number.isSafeInteger(parsed) && parsed >= 60 && parsed <= 900 ? parsed : 360
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
      const finalDifferential = await generateFinalDifferential(
        claim.transcript,
        claim.chiefComplaint,
      )
      await service.persistFinalDifferential(claim, finalDifferential)

      // These are physician/QI supplements, not the required product output.
      // Await them so Lambda never abandons work after returning, while their
      // established wrappers remain fail-open and cannot erase the required
      // final differential already persisted above.
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
