# Sevaro Clinical - AI-Powered Clinical Documentation

Neurology outpatient web app: clinical notes, AI assistance, voice dictation, dot phrases, clinical scales, patient management.

## Deploy Workflow

**Push-to-deploy is enabled.** After making code changes:
1. Run local dev server (`preview_start`) and verify (no console errors, feature works)
2. Commit and push to `main` — Amplify auto-deploys
3. Do NOT wait for user approval — test locally first, then ship it

## Tech Stack

| Component | Technology |
|-----------|------------|
| Framework | Next.js 15.1.x with App Router, TypeScript |
| Styling | Tailwind CSS v3 + Inline Styles |
| Database | AWS RDS (PostgreSQL) via node-postgres |
| Auth | AWS Cognito OAuth + PKCE via Hosted UI at `auth.neuroplans.app` |
| AI | AWS Bedrock (Claude Sonnet 4.6 + Nova 2 Sonic via Bedrock Bidirectional Stream) + OpenAI Whisper + Realtime API (WebRTC fallback) |
| SMS/Voice | Twilio (SDK v5) for live patient follow-up demos |
| Deployment | AWS Amplify (push-to-deploy from main) |

## Key Patterns

- **Database:** All queries use `from()` / `wearableFrom()` from `@/lib/db-query` (node-postgres pools to RDS). Auth via `@/lib/cognito/server`.
- **Middleware:** `src/middleware.ts` — session refresh, simplified pass-through (avoids edge function issues).
- **AI Models:** gpt-5-mini (Q&A, chart prep, field actions), gpt-5.2 (visit extraction, assessment, briefings), Bedrock Sonnet 4.6 (triage, localizer), **Nova 2 Sonic** (`amazon.nova-2-sonic-v1:0`, default voice engine for `/consult` historian + `/follow-up` agent via `services/nova-sonic-relay/`), OpenAI Realtime `gpt-realtime-2` (switchable fallback; `VOICE_PROVIDER=openai` or `?voice=openai`).
- **Auth:** Cognito pool `us-east-2_9y6XyJnXC`, client `6rahc3cs4846f05gf7fbucqi4d`. httpOnly cookies (id_token 1h, refresh_token 30d, 50-min proactive refresh).
- **Voice env vars:** `VOICE_PROVIDER` (default `nova`; set to `openai` for fallback), `NOVA_SONIC_RELAY_URL` + `NEXT_PUBLIC_NOVA_SONIC_RELAY_URL` (relay WSS URL), `NOVA_SONIC_VOICE_ID` (optional), `OPENAI_FOLLOWUP_REALTIME_MODEL` (default `gpt-realtime-2`). Relay-side: `NOVA_SONIC_REGION` (`us-east-1`), `NOVA_SONIC_MODEL_ID` (`amazon.nova-2-sonic-v1:0`), `PORT` (8081).
- **Smart Recommendations:** 127 clinical plans synced from `blondarb/neuro-plans` via `npm run sync-plans`. ICD-10 scored matching links diagnoses to plans.

## Key Routes

| Route | Purpose |
|-------|--------|
| `/` | Homepage — 6-card demo platform |
| `/physician` | Clinical Cockpit (schedule + time-phased briefing) |
| `/dashboard` | Operations Dashboard (5-zone command center) |
| `/ehr` | Patient chart workspace |
| `/wearable` | Wearable monitoring dashboard |
| `/triage` | AI-assisted referral triage |
| `/consult` | Neuro Intake with AI Historian |
| `/follow-up` | Patient Follow-Up Agent (SMS + voice) |
| `/sdne` | SDNE XR assessment integration iframe |

## Commands

```bash
# Local dev
npm run dev

# Type check
npx tsc --noEmit

# Build
npm run build
```

## Known Gotchas

