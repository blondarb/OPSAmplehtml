import { describe, expect, it } from 'vitest'
import {
  createMrnCrosscheck,
  extractDigitCandidates,
  mentionsIdentifierKeyword,
} from '../mrnCrosscheck'

/** Values only, order-insensitive. */
const values = (text: string) => extractDigitCandidates(text).map((c) => c.value).sort()

describe('extractDigitCandidates — normalization symmetry', () => {
  // Real renderings captured live 7/12 (H1/H2 smoke tests + Kowalski verify).
  it('Transcribe-style plain digits', () => {
    expect(values('The MRN is 7331924')).toEqual(['7331924'])
  })
  it('Nova-style spaced digits', () => {
    expect(values('7 3 3 1 9 2 4')).toEqual(['7331924'])
  })
  it('Nova-style digit words', () => {
    expect(values('seven three three one nine two four')).toEqual(['7331924'])
  })
  it('Transcribe thousands-comma quantity + PIN mishear (H2 live)', () => {
    expect(values('Her PIN number is Alpha Bravo 24,590.')).toEqual(['24590'])
  })
  it('Nova words for the same alphanumeric identifier (H2 live)', () => {
    expect(values('alpha bravo two four five nine zero')).toEqual(['24590'])
  })
  it('spoken quantity form', () => {
    expect(values('twenty four thousand five hundred ninety')).toEqual(['24590'])
  })
  it('hyphenated compound', () => {
    expect(values('twenty-four thousand five hundred and ninety')).toEqual(['24590'])
  })
  it('grouped dictation with oh-as-zero', () => {
    expect(values('eighty three oh five ninety two')).toEqual(['830592'])
  })
  it('digit-by-digit with zero', () => {
    expect(values('eight three zero five nine two')).toEqual(['830592'])
  })
  it('keyword then words', () => {
    const c = extractDigitCandidates('MRN is four four two one')
    expect(c).toEqual([{ value: '4421', nearKeyword: true }])
  })
  it('year-style pairs concatenate', () => {
    expect(values('nineteen fifty eight')).toEqual(['1958'])
  })
  it('nearKeyword flags candidates just after MRN/FIN/PIN', () => {
    expect(extractDigitCandidates('the MRN is 7331924')[0].nearKeyword).toBe(true)
    expect(extractDigitCandidates('room 314 for the patient')[0].nearKeyword).toBe(false)
  })

  it('too-short distractors are ignored (durations, ages)', () => {
    expect(values('he arrived 20 minutes ago')).toEqual([])
    expect(values('she is 83 years old')).toEqual([])
  })
  it("standalone 'oh' is conversation, not zero", () => {
    expect(values('oh I see, okay')).toEqual([])
    expect(values('oh oh oh')).toEqual([])
  })
  it('comma-separated dictation joins', () => {
    expect(values('seven, three, three, one, nine, two, four')).toEqual(['7331924'])
  })
  it('letters break adjacency (alphanumeric prefix is not merged)', () => {
    expect(values('alpha bravo 24590 room four')).toEqual(['24590'])
  })
  it('overlong digit strings are rejected', () => {
    expect(values('serial 1234567890123456')).toEqual([])
  })
})

describe('mentionsIdentifierKeyword (assistant ask / read-back detection)', () => {
  it('matches Clara asks and read-backs', () => {
    expect(mentionsIdentifierKeyword('Can I get the name, MRN, and age?')).toBe(true)
    expect(mentionsIdentifierKeyword("Let me confirm the MRN: that's eight, three, zero, five, nine, two?")).toBe(true)
    expect(mentionsIdentifierKeyword('What is the medical record number?')).toBe(true)
    expect(mentionsIdentifierKeyword('Do you have the FIN?')).toBe(true)
  })
  it('ignores unrelated turns', () => {
    expect(mentionsIdentifierKeyword('When did the weakness start?')).toBe(false)
  })
})

/** Convenience driver: feeds turns and collects actions. */
function makeSession() {
  const cc = createMrnCrosscheck()
  return {
    cc,
    assistant: (text: string, ts: number) => cc.noteAssistantTurn(text, ts),
    user: (text: string, ts: number) => cc.noteUserTurn(text, ts),
    medical: (text: string, ts: number) => cc.noteMedicalSegment(text, ts),
  }
}

