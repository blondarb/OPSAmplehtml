import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * SQL type-safety guard for the triage worker persistence statements.
 *
 * WHY THIS TEST EXISTS
 * ---------------------
 * On 2026-07-24 an RDS `error/postgresql.log` audit found the emergency-alert
 * critical-UI notification path had been failing on EVERY attempt for 4 days
 * straight (370 rows, 100% delivery failure) on a clinical safety path. Two
 * distinct Postgres type-mismatch bug classes were involved:
 *
 *   Class A — a `text` column (`triage_emergency_actions.owner_user_id`)
 *   selected directly into a `uuid` column (`notifications.recipient_user_id`)
 *   in an INSERT...SELECT. Postgres does not implicitly cast text -> uuid, so
 *   the statement failed at PARSE time on every single attempt regardless of
 *   the actual value.
 *
 *   Class B (the subtle one) — a bind parameter that appears ONLY inside
 *   `CASE ... THEN $n ELSE NULL END` and nowhere else type-determining in the
 *   statement. Postgres cannot infer that parameter's type from context, so
 *   it defaults it to `text`, and then fails assigning the CASE result to a
 *   `timestamptz` column. The fix is an explicit cast: `$n::timestamptz`.
 *   This one is worse than Class A: it broke the FAILURE-RECORDING path
 *   itself, so a failed delivery could never even be marked `failed` by the
 *   worker — rows only died later via lease expiry, which is why the worker
 *   looped indefinitely instead of surfacing a clean, fast error.
 *
 * WHY NO EXISTING TEST CAUGHT THIS
 * ---------------------------------
 * The unit test suite mocks the `pg` Pool entirely (see the `__mocks__`/
 * `vi.mock('pg', ...)` setup used across `tests/triage/*.test.ts`). A mocked
 * pool never sends a single byte of SQL to a real Postgres parser, so no
 * amount of mocked-pool unit testing can EVER catch a SQL type error. That
 * is a structural gap, not a coverage gap — more mocked tests would not have
 * caught this. This file closes it with a test that requires no database at
 * all: it reads the raw source text of the affected files and scans for the
 * dangerous CASE/THEN-without-cast pattern directly, so it runs in normal CI
 * on every PR, at zero cost, with zero DB dependency.
 *
 * This test is NOT a substitute for a real `PREPARE`-against-live-schema
 * check (see the open follow-up in CLAUDE.md to add one) — it is a fast,
 * always-on regression guard against this exact bug class recurring in these
 * four files.
 */

const REPO_ROOT = resolve(__dirname, '..', '..')

const TARGET_FILES = [
  'src/lib/triage/emergencyAlertNotificationDelivery.ts',
  'src/lib/triage/emergencyActionAlertOutbox.ts',
  'src/lib/triage/longPacketDurableWork.ts',
  'src/lib/triage/triageCompletionPersistence.ts',
] as const

function readTarget(relativePath: string): string {
  return readFileSync(resolve(REPO_ROOT, relativePath), 'utf8')
}

/**
 * Bind parameters used as a CASE/THEN result with no explicit `::type` cast
 * cannot have their type inferred by Postgres from that position alone, so
 * Postgres defaults them to `text` — which then fails at runtime if the
 * target column is not text (Class B above). This regex is the core check:
 * a `THEN` followed by whitespace and a `$<digits>` bind parameter that is
 * NOT immediately followed by `::`.
 */
const DANGEROUS_CASE_PARAM = /THEN\s+\$(\d+)(?!\s*::)/g

/**
 * Explicit, documented allowlist of THEN-$n occurrences that are safe
 * despite lacking a cast at that exact site, because the parameter's type
 * IS resolvable from elsewhere in the same statement. Anything added here
 * needs a documented justification — ideally verified with a `PREPARE`
 * check against a real schema, the way this entry was. Do NOT weaken the
 * detection regex to silence a new case instead of allowlisting it; the
 * allowlist keeps every accepted exception visible and reviewable.
 */
const KNOWN_SAFE: ReadonlyArray<{
  file: string
  param: string
  reason: string
}> = [
  {
    file: 'src/lib/triage/triageCompletionPersistence.ts',
    param: '$7',
    reason:
      "WHEN $7 IS NOT NULL THEN $7 (around line 291) — this CASE's other " +
      "branch is `system_consult.id`, a uuid column, so Postgres unifies " +
      "the CASE result type as uuid and resolves $7's type from that " +
      'sibling branch, not from this THEN in isolation. Exercised in ' +
      'production without error. Verified safe via PREPARE against the ' +
      'live schema during the 2026-07-24 incident investigation.',
  },
  {
    file: 'src/lib/triage/emergencyAlertNotificationDelivery.ts',
    param: '$4',
    reason:
      "WHEN attempt_count >= max_attempts THEN $4 (terminal_failed_at CASE, " +
      "around line 858) — this same statement also assigns " +
      "`updated_at = $4` in a plain (non-CASE) position later in the SET " +
      "list, which pins $4's type to updated_at's column type " +
      '(timestamptz) for the whole statement. The CASE/THEN position alone ' +
      "would be ambiguous, but Postgres resolves a bind parameter's type " +
      'from ANY type-determining usage across the statement, not per ' +
      'occurrence. Documented in this repo\'s CLAUDE.md changelog for the ' +
      '2026-07-24 incident: "the sibling terminal_failed_at … THEN $4 ' +
      'needs no cast: $4 is already pinned by updated_at = $4."',
  },
  {
    file: 'src/lib/triage/emergencyActionAlertOutbox.ts',
    param: '$4',
    reason:
      "WHEN attempt_count >= max_attempts THEN $4 (terminal_failed_at CASE, " +
      "around line 640) — same reasoning as the sibling entry in " +
      "emergencyAlertNotificationDelivery.ts: this statement also assigns " +
      "`updated_at = $4` AND compares `alert.lease_expires_at > $4` in " +
      "plain (non-CASE) positions, both pinning $4 to timestamptz for the " +
      'whole statement.',
  },
]

