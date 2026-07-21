/**
 * Synthetic patient agent (Historian Validation Suite Task 6).
 *
 * Two concerns, deliberately separated:
 *   1. PURE prompt assembly (buildPatientSystemPrompt, toBedrockMessages) —
 *      plain data-in/data-out, no I/O, TDD-covered in
 *      tests/historian-eval/patientAgent.test.ts.
 *   2. A thin Bedrock call wrapper (generatePatientReply) — the only
 *      impure piece, with its `invoke` dependency injectable for tests
 *      (defaults to the real `invokeBedrock` from '@/lib/bedrock').
 *
 * Persona conditioning is loaded via personaFixtures.ts's
 * `loadPersonaProfile` (re-exported below for a single import site in the
 * driver script) — demographics + historyResponses + structuredHistory, per
 * the task brief. The patient agent must answer questions the live
 * historian asks that are NOT covered by the pre-scripted historyResponses
 * pairs (the historian may ask in a different order or different words),
 * so structuredHistory (the physician-authored ground-truth facts) is the
 * authoritative source the model is told to stay consistent with for any
 * question — historyResponses is presented only as reference phrasing.
 */
import { invokeBedrock } from '@/lib/bedrock'
import { loadPersonaProfile, type PersonaProfile } from '@/lib/historian/eval/personaFixtures'

export { loadPersonaProfile, type PersonaProfile }

/**
 * One turn in the live conversation, from the transcript's point of view:
 * role 'assistant' = the historian (Henry) speaking TO the patient; role
 * 'user' = the patient speaking. Mirrors HistorianTranscriptEntry.role
 * exactly so the driver script can pass its accumulated transcript straight
 * through without remapping.
 */
export interface PatientAgentTurn {
  role: 'assistant' | 'user'
  text: string
}

function humanizeFactKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Pure. Builds the Bedrock system prompt for the synthetic patient agent
 * from a persona profile. Same input always produces the same output.
 */
export function buildPatientSystemPrompt(profile: PersonaProfile): string {
  const lines: string[] = []

  lines.push(
    "You are role-playing a patient in a voice intake interview with a neurology clinic's AI medical historian named Henry.",
  )
  lines.push('')
  lines.push(
    'You are the patient described below. Answer ONLY what was asked. Respond in 1-3 conversational ' +
      'sentences, using natural, everyday language a real patient would use — not clinical or medical jargon ' +
      '(say "my speech is slurred", not "dysarthria"). Do not volunteer your whole history at once — reveal ' +
      'information only in response to what Henry actually asks. Stay consistent with the persona facts below: ' +
      'never contradict them, and never invent a new symptom, diagnosis, or red flag that is not implied by them.',
  )
  lines.push('')
  lines.push(
    'Never break character. Never say or reveal that you are an AI, a language model, or part of a test or ' +
      'simulation — even if asked directly. You are simply the patient.',
  )
  lines.push('')

  lines.push('PATIENT PROFILE')
  const demo = profile.demographics
  if (demo.name) lines.push(`Name: ${demo.name}`)
  if (demo.age != null) lines.push(`Age: ${demo.age}`)
  if (demo.sex) lines.push(`Sex: ${demo.sex}`)
  if (demo.dateOfBirth) lines.push(`Date of birth: ${demo.dateOfBirth}`)
  if (profile.chiefComplaint) lines.push(`Reason for visit: ${profile.chiefComplaint}`)
  lines.push('')

  const facts = Object.entries(profile.structuredHistory).filter(
    ([, value]) => typeof value === 'string' && value.trim().length > 0,
  )
  if (facts.length > 0) {
    lines.push(
      'GROUND-TRUTH CLINICAL FACTS (stay consistent with these for ANY question Henry asks, even ones not ' +
        'covered by the example phrasing below):',
    )
    for (const [key, value] of facts) {
      lines.push(`- ${humanizeFactKey(key)}: ${value}`)
    }
    lines.push('')
  }

  if (profile.historyResponses.length > 0) {
    lines.push(
      'EXAMPLE PHRASING (reference only — Henry may ask these in a different order or in different words; ' +
        'answer what he actually asks, not this script verbatim):',
    )
    for (const qa of profile.historyResponses) {
      lines.push(`Q: ${qa.questionPattern}`)
      lines.push(`A: ${qa.response}`)
    }
    lines.push('')
  }

  lines.push(
    'If Henry asks about something not covered above, answer plausibly and consistently with everything ' +
      'already established rather than reflexively saying "I don\'t know" — but do not invent major new red-flag ' +
      'symptoms. If Henry asks an open-ended question, answer the specific thing asked and let him ask follow-ups ' +
      'rather than dumping your entire history at once.',
  )

  return lines.join('\n')
}

/**
 * Pure. Maps the driver's transcript-shaped conversation onto Bedrock
 * Messages-API roles from the PATIENT AGENT's own point of view: what the
 * historian said (transcript role 'assistant') is input TO the patient
 * agent, so it becomes Bedrock role 'user'; what the patient said
 * previously (transcript role 'user') is the patient agent's OWN prior
 * output, so it becomes Bedrock role 'assistant'. Getting this backwards
 * would have the model imitate Henry instead of answering him.
 */
export function toBedrockMessages(
  conversation: PatientAgentTurn[],
): Array<{ role: 'user' | 'assistant'; content: string }> {
  return conversation.map((turn) => ({
    role: turn.role === 'assistant' ? 'user' : 'assistant',
    content: turn.text,
  }))
}

export interface GeneratePatientReplyOptions {
  profile: PersonaProfile
  /** Conversation so far, in transcript role convention (see PatientAgentTurn). */
  conversation: PatientAgentTurn[]
  /** Injectable for tests. Defaults to the real invokeBedrock. */
  invoke?: (opts: {
    system: string
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
  }) => Promise<{ text: string }>
  /** Defaults to invokeBedrock's own default (BEDROCK_MODEL, Sonnet 4.6). */
  model?: string
}

/**
 * Bedrock call wrapper — the only impure piece of this module. Persona
 * answers are free text, so a plain invokeBedrock call is sufficient (no
 * schema-forced tool call needed, unlike the clinical evaluators).
 */
export async function generatePatientReply(options: GeneratePatientReplyOptions): Promise<string> {
  const invoke = options.invoke ?? ((opts) => invokeBedrock({ ...opts, ...(options.model ? { model: options.model } : {}), maxTokens: 300 }))
  const system = buildPatientSystemPrompt(options.profile)
  const messages = toBedrockMessages(options.conversation)
  const result = await invoke({ system, messages })
  return result.text.trim()
}
