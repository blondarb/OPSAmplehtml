import type { Pool, QueryResult } from 'pg'
import { describe, expect, it, vi } from 'vitest'

import {
  LongPacketProgressReadError,
  readLongPacketProgress,
} from '@/lib/triage/longPacketProgressRead'

function result(
  rows: Record<string, unknown>[] = [],
): QueryResult<Record<string, unknown>> {
  return { rows, rowCount: rows.length } as QueryResult<Record<string, unknown>>
}

function poolReturning(rows: Record<string, unknown>[]) {
  const query = vi.fn(async () => result(rows))
  return { pool: { query } as unknown as Pool, query }
}

const validRow = {
  run_status: 'running',
  expected_chunks: 8,
  mapper_completed: 3,
  mapper_failed: 1,
  mapper_leased: 2,
  safety_completed: 4,
  safety_failed: 0,
  safety_leased: 1,
  finalizer_status: 'pending',
}

describe('readLongPacketProgress', () => {
  it('returns one strictly aggregate snapshot from a tenant-bound pending long-packet query', async () => {
    const { pool, query } = poolReturning([validRow])

    const progress = await readLongPacketProgress(pool, {
      extractionId: 'extraction-1',
      tenantId: 'tenant-1',
    })

    expect(progress).toEqual({
      runStatus: 'running',
      expectedChunks: 8,
      mapper: { completed: 3, failed: 1, leased: 2 },
      safety: { completed: 4, failed: 0, leased: 1 },
      finalizerStatus: 'pending',
    })
    expect(query).toHaveBeenCalledTimes(1)
    const [sql, values] = query.mock.calls[0]
    expect(values).toEqual(['extraction-1', 'tenant-1'])
    expect(sql).toContain('FROM triage_extractions extraction')
    expect(sql).toContain('extraction.id = $1')
    expect(sql).toContain('extraction.tenant_id = $2')
    expect(sql).toContain("extraction.status = 'pending'")
    expect(sql).toContain("extraction.ingestion_mode = 'long_packet'")
    expect(sql).toContain("run.run_purpose = 'primary'")
    expect(sql).toContain('ORDER BY run.created_at DESC')
    expect(sql).not.toMatch(/job\.result|result_sha256|lease_token|lease_owner/i)
    expect(JSON.stringify(progress)).not.toMatch(
      /run_id|job|result|model|prompt|source|packet|error_detail/i,
    )
  })

  it('returns null when the tenant-bound extraction has no durable primary run', async () => {
    const { pool } = poolReturning([])

    await expect(
      readLongPacketProgress(pool, {
        extractionId: 'extraction-1',
        tenantId: 'tenant-1',
      }),
    ).resolves.toBeNull()
  })

  it.each([
    [{ ...validRow, expected_chunks: 0 }, 'expected chunk'],
    [{ ...validRow, mapper_completed: 9 }, 'mapper'],
    [{ ...validRow, mapper_completed: 4, mapper_failed: 3, mapper_leased: 2 }, 'mapper'],
    [{ ...validRow, safety_completed: -1 }, 'safety'],
    [{ ...validRow, run_status: 'unknown' }, 'run status'],
    [{ ...validRow, finalizer_status: 'working' }, 'finalizer'],
    [
      {
        ...validRow,
        run_status: 'complete',
        mapper_completed: 8,
        mapper_failed: 0,
        mapper_leased: 0,
        safety_completed: 7,
        safety_failed: 0,
        safety_leased: 0,
        finalizer_status: 'complete',
      },
      'complete',
    ],
  ] as const)('rejects malformed or inconsistent progress: %o', async (row, reason) => {
    const { pool } = poolReturning([row])

    await expect(
      readLongPacketProgress(pool, {
        extractionId: 'extraction-1',
        tenantId: 'tenant-1',
      }),
    ).rejects.toMatchObject({
      name: 'LongPacketProgressReadError',
      code: 'invalid_progress',
      message: expect.stringMatching(new RegExp(reason, 'i')),
    })
  })

  it('does not leak database detail when persistence fails', async () => {
    const pool = {
      query: vi.fn(async () => {
        throw new Error('relation secret_schema.patient_payload does not exist')
      }),
    } as unknown as Pool

    const promise = readLongPacketProgress(pool, {
      extractionId: 'extraction-1',
      tenantId: 'tenant-1',
    })

    await expect(promise).rejects.toBeInstanceOf(LongPacketProgressReadError)
    await expect(promise).rejects.toMatchObject({
      code: 'persistence_failed',
      message: 'Long-packet progress is temporarily unavailable.',
    })
  })

  it('rejects missing tenant or extraction bindings before querying', async () => {
    const { pool, query } = poolReturning([validRow])

    await expect(
      readLongPacketProgress(pool, { extractionId: '', tenantId: 'tenant-1' }),
    ).rejects.toMatchObject({ code: 'invalid_input' })
    await expect(
      readLongPacketProgress(pool, {
        extractionId: 'extraction-1',
        tenantId: ' ',
      }),
    ).rejects.toMatchObject({ code: 'invalid_input' })
    expect(query).not.toHaveBeenCalled()
  })
})

