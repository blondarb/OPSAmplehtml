import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  resolve(process.cwd(), 'migrations/049_patient_access_capabilities.sql'),
  'utf8',
)

describe('migration 049 patient access lifecycle', () => {
  it('stores only a fixed-length jti hash and never a raw token or raw jti', () => {
    expect(sql).toMatch(/jti_hash\s+bytea\s+not null/i)
    expect(sql).toMatch(/octet_length\(jti_hash\)\s*=\s*32/i)
    expect(sql).not.toMatch(/raw_token|capability_token|session_token|raw_jti/i)
  })

  it('binds capabilities to patient and optional consult with restrictive FKs', () => {
    expect(sql).toMatch(/patient_id\s+uuid\s+not null\s+references patients\(id\) on delete restrict/i)
    expect(sql).toMatch(/consult_id\s+uuid\s+references neurology_consults\(id\) on delete restrict/i)
    expect(sql).toContain('enforce_patient_access_capability_integrity')
    expect(sql).toMatch(/consult_patient_mismatch|consult binding/i)
  })

  it('records issuance, redemption, rejection, and revocation as append-only audit events', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS patient_access_audit_events')
    expect(sql).toMatch(/redemption_succeeded/i)
    expect(sql).toMatch(/redemption_rejected/i)
    expect(sql).toMatch(/audit events are append-only/i)
  })

  it('guards one-time redemption, irreversible revocation, and immutable claims', () => {
    expect(sql).toMatch(/redemption_count[^\n]+CHECK/i)
    expect(sql).toMatch(/capability claims and bindings are immutable/i)
    expect(sql).toMatch(/redemption cannot be cleared or rewritten/i)
    expect(sql).toMatch(/revocation cannot be cleared or rewritten/i)
  })

  it('adds tenant, patient, consult, lifecycle, expiry, and audit indexes', () => {
    for (const indexName of [
      'idx_patient_access_capabilities_tenant_patient_active',
      'idx_patient_access_capabilities_consult',
      'idx_patient_access_capabilities_expires',
      'idx_patient_access_capabilities_parent',
      'idx_patient_access_audit_jti_time',
      'idx_patient_access_audit_tenant_time',
    ]) {
      expect(sql).toContain(indexName)
    }
  })
})
