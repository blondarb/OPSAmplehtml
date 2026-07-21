/**
 * CLI orchestration for the AI Historian batch eval harness (Historian
 * Validation Suite Task 5) — argument parsing, output-path resolution, and
 * the --fixtures/--sessions mode split. Runtime-injected (fs/env/stdout/
 * case-runner) for testability, mirroring src/lib/triage/sentinel/cli.ts's
 * SentinelCliRuntime pattern (see that file's module doc — this is the same
 * repo-established eval-harness architecture, adapted to this domain).
 *
 * scripts/historian-eval.ts is the thin wrapper that supplies the REAL
 * runtime (node:fs, process.env, process.stdout) and
 * DEFAULT_HISTORIAN_EVAL_CASE_RUNNER (this file's real, Bedrock/DB-touching
 * implementation, exported at the bottom).
 *
 * LIVE GATING (binding, mirrors assertLiveAllowed() elsewhere in this repo):
 * `runtime.runCase` — the only thing in this module that can reach Bedrock
 * or the DB — is invoked ONLY when `--live` is passed. Without --live,
 * BOTH modes produce a structure-only "dry run" report (see report.ts's
 * buildHistorianEvalReport — a dry run renders every gate as NOT EVALUATED
 * and every evaluator as skipped, never a fabricated score). This makes
 * `npm run historian:eval` safe to run in CI / pre-rollout with zero
 * Bedrock/DB calls and zero cost.
 *
 * MODULE-LOAD DISCIPLINE: this file does NOT statically import
 * finalDifferential.ts / thoroughnessJudge.ts / independentDdx.ts /
 * agreement.ts / persistEvaluation.ts / @/lib/db — all of that is behind
 * dynamic `await import(...)` inside DEFAULT_HISTORIAN_EVAL_CASE_RUNNER's
 * call graph, exactly mirroring liveRunner.ts's loadDefaultLiveDependencies
 * in the triage sentinel. This keeps a plain dry run (and this module's own
 * unit tests) from ever touching AWS SDK client construction or DB pool
 * setup. personaFixtures.ts IS imported statically — it is a lightweight,
 * side-effect-free local-fixture reader (fs/path only), safe to load
 * unconditionally and needed even for an informative dry-run listing.
 *
 * FIDELITY EXTENSION POINT (Task 5 brief item 6): in --fixtures mode, the
 * only "report" ever passed to the thoroughness judge's fidelity screen is
 * the persona fixture's own pre-authored `narrativeSummary` field (see
 * personaFixtures.ts's doc comment) — a stand-in for what a live
 * interview's save_interview_output narrative_summary would be, NOT the
 * real thing. `structuredOutput` is deliberately left null for every
 * fixture case (personas have no HistorianStructuredOutput — their
 * `structuredHistory` field is a similarly-named but distinct shape missing
 * the required `hpi` field), so the deterministic structured-output check
 * will honestly report "structured_output is missing" for every fixture
 * case rather than a synthesized false positive. Full patient/
 * physician-report fidelity checking against the REAL app routes (the
 * actual save-time narrative_summary, the patient-report tab, a printed
 * chart note) is out of scope for this harness — it needs a running app
 * plus real interview data, not a fixture/CLI concern. --sessions mode is
 * the natural extension point: it already reads the real
 * historian_sessions.narrative_summary column.
 *
 * DEGENERATE-TRANSCRIPT HANDLING (post-sprint hardening, 2026-07-21): a real
 * --sessions --live run against ops_amplehtml surfaced two problems this
 * harness now guards against. (1) historian_sessions.transcript is usually
 * a JSONB array but at least one row stores it as a JSON-encoded STRING —
 * runSessionCase's parseSessionTranscript recovers it via JSON.parse rather
 * than silently coercing it to [] on a bare Array.isArray check. (2) a
 * transcript with fewer than MIN_PATIENT_TURNS non-empty patient turns
 * (an abandoned interview, or a greeting-only stub) broke the pipeline DDx
 * with an unparseable-JSON error and made thoroughness/R1/agreement produce
 * meaningless scores that dragged the batch report's aggregates down —
 * runHydratedCase now short-circuits ALL FOUR evaluators up front for such
 * a case (see insufficientRunResult / HistorianEvalCaseOutcome.insufficientTranscript)
 * and report.ts excludes these cases from every gate/aggregate computation.
 */

