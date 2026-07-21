# Historian Validation Suite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Durable historian transcripts + final DDx with evidence + AI thoroughness/fidelity judge + independent cross-family DDx scorer + batch QI/IRB eval harness + synthetic conversation driver.

**Architecture:** Append-only transcript event log flushed mid-session; post-save async evaluator pipeline (Bedrock, schema-forced tool calls) writing to `historian_evaluations` with mandatory provenance; sentinel-style CLI harness with fixtures mode (no DB) and sessions mode; text-modality OpenAI Realtime driver reusing the real historian prompt/tools.

**Tech Stack:** Next.js App Router route handlers, node-postgres via `src/lib/db-query.ts`, `src/lib/bedrock.ts` (`invokeBedrockClinicalTool` / `invokeBedrockJSON`), vitest, OpenAI Realtime WS (driver only).

**Spec:** `docs/superpowers/specs/2026-07-20-historian-validation-suite-design.md` (read it before any task).

## Global Constraints

- Synthetic data only; no PHI. Never log patient text to console in server code.
- Banner text comes ONLY from `INVESTIGATIONAL_BANNER` in `src/lib/historian/eval/constants.ts` (Task 2 creates it; every later surface imports it).
- Every evaluator output embeds `provenance: {model_id, prompt_version, rubric_version?, inference_params, generated_at}` — no exceptions.
- Migrations: additive only, numbered 056+ (verify highest number at write time — collisions happened before), each with a paired `.down.sql`.
- Models: Bedrock only for evaluators — Sonnet `us.anthropic.claude-sonnet-4-6`, DeepSeek `us.deepseek.r1-v1:0`, Haiku (verify exact inference-profile id via `aws bedrock list-inference-profiles --profile sevaro-sandbox --region us-east-2 | grep -i haiku`). The driver (Task 7) may use the app's existing OpenAI key (that IS the historian). No other metered keys.
- Tokens in `Authorization: Bearer` headers, never URLs. Page-unload flush uses `fetch(..., {keepalive: true})` — NOT `navigator.sendBeacon` (beacon can't set headers).
- Evaluators are async, fail-open, gated by `HISTORIAN_EVAL_AUTORUN` (default ON: treat unset as enabled, `'false'` disables).
- Repo gotcha: `db-query.ts` auto-stringifies plain objects but NOT top-level arrays passed as JSONB — pre-stringify arrays (see `save/route.ts:20-24` precedent).
- All LLM-dependent tests are live-gated: `it.skipIf(!process.env.HISTORIAN_EVAL_LIVE)(...)`. Deterministic logic gets normal always-on vitest coverage, TDD.
- Run tests: `npx vitest run <path>`. Typecheck: `npx tsc --noEmit`. Both must pass before each commit.
- Branch: `feature/historian-validation-suite` off `origin/main` (fetch first; never branch off a stale local HEAD). Commit per step-group, push per task.

---

### Task 1: Durable transcript (P1)

**Files:**
- Create: `migrations/056_historian_transcript_events.sql` + `migrations/056_historian_transcript_events.down.sql`
- Create: `src/app/api/ai/historian/transcript-flush/route.ts`
- Create: `src/lib/historian/flushToken.ts`
- Create: `src/lib/historian/transcriptIntegrity.ts`
- Create: `src/components/historian/HistorianTranscriptViewer.tsx`
- Modify: `src/app/api/ai/historian/session/route.ts` (mint sessionId + flush token)
- Modify: `src/hooks/useRealtimeSession.ts` (flush every 3 entries, on transport error, keepalive on pagehide)
- Modify: `src/app/api/ai/historian/save/route.ts` (accept sessionId, integrity cross-check)
- Modify: `src/components/consult/HistorianSessionPanel.tsx`, `src/components/HistorianReportView.tsx` (render viewer)
- Test: `tests/historian-eval/transcriptIntegrity.test.ts`, `tests/historian-eval/flushToken.test.ts`

**Interfaces (later tasks rely on):**
- `HistorianTranscriptEntry` stays the existing shape (`role`, `text`, `timestamp` seconds-offset) + new optional `seq: number`.
- `validateTranscript(entries: HistorianTranscriptEntry[]): {valid: boolean; issues: string[]}`
- `mintFlushToken(sessionId: string): string` / `verifyFlushToken(token: string): {sessionId: string} | null` (HMAC-SHA256 over `NOVA_RELAY_SHARED_SECRET`-style secret — reuse the mint pattern in `session/route.ts:28-47`; new env `HISTORIAN_FLUSH_SECRET`, fallback to existing shared secret if unset).

**Key design points (verify, then implement):**
1. **SessionId must exist before save.** Today the `historian_sessions` row appears only at `/save`. Change `/session` (both providers' branches) to also return `{sessionId: <server uuid>, flushToken}`; `/save` accepts an optional `sessionId` and uses it as the row id (verify the id column type in `save/route.ts` insert first; if ids are server-generated there today, thread the same generator). Events carry NO foreign key — keyed by `session_id` text — so flushing works before the session row exists.
2. Event insert is idempotent: `ON CONFLICT (session_id, seq) DO NOTHING` (retries + keepalive duplicate sends are expected).

- [ ] **Step 1: Failing tests for `validateTranscript` + token round-trip** — checks: monotonic `seq`, non-negative monotonic `timestamp`, known roles, non-empty text, duplicate-seq detection; `verifyFlushToken(mintFlushToken('abc'))` → `{sessionId:'abc'}`, tampered token → null.
- [ ] **Step 2: Run, confirm both fail** (`npx vitest run tests/historian-eval/`).
- [ ] **Step 3: Implement `transcriptIntegrity.ts` + `flushToken.ts`; tests green.**
- [ ] **Step 4: Migration 056** —

```sql
CREATE TABLE historian_transcript_events (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  ts_offset_s INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, seq)
);
CREATE INDEX idx_hte_session ON historian_transcript_events (session_id, seq);
```

Down file drops the table. Do NOT apply to RDS — rollout task does that.
- [ ] **Step 5: Flush endpoint** — POST body `{sessionId, entries:[{seq, role, text, tsOffsetS}]}`; Bearer token verified and its `sessionId` must equal body `sessionId` (403 otherwise); ≤50 entries/request, seq cap 500/session (413 beyond); idempotent insert; returns `{accepted}`. No auth beyond token (patient-portal pattern) — but never echo entry text in errors.
- [ ] **Step 6: Client flush in `useRealtimeSession.ts`** — buffer entries with `seq` assigned at append; flush when ≥3 unflushed, on provider error event, and on `pagehide` via keepalive fetch; never block the UI; failures retry next flush (fail-open).
- [ ] **Step 7: Save-route integrity cross-check** — on save, run `validateTranscript`; store `transcript` as today plus nothing destructive; log (server-side, no text) event-count vs transcript-length mismatch. 
- [ ] **Step 8: `HistorianTranscriptViewer`** — collapsible turn list (role chip, mm:ss from offset, text), takes `entries` prop; render in `HistorianSessionPanel` + `HistorianReportView` (physician surfaces). For sessions with a saved transcript use it; no new GET endpoint needed this task.
- [ ] **Step 9: Crash-sim gate** — vitest: build 10 entries, flush batches of 3 via route handler invoked directly with a pg mock (follow existing route-test patterns if present; otherwise test the insert-builder function extracted from the route), simulate death after seq 9 → assert events 1–9 retained, consolidation from events matches. Typecheck + full test run green.
- [ ] **Step 10: Commit + push** (`feat(historian): durable transcript event log + viewer (P1)`).

### Task 2: Final DDx pass + investigational card (P2)

**Files:**
- Create: `migrations/057_historian_final_differential.sql` (+ `.down.sql`): `ALTER TABLE historian_sessions ADD COLUMN final_differential JSONB;`
- Create: `src/lib/historian/eval/constants.ts` (`INVESTIGATIONAL_BANNER`, `PROMPT_VERSIONS` map)
- Create: `src/lib/historian/eval/finalDifferential.ts`
- Create: `src/lib/historian/eval/bedrockMeta.ts` (wrapper returning `{result, usage, latencyMs, modelId}` around `invokeBedrockClinicalTool` / `invokeBedrockJSON` without changing their signatures)
- Create: `src/components/historian/DifferentialCard.tsx`
- Create: `tests/historian-eval/fixtures/personaTranscripts.ts`
- Modify: `src/app/api/ai/historian/save/route.ts` (async fire-and-forget behind `HISTORIAN_EVAL_AUTORUN`)
- Modify: `HistorianReportView.tsx` + `HistorianSessionPanel.tsx` (render card, pending state)
- Test: `tests/historian-eval/finalDifferential.gate.test.ts` (live-gated), `tests/historian-eval/fixtures.test.ts`

**Interfaces:**
```ts
export interface DifferentialItem {
  diagnosis: string; icd10: string | null;
  likelihood: 'High' | 'Moderate' | 'Low'; likelihood_pct: number;
  rationale: string;
  supporting_quotes: {turn: number; quote: string}[];
  contradicting_quotes: {turn: number; quote: string}[];
}
export interface FinalDifferential {
  differential: DifferentialItem[]; summary: string;
  provenance: EvalProvenance; // {model_id, prompt_version, inference_params, generated_at}
}
export function generateFinalDifferential(transcript: HistorianTranscriptEntry[], chiefComplaint?: string): Promise<FinalDifferential>
export function buildPersonaTranscript(personaFile: string): {transcript: HistorianTranscriptEntry[]; chiefComplaint: string; expectedDDx: string[]}
```

- [ ] **Step 1:** `personaTranscripts.ts` — convert each `tests/simulated-patients/personas/*.json` `historyResponses` Q&A into alternating assistant/user entries with synthetic offsets + seq. TDD: fixture test asserts all 5 personas produce ≥8 turns, roles alternate, expectedDDx non-empty.
- [ ] **Step 2:** `finalDifferential.ts` — symptom extraction reuse (`localizer/route.ts` `SYMPTOM_EXTRACTOR_PROMPT` — import if exported, else lift into a shared module), `retrievePlanEvidence()` grounding, then ONE schema-forced Sonnet call (tool schema mirrors `DifferentialItem[]`, max 6 items, quotes MUST be verbatim substrings of transcript text — instruct + post-validate; drop non-verbatim quotes and log count). Prompt version `final-ddx-v1` registered in `PROMPT_VERSIONS`. Deterministic guard: if serialized transcript > 60k chars, throw `TranscriptTooLargeError` (fail-closed).
- [ ] **Step 3:** Wire into save route: after row insert, `void runFinalDifferential(sessionId, transcript)` catch-all → persist via `UPDATE historian_sessions SET final_differential = $1` (pre-stringify). Never delays the response.
- [ ] **Step 4:** `DifferentialCard` — banner (from constant) at top, ranked list, likelihood badge + pct, rationale, quoted evidence with turn links into the Task-1 viewer; `pending` state when column null. Physician surfaces only.
- [ ] **Step 5: Gate (live)** — for each persona: build transcript → `generateFinalDifferential` → expected dx (normalized casefold substring OR ICD-10 category match — reuse Task 4's `normalizeIcd10` is not available yet, use substring now) in top-3. PASS = ≥4/5. Record actual hits in the test output; do not tune prompts to the gate in this task.
- [ ] **Step 6:** Typecheck + tests + commit + push (`feat(historian): final full-transcript differential + investigational card (P2)`).

### Task 3: Thoroughness judge + fidelity + rubrics (P3)

**Files:**
- Create: `migrations/058_historian_evaluations.sql` (+ down):

```sql
CREATE TABLE historian_evaluations (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  evaluator TEXT NOT NULL,          -- 'thoroughness' | 'independent_ddx' | 'agreement'
  model_id TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  rubric_version TEXT,
  inference_params JSONB,
  result JSONB NOT NULL,
  cost_usd NUMERIC(10,6),
  latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_he_session ON historian_evaluations (session_id, evaluator, created_at DESC);
```
- Create: `qa/historian-eval/rubric/rubric.schema.json`, `base-neuro-hpi.json`, `syndromes/{acute-stroke,first-seizure,migraine-chronic,ms-relapse,peripheral-neuropathy}.json`
- Create: `src/lib/historian/eval/rubric.ts` (load + JSON-Schema validate + pick by syndrome/chief complaint, fallback base-only)
- Create: `src/lib/historian/eval/deterministicChecks.ts`
- Create: `src/lib/historian/eval/thoroughnessJudge.ts`
- Create: `src/lib/historian/eval/persistEvaluation.ts`
- Modify: save route (queue thoroughness after final DDx, sequential, both fail-open)
- Test: `tests/historian-eval/rubric.test.ts`, `deterministicChecks.test.ts`, `thoroughnessJudge.gate.test.ts` (live)

**Rubric file shape** (`rubric.schema.json` enforces):
```json
{ "version": "stroke-v1", "syndrome": "acute-stroke", "vetted_by": null, "vetted_date": null,
  "critical_questions": [ {"id": "onset-time", "question": "Exact time of symptom onset / last known well", "severity": "critical"} ],
  "expected_dimensions": ["oldcarts", "red_flags", "pmh_meds_allergies", "fh_sh"] }
```
Draft rubric content clinically (OLDCARTS + per-syndrome red-flag/critical questions: stroke = LKW, anticoagulants, thrombolysis contraindications; seizure = first vs recurrent, tongue-biting/incontinence, alcohol/withdrawal, driving; migraine = thunderclap, fever/neck stiffness, papilledema sx, medication-overuse; MS = prior episodes/optic neuritis, bladder sx; neuropathy = distribution, diabetes, B12/alcohol, weight loss). Mark every file header comment `[training knowledge — Steve to vet]`; `vetted_by: null` until he signs.

**Judge tool schema (`ThoroughnessEvaluation.result`):** per-dimension `{score: 0-100, evidence_turns: number[], notes}` for the 6 dimensions (oldcarts, red_flags, pmh_meds_allergies, fh_sh, question_quality, closure) + `missed_critical_questions: [{rubric_id, severity, why_it_matters}]` + `diagnosis_leak: {leaked: boolean, quotes: []}` + `fidelity: {fabricated_claims: [{report, claim}], material_omissions: [{transcript_turn, omission}]}` (only when reports provided) + `overall: 0-100` + `confidence: {level: High/Moderate/Low, reason}`.

- [ ] **Step 1:** Rubrics + schema + loader, TDD (all files validate; unknown syndrome → base; version strings unique).
- [ ] **Step 2:** `deterministicChecks.ts` TDD — diagnosis-leak lexicon scans ASSISTANT turns only (seed list: "you have", "sounds like you might have", "consistent with", "my diagnosis", disease names from rubric syndromes followed by assertion patterns; keep the lexicon exported + unit-tested for both hit and clean cases); phase-marker presence (opening/closing script fragments from `historianPrompts.ts` `PHASED_INTERVIEW_STRUCTURE` — import the constants, don't copy strings); turn-cap ≤25 patient turns; structured-output schema validity.
- [ ] **Step 3:** `thoroughnessJudge.ts` — deterministic layer first (its failures are appended to the LLM result, never skipped); one Sonnet schema-forced call with rubric inline; `unvetted` flag propagated into result when `vetted_by` null. Judge prompt version `thoroughness-v1`. Instruct: cite turn numbers for every dimension score; missed questions must reference rubric ids; do not award >85 overall if any `critical` rubric item is unasked.
- [ ] **Step 4:** `persistEvaluation.ts` — insert with provenance + cost (compute from usage via a `MODEL_PRICING` map in constants; unknown model → null cost, never throw).
- [ ] **Step 5: Gates (live):** stability — migraine persona ×3 → max-min overall ≤10; discriminant — stroke persona with LKW/anticoagulant/red-flag Q&A pairs stripped scores ≥15 below intact. Record numbers in test output.
- [ ] **Step 6:** Wire into save route after final DDx. Typecheck + tests + commit + push (`feat(historian): thoroughness judge, fidelity screen, vetted rubric system (P3)`).

### Task 4: Independent DDx + agreement (P4)

**Files:**
- Create: `src/lib/historian/eval/independentDdx.ts` (DeepSeek-R1 via `invokeBedrockJSON` with `model: 'us.deepseek.r1-v1:0'` — R1 has no tool-use on Bedrock; strict-JSON instruction + existing truncation-repair; validate against the same `DifferentialItem[]` schema with ajv or hand-rolled guard, retry once on invalid)
- Create: `src/lib/historian/eval/agreement.ts`
- Create: `src/components/historian/DdxComparisonCard.tsx`
- Modify: save route (queue after thoroughness)
- Test: `tests/historian-eval/agreement.test.ts` (pure, TDD), `independentDdx.gate.test.ts` (live)

**Interfaces:**
```ts
export function normalizeIcd10(code: string | null): string | null // 'G43.909' → 'G43'
export interface AgreementResult { top1Match: boolean; top3Overlap: number; jaccardTop3: number;
  matchedPairs: {a: string; b: string; via: 'icd10' | 'adjudicated'}[]; disagreements: string[]; }
export function computeAgreement(a: DifferentialItem[], b: DifferentialItem[], adjudicate?: (pairs: [string,string][]) => Promise<boolean[]>): Promise<AgreementResult>
export function scoreAgainstGroundTruth(ddx: DifferentialItem[], expected: string[], adjudicate?: ...): Promise<{top1Hit: boolean; top3Hit: boolean}>
```

- [ ] **Step 1:** `agreement.ts` TDD — cases: exact ICD match; category match (G43.1 vs G43.909 → matched); no-ICD synonym pair ("TIA" vs "transient ischemic attack") routed to injected fake adjudicator; Jaccard math; empty lists.
- [ ] **Step 2:** `independentDdx.ts` — prompt: transcript ONLY (no structured output, no localizer artifacts — blindness is the point), same output shape, prompt version `independent-ddx-r1-v1`. Haiku adjudicator (`adjudicateEquivalence`) with verified model id; batch pairs in one call.
- [ ] **Step 3:** Persist both (`independent_ddx`, `agreement`) via `persistEvaluation`. `DdxComparisonCard`: two columns + agreement badge + disagreement flag; banner constant.
- [ ] **Step 4: Gate (live):** all 5 personas → agreement metrics + both-vs-expectedDDx ground truth computed and printed as a table in test output. No threshold this task — recorded baseline.
- [ ] **Step 5:** Typecheck + tests + commit + push (`feat(historian): independent R1 differential + agreement metrics (P4)`).

### Task 5: Batch harness + report (P5)

**Files:**
- Create: `scripts/historian-eval.ts` (thin wrapper, mirrors `scripts/triage-sentinel.ts` runtime-injection style)
- Create: `src/lib/historian/eval/cli.ts`, `src/lib/historian/eval/report.ts`
- Create: `qa/historian-eval/release-gates.json`
- Modify: `package.json` (`"historian:eval": "tsx scripts/historian-eval.ts"` — match how `triage:sentinel` invokes)
- Test: `tests/historian-eval/report.test.ts` (pure render from canned results), `cli.test.ts` (injected runtime)

**Modes:** `--fixtures` (default: 5 personas, no DB — usable pre-rollout and in CI) | `--sessions <ids|--since date>` (DB rows). Flags: `--live` required for any Bedrock call (mirror `assertLiveAllowed()`), `--out qa/historian-eval/results/<yyyy-mm-dd>[-vN]/`.

**Release gates (`release-gates.json`):** `thoroughness-floor` (mean overall ≥70), `zero-diagnosis-leaks` (eq 0), `ddx-top3-ground-truth` (≥0.6), `independent-agreement-top3` (≥0.5) — every gate `"scope": "synthetic_software_release_only"`, plus top-level `"clinicalValidationClaim": false`. Thresholds are starting points; report shows value vs threshold.

**Report (md+json):** banner; provenance table (models, prompt/rubric versions incl. vetted status → auto-label "developer baseline — not clinician-vetted" if any rubric unvetted); honest-n line ("n=5 development-set personas; tuning permitted; no held-out claims"); per-case scorecards; aggregate with min/mean/max (ranges, not point estimates); gate table; cost/latency per evaluator.

- [ ] Steps: TDD report renderer from canned JSON → assert banner, dev-baseline label, gate math (pass/fail edge cases) → cli with injected runtime (fs/env/stdout) → live fixtures run over all 5 personas writing `qa/historian-eval/results/<date>/` → commit results as the first development baseline → push (`feat(historian): batch eval harness + QI report (P5)`).

### Task 6: Synthetic conversation driver (P6)

**Files:**
- Create: `scripts/historian-synthetic-run.ts`, `src/lib/historian/synthetic/realtimeTextClient.ts`, `src/lib/historian/synthetic/patientAgent.ts`
- Test: `tests/historian-eval/patientAgent.test.ts` (prompt assembly, pure), live smoke via the script itself

**Design:**
- `realtimeTextClient`: WS to `wss://api.openai.com/v1/realtime?model=<OPENAI_HISTORIAN_REALTIME_MODEL>` with `session.update` `{modalities:['text'], instructions: buildHistorianSystemPrompt(...), tools: <the real historian tool defs — import from where session/route.ts sources them>}`. Handles `response.output_text.*`, function calls: `scale_step`/`query_evidence` → POST the real local API routes (`--base-url`, default `http://localhost:3000`); `save_interview_output` → capture args, end conversation.
- `patientAgent`: Bedrock Sonnet, persona-conditioned ("You are the patient described below. Answer ONLY what was asked, 1–3 conversational sentences, don't volunteer your whole history, use the persona's facts verbatim where relevant"), fed the persona JSON (`demographics`, `historyResponses`, `structuredHistory`).
- Loop: historian text → patient reply → repeat until save-tool call, 25 patient turns, or 10-min wall clock. Every turn ALSO POSTed through the real `/api/ai/historian/transcript-flush` (with a real minted session from `/api/ai/historian/session?textMode=1` — add a `textMode` param that skips voice-credential minting but still returns `{sessionId, flushToken}`), then final POST `/save`. The full P1–P4 pipeline runs exactly as production.
- Output: prints sessionId + evaluator statuses; `--all-personas` runs the 5 sequentially.
- [ ] Steps: TDD patientAgent prompt assembly → realtimeTextClient against a mock WS server (happy path + function-call path) → `textMode` session-mint change → live smoke: 1 persona end-to-end against `npm run dev` → then `--all-personas` batch; gate = 5/5 complete + every stored transcript passes `validateTranscript` → commit + push (`feat(historian): synthetic patient conversation driver (P6)`).

### Task 7: Rollout runbook (Steve's single approval — do NOT execute without it)

- [ ] Write `docs/HISTORIAN_VALIDATION_ROLLOUT.md`: exact `psql` commands for 056/057/058 (+ down commands), the PR link, post-merge Amplify check, backfill command (`npm run historian:eval -- --sessions --since 2026-06-01 --live`), smoke-test checklist for Steve on `/patient/historian` (run one synthetic session by voice → transcript viewer populates mid-session → DDx card + thoroughness card appear within ~1 min → `npm run historian:eval -- --fixtures --live` passes gates).
- [ ] Riya summary draft + Asana Portfolio card update happen at wrap-up per global policy.

## Self-Review Notes

- Spec §3.2 keepalive/Bearer → Task 1 steps 5–6. §3.3 quotes-verbatim validation → Task 2 step 2. §3.4 vetting/dev-baseline label → Task 3 step 1 + Task 5 report. §3.5 R1-no-tool-use workaround → Task 4. §3.6 fixtures mode pre-rollout → Task 5. §3.7 real-pipeline driver → Task 6. Provenance → `bedrockMeta.ts` + `persistEvaluation`. No spec section lacks a task.
- Type check: `DifferentialItem`/`FinalDifferential` defined Task 2, consumed Tasks 4–6 under the same names; `validateTranscript` defined Task 1, consumed Task 6 gate.
