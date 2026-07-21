# Historian Validation Suite — Design Spec

**Date:** 2026-07-20 · **Author:** Claude (Fable 5) + cross-family panel review (DeepSeek-R1, gpt-oss-120b on Bedrock) · **Status:** awaiting Steve's kickoff approval
**Owner note:** Historian DDx/longitudinal initiative is Riya's lane on the Synapse Lab board — this validation suite is adjacent tooling; summary goes to her at sprint end.

## 1. Goal

Make every AI Historian session auditable and scored, producing the data substrate for future QI/IRB validation protocols:

1. **Durable transcript** — full patient↔historian conversation survives crashes, is integrity-checked, and is visible on physician surfaces.
2. **DDx surfaced** — the pipeline's differential (with likelihood, rationale, quoted supporting evidence) shown to Steve per session.
3. **Thoroughness reviewer** — an AI judge scores whether the historian gathered appropriate data (with confidence and cited evidence), plus a report-fidelity screen (patient/physician reports vs transcript).
4. **Independent DDx scorer** — a different model family generates its own DDx from the transcript alone; agreement metrics vs the pipeline's DDx and vs synthetic ground truth.
5. **Batch harness** — one command re-runs all evaluators over selected sessions and emits a versioned, banner-stamped report with release gates.

**Non-goals (this sprint):** patient-facing DDx (never), voice/ASR-error simulation (manual baselines continue to cover it), persona library expansion beyond 5 (follow-on), blinded multi-rater ground-truth panels (IRB-phase follow-on), full API-auth remediation (existing deferred systemic finding; PHI HARD gate stands).

## 2. Current state (verified 2026-07-20)

- Historian = realtime voice agent (OpenAI `gpt-realtime-2` WebRTC default; Nova Sonic WS arm via relay), lives in OPSAmplehtml (`/consult` Step 2 embedded + standalone `/patient/historian` + triage referral-clarification mode).
- Transcript: client-side `useRealtimeSession` state (entries: role + text + timestamp-offset), persisted **only at session end** via `POST /api/ai/historian/save` → `historian_sessions.transcript` JSONB (RDS Postgres `ops_amplehtml`). Crash mid-session = total loss. No UI shows it.
- The interview agent is prompt-hardened to **never diagnose**. DDx exists in the **Background Localizer** (`localizer/route.ts`): every 3 patient turns, Bedrock 3-step pipeline (symptom extraction → neuro_plans evidence retrieval → differential+questions), sliding last-8-turns window, persists to `neurology_consults.localizer_differential` (consult-linked sessions only).
- Eval infra to reuse: `tests/simulated-patients/` (5 personas: acute-stroke, first-seizure, migraine-chronic, ms-relapse, peripheral-neuropathy — each with `expectedDDx`, `expectedRedFlags`, `historyResponses`, graded by `grading.ts`) and the triage-sentinel pattern (`src/lib/triage/sentinel/`: deterministic + live branches, release-gates JSON with `scope: synthetic_software_release_only` / `clinicalValidationClaim: false`, banner-stamped md/json reports, per-branch cost/latency telemetry).
- LLM plumbing: `src/lib/bedrock.ts` — use `invokeBedrockClinicalTool` (schema-forced tool call; the flake-proof path the triage scorer moved to).

## 3. Architecture

### 3.1 Data (migrations 056+, additive-only, each with a down file)

- **`historian_transcript_events`** (new, append-only): `id, session_id, seq, role, text, ts_offset_s, created_at`. Written by the flush endpoint; never updated or deleted (tamper-evident by construction; crash recovery = replay events). Final save still writes consolidated `historian_sessions.transcript` JSONB (backward compatible; consolidation validated against the event log).
- **`historian_sessions.final_differential`** (new JSONB column): the full-transcript final DDx (see 3.3) — works for standalone sessions with no consult.
- **`historian_evaluations`** (new): `id, session_id, evaluator` (`thoroughness` | `independent_ddx` | `fidelity` | `agreement`), `model_id, prompt_version, rubric_version, inference_params JSONB, result JSONB, cost_usd, latency_ms, created_at`. **Provenance is mandatory** — every evaluator output records exact model ID, prompt version, rubric version, and params (IRB reproducibility; panel finding).

### 3.2 Transcript durability (P1)

- `POST /api/ai/historian/transcript-flush`: accepts a batch of new entries; **session token in `Authorization: Bearer` header** (never URL), same minting pattern as existing session endpoints; rate-limited. Client flushes every 3 turns, on transport error, and via `navigator.sendBeacon` on `pagehide`.
- Deterministic integrity checks at save: entry schema validity, monotonic `seq`/timestamps, event-log vs consolidated-JSONB consistency, transcript token-count guard (fail-closed flag if a transcript ever exceeds evaluator context budget — not expected at turn-cap 25, guarded anyway).
- UI: collapsible turn-by-turn transcript viewer (roles, timestamps) in `HistorianSessionPanel` + `HistorianReportView`. Physician surfaces only.

