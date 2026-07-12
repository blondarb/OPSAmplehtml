import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(
    process.cwd(),
    'migrations/055_unique_consult_per_triage_session.sql',
  ),
  'utf8',
)

describe('migration 055 unique consult per triage session', () => {
  it('fails safely on global preexisting consult duplicates', () => {
    expect(migration).toMatch(
      /WHERE triage_session_id IS NOT NULL[\s\S]+GROUP BY triage_session_id[\s\S]+HAVING count\(\*\) > 1/i,
    )
    expect(migration).toMatch(/RAISE EXCEPTION/i)
    expect(migration).toContain(
      'reconcile duplicate consult bindings before retrying',
    )
    expect(migration).not.toMatch(/DELETE FROM neurology_consults/i)
  })

  it('fails safely on a preexisting cross-tenant session binding', () => {
    expect(migration).toMatch(
      /JOIN triage_sessions[\s\S]+triage_session_id[\s\S]+tenant_id IS DISTINCT FROM/i,
    )
    expect(migration).toContain(
      'reconcile cross-tenant consult bindings before retrying',
    )
  })

  it('enforces global and tenant-scoped uniqueness for non-null bindings', () => {
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS[\s\S]+ON neurology_consults\s*\(triage_session_id\)[\s\S]+WHERE triage_session_id IS NOT NULL/i,
    )
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS[\s\S]+ON neurology_consults\s*\(tenant_id, triage_session_id\)[\s\S]+WHERE triage_session_id IS NOT NULL/i,
    )
  })

  it('rejects cross-tenant links and later tenant drift in either table', () => {
    expect(migration).toContain('enforce_neurology_consult_triage_tenant')
    expect(migration).toMatch(
      /BEFORE INSERT OR UPDATE OF triage_session_id, tenant_id\s+ON neurology_consults/i,
    )
    expect(migration).toMatch(
      /FROM triage_sessions[\s\S]+FOR SHARE/i,
    )
    expect(migration).toContain('enforce_triage_session_consult_tenant')
    expect(migration).toMatch(
      /BEFORE UPDATE OF tenant_id\s+ON triage_sessions/i,
    )
    expect(migration).toContain(
      'consult and triage session tenant binding must match',
    )
  })
})
