import { beforeEach, describe, expect, it, vi } from 'vitest'

const { invokeBedrockClinicalToolMock, invokeBedrockJSONMock } = vi.hoisted(() => ({
  invokeBedrockClinicalToolMock: vi.fn(),
  invokeBedrockJSONMock: vi.fn(),
}))

vi.mock('@/lib/bedrock', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/bedrock')>()
  return {
    ...actual,
    invokeBedrockClinicalTool: invokeBedrockClinicalToolMock,
    invokeBedrockJSON: invokeBedrockJSONMock,
  }
})

import {
  invokeBedrockClinicalToolWithMeta,
  invokeBedrockJSONWithMeta,
} from '@/lib/historian/eval/bedrockMeta'
import { BEDROCK_MODEL } from '@/lib/bedrock'

describe('invokeBedrockClinicalToolWithMeta', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns {result, usage, latencyMs, modelId} without altering the parsed payload', async () => {
    invokeBedrockClinicalToolMock.mockResolvedValue({
      parsed: { diagnosis: 'Migraine' },
      raw: '{"diagnosis":"Migraine"}',
      stopReason: 'tool_use',
      inputTokens: 120,
      outputTokens: 45,
    })

    const meta = await invokeBedrockClinicalToolWithMeta<{ diagnosis: string }>({
      system: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
      toolName: 'record_thing',
      toolDescription: 'records a thing',
      inputSchema: { type: 'object', properties: {} },
    })

    expect(meta.result).toEqual({ diagnosis: 'Migraine' })
    expect(meta.usage).toEqual({ inputTokens: 120, outputTokens: 45 })
    expect(meta.modelId).toBe(BEDROCK_MODEL)
    expect(typeof meta.latencyMs).toBe('number')
    expect(meta.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it('reports the overridden model id, not the shared default', async () => {
    invokeBedrockClinicalToolMock.mockResolvedValue({
      parsed: {},
      raw: '{}',
      stopReason: 'tool_use',
    })

    const meta = await invokeBedrockClinicalToolWithMeta({
      system: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
      toolName: 'record_thing',
      toolDescription: 'records a thing',
      inputSchema: { type: 'object', properties: {} },
      model: 'us.anthropic.claude-opus-4-8',
    })

    expect(meta.modelId).toBe('us.anthropic.claude-opus-4-8')
  })

  it('omits token-usage keys the underlying call did not return', async () => {
    invokeBedrockClinicalToolMock.mockResolvedValue({
      parsed: {},
      raw: '{}',
      stopReason: 'tool_use',
      // no usage fields at all
    })

    const meta = await invokeBedrockClinicalToolWithMeta({
      system: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
      toolName: 'record_thing',
      toolDescription: 'records a thing',
      inputSchema: { type: 'object', properties: {} },
    })

    expect(meta.usage).toEqual({})
  })

  it('propagates a rejection from the wrapped call (e.g. ClinicalModelOutputError) unchanged', async () => {
    const err = new Error('Clinical tool output was incomplete (stop reason: max_tokens).')
    invokeBedrockClinicalToolMock.mockRejectedValue(err)

    await expect(
      invokeBedrockClinicalToolWithMeta({
        system: 'sys',
        messages: [{ role: 'user', content: 'hi' }],
        toolName: 'record_thing',
        toolDescription: 'records a thing',
        inputSchema: { type: 'object', properties: {} },
      }),
    ).rejects.toBe(err)
  })
})

describe('invokeBedrockJSONWithMeta', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns {result, usage, latencyMs, modelId} for the JSON-mode helper', async () => {
    invokeBedrockJSONMock.mockResolvedValue({
      parsed: { ok: true },
      raw: '{"ok":true}',
      stopReason: 'end_turn',
      inputTokens: 10,
    })

    const meta = await invokeBedrockJSONWithMeta<{ ok: boolean }>({
      system: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
    })

    expect(meta.result).toEqual({ ok: true })
    expect(meta.usage).toEqual({ inputTokens: 10 })
    expect(meta.modelId).toBe(BEDROCK_MODEL)
  })
})
