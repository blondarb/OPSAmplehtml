import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  resolve(process.cwd(), 'migrations/052_long_packet_durable_work.sql'),
  'utf8',
)

describe('migration 052 durable long-packet work', () => {
  it('anchors versioned runs to immutable extraction source and plan digests', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS packet_plan_sha256 text')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS triage_long_packet_runs')
    expect(sql).toContain('configuration_sha256 text NOT NULL')
    expect(sql).toContain('run_purpose text NOT NULL')
    for (const field of [
      'planner_version text NOT NULL',
      'pipeline_version text NOT NULL',
      'mapper_model_id text NOT NULL',
      'mapper_prompt_version text NOT NULL',
      'safety_model_id text NOT NULL',
      'safety_prompt_version text NOT NULL',
      'reducer_model_id text NOT NULL',
      'reducer_prompt_version text NOT NULL',
    ]) {
      expect(sql).toContain(field)
    }
    expect(sql).toContain(
      'UNIQUE (extraction_id, configuration_sha256)',
    )
    expect(sql).toContain('long-packet run provenance is immutable')
  })

  it('creates tenant-bound idempotent mapper and safety chunk jobs', () => {
    expect(sql).toContain(
      'CREATE TABLE IF NOT EXISTS triage_long_packet_chunk_jobs',
    )
    expect(sql).toContain("branch text NOT NULL CHECK (branch IN ('mapper','safety'))")
    expect(sql).toContain('chunk_provenance_sha256 text NOT NULL')
    expect(sql).toContain('model_id text NOT NULL')
    expect(sql).toContain('prompt_version text NOT NULL')
    expect(sql).toContain('UNIQUE (run_id, chunk_id, branch)')
    expect(sql).toContain('long-packet chunk job run binding is invalid')
    expect(sql).toContain('long-packet chunk provenance is invalid')
    expect(sql).toMatch(
      /v_run\.status = 'failed'[\s\S]+OLD\.status = 'leased'[\s\S]+NEW\.status = 'failed'/,
    )
  })

  it('enforces leased work, bounded retries, stale-token proof, and immutable completion', () => {
    for (const field of [
      'max_attempts integer NOT NULL DEFAULT 3',
      'attempt_count integer NOT NULL DEFAULT 0',
      'next_retry_at timestamptz',
      'lease_token uuid',
      'lease_owner text',
      'lease_expires_at timestamptz',
      'outcome_lease_token uuid',
      'result_sha256 text',
      'last_error_code text',
      'last_error_lease_token uuid',
    ]) {
      expect(sql).toContain(field)
    }
    expect(sql).toContain('invalid long-packet job status transition')
    expect(sql).toContain('active long-packet job lease cannot be replaced')
    expect(sql).toContain('long-packet job lease is expired or stale')
    expect(sql).toContain('long-packet job outcome lease token is stale')
    expect(sql).toContain('long-packet job retry limit has been reached')
    expect(sql).toContain('completed long-packet job outcomes are immutable')
    expect(sql).toContain('long-packet durable jobs cannot be deleted')
  })

  it('creates exactly one finalization job per run and gates it on all chunk outcomes', () => {
    expect(sql).toContain(
      'CREATE TABLE IF NOT EXISTS triage_long_packet_finalization_jobs',
    )
    expect(sql).toMatch(/run_id uuid NOT NULL UNIQUE/)
    expect(sql).toContain(
      'long-packet finalization requires all mapper and safety chunk jobs complete',
    )
    expect(sql).toContain(
      'long-packet run cannot start before its complete durable job manifest exists',
    )
    expect(sql).toContain(
      'long-packet run cannot complete before finalization is complete',
    )
  })
})
