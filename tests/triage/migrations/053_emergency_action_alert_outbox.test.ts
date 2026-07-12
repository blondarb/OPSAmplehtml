import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const migrationPath = resolve(
  process.cwd(),
  'migrations/053_emergency_action_alert_outbox.sql',
)
const sql = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : ''

describe('migration 053 emergency-action alert outbox', () => {
  it('creates a PHI-free append-only alert stream with capped escalation', () => {
    expect(sql).toContain(
      'CREATE TABLE IF NOT EXISTS triage_emergency_action_alerts',
    )
    for (const field of [
      'emergency_action_id uuid NOT NULL',
      'sequence_number integer NOT NULL',
      'severity text NOT NULL',
      'escalation_level smallint NOT NULL',
      'max_attempts integer NOT NULL DEFAULT 5',
      'attempt_count integer NOT NULL DEFAULT 0',
      'next_attempt_at timestamptz',
      'lease_token uuid',
      'lease_owner text',
      'lease_expires_at timestamptz',
      'sent_at timestamptz',
      'terminal_failed_at timestamptz',
      'last_error_code text',
      'last_error_detail text',
    ]) {
      expect(sql).toContain(field)
    }
    expect(sql).toContain('UNIQUE (emergency_action_id, sequence_number)')
    expect(sql).toContain('escalation_level BETWEEN 0 AND 3')
    expect(sql).toContain("severity = 'emergency'")

    const tableBody = sql.match(
      /CREATE TABLE IF NOT EXISTS triage_emergency_action_alerts \(([\s\S]*?)\n\);/,
    )?.[1]
    expect(tableBody).toBeTruthy()
    expect(tableBody).not.toMatch(
      /tenant_id|patient|source_text|payload|message_text|instruction_given|contact_channel/i,
    )
  })

  it('creates the initial alert in the same emergency-action transaction', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION enqueue_initial_emergency_action_alert')
    expect(sql).toContain('AFTER INSERT ON triage_emergency_actions')
    expect(sql).toContain("VALUES (NEW.id, 0, 'initial', 'emergency', 0")
    expect(sql).toContain('ON CONFLICT (emergency_action_id, sequence_number) DO NOTHING')
    expect(sql).toContain('backfill active emergency actions')
  })

  it('suppresses unsent alerts only after verified handoff or closure', () => {
    expect(sql).toContain(
      'triage_emergency_actions_handoff_evidence_check',
    )
    expect(sql).toContain("status <> 'handed_off'")
    expect(sql).toContain('contact_attempted_at IS NOT NULL')
    expect(sql).toContain("delivery_status IN ('delivered', 'not_applicable')")
    expect(sql).toContain('CREATE OR REPLACE FUNCTION suppress_resolved_emergency_action_alerts')
    expect(sql).toContain('AFTER UPDATE OF status ON triage_emergency_actions')
    expect(sql).toContain("NEW.status IN ('handed_off', 'closed')")
    expect(sql).toContain("status IN ('pending', 'leased', 'failed')")
    expect(sql).not.toContain('AFTER UPDATE OF owner_user_id')
  })

  it('enforces stale-token proof, immutable terminal evidence, and visible publisher failure', () => {
    expect(sql).toContain('invalid emergency alert status transition')
    expect(sql).toContain('active emergency alert lease cannot be replaced')
    expect(sql).toContain('expired emergency alert lease reclaim is invalid')
    expect(sql).toContain('emergency alert outcome lease token is stale')
    expect(sql).toContain('sent emergency alerts are immutable')
    expect(sql).toContain('terminal emergency alert failures are immutable')
    expect(sql).toContain('emergency action alerts cannot be deleted')
    expect(sql).toContain('idx_triage_emergency_action_alerts_terminal_failure')
  })
})
