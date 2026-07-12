import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  resolve(process.cwd(), 'migrations/051_triage_ingress_idempotency.sql'),
  'utf8',
)

describe('migration 051 triage ingress idempotency', () => {
  it('preflights duplicate and cross-tenant extraction links before adding constraints', () => {
    expect(sql).toContain('preflight found duplicate source extraction links')
    expect(sql).toContain('preflight found invalid source extraction tenant bindings')
    expect(sql).toMatch(
      /GROUP BY source_extraction_id[\s\S]+HAVING count\(\*\) > 1/,
    )
    expect(sql).toMatch(
      /JOIN triage_extractions[\s\S]+extraction\.tenant_id IS DISTINCT FROM triage_session\.tenant_id/,
    )
  })

  it('allows only one triage session to consume a non-null extraction source', () => {
    expect(sql).toContain(
      'idx_triage_sessions_unique_source_extraction',
    )
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX[\s\S]+ON triage_sessions \(source_extraction_id\)[\s\S]+WHERE source_extraction_id IS NOT NULL/,
    )
  })

  it('makes an established source link immutable and tenant-bound', () => {
    expect(sql).toContain('enforce_triage_session_ingress_integrity')
    expect(sql).toContain('triage source extraction linkage is immutable once set')
    expect(sql).toContain(
      'triage sessions linked to a source extraction cannot be deleted',
    )
    expect(sql).toContain('triage source extraction tenant binding is invalid')
    expect(sql).toContain(
      'BEFORE INSERT OR UPDATE OR DELETE ON triage_sessions',
    )
  })

  it('adds bounded processing-lease state for atomic background-work claims', () => {
    expect(sql).toContain('processing_claimed_at timestamptz')
    expect(sql).toContain('processing_lease_expires_at timestamptz')
    expect(sql).toContain(
      'processing_attempt_count integer NOT NULL DEFAULT 0',
    )
    expect(sql).toMatch(/processing_attempt_count >= 0/)
    expect(sql).toContain('processing lease timestamps must be paired and ordered')
    expect(sql).toContain('terminal processing state cannot retain an active lease')
    expect(sql).toContain('processing attempt count cannot decrease')
    expect(sql).toContain('an active processing lease cannot be replaced')
    expect(sql).toContain('a new processing lease must increment the attempt count')
  })
})
