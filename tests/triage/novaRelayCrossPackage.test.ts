import { describe, expect, it } from 'vitest'

import {
  computeStartConfigDigest,
  matchesSignedStartConfig,
  verifyRelayToken,
} from '../../services/nova-sonic-relay/src/relayAuth.js'
import type { RelayStartConfig } from '../../services/nova-sonic-relay/src/wsProtocol.js'
import { mintNovaRelayToken } from '../../src/lib/voice/novaRelayAuth'

const CONFIG: RelayStartConfig = {
  instructions: 'Purpose-limited instructions',
  tools: [
    {
      toolSpec: {
        name: 'save_interview_output',
        inputSchema: {
          json: {
            type: 'object',
            properties: { answer: { type: 'string' } },
          },
        },
      },
    },
  ],
  voiceId: 'tiffany',
  sessionType: 'referral_clarification',
}

describe('Nova app-to-relay authorization contract', () => {
  it('verifies an app-minted token with the exact relay payload, expiry, and config', () => {
    const nowSeconds = 2_000_000_000
    const jti = '11111111-1111-4111-8111-111111111111'
    const token = mintNovaRelayToken(
      CONFIG,
      'synthetic-shared-secret',
      nowSeconds,
      jti,
    )

    const authorization = verifyRelayToken(
      token,
      'synthetic-shared-secret',
      nowSeconds,
    )

    expect(authorization).toEqual({
      exp: nowSeconds + 120,
      configDigest: computeStartConfigDigest(CONFIG),
      jti,
    })
    expect(matchesSignedStartConfig(CONFIG, authorization!.configDigest)).toBe(
      true,
    )
    expect(
      matchesSignedStartConfig(
        { ...CONFIG, instructions: 'Browser-modified instructions' },
        authorization!.configDigest,
      ),
    ).toBe(false)
  })
})
