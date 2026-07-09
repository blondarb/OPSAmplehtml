import { describe, it, expect } from 'vitest'
import {
  getHistorianToolDefinition,
  getHistorianToolsForProvider,
  toNovaToolSpec,
} from '@/lib/historianPrompts'

describe('toNovaToolSpec', () => {
  it('wraps an OpenAI realtime tool spec into Nova Sonic toolSpec shape', () => {
    const openAiTool = {
      name: 'demo_tool',
      description: 'a demo',
      parameters: { type: 'object', properties: { x: { type: 'string' } }, required: ['x'] },
    }
    const nova = toNovaToolSpec(openAiTool)
    expect(nova).toEqual({
      toolSpec: {
        name: 'demo_tool',
        description: 'a demo',
        inputSchema: { json: JSON.stringify(openAiTool.parameters) },
      },
    })
    // inputSchema.json round-trips back to the original parameters
    expect(JSON.parse(nova.toolSpec.inputSchema.json)).toEqual(openAiTool.parameters)
  })

  it('defaults description to empty string when absent', () => {
    const nova = toNovaToolSpec({ name: 'no_desc', parameters: { type: 'object' } })
    expect(nova.toolSpec.description).toBe('')
  })
})

describe('getHistorianToolsForProvider', () => {
  it('returns the existing OpenAI specs unchanged for provider "openai"', () => {
    const openAiTools = getHistorianToolsForProvider('openai')
    // Same array contents as the canonical definition — names preserved.
    expect(openAiTools).toEqual(getHistorianToolDefinition())
    const names = (openAiTools as any[]).map((t) => t.name).sort()
    expect(names).toEqual(['query_evidence', 'save_interview_output', 'scale_step'])
  })

  it('returns Nova toolSpec shapes for provider "nova" with round-tripping inputSchema', () => {
    const source = getHistorianToolDefinition()
    const novaTools = getHistorianToolsForProvider('nova') as Array<{
      toolSpec: { name: string; description: string; inputSchema: { json: string } }
    }>

    expect(novaTools).toHaveLength(source.length)

    for (let i = 0; i < source.length; i++) {
      const original = source[i] as any
      const wrapped = novaTools[i]
      // Shape: { toolSpec: { name, inputSchema: { json } } }
      expect(wrapped.toolSpec).toBeDefined()
      expect(wrapped.toolSpec.inputSchema).toBeDefined()
      expect(typeof wrapped.toolSpec.inputSchema.json).toBe('string')
      // name matches the source tool
      expect(wrapped.toolSpec.name).toBe(original.name)
      // JSON.parse(inputSchema.json) round-trips the source tool's parameters
      expect(JSON.parse(wrapped.toolSpec.inputSchema.json)).toEqual(original.parameters)
    }

    // All three historian tool names are present in the Nova output.
    const novaNames = novaTools.map((t) => t.toolSpec.name).sort()
    expect(novaNames).toEqual(['query_evidence', 'save_interview_output', 'scale_step'])
  })
})
