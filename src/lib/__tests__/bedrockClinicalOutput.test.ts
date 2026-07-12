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
  buildBedrockClientConfig,
  invokeBedrockClinicalJSON,
  invokeBedrockClinicalTool,
  parseCompleteClinicalJSON,
} from '@/lib/bedrock'

describe('buildBedrockClientConfig', () => {
  it('never selects static AWS credentials in production', () => {
    expect(
      buildBedrockClientConfig({
        NODE_ENV: 'production',
        AWS_REGION: 'us-east-2',
        BEDROCK_ACCESS_KEY_ID: 'synthetic-access-key',
        BEDROCK_SECRET_ACCESS_KEY: 'synthetic-secret-key',
      }),
    ).toEqual({ region: 'us-east-2' })
  })

  it('allows explicit temporary credentials for local development only', () => {
    expect(
      buildBedrockClientConfig({
        NODE_ENV: 'development',
        BEDROCK_REGION: 'us-east-2',
        BEDROCK_ACCESS_KEY_ID: 'synthetic-access-key',
        BEDROCK_SECRET_ACCESS_KEY: 'synthetic-secret-key',
        AWS_SESSION_TOKEN: 'synthetic-session-token',
      }),
    ).toMatchObject({
      region: 'us-east-2',
      credentials: { sessionToken: 'synthetic-session-token' },
    })
  })
})

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
          usage: {
            input_tokens: 12,
            output_tokens: 5,
            cache_creation_input_tokens: 100,
            cache_read_input_tokens: 200,
            cache_creation: {
              ephemeral_5m_input_tokens: 60,
              ephemeral_1h_input_tokens: 40,
            },
          },
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
      cacheWriteInputTokens: 100,
      cacheReadInputTokens: 200,
      cacheWrite5mInputTokens: 60,
      cacheWrite1hInputTokens: 40,
    })

    const command = bedrockRuntime.send.mock.calls[0][0] as {
      input: { body: Uint8Array }
    }
    const requestBody = JSON.parse(new TextDecoder().decode(command.input.body))
    expect(requestBody.system).toContain('Respond with ONLY valid JSON.')
  })

  it.each([
    'us.anthropic.claude-sonnet-5',
    'us.anthropic.claude-opus-4-8',
  ])('omits deprecated temperature for %s', async (model) => {
    bedrockRuntime.send.mockResolvedValueOnce({
      body: new TextEncoder().encode(
        JSON.stringify({
          content: [{ text: '{"ok":true}' }],
          stop_reason: 'end_turn',
        }),
      ),
    })

    await invokeBedrockClinicalJSON({
      system: 'Return JSON.',
      messages: [{ role: 'user', content: 'Synthetic input.' }],
      model,
      temperature: 0,
    })

    const command = bedrockRuntime.send.mock.calls.at(-1)?.[0] as {
      input: { body: Uint8Array }
    }
    const requestBody = JSON.parse(new TextDecoder().decode(command.input.body))
    expect(requestBody).not.toHaveProperty('temperature')
  })

  it('retains temperature for Sonnet 4.6', async () => {
    bedrockRuntime.send.mockResolvedValueOnce({
      body: new TextEncoder().encode(
        JSON.stringify({
          content: [{ text: '{"ok":true}' }],
          stop_reason: 'end_turn',
        }),
      ),
    })

    await invokeBedrockClinicalJSON({
      system: 'Return JSON.',
      messages: [{ role: 'user', content: 'Synthetic input.' }],
      model: 'us.anthropic.claude-sonnet-4-6',
      temperature: 0,
    })

    const command = bedrockRuntime.send.mock.calls.at(-1)?.[0] as {
      input: { body: Uint8Array }
    }
    const requestBody = JSON.parse(new TextDecoder().decode(command.input.body))
    expect(requestBody.temperature).toBe(0)
  })
})

describe('invokeBedrockClinicalTool', () => {
  it('accepts exactly one forced matching tool result as complete structured output', async () => {
    bedrockRuntime.send.mockResolvedValueOnce({
      body: new TextEncoder().encode(
        JSON.stringify({
          content: [
            { type: 'thinking', thinking: '' },
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'emit_result',
              input: { care_pathway: 'emergency_now' },
            },
          ],
          stop_reason: 'tool_use',
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      ),
    })

    const result = await invokeBedrockClinicalTool<{
      care_pathway: string
    }>({
      system: 'Return a clinical result.',
      messages: [{ role: 'user', content: 'Synthetic input.' }],
      model: 'us.anthropic.claude-sonnet-5',
      temperature: 0,
      toolName: 'emit_result',
      toolDescription: 'Emit result',
      inputSchema: {
        type: 'object',
        properties: { care_pathway: { type: 'string' } },
        required: ['care_pathway'],
      },
    })

    expect(result.parsed).toEqual({ care_pathway: 'emergency_now' })
    expect(result.stopReason).toBe('tool_use')
    const command = bedrockRuntime.send.mock.calls.at(-1)?.[0] as {
      input: { body: Uint8Array }
    }
    const requestBody = JSON.parse(new TextDecoder().decode(command.input.body))
    expect(requestBody.tool_choice).toEqual({
      type: 'tool',
      name: 'emit_result',
    })
    expect(requestBody).not.toHaveProperty('temperature')
  })

  it.each([
    {
      stop_reason: 'max_tokens',
      content: [],
    },
    {
      stop_reason: 'tool_use',
      content: [
        { type: 'tool_use', name: 'wrong_tool', input: { ok: true } },
      ],
    },
    {
      stop_reason: 'tool_use',
      content: [
        { type: 'tool_use', name: 'emit_result', input: { ok: true } },
        { type: 'tool_use', name: 'emit_result', input: { ok: true } },
      ],
    },
  ])('rejects incomplete or ambiguous tool output %#', async (response) => {
    bedrockRuntime.send.mockResolvedValueOnce({
      body: new TextEncoder().encode(JSON.stringify(response)),
    })

    await expect(
      invokeBedrockClinicalTool({
        system: 'Return a clinical result.',
        messages: [{ role: 'user', content: 'Synthetic input.' }],
        model: 'us.anthropic.claude-sonnet-5',
        toolName: 'emit_result',
        toolDescription: 'Emit result',
        inputSchema: { type: 'object' },
      }),
    ).rejects.toThrow(ClinicalModelOutputError)
  })
})
