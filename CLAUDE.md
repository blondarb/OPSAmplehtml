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
| AI | AWS Bedrock (Claude Sonnet 4.6) + OpenAI Whisper + Realtime API (WebRTC) |
| SMS/Voice | Twilio (SDK v5) for live patient follow-up demos |
| Deployment | AWS Amplify (push-to-deploy from main) |

## Key Patterns

- **Database:** All queries use `from()` / `wearableFrom()` from `@/lib/db-query` (node-postgres pools to RDS). Auth via `@/lib/cognito/server`.
- **Middleware:** `src/middleware.ts` — session refresh, simplified pass-through (avoids edge function issues).
- **AI Models:** gpt-5-mini (Q&A, chart prep, field actions), gpt-5.2 (visit extraction, assessment, briefings), Bedrock Sonnet 4.6 (triage, localizer), Realtime API (historian).
- **Auth:** Cognito pool `us-east-2_9y6XyJnXC`, client `6rahc3cs4846f05gf7fbucqi4d`. httpOnly cookies (id_token 1h, refresh_token 30d, 50-min proactive refresh).
- **Smart Recommendations:** 127 clinical plans synced from `blondarb/neuro-plans` via `npm run sync-plans`. ICD-10 scored matching links diagnoses to plans.

## Key Routes

| Route | Purpose |
|-------|---------|
| `/` | Homepage — 6-card demo platform |
| `/physician` | Clinical Cockpit (schedule + time-phased briefing) |
| `/ehr` | Documentation (direct chart access) |
| `/dashboard` | Command Center (5-zone AI operations dashboard) |
| `/patient/historian` | AI Neurologic Historian (WebRTC voice interview) |
| `/mobile` | Mobile-optimized clinical interface |

## On-Demand Reference (read before touching these areas)

| Area | Read first |
|------|-----------|
| Database schema | `docs/SCHEMA_REFERENCE.md` |
| API endpoints | `docs/API_CONTRACTS.md` |
| AI prompts & models | `docs/AI_PROMPTS_AND_MODELS.md` |
| Feature status | `docs/IMPLEMENTATION_STATUS.md` |
| Full changelog | `docs/CHANGELOG.md` |
| Product playbooks | `playbooks/00-06` (read relevant playbook before modifying any card) |
| PRDs | `docs/PRD_*.md` |
| Roadmap | `docs/CONSOLIDATED_ROADMAP.md` |

## Environment Variables

Required in Amplify console: `NEXT_PUBLIC_COGNITO_*` (4), `COGNITO_CLIENT_SECRET`, `RDS_*` (5), `BEDROCK_*` (3). Optional: `OPENAI_API_KEY`, `TWILIO_*` (3).

## QA

All test artifacts in `qa/`. Stable runbook + per-release mission briefs in `qa/runs/`. Every deploy runs smoke suite (S1-S5). Claude Code = planner, Chrome = executor.

## Commands

```bash
npm run dev          # Dev server
npm run build        # Production build
npm run sync-plans   # Sync neuro-plans JSON to RDS
```

## Deployment

Deployed on AWS Amplify. Push to `main` triggers auto-deploy.

Environment variables are set in the Amplify console (see "Environment Variables" section above).

## Git Workflow

- Main branch: `main` (production)
- Feature branches: `claude/review-repo-design-*`
- Push to feature branch, create PR, merge to main for deployment

## Recent Changes

- **Triage streaming SSE — fix /api/triage 504s (2026-04-29)**: Tester-visible bug — PDF batch triage on `/triage` returned 504 from CloudFront and the route logged `AbortError` at the in-route 45s timer. Root cause: Amplify Hosting Compute caps buffered SSR responses at ~28s (CloudFront read timeout) regardless of the route's `maxDuration` config. Bedrock Sonnet 4.6 calls for triage and PDF extraction routinely run 22–35s and were exceeding the gateway. The 2026-04-25 safety-history extraction (STEP 6.5, 7 new fields) pushed typical latency past the 28s wall; the prior `c82f757` had cut the abort to 25s for "CloudFront compat" then `c0bb61d` reverted, leaving the gateway as the gating factor. Fix: switch `/api/triage` and `/api/triage/extract` from buffered `NextResponse.json` to streaming `text/event-stream` SSE responses. Bytes flow within the first second and a 5s heartbeat keeps the connection alive, decoupling response time from the gateway timeout. New `invokeBedrockJSONStreaming` in `src/lib/bedrock.ts` (parallel to `invokeBedrockJSON`, uses `InvokeModelWithResponseStreamCommand`, same JSON repair). New `src/lib/triage/streamClient.ts` exports `streamPostJSON` / `streamPostFormData` helpers that consume SSE and resolve a Promise — so the existing client call sites at `src/app/triage/page.tsx` (4 sites) and `src/components/consult/TriageStepPanel.tsx` (1 site) stay structurally the same. Input validation still returns plain JSON 400s; the helper detects content-type and routes accordingly. `maxDuration` raised to 120s for headroom. No prompt or scoring changes; response shape byte-identical to prior. Local smoke verified wire format on both routes; the gateway-timeout fix is validated on the Amplify preview build attached to this PR.

