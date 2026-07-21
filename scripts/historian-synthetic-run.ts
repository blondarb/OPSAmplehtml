/**
 * AI Historian synthetic conversation driver (Historian Validation Suite
 * Task 6, P6 — the final build task of the sprint).
 *
 * A synthetic patient (Bedrock Sonnet, persona-conditioned via
 * src/lib/historian/synthetic/patientAgent.ts) converses with the REAL
 * historian agent (OpenAI Realtime, text modality, via
 * src/lib/historian/synthetic/realtimeTextClient.ts) through the REAL app
 * endpoints — /api/ai/historian/session (textMode), /transcript-flush,
 * /scales (scale_step), /evidence-query (query_evidence), and /save — so
 * every driver session exercises flush -> save -> the post-save evaluator
 * pipeline (Tasks 2-4) exactly like a real production interview. This
 * makes the whole validation pipeline repeatable unattended.
 *
 * The historian's instructions/tools are sourced from the EXACT SAME
 * functions session/route.ts's OpenAI branch calls
 * (buildHistorianSystemPrompt / getHistorianToolDefinition, both already
 * exported from src/lib/historianPrompts.ts — no extraction was needed,
 * they were already a shared module) — byte-identical agent brain to
 * production.
 *
 * SYNTHETIC-DATA MARKER (binding — read before changing the /save payload
 * below): every driver session's `referral_reason` is prefixed with
 * "[SYNTHETIC-DRIVER] ", and the model's own `structured_output.chief_complaint`
 * (when save_interview_output fires) is ALSO prefixed the same way before
 * the /save POST — so any UI list rendering either field is unmistakably
 * marked as synthetic. patient_name is set exactly as the persona JSON has
 * it (unprefixed, per the task brief). Driver rows land as real rows in
 * the POC RDS via /save — accepted (synthetic personas, POC DB), but this
 * marker is how they stay identifiable in any physician-facing UI.
 *
 * GLOBAL CONSTRAINT (binding): OpenAI direct = no BAA, synthetic personas
 * only. Refuses to run unless --base-url is localhost/127.0.0.1 (or
 * --i-know-this-is-not-localhost is explicitly passed) — see cliArgs.ts's
 * assertBaseUrlAllowed().
 *
 * LOG HYGIENE (binding): never logs patient/historian utterance TEXT
 * unless --verbose is passed (local debugging only, stdout only). Default
 * logging is structural only — turn counts, session ids, tool names,
 * statuses.
 *
 * query_evidence NOTE: that route requires physician (Cognito) auth, which
 * this unauthenticated script deliberately does not have (working around
 * that boundary would be inappropriate, and is unnecessary — the historian
 * prompt already treats query_evidence as an optional lookup and handles a
 * failure response gracefully). The route's 401 body
 * ({status:'error', message:'unauthorized'}) is forwarded to the model
 * exactly like any other query_evidence failure, mirroring
 * useRealtimeSession.ts's own "parse JSON regardless of HTTP status"
 * client behavior.
 *
 * transcript-flush NOTE: migrations are not applied to the dev-pointed DB
 * in this environment, so /transcript-flush returns a non-200 (42P01
 * pass-through). That is EXPECTED and fail-open — this driver tolerates a
 * non-200 flush response exactly like the real client
 * (useRealtimeSession.ts's flushTranscript) does: leave the batch pending
 * and retry on the next trigger. /save still works — historian_sessions is
 * a pre-existing prod table.
 *
 * WS loop testing: the WS event-protocol correctness (session.update
 * shape, response.create shape, response.done parsing, function-call
 * surfacing) is integration-tested against a local mock WS server in
 * tests/historian-eval/realtimeTextClient.test.ts. This script's own
 * orchestration (persona loading -> greeting -> turn loop -> tool dispatch
 * -> save) is validated live against a real dev server (the Task 6 live
 * gate), per the brief's explicit scoping — not unit-mocked.
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import crypto from 'node:crypto'

import {
  parseSyntheticDriverArgs,
  assertBaseUrlAllowed,
  HELP_TEXT,
} from '../src/lib/historian/synthetic/cliArgs'
import {
  RealtimeTextClient,
  RealtimeSchemaError,
  DEFAULT_SESSION_TIMEOUT_MS,
  type RealtimeTurnResult,
} from '../src/lib/historian/synthetic/realtimeTextClient'
import { generatePatientReply, loadPersonaProfile, type PersonaProfile } from '../src/lib/historian/synthetic/patientAgent'
import { buildHistorianSystemPrompt, getHistorianToolDefinition } from '../src/lib/historianPrompts'
import { getOpenAIKey } from '../src/lib/secrets'
import { validateTranscript } from '../src/lib/historian/transcriptIntegrity'
import { listPersonaFiles } from '../src/lib/historian/eval/personaFixtures'
import type { HistorianTranscriptEntry } from '../src/lib/historianTypes'

/** Both roles counted, matches useRealtimeSession.ts's FLUSH_THRESHOLD. */
const FLUSH_THRESHOLD = 3
/** Matches session/route.ts's own OpenAI-branch default (kept in sync by comment, not by import — that route has no exported constant for this). */
const DEFAULT_REALTIME_MODEL = 'gpt-realtime-2'
/**
 * After this many CONSECUTIVE bad historian turns (status !== 'completed',
 * or a completed response with neither assistant text nor a function
 * call), abort the persona session as FAILED rather than let the driver
 * run on patient monologue to the turn cap. See the module doc's
 * SILENT-EMPTY note and HistorianTurnFailureError below.
 */
