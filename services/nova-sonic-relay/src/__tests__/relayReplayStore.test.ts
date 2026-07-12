import { describe, expect, it, vi } from 'vitest'
import type { PutItemCommand } from '@aws-sdk/client-dynamodb'

import {
  createDynamoRelayReplayStore,
  RelayReplayStoreError,
} from '../relayReplayStore.js'

const JTI = '11111111-1111-4111-8111-111111111111'
const NOW = 2_000_000_000

describe('shared Nova relay token replay store', () => {
  it('atomically consumes a jti with a TTL and no clinical identifiers', async () => {
    const sent: PutItemCommand[] = []
    const send = vi.fn(async (command: PutItemCommand) => {
      sent.push(command)
      return {}
    })
    const store = createDynamoRelayReplayStore({
      client: { send },
      tableName: 'nova-relay-replay',
      nowSeconds: () => NOW,
    })

    await expect(store.consume({ jti: JTI, exp: NOW + 120 })).resolves.toBe(
      true,
    )
    const command = sent[0]
    expect(command).toBeDefined()
    if (!command) throw new Error('Expected a replay-store command')
    expect(command.input).toEqual({
      TableName: 'nova-relay-replay',
      Item: {
        jti: { S: JTI },
        expires_at: { N: String(NOW + 120) },
        consumed_at: { N: String(NOW) },
      },
      ConditionExpression: 'attribute_not_exists(jti)',
      ReturnValues: 'NONE',
    })
    expect(JSON.stringify(command.input)).not.toMatch(
      /patient|tenant|instructions|configDigest|source/i,
    )
  })

  it('rejects a simultaneous or later replay without overwriting the record', async () => {
    const send = vi.fn(async () => {
      const error = new Error('conditional conflict')
      error.name = 'ConditionalCheckFailedException'
      throw error
    })
    const store = createDynamoRelayReplayStore({
      client: { send },
      tableName: 'nova-relay-replay',
      nowSeconds: () => NOW,
    })

    await expect(store.consume({ jti: JTI, exp: NOW + 120 })).resolves.toBe(
      false,
    )
  })

  it('allows exactly one of two simultaneous consumes for the same token', async () => {
    let consumed = false
    const store = createDynamoRelayReplayStore({
      client: {
        send: vi.fn(async () => {
          if (consumed) {
            const error = new Error('conditional conflict')
            error.name = 'ConditionalCheckFailedException'
            throw error
          }
          consumed = true
          return {}
        }),
      },
      tableName: 'nova-relay-replay',
      nowSeconds: () => NOW,
    })

    const outcomes = await Promise.all([
      store.consume({ jti: JTI, exp: NOW + 120 }),
      store.consume({ jti: JTI, exp: NOW + 120 }),
    ])
    expect(outcomes.sort()).toEqual([false, true])
  })

  it('fails closed on an unavailable shared store', async () => {
    const store = createDynamoRelayReplayStore({
      client: {
        send: vi.fn(async () => {
          throw new Error('synthetic network failure')
        }),
      },
      tableName: 'nova-relay-replay',
      nowSeconds: () => NOW,
    })

    await expect(
      store.consume({ jti: JTI, exp: NOW + 120 }),
    ).rejects.toBeInstanceOf(RelayReplayStoreError)
  })

  it('rejects malformed or overlong authorizations before DynamoDB', async () => {
    const send = vi.fn()
    const store = createDynamoRelayReplayStore({
      client: { send },
      tableName: 'nova-relay-replay',
      nowSeconds: () => NOW,
    })

    await expect(
      store.consume({ jti: 'not-a-jti', exp: NOW + 120 }),
    ).resolves.toBe(false)
    await expect(
      store.consume({ jti: JTI, exp: NOW + 600 }),
    ).resolves.toBe(false)
    expect(send).not.toHaveBeenCalled()
  })
})
