/**
 * Clara feedback review — pure join/build helpers + shared types for
 * src/app/api/ai/clara/feedback-review/route.ts and
 * src/components/clara/ClaraFeedbackReviewPanel.tsx.
 *
 * SUGGEST-ONLY: this module (and the route/UI built on it) never writes to
 * Clara's rulebook or voice script. It only produces advisory, human-
 * reviewed suggestions — see the route for the Bedrock call and its system
 * prompt, which states this explicitly.
 *
 * Deliberately dependency-free (no Bedrock, no DB, no Next.js imports) so
 * the feedback→session join and the compact analysis-input shape can be
 * unit-tested directly (see __tests__/feedbackReview.test.ts).
 */

import type { ClaraFeedbackRow } from './feedbackTypes'

/** Minimal turn shape this module needs — mirrors ClaraTurn (useClaraVoiceSession.ts) without importing that client hook file. */
export interface ReviewTurnLike {
  role: 'user' | 'assistant'
  text: string
}

/** Minimal session shape this module needs — mirrors a clara_test_sessions row (migrations/048). */
export interface ReviewSessionLike {
  id: string
  turns: ReviewTurnLike[] | null | undefined
}

/** Compact per-down-vote analysis input consumed by the feedback-review Bedrock prompt. */
export interface ClaraFeedbackReviewInput {
  sessionId: string | null
  transcript: string
  claraSaid: {
    consultType: string | null
    urgencyLevel: string | null
    statLevel: number | null
    gate0Fired: boolean
  }
  testerReason: string | null
  testerCorrectedType: string | null
  tester: string | null
  at: string
}

/** One clustered theme returned by the review model. */
export interface ClaraFeedbackReviewTheme {
  theme: string
  count: number
  exampleSessionIds: string[]
  whatWentWrong: string
  suggestedChange: string
}

/** Full route response shape — also covers the fail-safe/no-signal cases. */
export interface ClaraFeedbackReviewResult {
  generatedAt: string
  feedbackCount: number
  downCount: number
  themes: ClaraFeedbackReviewTheme[]
  topFixes: string[]
  note?: string
  error?: string
}

/** Concatenates a session's user-role turns into one caller transcript. */
export function buildCallerTranscript(session: ReviewSessionLike | undefined): string {
  if (!session?.turns?.length) return ''
  return session.turns
    .filter((t) => t?.role === 'user' && typeof t.text === 'string' && t.text.trim())
    .map((t) => t.text.trim())
    .join('\n')
}

/**
 * Joins down-vote feedback rows to their session transcript and produces the
 * compact analysis input the feedback-review Bedrock prompt consumes.
 * Filters to verdict === 'down' — up-votes carry no corrective signal.
 * "What Clara classified" comes from the feedback row itself (it already
 * snapshots consult_type/urgency_level/stat_level/gate0_fired at the time the
 * tester voted — see ClaraDecisionCard.submit()), not a second lookup into
 * the session's turn data.
 */
export function buildFeedbackReviewInputs(
  feedback: ClaraFeedbackRow[],
  sessions: ReviewSessionLike[],
): ClaraFeedbackReviewInput[] {
  const sessionsById = new Map(sessions.map((s) => [s.id, s]))
  return feedback
    .filter((fb) => fb.verdict === 'down')
    .map((fb) => ({
      sessionId: fb.session_id,
      transcript: buildCallerTranscript(fb.session_id ? sessionsById.get(fb.session_id) : undefined),
      claraSaid: {
        consultType: fb.consult_type,
        urgencyLevel: fb.urgency_level,
        statLevel: fb.stat_level,
        gate0Fired: fb.gate0_fired,
      },
      testerReason: fb.reason,
      testerCorrectedType: fb.corrected_consult_type,
      tester: fb.created_by,
      at: fb.created_at,
    }))
}

/** No-signal shape returned when there are zero down-votes — never calls Bedrock (no-noise/no-cost). */
export function buildNoDownvoteReviewResult(feedbackCount: number, generatedAt: string): ClaraFeedbackReviewResult {
  return {
    generatedAt,
    feedbackCount,
    downCount: 0,
    themes: [],
    topFixes: [],
    note: 'No thumbs-down feedback to review.',
  }
}
