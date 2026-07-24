/**
 * Historian-turn processing for the synthetic conversation driver
 * (Historian Validation Suite Task 6, P6). Extracted out of
 * scripts/historian-synthetic-run.ts (minimal refactor — no behavior
 * change) specifically so the warn/count/throw logic and the nudge-to-save
 * error-handling split have dedicated unit test coverage, per the 2026-07-21
 * review round: "the WS loop itself is integration-tested live" applies to
 * the WS wire protocol (realtimeTextClient.ts) and the end-to-end
 * orchestration (runPersonaSession, still in the script) — it does NOT mean
 * this module's own pure decision logic (when to warn, when to reset the
 * counter, when to hard-fail) should go untested.
 *
 * SILENT-EMPTY GUARD (read before touching): the text-message parsing in
 * realtimeTextClient.ts is unverified against a real live response (see
 * that file's module doc) — if the shape assumption there is wrong, every
 * turn would silently resolve to empty assistantText with no function
 * call, a naive loop would run on nothing but patient monologue to the
 * turn cap, validateTranscript would still pass (it checks structural
 * well-formedness, not role diversity or content), /save would still
 * succeed, and the summary would misreport PASS. processTurn() is the
 * single choke point every RealtimeTurnResult passes through (greeting,
 * post-user-text turns, the forced nudge turn, and every tool-call
 * follow-up via its own recursion), so the check lives here: any
 * response.done that either (a) didn't report status:'completed', or (b)
 * completed with neither assistant text nor a function call, is ALWAYS
 * logged (never --verbose-gated — there is no utterance text in these two
 * log lines, so there is nothing to leak) and counted against
 * MAX_CONSECUTIVE_BAD_TURNS. Two in a row aborts the whole persona session
 * as a hard failure — silent empty must become loud fail, never a false
 * PASS.
 */
import type { RealtimeFunctionCall, RealtimeTurnResult } from './realtimeTextClient'
import type { HistorianTranscriptEntry } from '@/lib/historianTypes'

/**
 * After this many CONSECUTIVE bad historian turns (status !== 'completed',
 * or a completed response with neither assistant text nor a function
 * call), abort the persona session as FAILED rather than let the driver
 * run on patient monologue to the turn cap.
 */
export const MAX_CONSECUTIVE_BAD_TURNS = 2

/**
 * Thrown by processTurn() when MAX_CONSECUTIVE_BAD_TURNS is reached.
 * Propagates through runPersonaSession's try/catch exactly like any other
 * session failure — client.close() runs, then the error re-throws into
 * runPersonaWithRetry's one-time whole-session retry. MUST also propagate
 * out of the nudge-to-save fallback's catch (attemptNudgeToSave below) —
 * that catch exists for genuine transport/network hiccups, not for this
 * hard-fail signal. A distinct class (rather than a plain Error) so both
 * call sites can distinguish "the model failed to produce anything useful"
 * from "the network blipped."
 */
export class HistorianTurnFailureError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HistorianTurnFailureError'
  }
}

/**
 * The narrow slice of RealtimeTextClient that processTurn actually needs.
 * Lets tests inject a fake without a real WS connection — a real
 * RealtimeTextClient instance satisfies this structurally, so the live
 * call site in the script needs no change.
 */
export interface RealtimeTurnClient {
  submitFunctionCallOutput(callId: string, output: unknown): void
  awaitNextResponse(): Promise<RealtimeTurnResult>
}

export interface DriverState {
  transcript: HistorianTranscriptEntry[]
  pendingFlush: HistorianTranscriptEntry[]
  seqCounter: number
  startTime: number
  structuredOutput: Record<string, unknown> | null
  narrativeSummary: string | null
  redFlags: unknown[]
  safetyEscalated: boolean
  patientTurnCount: number
  done: boolean
  /** Consecutive bad (non-'completed' status, or completed-but-empty) historian turns. Reset to 0 on any good turn. See MAX_CONSECUTIVE_BAD_TURNS. */
  consecutiveBadTurns: number
}

export function newState(): DriverState {
  return {
    transcript: [],
    pendingFlush: [],
    seqCounter: 0,
    startTime: Date.now(),
    structuredOutput: null,
    narrativeSummary: null,
    redFlags: [],
    safetyEscalated: false,
    patientTurnCount: 0,
    done: false,
    consecutiveBadTurns: 0,
  }
}

export function appendTranscriptEntry(state: DriverState, role: 'assistant' | 'user', text: string): void {
  const trimmed = text.trim()
  if (!trimmed) return
  const entry: HistorianTranscriptEntry = {
    role,
    text: trimmed,
    timestamp: Math.floor((Date.now() - state.startTime) / 1000),
    seq: ++state.seqCounter,
  }
  state.transcript.push(entry)
  state.pendingFlush.push(entry)
}

export interface TurnContext {
  baseUrl: string
  consultId: string
  personaId: string
  state: DriverState
  verbose: boolean
  log: (line: string) => void
}

/**
 * Appends any assistant text from `turn` to the transcript, dispatches
 * every function call it contains (scale_step -> /scales, query_evidence
 * -> /evidence-query, save_interview_output -> captures structured output
 * + marks done), then — if there were any function calls — awaits and
 * recursively processes the follow-up response (the model's next reply
 * after seeing the tool result: e.g. scale_step's recited item text, or
 * save_interview_output's closing line).
 *
 * See the module doc's SILENT-EMPTY GUARD for the warn/count/throw logic
 * at the top of this function.
 */
