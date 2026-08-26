import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const migration = read('migrations/064_historian_comprehensive_v4.sql')
const down = read('migrations/064_historian_comprehensive_v4.down.sql')
const runner = read('infrastructure/historian-qa/database-migrate.yaml')
const initializer = read('infrastructure/historian-qa/database-init.yaml')
const verify = read('infrastructure/historian-qa/verify.sql')

describe('Historian Comprehensive v4 QA migration', () => {
  it('adds only report, sufficiency, staged-job, digest, and v4 vocabulary contracts', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS diagnostic_sufficiency jsonb')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS clinician_history_report jsonb')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS pipeline_version integer NOT NULL DEFAULT 1')
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS current_stage text NOT NULL DEFAULT 'legacy'")
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS input_digest text')
    expect(migration).toContain('uq_historian_evaluations_digest')
    expect(migration).toContain("'comprehensive-v4'")
    expect(migration).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|COPY)\b/i)
  })

  it('fails closed rather than dropping persisted v4 evidence', () => {
    expect(down).toContain('Cannot remove Comprehensive v4 schema while v4 evidence exists')
    expect(down).toContain("interview_prompt_version = 'comprehensive-v4'")
    expect(down).toContain('diagnostic_sufficiency IS NOT NULL')
    expect(down).toContain('clinician_history_report IS NOT NULL')
    expect(down).toContain('input_digest IS NOT NULL')
  })

  it('runs the exact migration and verification atomically with source hashes', () => {
    expect(runner).toContain('SourceCommit:')
    expect(runner).toContain('MigrationSha256:')
    expect(runner).toContain('VerifySha256:')
    expect(runner).toContain('migrations/064_historian_comprehensive_v4.sql')
    expect(runner).toContain('psql --single-transaction --set=ON_ERROR_STOP=1')
    expect(initializer).toContain('--file=migrations/064_historian_comprehensive_v4.sql')
  })

  it('verifies every new durable artifact before the QA app is enabled', () => {
    for (const marker of [
      'diagnostic_sufficiency',
      'clinician_history_report',
      'pipeline_version',
      'current_stage',
      'input_digest',
      'uq_historian_evaluations_digest',
      'comprehensive-v4',
    ]) expect(verify).toContain(marker)
  })
})
