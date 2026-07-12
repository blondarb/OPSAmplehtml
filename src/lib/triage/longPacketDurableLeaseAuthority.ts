import type { PoolClient } from 'pg'

export interface LongPacketDurableLeaseAuthority {
  kind?: 'chunk'
  jobId: string
  leaseToken: string
  branch: 'mapper' | 'safety'
  chunkId: string
  chunkProvenanceSha256: string
  modelId: string
  promptVersion: string
  sourceSha256: string
  planSha256: string
  plannerVersion: string
  pipelineVersion: string
}

export interface LongPacketDurableFinalizerLeaseAuthority {
  kind: 'finalizer'
  jobId: string
  leaseToken: string
  runId: string
  modelId: string
  promptVersion: string
  sourceSha256: string
  planSha256: string
  plannerVersion: string
  pipelineVersion: string
}

export async function assertLongPacketDurableLeaseAuthority(input: {
  client: PoolClient
  extractionId: string
  tenantId: string
  authority: LongPacketDurableLeaseAuthority
}): Promise<void> {
  const { authority } = input
  if (
    !authority.jobId ||
    !authority.leaseToken ||
    !authority.chunkId ||
    !/^[a-f0-9]{64}$/.test(authority.chunkProvenanceSha256) ||
    !/^[a-f0-9]{64}$/.test(authority.sourceSha256) ||
    !/^[a-f0-9]{64}$/.test(authority.planSha256) ||
    !authority.modelId ||
    !authority.promptVersion ||
    !authority.plannerVersion ||
    !authority.pipelineVersion
  ) {
    throw new Error('Durable long-packet lease authority is invalid.')
  }
  const locked = await input.client.query(
    `SELECT job.id
       FROM triage_long_packet_chunk_jobs job
       JOIN triage_long_packet_runs run
         ON run.id = job.run_id
        AND run.tenant_id = job.tenant_id
      WHERE job.id = $1
        AND job.tenant_id = $2
        AND run.extraction_id = $3
        AND run.status = 'running'
        AND job.configuration_sha256 = run.configuration_sha256
        AND job.source_sha256 = run.source_sha256
        AND job.plan_sha256 = run.plan_sha256
        AND job.planner_version = run.planner_version
        AND job.pipeline_version = run.pipeline_version
        AND job.status = 'leased'
        AND job.lease_token = $4
        AND job.lease_expires_at > NOW() + interval '30 seconds'
        AND job.branch = $5
        AND job.chunk_id = $6
        AND job.chunk_provenance_sha256 = $7
        AND job.model_id = $8
        AND job.prompt_version = $9
        AND job.source_sha256 = $10
        AND job.plan_sha256 = $11
        AND job.planner_version = $12
        AND job.pipeline_version = $13
      FOR UPDATE OF job, run`,
    [
      authority.jobId,
      input.tenantId,
      input.extractionId,
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
    ],
  )
  if (locked.rowCount !== 1 || locked.rows[0]?.id !== authority.jobId) {
    throw new Error('Durable long-packet lease is stale or inconsistent.')
  }
  const extraction = await input.client.query(
    `SELECT id
       FROM triage_extractions
      WHERE id = $1
        AND tenant_id = $2
        AND source_sha256 = $3
        AND packet_plan_sha256 = $4
      FOR UPDATE`,
    [
      input.extractionId,
      input.tenantId,
      authority.sourceSha256,
      authority.planSha256,
    ],
  )
  if (
    extraction.rowCount !== 1 ||
    extraction.rows[0]?.id !== input.extractionId
  ) {
    throw new Error('Durable long-packet extraction binding is inconsistent.')
  }
}

export async function assertLongPacketDurableFinalizerLeaseAuthority(input: {
  client: PoolClient
  extractionId: string
  tenantId: string
  authority: LongPacketDurableFinalizerLeaseAuthority
}): Promise<void> {
  const { authority } = input
  if (
    !authority.jobId ||
    !authority.leaseToken ||
    !authority.runId ||
    !/^[a-f0-9]{64}$/.test(authority.sourceSha256) ||
    !/^[a-f0-9]{64}$/.test(authority.planSha256) ||
    !authority.modelId ||
    !authority.promptVersion ||
    !authority.plannerVersion ||
    !authority.pipelineVersion
  ) {
    throw new Error('Durable long-packet finalizer lease authority is invalid.')
  }
  const locked = await input.client.query(
    `SELECT job.id
       FROM triage_long_packet_finalization_jobs job
       JOIN triage_long_packet_runs run
         ON run.id = job.run_id
        AND run.tenant_id = job.tenant_id
       JOIN triage_extractions extraction
         ON extraction.id = run.extraction_id
        AND extraction.tenant_id = run.tenant_id
      WHERE job.id = $1
        AND job.tenant_id = $2
        AND job.run_id = $3
        AND run.extraction_id = $4
        AND run.status = 'running'
        AND job.configuration_sha256 = run.configuration_sha256
        AND job.source_sha256 = run.source_sha256
        AND job.plan_sha256 = run.plan_sha256
        AND job.planner_version = run.planner_version
        AND job.pipeline_version = run.pipeline_version
        AND job.status = 'leased'
        AND job.lease_token = $5
        AND job.lease_expires_at > NOW() + interval '30 seconds'
        AND job.model_id = $6
        AND job.prompt_version = $7
        AND job.source_sha256 = $8
        AND job.plan_sha256 = $9
        AND job.planner_version = $10
        AND job.pipeline_version = $11
        AND extraction.source_sha256 = $8
        AND extraction.packet_plan_sha256 = $9
      FOR UPDATE OF job, run, extraction`,
    [
      authority.jobId,
      input.tenantId,
      authority.runId,
      input.extractionId,
      authority.leaseToken,
      authority.modelId,
      authority.promptVersion,
      authority.sourceSha256,
      authority.planSha256,
      authority.plannerVersion,
      authority.pipelineVersion,
    ],
  )
  if (locked.rowCount !== 1 || locked.rows[0]?.id !== authority.jobId) {
    throw new Error('Durable long-packet finalizer lease is stale or inconsistent.')
  }
}