describe('createMrnCrosscheck — verdicts', () => {
  it('H1: agreement across renderings → silent, captured verified', () => {
    const s = makeSession()
    s.assistant('Can I get the name, MRN, and age?', 0)
    expect(s.user('seven three three one nine two four', 1_000)).toBeNull()
    expect(s.medical('The MRN is 7331924', 2_500)).toBeNull()
    const cap = s.cc.getCapturedIdentifier()
    expect(cap).toMatchObject({ value: '7331924', source: 'agreement', verified: true })
    expect(s.cc.getEvents().map((e) => e.kind)).toEqual(['match'])
  })

  it('H2: formatting-only difference NEVER nudges (the false-fire guard)', () => {
    const s = makeSession()
    s.assistant('And the FIN?', 0)
    expect(s.user('alpha bravo two four five nine zero', 1_000)).toBeNull()
    expect(s.medical('Her PIN number is Alpha Bravo 24,590.', 2_000)).toBeNull()
    expect(s.cc.getEvents().map((e) => e.kind)).toEqual(['match'])
    expect(s.cc.getCapturedIdentifier()?.value).toBe('24590')
  })

  it('dropped digit (the motivating live failure) → nudge once the mismatch settles', () => {
    const s = makeSession()
    s.assistant('Can I get the MRN?', 0)
    expect(s.user('four four two', 1_000)).toBeNull() // Nova alone: nothing to compare yet
    // Mismatch is visible here but WITHHELD — a healing fragment may still land.
    expect(s.medical('MRN 4421', 2_000)).toBeNull()
    // Clara's next reply arrives past the settle window → the nudge fires now.
    const action = s.assistant('Thank you. And how old is he?', 8_000)
    expect(action).not.toBeNull()
    expect(action).toMatchObject({ kind: 'nudge', novaValue: '442', medicalValue: '4421' })
    expect(action?.nudgeText).toContain('"442"')
    expect(action?.nudgeText).toContain('"4421"')
    // The read-back target is the Transcribe value, pre-spelled so Nova
    // recites it instead of inventing digits (live hallucination seen 7/12).
    expect(action?.nudgeText).toContain('four, four, two, one')
    // Unverified capture prefers the Transcribe value (authoritative).
    expect(s.cc.getCapturedIdentifier()).toMatchObject({ value: '4421', source: 'transcribe-medical', verified: false })
  })

  it('mismatch is withheld while fragments may still be landing (settle window)', () => {
    const s = makeSession()
    s.assistant('MRN please?', 0)
    s.user('seven three three one nine two four', 1_000)
    // First fragment alone looks like a disagreement — must NOT nudge yet…
    expect(s.medical('MRN 733', 1_500)).toBeNull()
    // …and 700ms later the second fragment heals it into agreement.
    expect(s.medical('1924', 2_200)).toBeNull()
    expect(s.assistant('Great, and how old is she?', 9_000)).toBeNull()
    expect(s.cc.getEvents().map((e) => e.kind)).toEqual(['match'])
  })

  it('number split across two medical finals heals via joined extraction', () => {
    const s = makeSession()
    s.assistant('MRN please?', 0)
    s.user('seven three three one nine two four', 1_000)
    expect(s.medical('MRN 733', 1_500)).toBeNull()
    expect(s.medical('1924', 2_200)).toBeNull()
    expect(s.cc.getEvents().map((e) => e.kind)).toEqual(['match'])
  })

  it('order independence: medical final can arrive first', () => {
    const s = makeSession()
    s.assistant('MRN please?', 0)
    expect(s.medical('The MRN is 7331924', 900)).toBeNull()
    expect(s.user('seven three three one nine two four', 1_800)).toBeNull()
    expect(s.cc.getEvents().map((e) => e.kind)).toEqual(['match'])
  })

  it('front-loaded caller (no assistant ask) self-opens an episode', () => {
    const s = makeSession()
    expect(s.user('This is Mercy ER, patient Kowalski, MRN 830592, possible stroke', 1_000)).toBeNull()
    expect(s.medical('MRN 830592.', 2_000)).toBeNull()
    expect(s.cc.getCapturedIdentifier()).toMatchObject({ value: '830592', verified: true })
  })

  it('retro-ingest: keywordless Nova digits are recovered when Transcribe opens the episode', () => {
    const s = makeSession()
    // Nova garbled the word "MRN" so its final has bare digits, no keyword → no episode yet.
    expect(s.user('Emma are in seven three three one nine two four', 0)).toBeNull()
    // Transcribe heard the keyword → self-open + retro-ingest the buffered Nova final.
    expect(s.medical('The MRN is 7331924', 1_500)).toBeNull()
    expect(s.cc.getEvents().map((e) => e.kind)).toEqual(['match'])
  })

  it('stale pairing (outside pairingWindowMs) never compares', () => {
    const s = makeSession()
    s.assistant('MRN please?', 0)
    expect(s.user('four four two', 1_000)).toBeNull()
    expect(s.medical('MRN 4421', 20_000)).toBeNull() // 19s apart > 12s window
    expect(s.assistant('Anything else I should know?', 26_000)).toBeNull()
    expect(s.cc.getEvents()).toEqual([])
  })

  it('one nudge per episode; later same-episode agreement verifies the capture silently', () => {
    const s = makeSession()
    s.assistant('MRN please?', 0)
    s.user('four four two', 1_000)
    expect(s.medical('MRN 4421', 2_000)).toBeNull() // withheld during settle
    expect(s.assistant('Thanks. What floor is he on?', 8_000)?.kind).toBe('nudge')
    // More finals inside the SAME episode — never a second nudge; agreement verifies.
    expect(s.user('four four two one', 10_000)).toBeNull()
    expect(s.cc.getCapturedIdentifier()).toMatchObject({ value: '4421', source: 'agreement', verified: true })
    expect(s.cc.getEvents().map((e) => e.kind)).toEqual(['mismatch', 'match'])
  })

  it("Clara's identifier ECHO never wipes a pending mismatch (live regression 7/12)", () => {
    const s = makeSession()
    s.assistant('Can you give me the name and MRN or FIN?', 0)
    s.user('the fin is alpha bravo two five four five nine zero', 1_000) // Nova garbled: 254590
    expect(s.medical('The Fin is Alpha Bravo 24,590.', 2_000)).toBeNull() // withheld during settle
    // Clara immediately ECHOES the identifier while moving on — this must NOT
    // discard the pending disagreement (it used to, silencing the nudge).
    expect(s.assistant("Perfect — I've got Robert Chen, FIN alpha bravo two five four five nine zero, fourth floor.", 3_000)).toBeNull()
    const action = s.assistant("You're all set — no need to stay on the line.", 8_000)
    expect(action).toMatchObject({ kind: 'nudge', novaValue: '254590', medicalValue: '24590' })
  })

  it("read-back correction verifies within the same episode; her spoken digits never pollute", () => {
    const s = makeSession()
    s.assistant('MRN please?', 0)
    s.user('four four two', 1_000)
    expect(s.medical('MRN 4421', 2_000)).toBeNull()
    expect(s.assistant('Got it. And the age?', 8_000)?.kind).toBe('nudge')
    // Clara reads back the Transcribe value; the caller confirms/corrects.
    s.assistant("Let me confirm the MRN: four, four, two, one — is that right?", 9_000)
    expect(s.user('yes, four four two one, correct', 11_000)).toBeNull()
    expect(s.medical('Yes. 4421. Correct.', 12_000)).toBeNull()
    expect(s.cc.getCapturedIdentifier()).toMatchObject({ value: '4421', verified: true })
  })

  it('session cap: only maxNudgesPerSession nudges; further mismatches are suppressed', () => {
    const s = makeSession()
    const mismatchEpisode = (base: number, nova: string, med: string) => {
      s.assistant('MRN please?', base)
      s.user(nova, base + 1_000)
      expect(s.medical(med, base + 2_000)).toBeNull() // withheld during settle
      return s.assistant('Thanks — one moment.', base + 8_000)
    }
    expect(mismatchEpisode(0, 'one two three four', 'MRN 1235')?.kind).toBe('nudge')
    expect(mismatchEpisode(80_000, 'five six seven eight', 'MRN 5679')?.kind).toBe('nudge')
    expect(mismatchEpisode(160_000, 'two two two two', 'MRN 2223')).toBeNull()
    expect(s.cc.getEvents().map((e) => e.kind)).toEqual(['mismatch', 'mismatch', 'nudge-suppressed'])
  })

  it('one-sided data stays silent; capture falls back unverified (Transcribe preferred)', () => {
    const nova = makeSession()
    nova.assistant('MRN please?', 0)
    expect(nova.user('MRN eight three zero five nine two', 1_000)).toBeNull()
    expect(nova.cc.getEvents()).toEqual([])
    expect(nova.cc.getCapturedIdentifier()).toMatchObject({ value: '830592', source: 'nova', verified: false })

    const med = makeSession()
    med.assistant('MRN please?', 0)
    expect(med.medical('The MRN is 830592.', 1_000)).toBeNull()
    expect(med.cc.getEvents()).toEqual([])
    expect(med.cc.getCapturedIdentifier()).toMatchObject({ value: '830592', source: 'transcribe-medical', verified: false })
  })

  it('assistant digits never become candidates', () => {
    const s = makeSession()
    s.assistant("Let me confirm the MRN: that's eight, three, zero, five, nine, two?", 0)
    // Only medical data arrives; if Clara's own digits had polluted the nova
    // side, this would produce a (false) match verdict.
    expect(s.medical('The MRN is 830592.', 1_000)).toBeNull()
    expect(s.cc.getEvents()).toEqual([])
  })

  it('DOB-masking guard: agreeing DOB digits cannot mask an MRN disagreement', () => {
    const s = makeSession()
    s.assistant('Name, MRN, and date of birth?', 0)
    // Both sides agree on the DOB digits (31258) but disagree on the
    // keyword-anchored MRN (442 vs 4421) — the closest-anchored comparison
    // must still fire the nudge.
    expect(s.user('MRN four four two, date of birth is three twelve fifty eight', 1_000)).toBeNull()
    expect(s.medical('MRN 4421. Date of birth 3 12 58.', 2_000)).toBeNull()
    const action = s.assistant('Thank you. When did this start?', 8_000)
    expect(action).toMatchObject({ kind: 'nudge', novaValue: '442', medicalValue: '4421' })
  })

  it('no keyword anywhere → no episode, no verdicts (bare numbers in conversation)', () => {
    const s = makeSession()
    expect(s.user('he has been weak for two days, blood pressure one eighty over ninety', 1_000)).toBeNull()
    expect(s.medical('Blood pressure 180 over 90.', 2_000)).toBeNull()
    expect(s.cc.getEvents()).toEqual([])
  })
})
