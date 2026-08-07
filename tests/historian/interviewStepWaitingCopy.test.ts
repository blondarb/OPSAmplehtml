import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Before Henry's first question, the screen must describe what is about to
 * happen — not report that we are waiting.
 *
 * 2026-08-07: Steve declared a HEALTHY session dead at 0:08. The greeting
 * legitimately takes ~10-15s, and "Waiting for the first question…" next to a
 * running timer reads as a fault. He built the thing; a partner watching a demo
 * would reach the same conclusion faster.
 *
 * This copy no longer has to double as a failure signal — a genuinely dead run
 * now raises a real error via the poll stall detector.
 */
const source = readFileSync(
  join(__dirname, '..', '..', 'src/components/historian/HistorianInterviewStep.tsx'),
  'utf8',
)

describe('pre-first-question copy sets expectation, not alarm', () => {
  it('does not say we are waiting', () => {
    expect(source).not.toContain('Waiting for the first question')
  })

  it('says Henry speaks first', () => {
    expect(source).toContain('Henry is getting ready — he will speak first.')
  })

  it('does not invite the patient to speak before there is a question', () => {
    // "Listening — speak when you're ready" while Henry has not spoken invites
    // the patient to talk over the greeting.
    expect(source).toContain('Connecting your microphone…')
    expect(source).toContain('displayedQuestion')
  })

  it('keeps the live states once the interview is running', () => {
    expect(source).toContain('Listening — we can hear you')
    expect(source).toContain('The assistant is speaking')
    expect(source).toContain('Wrapping up…')
  })
})
