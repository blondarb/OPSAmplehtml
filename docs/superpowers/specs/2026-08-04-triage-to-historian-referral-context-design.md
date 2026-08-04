# Design — Referral-directed history: triage → historian, and note → historian

**Date:** 2026-08-04
**Status:** Design approved (Steve Arbogast, DO). Not yet implemented.
**Timing:** Post-demo — build after Novant (Aug 12). Do **not** touch `/triage` or
`/patient/historian` before then; both are QA-verified and frozen for Mayo (Aug 7).

## Problem

The historian can already be steered by a referral, but only inside `/consult`, and only
by triage's *derived* fields. Two things are missing for the product story we want to show:

1. There is no way to hand the historian **a note** directly — `/patient/historian` offers
   four canned scenarios or a `patient_id` lookup, nothing else.
2. Nothing carries a **referral focus** ("what was this patient sent for") in a form the
   historian leads with. It receives context passively; it does not prioritize against it.

Goal: a patient interview that opens with *"you were sent to the neurologist to discuss…"*
and then goes after that specific question first.

## What already exists (verified 2026-08-04, do not rebuild)

- `buildHistorianContextFromConsult()` (`src/lib/consult/contextBuilder.ts`) turns a consult
  record into `{ referralReason, patientContext }` — tier, urgency, subspecialty, triage
  summary, red flags (each with an instruction to characterize onset/severity/progression),
  intake summary, SDNE results.
- `buildHistorianSystemPrompt()` injects `REFERRAL REASON` (drives the opening question) and
  a `PATIENT CONTEXT` block.
- Extraction already yields `chief_complaint`, `neurological_symptoms`, `timeline`,
  `relevant_history`, `medications_and_therapies`, `failed_therapies`, `imaging_results`,
  `red_flags_noted`, `functional_status`, and retains `original_text`.
- `/consult` runs the pipeline end to end; it is **auth-gated** (not in `PUBLIC_ROUTES`).

## Locked decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **One shared builder, two entry points** | `/consult` and `/patient/historian` must not drift into two behaviors. |
| D2 | **Directive steering** — lead with the referral focus, then continue the standard phased history | Steve's call, made against a stated anchoring risk (below). |
| D3 | **Referral focus derives from what triage already emits** — no new inference step, no new schema field | Avoids a new clinical claim by the engine, a new model call, and its own eval. |
| D4 | UI label is **"Referral focus"**, never "presumed diagnosis" | Subspecialty + a clinical reason is a routing decision plus a finding. Calling it a diagnosis is the same overclaim removed from `/triage` on 2026-08-03. |
| D5 | **Raw note IS passed**, default on | Synthetic data only today; no BAA concern. Kept as one documented switch (below), not hardcoded. |
| D6 | **No separate demo path** | "Test as if it were real": synthetic input must exercise the same builder and prompt a real referral would, or the demo proves nothing. |

## Architecture

### New: `src/lib/historian/referralContext.ts`

```ts
export interface HistorianReferralInput {
  noteText?: string                       // raw referral text (see D5)
  extraction?: ExtractionKeyFindings      // structured findings, when available
  triage?: {
    tierDisplay?: string
    urgency?: string
    subspecialty?: string
    clinicalReasons?: string[]
    redFlags?: string[]
  }
  steer: 'directive' | 'additive'
  includeRawNote?: boolean                // default true — see D5
}

export function buildHistorianReferralContext(
  input: HistorianReferralInput,
): { referralReason: string; patientContext: string; referralFocus: string | null }
```

The builder derives the **referral focus** from the best signal it has:

1. `triage.subspecialty` + first `triage.clinicalReasons[0]` (the `/consult` feed), else
2. `extraction.chief_complaint` + `extraction.neurological_symptoms` (the standalone feed), else
3. `null` — and the historian falls back to its current open behavior. A missing focus must
   degrade to today's behavior, never to a blocked interview.

`buildHistorianContextFromConsult()` becomes a thin adapter over this. Its signature and
return shape do not change, so `/consult` and its existing tests are untouched.

