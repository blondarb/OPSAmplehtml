# Localizer / Differential Eval Harness

Vignette-driven regression + scoring for the differential engine (Historian Localizer and Reasoning/Exam Interpreter). This is the scoreboard the hardening work runs against — build/measure before changing prompts.

Spec: [`docs/plans/2026-06-13-localizer-differential-hardening-spec.md`](../../docs/plans/2026-06-13-localizer-differential-hardening-spec.md)

## Layout

| File | Role |
|------|------|
| `schema.ts` | `Vignette` / `Gold` / `LocalizerLike` types |
| `score.ts` | **Pure** scorer — no I/O, no Bedrock (the testable core) |
| `score.test.ts` | Vitest unit tests for the scorer (always-on CI signal) |
| `vignettes/*.json` | Clinical scenarios + gold expectations |
| `run.ts` | Runner — sends vignettes to the live engine via adapter, scores, reports |

## What gets scored

Per vignette (`gold` block): **localization** match, **must-include** diagnoses, **rank top-N** (e.g. B12 in top 3 — Adam Cohen's regression), **screening** coverage (B12/MMA surfaced), and **must-not-include** (specificity / over-firing guard — negative controls).

## Run

Scorer unit tests (no creds needed; runs in CI):
```bash
npx vitest run qa/localizer-evals/score.test.ts
```

Live eval against the deployed engine:
```bash
LOCALIZER_EVAL_ENDPOINT=https://app.neuroplans.app/api/ai/historian/localizer \
LOCALIZER_EVAL_COOKIE="id_token=..." \
npx tsx qa/localizer-evals/run.ts
```
With no endpoint set, the runner skips (exit 0) and lists loaded vignettes.

## Seed set

`scd-b12-001` (B12/SCD — Adam Cohen seed), `nph-001`, `wernicke-001`, `migraine-negative-control-001` (specificity). Expand toward the ~10–12 can't-miss vignettes listed in the spec (copper myelopathy, GBS, temporal arteritis, CO, hypothyroid dementia, …) plus more negative controls.

## Dual-axis note

The scorer already accepts an optional `cantMiss[]` list on engine output (spec §3b). Until the engine is upgraded to dual-axis, it scores against the single `differential` list; `rank` checks always measure the likelihood list (a can't-miss mention alone does not satisfy "rank B12 high").