import {
  buildHistorianEvalReport,
  formatHistorianEvalMarkdown,
  parseHistorianEvalReleaseGates,
  type HistorianEvalCaseOutcome,
  type HistorianEvalGroundTruth,
  type HistorianEvalReport,
  type HistorianEvalRunResult,
} from './report'
import { buildPersonaTranscript, listPersonaFiles, type PersonaExpectedDx } from './personaFixtures'
import type { HistorianStructuredOutput, HistorianTranscriptEntry } from '@/lib/historianTypes'
import type { FinalDifferential } from './finalDifferential'
import type { ThoroughnessEvaluation } from './thoroughnessJudge'
import type { IndependentDifferential } from './independentDdx'
import type { AgreementResult } from './agreement'

// ── Public types ─────────────────────────────────────────────────────────────

export type HistorianEvalCaseRef =
  | { kind: 'fixture'; personaFile: string }
  | { kind: 'session'; sessionId: string }

export interface HistorianEvalRunOptions {
  /** Always true — runCase is only ever invoked when --live was passed. */
  live: true
  /** true only in --sessions mode — persists results via persistEvaluation()/a direct final_differential column UPDATE, tolerating 42P01/42703 quiet-skip (repo convention). Always false in --fixtures mode. */
  persist: boolean
}

export interface HistorianEvalCliRuntime {
  readText: (path: string) => string
  pathExists: (path: string) => boolean
  ensureDirectory: (path: string) => void
  writeText: (path: string, value: string) => void
  stdout: (value: string) => void
  stderr: (value: string) => void
  setEnvironment: (key: string, value: string) => void
  now: () => string
  runCase: (ref: HistorianEvalCaseRef, options: HistorianEvalRunOptions) => Promise<HistorianEvalCaseOutcome>
}

export interface HistorianEvalCliOptions {
  mode: 'fixtures' | 'sessions'
  live: boolean
  sessionIds: string[]
  since: string | null
  out: string | null
  gatesPath: string
  help: boolean
}

export interface HistorianEvalCliResult {
  exitCode: 0 | 1
  report: HistorianEvalReport | null
}

// ── Help text ────────────────────────────────────────────────────────────────

const HELP_TEXT = `AI Historian batch eval harness (synthetic software evaluation only)

Fixtures (default; 5 development-set personas, no DB — safe pre-rollout and in CI):
  npm run historian:eval -- --fixtures [--live]

Sessions (real historian_sessions DB rows; requires --live to touch the DB):
  npm run historian:eval -- --sessions SESSION_ID [SESSION_ID ...] --live
  npm run historian:eval -- --sessions --since 2026-07-01T00:00:00Z --live

Options:
  --live              Required for any Bedrock/DB evaluator call. Without it,
                       both modes produce a structure-only dry run listing
                       what WOULD run — no cost, no PHI, gates NOT evaluated.
  --out DIRECTORY     Output directory. Default: qa/historian-eval/results/
                       <yyyy-mm-dd>[-vN]/ (auto-incremented on collision).
  --gates FILE.json   Release-gate definitions. Default:
                       qa/historian-eval/release-gates.json
  --help, -h          Show this help.

This is a synthetic-software-release artifact, not a clinical validation
study. A failing gate is reported as data — this harness never tunes
anything to force a pass.`

// ── Argument parsing ─────────────────────────────────────────────────────────

function requiredValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1]
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value.`)
  }
  return value
}

export function parseHistorianEvalCliArgs(args: string[]): HistorianEvalCliOptions {
  let mode: 'fixtures' | 'sessions' = 'fixtures'
  let sessionsFlagSeen = false
  let live = false
  const sessionIds: string[] = []
  let since: string | null = null
  let out: string | null = null
  let gatesPath = 'qa/historian-eval/release-gates.json'
  let help = false

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]
    if (flag === '--fixtures') {
      mode = 'fixtures'
    } else if (flag === '--sessions') {
      mode = 'sessions'
      sessionsFlagSeen = true
      while (index + 1 < args.length && !args[index + 1].startsWith('--')) {
        sessionIds.push(args[index + 1])
        index += 1
      }
    } else if (flag === '--since') {
      since = requiredValue(args, index, flag)
      index += 1
    } else if (flag === '--live') {
      live = true
    } else if (flag === '--out') {
      out = requiredValue(args, index, flag)
      index += 1
    } else if (flag === '--gates') {
      gatesPath = requiredValue(args, index, flag)
      index += 1
    } else if (flag === '--help' || flag === '-h') {
      help = true
    } else {
      throw new Error(`Unknown historian-eval option: ${flag}`)
    }
  }

  if (help) {
    return { mode, live, sessionIds, since, out, gatesPath, help }
  }

  if (since !== null && !sessionsFlagSeen) {
    throw new Error('--since requires --sessions.')
  }
  if (mode === 'sessions' && sessionIds.length === 0 && since === null) {
    throw new Error('--sessions requires at least one session id or --since <ISO date>.')
  }
  if (mode === 'fixtures' && (sessionIds.length > 0 || since !== null)) {
    throw new Error('--sessions-only options (session ids / --since) require --sessions.')
  }
  if (new Set(sessionIds).size !== sessionIds.length) {
    throw new Error('--sessions ids must not be duplicated.')
  }
  if (since !== null && Number.isNaN(Date.parse(since))) {
    throw new Error('--since must be a valid ISO date string.')
  }

  return { mode, live, sessionIds, since, out, gatesPath, help }
}

// ── Output-path resolution (default path + vN collision bump) ────────────────

function defaultOutputBase(nowIso: string): string {
  const date = nowIso.slice(0, 10)
  return `qa/historian-eval/results/${date}`
}

/**
 * If `basePath` already has a report in it, bump to `${basePath}-v2`,
 * `-v3`, ... until an unused path is found. Only applied to the
 * INTERNALLY COMPUTED default path — an explicit --out value is always
 * used as-is (the user's explicit choice, no magic).
 */
export function resolveOutputDirectory(basePath: string, pathExists: (path: string) => boolean): string {
  const reportMarker = (dir: string) => `${dir}/historian-eval-report.json`
  if (!pathExists(reportMarker(basePath))) return basePath
  let version = 2
  while (pathExists(reportMarker(`${basePath}-v${version}`))) {
    version += 1
  }
  return `${basePath}-v${version}`
}

function resolveOutputPath(options: HistorianEvalCliOptions, runtime: HistorianEvalCliRuntime): string {
  if (options.out) return options.out
  return resolveOutputDirectory(defaultOutputBase(runtime.now()), runtime.pathExists)
}

// ── Dry-run case placeholders ─────────────────────────────────────────────────

function notRunResult<T>(): HistorianEvalRunResult<T> {
  return {
    ok: false,
    result: null,
    error: null,
    skippedReason: 'dry run — pass --live to execute',
    latencyMs: 0,
    costUsd: null,
    modelId: null,
    promptVersion: null,
    rubricVersion: null,
    inferenceParams: null,
  }
}

function dryRunOutcome(input: {
  caseId: string
  source: 'fixture' | 'session'
  chiefComplaint: string | null
  syndrome: string | null
  turnCount: number
}): HistorianEvalCaseOutcome {
  return {
    caseId: input.caseId,
    source: input.source,
    chiefComplaint: input.chiefComplaint,
    syndrome: input.syndrome,
    turnCount: input.turnCount,
    // A dry run never evaluates the transcript, so it never determines
    // insufficiency either — that's a --live-only decision made against
    // real transcript content (see runHydratedCase).
    insufficientTranscript: false,
    finalDifferential: notRunResult<FinalDifferential>(),
    thoroughness: notRunResult<ThoroughnessEvaluation>(),
    independentDdx: notRunResult<IndependentDifferential>(),
    agreement: notRunResult<AgreementResult>(),
    groundTruth: null,
  }
}

// ── Top-level orchestration ───────────────────────────────────────────────────

export async function runHistorianEvalCli(
  args: string[],
  runtime: HistorianEvalCliRuntime,
): Promise<HistorianEvalCliResult> {
  let options: HistorianEvalCliOptions
  try {
    options = parseHistorianEvalCliArgs(args)
  } catch (err) {
    runtime.stderr(HELP_TEXT)
    runtime.stderr(`\nError: ${err instanceof Error ? err.message : String(err)}`)
    return { exitCode: 1, report: null }
  }

  if (options.help) {
    runtime.stdout(HELP_TEXT)
    return { exitCode: 0, report: null }
  }

  runtime.stderr('SYNTHETIC SOFTWARE EVALUATION ONLY — NOT CLINICALLY VALIDATED.')

  let gateSet
  try {
    gateSet = parseHistorianEvalReleaseGates(JSON.parse(runtime.readText(options.gatesPath)))
  } catch (err) {
    runtime.stderr(`Error loading release gates from ${options.gatesPath}: ${err instanceof Error ? err.message : String(err)}`)
    return { exitCode: 1, report: null }
  }

  const cases: HistorianEvalCaseOutcome[] = []

  if (options.mode === 'fixtures') {
    const personaFiles = listPersonaFiles()
    if (!options.live) {
      for (const file of personaFiles) {
        const fixture = buildPersonaTranscript(file)
        cases.push(
          dryRunOutcome({
            caseId: file,
            source: 'fixture',
            chiefComplaint: fixture.chiefComplaint || null,
            syndrome: file.replace(/\.json$/, ''),
            turnCount: fixture.transcript.length,
          }),
        )
      }
    } else {
      runtime.stderr(
        `LIVE BEDROCK OPT-IN: running ${personaFiles.length} fixture persona(s) through all 4 evaluators.`,
      )
      for (const file of personaFiles) {
        cases.push(await runtime.runCase({ kind: 'fixture', personaFile: file }, { live: true, persist: false }))
      }
    }
  } else {
    if (!options.live) {
      for (const id of options.sessionIds) {
        cases.push(dryRunOutcome({ caseId: id, source: 'session', chiefComplaint: null, syndrome: null, turnCount: 0 }))
      }
      // --since without explicit ids can't be resolved without a live DB
      // query — dry run reports zero planned cases in that shape rather
      // than guessing.
    } else {
      let ids = options.sessionIds
      if (ids.length === 0 && options.since) {
        ids = await resolveSessionIdsSince(options.since, runtime)
      }
      runtime.stderr(
        `LIVE DB+BEDROCK OPT-IN: running ${ids.length} session(s) through all 4 evaluators (results will be persisted).`,
      )
      for (const id of ids) {
        cases.push(await runtime.runCase({ kind: 'session', sessionId: id }, { live: true, persist: true }))
      }
    }
  }

  const report = buildHistorianEvalReport({
    mode: options.mode,
    live: options.live,
    cases,
    gateSet,
    generatedAt: runtime.now(),
  })

  const outDir = resolveOutputPath(options, runtime)
  const json = `${JSON.stringify(report, null, 2)}\n`
  const markdown = formatHistorianEvalMarkdown(report)
  runtime.ensureDirectory(outDir)
  runtime.writeText(`${outDir}/historian-eval-report.json`, json)
  runtime.writeText(`${outDir}/historian-eval-report.md`, markdown)
  runtime.stdout(`Report written to ${outDir}/\n`)
  runtime.stdout(markdown)

  const exitCode = options.live && report.releaseGatePassed === false ? 1 : 0
  return { exitCode, report }
}

async function resolveSessionIdsSince(sinceIso: string, runtime: HistorianEvalCliRuntime): Promise<string[]> {
  try {
    const { getPool } = await import('@/lib/db')
    const pool = await getPool()
    const { rows } = await pool.query(
      'SELECT id FROM historian_sessions WHERE created_at >= $1 ORDER BY created_at DESC',
      [sinceIso],
    )
    return (rows as { id: string }[]).map((row) => row.id)
  } catch (err) {
    runtime.stderr(
      `[historian-eval] failed to resolve sessions since ${sinceIso} (non-fatal — treated as zero sessions): ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
    return []
  }
}