### 3.3 Final DDx pass + surfacing (P2)

- At session save: one **full-transcript** localizer-style pass (not sliding-window), grounded via `retrievePlanEvidence()` against neuro_plans (the KB path is dead — do not use `BEDROCK_KB_ID`). Output schema: ranked `[{diagnosis, icd10, likelihood: High/Med/Low + pct, rationale, supporting_quotes: [{turn, quote}], contradicting_quotes}]` + provenance block. Persisted to `final_differential`.
- UI card **"Differential (AI — investigational)"**: ranked list, likelihood, rationale with quoted evidence and turn links. Banner text from a **single shared constant** (also used by reports; CI-lintable). Physician/QA surfaces only; no ordering pathways exist in this app and none are added.
- Thoroughness score (P3) is stored alongside so DDx-quality-vs-thoroughness correlation is analyzable (we deliberately do NOT gate DDx on thoroughness — the correlation is the validation insight; panel suggestion rejected with rationale).

### 3.4 Thoroughness judge + fidelity screen (P3)

- `src/lib/historian/eval/thoroughnessJudge.ts` — **Bedrock Sonnet 4.6** (cross-family vs the OpenAI interviewer), `invokeBedrockClinicalTool`. Input: transcript + chief complaint + structured HPI output. Output: per-dimension scores (OLDCARTS coverage; syndrome red-flag screening; PMH/meds/allergies/FH/SH; question quality/no leading; no-diagnosis-leak; closure quality), missed critical questions w/ severity, overall 0–100, confidence H/M/L with reason, evidence turn refs.
- **Fidelity screen** (same judge run, separate dimension): patient report + physician report vs transcript — fabricated claims (in report, not in transcript) and material omissions (in transcript, missing from report). For driver-generated sessions (P6), also checked against the persona script.
- Deterministic pre-layer (0 model calls): diagnosis-leak lexicon, phase-marker presence (opening/closing scripts), turn-cap adherence, `save_interview_output` schema validity. Lexicon is a screen; the LLM dimension catches indirect leakage.
- **Rubric** = versioned JSON in `qa/historian-eval/rubric/` (JSON-Schema-validated by a unit test): base neuro-HPI checklist + per-syndrome critical-question lists for the 5 persona syndromes. Files carry `version`, `vetted_by`, `vetted_date`. **Steve clinically vets rubrics AND each persona's `expectedDDx`/`expectedRedFlags` (async); until vetted, every report auto-labels itself "developer baseline — not clinician-vetted"** (panel finding: unvalidated ground truth otherwise poisons all downstream metrics).
- Auto-runs async post-save behind `HISTORIAN_EVAL_AUTORUN` (default ON; app is POC/no-PHI per 2026-07-12 decision), fail-open, cost logged per run.

### 3.5 Independent DDx scorer + agreement (P4)

- `independentDdx.ts` — **DeepSeek-R1 on Bedrock** (`us.deepseek.r1-v1:0`; third family: OpenAI interviews, Sonnet judges, R1 second-opinions), transcript-only input, blind to `final_differential`. Same output schema + provenance.
- Agreement (deterministic first): ICD-10 **category-level (3-char) matching** before exact-code (panel finding: granularity mismatches like G40.x cause false disagreements), then Haiku 4.5 equivalence adjudication only for unmatched synonym cases. Metrics: top-1 match, top-3 overlap/Jaccard, flagged disagreements.
- Synthetic cases: both DDx lists scored against persona `expectedDDx` (top-1/top-3 hit rates).
- UI: side-by-side DDx comparison card, agreement badge, disagreement flag.

### 3.6 Batch harness + report (P5)

- `npm run historian:eval` → `scripts/historian-eval.ts` (runtime-injected CLI, sentinel-style): session selection (date/persona/tag/ids), runs all evaluators, emits `qa/historian-eval/results/{date}/report.{md,json}`.
- Report: banner (shared constant), **honest-n statistics** (states n, marks the 5 personas as *development set* — tuning allowed, no held-out claims; IRB-grade claims require a future held-out persona set — panel finding), per-case scorecards, aggregates with score ranges (judge nondeterminism is measured, not hidden), gate pass/fail, per-evaluator cost/latency table, full provenance block.
- `qa/historian-eval/release-gates.json`: thoroughness floor, zero diagnosis-leaks, DDx top-3 ground-truth hit rate, independent-agreement floor — all `scope: synthetic_software_release_only`, `clinicalValidationClaim: false`.
- First run backfills existing saved sessions, labeled "development baseline" (pre-existing sessions may have informed historian tuning — contamination noted per panel).

