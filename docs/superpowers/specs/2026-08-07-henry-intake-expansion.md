# Spec — Henry as intake, not just history

**Status:** draft for review. Not scheduled. Do not start before Novant (Aug 12).
**Author:** Claude, from a 2026-08-07 conversation with Steve Arbogast, DO.
**Repo:** OPSAmplehtml · historian surfaces `/patient/historian`, `/patient/triage-historian`, `/consult`

---

## What Steve asked for

> "I think I want this to cover intake in the long run, so if we expand the number of
> questions Henry will verify meds, allergies, etc. This may be too much, but I want Henry to
> take a good history and develop a DDx but also do reasonable medical intake."
>
> "We may need to also expand the number of questions if that's what it takes to get a better
> DDx, and finish scales if it thinks they are relevant."

Three goals, in his priority order: **good history → real DDx → reasonable intake**, with
scales completed rather than abandoned.

---

## The binding constraint is turns, not knowledge

This is the finding that should shape the design. Henry is capped at **25 turns**
(`TURN_CAP`, mirrored in CRITICAL RULE 13) and budgeted **8–20** ("quality over coverage").

Measured item counts, and each item is one turn — the tool enforces single-item pacing and
verbatim recitation, so they cannot be batched:

| Scale | Items | Turns |
|---|---|---|
| PHQ-9 | 9 | 9 |
| ESS | 8 | 8 |
| GAD-7 | 7 | 7 |
| HIT-6 | 6 | 6 |
| MIDAS | 5 | 5 |
| Mini-Cog | 3 steps | 3+ |

**A single PHQ-9 consumes 9 of 25 turns.** A headache case that runs MIDAS *and* HIT-6 spends
11 turns on instruments before any history. Adding med/allergy/PMH verification (realistically
8–12 exchanges if elicited cold) on top of that does not fit, and today the model resolves the
squeeze **silently** — it drops history questions, which is the part that currently works well.

So "expand the number of questions" is necessary but not sufficient. Without separate budgets,
one long scale still cannibalises the history.

---

## Current state (measured 2026-08-06/07, not assumed)

**What Henry receives** — all in the opening prompt; he retrieves nothing mid-session:
`REFERRAL FOCUS`, `TRIAGE PRIORITY`, `REFERRED TO`, red flags (capped at 10), `TIMELINE`,
`FUNCTIONAL STATUS`, and the **referral note verbatim, truncated to 3,000 characters**.

**Three specific defects:**

1. **`MAX_NOTE_CHARS = 3_000` is unjustified.** Introduced in `f00a09c` (this week, by me) as a
   defensive round number with no measurement. A blind `.slice()` truncates the *end* of the
   note — where medications, allergies and PMH live in a referral letter. Nakamura's PCP note
   alone is ~3.5k, so its medication list is **already being dropped today**.

2. **`medications_and_therapies` is parsed and then thrown away.** `ExtractionKeyFindings`
   carries a clean `string[]`; `buildHistorianReferralContext` forwards only `timeline` and
   `functional_status`. The structured data we already paid to extract never reaches Henry.

3. **Size was never the limiting factor.** Baseline prompt 11,841 chars; full triage handoff
   16,866 chars — both accepted. A 2,275-char neutral filler passed while a 1,109-char block
   was rejected. Bedrock's filter reacts to **content**, not length. Truncating for "prompt
   size" was solving the wrong problem.

---

## Proposal

### 1. Replace truncation with structured fields (do this first)

Forward `medications_and_therapies`, and likely `allergies` and `neurological_symptoms`, as
explicit labelled lines. ~200 characters, survives any note length, and is more reliable than
hoping the meds fall inside an arbitrary character window.

Raise `MAX_NOTE_CHARS` substantially (10k+) or drop it, but as a *secondary* measure — the
structured lines are what make medication awareness dependable.

### 2. Do NOT add a retrieval tool for the referral

Considered and rejected for this scope. A lookup adds a round-trip, a failure mode, and
latency in a **voice** interview where silence is what kills the experience. The referral is a
bounded document that is already parsed; putting it in the prompt is strictly simpler.

A tool becomes right for **different** data — prior visits, the actual chart, an EHR med list.
That needs auth, trusted patient identity, and a BAA-covered path. Separate feature, later.