export async function processTurn(
  client: RealtimeTurnClient,
  turn: RealtimeTurnResult,
  ctx: TurnContext,
): Promise<void> {
  const responseRef = turn.id ?? '(no id)'
  const statusBad = turn.status !== 'completed'
  const isEmpty = !turn.assistantText && turn.functionCalls.length === 0

  if (statusBad) {
    ctx.log(
      `[${ctx.personaId}] WARNING: response ${responseRef} did not complete (status=${turn.status ?? 'unknown'})`,
    )
  }
  if (isEmpty) {
    ctx.log(`[${ctx.personaId}] WARNING: response ${responseRef} resolved with neither assistant text nor a function call`)
  }

  if (statusBad || isEmpty) {
    ctx.state.consecutiveBadTurns += 1
    if (ctx.state.consecutiveBadTurns >= MAX_CONSECUTIVE_BAD_TURNS) {
      throw new HistorianTurnFailureError(
        `${ctx.state.consecutiveBadTurns} consecutive empty/failed historian turns ` +
          `(last: response ${responseRef}, status=${turn.status ?? 'unknown'})`,
      )
    }
  } else {
    ctx.state.consecutiveBadTurns = 0
  }

  if (turn.assistantText) {
    appendTranscriptEntry(ctx.state, 'assistant', turn.assistantText)
    if (ctx.verbose) ctx.log(`  [Henry] ${turn.assistantText}`)
  }

  for (const call of turn.functionCalls) {
    await dispatchFunctionCall(client, call, ctx)
  }

  if (turn.functionCalls.length > 0) {
    const next = await client.awaitNextResponse()
    await processTurn(client, next, ctx)
  }
}

async function dispatchFunctionCall(
  client: RealtimeTurnClient,
  call: RealtimeFunctionCall,
  ctx: TurnContext,
): Promise<void> {
  ctx.log(`  (tool call: ${call.name})`)

  if (call.name === 'save_interview_output') {
    const args = call.arguments as Record<string, unknown>
    const { narrative_summary, red_flags, safety_escalated, ...structured } = args
    ctx.state.structuredOutput = structured
    ctx.state.narrativeSummary = typeof narrative_summary === 'string' ? narrative_summary : null
    if (Array.isArray(red_flags)) ctx.state.redFlags = red_flags
    if (safety_escalated) ctx.state.safetyEscalated = true
    ctx.state.done = true
    client.submitFunctionCallOutput(call.callId, { success: true })
    return
  }

  if (call.name === 'scale_step') {
    const args = call.arguments as Record<string, unknown>
    let result: unknown
    try {
      const res = await fetch(`${ctx.baseUrl}/api/ai/historian/scales?action=step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scale_id: args.scale_id,
          reason: args.reason,
          prev_index: args.prev_index,
          prev_response: args.prev_response,
          consult_id: ctx.consultId,
        }),
      })
      result = await res.json().catch(() => ({ status: 'error', message: 'invalid JSON from /scales' }))
    } catch (err) {
      result = { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
    client.submitFunctionCallOutput(call.callId, result)
    return
  }

  if (call.name === 'query_evidence') {
    const args = call.arguments as Record<string, unknown>
    let result: unknown
    try {
      const res = await fetch(`${ctx.baseUrl}/api/ai/historian/evidence-query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: args.question, focus_diagnoses: args.focus_diagnoses }),
      })
      // Mirrors useRealtimeSession.ts's query_evidence handler exactly:
      // parse JSON regardless of HTTP status. This route requires
      // physician auth this script doesn't have — its 401 body is itself
      // a valid QueryEvidenceResponse the historian prompt already
      // handles gracefully. See historian-synthetic-run.ts's module doc.
      result = await res.json().catch(() => ({ status: 'error', chunks: [], message: 'invalid JSON from /evidence-query' }))
    } catch (err) {
      result = { status: 'error', chunks: [], message: err instanceof Error ? err.message : String(err) }
    }
    client.submitFunctionCallOutput(call.callId, result)
    return
  }

  // Unknown tool name — should never happen given the fixed 3-tool
  // surface, but fail open rather than crash the whole persona run.
  client.submitFunctionCallOutput(call.callId, { status: 'error', message: `unknown tool: ${call.name}` })
}

/**
 * Wraps the "nudge the model to save now" attempt (used when the turn/
 * wall-clock cap is hit without save_interview_output having fired) with
 * the correct error-handling split: a HistorianTurnFailureError from
 * processTurn — the model failed to produce anything useful even on this
 * FORCED FINAL turn — is a genuine hard-fail and MUST propagate. Letting
 * it fall through as "non-fatal" would let the caller proceed straight to
 * /save and report PASS despite the silent-empty guard having just fired
 * (the exact bug this function exists to close). Any OTHER error (network
 * hiccup, WS timeout, transport drop) is swallowed and logged — the raw-
 * transcript fallback the caller applies afterward still gives the
 * physician something to review.
 */
export async function attemptNudgeToSave(
  nudge: () => Promise<void>,
  log: (line: string) => void,
  personaId: string,
): Promise<void> {
  try {
    await nudge()
  } catch (err) {
    if (err instanceof HistorianTurnFailureError) throw err
    log(
      `[${personaId}] nudge-to-save failed (non-fatal, falling back to raw transcript): ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
  }
}
