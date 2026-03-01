# Triage Validation Handoff — March 1, 2026

## Audience
Next Claude Code session working on the triage validation system.

## Current State
- **Build/Deploy**: Clean, production live at `ops-amplehtml.vercel.app`
- **Branch**: All merged to `main` (PRs #56, #57)
- **Supabase project**: `czspsioerfaktnnrnmcw` (us-east-2)

## Work Completed This Session

### 1. Reviewer Name Fix (PR #56)
**Problem**: Results page showed dashes for all reviewer data in the Case-by-Case Detail table.
**Root cause**: `user_profiles` table was empty. The API used inconsistent fallback names — raw UUID for case-detail dictionary keys but `'Reviewer'` for column headers. Front-end lookup failed silently.
**Fix**: Built a consistent `nameMap` in the results API route, used across all 4 name-lookup locations. Also changed single-reviewer agreement from always-`false` to `null` (displayed as "—" instead of "Disagree").

| File | Change |
|------|--------|
| `src/app/api/triage/validate/results/route.ts` | Added `nameMap`, fixed 4 lookup sites, null agreement for 1 reviewer |
| `src/app/triage/validate/results/page.tsx` | Three-state agreement display (true/false/null) |
| `src/lib/triage/validationTypes.ts` | `agreement: boolean` → `boolean \| null` |

### 2. Reviewer Auto-Profile Prompt (PR #57)
**Problem**: New reviewers had no way to identify themselves; results page showed generic labels.
**Fix**: When a reviewer lands on the validation page without a `user_profiles` entry, a modal prompts for name (required), specialty, and organization before they can start reviewing.

| File | Change |
|------|--------|
| `src/app/api/triage/validate/profile/route.ts` | **New** — GET (check profile) / POST (create/update profile) |
| `src/app/triage/validate/page.tsx` | Profile check on load + modal UI |

### 3. Database Changes (Direct)
- Inserted Dr. Arbogast's profile into `user_profiles` (id: `627988af-...`, display_name: "Dr. Arbogast", role: clinician, org: Sevaro, specialty: Neurology)

## Validation Study Status

### Data
- **26 validation cases** seeded, all active
- **104 AI runs** (4 per case) — 0 failures
- **1 human reviewer** (Dr. Arbogast) — 26/26 cases reviewed
- **Human-AI agreement**: 62% exact match (16/26 cases)
  - AI tends to over-triage (7 of 10 disagreements AI was higher)
  - Two big gaps: Case 18 (Fletcher, 3-tier spread) and Case 24 (Jimenez, 3-tier spread)

### IRR Metrics
- With only 1 reviewer, Fleiss' Kappa / Krippendorff's Alpha / Weighted Kappa all show 0 or N/A
- **Need 2+ reviewers** to get meaningful IRR statistics

### `user_profiles` Table Schema
Columns: `id` (uuid, FK to auth.users), `display_name` (text), `role` (text, check constraint: admin/clinician/investor/partner/demo), `organization` (text), `specialty` (text), `created_at`, `last_login`

### `validation_reviews` Table
Has `reasoning` field — reviewers can explain their rationale. Also captures `confidence`, `key_factors`, `duration_seconds`.

## Next Steps
1. **Get more reviewers** — each new reviewer will be prompted for their name automatically
2. **Reasoning display** — the `reasoning` field is captured but not yet shown on the results page. Could add an expandable row or tooltip.
3. **Anonymization toggle** — for publication, switch results page from real names to "Reviewer A", "Reviewer B" labels
4. **"Seeding failed" banner** — visible on admin page from earlier session, never investigated. Low priority but worth checking.

## Open Risks
- `user_profiles.role` has a check constraint (`admin`, `clinician`, `investor`, `partner`, `demo`). The profile API defaults to `clinician` if an invalid role is passed — works for validation reviewers but may need expanding for other use cases.
- Results page IRR section will remain empty/zeroed until a second reviewer completes all 26 cases.