### 3. Phase the interview with separate budgets

The core change. Rather than one pooled budget that intake and history silently fight over:

| Phase | Budget | Character |
|---|---|---|
| Verification | ~4–6 turns | **Confirm, don't elicit.** "I have you on topiramate 50 twice a day — still taking that?" is one turn. Meds, allergies, and relevant PMH are cheap when the referral already lists them. |
| History | 8–20 turns | Unchanged. The part that already works. Protected from being cannibalised. |
| Scales | committed separately | See below. |

Verification is fast *because* of fix #1 — Henry confirms a known list instead of eliciting one
cold. That is the whole reason to do them in this order.

### 4. Scales: commit before starting, never abandon mid-instrument

Steve: *"finish scales if it thinks they are relevant."* A half-finished PHQ-9 is worse than
none — it is an invalid instrument and the partial score is not interpretable.

Proposed contract:
- Before the first `scale_step` call, Henry checks the remaining budget against the scale's
  item count. If it does not fit, he **does not start it** and records it as recommended-not-
  administered in `save_interview_output`.
- Once started, completing it takes priority over remaining history questions.
- The overall cap rises enough to hold history + one typical scale. Concretely: 25 → ~40, on
  the arithmetic above (20 history + 9 PHQ-9 + 6 verification ≈ 35).

This needs Steve's judgement, not mine: a 40-turn voice interview is a materially longer
patient experience, and "how long is too long for a patient on the phone" is a clinical and
operational call.

### 5. DDx

Steve wants a better differential. The DDx already runs post-save
(`/api/ai/historian/save` + the independent R1 differential). Medications and failed therapies
are exactly what separates a plausible differential from a real one — so fix #1 improves the
DDx directly, with no change to the differential logic itself.

Recommend measuring this before tuning the DDx prompt: run the synthetic driver
(`scripts/historian-synthetic-run.ts`) with and without the structured medication lines and
compare differentials on the same personas.

---

## Open decisions — Steve

1. **Should Henry use medication knowledge proactively, or only when asked?**
   Proactive ("you're on topiramate — how's that going?") makes a better history, but Henry
   then visibly knows things about the patient's care, which changes how the safety framing
   reads. Reactive is safer and duller.
2. **Turn cap.** 25 → 40 is the arithmetic answer. Is a ~40-turn voice interview acceptable to
   a patient? If not, what gets cut when a scale is indicated?
3. **Allergies.** Verify against the referral, or always ask cold? Referral allergy lists are
   frequently stale, and an inaccurate allergy record carries real downstream risk.
4. **Where intake sits if the budget is still tight** — history first, or verification first?
   The spec assumes verification first (it is cheap and improves the history that follows).

---

## Non-goals

- EHR/chart integration. Different feature, needs the BAA path.
- Changing triage scoring, the rubric, or the emergency gateway.
- Any change to the safety protocol, the 911/988 script, or the red-flag screen. Those are
  invariant and must not be traded for intake coverage.

---

## Verification plan

- **The Bedrock content filter is a live hazard for prompt work.** On 2026-08-06 a single
  paragraph silenced every Nova session; it took a paragraph-by-paragraph bisect against the
  live relay to find. Any prompt change here must be verified the same way *before* shipping —
  see the load-bearing-wording comment in `historianPrompts.ts`. Repeat runs, because the
  check must be able to fail.
- Synthetic driver for turn-budget behaviour: does Henry now finish scales, and does history
  coverage hold?
- A real voice run by a human. Transport health is not evidence the interview is good, and
  nothing in this session's automated checks could hear anything.

## Files

| File | Role |
|---|---|
| `src/lib/historian/referralContext.ts` | `MAX_NOTE_CHARS`, structured field forwarding (fixes 1 & 2) |
| `src/lib/historianPrompts.ts` | turn rules, phase structure, `scale_step` contract |
| `src/components/NeurologicHistorian.tsx` | `TURN_CAP`, progress copy ("Question N of about 25") |
| `src/lib/scales/scale-definitions.ts` | item counts that drive the budget arithmetic |
| `scripts/historian-synthetic-run.ts` | headless measurement harness |
