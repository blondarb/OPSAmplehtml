import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * The /api/triage Lambda ceiling must outlive both the work it can do and the
 * client's willingness to wait.
 *
 * Production 2026-08-05: maxDuration was 120s while the worst case was 135s
 * (two concurrent model branches at 45s each with one retry = 90s, then a
 * SEQUENTIAL adjudicator at 45s). The Lambda was killed mid-processing and the
 * session stayed at processing_status='pending' with no error ever recorded —
 * the page hung forever and nothing explained why.
 *
 * Source-text assertions rather than imports: pulling in the route module drags
 * Bedrock and pg clients into a node-environment test. Same approach as
 * tests/historian/startGuardParity.test.ts.
 */

const root = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

function number(source: string, pattern: RegExp, label: string): number {
  const m = source.match(pattern)
  expect(m, `${label} not found — did the declaration move or get renamed?`).toBeTruthy()
  // Strip JS numeric separators: the source writes 45_000, and Number('45_000')
  // is NaN, which would silently make every comparison below vacuously false.
  const parsed = Number(m![1].replace(/_/g, ''))
  expect(Number.isFinite(parsed), `${label} did not parse to a number`).toBe(true)
  return parsed
}

const routeSource = read('src/app/api/triage/route.ts')
const pollSource = read('src/lib/triage/pollClient.ts')
const backgroundSource = read('src/lib/triage/processTriageInBackground.ts')

const MAX_DURATION = number(routeSource, /export const maxDuration = (\d+)/, 'maxDuration')
const BRANCH_TIMEOUT_MS = number(
  backgroundSource,
  /MODEL_BRANCH_TIMEOUT_MS = ([\d_]+)/,
  'MODEL_BRANCH_TIMEOUT_MS',
)

describe('/api/triage Lambda budget invariants', () => {
  it('outlives the worst-case work: concurrent branches with one retry, then the adjudicator', () => {
    const branchSeconds = BRANCH_TIMEOUT_MS / 1000
    // Safety and scoring run concurrently; each retries once -> 2 attempts.
    const concurrentWorstCase = branchSeconds * 2
    // The adjudicator then runs sequentially, same per-call cap, no retry.
    const worstCase = concurrentWorstCase + branchSeconds

    expect(worstCase).toBe(135)
    expect(
      MAX_DURATION,
      `maxDuration ${MAX_DURATION}s is below the ${worstCase}s worst case — the Lambda ` +
        `can be killed mid-run, stranding the session at processing_status='pending' ` +
        `with no error recorded.`,
    ).toBeGreaterThanOrEqual(worstCase)
  })

  it('outlives the client, so a slow run never strands a row the client is still polling', () => {
    // postTriage's own budget, not the module default (which is 120).
    const postTriageBlock = pollSource.slice(pollSource.indexOf('export async function postTriage'))
    const clientSeconds = number(postTriageBlock, /maxAttempts: (\d+)/, "postTriage's maxAttempts")

    expect(
      MAX_DURATION,
      `maxDuration ${MAX_DURATION}s is below the client's ${clientSeconds}s poll budget — ` +
        `the server would give up while the client is still waiting.`,
    ).toBeGreaterThanOrEqual(clientSeconds)
  })

  it('the retry that drives the worst case is still present on BOTH model branches', () => {
    // If a future change removes a retry the arithmetic above silently loosens,
    // and this file would stop guarding anything real.
    const retries = backgroundSource.split('if (error instanceof ClinicalModelTimeoutError) throw error').length - 1
    expect(retries, 'expected the timeout-excluded retry on both the safety and scoring branches').toBe(2)
  })
})