- **Neuro Intake pipeline depth pass (2026-04-25)**: Five-part hardening of the `/consult` flow.
  (1) **Scale-trigger pipeline wired**: `EmbeddedHistorian` now consumes `onLocalizerUpdate` from `useRealtimeSession`, evaluates triggers via `/api/ai/historian/scales?action=trigger`, fetches the instruction block via `?action=administer`, and calls `injectScaleAdministration` so the AI formally administers PHQ-9 / GAD-7 / HIT-6 / MIDAS / ESS / MoCA in the live session. On `save_scale_responses`, results POST to `?action=submit` for scoring + persistence in `scale_results`. Trigger and admin endpoints were fully built (Phase 3) but had no consumer; this closes that loop. Deduplication via `injectedScaleIdsRef` prevents re-administering an in-flight scale.
  (2) **Assessment + Plan added to consult report**: New `assessment-generator.ts` module calls Bedrock Sonnet 4.6 with the entire built report (CC, HPI, OLDCARTS, differential, scales, red flags, SDNE, body map, devices) as context. Returns `{ assessment, plan[], confidence, uncertainty_notes }` JSON. `appendAssessmentAndPlan` adds them as `source: 'ai_synthesis'` sections at the end of `report.sections`. The report-builder remains a pure function — the AI call lives only in the route. Failure is non-fatal: if Bedrock errors out, the structured report still saves.
  (3) **Review corrections persisted**: `IntakeReviewSection` now lifts its `corrections` state up to `PatientToolsStepPanel` via `onCorrectionsChange`. On "Confirm & Continue → Report", corrections are formatted as a labeled note and PUT to `/api/neuro-consults/[id]` (`notes` field). The report builder renders a "Physician Corrections & Notes" section if `consult.notes` is non-empty.
  (4) **Triage safety-critical extraction**: New STEP 6.5 in `systemPrompt.ts` extracts seven safety fields from referrals: `safety_anticoagulation`, `safety_symptom_onset_time` (last known well, critical for tPA/thrombectomy windows), `safety_allergies`, `safety_implanted_devices`, `safety_pregnancy_status`, `safety_recent_procedures`, `safety_renal_function`. AI returns null when unstated and prepends `SAFETY:` to `missing_information` when a field is unstated AND clinically critical (e.g., stroke-like presentation without onset time). Fields surface in the API response and are included in the persisted `ai_raw_response`.
  (5) **Diagnosis correction**: Earlier subagent claim that `HistorianStepPanel` opens via `target="_blank"` was wrong — historian is fully embedded inline. Real "review doesn't work" failure mode was lost corrections (now fixed).
  Scope of this commit: `EmbeddedHistorian.tsx`, `IntakeReviewSection.tsx`, `PatientToolsStepPanel.tsx`, `report-builder.ts`, new `assessment-generator.ts`, `report/index.ts`, `report/route.ts`, `triage/systemPrompt.ts`, `triage/types.ts`, `triage/route.ts`. No schema migrations required (corrections reuse existing `notes` column; safety fields ride in existing `ai_raw_response` JSONB).

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

**Status**: Active

### Recent
- **Consult JSONB stringify + mobile differential fix (PR #107, Apr 17)** — Fixed "Failed to save interview data" on `/consult`: `historian_sessions.transcript` and `red_flags` (JSONB arrays) were passing as raw JS arrays to node-postgres — pre-stringified at call site in `historian/save/route.ts` and in `linkHistorianToConsult`. Mobile: `LocalizerPanel` width changed from fixed 340px to `width:100%/maxWidth:340px`; `EmbeddedHistorian` auto-opens differential on first localizer result; toggle label updated to "Differential"/"Hide Dx".
- **Consult early-end interview preservation (PR #106, Apr 17)** — Fixed silent data loss when "End Interview" is clicked before AI calls `save_interview_output`: `useRealtimeSession.endSession` nudges AI via data channel and waits up to 4s, then falls back to raw transcript as `narrative_summary`. Added `interview_completion_status` column (complete | ended_early) via migration 044; amber "partial intake" banner shown when `ended_early`.
- **Consult tester feedback fixes + sample personas + actor briefing + SDNE iframe (PR #105, Apr 17)** — Addressed 5 tester feedback items on /consult page (layout, validation, flow); added sample patient personas and actor briefing section for demo flow; pointed SDNE iframe to sense.neuroplans.app production URL.
- **Neuro Intake + Consult Pipeline hardening (Apr 5-7)** — Historian embedded inline in patient tools; intake review added to patient page; auto-advance after historian completes in new tab; consult_id propagated from historian to save endpoint; KB IAM permissions + env vars wired; triage timeouts tuned for CloudFront (25-45s); JSONB array fields stringified; 42P01 (undefined table) error mapping added; actionable error messages surfaced from consult pipeline.
- **Feedback widget security hardening + API key (PRs #102-104, Apr 4)** — Prevented submission freeze on Edge/Windows (PR #102); HIPAA click redaction, CORS origin allowlist, input validation, AbortController timeouts (PR #103); added feedback API key to widget config (PR #104).
- **SSO client_secret fix (Mar 31)** — Added `COGNITO_CLIENT_SECRET` to `next.config` env inline for Amplify SSR runtime access; wired to OAuth token exchange flow to fix SSO login failure on Amplify.
- **OAuth SSO migration** to Cognito Hosted UI + PKCE with Amplify redirect fixes (PRs #100-101, Mar 27)

### In Progress
- Diagnosis plan coverage expansion (98 plans in DB, 148/166 diagnoses covered)
- Real-time voice streaming during encounters

### Planned
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
|------|---------|
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
