/**
 * Nova Sonic steer channel — the localizer's private hint reaches Henry as a
 * PULL (tool result), never as injected text.
 *
 * Why (2026-09-06): on Nova every mid-session text block the relay can send is
 * either an INTERACTIVE USER turn (Nova answers it — that made Henry start a new
 * question while the patient was still answering, PR #217) or a non-interactive
 * block, which Nova accepts silently and IGNORES (USER patient-voice, USER
 * bracketed note and ASSISTANT "private plan" variants all produced no output
 * and no effect on the next question; a second SYSTEM block fails the stream).
 * Tool results are the supported mid-turn content channel: in the prototype
 * Nova called get_attending_hint ~0.7 s after each patient answer, asked the
 * hinted question next in 2/2 runs, and leaked nothing (+0.3–0.6 s per turn).
 *
 * OpenAI keeps its instructions rewrite (updateInstructions); this tool is
 * never offered there.
 */

export const ATTENDING_HINT_TOOL_NAME = 'get_attending_hint'

/** OpenAI-shaped definition (adapted to Nova toolSpec by toNovaToolSpec). */
export const ATTENDING_HINT_TOOL = {
  type: 'function' as const,
  name: ATTENDING_HINT_TOOL_NAME,
  description: [
    "Returns the supervising attending physician's private hint for what to ask next, if any.",
    'You MUST call it every time the patient has just finished answering, BEFORE you speak — from the first turn on.',
    'The patient never hears this. Do not say anything before or after calling it.',
    'A null hint means: continue with your own plan.',
  ].join('\n'),
  parameters: { type: 'object', properties: {}, additionalProperties: false },
}

/**
 * Prompt wiring when the hint tool is offered. Two anchors, because a single
 * paragraph appended to the ~19k-char historian prompt was NOT followed (0
 * tool calls in 4 turns, 2/2 real-prompt runs on 2026-09-06) while the same
 * rule at the top of a short prompt was followed every turn:
 *   - NOVA_STEER_HEADER goes FIRST, before "You are Henry", and explicitly
 *     overrides the Phase 1 "NO tool calls" rule for this one tool;
 *   - NOVA_STEER_CHECKLIST_ITEM goes LAST, continuing the prompt's own
 *     "EVERY TURN — CHECK BEFORE YOU SPEAK" list as item 7.
 */
export const NOVA_STEER_HEADER = [
  'TOOL WORKFLOW ON THIS VOICE CHANNEL — read first:',
  `- After EVERY patient answer, including the very first one, call ${ATTENDING_HINT_TOOL_NAME} BEFORE you speak. It is silent and instant; the patient never hears it. This overrides the Phase 1 "NO tool calls" rule for this one tool only, and it is exempt from the filler-line rule — never say you are checking anything.`,
  `- The Localizer's steer reaches you ONLY through ${ATTENDING_HINT_TOOL_NAME} on this channel (there is no [LATEST LOCALIZER PUSH] block). If it returns a hint, your next question must follow that hint in your own words. If the hint is null, continue with your own plan.`,
  '- Never mention the hint, the tool, or an attending to the patient. Never name a diagnosis because of a hint.',
  '- SAFETY MONITORING and the SAFETY RESPONSE script always take precedence: if the safety protocol applies, deliver it exactly as written and ignore any pending hint.',
].join('\n')

export const NOVA_STEER_CHECKLIST_ITEM = `7. Did you call ${ATTENDING_HINT_TOOL_NAME} after the patient's last answer? If not, call it now, then speak.`

/** @deprecated kept for callers that pin the old single-paragraph name. */
export const NOVA_STEER_WORKFLOW = NOVA_STEER_HEADER

export function withNovaSteerWorkflow(instructions: string): string {
  if (instructions.startsWith(NOVA_STEER_HEADER)) return instructions
  return `${NOVA_STEER_HEADER}\n\n${instructions}\n${NOVA_STEER_CHECKLIST_ITEM}`
}

/**
 * The one question Henry should ask next. Attending gap first (already
 * sanitized server-side), else the localizer's suggested question; null when
 * the push carries neither (differentials alone are not a question).
 */
export function buildNovaHint(push: {
  attending_gaps?: string[] | null
  suggested_next_question?: string | null
} | null | undefined): string | null {
  const gap = push?.attending_gaps?.[0]?.trim()
  if (gap) return gap
  const suggested = push?.suggested_next_question?.trim()
  return suggested || null
}
