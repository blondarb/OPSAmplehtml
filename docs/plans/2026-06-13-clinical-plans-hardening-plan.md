# Clinical Plans (Recommendations) — Hardening Plan

**Date:** 2026-06-13
**Status:** Plan — not yet executed
**Parent:** `2026-06-13-evidence-engine-strategy-and-moat.md`

Covers the ~360 clinical plans (Neuroplan). These were **AI-generated and grounded as best we could** — which means they are *plausible and structured*, but their citations and dosing are **claims until verified**. Hardening converts them into the trustworthy, proprietary grounding layer that is our actual moat.

---

## 1. What we have today

- **Table:** `clinical_plans` (global, no tenant) — `plan_key, title, icd10_codes[], scope, notes[], sections (JSONB), patient_instructions[], referrals[], differential, evidence, monitoring, disposition`.
- **Source:** synced from `blondarb/neuro-plans` (`docs/plans/` preferred over `docs/drafts/`) via `scripts/sync-plans.ts`, OPD-only transform.
- **Matching:** deterministic ICD-10 scoring in `src/app/api/plans/route.ts` — exact code ×1000 + 3-char prefix matches.
- **Provenance shape:** `evidence[]` = `{ recommendation, evidenceLevel, source }` (e.g., "Class I, Level A — SANAD II, Lancet 2021").

**Encouraging signal:** the demo subset (`recommendationPlans.ts`) cites *real landmark trials accurately* (SANAD II, ESETT, RAMPART, POINT/CHANCE). So generation was genuinely grounded — but "the ones we can eyeball are right" ≠ "all ~360 are right."

## 2. Known risks to resolve first

- **Store drift:** sync writes **Supabase**; the app reads via **node-postgres**. Confirm same DB, or the synced plans and served plans diverge. **Blocker — verify before trusting plans as ground truth.**
- **AI-generated citations:** classic risk = plausible-but-fabricated references, or a real source that doesn't actually support the stated claim/dose.
- **Dosing safety:** any orderable dose must be reconcilable to the formulary / a reference.

## 3. The hardening pipeline

### Phase 0 — Inventory & store reconciliation
- Confirm read/write target. Export all ~360 plans to a working set. Count evidence entries, dosing items, ICD-10 codes.

### Phase 1 — Automated citation triage
For each `evidence[]` entry, run an automated checker that flags:
- source string that does not resolve to a real citation (PubMed/DOI/guideline lookup),
- `evidenceLevel` present but source missing (or vice versa),
- dosing items with no corresponding formulary entry,
- ICD-10 codes that don't validate.
Output a per-plan **risk score** so humans review the worst first. (This is automatable; it does not replace clinician review.)

### Phase 2 — Doc-in-the-loop verification (Adam's V&V)
- Clinician (or supervised intern under clinician sign-off) reviews flagged plans: **thumbs up/down per recommendation + Likert (1–5) per plan**, with a correction field.
- Persist scores to a new `plan_review` table (plan_key, reviewer, recommendation_id, verdict, likert, correction, reviewed_at). This *is* the moat data — it compounds and is proprietary.
- Priority order: highest-volume / highest-stakes plans first (stroke secondary prevention, status epilepticus, MS DMT, seizure ASMs).

### Phase 3 — Correction & re-sync
- Corrections flow back to `blondarb/neuro-plans` source JSON (single source of truth), then `npm run sync-plans`.
- Use `scripts/plan-overrides.json` for hotfixes that shouldn't wait on a source-repo round-trip.

### Phase 4 — Continuous validation
- Every served plan recommendation carries provenance + last-reviewed date.
- Surface a "report issue" affordance in Neuroplan that writes to `plan_review` (turns clinical use into ongoing validation signal).
- The localizer eval harness (`qa/localizer-evals/`) doubles as a plan check: vignettes assert that the matched plan surfaces the correct workup.

## 4. "Improve them even further" — depth upgrades (after verification)

Once correctness is verified, raise the ceiling:
- **Reversible-cause cross-links** — connect each plan to the `reversible_cause_map` (localizer doc) so workups stay can't-miss-complete.
- **Dosing structure** — expand `StructuredDosing.doseOptions` (renal/hepatic adjustment, weight-based, pediatric exclusions) so orders are pickable, not free-text.
- **Coverage gaps** — 18 diagnoses still lack plans (per roadmap); prioritize by referral volume.
- **Evidence currency** — flag citations older than guideline refresh cycles for re-check.

## 5. Deliverables / acceptance

- [ ] Store target confirmed (no Supabase↔Postgres drift).
- [ ] Automated citation-triage report across all ~360 plans, ranked by risk.
- [ ] `plan_review` table + doc-in-the-loop scoring UI/flow.
- [ ] Top-20 highest-stakes plans clinician-verified and corrected.
- [ ] Provenance + last-reviewed date surfaced on served plans.

**Definition of done for "hardened":** every served recommendation has a checked source, a formulary-reconciled dose (if orderable), and a clinician verdict on record.