const MAX_CONSECUTIVE_BAD_TURNS = 2

/**
 * Thrown by processTurn() when MAX_CONSECUTIVE_BAD_TURNS is reached.
 * Propagates through runPersonaSession's try/catch exactly like any other
 * session failure — client.close() runs, then the error re-throws into
 * runPersonaWithRetry's one-time whole-session retry. A distinct class
 * (rather than a plain Error) so a future caller could special-case this
 * failure mode in logs/reporting if useful; not currently required to.
 */
class HistorianTurnFailureError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HistorianTurnFailureError'
  }
}

interface DriverState {
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

function newState(): DriverState {
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

function appendTranscriptEntry(state: DriverState, role: 'assistant' | 'user', text: string): void {
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

/**
 * Mirrors useRealtimeSession.ts's flushTranscript() exactly: best-effort,
 * fail-open. A non-200 (expected here — migrations not applied to the
 * dev-pointed DB) leaves the batch pending for the next trigger; a network
 * error does the same. Never throws.
 */
async function maybeFlush(
  state: DriverState,
  baseUrl: string,
  sessionId: string,
  flushToken: string | undefined,
  opts: { force?: boolean } = {},
): Promise<void> {
  if (!flushToken) return
  if (state.pendingFlush.length === 0) return
  if (!opts.force && state.pendingFlush.length < FLUSH_THRESHOLD) return

  const batch = state.pendingFlush.slice(0, 50)
  try {
    const res = await fetch(`${baseUrl}/api/ai/historian/transcript-flush`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${flushToken}` },
      body: JSON.stringify({
        sessionId,
        entries: batch.map((e) => ({ seq: e.seq, role: e.role, text: e.text, tsOffsetS: e.timestamp })),
      }),
    })
    if (res.ok) {
      const sentSeqs = new Set(batch.map((e) => e.seq))
      state.pendingFlush = state.pendingFlush.filter((e) => !sentSeqs.has(e.seq))
    }
    // non-200: fail-open, expected (see module doc's transcript-flush NOTE).
  } catch {
    // network error — fail-open, retried on the next trigger.
  }
}

async function mintTextModeSession(
  baseUrl: string,
  referralReason: string,
): Promise<{ sessionId: string; flushToken: string | undefined }> {
  const res = await fetch(`${baseUrl}/api/ai/historian/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionType: 'new_patient', referralReason, textMode: true }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`session mint (textMode) failed: HTTP ${res.status} ${body.slice(0, 200)}`)
  }
  const json = await res.json()
  if (typeof json.sessionId !== 'string' || !json.sessionId) {
    throw new Error('session mint (textMode) returned no sessionId')
  }
  return { sessionId: json.sessionId, flushToken: typeof json.flushToken === 'string' ? json.flushToken : undefined }
}

interface TurnContext {
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
 * SILENT-EMPTY GUARD (read before touching): the text-message parsing in
 * realtimeTextClient.ts is unverified against a real live response (see
 * that file's module doc) — if the shape assumption there is wrong, every
 * turn would silently resolve to empty assistantText with no function
 * call, the loop below would run on nothing but patient monologue to the
 * turn cap, validateTranscript would still pass (it checks structural
 * well-formedness, not role diversity or content), /save would still
 * succeed, and the summary would misreport PASS. This function is the
 * single choke point every RealtimeTurnResult passes through (greeting,
 * post-user-text turns, and every tool-call follow-up via the recursion
 * below), so the check lives here: any response.done that either (a)
 * didn't report status:'completed', or (b) completed with neither
 * assistant text nor a function call, is ALWAYS logged (never
 * --verbose-gated — there is no utterance text in these two log lines, so
 * there is nothing to leak) and counted against MAX_CONSECUTIVE_BAD_TURNS.
 * Two in a row aborts the whole persona session as a hard failure — silent
 * empty must become loud fail, never a false PASS.
 */
async function processTurn(client: RealtimeTextClient, turn: RealtimeTurnResult, ctx: TurnContext): Promise<void> {
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
      continue
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
      continue
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
        // handles gracefully. See this script's module doc.
        result = await res.json().catch(() => ({ status: 'error', chunks: [], message: 'invalid JSON from /evidence-query' }))
      } catch (err) {
        result = { status: 'error', chunks: [], message: err instanceof Error ? err.message : String(err) }
      }
      client.submitFunctionCallOutput(call.callId, result)
      continue
    }

    // Unknown tool name — should never happen given the fixed 3-tool
    // surface, but fail open rather than crash the whole persona run.
    client.submitFunctionCallOutput(call.callId, { status: 'error', message: `unknown tool: ${call.name}` })
  }

  if (turn.functionCalls.length > 0) {
    const next = await client.awaitNextResponse()
    await processTurn(client, next, ctx)
  }
}

export interface PersonaSessionSummary {
  personaId: string
  sessionId: string | null
  turns: number
  durationMs: number
  saveStatus: 'saved' | 'save_failed' | 'not_reached'
  transcriptValid: boolean
  transcriptIssues: string[]
  /** process.env.HISTORIAN_EVAL_AUTORUN !== 'false' AND save succeeded — the exact condition the save route itself checks before firing the (fire-and-forget) eval chain. Not a confirmation the evaluators actually completed — see the report for the honest caveat on this field. */
  evalAutorunExpected: boolean
  completionStatus: 'complete' | 'ended_early'
  error: string | null
}

interface RunOptions {
  baseUrl: string
  maxTurns: number
  verbose: boolean
  log: (line: string) => void
}

async function runPersonaSession(personaFile: string, opts: RunOptions): Promise<PersonaSessionSummary> {
  const profile: PersonaProfile = loadPersonaProfile(personaFile)
  const consultId = crypto.randomUUID()
  const state = newState()

  const referralReason = `[SYNTHETIC-DRIVER] ${profile.chiefComplaint || profile.id}`

  const { sessionId, flushToken } = await mintTextModeSession(opts.baseUrl, referralReason)
  opts.log(`[${profile.id}] session minted: ${sessionId}`)

  // Byte-identical agent brain to session/route.ts's OpenAI branch — same
  // functions, same sessionType ('new_patient' for every sprint persona),
  // no per-consult context (these are fresh new-patient presentations).
  const instructions = buildHistorianSystemPrompt('new_patient', referralReason)
  const tools = getHistorianToolDefinition()

  const apiKey = await getOpenAIKey()
  if (!apiKey) throw new Error('OpenAI API key not configured (getOpenAIKey() returned empty)')
  const model = process.env.OPENAI_HISTORIAN_REALTIME_MODEL || DEFAULT_REALTIME_MODEL

  const client = new RealtimeTextClient({
    url: `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`,
    // NOTE (live-verified 2026-07-21): NOT `OpenAI-Beta: realtime=v1`. That
    // header — specified in the original task brief — is now REJECTED by
    // the API: {"type":"invalid_request_error","code":"beta_api_shape_disabled",
    // "message":"The Realtime Beta API is no longer supported. Please use
    // /v1/realtime for the GA API."}. The URL below already targets
    // /v1/realtime (the GA API); sending the beta header on top of that GA
    // URL is what triggered the rejection. Confirmed via an isolated probe:
    // removing ONLY this header (same URL, same session.update body)
    // changed the failure from beta_api_shape_disabled to a completely
    // different, later-stage error (insufficient_quota on the OpenAI
    // account) — i.e. the connection/session.update schema itself is
    // correct and accepted once this stale header is dropped. See the
    // Task 6 report for the full finding.
    headers: { Authorization: `Bearer ${apiKey}` },
    instructions,
    tools,
    sessionTimeoutMs: DEFAULT_SESSION_TIMEOUT_MS,
    onWireEvent: opts.verbose ? (direction, msg) => opts.log(`    [wire ${direction}] ${String(msg.type)}`) : undefined,
  })

  const ctx: TurnContext = {
    baseUrl: opts.baseUrl,
    consultId,
    personaId: profile.id,
    state,
    verbose: opts.verbose,
    log: opts.log,
  }

  try {
    await client.connect()
    opts.log(`[${profile.id}] connected (model=${model})`)

    const greeting = await client.requestGreeting()
    await processTurn(client, greeting, ctx)
    await maybeFlush(state, opts.baseUrl, sessionId, flushToken)

    const wallClockDeadline = state.startTime + DEFAULT_SESSION_TIMEOUT_MS
    while (!state.done && state.patientTurnCount < opts.maxTurns && Date.now() < wallClockDeadline) {
      const patientReply = await generatePatientReply({
        profile,
        conversation: state.transcript.map((t) => ({ role: t.role, text: t.text })),
      })
      appendTranscriptEntry(state, 'user', patientReply)
      state.patientTurnCount += 1
      if (opts.verbose) opts.log(`  [Patient] ${patientReply}`)
      else opts.log(`[${profile.id}] turn ${state.patientTurnCount}/${opts.maxTurns}`)
      await maybeFlush(state, opts.baseUrl, sessionId, flushToken)

      const next = await client.sendUserText(patientReply)
      await processTurn(client, next, ctx)
      await maybeFlush(state, opts.baseUrl, sessionId, flushToken)
    }

    if (!state.done) {
      // Turn cap or wall clock reached without save_interview_output —
      // force-end, mirroring useRealtimeSession.ts's endSession() nudge +
      // last-resort raw-transcript fallback.
      opts.log(`[${profile.id}] turn/wall-clock limit reached without save_interview_output — nudging to save`)
      try {
        const nudge = await client.sendUserText(
          '[The interview must end now.] Immediately call the save_interview_output tool with whatever ' +
            'information has been gathered so far. Populate narrative_summary with a concise summary of the ' +
            'conversation. Do not ask any more questions.',
        )
        await processTurn(client, nudge, ctx)
      } catch (err) {
        opts.log(
          `[${profile.id}] nudge-to-save failed (non-fatal, falling back to raw transcript): ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
      }
      if (!state.narrativeSummary && state.transcript.length > 0) {
        state.narrativeSummary =
          'Interview ended before AI generated a structured summary. Raw transcript:\n\n' +
          state.transcript.map((t) => `${t.role === 'assistant' ? 'AI' : 'Patient'}: ${t.text}`).join('\n\n')
      }
    }

    await maybeFlush(state, opts.baseUrl, sessionId, flushToken, { force: true })

    const completionStatus: 'complete' | 'ended_early' = state.done ? 'complete' : 'ended_early'
    const localValidation = validateTranscript(state.transcript)

    const chiefComplaintRaw =
      typeof state.structuredOutput?.chief_complaint === 'string' ? state.structuredOutput.chief_complaint : ''
    const structuredOutputForSave = state.structuredOutput
      ? { ...state.structuredOutput, chief_complaint: `[SYNTHETIC-DRIVER] ${chiefComplaintRaw}`.trim() }
      : null

    const savePayload = {
      tenant_id: 'default',
      patient_id: null,
      session_type: 'new_patient',
      patient_name: profile.demographics.name ?? profile.id,
      referral_reason: referralReason,
      structured_output: structuredOutputForSave,
      narrative_summary: state.narrativeSummary,
      transcript: state.transcript,
      red_flags: state.redFlags,
      safety_escalated: state.safetyEscalated,
      duration_seconds: Math.floor((Date.now() - state.startTime) / 1000),
      question_count: state.transcript.filter((t) => t.role === 'assistant').length,
      status: 'completed',
      consult_id: null,
      sessionId,
      interview_completion_status: completionStatus,
    }

    const saveRes = await fetch(`${opts.baseUrl}/api/ai/historian/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(savePayload),
    })
    const saveOk = saveRes.ok
    opts.log(`[${profile.id}] save: HTTP ${saveRes.status}${saveOk ? '' : ' (FAILED)'}`)

    client.close()

    return {
      personaId: profile.id,
      sessionId,
      turns: state.patientTurnCount,
      durationMs: Date.now() - state.startTime,
      saveStatus: saveOk ? 'saved' : 'save_failed',
      transcriptValid: localValidation.valid,
      transcriptIssues: localValidation.issues,
      evalAutorunExpected: saveOk && process.env.HISTORIAN_EVAL_AUTORUN !== 'false',
      completionStatus,
      error: saveOk ? null : `save returned HTTP ${saveRes.status}`,
    }
  } catch (err) {
    client.close()
    if (err instanceof RealtimeSchemaError) {
      opts.log(`[${profile.id}] REALTIME SCHEMA ERROR — payload: ${JSON.stringify(err.payload)}`)
    }
    throw err
  }
}

async function runPersonaWithRetry(personaFile: string, opts: RunOptions): Promise<PersonaSessionSummary> {
  try {
    return await runPersonaSession(personaFile, opts)
  } catch (firstErr) {
    const message = firstErr instanceof Error ? firstErr.message : String(firstErr)
    opts.log(`[${personaFile}] session failed (${message}) — retrying once`)
    try {
      return await runPersonaSession(personaFile, opts)
    } catch (secondErr) {
      const secondMessage = secondErr instanceof Error ? secondErr.message : String(secondErr)
      opts.log(`[${personaFile}] session failed again after 1 retry: ${secondMessage}`)
      return {
        personaId: personaFile.replace(/\.json$/, ''),
        sessionId: null,
        turns: 0,
        durationMs: 0,
        saveStatus: 'not_reached',
        transcriptValid: false,
        transcriptIssues: [],
        evalAutorunExpected: false,
        completionStatus: 'ended_early',
        error: `failed after 1 retry: ${secondMessage}`,
      }
    }
  }
}

function summaryOk(s: PersonaSessionSummary): boolean {
  return s.error === null && s.saveStatus === 'saved' && s.transcriptValid
}

function formatSummaryLine(s: PersonaSessionSummary): string {
  const status = summaryOk(s) ? 'PASS' : 'FAIL'
  return (
    `[${status}] ${s.personaId} — session=${s.sessionId ?? 'n/a'} turns=${s.turns} ` +
    `duration=${Math.round(s.durationMs / 1000)}s save=${s.saveStatus} ` +
    `transcriptValid=${s.transcriptValid} completion=${s.completionStatus} ` +
    `evalAutorunExpected=${s.evalAutorunExpected ? 'y' : 'n'}` +
    (s.error ? ` error=${s.error}` : '')
  )
}

async function main(): Promise<number> {
  let options
  try {
    options = parseSyntheticDriverArgs(process.argv.slice(2))
  } catch (err) {
    process.stderr.write(`${HELP_TEXT}\n\nError: ${err instanceof Error ? err.message : String(err)}\n`)
    return 1
  }

  if (options.help) {
    process.stdout.write(`${HELP_TEXT}\n`)
    return 0
  }

  try {
    assertBaseUrlAllowed(options.baseUrl, options.iKnowThisIsNotLocalhost)
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
    return 1
  }

  const personaFiles = options.allPersonas ? listPersonaFiles() : [options.persona as string]
  const log = (line: string) => process.stdout.write(`${line}\n`)

  const runOpts: RunOptions = { baseUrl: options.baseUrl, maxTurns: options.maxTurns, verbose: options.verbose, log }

  const summaries: PersonaSessionSummary[] = []
  for (const personaFile of personaFiles) {
    log(`\n=== ${personaFile} ===`)
    const summary = await runPersonaWithRetry(personaFile, runOpts)
    summaries.push(summary)
    log(formatSummaryLine(summary))
  }

  const passCount = summaries.filter(summaryOk).length
  log(`\n${passCount}/${summaries.length} sessions complete.`)

  return passCount === summaries.length ? 0 : 1
}

main()
  .then((exitCode) => {
    process.exitCode = exitCode
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`Synthetic driver execution failed: ${message}\n`)
    process.exitCode = 1
  })
