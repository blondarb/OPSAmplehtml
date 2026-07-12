import type { Pool } from 'pg'

export type LongPacketRunProgressStatus =
  | 'pending'
  | 'running'
  | 'complete'
  | 'failed'

export type LongPacketFinalizerProgressStatus =
  | 'pending'
  | 'leased'
  | 'complete'
  | 'failed'

export interface LongPacketBranchProgress {
  completed: number
  failed: number
  leased: number
}

export interface LongPacketProgress {
  runStatus: LongPacketRunProgressStatus
  expectedChunks: number
  mapper: LongPacketBranchProgress
  safety: LongPacketBranchProgress
  finalizerStatus: LongPacketFinalizerProgressStatus | null
}

export class LongPacketProgressReadError extends Error {
  readonly name = 'LongPacketProgressReadError'

  constructor(
    public readonly code:
      | 'invalid_input'
      | 'invalid_progress'
      | 'persistence_failed',
    message: string,
  ) {
    super(message)
  }
}

interface ProgressRow {
  run_status: unknown
  expected_chunks: unknown
  mapper_completed: unknown
  mapper_failed: unknown
  mapper_leased: unknown
  safety_completed: unknown
  safety_failed: unknown
  safety_leased: unknown
  finalizer_status: unknown
}

const RUN_STATUSES = new Set<LongPacketRunProgressStatus>([
  'pending',
  'running',
  'complete',
  'failed',
])
const FINALIZER_STATUSES = new Set<LongPacketFinalizerProgressStatus>([
  'pending',
  'leased',
  'complete',
  'failed',
])

function invalidProgress(message: string): never {
  throw new LongPacketProgressReadError('invalid_progress', message)
}

function validateBinding(value: string, label: string): void {
  if (!value.trim() || value.length > 200) {
    throw new LongPacketProgressReadError(
      'invalid_input',
      `${label} binding is invalid.`,
    )
  }
}

function count(value: unknown, label: string, expectedChunks: number): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > expectedChunks
  ) {
    return invalidProgress(`${label} count is invalid.`)
  }
  return value
}

function branchProgress(
  row: ProgressRow,
  branch: 'mapper' | 'safety',
  expectedChunks: number,
): LongPacketBranchProgress {
  const progress = {
    completed: count(
      row[`${branch}_completed`],
      `${branch} completed`,
      expectedChunks,
    ),
    failed: count(
      row[`${branch}_failed`],
      `${branch} failed`,
      expectedChunks,
    ),
    leased: count(
      row[`${branch}_leased`],
      `${branch} leased`,
      expectedChunks,
    ),
  }
  if (progress.completed + progress.failed + progress.leased > expectedChunks) {
    invalidProgress(`${branch} status counts exceed the expected chunk count.`)
  }
  return progress
}

function validateProgressRow(row: ProgressRow): LongPacketProgress {
  if (
    typeof row.run_status !== 'string' ||
    !RUN_STATUSES.has(row.run_status as LongPacketRunProgressStatus)
  ) {
    invalidProgress('Run status is invalid.')
  }
  if (
    typeof row.expected_chunks !== 'number' ||
    !Number.isSafeInteger(row.expected_chunks) ||
    row.expected_chunks < 1
  ) {
    invalidProgress('Expected chunk count is invalid.')
  }
  const expectedChunks = row.expected_chunks
  const mapper = branchProgress(row, 'mapper', expectedChunks)
  const safety = branchProgress(row, 'safety', expectedChunks)
  let finalizerStatus: LongPacketFinalizerProgressStatus | null = null
  if (row.finalizer_status !== null) {
    if (
      typeof row.finalizer_status !== 'string' ||
      !FINALIZER_STATUSES.has(
        row.finalizer_status as LongPacketFinalizerProgressStatus,
      )
    ) {
      invalidProgress('Finalizer status is invalid.')
    }
    finalizerStatus =
      row.finalizer_status as LongPacketFinalizerProgressStatus
  }

  const runStatus = row.run_status as LongPacketRunProgressStatus
  const chunksComplete =
    mapper.completed === expectedChunks &&
    mapper.failed === 0 &&
    mapper.leased === 0 &&
    safety.completed === expectedChunks &&
    safety.failed === 0 &&
    safety.leased === 0
  if (
    runStatus === 'complete' &&
    (!chunksComplete || finalizerStatus !== 'complete')
  ) {
    invalidProgress('Complete run progress is internally inconsistent.')
  }
  if (
    finalizerStatus === 'complete' &&
    (runStatus !== 'complete' || !chunksComplete)
  ) {
    invalidProgress('Complete finalizer progress is internally inconsistent.')
  }
  if (
    finalizerStatus === 'leased' &&
    !chunksComplete
  ) {
    invalidProgress('Leased finalizer progress is internally inconsistent.')
  }

  return {
    runStatus,
    expectedChunks,
    mapper,
    safety,
    finalizerStatus,
  }
}

