# Historian Validation Suite — Rollout Runbook

**Branch:** `feature/historian-validation-suite` · **PR:** [#167](https://github.com/blondarb/OPSAmplehtml/pull/167)
**Status:** awaiting Steve's single rollout approval. Nothing below has been run against live RDS or main.
**Scope reminder:** POC / no real PHI. All evaluator surfaces are physician/QA-only, investigational-banner-stamped. A HARD PHI gate (pre-existing, on record) still stands before any real patient touches this.

## What ships

Six phases, all code-reviewed (per-task + whole-branch): durable transcript event log + flush endpoint (P1), final full-transcript differential + investigational card (P2), thoroughness judge + fidelity screen + unvetted-rubric system (P3), independent DeepSeek-R1 differential + agreement metrics + **GET /api/ai/historian/save now Cognito-authed** (P4), batch eval harness + QI report + release gates with committed baseline (P5), synthetic patient conversation driver (P6, live gate deferred — see §5).

## Differential records v2/v3 — review fixes 2026-09-06

`final-ddx-v3` retains v2's optional confidence notes, exclusions and deterministic gaps, with stricter Patient-only quote verification. See [the precision contract](PRD_AI_HISTORIAN.md#2026-09-06-differential-precision-review-fixes-v3). Every new exclusion requires a verified Patient statement (explicit denial or incompatible finding); Historian questions, silence, and AI-generated structured output alone cannot support it. A listed UNASSESSED topic cannot ground an exclusion. Failed quotes remove the entire exclusion and increment `dropped_quotes` and `dropped_exclusions`; listed-topic/hint conflicts are demoted to a matching ranked item's confidence note or dropped. Never-asked phrasing adds an audit flag on retained exclusions.

The **runs view renders v2/v3 fields**, including confidence notes, provisional exclusions and unassessed questions; it also renders dropped-exclusion and audit counts. **Physician DifferentialCard and DdxComparisonCard render confidence_note** beneath rationale as “Confidence limited:”. Excluded/unassessed fields do not reach the patient report or note import. A quoted phrase inside a reason is not verified text; only the `evidence_quote` line passed verification. Historical v2 verified any transcript role; v3 verifies Patient turns only.

UNASSESSED is a **non-exhaustive keyword screen**: base criticals without hints never appear, no syndrome match means the section is omitted, and questions can match without an adequate answer. An empty screen is not proof of completeness; confidence notes may name missed gaps. Abandoned insufficient-transcript sessions produce neither gaps nor a post-interview differential section. The prompt prohibits management/testing/referral/treatment recommendations in reasoning fields.

Saved output uses compact whole-field serialization within 6,000 characters, followed by `[omitted fields: …]` when needed. Unshown/partial fields are unknown and never exclusion evidence. Exclusion reason and evidence quote are limited to 300 characters each; inference budget is 6,000 tokens. **Driver must re-run the live gate for v3**; this change does not run or authorize it.

CLI and live agreement rows both use the shared `withExcludedCount` helper for persisted `excluded_count` (zero for absent/v1 exclusions); scoring still sees only ranked arrays. Deferred: shared prompt-registry entry outside the scope fence and driver-run live-gate validation. This source change does not authorize historical live/backfill steps below.

### Review-fix verification

PR #213 review-fix candidate includes main `0086266` (#211 and #212) via merge `f35c587`. Offline checks: `npx tsc --noEmit` passed; `env -u HISTORIAN_EVAL_LIVE npx vitest run --exclude 'tests/simulated-patients/**'` passed (239 files passed, 4 skipped; 3,435 tests passed, 25 skipped). One full Vitest run for this resume. Focused checks cover Patient-only exclusions, dropped-item counts, gap demotion, audit phrases, whole-field serialization, physician cards, abandoned-session display, and CLI/live agreement metadata parity. No Bedrock/AWS API, live gate, or Next build was run. The scoped PRD and this runbook carry the durable handoff under the review-fix file fence.

## The single approval = these irreversible steps, batched

Everything below is ONE approval. Steps 1–2 are the irreversible ones (RDS + main); the rest are verification.

### 1. Apply migrations to RDS (in order, additive, each has a `.down.sql`)

Migrations are plain SQL, applied by hand per repo convention (no migration runner). Connect to the `ops_amplehtml` RDS database with the same credentials the app uses (see AWS reference doc; use `--profile sevaro-sandbox`). Apply in order:

```
psql "$RDS_CONN" -f migrations/056_historian_transcript_events.sql
psql "$RDS_CONN" -f migrations/057_historian_final_differential.sql
psql "$RDS_CONN" -f migrations/058_historian_evaluations.sql
```

- 056 = new `historian_transcript_events` table (append-only).
- 057 = `ALTER TABLE historian_sessions ADD COLUMN final_differential JSONB`.
- 058 = new `historian_evaluations` table.

**Rollback if needed:** apply the paired `.down.sql` files in reverse order (058 → 057 → 056). 057-down drops the added column (loses any final differentials written; none exist pre-rollout).

**Why migrations go BEFORE the merge (not after):** with `HISTORIAN_EVAL_AUTORUN` default-ON, the moment the merged code is live every historian `/save` fires the evaluators. If the tables/column don't exist yet, each call does real Bedrock work then hits 42P01/42703 and discards the result (fail-open, quiet `console.info` — benign but wasteful spend). Applying first means the first real save persists cleanly.

### 2. Merge the PR

After migrations are confirmed applied (`\d historian_evaluations` etc. succeed), merge [#167](https://github.com/blondarb/OPSAmplehtml/pull/167). Amplify auto-deploys `main`. **This runbook does not auto-merge — Steve merges.**

### 3. Backfill the development baseline

Once deployed, run the batch harness over existing saved sessions to produce the first real QI baseline (fixtures baseline is already committed at `qa/historian-eval/results/2026-07-21/`):

```
HISTORIAN_EVAL_LIVE=1 AWS_PROFILE=sevaro-sandbox npm run historian:eval -- --sessions --since 2026-06-01 --live
```

Output lands in `qa/historian-eval/results/<date>/`. Expect it labeled **"developer baseline — not clinician-vetted"** until the rubrics are vetted (§6).

## §4. Smoke test (Steve, on the deployed app)

The standalone `/patient/historian` surface is the primary verification target (your synthetic-play surface). One synthetic voice session end-to-end:

1. Start a session on `/patient/historian`, run a short synthetic interview by voice (Nova arm — the OpenAI arm is quota-capped, see §5).
2. **During** the interview: confirm the transcript viewer on the physician session panel populates mid-session (proves incremental flush + the event log).
3. **~1 min after** ending: confirm the physician surfaces show (a) the **Differential (AI — investigational)** card with ranked dx + quoted evidence turn-links, (b) the thoroughness score, (c) the independent-DDx comparison card with an agreement badge. All three carry the investigational banner. None appear on any patient-facing surface.
4. Fixtures gate re-run (no session needed): `HISTORIAN_EVAL_LIVE=1 AWS_PROFILE=sevaro-sandbox npm run historian:eval -- --fixtures --live` — expect the same 4-gate table (thoroughness-floor currently FAILs at ~61.6/70; see wrap-up — that is real data about unvetted rubrics, not a software defect).

## §5. Deferred: P6 live gate (tracked as task #8)

The synthetic conversation driver is code-complete and reviewed but its live 5-persona run is **blocked on OpenAI quota** — the `sevaro/openai/ops-amplehtml` key returns `insufficient_quota`. This is the same account state that has kept the historian's OpenAI voice arm 429-capped since 2026-07-09 (Nova Sonic is the working arm). **This likely also affects the production historian's OpenAI arm — worth checking independently of this sprint.** Once quota is restored:

```
PORT=3111 npm run dev   # in one shell
HISTORIAN_EVAL_LIVE=1 AWS_PROFILE=sevaro-sandbox npx tsx scripts/historian-synthetic-run.ts --all-personas --base-url http://localhost:3111
```

Also note: the GA OpenAI Realtime API now rejects the `OpenAI-Beta: realtime=v1` header (`beta_api_shape_disabled`) — the driver already drops it, and the text-message parse shape is defensively guarded (a bad shape hard-fails loudly, never false-PASSes).

## §6. Clinician vetting (Steve, async — gates IRB-grade claims)

Every rubric ships `vetted_by: null` and every report self-labels **"developer baseline — not clinician-vetted"** until you sign off. To vet: review each file in `qa/historian-eval/rubric/` (base + 5 syndromes), correct/confirm the critical questions and coverage hints, set `vetted_by` + `vetted_date`. Also vet each persona's `expectedDDx`/`expectedRedFlags` in `tests/simulated-patients/personas/`. Until then the suite is a software-validation baseline, not a clinical one — which is the honest posture for QI/IRB prep.

## §7. Comms (at wrap-up)

- **Riya** owns the Historian DDx/longitudinal initiative — this suite surfaces the localizer differential she's been building toward. Internal-ring summary at sprint end (no approval stop per standing instruction).
- **Asana** Initiative Portfolio card for the Historian initiative: comment with what shipped + PR #167, tick roadmap subtasks, add follow-on subtasks (clinician vetting, P6 live re-run, security follow-ons from §8).

## §8. Security findings (from final cross-family review — reconciled)

Two-lane final review: a Fable whole-branch review (verdict: ready to merge with fixes — 0 Critical) and a gpt-oss-120b cross-family security pass on the auth/token/endpoint diff. Reconciled outcome:

**Fixed before merge (in commit `cfdd7dc`):**
- GET /api/ai/historian/save (returns names/MRN/transcripts/evaluator content) now sends `Cache-Control: no-store` so no shared cache retains PHI-shaped data.
- POST /api/ai/historian/save no longer returns raw Postgres error text to the client (generic body; detail stays in server logs).
- Structural guard so the AI differential can never render on the unauthenticated patient surface (was comment-gated; now enforced by a required `surface` prop — design decision L1).

**Verified NOT issues (dismissed with evidence):**
- Stored XSS via transcript rendering — impossible: the new components use no `dangerouslySetInnerHTML`; React escapes all text.
- POST /save "overwrite" via client-supplied id — it's a plain INSERT; a duplicate id errors out, it does not overwrite. Reduces to the DoS-flavored posture below.
- Flush-token dev-secret fallback — already fail-closed in production (Task 1).

**Known posture — follow-ons, NOT merge-blockers (POC/no-PHI; these are the app's pre-existing unauthenticated-endpoint stance, already on the HARD PHI gate, not introduced by this sprint):**
- The patient-portal POSTs (session-create, save, transcript-flush) are unauthenticated by design and have no rate-limiting or CSRF protection — before real PHI: add rate-limiting to the unauthenticated writes, bind the flush token to more than sessionId (IP/origin), and enforce seq monotonicity. Track these on the existing security-audit ledger for OPSAmplehtml; they gate real-patient use, not this merge.

**Follow-on task tracker:** #8 (restore OpenAI quota → re-run P6 live gate). The security follow-ons above should be added to the OPSAmplehtml security-audit ledger, not this sprint's scope.

## Off-request evaluation (2026-09-05; human deployment required)
- Measured on an 81-turn synthetic transcript: final differential 45.5 s, thoroughness 34.6 s, independent DDx 13 s.
- Amplify SSR has a ~28–30 s request ceiling and freezes after response; awaiting or fire-and-forget cannot reliably finish this chain.
- Queue mode awaits one pending DB marker; the minute dispatcher sends only `{ sessionId, enqueuedAt }` to SQS.
- The worker loads the transcript from RDS, then runs differential → thoroughness → independent/agreement with 300/240/240 s budgets.
- The existing insufficient-transcript generator stub is preserved; the worker preserves `insufficient_transcript` as a terminal non-error result with `model_id: none` and does not regenerate it on redelivery.
- HUMAN: from `infrastructure/triage-worker`, run `sam build && sam deploy`, review and confirm the change set using the deploy checklist in the infrastructure README.
- HUMAN: verify migrations 057, 058, and 062 (the pending index; 061 was already taken) are applied before the flip. Then set Amplify `HISTORIAN_EVAL_MODE=queue` and REBUILD the app: `next.config.ts` env is build-time, so changing the environment without an Amplify rebuild does not activate queue mode.
- Default is unset (inline chain, with generation failures logged and no error marker written); the existing `HISTORIAN_EVAL_AUTORUN=false` override still disables automatic evaluation.
- Verify a synthetic save with `final_differential->>'status'`: pending → queued → ok/insufficient_transcript/error within ~3 minutes at measured latency; queued may be too brief to observe.
- That is an observation target, not an SLA: queue backlog/retries can take longer; inspect error classes and the DLQ after three transient failures.
- Rollback: unset the Amplify env var and redeploy to restore the inline chain; already queued work still completes.
- Missing column (42703) or unavailable RDS can prevent any marker from being stored; logged persistence failure is not a successful evaluation.
- Deferred: per-evaluator failure markers and a retry contract for thoroughness/independent DDx (transient failures there remain silent); expansion beyond the 48-hour dispatcher window; VPC/networking for non-sandbox. Legacy evaluator log sanitization remains a follow-up. Lifecycle typing/display and queue alarms are handled in this PR.

- The dispatcher schedule starts every minute from SAM deployment, regardless of the Amplify flag. Unsetting the flag prevents new save-route pending markers but does not stop dispatched work or the schedule.
- Both selection and queued marking reclaim `queued` rows whose `queued_at` is older than 60 minutes (more than three 960-second visibility windows), within the existing 48-hour created-at window.
- Redelivery skips terminal differential results and existing thoroughness/agreement rows. These query-before-run guards avoid completed-stage replay on sequential redelivery; they are not a cross-delivery lock. Per-evaluator retries and stronger concurrent dedup remain outside this contract.

Human recovery after inspecting the DLQ and resolving the underlying failure (do not run automatically): inspect status counts first, then bind `$1` to the intended synthetic/governed session ID in an approved SQL client. The guarded update leaves successful and insufficient-transcript results intact. Recent pending/queued rows recover through the dispatcher; older-than-48-hour rows need a separately approved replay because resetting the marker does not widen that window.

```sql
SELECT final_differential->>'status' AS status, count(*)
FROM historian_sessions
WHERE final_differential->>'status' IN ('pending', 'queued', 'error')
GROUP BY 1;

UPDATE historian_sessions
SET final_differential = jsonb_build_object(
  'status', 'pending', 'queued_at', now(), 'source', 'manual_recovery')
WHERE id = $1
  AND created_at > now() - interval '48 hours'
  AND (final_differential->>'status' = 'error'
    OR (final_differential->>'status' IN ('pending', 'queued')
      AND (final_differential->>'queued_at')::timestamptz < now() - interval '60 minutes'));
```

## Flags — attending review (server, A1)

- `HISTORIAN_ATTENDING_ENABLED`: literal `true` enables, default off; `HISTORIAN_ATTENDING_INTERVAL`: positive integer, default/invalid fallback 2. Both are forwarded in `next.config.ts` for Amplify SSR. A2 supplies client consumption; this PR does not activate flags or change Amplify settings.
- Clients without `localizerCycle` skip Step 4 with reason `no_cycle`; A2 supplies the cycle. Safety values `true`, `'true'`, `1`, and `'1'` skip review.
- `AbortSignal.any` (Node 20.3+) is feature-detected; older runtimes use a manual route-abort/timeout combiner with timer and listener cleanup. Setup failures return empty gaps and preserve Step 3.

## Pre-close coverage beta (2026-09-05)
- `NEXT_PUBLIC_HISTORIAN_PRECLOSE_GATE` defaults OFF; literal `true` at build time enables the beta.
- Before the first save, a deterministic server check finds up to three missing topics, critical rubric gaps first.
- Medications, dose/start details, alcohol, family history, and social/occupation require assistant-turn hints; rubric criticals use all turns.
- Henry receives one internal request to ask the missing topics, one question at a time, then save again.
- The second save after rejection and any safety-escalated save finalize without a coverage request.
- Errors, non-200 responses, and the 2500 ms timeout fail open so infrastructure cannot block saving.
- This is substring coverage, not proof of complete answers or clinical validation; no LLM or database is used by the check.

The hook owns the unified localizer channel: `runLocalizer` calls `pushLocalizerContext` once per eligible cycle for every consumer, skipping speech, safety escalation, and empty payloads; the embedded consumer retains its UI/scale handling without forwarding guidance. For pre-close rejection, OpenAI receives the internal note before the tool result triggers its response; Nova receives the tool result first, then the note as the forcing turn. The Nova ordering must be confirmed on a live session. Henry asks each missing item once, accepts declines or unknown answers without re-asking, and then saves again.

### 2026-09-05 attending review (client)

The hook owns the single localizer push channel for every consumer that enables
the localizer; EmbeddedHistorian only receives panel updates. Each request keeps
the existing eight-turn transcript and adds a per-session call counter, the
existing safety-escalation state, and full transcript turns trimmed from the
oldest end to at most 60,000 text characters. Counters reset at session start.

Both providers privately receive only the first sanitized attending gap as the
next-question suggestion. Absent/empty gaps leave the delta byte-identical.
Speaking and safety guards remain in place. Nova is limited to 12 localizer
injection attempts per session; OpenAI instruction rewrites remain uncapped.
Safety escalation and pre-close messages use their existing separate paths and
are not charged against this localizer ceiling. No server flags are changed.

Patient-route reach: `/patient/historian` runs the localizer only when `NEXT_PUBLIC_HISTORIAN_PATIENT_STEER=true` (build-time, default off; PR #212); the clinician panel stays gated on `clinicianMirror`. Until that flag is on, attending gaps reach Henry only on `/consult/triage-historian` and the embedded consult flow.

## Patient-route steer flag (2026-09-05)
- `NEXT_PUBLIC_HISTORIAN_PATIENT_STEER=true` (build-time; Amplify rebuild required) makes `NeurologicHistorian` run the localizer on `/patient/*` routes. Only Henry's private steer consumes the result (localizer hints and, with `HISTORIAN_ATTENDING_ENABLED`, attending-review gaps); the differential panel remains gated on the `clinicianMirror` prop, which no patient route sets.
- Default off. Until it is on, `/patient/historian` runs the prompt alone — no localizer, no attending review — and only `/consult/triage-historian` exercises them.


### Localizer latency budget (2026-09-06)

A synthetic eight-turn window on main measured Step 1 at 5.4–5.8 s, Step 2 at 2.1 s, and Step 3 at 13.3 s with `stop=max_tokens` at 900 tokens: 20.7 s total exceeded the unchanged 15 s outer budget, leaving the patient steer empty while Step 4 (~5 s) returned attending gaps. Step 3 now starts a compact 300-token steer (3a) and the unchanged 900-token clinician detail (3b) concurrently with attending review, all using the existing signals and budgets. Completed detail preserves the legacy response and persistence; if detail fails or times out, completed steer supplies questions, localization, names/likelihood, and the push (including only a registry-matched scale id), with empty rationale/exclusions/actions and a partial reason. This reduces steer-critical output rather than raising the budget (Sonnet 4.6 measured ~70 output tokens/s; Amplify SSR caps at 30 s and a 20 s steer arrives a turn late). Each processed request emits one JSON `localizer_timing` line with `sessionId`, `step1_ms`, `step2_ms`, `step3a_ms`, `step3b_ms`, `attending_ms`, `total_ms`, `partial`, and `aborted`; durations use Date.now() deltas and are null for steps that did not run. Logs contain only timing, status, session id, and step names, never transcript, prompt, symptom, question, or model text. Mocked tests verify fallback and compatibility; live latency acceptance remains deferred.
