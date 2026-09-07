# Clinical policy verification — September 5, 2026

**Branch:** `fix/triage-clinical-policy-20260905`

**Base:** `8582bde` (full object ID in the external evidence manifest)

**Tester:** Codex, synthetic local verification

**Runbook:** `qa/TEST_RUNBOOK.md` v2.0

**Deployment:** none for this change; migration 062 remains unapplied outside disposable fixtures.

## Mission brief

Verify the approved clinical policy corrections: immediate-action wording across output and persistence, source-bound chronology, full-source and long-packet evaluation parity, the governed MS destination, and immutable independent action/timing/service labels. Verify the new 25-note/20-group counterexample package without asserting that model outputs or clinician labels have been validated.

Risks: a legacy outpatient tier masking an immediate action; loss of decisive raw-source evidence; a new upload resetting an onset-based clock; contradictory human labels; mutation or reinterpretation of historical scores; evaluation inputs differing from production; accidental clinical intake or paid inference.

## Software checks

| Check | Result | Evidence and scope |
|---|---|---|
| Triage suite | PASS | `node node_modules/vitest/vitest.mjs run tests/triage src/app/api/triage --reporter=dot`: 1,824 passed; 12 database-dependent tests skipped in this invocation and run separately below |
| Actual PostgreSQL completion behavior | PASS | `tests/triage/run-triage-completion-persistence-behavior.sh`: all 12 tests passed; fresh Unix-socket-only PostgreSQL fixture, no live database |
| Actual PostgreSQL governance/migration checks | PASS | `tests/triage/validation/governance.sql`, including 062: historical identities, timestamps and scores preserved; role/phase/blindness/immutability, canonical label shape, action/tier/wait constraints checked |
| Final UI/results regression after type-only cleanup and removal of an unused constant | PASS | `vitest run tests/triage/validation/routes.test.ts tests/triage/validationReviewForm.test.tsx --reporter=dot`: 47 passed |
| TypeScript | PASS | `tsc --noEmit`; final Next build also checked types on the final source |
| Production build (S7) | PASS | Next 15.5.24 `next build --no-lint`, sanitized environment, cloud credentials excluded; final build exit 0 |
| Changed-file lint | BASELINE DEBT | 55 changed/new TypeScript files: 50 errors, zero warnings. All 50 are existing `no-explicit-any` findings in the legacy results route. Compared baseline rule plus source-line signatures: zero additions and zero removals. No new lint findings. |
| Diff whitespace | PASS | `git diff --check` |

The full triage suite preceded only the results-route type annotation and unused form-constant cleanup. The affected 47 tests and final build cover those final changes. The completion SQL was unchanged after its actual PostgreSQL run. Documentation and evidence additions do not require another source-suite run.

Build warnings concern existing workspace lockfile detection, Edge-runtime compatibility in `jose`, and stale Browserslist data. Lint was run separately rather than presenting `--no-lint` as lint success. No dependencies were upgraded in this correction.

## Browser focus checks

Local final production build on `http://127.0.0.1:3115`, isolated Playwright CLI session. Every `/api/` request was fulfilled with synthetic fixtures and every non-local request was blocked. This proves local form behavior, not real authentication, deployed access control, a live database save, or model accuracy.

| Check | Result |
|---|---|
| Final reviewer page loads (local portion of S1/S2) | PASS |
| Incomplete independent label cannot save | PASS |
| Clinician-review-now selects a compatible urgent comparison tier and zero-minute decision-time interval | PASS |
| Immediate clinician review cannot endorse the legacy one-week comparison wait | PASS |
| MS / Neuroimmunology can be selected and submitted | PASS |
| Complete label saves; request retains action and zero-minute interval | PASS |
| Save advances to Case 2 and clears action and service selections | PASS |
| Emergency-now selects emergent and permits comfort with immediate care | PASS |
| Returning to completed Case 1 shows a locked original, with no editable action control | PASS |
| Original action and zero-minute interval remain visible | PASS |
| Correction request appends a request and leaves the original unchanged | PASS |
| 375-pixel layout | PASS: viewport 375, document 375, body 375; no horizontal overflow |
| Browser console | Zero errors; existing CSS preload warnings |

Screenshots were captured and visually inspected: `clinical-review-375.png` and `clinical-review-locked-375.png`. They are available with the user-facing receipt under the Codex project `outputs/triage-clinical-policy-evidence/` directory. Browser scripts and logs are preserved there for reproduction with synthetic fixtures.

An initial browser script timed out because the completed navigation button changes from `Case 1` to `Case 1 ✓`. The selector was corrected using the observed snapshot, and the whole affected workflow passed. An earlier build was interrupted while a dev server shared generated output; the generated output was cleared, the dev server stopped, and the final build and browser checks used the production server sequentially.

## Explicit limits

- S3–S6 and the full deployed smoke suite were not run: no login, patient portal, real clinical workflow, or deployment was authorized in this correction.
- The 25 new catalog cases have not been run through paid live models. Unit/integration checks mock model responses; case files are not clinical accuracy evidence.
- No clinician labels were collected, fabricated, or inferred from the synthetic browser checks. Two independent reviewers and an adjudicator remain to be selected.
- Migration 062 and study setup need authorized integration. Historical records and migration 061 are preserved.
- Final disposition, scheduling, paid-evaluation activation, and real-note access remain gated.
