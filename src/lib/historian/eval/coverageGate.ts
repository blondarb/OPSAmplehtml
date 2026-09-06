import type { HistorianTranscriptEntry } from '@/lib/historianTypes'
import { computeCriticalCoverage } from './deterministicChecks'
import { loadRubric } from './rubric'

export const BACKGROUND_ITEMS = [
  { id: 'background_medications', label: 'your current medications and their doses', hints: ['medication', 'medicine', 'prescri', 'what do you take', 'taking anything', 'any pills', 'on any medication', 'what medicines', 'prescriptions', 'supplements'] },
  { id: 'background_medication_details', label: 'your medication doses and when you started them', hints: ['dose', 'milligram', ' mg', 'how often do you take', 'when did you start', 'who prescrib'] },
  { id: 'background_alcohol', label: 'alcohol use', hints: ['drink', 'drinks', 'alcohol', 'beer', 'wine', 'liquor'] },
  { id: 'background_family_history', label: 'family history of neurological conditions', hints: ['family', 'relatives', 'parents', 'siblings', 'mom or dad', 'mother', 'father', 'runs in the family', 'anyone in your family', 'brother', 'sister'] },
  { id: 'background_social_occupation', label: 'your work and tobacco use', hints: ['work', 'job', 'smoke', 'smoking', 'tobacco'] },
] as const

export function computeCoverageGaps(transcript: HistorianTranscriptEntry[], chiefComplaint?: string) {
  const { criticalQuestions } = loadRubric({ chiefComplaint })
  const coverage = computeCriticalCoverage(transcript, criticalQuestions)
  const assistantText = transcript.filter(turn => turn.role === 'assistant').map(turn => turn.text).join('\n').toLowerCase()
  const backgroundGaps = BACKGROUND_ITEMS
    .filter(item => !item.hints.some(hint => assistantText.includes(hint)))
    .map(({ id, label }) => ({ id, label }))
  const rubricGaps = coverage.filter(entry => entry.hint_matched === false).map(entry => ({
    id: entry.rubric_id,
    label: criticalQuestions.find(question => question.id === entry.rubric_id)?.question || entry.rubric_id,
  }))
  return {
    // computeCriticalCoverage returns only severity === critical rubric items.
    unmatched: [...rubricGaps, ...backgroundGaps].slice(0, 3),
    checked: BACKGROUND_ITEMS.length + coverage.filter(entry => entry.hint_matched !== null).length,
  }
}
