import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import {
  runSentinelCli,
  type SentinelCliRuntime,
} from '@/lib/triage/sentinel/cli'
import { parseSentinelCatalog } from '@/lib/triage/sentinel/catalog'
import { runOfflineSentinelCase } from '@/lib/triage/sentinel/evaluator'

const catalogText = readFileSync(
  resolve(process.cwd(), 'qa/triage-sentinel/cases.json'),
  'utf8',
)
const gatesText = readFileSync(
  resolve(process.cwd(), 'qa/triage-sentinel/release-gates.json'),
  'utf8',
)
const catalog = parseSentinelCatalog(JSON.parse(catalogText))

function runtime(): SentinelCliRuntime & {
  stdoutLines: string[]
  stderrLines: string[]
  files: Map<string, string>
} {
  const stdoutLines: string[] = []
  const stderrLines: string[] = []
  const files = new Map<string, string>()
  return {
    stdoutLines,
    stderrLines,
    files,
    readText: vi.fn((path: string) => {
      if (path.endsWith('cases.json')) return catalogText
      if (path.endsWith('release-gates.json')) return gatesText
      throw new Error(`Unexpected read ${path}`)
    }),
    ensureDirectory: vi.fn(),
    writeText: vi.fn((path: string, value: string) => files.set(path, value)),
    stdout: vi.fn((value: string) => stdoutLines.push(value)),
    stderr: vi.fn((value: string) => stderrLines.push(value)),
    setEnvironment: vi.fn(),
    now: () => '2026-07-11T12:00:00.000Z',
    runLiveCase: vi.fn(async (item) => runOfflineSentinelCase(item)),
  }
}

describe('runSentinelCli', () => {
  it('runs the complete deterministic suite offline without touching live dependencies', async () => {
    const io = runtime()

    const result = await runSentinelCli(
      ['--offline', '--format', 'json', '--no-fail-on-gate'],
      io,
    )

    expect(result.exitCode).toBe(0)
    expect(result.report?.mode).toBe('offline_deterministic')
    expect(result.report?.evaluationScope).toBe('full_catalog')
    expect(io.runLiveCase).not.toHaveBeenCalled()
    expect(io.stdoutLines.join('\n')).toContain('"clinicalValidationClaim": false')
    expect(io.stderrLines.join('\n')).toContain('SYNTHETIC')
  })

  it('returns a release-gate exit code by default when the synthetic gate fails', async () => {
    const io = runtime()
    const strictGateSet = JSON.parse(gatesText) as {
      gates: Array<Record<string, unknown>>
    }
    strictGateSet.gates = strictGateSet.gates.map((gate) =>
      gate.metric === 'manual_hold_rate' ? { ...gate, threshold: 0 } : gate,
    )
    vi.mocked(io.readText).mockImplementation((path: string) => {
      if (path.endsWith('cases.json')) return catalogText
      if (path.endsWith('release-gates.json')) {
        return JSON.stringify(strictGateSet)
      }
      throw new Error(`Unexpected read ${path}`)
    })

    const result = await runSentinelCli(['--offline', '--format', 'json'], io)

    expect(result.report?.releaseGatePassed).toBe(false)
    expect(result.exitCode).toBe(2)
  })

  it('runs only explicitly allowlisted live cases and marks the report as a non-release subset', async () => {
    const io = runtime()

    const result = await runSentinelCli(
      [
        '--live',
        '--case',
        'prompt-injection-hard-negative',
        '--profile',
        'sevaro-sandbox',
        '--region',
        'us-east-2',
        '--format',
        'markdown',
        '--no-fail-on-gate',
      ],
      io,
    )

    expect(io.runLiveCase).toHaveBeenCalledTimes(1)
    expect(io.setEnvironment).toHaveBeenCalledWith(
      'AWS_PROFILE',
      'sevaro-sandbox',
    )
    expect(io.setEnvironment).toHaveBeenCalledWith('AWS_REGION', 'us-east-2')
    expect(result.report?.mode).toBe('live_ensemble')
    expect(result.report?.evaluationScope).toBe('subset')
    expect(result.report?.releaseGateEligible).toBe(false)
    expect(result.exitCode).toBe(0)
    expect(io.stdoutLines.join('\n')).toContain('NOT CLINICALLY VALIDATED')
  })

  it('writes both report formats when an output directory is requested', async () => {
    const io = runtime()

    await runSentinelCli(
      ['--offline', '--output-dir', 'sentinel-output', '--no-fail-on-gate'],
      io,
    )

    expect(io.ensureDirectory).toHaveBeenCalledWith('sentinel-output')
    expect(io.files.has('sentinel-output/triage-sentinel-report.json')).toBe(true)
    expect(io.files.has('sentinel-output/triage-sentinel-report.md')).toBe(true)
  })

  it('rejects an unknown live case before any model call', async () => {
    const io = runtime()

    await expect(
      runSentinelCli(['--live', '--case', 'not-a-case'], io),
    ).rejects.toThrow(/unknown sentinel case/i)
    expect(io.runLiveCase).not.toHaveBeenCalled()
    expect(catalog.cases.length).toBeGreaterThan(0)
  })
})