// ── Default (real) case runner — the only code path that touches Bedrock/DB ──

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function highLikelihoodOrAll(expectedDDx: PersonaExpectedDx[]): string[] {
  const high = expectedDDx.filter((d) => d.likelihood === 'high')
  return (high.length > 0 ? high : expectedDDx).map((d) => d.diagnosis)
}

/** Evaluator-agnostic "we deliberately never attempted this" wrapper — used for all four evaluators when runHydratedCase's insufficient-transcript short-circuit fires. Mirrors notRunResult/failedRunResult's shape exactly; skippedReason is what distinguishes it from a dry run's own 'dry run — pass --live to execute' and from agreement's structural-dependency skip. */
function insufficientRunResult<T>(reason: string): HistorianEvalRunResult<T> {
  return {
    ok: false,
    result: null,
    error: null,
    skippedReason: reason,
    latencyMs: 0,
    costUsd: null,
    modelId: null,
    promptVersion: null,
    rubricVersion: null,
    inferenceParams: null,
  }
}

interface HydratedCaseInput {
  caseId: string
  source: 'fixture' | 'session'
  transcript: HistorianTranscriptEntry[]
  chiefComplaint: string | null
  narrativeSummary: string | null
  syndrome: string | null
  structuredOutput: HistorianStructuredOutput | null
  expectedDDx: PersonaExpectedDx[]
}

