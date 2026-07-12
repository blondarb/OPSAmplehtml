import { describe, expect, it, vi } from 'vitest'

const bedrockRuntime = vi.hoisted(() => ({
  send: vi.fn(),
}))

vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: function BedrockRuntimeClient() {
    return { send: bedrockRuntime.send }
  },
  InvokeModelCommand: function InvokeModelCommand(input: unknown) {
    return { input }
  },
}))

import {
  ClinicalModelOutputError,
  invokeBedrockClinicalJSON,
  parseCompleteClinicalJSON,
} from '@/lib/bedrock'

describe('parseCompleteClinicalJSON', () => {
  it('parses complete JSON when the model ends its turn', () => {
    expect(
      parseCompleteClinicalJSON<{ ok: boolean }>('{"ok":true}', 'end_turn')
    ).toEqual({ ok: true })
  })

  it.each(['max_tokens', 'stop_sequence', 'tool_use', 'unknown'])(
    'rejects the %s stop reason as incomplete',
    (stopReason) => {
      expect(() =>
        parseCompleteClinicalJSON<{ ok: boolean }>('{"ok":true}', stopReason)
      ).toThrow(ClinicalModelOutputError)

      try {
        parseCompleteClinicalJSON('{"ok":true}', stopReason)
      } catch (error) {
        expect(error).toMatchObject({ code: 'incomplete', stopReason })
      }
    }
  )

  it('rejects truncated JSON at max_tokens without repairing it', () => {
    expect(() =>
      parseCompleteClinicalJSON<{ ok: boolean }>('{"ok":true', 'max_tokens')
    ).toThrow(
      expect.objectContaining({
        code: 'incomplete',
        stopReason: 'max_tokens',
      })
    )
  })

  it('rejects markdown-wrapped JSON at end_turn as malformed', () => {
    expect(() =>
      parseCompleteClinicalJSON<{ ok: boolean }>(
        '```json\n{"ok":true}\n```',
        'end_turn'
      )
    ).toThrow(
      expect.objectContaining({
        code: 'malformed',
        stopReason: 'end_turn',
      })
    )
  })
})

describe('invokeBedrockClinicalJSON', () => {
  it('uses JSON mode and returns strict parsed output with response metrics', async () => {
    bedrockRuntime.send.mockResolvedValueOnce({
      body: new TextEncoder().encode(
        JSON.stringify({
          content: [{ text: '{"ok":true}' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 12, output_tokens: 5 },
        })
      ),
    })

    const result = await invokeBedrockClinicalJSON<{ ok: boolean }>({
      system: 'Return a clinical result.',
      messages: [{ role: 'user', content: 'Evaluate this referral.' }],
    })

    expect(result).toEqual({
      parsed: { ok: true },
      raw: '{"ok":true}',
      stopReason: 'end_turn',
      inputTokens: 12,
      outputTokens: 5,
    })

    const command = bedrockRuntime.send.mock.calls[0][0] as {
      input: { body: Uint8Array }
    }
    const requestBody = JSON.parse(new TextDecoder().decode(command.input.body))
    expect(requestBody.system).toContain('Respond with ONLY valid JSON.')
  })
})
