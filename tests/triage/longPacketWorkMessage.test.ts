import { describe, expect, it } from 'vitest'

import {
  LongPacketWorkMessageError,
  parseLongPacketWorkMessage,
  serializeLongPacketWorkMessage,
} from '@/workers/triageLongPacketMessage'

const JOB_ID = '05240000-0000-4000-8000-000000000001'

describe('long-packet queue message contract', () => {
  it('round-trips an opaque chunk job identifier', () => {
    const body = serializeLongPacketWorkMessage({
      kind: 'chunk',
      jobId: JOB_ID,
    })

    expect(parseLongPacketWorkMessage(body)).toEqual({
      version: 1,
      kind: 'chunk',
      job_id: JOB_ID,
    })
    expect(body).not.toContain('tenant')
    expect(body).not.toContain('patient')
    expect(body).not.toContain('text')
  })

  it('accepts only the two versioned work kinds', () => {
    expect(
      parseLongPacketWorkMessage(
        JSON.stringify({ version: 1, kind: 'finalize', job_id: JOB_ID }),
      ),
    ).toMatchObject({ kind: 'finalize' })

    expect(() =>
      parseLongPacketWorkMessage(
        JSON.stringify({ version: 1, kind: 'reprocess', job_id: JOB_ID }),
      ),
    ).toThrow(LongPacketWorkMessageError)
  })

  it.each([
    '',
    'not-json',
    '[]',
    JSON.stringify({ version: 2, kind: 'chunk', job_id: JOB_ID }),
    JSON.stringify({ version: 1, kind: 'chunk', job_id: 'not-a-uuid' }),
    JSON.stringify({
      version: 1,
      kind: 'chunk',
      job_id: JOB_ID,
      referral_text: 'must never enter the queue',
    }),
  ])('fails closed for malformed or expanded payload %s', (body) => {
    expect(() => parseLongPacketWorkMessage(body)).toThrow(
      LongPacketWorkMessageError,
    )
  })
})
