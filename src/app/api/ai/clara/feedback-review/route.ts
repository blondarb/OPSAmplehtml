/**
 * Clara voice test — feedback review route.
 *
 * SUGGEST-ONLY. Analyzes accumulated beta-tester 👎 feedback (clara_test_feedback,
 * migrations/049) joined to its call transcript (clara_test_sessions,
 * migrations/048) and asks Bedrock to cluster the disagreements into themes
 * with concrete suggested edits to Clara's voice script/rulebook. This route
 * NEVER writes to claraRulebook.ts or any prompt file — the output is
 * advisory only, for a human (Steve) to review and apply by hand. See the
 * system prompt below, which states this explicitly, and
 * src/lib/clara/feedbackReview.ts for the pure join/build helpers (unit
 * tested independently of this route's DB/Bedrock calls).
 *
 * On-demand only for now (the UI's "Regenerate" button re-fetches this
 * route) — scheduled 6-12h auto-generation is a future phase.
 *
 * Gated the same way as the other /api/ai/clara/* routes: this sits outside
 * middleware's Cognito check, so it independently re-verifies the Clara
 * test-gate cookie (see src/lib/clara/testGate.ts).
 *
 * R&D-only, synthetic data — never PHI.
 */

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { from } from '@/lib/db-query'
import { invokeBedrockJSON, BEDROCK_MODEL } from '@/lib/bedrock'
import { runClinicalModelWithTimeout } from '@/lib/triage/modelTimeout'
import { CLARA_GATE_COOKIE, verifyGateToken } from '@/lib/clara/testGate'
import type { ClaraFeedbackRow } from '@/lib/clara/feedbackTypes'
import {
  buildFeedbackReviewInputs,
  buildNoDownvoteReviewResult,
  type ClaraFeedbackReviewResult,
  type ClaraFeedbackReviewTheme,
  type ReviewSessionLike,
} from '@/lib/clara/feedbackReview'

// Reasoning/clustering task, not per-turn classification — falls back to the
// shared default model (not the classify route's fast Haiku tier) unless
// overridden. Same env-override-with-shared-default pattern as
// EXTRACTION_MODEL in src/app/api/triage/extract/route.ts.
const FEEDBACK_REVIEW_MODEL = process.env.BEDROCK_CLARA_FEEDBACK_REVIEW_MODEL || BEDROCK_MODEL

const FEEDBACK_LIMIT = 200
const SESSION_LIMIT = 200
const REVIEW_TIMEOUT_MS = 45_000

const FEEDBACK_REVIEW_SYSTEM_PROMPT = `You are a clinical QA analyst reviewing beta-tester disagreements with Clara, an AI phone-triage agent that classifies neurology consult calls. Each input item is a call where a human tester listened to (or read) the call and voted thumbs-down on Clara's classification, along with what Clara said, what the tester thinks went wrong, and (sometimes) the corrected classification.

Your job: cluster these disagreements into THEMES — recurring root causes, not one-off restatements of each case. Common theme categories include timing / last-known-well parsing, STAT-tier boundary judgment, identifier (MRN/name) capture, routing-target selection, and tone/phrasing — but use whatever themes actually fit the data.

For each theme, propose a concrete, specific suggested change to Clara's voice script or rulebook (e.g. "add an explicit rule: X" or "reword the Y prompt line to Z") — not a vague direction like "improve accuracy."

CRITICAL: Your output is ADVISORY ONLY. It will be reviewed by a human (a Sevaro clinician) before any change is made to Clara's live prompts or rulebook. You are NEVER making the change yourself — you are only suggesting it for human review. Do not claim or imply that any change has already been applied.

Respond with ONLY valid JSON matching this exact shape, no markdown:
{
  "themes": [
    {
      "theme": "string — short theme name",
      "count": number,
      "exampleSessionIds": ["string"],
      "whatWentWrong": "string — 1-3 sentences describing the pattern",
      "suggestedChange": "string — a concrete, specific proposed edit to the voice script or rulebook"
    }
  ],
  "topFixes": ["string — prioritized list of the most impactful suggested changes, highest priority first"]
}`

async function requireGate(): Promise<NextResponse | null> {
  const cookieStore = await cookies()
  if (!verifyGateToken(cookieStore.get(CLARA_GATE_COOKIE)?.value)) {
    return NextResponse.json({ error: 'Not authorized for the Clara test surface.' }, { status: 401 })
  }
  return null
}

