# Historian Validation Suite — Rollout Runbook

**Branch:** `feature/historian-validation-suite` · **PR:** [#167](https://github.com/blondarb/OPSAmplehtml/pull/167)
**Status:** awaiting Steve's single rollout approval. Nothing below has been run against live RDS or main.
**Scope reminder:** POC / no real PHI. All evaluator surfaces are physician/QA-only, investigational-banner-stamped. A HARD PHI gate (pre-existing, on record) still stands before any real patient touches this.

## What ships

Six phases, all code-reviewed (per-task + whole-branch): durable transcript event log + flush endpoint (P1), final full-transcript differential + investigational card (P2), thoroughness judge + fidelity screen + unvetted-rubric system (P3), independent DeepSeek-R1 differential + agreement metrics + **GET /api/ai/historian/save now Cognito-authed** (P4), batch eval harness + QI report + release gates with committed baseline (P5), synthetic patient conversation driver (P6, live gate deferred — see §5).

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
