/** Reuse the evaluator's disease-name lexicon, not its assertion-only matcher:
 * even questions must not name diagnoses here. Migraine (including with aura)
 * is blocked consistently with that lexicon; plain symptom vocabulary is allowed.
 * Supplement its five syndrome groups with conservative common diagnosis terms.
 * This lexical screen is not a complete clinical-language validator.
 */
import { SYNDROME_DISEASE_NAMES } from '@/lib/historian/eval/rubric'

export interface AttendingGap {
  topic: string
  question: string
  why: string
}

const terms = [
  ...Object.values(SYNDROME_DISEASE_NAMES).flat(),
  'MS', 'Parkinson', 'Parkinsons', 'ALS', 'myasthenia', 'Guillain',
  'tumor', 'tumour', 'cancer', 'aneurysm', 'meningitis', 'encephalitis',
]
const diagnosisPattern = new RegExp(`\\b(?:${terms.map(term =>
  term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
).join('|')})\\b`, 'i')

export function sanitizeAttendingGaps(raw: unknown): AttendingGap[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
  const gaps = (raw as Record<string, unknown>).gaps
  if (!Array.isArray(gaps)) return []
  const clean: AttendingGap[] = []
  const seen = new Set<string>()
  for (const gap of gaps) {
    if (clean.length === 3) break
    if (!gap || typeof gap !== 'object' || Array.isArray(gap)) continue
    const { topic, question, why } = gap as Record<string, unknown>
    if (typeof topic !== 'string' || typeof question !== 'string' || typeof why !== 'string') continue
    const entry = { topic: topic.trim(), question: question.trim(), why: why.trim() }
    if (!entry.topic || !entry.question || !entry.why || entry.question.length > 160) continue
    if (diagnosisPattern.test(entry.topic) || diagnosisPattern.test(entry.question)) continue
    const key = entry.topic.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    clean.push(entry)
  }
  return clean
}