### 3.7 Synthetic conversation driver (P6 — pending Q1)

- Server-side harness opens a real OpenAI Realtime session (text modality) with the REAL historian system prompt + tools; a persona-conditioned patient LLM (Bedrock Sonnet) answers; N-turn conversation → flows through the same flush/save/evaluator pipeline. Repeatable unattended batches.
- Documented limitation: text modality doesn't exercise ASR/barge-in — the manual voice baseline rubric (`qa/historian-baselines/`) remains the voice-truth check.
- OpenAI direct (no BAA) — synthetic personas only; consistent with the app's existing historian usage.

## 4. Phases & gates

| Phase | Deliverable | Eval gate (evals, not approvals) |
|---|---|---|
| P1 | Durable transcript (events table, flush endpoint, viewer, integrity checks) | Simulated mid-session kill retains all turns up to last flush; integrity + schema tests pass |
| P2 | Final DDx pass + investigational UI card | Expected dx in top-3 for ≥4/5 personas' transcripts (recorded baseline, not tuned) |
| P3 | Thoroughness judge + fidelity screen + rubrics | Stability: same transcript ×3 → overall spread ≤10 pts; discriminant validity: degraded transcript (red-flag Qs removed) scores ≥15 pts lower |
| P4 | Independent DDx + agreement metrics | Agreement + ground-truth metrics computed and rendered for all 5 personas |
| P5 | Batch harness + QI/IRB-style report + gates | End-to-end run over ≥5 sessions produces complete report incl. provenance + honest-n |
| P6 | Synthetic conversation driver (if approved) | Unattended 5-persona batch completes; transcripts pass P1 integrity checks |

Per-phase: executor subagent (Sonnet 5) implements; commit → push → PR per phase. **Single batched prod-irreversible approval at rollout:** apply migrations to RDS + merge to main (Amplify auto-deploys). Everything else flag-gated/reversible.

## 5. Locked decisions

L1 DDx physician/QA-facing only — never patient-facing. · L2 Evaluators auto-run async, fail-open, `HISTORIAN_EVAL_AUTORUN` default ON (POC/no-PHI). · L3 Model routing: Sonnet 4.6 thoroughness / DeepSeek-R1 independent DDx / Haiku 4.5 adjudication — all Bedrock BAA, no metered keys; cross-family at every layer. · L4 Fidelity screen included in P3. · L5 Reuse sentinel + simulated-patients patterns; `invokeBedrockClinicalTool`. · L6 Final full-transcript DDx pass (sliding-window localizer unchanged for live use). · L7 Versioned, banner-stamped artifacts. · **L8 (panel)** Append-only transcript event log; Bearer-header token; sendBeacon flush. · **L9 (panel)** Mandatory provenance (model/prompt/rubric versions + params) on every evaluator output. · **L10 (panel)** Clinician-vetting workflow: rubrics + persona ground truth carry `vetted_by`; unvetted ⇒ reports self-label "developer baseline". · **L11 (panel)** Honest-n + dev-set labeling; held-out persona set and library expansion = follow-on sprint. · **L12 (panel)** ICD-10 category-level matching before LLM adjudication.

Panel suggestions **rejected** (rationale): replace independent LLM scorer with deterministic rules (contradicts the core ask — rules can't generate a DDx); thoroughness-gates-DDx ordering (we want DDx-vs-thoroughness correlation measurable on all sessions); usability study (solo-user QA surface; revisit at pilot); client-side encrypted write-ahead log (POC overkill; sendBeacon + append-only events suffice); interactive latency SLAs (evaluators are async; UI shows pending state).

## 6. Open questions (for Steve, batched)

- **Q1:** P6 conversation driver in this sprint? (Rec: IN)
- **Q2:** Which surface do you use for synthetic play — `/consult`, standalone `/patient/historian`, both? (Sets verification priority)
- **Q3:** Kickoff approval — run as specced?

## 7. Risks

Judge nondeterminism (measured via stability gate; ranges reported) · unauthenticated patient-portal surface (Bearer scoping + rate limit now; systemic API-auth finding remains deferred behind the existing PHI HARD gate — transcript store added to that gate's checklist) · dead `query_evidence` KB (out of scope; final pass grounds via neuro_plans) · migration numbering collisions (056+ verified free at write time) · Riya lane adjacency (summary at sprint end; Asana card update at wrap-up).
