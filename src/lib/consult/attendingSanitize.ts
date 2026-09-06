/** Diagnosis names are blocked even in questions; plain symptom vocabulary is
 * allowed (including seizures, migraines, headache, weakness, and memory loss).
 * Diagnosis phrases such as seizure disorder and cluster headache remain blocked.
 * Acronyms are case-sensitive; names are case-insensitive, with word boundaries.
 * This finite lexical screen is not a complete clinical-language validator.
 */
import { ATTENDING_DIAGNOSIS_NAMES, ATTENDING_DIAGNOSIS_ACRONYMS } from './attendingLexicon'

export interface AttendingGap {
  topic: string
  question: string
  why: string
}

const escapeTerm = (term: string) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const diagnosisPattern = new RegExp(`\\b(?:${ATTENDING_DIAGNOSIS_NAMES.map(escapeTerm).join('|')})\\b`, 'i')
const acronymPattern = new RegExp(`\\b(?:${ATTENDING_DIAGNOSIS_ACRONYMS.map(escapeTerm).join('|')})\\b`)
/** True when the text names a diagnosis (word-boundary lexicon + case-sensitive acronyms). Shared by the attending
 *  gaps and the localizer steer questions — both are patient-facing text that Henry may read verbatim. */
export const namesDiagnosis = (text: string) => diagnosisPattern.test(text) || acronymPattern.test(text)

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
    if (namesDiagnosis(entry.topic) || namesDiagnosis(entry.question)) continue
    const key = entry.topic.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    clean.push(entry)
  }
  return clean
}