async function loadHydratedCaseDeps() {
  const [finalDifferentialMod, thoroughnessMod, independentDdxMod, agreementMod, constantsMod] = await Promise.all([
    import('./finalDifferential'),
    import('./thoroughnessJudge'),
    import('./independentDdx'),
    import('./agreement'),
    import('./constants'),
  ])
  return { finalDifferentialMod, thoroughnessMod, independentDdxMod, agreementMod, constantsMod }
}

async function persistSessionResults(
  sessionId: string,
  runs: {
    finalDifferential: HistorianEvalRunResult<FinalDifferential>
    thoroughness: HistorianEvalRunResult<ThoroughnessEvaluation>
    thoroughnessUsage: { inputTokens?: number; outputTokens?: number }
    independentDdx: HistorianEvalRunResult<IndependentDifferential>
    agreement: HistorianEvalRunResult<AgreementResult>
  },
): Promise<void> {
  const { persistEvaluation } = await import('./persistEvaluation')

  if (runs.finalDifferential.ok && runs.finalDifferential.result) {
    try {
      const { getPool } = await import('@/lib/db')
      const pool = await getPool()
      await pool.query('UPDATE historian_sessions SET final_differential = $1 WHERE id = $2', [
        JSON.stringify(runs.finalDifferential.result),
        sessionId,
      ])
    } catch (err: unknown) {
      const pgCode = (err as { code?: string } | undefined)?.code
      if (pgCode === '42703' || pgCode === '42P01') {
        console.info(
          '[historian-eval] historian_sessions.final_differential not present yet (migration 057 not applied) — skipping persist for session',
          sessionId,
        )
      } else {
        console.error('[historian-eval] failed to persist final_differential (non-fatal) for session', sessionId, err)
      }
    }
  }

  if (runs.thoroughness.ok && runs.thoroughness.result && runs.thoroughness.modelId && runs.thoroughness.promptVersion) {
    await persistEvaluation({
      sessionId,
      evaluator: 'thoroughness',
      modelId: runs.thoroughness.modelId,
      promptVersion: runs.thoroughness.promptVersion,
      rubricVersion: runs.thoroughness.rubricVersion,
      inferenceParams: runs.thoroughness.inferenceParams ?? {},
      result: runs.thoroughness.result,
      usage: runs.thoroughnessUsage,
      latencyMs: runs.thoroughness.latencyMs,
    })
  }

  if (runs.independentDdx.ok && runs.independentDdx.result && runs.independentDdx.modelId && runs.independentDdx.promptVersion) {
    await persistEvaluation({
      sessionId,
      evaluator: 'independent_ddx',
      modelId: runs.independentDdx.modelId,
      promptVersion: runs.independentDdx.promptVersion,
      inferenceParams: runs.independentDdx.inferenceParams ?? {},
      result: runs.independentDdx.result,
      // No token-usage data is available from Bedrock for DeepSeek-R1 (see
      // independentDdx.ts's module doc) — matches the production
      // runIndependentDdxAndAgreement's own convention.
      usage: {},
      latencyMs: runs.independentDdx.latencyMs,
    })
  }

  if (runs.agreement.ok && runs.agreement.result && runs.agreement.modelId && runs.agreement.promptVersion) {
    await persistEvaluation({
      sessionId,
      evaluator: 'agreement',
      modelId: runs.agreement.modelId,
      promptVersion: runs.agreement.promptVersion,
      inferenceParams: runs.agreement.inferenceParams ?? {},
      result: runs.agreement.result,
      usage: {},
      latencyMs: runs.agreement.latencyMs,
    })
  }
}

