/**
 * Deterministic secondary backstop for explicit patient-stated safety phrases.
 * The model prompt remains the broader semantic safety layer; this allowlist
 * deliberately does not infer emergencies from sounds, tone, or vague wording.
 */
const PATIENT_STATED_ACTIVE_SAFETY_PHRASES = [
  'kill myself',
  'want to die',
  'hurt myself',
  'end my life',
  'suicide',
  'suicidal',
  'self-harm',
  "don't want to live",
  "don't want to be here anymore",
  'hurt someone',
  'kill someone',
  'worst headache of my life right now',
  "can't move my arm right now",
  'cannot move my arm right now',
  "can't move my leg right now",
  'cannot move my leg right now',
  "i'm having a seizure",
  'i am having a seizure',
  "can't breathe",
  'cannot breathe',
] as const

function normalizedSpokenText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/[^a-z0-9'\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function hasDeterministicActiveSafetyTrigger(text: string): boolean {
  const normalized = normalizedSpokenText(text)
  return PATIENT_STATED_ACTIVE_SAFETY_PHRASES.some((phrase) => normalized.includes(phrase))
}
