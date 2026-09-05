import type { SQSEvent, SQSBatchResponse } from 'aws-lambda'
import type { HistorianStructuredOutput, HistorianTranscriptEntry } from '@/lib/historianTypes'
import {
  classifyFinalDifferentialError, createFinalDifferentialError,
  type FinalDifferentialRecord, type FinalDifferentialError, type FinalDifferentialExecution,
} from '@/lib/historian/eval/finalDifferential'
import type { ThoroughnessJudgeOptions } from '@/lib/historian/eval/thoroughnessJudge'

export interface HistorianEvalSession {
  id: string
  transcript: HistorianTranscriptEntry[]
  referral_reason?: string | null
  structured_output?: HistorianStructuredOutput | null
  narrative_summary?: string | null
  final_differential?: FinalDifferentialRecord | null
}
export interface HistorianEvalWorkerDependencies {
  loadSession: (id: string) => Promise<HistorianEvalSession | null>
  runFinalDifferential: (id: string, transcript: HistorianTranscriptEntry[], complaint?: string, opts?: { signal?: AbortSignal }) => Promise<FinalDifferentialExecution | void>
  runThoroughnessJudge: (id: string, transcript: HistorianTranscriptEntry[], opts: ThoroughnessJudgeOptions) => Promise<unknown>
  runIndependentDdxAndAgreement: (id: string, transcript: HistorianTranscriptEntry[], complaint?: string, opts?: { signal?: AbortSignal }) => Promise<unknown>
  persistError: (id: string, error: FinalDifferentialError) => Promise<unknown>
  log: (event: string, errorClass?: string) => void
}

/** Also bound injectable/non-cooperative operations, including database waits. */
async function bounded<T>(ms: number, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const signal = AbortSignal.timeout(ms)
  signal.throwIfAborted()
  let listener: () => void = () => {}
  const timeout = new Promise<never>((_, reject) => {
    listener = () => reject(signal.reason)
    signal.addEventListener('abort', listener, { once: true })
  })
  try { return await Promise.race([operation(signal), timeout]) }
  finally { signal.removeEventListener('abort', listener) }
}

export async function processHistorianEvalSqsEvent(event: SQSEvent, deps: HistorianEvalWorkerDependencies): Promise<SQSBatchResponse> {
  const batchItemFailures: SQSBatchResponse['batchItemFailures'] = []
  // BatchSize is one in SAM; a defensive invocation deadline also bounds malformed larger batches.
  const deadline = Date.now() + 830_000
  for (const record of event.Records) {
    let sessionId: string | undefined
    let retry = false
    const remaining = () => Math.max(1, deadline - Date.now())
    const persist = async (error: FinalDifferentialError) => {
      try { await bounded(Math.min(10_000, remaining()), () => deps.persistError(sessionId!, error)) }
      catch (persistError) {
        const classified = classifyFinalDifferentialError(persistError)
        retry ||= classified.transient || classified.errorClass === 'timeout'
        deps.log('historian_eval_error_persistence_failed', classified.errorClass)
      }
    }
    const load = async () => {
      try { return await bounded(Math.min(10_000, remaining()), () => deps.loadSession(sessionId!)) }
      catch (error) {
        // A stalled DB acquisition/query is a transient connection failure.
        if (classifyFinalDifferentialError(error).errorClass === 'timeout') throw { code: 'ETIMEDOUT' }
        throw error
      }
    }
    try {
      const message = JSON.parse(record.body)
      if (typeof message?.sessionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(message.sessionId) ||
          typeof message.enqueuedAt !== 'string' || !Number.isFinite(Date.parse(message.enqueuedAt)) ||
          Object.keys(message).some((key) => key !== 'sessionId' && key !== 'enqueuedAt')) {
        deps.log('historian_eval_invalid_message')
        continue
      }
      sessionId = message.sessionId
      const session = await load()
      if (!session) { deps.log('historian_eval_session_missing'); continue }
      const transcript = Array.isArray(session.transcript) ? session.transcript : []
      const complaint = session.structured_output?.chief_complaint || session.referral_reason || undefined
      if (session.final_differential?.status !== 'ok') {
        try {
          const outcome = await bounded(Math.min(300_000, remaining()), (signal) =>
            deps.runFinalDifferential(sessionId!, transcript, complaint, { signal }))
          if (outcome?.error) throw outcome.error
          const updated = await load()
          if (updated?.final_differential?.status !== 'ok') {
            const current = updated?.final_differential ?? outcome?.record
            const error = current?.status === 'error' ? current : createFinalDifferentialError(
              current?.status === 'insufficient_transcript' ? { name: 'InsufficientTranscriptError' } : undefined)
            await persist(error)
            deps.log('historian_eval_differential_failed', error.error_class)
          }
        } catch (error) {
          const classified = classifyFinalDifferentialError(error)
          retry ||= classified.transient
          await persist(createFinalDifferentialError(error))
          deps.log('historian_eval_differential_failed', classified.errorClass)
        }
      }
      // Separate budgets/catches: failure of one evaluator never suppresses the next.
      const summary = typeof session.narrative_summary === 'string' && session.narrative_summary.trim() ? session.narrative_summary : undefined
      for (const [name, operation] of [
        ['thoroughness', (signal: AbortSignal) => deps.runThoroughnessJudge(sessionId!, transcript, {
          signal, chiefComplaint: complaint, structuredOutput: session.structured_output || null,
          narrativeSummary: summary, reports: summary ? { narrative_summary: summary } : undefined,
        })],
        ['independent_agreement', (signal: AbortSignal) => deps.runIndependentDdxAndAgreement(sessionId!, transcript, complaint, { signal })],
      ] as const) {
        try { await bounded(Math.min(240_000, remaining()), operation) }
        catch (error) { deps.log(`historian_eval_${name}_failed`, classifyFinalDifferentialError(error).errorClass) }
      }
    } catch (error) {
      const classified = classifyFinalDifferentialError(error)
      retry ||= classified.transient
      deps.log('historian_eval_record_failed', classified.errorClass)
      if (sessionId) {
        try { await persist(createFinalDifferentialError(error)) }
        catch (persistError) { retry ||= classifyFinalDifferentialError(persistError).transient }
      }
    }
    if (retry) batchItemFailures.push({ itemIdentifier: record.messageId })
  }
  return { batchItemFailures }
}
