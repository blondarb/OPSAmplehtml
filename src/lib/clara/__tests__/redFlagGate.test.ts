import { describe, it, expect } from 'vitest'
import { detectRedFlag, isSubacuteStrokeReport } from '@/lib/clara/redFlagGate'

describe('detectRedFlag — positives (must fire)', () => {
  const cases: Array<[string, string]> = [
    ['his face is drooping and his arm feels weak', 'stroke'],
    ['sudden slurred speech since this morning', 'stroke'],
    ['she can\'t lift her arm and one side of her body is numb', 'stroke'],
    ['I think I am having a stroke right now', 'stroke'],
    ['he suddenly lost vision in one eye', 'stroke'],
    ['patient is having a seizure and it will not stop', 'seizure'],
    ['seizure lasting more than 5 minutes', 'seizure'],
    ['back to back seizures without waking up in between', 'seizure'],
    ['this is status epilepticus', 'seizure'],
    ['worst headache of my life, came on all of a sudden', 'headache'],
    ['sudden severe headache, thunderclap onset', 'headache'],
    ['patient says he wants to kill himself', 'self_harm'],
    ['I want to die, I can\'t take it anymore', 'self_harm'],
    ['she has been talking about suicide', 'self_harm'],
    ['he said he wants to hurt himself', 'self_harm'],
    ['patient is unresponsive and not breathing', 'acute_emergency'],
    ['he is unconscious and there is a lot of bleeding', 'acute_emergency'],
    ['he is postictal now and not protecting his airway', 'acute_emergency'],
    ['the patient is apneic and turning blue', 'acute_emergency'],
    ['he stopped breathing for about a minute', 'acute_emergency'],
    ['we have not been able to rouse him', 'acute_emergency'],
    ['she is unrousable and desaturating', 'acute_emergency'],
    ['we cannot wake him up', 'acute_emergency'],
    ['he had a cluster of seizures overnight', 'seizure'],
    ['there was a seizure cluster this morning', 'seizure'],
  ]

  it.each(cases)('fires on: %s', (text) => {
    const result = detectRedFlag(text)
    expect(result.isRedFlag).toBe(true)
    expect(result.category).not.toBeNull()
    expect(result.matchedTerms.length).toBeGreaterThan(0)
  })

  it('reports the expected category for a clear stroke phrase', () => {
    const result = detectRedFlag('his face is drooping and his arm feels weak')
    expect(result.category).toBe('stroke')
  })

  it('reports the expected category for a clear seizure phrase', () => {
    const result = detectRedFlag('patient is having a seizure and it will not stop')
    expect(result.category).toBe('seizure')
  })

  it('reports the expected category for self-harm', () => {
    const result = detectRedFlag('patient says he wants to kill himself')
    expect(result.category).toBe('self_harm')
  })

  it('is case-insensitive', () => {
    expect(detectRedFlag('HIS FACE IS DROOPING').isRedFlag).toBe(true)
  })
})

describe('detectRedFlag — negatives (must NOT fire)', () => {
  const clearNegatives = [
    'the patient would like to schedule a follow-up visit next month',
    'she has a mild headache that started a few days ago',
    'he has chronic lower back pain, stable for years',
    'just calling to confirm the appointment time',
    'his tremor is about the same as last visit',
    'reviewing the CT scan results, no acute findings',
    'patient is doing well on his current medication',
    'this is a routine outpatient consult for memory concerns',
  ]

  it.each(clearNegatives)('does not fire on: %s', (text) => {
    const result = detectRedFlag(text)
    expect(result.isRedFlag).toBe(false)
    expect(result.category).toBeNull()
    expect(result.matchedTerms).toEqual([])
  })

  it('returns a safe empty result for empty input', () => {
    expect(detectRedFlag('')).toEqual({ isRedFlag: false, category: null, matchedTerms: [] })
  })
})

// ---------------------------------------------------------------------------
// Subacute-stroke deferral (Sam's live finding, 2026-07-12): "LKW two days
// ago" was still escalating as a code stroke. Positive cases are built from
// the VERBATIM cumulative transcripts of that day's live test sessions
// (synthetic test data). Deferral = Gate 0 hands the case to the rulebook
// (stroke >24h → NON_EMERGENT STAT 2); it never means "not a red flag".
// ---------------------------------------------------------------------------

describe('isSubacuteStrokeReport — defers (rulebook decides the tier)', () => {
  // Sam's exact session, cumulative caller transcript incl. "no hemorrhage"
  // (which matches the acute_emergency bank verbatim and must be treated as
  // the negated imaging idiom it is).
  const samsCase =
    'uh this is a fifty five year old right handed male past medical history of hypertension ' +
    'hyperlipidemia and diabetes who presents with two days of right sided weakness left gaze ' +
    'preference and slurred speech. his ct of the head shows a left m c a stroke with no ' +
    'hemorrhage cta head and neck shows a left m one occlusion ct perfusion shows no mismatch ' +
    'on perfusion. his name is john smith. he is not on any blood thinners. he is in the ed. two days ago'

  const cases = [
    samsCase,
    'slurred speech and right sided weakness for the past three days, stable since admission',
    'facial droop noticed two days ago, last known well three days prior, ct without hemorrhage',
    'weak arm since last week, no changes, family asking about follow-up',
  ]

  it.each(cases)('defers on explicitly multi-day presentation: %s', (text) => {
    expect(detectRedFlag(text).isRedFlag).toBe(true) // still a stroke-bank hit
    expect(isSubacuteStrokeReport(text)).toBe(true) // ...but defers to the rulebook
  })
})

describe('isSubacuteStrokeReport — keeps the floor (must NOT defer)', () => {
  const cases = [
    // No explicit timeframe at all — unknown timing stays gated.
    'his face is drooping and his arm feels weak',
    // Hour-scale / same-day phrasing.
    'sudden slurred speech since this morning',
    'slurred speech that started about thirty minutes ago',
    // "Yesterday" is ambiguous (<48h) — stays gated.
    'slurred speech since yesterday',
    // Multi-day frame BUT acute/worsening language present.
    'two days of right sided weakness but suddenly worse today',
    'weakness for three days and now progressing with new deficit',
    // Verbatim from the 7/12 EMS session: explicit code-stroke activation.
    'history of afib supposed to be on xarelto brought in by e m s for code stroke with right sided ' +
      'visual field deficit no grip strength and right sided facial droop he woke this morning',
    // Wake-up stroke phrasing.
    'facial droop, wake-up stroke, last seen normal two days ago per family',
    // Other-bank hits keep the floor even with a multi-day frame.
    'two days of slurred speech and now he is unresponsive',
    'two days of weakness and she is still seizing',
    'weak arm for two weeks and he says he wants to kill himself',
    // ACTIVE bleeding (not the negated imaging idiom).
    'two days of slurred speech and there is a lot of bleeding from the head wound',
    // Not a stroke-bank category at all.
    'this is status epilepticus',
  ]

  it.each(cases)('keeps the deterministic floor on: %s', (text) => {
    expect(isSubacuteStrokeReport(text)).toBe(false)
  })

  it('is safe on empty input', () => {
    expect(isSubacuteStrokeReport('')).toBe(false)
  })
})
