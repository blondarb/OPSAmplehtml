import { describe, expect, it } from 'vitest'

import {
  computeNovaRelayConfigDigest,
  mintNovaRelayToken,
  type NovaRelayStartConfig,
} from '@/lib/voice/novaRelayAuth'

const CONFIG: NovaRelayStartConfig = {
  instructions: 'Purpose-limited instructions',
  tools: [
    {
      toolSpec: {
        name: 'save_interview_output',
        inputSchema: { json: { type: 'object', properties: { answer: { type: 'string' } } } },
      },
    },
  ],
  voiceId: 'tiffany',
  sessionType: 'referral_clarification',
}
const JTI = '11111111-1111-4111-8111-111111111111'

describe('Nova relay app-side authorization', () => {
  it('matches the shared app-relay canonical digest fixture', () => {
    expect(computeNovaRelayConfigDigest(CONFIG)).toBe(
      'klJrxzeQLgcZV3pmyHITfU7GgA45f-ZpGzc_fXzIP-M',
    )
  })

  it('canonicalizes object key order when digesting an exact start config', () => {
    const reordered = {
      sessionType: CONFIG.sessionType,
      voiceId: CONFIG.voiceId,
      tools: [
        {
          toolSpec: {
            inputSchema: { json: { properties: { answer: { type: 'string' } }, type: 'object' } },
            name: 'save_interview_output',
          },
        },
      ],
      instructions: CONFIG.instructions,
    }

    expect(computeNovaRelayConfigDigest(reordered)).toBe(
      computeNovaRelayConfigDigest(CONFIG),
    )
  })

  it.each([
    ['instructions', { ...CONFIG, instructions: 'Changed instructions' }],
    ['tools', { ...CONFIG, tools: [] }],
    ['voiceId', { ...CONFIG, voiceId: 'matthew' }],
    ['sessionType', { ...CONFIG, sessionType: 'new_patient' }],
  ])('binds the digest to %s', (_field, changed) => {
    expect(computeNovaRelayConfigDigest(changed)).not.toBe(
      computeNovaRelayConfigDigest(CONFIG),
    )
  })

  it('puts the exact config digest in the HMAC-signed token payload', () => {
    const token = mintNovaRelayToken(
      CONFIG,
      'test-shared-secret',
      2_000_000_000,
      JTI,
    )
    const [payloadB64] = token.split('.')

    expect(JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))).toEqual({
      exp: 2_000_000_120,
      configDigest: computeNovaRelayConfigDigest(CONFIG),
      jti: JTI,
    })
    expect(token.split('.')).toHaveLength(2)
  })

  it('uses a unique signed jti for each minted relay token', () => {
    const first = mintNovaRelayToken(CONFIG, 'test-shared-secret')
    const second = mintNovaRelayToken(CONFIG, 'test-shared-secret')
    const decode = (token: string) =>
      JSON.parse(
        Buffer.from(token.split('.')[0], 'base64url').toString('utf8'),
      ) as { jti: string }

    expect(decode(first).jti).toMatch(/^[0-9a-f-]{36}$/)
    expect(decode(second).jti).not.toBe(decode(first).jti)
  })
})
