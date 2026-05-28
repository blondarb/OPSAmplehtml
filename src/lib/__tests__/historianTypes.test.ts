import { describe, it, expect } from 'vitest'
import { getTurnDetectionConfig } from '@/lib/historianTypes'

describe('getTurnDetectionConfig', () => {
  it('returns semantic_vad with low eagerness by default', () => {
    const config = getTurnDetectionConfig(undefined)
    expect(config).toEqual({ type: 'semantic_vad', eagerness: 'low' })
  })

  it('returns semantic_vad when explicitly set', () => {
    const config = getTurnDetectionConfig('semantic_vad')
    expect(config).toEqual({ type: 'semantic_vad', eagerness: 'low' })
  })

  it('returns PR #105 server_vad tuning when explicitly set', () => {
    const config = getTurnDetectionConfig('server_vad')
    expect(config).toEqual({
      type: 'server_vad',
      threshold: 0.65,
      prefix_padding_ms: 400,
      silence_duration_ms: 1200,
    })
  })

  it('falls back to semantic_vad on unrecognized mode', () => {
    const config = getTurnDetectionConfig('garbage' as any)
    expect(config).toEqual({ type: 'semantic_vad', eagerness: 'low' })
  })
})
