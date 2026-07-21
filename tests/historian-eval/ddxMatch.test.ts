import { describe, expect, it } from 'vitest'

import { tokenSetMatch } from './ddxMatch'

describe('tokenSetMatch', () => {
  it('matches across a hyphen/word-order difference (the real first-seizure.json gate case)', () => {
    // Ground truth: "Epilepsy (new onset)". Live model output for this
    // exact persona put the correct diagnosis at #2 phrased the other way
    // round, which the old contiguous-substring matcher could never catch
    // (a naive "strip non-alnum" normalization also collapses "New-Onset"
    // to "newonset", losing the word boundary against "new onset" —
    // tokenizing to spaces, not deleting, is what fixes both problems).
    expect(
      tokenSetMatch(
        'Epilepsy (new onset)',
        'First Unprovoked Generalized Tonic-Clonic Seizure (New-Onset Epilepsy)',
      ),
    ).toBe(true)
  })

  it('matches when one side is a token subset of the other (short ground truth, verbose model output)', () => {
    expect(tokenSetMatch('MS relapse', 'Acute MS relapse (myelopathy / new demyelinating lesion)')).toBe(true)
  })

  it('matches in the other direction too (verbose ground truth, short model output)', () => {
    expect(tokenSetMatch('Acute ischemic stroke, right MCA territory', 'Ischemic stroke')).toBe(true)
  })

  it('does not match clearly unrelated diagnoses', () => {
    expect(tokenSetMatch('Migraine without aura', 'Acute ischemic stroke')).toBe(false)
  })

  it('does not match clearly unrelated diagnoses (reverse order)', () => {
    expect(tokenSetMatch('Diabetic peripheral neuropathy', 'Chronic migraine with aura')).toBe(false)
  })

  it('drops trivial connector stopwords ("with"/"of") so they do not block an otherwise-equal match', () => {
    expect(tokenSetMatch('Signs of increased intracranial pressure', 'Increased intracranial pressure signs')).toBe(
      true,
    )
  })

  it('is case-insensitive', () => {
    expect(tokenSetMatch('CHRONIC MIGRAINE', 'chronic migraine')).toBe(true)
  })

  it('treats punctuation as a word boundary, not a deletion (comma-separated phrasing still matches)', () => {
    expect(tokenSetMatch('Stroke, ischemic', 'Ischemic stroke')).toBe(true)
  })

  it('returns false for two empty/whitespace-only strings rather than vacuously true', () => {
    expect(tokenSetMatch('', '')).toBe(false)
    expect(tokenSetMatch('   ', '')).toBe(false)
  })

  it('returns false when only stopwords survive tokenization on one side', () => {
    expect(tokenSetMatch('the of a', 'Migraine')).toBe(false)
  })

  // ── Negation safety guard ────────────────────────────────────────────
  // Stripping "with" as a connector stopword (per the fix instructions)
  // creates a real hazard: "X with Y" degrades to the same tokens as
  // "X Y", which is then trivially a SUBSET of "X without Y" (since
  // "without" is a real, non-stripped token) — a naive subset-only
  // matcher would call "migraine with aura" a match for "migraine
  // without aura", which are clinically opposite diagnoses. These cases
  // pin the guard that prevents that collision. This guard is an addition
  // beyond the literal fix instructions (which named "with"/"of" as
  // stopwords to drop) — flagged in the fix report.
  it('does NOT match "X with Y" against "X without Y" (negation asymmetry)', () => {
    expect(tokenSetMatch('Migraine with aura', 'Migraine without aura')).toBe(false)
  })

  it('does NOT match "X without Y" against "X with Y" (negation asymmetry, reversed argument order)', () => {
    expect(tokenSetMatch('Migraine without aura', 'Migraine with aura')).toBe(false)
  })

  it('still matches two phrasings that agree on negation', () => {
    expect(tokenSetMatch('Migraine without aura', 'Chronic migraine without aura, disabling')).toBe(true)
  })

  it('treats "no" as a negation marker with the same guard as "without"', () => {
    expect(tokenSetMatch('Seizure with no recovery between events', 'Seizure recovery between events')).toBe(false)
  })

  // ── Specificity floor (single-token sides require exact equality) ────
  // Without this floor, a single-token ground truth like "TIA" or "CIDP"
  // (both actually "low"-likelihood entries in the gate's own fixtures —
  // acute-stroke.json / peripheral-neuropathy.json) is a trivial SUBSET of
  // almost anything containing that token, which would let it "match" a
  // completely unrelated candidate diagnosis. See ddxMatch.ts module doc
  // for the full rationale and the accepted trade-off this creates.
  it('does NOT match a single-token ground truth against an unrelated multi-token candidate that merely contains it', () => {
    expect(tokenSetMatch('tia', 'hemispheric TIA with migraine features')).toBe(false)
  })

  it('still matches a single-token side against an exact (case-insensitive) equal', () => {
    expect(tokenSetMatch('tia', 'TIA')).toBe(true)
  })

  it('accepted trade-off: a single-token ground truth no longer subset-matches a multi-token candidate that legitimately contains it', () => {
    // Before the specificity floor, this matched (via subset). The floor
    // makes it a deliberate non-match — see module doc "Accepted trade-off".
    expect(tokenSetMatch('migraine', 'chronic migraine with aura')).toBe(false)
  })

  it('a multi-token subset case still matches (the floor only applies when a side is single-token)', () => {
    expect(tokenSetMatch('MS relapse', 'Acute MS relapse (myelopathy / new demyelinating lesion)')).toBe(true)
  })
})
