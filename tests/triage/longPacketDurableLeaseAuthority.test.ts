import type { PoolClient } from 'pg'
import { describe, expect, it, vi } from 'vitest'

import {
  assertLongPacketDurableFinalizerLeaseAuthority,
  assertLongPacketDurableLeaseAuthority,
} from '@/lib/triage/longPacketDurableLeaseAuthority'

const authority = {
  jobId: 'job-safety-1',
  leaseToken: 'lease-token-1',
  branch: 'safety' as const,
  chunkId: 'chunk-1',
  chunkProvenanceSha256: 'a'.repeat(64),
  modelId: 'us.anthropic.claude-sonnet-5',
  promptVersion: 'neurology-safety-extractor-v3',
  sourceSha256: 'b'.repeat(64),
  planSha256: 'c'.repeat(64),
  plannerVersion: 'neurology-long-packet-planner-v1',
  pipelineVersion: 'neurology-long-packet-model-pipeline-v1',
}

const finalizerAuthority = {
  kind: 'finalizer' as const,
  jobId: 'job-finalizer-1',
  leaseToken: 'finalizer-lease-token-1',
  runId: 'run-1',
  modelId: 'us.anthropic.claude-sonnet-4-6',
  promptVersion: 'neurology-long-packet-narrative-reducer-v1',
  sourceSha256: 'd'.repeat(64),
  planSha256: 'e'.repeat(64),
  plannerVersion: 'neurology-long-packet-planner-v1',
  pipelineVersion: 'neurology-long-packet-model-pipeline-v1',
}

describe('durable long-packet lease authority', () => {
  it('locks and verifies the exact tenant, extraction, job, chunk, branch, provenance, model, and prompt lease', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ id: authority.jobId }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'extraction-1' }],
        rowCount: 1,
      })

    await assertLongPacketDurableLeaseAuthority({
      client: { query } as unknown as PoolClient,
      extractionId: 'extraction-1',
      tenantId: 'tenant-1',
      authority,
    })

    const [sql, values] = query.mock.calls[0]
    expect(sql).toContain('FOR UPDATE OF job, run')
    for (const field of [
      'run.extraction_id',
      'job.lease_token',
      "job.lease_expires_at > NOW() + interval '30 seconds'",
      "run.status = 'running'",
      'job.configuration_sha256 = run.configuration_sha256',
      'job.source_sha256 = run.source_sha256',
      'job.plan_sha256 = run.plan_sha256',
      'job.planner_version = run.planner_version',
      'job.pipeline_version = run.pipeline_version',
      'job.branch',
      'job.chunk_id',
      'job.chunk_provenance_sha256',
      'job.model_id',
      'job.prompt_version',
    ]) {
      expect(sql).toContain(field)
    }
    expect(values).toEqual([
      authority.jobId,
      'tenant-1',
      'extraction-1',
      authority.leaseToken,
      authority.branch,
      authority.chunkId,
      authority.chunkProvenanceSha256,
      authority.modelId,
      authority.promptVersion,
      authority.sourceSha256,
      authority.planSha256,
      authority.plannerVersion,
      authority.pipelineVersion,
    ])
    expect(query.mock.calls[1][0]).toContain('FROM triage_extractions')
    expect(query.mock.calls[1][0]).toContain('FOR UPDATE')
    expect(query.mock.calls[1][1]).toEqual([
      'extraction-1',
      'tenant-1',
      authority.sourceSha256,
      authority.planSha256,
    ])
  })

  it('rejects a stale or mismatched lease', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 })

    await expect(
      assertLongPacketDurableLeaseAuthority({
        client: { query } as unknown as PoolClient,
        extractionId: 'extraction-1',
        tenantId: 'tenant-1',
        authority,
      }),
    ).rejects.toThrow('stale or inconsistent')
  })

  it('locks the exact finalizer, run, extraction, provenance, model, and prompt in one authority query', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ id: finalizerAuthority.jobId }],
      rowCount: 1,
    })

    await assertLongPacketDurableFinalizerLeaseAuthority({
      client: { query } as unknown as PoolClient,
      extractionId: 'extraction-1',
      tenantId: 'tenant-1',
      authority: finalizerAuthority,
    })

    const [sql, values] = query.mock.calls[0]
    expect(sql).toContain('FROM triage_long_packet_finalization_jobs')
    expect(sql).toContain('FOR UPDATE OF job, run, extraction')
    for (const field of [
      'job.run_id',
      'run.extraction_id',
      'job.lease_token',
      "job.lease_expires_at > NOW() + interval '30 seconds'",
      "run.status = 'running'",
      'job.configuration_sha256 = run.configuration_sha256',
      'job.source_sha256 = run.source_sha256',
      'job.plan_sha256 = run.plan_sha256',
      'job.model_id',
      'job.prompt_version',
      'extraction.source_sha256',
      'extraction.packet_plan_sha256',
    ]) {
      expect(sql).toContain(field)
    }
    expect(values).toEqual([
      finalizerAuthority.jobId,
      'tenant-1',
      finalizerAuthority.runId,
      'extraction-1',
      finalizerAuthority.leaseToken,
      finalizerAuthority.modelId,
      finalizerAuthority.promptVersion,
      finalizerAuthority.sourceSha256,
      finalizerAuthority.planSha256,
      finalizerAuthority.plannerVersion,
      finalizerAuthority.pipelineVersion,
    ])
  })

  it('rejects a stale finalizer lease', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 })

    await expect(
      assertLongPacketDurableFinalizerLeaseAuthority({
        client: { query } as unknown as PoolClient,
        extractionId: 'extraction-1',
        tenantId: 'tenant-1',
        authority: finalizerAuthority,
      }),
    ).rejects.toThrow('stale or inconsistent')
  })
})
