import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  resolve(process.cwd(), 'migrations/050_triage_long_packet_provenance.sql'),
  'utf8',
)

describe('migration 050 triage long-packet provenance', () => {
  it('adds durable source, planning, coverage, emergency, model, and prompt evidence', () => {
    for (const fragment of [
      "ingestion_mode text NOT NULL DEFAULT 'legacy_unknown'",
      "source_pages jsonb NOT NULL DEFAULT '[]'::jsonb",
      'source_sha256 text',
      'packet_plan jsonb',
      "coverage_status text NOT NULL DEFAULT 'legacy_unknown'",
      'coverage_report jsonb',
      'packet_emergency_result jsonb',
      'model_map_result jsonb',
      'model_reduce_result jsonb',
      "safety_prompt_versions jsonb NOT NULL DEFAULT '{}'::jsonb",
      'safety_screened_at timestamptz',
    ]) {
      expect(sql).toContain(fragment)
    }
    expect(sql).toMatch(/source_sha256[\s\S]+\^\[0-9a-f\]\{64\}\$/i)
  })

  it('keeps legacy rows readable while constraining explicit ingestion and coverage states', () => {
    expect(sql).toContain(
      "ingestion_mode IN ('single_pass','long_packet','legacy_unknown')",
    )
    expect(sql).toContain(
      "coverage_status IN ('complete','failed','not_applicable','legacy_unknown')",
    )
    expect(sql).toContain("DEFAULT 'legacy_unknown'")
  })

  it('fails closed before a long packet can be marked complete', () => {
    expect(sql).toContain('enforce_triage_extraction_provenance')
    expect(sql).toContain('long-packet extraction requires source pages')
    expect(sql).toContain('long-packet extraction requires a source digest')
    expect(sql).toContain('long-packet extraction requires a packet plan')
    expect(sql).toContain(
      'long-packet extraction cannot complete without zero uncovered characters',
    )
    expect(sql).toContain(
      'long-packet extraction cannot complete before every planned chunk is emergency screened',
    )
    expect(sql).toContain(
      'long-packet extraction cannot complete without a completed model reduction',
    )
    expect(sql).toMatch(/expectedChunkCount[\s\S]+scannedChunkCount/)
    expect(sql).toMatch(/uncoveredCharacterCount[\s\S]+<> 0/)
  })

  it('makes source bindings immutable and prevents deletion or safety-evidence downgrade', () => {
    expect(sql).toContain('triage extraction source and bindings are immutable')
    expect(sql).toContain('triage extraction provenance is immutable after initialization')
    expect(sql).toContain('triage extractions cannot be deleted')
    expect(sql).toContain('complete extraction coverage cannot be downgraded or rewritten')
    expect(sql).toContain('completed emergency scan evidence cannot be downgraded or rewritten')
    expect(sql).toContain('completed triage extractions are immutable')
    expect(sql).toContain(
      'BEFORE INSERT OR UPDATE OR DELETE ON triage_extractions',
    )
  })

  it('adds a tenant/status/coverage operations index', () => {
    expect(sql).toContain(
      'idx_triage_extractions_tenant_status_coverage_created',
    )
    expect(sql).toMatch(
      /ON triage_extractions \(tenant_id, status, coverage_status, created_at DESC\)/,
    )
  })
})