function sanitizeThemes(value: unknown): ClaraFeedbackReviewTheme[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((t): t is Record<string, unknown> => typeof t === 'object' && t !== null)
    .map((t) => ({
      theme: typeof t.theme === 'string' ? t.theme : 'Unlabeled theme',
      count: typeof t.count === 'number' ? t.count : 0,
      exampleSessionIds: Array.isArray(t.exampleSessionIds)
        ? t.exampleSessionIds.filter((s): s is string => typeof s === 'string')
        : [],
      whatWentWrong: typeof t.whatWentWrong === 'string' ? t.whatWentWrong : '',
      suggestedChange: typeof t.suggestedChange === 'string' ? t.suggestedChange : '',
    }))
}

function sanitizeTopFixes(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string')
}

/**
 * GET /api/ai/clara/feedback-review — on-demand AI review of accumulated
 * Clara feedback. Fail-safe: any DB/Bedrock/parse error still returns 200
 * with an empty-but-valid shape so the review UI degrades gracefully
 * instead of the page erroring out.
 */
export async function GET() {
  const generatedAt = new Date().toISOString()

  try {
    const gateError = await requireGate()
    if (gateError) return gateError

    const [feedbackRes, sessionsRes] = await Promise.all([
      from('clara_test_feedback').select('*').order('created_at', { ascending: false }).limit(FEEDBACK_LIMIT),
      from('clara_test_sessions').select('*').order('created_at', { ascending: false }).limit(SESSION_LIMIT),
    ])

    if (feedbackRes.error || sessionsRes.error) {
      console.error('[clara/feedback-review] fetch error:', feedbackRes.error || sessionsRes.error)
      return NextResponse.json({
        generatedAt,
        feedbackCount: 0,
        downCount: 0,
        error: (feedbackRes.error || sessionsRes.error)?.message || 'Failed to load feedback or sessions.',
        themes: [],
        topFixes: [],
      } satisfies ClaraFeedbackReviewResult)
    }

    const feedback: ClaraFeedbackRow[] = feedbackRes.data || []
    const sessions: ReviewSessionLike[] = sessionsRes.data || []
    const feedbackCount = feedback.length
    const downVoteInputs = buildFeedbackReviewInputs(feedback, sessions)

    if (downVoteInputs.length === 0) {
      return NextResponse.json(buildNoDownvoteReviewResult(feedbackCount, generatedAt))
    }

    try {
      const { parsed } = await runClinicalModelWithTimeout({
        label: 'clara_feedback_review',
        timeoutMs: REVIEW_TIMEOUT_MS,
        operation: (signal) =>
          invokeBedrockJSON<{ themes?: unknown; topFixes?: unknown }>({
            system: FEEDBACK_REVIEW_SYSTEM_PROMPT,
            messages: [{ role: 'user', content: JSON.stringify(downVoteInputs) }],
            model: FEEDBACK_REVIEW_MODEL,
            maxTokens: 3000,
            temperature: 0.3,
            signal,
          }),
      })

      return NextResponse.json({
        generatedAt,
        feedbackCount,
        downCount: downVoteInputs.length,
        themes: sanitizeThemes(parsed.themes),
        topFixes: sanitizeTopFixes(parsed.topFixes),
      } satisfies ClaraFeedbackReviewResult)
    } catch (modelErr) {
      // Fail-safe: never let a Bedrock/parse error 500 the review panel.
      console.error('[clara/feedback-review] model error:', modelErr)
      return NextResponse.json({
        generatedAt,
        feedbackCount,
        downCount: downVoteInputs.length,
        error: modelErr instanceof Error ? modelErr.message : 'Feedback review model call failed.',
        themes: [],
        topFixes: [],
      } satisfies ClaraFeedbackReviewResult)
    }
  } catch (error: unknown) {
    console.error('[clara/feedback-review] error:', error)
    return NextResponse.json({
      generatedAt,
      feedbackCount: 0,
      downCount: 0,
      error: error instanceof Error ? error.message : 'Failed to build Clara feedback review.',
      themes: [],
      topFixes: [],
    } satisfies ClaraFeedbackReviewResult)
  }
}
