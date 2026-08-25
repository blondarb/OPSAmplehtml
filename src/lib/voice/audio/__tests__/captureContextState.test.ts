import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The capture graph must not report a live microphone when the AudioContext
 * is not actually running.
 *
 * Chrome starts an AudioContext SUSPENDED unless it is constructed
 * synchronously inside a user-gesture handler. This one is constructed after
 * `await getUserMedia(...)`, which breaks the gesture chain. A suspended
 * context does not pull the graph — process() never fires, port.onmessage
 * never runs, and no audio is sent, silently.
 *
 * That silence is the expensive part: Nova does not speak unprompted (verified
 * against the live relay — 45s of nothing with both a 14,001-char prompt and a
 * 111-char one), so with no audio the entire interview stalls with no error.
 *
 * Source assertions: MicCapture needs real Web Audio + a live worklet module,
 * and this repo has no DOM test environment.
 */
const source = readFileSync(
  join(__dirname, '..', 'capture-worklet.ts'),
  'utf8',
)

describe('MicCapture audio context state', () => {
  it('resumes the context before wiring the graph', () => {
    const resumeAt = source.indexOf('ctx.resume()')
    const wireAt = source.indexOf('createMediaStreamSource')
    expect(resumeAt, 'ctx.resume() must be present').toBeGreaterThan(-1)
    expect(
      resumeAt < wireAt,
      'resume must happen BEFORE the graph is wired, or the first quanta are lost',
    ).toBe(true)
  })

  it('refuses to continue if the context is not running', () => {
    const startupResumeAt = source.indexOf('// RESUME BEFORE WIRING THE GRAPH')
    const startupGuardAt = source.indexOf("ctx.state !== 'running'", startupResumeAt)
    expect(startupResumeAt).toBeGreaterThan(-1)
    expect(startupGuardAt).toBeGreaterThan(startupResumeAt)
    // Must throw, not warn — a warning keeps the silent-capture failure.
    const guard = source.slice(startupGuardAt)
    expect(guard.slice(0, 400)).toContain('throw new Error')
  })

  it('the failure message tells the user what to do', () => {
    expect(source).toMatch(/audio context is/i)
    expect(source).toMatch(/start the interview again/i)
  })
})
