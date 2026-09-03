/**
 * Text-mode "Henry" for the live simulator conversation.
 *
 * The production historian is a voice agent (OpenAI Realtime) with a 3-tool
 * surface. For the browser-orchestrated simulator we run Henry as a STATELESS
 * text turn instead: same historian system prompt (so the questioning
 * behaviour is representative), but tool-free — the differential is produced
 * afterwards by the eval pipeline scoring the finished transcript, so Henry
 * never needs save_interview_output during the sim.
 *
 * This module is PURE (prompt assembly + message mapping + done-detection) so
 * it is unit-testable without any Bedrock call. The impure Bedrock call lives
 * in the /api/ai/historian/sim/henry-turn route.
 */

import { buildHistorianSystemPrompt } from '@/lib/historianPrompts'
import type { HistorianSessionType, HistorianTranscriptEntry } from '@/lib/historianTypes'

/** Henry emits this token when he judges the interview complete. */
export const SIM_END_TOKEN = '<<END>>'

/**
 * Build the text-mode Henry system prompt: the real historian prompt plus a
 * SIMULATION-MODE override that removes the tool surface and defines the
 * end-of-interview signal. The override is appended LAST so it wins over the
 * tool instructions embedded earlier in the base prompt.
 */
export function buildSimHenrySystemPrompt(
  sessionType: HistorianSessionType,
  referralReason?: string,
): string {
  const base = buildHistorianSystemPrompt(sessionType, referralReason)
  return (
    base +
    `\n\nSIMULATION MODE — TEXT INTERVIEW (this section OVERRIDES any tool instructions above):\n` +
    `- You have NO tools available. Do NOT call save_interview_output, scale_step, or query_evidence, and do not mention tools.\n` +
    `- This is a typed conversation. Ask ONE question per message, in plain language, exactly as you would in a spoken interview.\n` +
    `- Do not restate or summarize the patient's answers back to them; go straight to your next question.\n` +
    `- When you have gathered a complete history, send one brief warm closing message and put the token ${SIM_END_TOKEN} on its own final line.\n` +
    `- NEVER output ${SIM_END_TOKEN} until you are genuinely finished — it ends the interview immediately.`
  )
}

/** True once Henry has signalled the interview is complete. */
export function isSimInterviewDone(text: string): boolean {
  return typeof text === 'string' && text.includes(SIM_END_TOKEN)
}

/** Remove the end token (and tidy whitespace) for display/storage. */
export function stripSimEndToken(text: string): string {
  return (text || '').split(SIM_END_TOKEN).join('').trim()
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Map the shared transcript (role 'assistant' = Henry, role 'user' = patient)
 * to Anthropic/Bedrock messages from HENRY's point of view: Henry's turns are
 * 'assistant', the patient's are 'user'.
 *
 * Anthropic requires the first message to be role 'user' and the roles to
 * alternate. A real transcript starts with Henry (assistant), so we always
 * prepend a synthetic 'user' kickoff — this both satisfies the first-message
 * rule and, on an empty transcript, is what prompts Henry's opening greeting.
 */
export function toHenryMessages(transcript: Pick<HistorianTranscriptEntry, 'role' | 'text'>[]): ChatMessage[] {
  const kickoff: ChatMessage = {
    role: 'user',
    content: '[The interview is starting. Greet the patient warmly and ask your first question.]',
  }
  const mapped: ChatMessage[] = transcript.map((t) => ({
    role: t.role === 'assistant' ? 'assistant' : 'user',
    content: t.text,
  }))
  return [kickoff, ...mapped]
}