function isAllowlisted(file: string, param: string): boolean {
  return KNOWN_SAFE.some((entry) => entry.file === file && entry.param === param)
}

function lineNumberAt(source: string, index: number): number {
  return source.slice(0, index).split('\n').length
}

function contextAround(source: string, index: number, radius = 3): string {
  const lines = source.split('\n')
  const line = lineNumberAt(source, index)
  const start = Math.max(0, line - 1 - radius)
  const end = Math.min(lines.length, line + radius)
  return lines
    .slice(start, end)
    .map((text, offset) => `${start + offset + 1}: ${text}`)
    .join('\n')
}

describe('worker SQL type safety — CASE/THEN bind-parameter cast guard', () => {
  it.each(TARGET_FILES)(
    'flags any uncast CASE/THEN bind parameter in %s (unless explicitly allowlisted)',
    (relativePath) => {
      const source = readTarget(relativePath)
      const violations: string[] = []

      for (const match of source.matchAll(DANGEROUS_CASE_PARAM)) {
        const param = `$${match[1]}`
        if (isAllowlisted(relativePath, param)) {
          continue
        }
        const index = match.index ?? 0
        const line = lineNumberAt(source, index)
        const context = contextAround(source, index)
        violations.push(
          `${relativePath}:${line} — parameter ${param} is used as a CASE/THEN ` +
            `result with no explicit "::type" cast. Postgres cannot infer this ` +
            `parameter's type from a CASE/THEN position alone and will default ` +
            `it to text, which fails at runtime if the target column is not ` +
            `text (this is the exact bug class that caused a 4-day, 100%, ` +
            `undetected emergency-alert delivery failure — see this file's ` +
            `header comment). Add an explicit cast, e.g. "${param}::timestamptz", ` +
            `or, if the type genuinely is resolvable from a sibling CASE branch, ` +
            `add a documented KNOWN_SAFE entry in this test explaining why.\n\n` +
            `Context:\n${context}`,
        )
      }

      expect(violations, violations.join('\n\n---\n\n')).toHaveLength(0)
    },
  )

  it('keeps the already-fixed Class B sites explicitly cast', () => {
    const notificationDelivery = readTarget(
      'src/lib/triage/emergencyAlertNotificationDelivery.ts',
    )
    const alertOutbox = readTarget('src/lib/triage/emergencyActionAlertOutbox.ts')
    const durableWork = readTarget('src/lib/triage/longPacketDurableWork.ts')

    expect(
      notificationDelivery,
      'emergencyAlertNotificationDelivery.ts must keep $8::timestamptz on ' +
        'the failCriticalUiDelivery next_attempt_at CASE, or the Class B ' +
        'parameter-type-inference bug regresses.',
    ).toContain('$8::timestamptz')

    expect(
      alertOutbox,
      'emergencyActionAlertOutbox.ts must keep $8::timestamptz on the ' +
        'failEmergencyAlert next_attempt_at CASE, or the Class B ' +
        'parameter-type-inference bug regresses.',
    ).toContain('$8::timestamptz')

    expect(
      durableWork,
      'longPacketDurableWork.ts must keep $7::timestamptz on the failJob ' +
        'next_retry_at CASE, or the Class B parameter-type-inference bug ' +
        'regresses.',
    ).toContain('$7::timestamptz')
  })

  it('keeps the Class A owner_user_id -> uuid fix guarded', () => {
    const notificationDelivery = readTarget(
      'src/lib/triage/emergencyAlertNotificationDelivery.ts',
    )

    expect(
      notificationDelivery,
      'owner_user_id must still be cast to uuid before being selected into ' +
        'notifications.recipient_user_id, or the Class A text->uuid parse ' +
        'failure regresses.',
    ).toContain('owner_user_id::uuid')

    expect(
      notificationDelivery,
      'the owner_user_id::uuid cast must stay GUARDED by a regex format ' +
        'check (the "~*" operator) rather than applied bare. owner_user_id ' +
        'is unconstrained text (this repo\'s own tests use values like ' +
        "'clinician-1'), and a bare ::uuid cast throws 22P02 at runtime on " +
        'any non-UUID value, trading a parse-time failure for a ' +
        'runtime failure on the same critical emergency-alert path.',
    ).toMatch(/~\*/)
  })
})