async function runHydratedCase(
  input: HydratedCaseInput,
  options: HistorianEvalRunOptions,
): Promise<HistorianEvalCaseOutcome> {
  const deps = await loadHydratedCaseDeps()

  // Degenerate-transcript short-circuit — fix for real historian_sessions
  // rows (abandoned interviews, greeting-only stubs) that broke the
  // pipeline DDx with "Invalid JSON in AI response" and, separately, made
  // thoroughness/R1/agreement produce garbage scores that dragged the
  // batch report's thoroughness floor down. Checked ONCE here, before any
  // of the four evaluators, using the SAME MIN_PATIENT_TURNS rule
  // generateFinalDifferential enforces internally (countPatientTurns is
  // reused, not re-implemented, so the two guards can never drift) — but
  // applied a level higher, so a degenerate case spends zero Bedrock calls
  // across ALL four evaluators, not just the one finalDifferential.ts
  // already guards on its own.
  const patientTurnCount = deps.finalDifferentialMod.countPatientTurns(input.transcript)
  if (patientTurnCount < deps.finalDifferentialMod.MIN_PATIENT_TURNS) {
    const skipReason = `insufficient transcript — ${patientTurnCount} patient turn(s), below MIN_PATIENT_TURNS (${deps.finalDifferentialMod.MIN_PATIENT_TURNS})`
    return {
      caseId: input.caseId,
      source: input.source,
      chiefComplaint: input.chiefComplaint,
      syndrome: input.syndrome,
      turnCount: input.transcript.length,
      insufficientTranscript: true,
      patientTurnCount,
      finalDifferential: insufficientRunResult(skipReason),
      thoroughness: insufficientRunResult(skipReason),
      independentDdx: insufficientRunResult(skipReason),
      agreement: insufficientRunResult(skipReason),
      groundTruth: null,
    }
  }

  // 1. Pipeline (Sonnet) final differential.
  const fdStart = Date.now()
  let finalDifferentialRun: HistorianEvalRunResult<FinalDifferential>
  try {
    const result = await deps.finalDifferentialMod.generateFinalDifferential(
      input.transcript,
      input.chiefComplaint ?? undefined,
    )
    finalDifferentialRun = {
      ok: true,
      result,
      error: null,
      skippedReason: null,
      latencyMs: Date.now() - fdStart,
      costUsd: null, // generateFinalDifferential exposes no token usage publicly.
      modelId: result.provenance.model_id,
      promptVersion: result.provenance.prompt_version,
      rubricVersion: null,
      inferenceParams: result.provenance.inference_params,
    }
  } catch (err) {
    finalDifferentialRun = {
      ok: false,
      result: null,
      error: errorMessage(err),
      skippedReason: null,
      latencyMs: Date.now() - fdStart,
      costUsd: null,
      modelId: null,
      promptVersion: null,
      rubricVersion: null,
      inferenceParams: null,
    }
  }

  // 2. Thoroughness judge (with usage, for real cost_usd).
  const thStart = Date.now()
  let thoroughnessRun: HistorianEvalRunResult<ThoroughnessEvaluation>
  let thoroughnessUsage: { inputTokens?: number; outputTokens?: number } = {}
  try {
    const reports = input.narrativeSummary ? { narrative_summary: input.narrativeSummary } : undefined
    const { evaluation, usage } = await deps.thoroughnessMod.generateThoroughnessEvaluationWithUsage(input.transcript, {
      chiefComplaint: input.chiefComplaint ?? undefined,
      syndrome: input.syndrome ?? undefined,
      structuredOutput: input.structuredOutput,
      narrativeSummary: input.narrativeSummary,
      reports,
    })
    thoroughnessUsage = usage
    thoroughnessRun = {
      ok: true,
      result: evaluation,
      error: null,
      skippedReason: null,
      latencyMs: Date.now() - thStart,
      costUsd: deps.constantsMod.computeCostUsd(evaluation.provenance.model_id, usage),
      modelId: evaluation.provenance.model_id,
      promptVersion: evaluation.provenance.prompt_version,
      rubricVersion: evaluation.provenance.rubric_version,
      inferenceParams: evaluation.provenance.inference_params,
    }
  } catch (err) {
    thoroughnessRun = {
      ok: false,
      result: null,
      error: errorMessage(err),
      skippedReason: null,
      latencyMs: Date.now() - thStart,
      costUsd: null,
      modelId: null,
      promptVersion: null,
      rubricVersion: null,
      inferenceParams: null,
    }
  }

  // 3. Independent (DeepSeek-R1) differential — BLIND, transcript + chief complaint only.
  const idStart = Date.now()
  let independentRun: HistorianEvalRunResult<IndependentDifferential>
  try {
    const result = await deps.independentDdxMod.generateIndependentDdx(input.transcript, input.chiefComplaint ?? undefined)
    independentRun = {
      ok: true,
      result,
      error: null,
      skippedReason: null,
      latencyMs: Date.now() - idStart,
      costUsd: null, // R1 exposes no token usage on Bedrock.
      modelId: result.provenance.model_id,
      promptVersion: result.provenance.prompt_version,
      rubricVersion: null,
      inferenceParams: result.provenance.inference_params,
    }
  } catch (err) {
    independentRun = {
      ok: false,
      result: null,
      error: errorMessage(err),
      skippedReason: null,
      latencyMs: Date.now() - idStart,
      costUsd: null,
      modelId: null,
      promptVersion: null,
      rubricVersion: null,
      inferenceParams: null,
    }
  }

  // 4. Cross-model agreement — only when both differentials above succeeded.
  let agreementRun: HistorianEvalRunResult<AgreementResult>
  if (finalDifferentialRun.ok && finalDifferentialRun.result && independentRun.ok && independentRun.result) {
    const agStart = Date.now()
    try {
      const result = await deps.agreementMod.computeAgreement(
        finalDifferentialRun.result.differential,
        independentRun.result.differential,
        deps.independentDdxMod.adjudicateEquivalence,
      )
      agreementRun = {
        ok: true,
        result,
        error: null,
        skippedReason: null,
        latencyMs: Date.now() - agStart,
        costUsd: null, // agreement.ts exposes no token usage (batched Haiku adjudication cost is not tracked anywhere in this codebase today).
        modelId: deps.independentDdxMod.HAIKU_MODEL_ID,
        promptVersion: deps.constantsMod.PROMPT_VERSIONS['agreement-icd10-adjudicated-v1'].id,
        rubricVersion: null,
        inferenceParams: { adjudicator_model: deps.independentDdxMod.HAIKU_MODEL_ID },
      }
    } catch (err) {
      agreementRun = {
        ok: false,
        result: null,
        error: errorMessage(err),
        skippedReason: null,
        latencyMs: Date.now() - agStart,
        costUsd: null,
        modelId: null,
        promptVersion: null,
        rubricVersion: null,
        inferenceParams: null,
      }
    }
  } else {
    agreementRun = {
      ok: false,
      result: null,
      error: null,
      skippedReason: 'requires both the pipeline final differential and the independent R1 differential to succeed',
      latencyMs: 0,
      costUsd: null,
      modelId: null,
      promptVersion: null,
      rubricVersion: null,
      inferenceParams: null,
    }
  }

  // 5. Ground-truth scoring — only when the case has expected diagnoses to score against.
  let groundTruth: HistorianEvalGroundTruth | null = null
  if (input.expectedDDx.length > 0 && (finalDifferentialRun.result || independentRun.result)) {
    const expectedCandidates = highLikelihoodOrAll(input.expectedDDx)
    const pipeline = finalDifferentialRun.result
      ? await deps.agreementMod.scoreAgainstGroundTruth(
          finalDifferentialRun.result.differential,
          expectedCandidates,
          deps.independentDdxMod.adjudicateEquivalence,
        )
      : null
    const independent = independentRun.result
      ? await deps.agreementMod.scoreAgainstGroundTruth(
          independentRun.result.differential,
          expectedCandidates,
          deps.independentDdxMod.adjudicateEquivalence,
        )
      : null
    groundTruth = { expectedCandidates, pipeline, independent }
  }

  if (options.persist) {
    await persistSessionResults(input.caseId, {
      finalDifferential: finalDifferentialRun,
      thoroughness: thoroughnessRun,
      thoroughnessUsage,
      independentDdx: independentRun,
      agreement: agreementRun,
    })
  }

  return {
    caseId: input.caseId,
    source: input.source,
    chiefComplaint: input.chiefComplaint,
    syndrome: input.syndrome,
    turnCount: input.transcript.length,
    insufficientTranscript: false,
    finalDifferential: finalDifferentialRun,
    thoroughness: thoroughnessRun,
    independentDdx: independentRun,
    agreement: agreementRun,
    groundTruth,
  }
}