export async function readLongPacketProgress(
  pool: Pool,
  input: { extractionId: string; tenantId: string },
): Promise<LongPacketProgress | null> {
  validateBinding(input.extractionId, 'Extraction')
  validateBinding(input.tenantId, 'Tenant')
  try {
    const query = await pool.query(
      `WITH selected_run AS (
         SELECT run.id, run.status AS run_status,
                run.expected_chunk_count AS expected_chunks
           FROM triage_extractions extraction
           JOIN triage_long_packet_runs run
             ON run.extraction_id = extraction.id
            AND run.tenant_id = extraction.tenant_id
          WHERE extraction.id = $1
            AND extraction.tenant_id = $2
            AND extraction.status = 'pending'
            AND extraction.ingestion_mode = 'long_packet'
            AND run.run_purpose = 'primary'
          ORDER BY run.created_at DESC
          LIMIT 1
       ), aggregate_progress AS (
         SELECT run.id AS selected_run_id,
                run.run_status, run.expected_chunks,
                (count(chunk.status) FILTER (
                  WHERE chunk.branch = 'mapper' AND chunk.status = 'complete'
                ))::int AS mapper_completed,
                (count(chunk.status) FILTER (
                  WHERE chunk.branch = 'mapper' AND chunk.status = 'failed'
                ))::int AS mapper_failed,
                (count(chunk.status) FILTER (
                  WHERE chunk.branch = 'mapper' AND chunk.status = 'leased'
                ))::int AS mapper_leased,
                (count(chunk.status) FILTER (
                  WHERE chunk.branch = 'safety' AND chunk.status = 'complete'
                ))::int AS safety_completed,
                (count(chunk.status) FILTER (
                  WHERE chunk.branch = 'safety' AND chunk.status = 'failed'
                ))::int AS safety_failed,
                (count(chunk.status) FILTER (
                  WHERE chunk.branch = 'safety' AND chunk.status = 'leased'
                ))::int AS safety_leased
           FROM selected_run run
           LEFT JOIN triage_long_packet_chunk_jobs chunk
             ON chunk.run_id = run.id
            AND chunk.tenant_id = $2
          GROUP BY run.id, run.run_status, run.expected_chunks
       )
       SELECT progress.run_status, progress.expected_chunks,
              progress.mapper_completed, progress.mapper_failed,
              progress.mapper_leased, progress.safety_completed,
              progress.safety_failed, progress.safety_leased,
              finalizer.status AS finalizer_status
         FROM aggregate_progress progress
         LEFT JOIN triage_long_packet_finalization_jobs finalizer
           ON finalizer.run_id = progress.selected_run_id
          AND finalizer.tenant_id = $2`,
      [input.extractionId, input.tenantId],
    )
    if (query.rows.length === 0) return null
    if (query.rows.length !== 1) {
      invalidProgress('Progress query returned an ambiguous run.')
    }
    return validateProgressRow(query.rows[0] as ProgressRow)
  } catch (error) {
    if (error instanceof LongPacketProgressReadError) throw error
    throw new LongPacketProgressReadError(
      'persistence_failed',
      'Long-packet progress is temporarily unavailable.',
    )
  }
}

