import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const hook = readFileSync('src/hooks/useRealtimeSession.ts', 'utf8')
const save = hook.slice(hook.indexOf("if (toolName === 'save_interview_output')"), hook.indexOf('// ── save_scale_responses'))
describe('preclose gate wiring', () => {
  it('reads the inlinable flag, bounded coverage request, and pure decision before completion', () => {
    expect(save).toContain("process.env.NEXT_PUBLIC_HISTORIAN_PRECLOSE_GATE === 'true'")
    expect(save).toContain("fetch('/api/ai/historian/coverage'")
    expect(save).toContain('AbortSignal.timeout(2500)')
    expect(save).toContain('transcript: transcriptRef.current, chiefComplaint: args.chief_complaint')
    expect(save.indexOf('decidePreclose(')).toBeLessThan(save.indexOf('structuredOutputRef.current ='))
    expect(save).toContain('!args.safety_escalated && !safetyEscalatedRef.current && !precloseRejectedRef.current')
    expect(save).toContain('response.status === 200')
  })
  it('returns on rejection before any completion effects', () => {
    const reject = save.slice(save.indexOf("if (decision.action === 'reject')"), save.indexOf('} catch'))
    expect(reject).toContain('precloseRejectedRef.current = true')
    expect(reject).toContain("reason: 'more_history_needed', ask_next: askNext")
    expect(reject).toContain('provider?.injectSystemText(buildPrecloseNote(askNext))')
    expect(reject).toContain('return')
    for (const forbidden of ['interviewCompletedRef', 'setInterviewCompleted', 'nudgeClosing', 'maybeScheduleAutoEnd']) expect(reject).not.toContain(forbidden)
  })
  it('uses the single consumer localizer channel', () => {
    const localizer = hook.slice(hook.indexOf('const runLocalizer ='), hook.indexOf('// ── Durable transcript flush', hook.indexOf('const runLocalizer =')))
    expect(localizer).not.toContain('injectSystemText(guidance)')
    expect(localizer).not.toContain('injectSystemText(')
    expect(localizer).toContain('pushLocalizerContext')
  })
})