async function runFixtureCase(personaFile: string, options: HistorianEvalRunOptions): Promise<HistorianEvalCaseOutcome> {
  const fixture = buildPersonaTranscript(personaFile)
  return runHydratedCase(
    {
      caseId: personaFile,
      source: 'fixture',
      transcript: fixture.transcript,
      chiefComplaint: fixture.chiefComplaint || null,
      narrativeSummary: fixture.narrativeSummary ?? null,
      syndrome: personaFile.replace(/\.json$/, ''),
      // Personas have no HistorianStructuredOutput (their structuredHistory
      // field is a similarly-shaped but distinct object missing the
      // required `hpi` field) — see this file's module doc.
      structuredOutput: null,
      expectedDDx: fixture.expectedDDx,
    },
    options,
  )
}

function failedRunResult<T>(error: string): HistorianEvalRunResult<T> {
  return {
    ok: false,
    result: null,
    error,
    skippedReason: null,
    latencyMs: 0,
    costUsd: null,
    modelId: null,
    promptVersion: null,
    rubricVersion: null,
    inferenceParams: null,
  }
}

/**
 * Recover historian_sessions.transcript into a HistorianTranscriptEntry[].
 * Almost every row stores this as a JSONB array (the pg driver hands it
 * back as a real JS array already), but at least one real production row
 * (~1/113 sampled) stores it as a JSON-ENCODED STRING instead — a plain
 * `Array.isArray(row.transcript) ? ... : []` check silently coerced that
 * row to [], discarding its real transcript content. This recovers it: a
 * string value is JSON.parse'd and used if (and only if) it parses to an
 * array; an array value is used as-is; anything else — including a parse
 * failure — degrades to [] rather than throwing (an empty transcript then
 * fails generateFinalDifferential's/the harness's own MIN_PATIENT_TURNS
 * guard downstream, exactly like a genuinely empty session). Never logs
 * transcript content (may contain PHI).
 */
