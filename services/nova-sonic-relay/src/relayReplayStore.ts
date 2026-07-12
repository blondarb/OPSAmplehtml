import { PutItemCommand } from '@aws-sdk/client-dynamodb'

import type { RelayTokenPayload } from './relayAuth.js'

const TABLE_NAME_PATTERN = /^[A-Za-z0-9_.-]{3,255}$/
const JTI_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface DynamoClient {
  send(command: PutItemCommand): Promise<unknown>
}

export class RelayReplayStoreError extends Error {
  readonly name = 'RelayReplayStoreError'

  constructor() {
    super('Nova relay replay protection is unavailable.')
  }
}

function errorName(error: unknown): string | null {
  return typeof error === 'object' &&
    error !== null &&
    typeof (error as { name?: unknown }).name === 'string'
    ? (error as { name: string }).name
    : null
}

export function createDynamoRelayReplayStore(input: {
  client: DynamoClient
  tableName: string
  nowSeconds?: () => number
}) {
  if (!TABLE_NAME_PATTERN.test(input.tableName)) {
    throw new RelayReplayStoreError()
  }
  const nowSeconds = input.nowSeconds ?? (() => Math.floor(Date.now() / 1000))

  return {
    async consume(
      authorization: Pick<RelayTokenPayload, 'jti' | 'exp'>,
    ): Promise<boolean> {
      const observedAt = nowSeconds()
      if (
        !JTI_PATTERN.test(authorization.jti) ||
        !Number.isSafeInteger(authorization.exp) ||
        authorization.exp <= observedAt ||
        authorization.exp > observedAt + 180
      ) {
        return false
      }
      try {
        await input.client.send(
          new PutItemCommand({
            TableName: input.tableName,
            Item: {
              jti: { S: authorization.jti.toLowerCase() },
              expires_at: { N: String(authorization.exp) },
              consumed_at: { N: String(observedAt) },
            },
            ConditionExpression: 'attribute_not_exists(jti)',
            ReturnValues: 'NONE',
          }),
        )
        return true
      } catch (error) {
        if (errorName(error) === 'ConditionalCheckFailedException') {
          return false
        }
        throw new RelayReplayStoreError()
      }
    },
  }
}