- `@/lib/db-query` `from()` auto-stringifies plain objects but passes arrays through raw — JSONB array columns (e.g. `transcript`, `red_flags`) must be `JSON.stringify()`'d at the call site before insert.
- Amplify SSR env vars require `next.config` inline block for runtime access (not just `process.env`).
- Triage route uses 202+poll pattern — do not attempt SSE streaming (reverted in PR #111 due to ~28s Amplify gateway timeout).
- `/consult` Historian uses WebRTC Realtime API — requires HTTPS and browser mic permission.
- **Nova Sonic path requires the relay running** (`services/nova-sonic-relay/` — standalone Node WebSocket container). Set `NOVA_SONIC_RELAY_URL` + `NEXT_PUBLIC_NOVA_SONIC_RELAY_URL` to the relay WSS URL; the browser connects there, not directly to Bedrock. Without the relay, Nova voice will fail silently on connect.
- **Nova Sonic is us-east-1 only** (Bedrock `InvokeModelWithBidirectionalStream` is not yet available in us-east-2). Relay env var `NOVA_SONIC_REGION=us-east-1`; the rest of the app's Bedrock calls remain in us-east-2.
- Nova's `requestResponse` tool-call pattern is a no-op (the relay ignores it); the early-end save flush is best-effort on the Nova path — raw transcript is always preserved, but structured `save_interview_output` may not fire if the user hard-ends the session.

## Recent Changes (Summary)

- **Follow-up voice agent: AI escalations now reach the dashboard (2026-06-05)**: Demo-only. Fixed a pre-existing bug (predates the Nova migration) where the voice `/follow-up` hook silently dropped the AI's tool-driven escalation. `useFollowUpRealtimeSession.handleToolCall` read `args.escalation_flags` (an array the `save_followup_output` schema never declares); the schema actually emits flat `escalation_triggered`/`escalation_tier`/`escalation_reason` fields. Reconciled via the smaller change (option b, schema unchanged): added a pure `escalationFlagFromToolOutput()` helper in `src/lib/follow-up/escalationRules.ts` that maps those fields onto an `EscalationFlag` (tier validated w/ `informational` fallback, tier-derived `recommendedAction`, returns null when not triggered), and the hook now calls it. AI-detected escalations fire `onEscalation` → the page `EscalationAlert` banner **and** the `ClinicianDashboard` "Escalation Flags" section (same wiring the working SMS path uses), alongside the existing client-side regex net (`scanForEscalationTriggers`). Unit-tested in `src/lib/follow-up/__tests__/escalationRules.test.ts` (7 cases incl. a regression guard for the legacy `escalation_flags` shape). QA case VP5. **Bedrock model-access grant landed 2026-06-05** (`amazon.nova-2-sonic-v1:0` us-east-1: authorization/entitlement/agreement/region all AVAILABLE), and the relay↔Bedrock bidirectional stream was verified to open locally with no access error — so the only remaining step is the live voice E2E with real mic audio (patient speaks an urgent symptom → AI fires `escalation_triggered`).

- **Nova 2 Sonic voice migration (2026-06-05)**: Demo-only. Both voice surfaces (`/consult` AI Historian and `/follow-up` voice agent) migrated from OpenAI Realtime (WebRTC) to Amazon Nova 2 Sonic (`amazon.nova-2-sonic-v1:0`, us-east-1, Bedrock `InvokeModelWithBidirectionalStream`) behind a switchable `VoiceProvider` abstraction. New standalone Node WebSocket relay (`services/nova-sonic-relay/`) bridges browser ⇄ relay ⇄ Bedrock (IAM-role auth, containerized for App Runner) — required because Nova Sonic has no browser/WebRTC path and the Amplify Lambda timeout is incompatible with a long-lived WS. Audio pipeline: `src/lib/voice/` with PCM16↔base64 encoding, 16 kHz mic capture (AudioWorklet), and gapless 24 kHz PCM playback with barge-in. Both hooks (`useRealtimeSession`, `useFollowUpRealtimeSession`) refactored onto the provider; public APIs and all clinical-harness logic (safety keywords, red-flag detection, localizer cadence, paginated scales, escalation, structured save) unchanged. Provider toggle: `VOICE_PROVIDER` env (default `nova`) + in-app `VoiceProviderToggle` on both routes (localStorage-persisted; `?voice=nova|openai` deep-link). Directive referral-anchored historian opening added: when a referral reason is known the AI opens by stating it back to the patient instead of asking open-ended. Moves patient-facing voice onto the BAA-covered AWS/Bedrock stack (HIPAA-eligible). **Bedrock model access granted 2026-06-05** (`amazon.nova-2-sonic-v1:0` us-east-1 — authorization/entitlement/agreement/region all AVAILABLE; relay↔Bedrock stream opens locally with no access error). Remaining validation: live A/B listen test + the VP5 escalation-audio test (both need real spoken audio in a browser).

- **AI Historian Realtime API + Harness Upgrade (2026-05-27)**: Demo-only `/consult` Step 2 historian migrated to OpenAI's current GA Realtime API (`client_secrets` + `/v1/realtime/calls` + `gpt-realtime-2` + `semantic_vad`). Tool surface consolidated to 3 (save_interview_output, query_evidence, scale_step — paginated). New Localizer push channel via re-serialized `session.update` (base prompt + delta, every 3 turns). Phased prompt structure (turns 1-3 open, turns 4+ tool-augmented) with explicit neurology focus + 15-25 turn budget. Migration 047 added paginated state to `scale_results` + relaxed NOT NULL on `patient_id`/`responses`/`raw_score` (legacy submit flow had been silently failing). Env flags `OPENAI_HISTORIAN_REALTIME_MODEL` / `HISTORIAN_TURN_DETECTION_MODE` for hot-revert. Spec + plan + 2-round cross-check audit trail + pre/post eval rubric in `docs/superpowers/` and `qa/historian-baselines/`. (Demo-only; multi-modal + prior-visits explicitly future agents.)

- **Triage async+polling (PRs #112-113, May 2)**: `/api/triage` + `/api/triage/extract` now return 202 immediately and clients poll `/api/triage/[id]/result`; migration 046 dropped NOT NULL on result columns so pending rows insert cleanly.
- **Neuro Intake depth pass (PR #109, Apr 25)**: Scale-trigger pipeline wired in `EmbeddedHistorian`; AI Assessment+Plan synthesis via `assessment-generator.ts`; physician corrections persisted; 7 safety fields extracted from referrals; historian fully embedded inline.
- **SSO error surfacing on `/login` (2026-04-22)**: Tester reported "I click the sign in with Sevaro SSO and it gives me an error" with no further detail — because the app was showing none. The callback route (`src/app/api/auth/callback/route.ts`) was collapsing every Cognito failure into generic `no_code` / `token_exchange` codes, discarding the `error` + `error_description` params Cognito sends back. The login page (`src/app/login/page.tsx`) then rendered one of three canned strings. Fix: callback now (a) checks for Cognito's `error` param before `code` and propagates both `error` and `error_description` to `/login`, and (b) on token-exchange failure, parses the error body for `error_description` (falling back to the raw body truncated to 200 chars). Login page now shows a specific headline per code (including `access_denied` → "Sign-in was cancelled.") plus the actual description, and a hint to contact the administrator. Feedback session `ad9e5708-476a-470c-a38f-b0f209526dae` marked addressed.

- **Consult save + mobile differential fixes (2026-04-17)**: Fixed "Failed to save interview data" error on `/consult` — root cause identical to the triage `2d1e445` fix: the shared `buildInsert` in `src/lib/db-query.ts` auto-stringifies plain objects but passes arrays through raw (for `text[]` compat), so `historian_sessions.transcript` and `red_flags` (both JSONB arrays) hit node-postgres as JS arrays-of-objects and the insert 500'd. Pre-stringified those fields at the call site in `src/app/api/ai/historian/save/route.ts`, and applied the same fix to `historian_red_flags` inside `linkHistorianToConsult` (`src/lib/consult/pipeline.ts`) so the consult advances to `historian_complete`. Also addressed mobile physician differential visibility: `LocalizerPanel` was a fixed 340px wide (clipped on 322px viewports) → now `width: 100%` with `maxWidth: 340px`; `EmbeddedHistorian` auto-opens the panel once the first localizer result arrives, and the toggle label changed from "MD View"/"Hide" to "Differential"/"Hide Dx" so mobile users can actually find it. Feedback session `9f2a87dc-ac02-42f9-b1ba-34ac161e0403` marked addressed.

- **Consult interview early-end fix (2026-04-17)**: Fixed critical `/consult` bug where clicking "End Interview" before the AI called `save_interview_output` silently dropped the entire intake — both `historian_structured_output` and `historian_summary` were written as null and the review step rendered "No interview data available" despite the patient answering. `useRealtimeSession.endSession` now (a) nudges the AI to flush via the open data channel and waits up to 4s for refs to populate, and (b) falls back to storing the raw transcript as `narrative_summary` so data is never lost. Hardened `EmbeddedHistorian` to check `res.ok` on the save POST (fetch doesn't throw on 4xx/5xx). Added an `interview_completion_status` column (`complete` | `ended_early`, nullable) to both `historian_sessions` and `neurology_consults` via migration 044 (applied to `ops_amplehtml`); `IntakeReviewSection` shows an amber "partial intake" banner when `ended_early`. Feedback session `027f134f-b383-4134-aec6-a7fdaa3fbc52` marked addressed.

- **Consult page feedback fixes (2026-04-17)**: Addressed 5 tester-reported issues on `/consult`. Voice-interview reliability: raised server_vad threshold 0.5→0.65 and silence_duration_ms 700→1200 in `/api/ai/historian/session` to stop speakerphone echo from interrupting the AI mid-sentence; attached remote `<audio>` element to DOM (iOS Safari routing requirement) and added explicit `echoCancellation`/`noiseSuppression`/`autoGainControl` mic constraints in `useRealtimeSession`. Mobile layout: responsive padding on `/consult` page container, compact `FeatureSubHeader` (hide link labels <640px, title ellipsis), pipeline bar labels shrink then hide <380px, actor side panel stacks below main <900px, `overflow-wrap: anywhere` on streaming text and transcript entries in `EmbeddedHistorian`. Auto-end: `useRealtimeSession` now exposes `interviewCompleted` which flips on `save_interview_output` tool call; `EmbeddedHistorian` auto-ends the session 1.5s after the AI finishes its closing message. Feedback session `18250867-ca49-460c-bd85-df91dbdb3f55` marked addressed.

- **OAuth SSO Migration (2026-03-27)**: Migrated auth from direct Cognito SDK (USER_PASSWORD_AUTH) to OAuth + PKCE via Cognito Hosted UI at `auth.neuroplans.app`. Removed `amazon-cognito-identity-js` dependency. Created new OAuth API routes (login, callback, logout, refresh, me). Replaced AuthContext with cookie-based auth (httpOnly cookies, proactive 50-min refresh). All 80+ API routes work unchanged via `getUser()`. Login page now redirects to SSO. Signup handled by Hosted UI. Evidence Engine pool `us-east-2_9y6XyJnXC`, client `6rahc3cs4846f05gf7fbucqi4d`.

- **Integrated Neuro Intake Engine — Phases 1–7 (2026-03-20)**: Built the complete 7-phase clinical pipeline: (1) Triage & Intake with 11-state ConsultStatus machine, (2) AI Historian integration with camelCase LocalizerRequest contract, (3) Background Localizer with Bedrock-powered differential generation, (4) Red Flag Escalation with 20+ pattern detector wired into useRealtimeSession, (5) Patient Web Tools — interactive SVG body map (26 regions), finger tapping test, accelerometer tremor detector, (6) SDNE Integration linking XR exam results to consults, (7) Unified Report Generator with pure-function builder and physician-facing viewer. New tables: `patient_body_map_markers`, `patient_device_measurements`, `consult_reports`, plus SDNE columns on `neurology_consults`. Migrations 036–038 pending against RDS. See `docs/HANDOFF_2026-03-20_neuro-intake-engine.md`.

- **AI Triage Consistency Improvements (2026-03-12)**: Pushed triage scoring consistency from 96% toward 99%+ target. Added clinical anchoring examples (2-3 neurology-specific examples per score level for all 5 dimensions) and tie-breaking rules to the system prompt. Changed production defaults: temperature 0.2→0 (greedy decoding), aligned maxTokens to 3000 across both route.ts and runTriage.ts. Added token usage passthrough in `invokeBedrockJSON` and logging to `triage_sessions` table (new `ai_input_tokens`/`ai_output_tokens` columns). Updated playbook pseudocode to reflect deterministic red flag escalation, synced system prompt section, replaced OpenAI model references with Bedrock Sonnet 4.6. Added Triage section to `docs/AI_PROMPTS_AND_MODELS.md`.

- **Wearable Narrative Enhancements (2026-03-05)**: Added "Generate 30-Day Summary" button to PatientTimeline header for longitudinal narrative generation. Added regenerate (refresh) buttons to ClinicalNarrativePanel and LongitudinalSummaryBanner. Added auto-generation logic that detects assessments without narratives on data load/poll/patient-switch and generates them sequentially with progress indicator.

- **AI Clinical Narrative Pipeline (2026-03-04)**: Split DiseaseTrack into MotorTrack + CognitiveTrack. Built 2-stage AI pipeline (Bedrock extraction → narrative) for `analyze-assessment`. "Generate AI Clinical Interpretation" buttons on each assessment card produce clinical narratives with severity-flagged findings. See `docs/HANDOFF_2026-03-04_clinical-narrative-pipeline.md`.

- **Wearable Dashboard Data Fixes (2026-03-02)**: Fixed 6 data display issues on `/wearable` for real Apple Watch data: resting HR 0 treated as null, sleep fallback to total bar when stages unavailable, server-side rolling 7-day averages, auto-computed baselines from actual data, diagnosis-aware Disease Track (ET vs PD), 15-minute auto-refresh polling. See `docs/HANDOFF_2026-03-02_wearable-dashboard-fixes.md`.

- **SevaroMonitor iOS Sleep Fixes (2026-03-02)**: Fixed overnight sleep split (6 PM-to-6 PM window instead of midnight) and added per-stage sleep breakdown (Deep, Light, REM, Awake) to HealthKit collection. Changes in `blondarb/SevaroMonitor` repo.

- **Live Follow-Up Agent Phase A: SMS (2026-02-25)**: Implemented real-phone SMS demo for Follow-Up Agent. User enters phone number on conversation page, receives a real Twilio text, replies via SMS, and the clinician dashboard updates via polling. New files: `twilioClient.ts` (send/validate), `conversationEngine.ts` (shared AI turn logic), `send-sms/route.ts` (initiate), `twilio-sms/route.ts` (webhook), `LiveDemoPanel.tsx` (UI). Migration 031 fixes schema mismatches and adds `followup_phone_sessions` table. Refactored `message/route.ts` to use shared engine. `ClinicianDashboard` now accepts `liveSessionId` prop for Realtime subscription. See `docs/plans/2026-02-25-live-followup-sms-plan.md` for implementation plan.

- **Cockpit/Dashboard Separation (2026-02-25)**: Separated Clinician Cockpit and Operations Dashboard into distinct tools. Cockpit (`/physician`) redesigned as a 2-column layout: Schedule (~380px, with week-strip nav, mini-month grid, prep badges) | Time-Phased Briefing (Morning/Midday/End of Day with phase-specific narratives, icons, gradients). Notifications moved to a bell-triggered 380px slide-over drawer with enhanced cards showing inline clinical data (vitals, wearable readings). Breadcrumb bar ("< Home | Clinician Cockpit | Demo") added for navigation. Dashboard (`/dashboard`) renamed to Operations Dashboard with new Zone 1 Operational Summary. Homepage rearranged to 4+3 layout. See `docs/plans/2026-02-25-cockpit-dashboard-separation-design.md`.

- **Live Follow-Up Agent Design (2026-02-25)**: Design doc for real phone demo — Twilio SMS + OpenAI Realtime voice. User enters phone number, gets a real text, can reply or call back. Dashboard updates in real-time. See `docs/plans/2026-02-25-live-followup-agent-design.md`. Playbook `04_post_visit_agent.md` updated with Phase 1.5 roadmap.

- **Physician Workspace Card Breakout**: Replaced single "Physician Workspace" homepage card with 3 cards:
  - **Clinician Dashboard** → `/dashboard` (Command Center — 5-zone AI dashboard)
  - **My Schedule** → `/physician` (schedule-first via `initialViewMode="appointments"`, click patient for inline chart swap)
  - **Documentation** → `/ehr` (lands directly on patient chart via `initialViewMode="chart"`, random patient selection, supports `?patient=ID`)
  - Command Center card moved from Ongoing Care track to Clinician track (Ongoing Care now has 2 cards: Follow-Up Agent + Wearable)
  - `ClinicalNote` now accepts `initialViewMode` prop (`'cockpit' | 'appointments' | 'chart'`)
  - `fetchDashboardData()` accepts optional `patientId` for specific patient loading
  - Client wrapper components (`PhysicianPageWrapper.tsx`, `EhrPageWrapper.tsx`) handle Server→Client icon serialization boundary

Full changelog: [`docs/CHANGELOG.md`](docs/CHANGELOG.md)

## Body of Work

**Status**: Active — verified May 27, 2026

### Recent
- **Nova 2 Sonic voice migration (2026-06-05, branch feat/nova-sonic-voice)** — Migrated `/consult` historian + `/follow-up` agent from OpenAI Realtime (WebRTC) to Amazon Nova 2 Sonic via a new WebSocket relay service (`services/nova-sonic-relay/`). VoiceProvider abstraction added with in-app toggle and env-driven provider switch. Moves voice onto the BAA-covered Bedrock stack. Bedrock model access granted 2026-06-05 (relay↔Bedrock connectivity verified locally); remaining validation = live A/B listen test + VP5 escalation-audio test.
- **Triage migration 046: drop NOT NULL on result columns (PR #113, May 2)** — Dropped NOT NULL constraints on triage result columns so pending rows can be inserted before AI populates results; migration 046 applied to `ops_amplehtml`; fixes the root cause that required the async+polling rework.
- **Triage async + polling pattern (PR #112, May 2)** — Replaced the reverted SSE streaming approach (PR #110 was reverted by PR #111 due to persistent Amplify ~28s gateway timeout failures); `/api/triage` and `/api/triage/extract` now use a 202 Accept + poll pattern consistent with other heavy Lambda endpoints; eliminates the gateway timeout without fragile streaming.
- **Neuro Intake pipeline depth pass (PR #109, Apr 25)** — (1) Scale-trigger pipeline wired: `EmbeddedHistorian` now evaluates triggers, fetches instruction blocks, and formally administers PHQ-9/GAD-7/HIT-6/MIDAS/ESS/MoCA in live session; deduplication via `injectedScaleIdsRef`. (2) AI Assessment+Plan synthesis: new `assessment-generator.ts` calls Bedrock Sonnet 4.6 with full report as context, appends `{ assessment, plan[], confidence }` sections. (3) Corrections persisted: physician corrections lifted to `PatientToolsStepPanel`, PUT to `/api/neuro-consults/[id]` notes field. (4) Triage safety extraction: 7 safety fields extracted from referrals including `safety_symptom_onset_time` (critical for tPA window). (5) Diagnosis correction: historian is fully embedded inline.
- **SSO error surfacing on /login (PR #108, Apr 22)** — Cognito `error` + `error_description` params now propagated through callback route to login page; `access_denied` → "Sign-in was cancelled"; actual error description shown with admin contact hint.
- **Consult JSONB stringify + mobile differential fix (PR #107, Apr 17)** — Fixed "Failed to save interview data" on `/consult`: `historian_sessions.transcript` and `red_flags` (JSONB arrays) were passing as raw JS arrays to node-postgres — pre-stringified at call site in `historian/save/route.ts` and in `linkHistorianToConsult`. Mobile: `LocalizerPanel` width changed from fixed 340px to `width:100%/maxWidth:340px`; `EmbeddedHistorian` auto-opens differential on first localizer result; toggle label updated to "Differential"/"Hide Dx".
- **Consult early-end interview preservation (PR #106, Apr 17)** — Fixed silent data loss when "End Interview" is clicked before AI calls `save_interview_output`: `useRealtimeSession.endSession` nudges AI via data channel and waits up to 4s, then falls back to raw transcript as `narrative_summary`. Added `interview_completion_status` column (complete | ended_early) via migration 044; amber "partial intake" banner shown when `ended_early`.
- **Consult tester feedback fixes + sample personas + actor briefing + SDNE iframe (PR #105, Apr 17)** — Addressed 5 tester feedback items on /consult page (layout, validation, flow); added sample patient personas and actor briefing section for demo flow; pointed SDNE iframe to sense.neuroplans.app production URL.

### In Progress
- None

### Planned
- Real-time voice streaming during encounters (AWS Transcribe Medical, HIPAA-eligible — next priority after triage async+polling shipped May 2)
- Diagnosis plan coverage expansion (98 plans in DB, 148/166 diagnoses covered — 18 diagnoses still missing)
- Speaker diarization UI (P2)
- Recommendation reconciliation engine (P2)
- Inpatient clinical scales (GCS, mRS, FOUR Score, Hunt & Hess, ICH, CAM-ICU, RASS)

### Known Issues
- Bedrock Amplify SSR env var wiring requires `next.config` inline for runtime access
- 18 neurology diagnoses still lack treatment plans in the database

## Documentation Update Policy

**IMPORTANT: Every commit must include updates to relevant documentation.** Documentation is never "a follow-up task" — it ships with the code.

**On every commit, review and update as needed:**

1. **CLAUDE.md** (this file) - Add to "Recent Changes" section for any notable change
2. **docs/IMPLEMENTATION_STATUS.md** - Mark features as COMPLETE/PENDING
3. **docs/CONSOLIDATED_ROADMAP.md** - Update status and completion dates
4. **Relevant PRD or handoff docs** in `docs/` - Keep feature specs accurate
5. **qa/TEST_CASES.yaml** - Add or update test cases for new/changed behavior
6. **API docs** (`docs/API_CONTRACTS.md`, `docs/AI_PROMPTS_AND_MODELS.md`) - Update if endpoints or models change

**Rule: If code changes, docs change in the same commit.** No exceptions. This prevents documentation drift and keeps the project source of truth reliable.

## QA Rules of Engagement

All test artifacts live in `qa/`. See those files for full details — this section is the short reference.

| File | Purpose |
|------|--------|
| `qa/TEST_RUNBOOK.md` | Stable baseline test plan (smoke + regression + mobile + role-based) |
| `qa/TEST_CASES.yaml` | Structured test cases with IDs, preconditions, steps, expected results |
| `qa/BUG_TEMPLATE.md` | Bug report template (repro, expected/actual, env, logs) |
| `qa/RELEASE_CHECKLIST.md` | Pre-deploy and post-deploy checks |
| `qa/runs/RUN_TEMPLATE.md` | Per-release run log template (copy, fill, save as `RUN-YYYY-MM-DD-NNN.md`) |

**Key rules:**
1. **Stable baseline + mission brief** — The runbook is stable. Each release gets a short mission brief in `qa/runs/` listing only the delta. Do not recreate the full plan each run.
2. **Every deploy runs smoke suite** (S1-S5) plus the mission brief's focus cases.
3. **VS Code (Claude Code)** = planner. **Chrome (Claude Code for Chrome)** = executor.
4. **Mobile-first**: Every run includes at least one 375px check (E1).
5. **Versioned**: `runbook_version` and `test_cases_version` tracked in file headers. Bump when flows/cases change.
