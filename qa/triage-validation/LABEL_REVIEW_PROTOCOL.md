# Triage label review protocol — blind, independent re-grade

**Purpose:** establish trustworthy ground-truth tiers for the 26 demo referrals, so
`BAKEOFF_2026-08-04.md`'s "11 of 21 disagree" becomes a statement about **engine error**
rather than about **label disagreement**.

**Status:** not started. Blocking for any calibration change. **Do this after Novant (Aug 12),
not before.**

---

## Why the existing labels aren't sufficient

They are not unlabelled — Steve (DO) reviewed all 26 on 2026-07-20 (`f54e391`). Two specific
gaps remain, and both are fixable in one sitting:

1. **Unblinded.** That commit records the review was done "against his own clinical judgment
   *and an offline run of each note through the real triage engine*." Seeing the engine's
   answer while assigning a label anchors the label toward the engine. Any subsequent
   agreement is then partly circular.
2. **Single rater.** There is no second opinion and therefore no inter-rater reliability.

**Inter-rater agreement is the ceiling on measurable engine accuracy.** If two clinicians
independently disagree on 6 of 21 of these notes, an engine that disagrees on 11 of 21 is much
closer to human-level than the raw number suggests — and chasing the remaining gap by
tightening the rubric would be chasing noise. That number cannot be obtained any way except by
grading independently.

---

## Who should grade

Two raters whose neurology triage judgment you would defend to a health system.

**Steve (DO)** — yes, but re-grading blind, not re-reading the July calls.

**Prachi** — depends on the question being asked, and this is worth being deliberate about:

- For the **clinical tier** (how soon must this patient be seen), the second rater should be
  someone clinically trained in neurology triage. If Prachi's role here is operational rather
  than clinical, she is the wrong second rater *for this specific question* — not because her
  judgment is poor, but because the number's whole purpose is to be defensible as a **clinical**
  ground truth to Mayo/Novant. A second neurologist is the stronger choice.
- For **operational feasibility** (is "within 1 week" schedulable, does this routing match how
  referrals actually flow), Prachi is likely the *better* rater than a second neurologist, and
  that is a genuinely useful second axis — but record it as a separate field, not as the tier.

If a second neurologist isn't available before this is needed, grading with Prachi is still far
better than not grading — just label the artifact honestly as "one neurologist + one
operational reviewer" so nobody later mistakes it for two independent clinical opinions.

---

## Method

**Per rater, working alone. Do not discuss cases until both are finished.**

1. Read the referral note only. **Do not open the app, the demo card, this repo's
   `expectedTier` values, or any prior bake-off.** The cards display the expected tier, so
   grade from the PDFs/notes, not from the UI.
2. For each of the 26 notes record:

   | field | values |
   |---|---|
   | `tier` | emergent · urgent · semi_urgent · routine_priority · routine · non_urgent |
   | `comfortable_with_wait` | yes / no — "would I be comfortable if this patient waited that long?" |
   | `confidence` | high / moderate / low |
   | `note` | free text, only if the case is genuinely ambiguous |

   The second field is the important one. It catches cases where the tier label is arguable but
   the clinical risk is not — and a "no" on a case both raters tiered identically is a stronger
   signal than a one-tier disagreement.
3. Only after both are done: unblind, compute agreement, and reconcile disagreements by
   discussion. **Record the pre-reconciliation numbers** — they are the inter-rater reliability
   and they do not survive reconciliation.

**Effort:** roughly 2–5 minutes per note, so **1.5–2 hours per rater**. It does not need to be
one sitting, but each rater should finish before comparing.

## What to produce

1. `qa/triage-validation/LABELS_2026-MM-DD.md` — the reconciled tiers, with pre-reconciliation
   agreement stated up front.
2. Update `expectedTier` in `src/lib/triage/demoScenarios.ts` to the reconciled values.
3. Re-run the offline analysis — free, no Bedrock calls:
   ```bash
   npx tsx scripts/tier-floor-breakdown.ts --study default
   ```
   The agreement column is then a real accuracy measurement for the first time.

## Then, and only then

The two calibration experiments in `BAKEOFF_2026-08-04.md` become actionable:
whether `red_flag_presence >= 4 → urgent` is too blunt, and why three cases landed two tiers
below their label. Both change clinical behaviour and both need this ground truth first.
