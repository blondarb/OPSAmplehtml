import { describe, it, expect } from 'vitest'
import { sessionStart, promptStart, systemContent, userText, audioContentStart, audioInput, toolResultEvents, promptEnd } from '../eventBuilders.js'

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
  it('systemContent uses the SYSTEM role (init prompt only — once per prompt)', () => {
    const [start, input] = systemContent('p1', 'you are a historian')
    expect(start.event.contentStart.role).toBe('SYSTEM')
    expect(input.event.textInput.content).toBe('you are a historian')
  })
  it('userText uses the USER role — mid-conversation injections must NOT be SYSTEM', () => {
    // Regression guard: a second SYSTEM content block fails the Nova stream with
    // "Duplicate SYSTEM content". Localizer/scale/early-end pushes go through
    // userText (role USER), which Nova accepts repeatedly.
    const [start, input, end] = userText('p1', 'administer PHQ-9 now')
    expect(start.event.contentStart.role).toBe('USER')
    expect(start.event.contentStart.type).toBe('TEXT')
    expect(input.event.textInput.content).toBe('administer PHQ-9 now')
    // properly bracketed: start and end share one contentName
    expect(start.event.contentStart.contentName).toBe(end.event.contentEnd.contentName)
  })
  it('toolResultEvents produces start→result→end with the toolUseId', () => {
    const evs = toolResultEvents('p1', 'tu-9', JSON.stringify({ ok: true }))
    expect(evs).toHaveLength(3)
    expect(evs[0].event.contentStart.toolResultInputConfiguration.toolUseId).toBe('tu-9')
    expect(JSON.parse(evs[1].event.toolResult.content).ok).toBe(true)
  })
})
