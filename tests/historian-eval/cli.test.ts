/**
 * Runtime-injection tests for the batch eval harness CLI (Historian
 * Validation Suite Task 5). Mirrors tests/triage/sentinelCli.test.ts's
 * style — a fake HistorianEvalCliRuntime captures stdout/stderr/writes and
 * a mocked `runCase` stands in for any real Bedrock/DB call, so these tests
 * never touch a live model or database.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import {
  runHistorianEvalCli,
  parseHistorianEvalCliArgs,
  resolveOutputDirectory,
  parseSessionTranscript,
  type HistorianEvalCliRuntime,
} from '@/lib/historian/eval/cli'
import type { HistorianEvalCaseOutcome, HistorianEvalRunResult } from '@/lib/historian/eval/report'
import { listPersonaFiles } from '@/lib/historian/eval/personaFixtures'

const gatesText = readFileSync(resolve(process.cwd(), 'qa/historian-eval/release-gates.json'), 'utf8')

function notRun<T>(): HistorianEvalRunResult<T> {
  return {
    ok: false,
    result: null,
    error: null,
    skippedReason: 'test stub',
    latencyMs: 0,
    costUsd: null,
    modelId: null,
    promptVersion: null,
    rubricVersion: null,
    inferenceParams: null,
  }
}

function fakeOutcome(caseId: string, source: 'fixture' | 'session', overrides: Partial<HistorianEvalCaseOutcome> = {}): HistorianEvalCaseOutcome {
  return {
    caseId,
    source,
    chiefComplaint: null,
    syndrome: null,
    turnCount: 0,
    insufficientTranscript: false,
    finalDifferential: notRun(),
    thoroughness: notRun(),
    independentDdx: notRun(),
    agreement: notRun(),
    groundTruth: null,
    ...overrides,
  }
}

function runtime(): HistorianEvalCliRuntime & {
  stdoutLines: string[]
  stderrLines: string[]
  files: Map<string, string>
  existing: Set<string>
} {
  const stdoutLines: string[] = []
  const stderrLines: string[] = []
  const files = new Map<string, string>()
  const existing = new Set<string>()
  return {
    stdoutLines,
    stderrLines,
    files,
    existing,
    readText: vi.fn((path: string) => {
      if (path.endsWith('release-gates.json')) return gatesText
      throw new Error(`Unexpected read ${path}`)
    }),
    pathExists: vi.fn((path: string) => existing.has(path)),
    ensureDirectory: vi.fn(),
    writeText: vi.fn((path: string, value: string) => files.set(path, value)),
    stdout: vi.fn((value: string) => stdoutLines.push(value)),
    stderr: vi.fn((value: string) => stderrLines.push(value)),
    setEnvironment: vi.fn(),
    now: () => '2026-07-21T12:00:00.000Z',
    runCase: vi.fn(async (ref) => fakeOutcome(ref.kind === 'fixture' ? ref.personaFile : ref.sessionId, ref.kind)),
  }
}

describe('parseHistorianEvalCliArgs', () => {
  it('defaults to fixtures mode, not live', () => {
    const options = parseHistorianEvalCliArgs([])
    expect(options.mode).toBe('fixtures')
    expect(options.live).toBe(false)
  })

  it('throws on an unknown flag', () => {
    expect(() => parseHistorianEvalCliArgs(['--bogus'])).toThrow(/unknown historian-eval option/i)
  })

  it('collects bare tokens after --sessions as session ids', () => {
    const options = parseHistorianEvalCliArgs(['--sessions', 'id1', 'id2', '--live'])
    expect(options.mode).toBe('sessions')
    expect(options.sessionIds).toEqual(['id1', 'id2'])
    expect(options.live).toBe(true)
  })

  it('throws when --sessions has neither ids nor --since', () => {
    expect(() => parseHistorianEvalCliArgs(['--sessions'])).toThrow(/requires at least one session id or --since/i)
  })

  it('accepts --sessions --since <ISO>', () => {
    const options = parseHistorianEvalCliArgs(['--sessions', '--since', '2026-07-01T00:00:00Z'])
    expect(options.mode).toBe('sessions')
    expect(options.since).toBe('2026-07-01T00:00:00Z')
  })

  it('throws when --since is used without --sessions', () => {
    expect(() => parseHistorianEvalCliArgs(['--since', '2026-07-01T00:00:00Z'])).toThrow(/--since requires --sessions/i)
  })

  it('throws on an invalid --since date', () => {
    expect(() => parseHistorianEvalCliArgs(['--sessions', '--since', 'not-a-date'])).toThrow(/valid ISO date/i)
  })

  it('throws on duplicate session ids', () => {
    expect(() => parseHistorianEvalCliArgs(['--sessions', 'id1', 'id1'])).toThrow(/must not be duplicated/i)
  })

  it('throws when session ids are given while mode is fixtures', () => {
    expect(() => parseHistorianEvalCliArgs(['--sessions', 'id1', '--fixtures'])).toThrow(/require --sessions/i)
  })
})

describe('resolveOutputDirectory', () => {
  it('returns the base path when no report exists there yet', () => {
    expect(resolveOutputDirectory('qa/historian-eval/results/2026-07-21', () => false)).toBe(
      'qa/historian-eval/results/2026-07-21',
    )
  })

  it('bumps to -v2 when the base path already has a report', () => {
    const existing = new Set(['qa/historian-eval/results/2026-07-21/historian-eval-report.json'])
    const resolved = resolveOutputDirectory('qa/historian-eval/results/2026-07-21', (p) => existing.has(p))
    expect(resolved).toBe('qa/historian-eval/results/2026-07-21-v2')
  })

  it('bumps to -v3 when both the base path and -v2 already have a report', () => {
    const existing = new Set([
      'qa/historian-eval/results/2026-07-21/historian-eval-report.json',
      'qa/historian-eval/results/2026-07-21-v2/historian-eval-report.json',
    ])
    const resolved = resolveOutputDirectory('qa/historian-eval/results/2026-07-21', (p) => existing.has(p))
    expect(resolved).toBe('qa/historian-eval/results/2026-07-21-v3')
  })
})

describe('parseSessionTranscript', () => {
  // (e) Real-data finding: 1 of ~113 historian_sessions rows stores
  // `transcript` as a JSON-encoded STRING instead of a JSONB array. The old
  // `Array.isArray(row.transcript) ? ... : []` check silently coerced that
  // row to [], losing real content. This suite proves the recovery path.

  it('returns an array value as-is', () => {
    const arr = [{ role: 'user', text: 'hi', timestamp: 0 }]
    expect(parseSessionTranscript(arr)).toEqual(arr)
  })

  it('recovers a JSON-string-encoded array (the ~1/113 prod row shape) into a real array', () => {
    const entries = [
      { role: 'assistant', text: 'What brings you in today?', timestamp: 0, seq: 1 },
      { role: 'user', text: 'Headaches for a week.', timestamp: 5, seq: 2 },
      { role: 'assistant', text: 'Any nausea?', timestamp: 10, seq: 3 },
      { role: 'user', text: 'Yes, some.', timestamp: 15, seq: 4 },
    ]

    const recovered = parseSessionTranscript(JSON.stringify(entries))

    expect(recovered).toEqual(entries)
    // The recovered content is genuinely evaluable, not just structurally
    // an array — at least MIN_PATIENT_TURNS (2) non-empty patient turns,
    // so this session would proceed through the harness's evaluators
    // rather than being short-circuited as insufficient.
    const patientTurns = recovered.filter((e) => e.role === 'user' && e.text.trim().length > 0)
    expect(patientTurns.length).toBeGreaterThanOrEqual(2)
  })

  it('recovers a JSON-string-encoded array with fewer than 2 patient turns (still an array, just insufficient downstream)', () => {
    const entries = [{ role: 'assistant', text: 'Hello, what brings you in today?', timestamp: 0, seq: 1 }]
    const recovered = parseSessionTranscript(JSON.stringify(entries))
    expect(recovered).toEqual(entries)
    const patientTurns = recovered.filter((e) => e.role === 'user' && e.text.trim().length > 0)
    expect(patientTurns.length).toBeLessThan(2)
  })

  it('degrades a malformed JSON string to [] without throwing', () => {
    expect(() => parseSessionTranscript('{not valid json')).not.toThrow()
    expect(parseSessionTranscript('{not valid json')).toEqual([])
  })

  it('degrades a JSON string that parses but does not encode an array (e.g. an object) to []', () => {
    expect(parseSessionTranscript(JSON.stringify({ not: 'an array' }))).toEqual([])
  })

  it('degrades null/undefined/non-string-non-array values to [] without throwing', () => {
    expect(parseSessionTranscript(null)).toEqual([])
    expect(parseSessionTranscript(undefined)).toEqual([])
    expect(parseSessionTranscript(42)).toEqual([])
  })
})

describe('runHistorianEvalCli', () => {
  it('prints usage and returns exit code 1 for an unknown flag', async () => {
    const io = runtime()
    const result = await runHistorianEvalCli(['--bogus'], io)
    expect(result.exitCode).toBe(1)
    expect(result.report).toBeNull()
    expect(io.stderrLines.join('\n')).toContain('AI Historian batch eval harness')
    expect(io.stderrLines.join('\n')).toMatch(/unknown historian-eval option/i)
    expect(io.runCase).not.toHaveBeenCalled()
  })

  it('prints usage and returns exit code 1 when --sessions is given without ids/--since', async () => {
    const io = runtime()
    const result = await runHistorianEvalCli(['--sessions'], io)
    expect(result.exitCode).toBe(1)
    expect(io.stderrLines.join('\n')).toMatch(/requires at least one session id or --since/i)
    expect(io.runCase).not.toHaveBeenCalled()
  })

  it('shows help text and exits 0 on --help without running anything', async () => {
    const io = runtime()
    const result = await runHistorianEvalCli(['--help'], io)
    expect(result.exitCode).toBe(0)
    expect(result.report).toBeNull()
    expect(io.stdoutLines.join('\n')).toContain('AI Historian batch eval harness')
    expect(io.runCase).not.toHaveBeenCalled()
    expect(io.writeText).not.toHaveBeenCalled()
  })

  it('a fixtures dry run (no --live) never calls runCase and still writes a complete report', async () => {
    const io = runtime()
    const result = await runHistorianEvalCli(['--fixtures'], io)
    expect(result.exitCode).toBe(0)
    expect(io.runCase).not.toHaveBeenCalled()
    expect(result.report?.live).toBe(false)
    expect(result.report?.mode).toBe('fixtures')
    expect(result.report?.cases).toHaveLength(listPersonaFiles().length)
    expect(result.report?.releaseGatePassed).toBeNull()
    expect(io.files.size).toBe(2)
  })

  it('a fixtures live run calls runCase exactly once per persona with persist:false', async () => {
    const io = runtime()
    const result = await runHistorianEvalCli(['--fixtures', '--live'], io)
    const personaCount = listPersonaFiles().length
    expect(io.runCase).toHaveBeenCalledTimes(personaCount)
    expect(io.runCase).toHaveBeenCalledWith(expect.objectContaining({ kind: 'fixture' }), { live: true, persist: false })
    expect(result.report?.live).toBe(true)
    expect(result.report?.cases).toHaveLength(personaCount)
  })

  it('sessions mode with explicit ids calls runCase once per id with persist:true', async () => {
    const io = runtime()
    const result = await runHistorianEvalCli(['--sessions', 'id1', 'id2', '--live'], io)
    expect(io.runCase).toHaveBeenCalledTimes(2)
    expect(io.runCase).toHaveBeenCalledWith({ kind: 'session', sessionId: 'id1' }, { live: true, persist: true })
    expect(io.runCase).toHaveBeenCalledWith({ kind: 'session', sessionId: 'id2' }, { live: true, persist: true })
    expect(result.report?.mode).toBe('sessions')
  })

  it('a sessions dry run with explicit ids lists them without calling runCase', async () => {
    const io = runtime()
    const result = await runHistorianEvalCli(['--sessions', 'id1'], io)
    expect(io.runCase).not.toHaveBeenCalled()
    expect(result.report?.cases.map((c) => c.caseId)).toEqual(['id1'])
    expect(result.report?.live).toBe(false)
  })

  it('bumps the default output directory to -v2 on collision', async () => {
    const io = runtime()
    io.existing.add('qa/historian-eval/results/2026-07-21/historian-eval-report.json')
    await runHistorianEvalCli(['--fixtures'], io)
    const writtenPaths = [...io.files.keys()]
    expect(writtenPaths.some((p) => p.startsWith('qa/historian-eval/results/2026-07-21-v2/'))).toBe(true)
    expect(writtenPaths.some((p) => p === 'qa/historian-eval/results/2026-07-21/historian-eval-report.json')).toBe(false)
  })

  it('uses an explicit --out path as-is, without collision bumping', async () => {
    const io = runtime()
    io.existing.add('custom-dir/historian-eval-report.json')
    await runHistorianEvalCli(['--fixtures', '--out', 'custom-dir'], io)
    expect(io.files.has('custom-dir/historian-eval-report.json')).toBe(true)
    expect(io.ensureDirectory).toHaveBeenCalledWith('custom-dir')
  })

  it('returns exit code 1 when a live run fails a release gate', async () => {
    const io = runtime()
    io.runCase = vi.fn(async (ref) =>
      fakeOutcome(ref.kind === 'fixture' ? ref.personaFile : ref.sessionId, 'fixture', {
        thoroughness: {
          ok: true,
          result: {
            oldcarts: { score: 10, evidence_turns: [], notes: '' },
            red_flags: { score: 10, evidence_turns: [], notes: '' },
            pmh_meds_allergies: { score: 10, evidence_turns: [], notes: '' },
            fh_sh: { score: 10, evidence_turns: [], notes: '' },
            question_quality: { score: 10, evidence_turns: [], notes: '' },
            closure: { score: 10, evidence_turns: [], notes: '' },
            missed_critical_questions: [],
            diagnosis_leak: { leaked: false, quotes: [] },
            fidelity: null,
            overall: 10,
            confidence: { level: 'Low', reason: 'thin transcript' },
            unvetted: true,
            deterministic: {
              diagnosisLeak: { leaked: false, matches: [] },
              phaseMarkers: { openingPresent: false, closingPresent: false },
              turnCap: { patientTurnCount: 1, limit: 25, exceeded: false },
              structuredOutput: { valid: false, issues: [] },
              criticalCoverage: [],
              issues: [],
            },
            dropped_findings: 0,
            coverage_disagreement: false,
            provenance: {
              model_id: 'sonnet',
              prompt_version: 'thoroughness-v1',
              rubric_version: 'base-neuro-hpi-v1',
              inference_params: {},
              generated_at: '2026-07-21T00:00:00.000Z',
            },
          },
          error: null,
          skippedReason: null,
          latencyMs: 5,
          costUsd: 0.0001,
          modelId: 'sonnet',
          promptVersion: 'thoroughness-v1',
          rubricVersion: 'base-neuro-hpi-v1',
          inferenceParams: {},
        },
      }),
    )
    const result = await runHistorianEvalCli(['--fixtures', '--live'], io)
    expect(result.report?.releaseGatePassed).toBe(false)
    expect(result.exitCode).toBe(1)
  })
})
