import { describe, expect, it } from 'vitest'
import {
  buildCallerTranscript,
  buildFeedbackReviewInputs,
  buildNoDownvoteReviewResult,
  type ReviewSessionLike,
} from '../feedbackReview'
import type { ClaraFeedbackRow } from '../feedbackTypes'

function makeFeedback(overrides: Partial<ClaraFeedbackRow>): ClaraFeedbackRow {
  return {
    id: 'fb-default',
    session_id: 'sess-1',
    turn_index: 0,
    consult_type: 'non-emergent',
    urgency_level: 'moderate',
    stat_level: 2,
    confidence: 0.8,
    rationale: 'stable presentation',
    red_flags: [],
    gate0_fired: false,
    routing_target: 'STAT 2',
    verdict: 'down',
    reason: null,
    corrected_consult_type: null,
    created_by: null,
    created_at: '2026-07-13T00:00:00.000Z',
    ...overrides,
  }
}

describe('buildCallerTranscript', () => {
  it('concatenates only user-role turns, in order, trimmed', () => {
    const session: ReviewSessionLike = {
      id: 'sess-1',
      turns: [
        { role: 'assistant', text: 'Hi, this is Clara.' },
        { role: 'user', text: '  My patient has right-sided weakness.  ' },
        { role: 'assistant', text: 'When did it start?' },
        { role: 'user', text: 'About two hours ago.' },
      ],
    }
    expect(buildCallerTranscript(session)).toBe(
      'My patient has right-sided weakness.\nAbout two hours ago.',
    )
  })

  it('returns empty string for an undefined session', () => {
    expect(buildCallerTranscript(undefined)).toBe('')
  })

  it('returns empty string for a session with no turns', () => {
    expect(buildCallerTranscript({ id: 'sess-2', turns: [] })).toBe('')
    expect(buildCallerTranscript({ id: 'sess-3', turns: null })).toBe('')
  })

  it('skips blank/whitespace-only user turns', () => {
    const session: ReviewSessionLike = {
      id: 'sess-4',
      turns: [
        { role: 'user', text: '   ' },
        { role: 'user', text: 'real content' },
      ],
    }
    expect(buildCallerTranscript(session)).toBe('real content')
  })
})

describe('buildFeedbackReviewInputs', () => {
  const sessions: ReviewSessionLike[] = [
    {
      id: 'sess-1',
      turns: [
        { role: 'user', text: 'Calling about a stroke alert.' },
        { role: 'assistant', text: 'Got it, tell me more.' },
        { role: 'user', text: 'Last known well was three days ago.' },
      ],
    },
    {
      id: 'sess-2',
      turns: [{ role: 'user', text: 'Rounding on a follow-up patient.' }],
    },
  ]

  it('filters to down-votes only, dropping up-votes', () => {
    const feedback: ClaraFeedbackRow[] = [
      makeFeedback({ id: 'fb-1', verdict: 'down', session_id: 'sess-1' }),
      makeFeedback({ id: 'fb-2', verdict: 'up', session_id: 'sess-2' }),
    ]
    const result = buildFeedbackReviewInputs(feedback, sessions)
    expect(result).toHaveLength(1)
    expect(result[0].sessionId).toBe('sess-1')
  })

  it('joins by session_id to build the caller transcript', () => {
    const feedback: ClaraFeedbackRow[] = [
      makeFeedback({ id: 'fb-1', verdict: 'down', session_id: 'sess-2' }),
    ]
    const result = buildFeedbackReviewInputs(feedback, sessions)
    expect(result[0].transcript).toBe('Rounding on a follow-up patient.')
  })

  it('produces the expected compact input shape from the feedback row snapshot (not a second session lookup)', () => {
    const feedback: ClaraFeedbackRow[] = [
      makeFeedback({
        id: 'fb-1',
        verdict: 'down',
        session_id: 'sess-1',
        consult_type: 'non-emergent',
        urgency_level: 'moderate',
        stat_level: 2,
        gate0_fired: false,
        reason: 'This was a subacute stroke read as too low urgency.',
        corrected_consult_type: 'emergent',
        created_by: 'Riya',
        created_at: '2026-07-12T18:30:00.000Z',
      }),
    ]
    const result = buildFeedbackReviewInputs(feedback, sessions)
    expect(result[0]).toEqual({
      sessionId: 'sess-1',
      transcript: 'Calling about a stroke alert.\nLast known well was three days ago.',
      claraSaid: {
        consultType: 'non-emergent',
        urgencyLevel: 'moderate',
        statLevel: 2,
        gate0Fired: false,
      },
      testerReason: 'This was a subacute stroke read as too low urgency.',
      testerCorrectedType: 'emergent',
      tester: 'Riya',
      at: '2026-07-12T18:30:00.000Z',
    })
  })

  it('produces empty transcript when session_id has no matching session', () => {
    const feedback: ClaraFeedbackRow[] = [
      makeFeedback({ id: 'fb-1', verdict: 'down', session_id: 'sess-missing' }),
    ]
    const result = buildFeedbackReviewInputs(feedback, sessions)
    expect(result[0].transcript).toBe('')
  })

  it('produces empty transcript when session_id is null', () => {
    const feedback: ClaraFeedbackRow[] = [
      makeFeedback({ id: 'fb-1', verdict: 'down', session_id: null }),
    ]
    const result = buildFeedbackReviewInputs(feedback, sessions)
    expect(result[0].sessionId).toBeNull()
    expect(result[0].transcript).toBe('')
  })

  it('handles multiple down-votes against the same session independently', () => {
    const feedback: ClaraFeedbackRow[] = [
      makeFeedback({ id: 'fb-1', verdict: 'down', session_id: 'sess-1', reason: 'first issue' }),
      makeFeedback({ id: 'fb-2', verdict: 'down', session_id: 'sess-1', reason: 'second issue' }),
    ]
    const result = buildFeedbackReviewInputs(feedback, sessions)
    expect(result).toHaveLength(2)
    expect(result.map((r) => r.testerReason)).toEqual(['first issue', 'second issue'])
  })

  it('returns an empty array when there are no down-votes', () => {
    const feedback: ClaraFeedbackRow[] = [
      makeFeedback({ id: 'fb-1', verdict: 'up', session_id: 'sess-1' }),
    ]
    expect(buildFeedbackReviewInputs(feedback, sessions)).toEqual([])
  })
})

describe('buildNoDownvoteReviewResult', () => {
  it('returns the no-Bedrock shape with the given counts/timestamp', () => {
    const result = buildNoDownvoteReviewResult(42, '2026-07-13T12:00:00.000Z')
    expect(result).toEqual({
      generatedAt: '2026-07-13T12:00:00.000Z',
      feedbackCount: 42,
      downCount: 0,
      themes: [],
      topFixes: [],
      note: 'No thumbs-down feedback to review.',
    })
  })
})