### Two feeds

- **`/consult` (existing):** triage completes → adapter → builder. Steers on subspecialty +
  top clinical reason.
- **`/patient/historian` (new):** a "Use a referral note" option beside the four scenarios →
  paste/select a synthetic note → **extraction only (~15s)** → builder. Steers on chief
  complaint + symptoms.

> **Why extraction-only on the standalone path:** subspecialty is a *triage scoring* output,
> so steering on it would force this path through the full ~60s scoring chain. Extraction
> alone gives a usable focus in ~15s. This is a deliberate asymmetry, not an omission.

### Directive steering (D2)

New optional block appended by `buildHistorianSystemPrompt()` when a focus is present:

- Phase 1 leads with questions that establish or refute the referral focus.
- **The emergency red-flag screen runs regardless and does not count against the directive
  budget.** Non-negotiable; it is the existing safety floor.
- The engine's **25-turn** limit (`historianPrompts.ts` CRITICAL RULE 13) is unchanged. ~6–8
  questions are reserved for the directive pass so it cannot consume the interview.
  (The UI currently displays "of 23", which matches neither the number nor the unit — see plan Task 6.)
- After the directive pass, the standard phased history continues on the remaining budget.

Opening line must read naturally, e.g. *"You were sent to the neurologist to discuss the
weakness in your legs — can you tell me when that started?"* — not a recitation of the note.

### Anchoring risk (accepted, recorded)

Directive steering biases the interview toward confirming the referrer's framing and may
under-explore alternatives the referral missed — part of the historian's clinical value.
Raised during design; Steve chose directive deliberately. Mitigations in the design: the
safety screen is carved out of the budget, the directive pass is capped at ~6–8 questions,
and the standard phased history still runs afterward. If a validation study later compares
historian findings against referral assumptions, revisit — an `additive` mode is already in
the input shape for exactly that.

### D5 in practice

`includeRawNote` defaults to `true`. It lives in one place with a comment stating plainly
that flipping it to `false` is what stops referral text reaching OpenAI Realtime / Nova
Sonic, neither of which is under a Sevaro BAA. No BAA gate, no environment plumbing — one
documented switch, so the change is one line when real data arrives.

## Non-goals

- No new inference step, no differential generation, no schema migration (D3).
- No change to triage logic, rubric, weights, thresholds, or overrides.
- No new auth surface; `/consult` stays auth-gated, `/patient/historian` stays public.
- Not wiring SDNE or intake — the builder accepts them because the consult adapter already
  supplies them; nothing new is added.

## Testing

1. **Builder unit tests** — each input combination (triage-only, extraction-only, both,
   neither), focus derivation precedence, and the null-focus degradation path.
2. **Prompt-shape tests** — directive block present when a focus exists and absent when not;
   the safety-screen carve-out text survives; the question cap is unchanged.
3. **Safety regression** — emergency escalation must still fire in directive mode. This
   changes a safety-relevant prompt; it does not ship without this check.
4. **Adapter parity** — `buildHistorianContextFromConsult()` output is unchanged for existing
   consult records (guards the refactor).

## Acceptance

Paste a synthetic referral on `/patient/historian`, and the historian opens with a line in
the shape of *"you were sent to the neurologist to discuss…"*, then asks its first several
questions against that focus — while the emergency screen still runs and the interview still
completes within the engine's 25-turn limit.

## Files

| File | Change |
|---|---|
| `src/lib/historian/referralContext.ts` | NEW — shared builder |
| `src/lib/consult/contextBuilder.ts` | `buildHistorianContextFromConsult` → adapter; signature unchanged |
| `src/lib/historianPrompts.ts` | Optional directive block + safety carve-out |
| `src/components/NeurologicHistorian.tsx` | "Use a referral note" entry point |
| `src/app/api/ai/historian/session/route.ts` | Accept a referral-context payload |
| `tests/historian/referralContext.test.ts` | NEW — builder + prompt-shape tests |
