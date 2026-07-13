import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(process.cwd(), 'migrations/054_emergency_alert_notification_delivery.sql'),
  'utf8',
)

describe('migration 054 emergency alert critical-UI delivery', () => {
  it('creates a durable one-row-per-alert delivery ledger with leases and terminal evidence', () => {
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS triage_emergency_alert_notification_deliveries',
    )
    expect(migration).toMatch(/emergency_alert_id uuid PRIMARY KEY/i)
    expect(migration).toContain("'pending', 'leased', 'failed', 'delivered', 'terminal_failure', 'suppressed'")
    expect(migration).toContain('lease_token uuid')
    expect(migration).toContain('notification_id text')
    expect(migration).toContain('terminal_failed_at timestamptz')
  })

  it('creates delivery work only after sent state and suppresses only on verified handoff or closure', () => {
    expect(migration).toContain('enqueue_emergency_alert_notification_delivery')
    expect(migration).toContain("NEW.status = 'sent'")
    expect(migration).toContain("NEW.status IN ('handed_off', 'closed')")
    expect(migration).not.toMatch(/owner_user_id\s+IS\s+NOT\s+NULL/i)
  })

  it('keeps delivered, suppressed, and terminal rows immutable and forbids deletion', () => {
    expect(migration).toContain('emergency alert notification deliveries cannot be deleted')
    expect(migration).toContain('delivered emergency alert notification evidence is immutable')
    expect(migration).toContain('terminal emergency alert notification failures are immutable')
    expect(migration).toContain('suppressed emergency alert notification deliveries are immutable')
  })

  it('does not put tenant, patient, clinical content, or routing text in the delivery ledger', () => {
    const table = migration.slice(
      migration.indexOf(
        'CREATE TABLE IF NOT EXISTS triage_emergency_alert_notification_deliveries',
      ),
      migration.indexOf('CREATE INDEX IF NOT EXISTS'),
    )
    expect(table).not.toMatch(/tenant_id|patient|source_text|note_text|instruction_given|owner_team/i)
  })
})