export function parseSessionTranscript(raw: unknown): HistorianTranscriptEntry[] {
  if (Array.isArray(raw)) return raw as HistorianTranscriptEntry[]
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed as HistorianTranscriptEntry[]
    } catch {
      // Malformed JSON string — degrade to [], never throw, never log content.
    }
  }
  return []
}

async function runSessionCase(sessionId: string, options: HistorianEvalRunOptions): Promise<HistorianEvalCaseOutcome> {
  let row:
    | { transcript: unknown; structured_output: unknown; narrative_summary: unknown }
    | undefined
  let fetchError: string | null = null
  try {
    const { getPool } = await import('@/lib/db')
    const pool = await getPool()
    const { rows } = await pool.query(
      'SELECT transcript, structured_output, narrative_summary FROM historian_sessions WHERE id = $1',
      [sessionId],
    )
    row = rows[0]
    if (!row) fetchError = `Session ${sessionId} not found.`
  } catch (err) {
    fetchError = errorMessage(err)
  }

  if (fetchError || !row) {
    const failed = failedRunResult<never>(fetchError ?? 'unknown session fetch error')
    return {
      caseId: sessionId,
      source: 'session',
      chiefComplaint: null,
      syndrome: null,
      turnCount: 0,
      // A hard fetch failure is distinct from an insufficient transcript —
      // we never even saw the transcript to judge it.
      insufficientTranscript: false,
      finalDifferential: failed,
      thoroughness: failed,
      independentDdx: failed,
      agreement: failed,
      groundTruth: null,
    }
  }

  const transcript = parseSessionTranscript(row.transcript)
  const structuredOutput = (row.structured_output ?? null) as HistorianStructuredOutput | null
  const narrativeSummary = typeof row.narrative_summary === 'string' ? row.narrative_summary : null

  return runHydratedCase(
    {
      caseId: sessionId,
      source: 'session',
      transcript,
      chiefComplaint: structuredOutput?.chief_complaint ?? null,
      narrativeSummary,
      // No explicit syndrome override for real sessions — loadRubric()
      // falls back to chiefComplaint-based detectSyndrome().
      syndrome: null,
      structuredOutput,
      // No ground-truth diagnosis list exists for a real session.
      expectedDDx: [],
    },
    options,
  )
}

/**
 * The real case runner — wired into scripts/historian-eval.ts's runtime as
 * `runCase`. Never called by cli.ts's own unit tests (which inject a fake).
 */
export const DEFAULT_HISTORIAN_EVAL_CASE_RUNNER: HistorianEvalCliRuntime['runCase'] = async (ref, options) => {
  if (ref.kind === 'fixture') return runFixtureCase(ref.personaFile, options)
  return runSessionCase(ref.sessionId, options)
}
