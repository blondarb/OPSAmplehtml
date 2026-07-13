import { describe, it, expect } from 'vitest'
import { detectRedFlag, isSubacuteStrokeReport, evaluateStrokeDowngradeGuard } from '@/lib/clara/redFlagGate'

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
    // Stroke-alert ACTIVATION language (2026-07-13, Steve live test): the floor
    // must fire on how a stroke is actually called in, not just symptom
    // descriptions. "code stroke"/"stroke alert" previously lived only in the
    // subacute-deferral override and never fired the bank at all.
    ['i need to call an emergency stroke consult', 'stroke'],
    ['we have a stroke alert in the ER', 'stroke'],
    ['this is a code stroke', 'stroke'],
    ['can you activate a stroke for room 4', 'stroke'],
    ['ED calling about a possible stroke', 'stroke'],
    ['acute stroke workup in progress', 'stroke'],
    // Lateralized weakness/numbness in NOUN form — the natural hemiparesis
    // description the adjacency-only "weak arm" patterns all missed.
    ['patient has right-sided weakness', 'stroke'],
    ['left sided weakness and numbness since this morning', 'stroke'],
    ['sudden weakness in his right arm', 'stroke'],
    ['numbness in the left leg', 'stroke'],
    ['his right arm is weak and his left leg went numb', 'stroke'],
    ['one-sided facial droop', 'stroke'],
    // Wake-up / found-down stroke (2026-07-13 red-team): "woke up with weakness"
    // fired nothing and the LLM then downgraded it off a stray "days ago". LKW
    // is bedtime -> potentially thrombectomy-eligible -> floor hit.
    ['he woke up this morning with weakness', 'stroke'],
    ['woke up with left arm weakness and slurred speech', 'stroke'],
    ['found him down on the floor unable to speak', 'stroke'],
    // Post-thrombolytic / post-thrombectomy deterioration = possible
    // hemorrhagic conversion (code-level), previously caught by the LLM only.
    ['we gave tpa this morning and now he is vomiting and much more confused', 'acute_emergency'],
    ['post thrombectomy yesterday, now new weakness on the opposite side', 'acute_emergency'],
    ['he got thrombolytics an hour ago and now has a severe headache', 'acute_emergency'],
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

  // The widened stroke-activation / lateralized-weakness patterns (2026-07-13)
  // must not start firing on benign chronic or scheduling language.
  const activationNegatives = [
    'following up after his stroke rehab last year',
    'history of stroke, here for a routine medication refill',
    'he had a stroke five years ago, doing well now',
    'wants to discuss stroke prevention and diet',
    'her arm feels a little stiff after the workout',
    // Wake-up / post-tPA patterns must require a co-occurring deficit / decline:
    'he woke up feeling fine and rested',
    'she woke up and ate breakfast this morning',
    'post thrombectomy yesterday, no new deficits, recovering well',
    'patient had tpa last month, here for a routine follow up',
  ]
  it.each(activationNegatives)('does not fire on benign stroke-adjacent phrasing: %s', (text) => {
    expect(detectRedFlag(text).isRedFlag).toBe(false)
  })
})

// Steve's 2026-07-13 live bypass session (36fc3af7): an explicit "emergency
// stroke consult" with lateralized weakness produced gate0Fired=false on every
// turn — the emergent call rode entirely on the LLM. The floor must now ENGAGE
// on that transcript (then defer the 2-day timing to the rulebook, which is the
// correct subacute behavior).
describe('Gate 0 — stroke-alert bypass regression (Steve 2026-07-13)', () => {
  const cumulative =
    'i need to call an emergency stroke consult. mark jones medical record number five nine three eight ' +
    'two one in e r. room twenty three. two days ago. yeah he has got some weakness that has been going ' +
    'on in the right arm and leg'

  it('fires the deterministic floor on the stroke-alert activation', () => {
    const r = detectRedFlag(cumulative)
    expect(r.isRedFlag).toBe(true)
    expect(r.category).toBe('stroke')
  })

  it('defers the tier to the rulebook because LKW is explicitly 2 days', () => {
    // Floor engages, then hands the subacute (>24h) tiering to the rulebook —
    // the designed behavior, not a hard emergent lock.
    expect(isSubacuteStrokeReport(cumulative)).toBe(true)
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

// Stroke-downgrade safety guard (red-team 2026-07-13): the deterministic
// backstop that vetoes an LLM stroke downgrade the prompt couldn't reliably
// prevent. Escalate-only — fires only on consultType 'non-emergent' + stroke
// context, and only forces EMERGENT (never the reverse).
describe('evaluateStrokeDowngradeGuard', () => {
  const veto = (t: string) => evaluateStrokeDowngradeGuard(t, 'non-emergent').forceEmergent

  it('VETOES an unsafe stroke downgrade (red-team stable failures)', () => {
    expect(veto('weakness, um, i want to say a couple days back, hard to say')).toBe(true) // hedged
    expect(veto('right sided weakness, he thinks it was a couple days ago, poor historian')).toBe(true) // hedged/2nd-hand
    expect(veto('weakness that comes and goes, here yesterday gone today back again now')).toBe(true) // fluctuating
    expect(veto('probably nothing, a little weakness a couple days, family not sure when')).toBe(true) // no confident onset
    expect(veto('he woke up this morning with weakness, felt off a couple days ago')).toBe(true) // wake-up
    expect(veto('weakness two or three days ago but this morning it clearly got worse')).toBe(true) // worsening
    expect(veto('numbness for a couple days')).toBe(true) // no confident+stable >24h stated
  })

  it('PERMITS a clean, confident, stable >24h downgrade (no over-triage of real subacute)', () => {
    expect(veto('symptoms started two days ago, right sided weakness stable no change since')).toBe(false)
    expect(veto('stroke consult, three days ago, completely stable, no changes since')).toBe(false)
    expect(veto('witnessed onset one week ago, deficit unchanged, follow up')).toBe(false)
  })

  it('NEVER touches other consult types or an already-emergent result', () => {
    expect(evaluateStrokeDowngradeGuard('CT return, stroke imaging done, no new findings', 'ct-return').forceEmergent).toBe(false)
    expect(evaluateStrokeDowngradeGuard('had a stroke last week, routine follow up', 'rounding').forceEmergent).toBe(false)
    expect(evaluateStrokeDowngradeGuard('routine EEG read, remote stroke history', 'eeg-read').forceEmergent).toBe(false)
    expect(evaluateStrokeDowngradeGuard('resolved stroke symptoms three days ago, outpatient', 'outpatient').forceEmergent).toBe(false)
    expect(evaluateStrokeDowngradeGuard('emergency stroke consult, weakness 30 minutes ago', 'emergent').forceEmergent).toBe(false)
  })

  it('does not fire without stroke context (a non-stroke non-emergent call is untouched)', () => {
    expect(veto('just calling to reschedule his appointment for next week, not sure when')).toBe(false)
  })
})
