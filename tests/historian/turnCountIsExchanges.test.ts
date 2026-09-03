import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * The turn counter must count EXCHANGES, not assistant utterances.
 *
 * TURN_CAP's own comment states the definition: "A turn is one exchange, not
 * one question." The counter did not honour it. Henry's opening arrives as
 * several consecutive assistant turns — greeting, introduction, then the first
 * question — and each incremented the count, so the UI read "Question 4 of
 * about 25" before he had asked anything (observed live 2026-08-07).
 *
 * Not cosmetic: questionCountRef IS the turn budget the model is told to work
 * within (the env-tunable turn ceiling, default 70). Three or four phantom turns up front make
 * Henry hit the cap early and wrap up, silently dropping history questions. The
 * same file already carries a fix for the Nova speculative/final double-emit
 * that "burned the turn budget at 2x" — this is that bug's sibling.
 *
 * Asserted against source text because the hook needs a live WebRTC/WS session
 * to exercise; the repo has no DOM test environment.
 */

const source = readFileSync(
  join(__dirname, '..', '..', 'src/hooks/useRealtimeSession.ts'),
  'utf8',
)

/** The counting rule, isolated so the intent is executable rather than described. */
function countTurns(roles: Array<'assistant' | 'user'>): number {
  let turns = 0
  let previous: string | undefined
  for (const role of roles) {
    if (role === 'assistant' && previous !== 'assistant') turns += 1
    previous = role
  }
  return turns
}

describe('the turn counter counts exchanges', () => {
  it('a greeting block plus one question is ONE turn, not four', () => {
    // Exactly what Steve saw: greeting, intro, preamble, question.
    expect(countTurns(['assistant', 'assistant', 'assistant', 'assistant'])).toBe(1)
  })

  it('counts one turn per real back-and-forth', () => {
    expect(
      countTurns([
        'assistant', 'assistant', // opening block  -> 1
        'user',
        'assistant',              // question 2     -> 2
        'user',
        'assistant',              // question 3     -> 3
        'user',
      ]),
    ).toBe(3)
  })

  it('a patient answering in several fragments does not add turns', () => {
    expect(countTurns(['assistant', 'user', 'user', 'user', 'assistant'])).toBe(2)
  })

  it('the hook guards on the previous entry rather than incrementing blindly', () => {
    expect(source).toContain("previousEntry.role !== 'assistant'")
    // The unguarded increment is what caused the overcount.
    const unguarded = source.includes('setTranscript([...transcriptRef.current])\n          questionCountRef.current += 1')
    expect(unguarded, 'questionCountRef must not increment on every assistant entry').toBe(false)
  })

  it('the Nova double-emit guard is still in place', () => {
    // Removing it would reintroduce 2x counting on the provider Steve demos on.
    expect(source).toContain('isRelayDuplicate')
  })
})
