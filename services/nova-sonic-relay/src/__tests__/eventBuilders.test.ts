import { describe, it, expect } from 'vitest'
import { sessionStart, promptStart, systemContent, audioContentStart, audioInput, toolResultEvents, promptEnd } from '../eventBuilders.js'

describe('eventBuilders', () => {
  it('sessionStart carries inferenceConfiguration', () => {
    expect(sessionStart().event.sessionStart.inferenceConfiguration.maxTokens).toBeGreaterThan(0)
  })
  it('promptStart includes 24k audio out + tool config', () => {
    const e = promptStart('p1', [{ toolSpec: { name: 'save_interview_output' } } as any], 'matthew')
    expect(e.event.promptStart.audioOutputConfiguration.sampleRateHertz).toBe(24000)
    expect(e.event.promptStart.toolConfiguration.tools).toHaveLength(1)
    expect(e.event.promptStart.audioOutputConfiguration.voiceId).toBe('matthew')
  })
  it('audioContentStart declares 16k USER audio', () => {
    const e = audioContentStart('p1', 'c1')
    expect(e.event.contentStart.role).toBe('USER')
    expect(e.event.contentStart.audioInputConfiguration.sampleRateHertz).toBe(16000)
  })
  it('toolResultEvents produces start→result→end with the toolUseId', () => {
    const evs = toolResultEvents('p1', 'tu-9', JSON.stringify({ ok: true }))
    expect(evs).toHaveLength(3)
    expect(evs[0].event.contentStart.toolResultInputConfiguration.toolUseId).toBe('tu-9')
    expect(JSON.parse(evs[1].event.toolResult.content).ok).toBe(true)
  })
})
