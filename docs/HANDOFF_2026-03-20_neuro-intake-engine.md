# Handoff: Integrated Neuro Intake Engine (Phases 1–7)

**Date:** March 20, 2026
**Branch:** `main`
**Status:** All 7 phases built, build passes, ready for migration + staging test

---

## Summary

Built the complete Integrated Neuro Intake Engine — a 7-phase clinical pipeline that transforms a neurology consult from initial triage through AI-powered history taking, differential diagnosis, clinical scales, red flag detection, patient self-assessment tools, standardized digital neurologic exam integration, and unified report generation.

## Phases Delivered

### Phase 1 — Triage & Intake Enhancement
- Extended `NeurologyConsult` type with triage and intake fields
- Added `ConsultStatus` state machine (11 states)
- Pipeline helpers in `src/lib/consult/pipeline.ts` (non-throwing DB operations)
- API routes for consult CRUD (`/api/neuro-consults/[id]`)

### Phase 2 — AI Historian Integration
- Wired `useRealtimeSession.ts` to send structured localizer requests during voice interviews
- Request body uses camelCase matching `LocalizerRequest` type (`sessionId`, `sessionType`, `transcript`, `chiefComplaint`, `referralReason`)
- Response handling uses `contextHint` string for guidance injection
- Historian session save/escalation endpoints

### Phase 3 — Background Localizer
- `LocalizerPanel.tsx` — physician-facing differential diagnosis display
- Localizer API route (`/api/ai/historian/localizer`) invokes Bedrock for symptom extraction → KB retrieval → question generation
- `LocalizerResponse` type: `differential`, `followUpQuestions`, `contextHint`, `localizationHypothesis`, `kbSources`, `processingMs`

### Phase 4 — Red Flag Escalation
- `RedFlagAlert.tsx` — dismissible alert banner for detected red flags
- Red flag detector (`src/lib/consult/red-flags/`) — pattern-matching engine with 20+ neurological red flag patterns
- Integrated into `useRealtimeSession.ts` — runs on each patient turn using cumulative transcript
- `onRedFlagDetected` callback and `detectedRedFlags` state in hook return

### Phase 5 — Patient Web Tools
- `BodyMap.tsx` — Interactive SVG body map (26 anatomical regions, front/back toggle, symptom type + severity selectors)
- `FingerTappingTest.tsx` — 10-second motor speed test (taps/sec, regularity CV)
- `TremorDetector.tsx` — Accelerometer-based tremor detection (RMS, peak, dominant frequency, severity classification)
- `PatientToolsPanel.tsx` — Tabbed orchestrator with submit to API
- API route (`/api/patient/tools`) — POST saves markers + measurements, GET retrieves
- Patient-facing page at `/patient/tools`
- Migration 036: `patient_body_map_markers` and `patient_device_measurements` tables

### Phase 6 — SDNE Integration
- Extended `NeurologyConsult` with SDNE fields (`sdne_session_id`, `sdne_session_flag`, `sdne_domain_flags`, `sdne_detected_patterns`, `sdne_completed_at`)
- Pipeline helpers: `markSDNERequested()`, `linkSDNEToConsult()`
- Context builder extended with `buildSDNESummaryForReport()`
- API route (`/api/neuro-consults/[id]/sdne`) — POST (request/link), GET (retrieve)
- Migration 037: SDNE columns on `neurology_consults`

### Phase 7 — Unified Report Generator
- `buildConsultReport()` — pure function assembling all pipeline data into structured `ConsultReport`
- 11 report sections: chief complaint, intake, historian HPI, structured history (OLDCARTS), differential, scales, red flags, SDNE, body map, device measurements, historian red flags
- `ConsultReportView.tsx` — physician-facing viewer with collapsible sections, source badges, summary badges, copy-to-clipboard, finalize button
- API route (`/api/neuro-consults/[id]/report`) — POST generates + persists, GET retrieves latest
- Migration 038: `consult_reports` table

## Key Technical Decisions

1. **Localizer request contract** — camelCase (`sessionId`, `sessionType`, `transcript`) matching the `LocalizerRequest` type, not snake_case
2. **Red flag detection client-side** — `detectRedFlags` is a pure text-matching function, safe for client-side use without API calls
3. **SVG body map over canvas** — better accessibility, simpler event handling, works on all devices
4. **Zero-crossing frequency estimation** over FFT for tremor — simpler, sufficient for screening
5. **Report builder as pure function** — no DB access, no side effects, fully testable
6. **Non-throwing pipeline helpers** — return null/false on failure to prevent cascade failures

## Files Changed (Modified)

- `src/hooks/useRealtimeSession.ts` — localizer integration + red flag detection
- `src/lib/consult/types.ts` — extended ConsultStatus + SDNE fields
- `src/lib/consult/pipeline.ts` — SDNE helpers
- `src/lib/consult/contextBuilder.ts` — SDNE context for reports
- `src/lib/bedrock.ts` — localizer pipeline support
- `src/components/NeurologicHistorian.tsx` — red flag UI integration
- `src/app/api/ai/historian/save/route.ts` — async params fix
- `src/app/api/ai/historian/session/route.ts` — async params fix
- `src/app/api/follow-up/message/route.ts` — async params fix
- `src/app/api/triage/route.ts` — pipeline integration
- `package.json` / `pnpm-lock.yaml` — uuid dependency

## Files Created (New)

- `src/lib/consult/patient-tools/` — types, body regions, index
- `src/lib/consult/report/` — types, builder, index
- `src/lib/consult/red-flags/` — detector, types
- `src/components/BodyMap.tsx`, `FingerTappingTest.tsx`, `TremorDetector.tsx`
- `src/components/PatientToolsPanel.tsx`, `ConsultReportView.tsx`
- `src/components/LocalizerPanel.tsx`, `RedFlagAlert.tsx`, `ScaleResults.tsx`
- `src/app/api/patient/tools/route.ts`
- `src/app/api/neuro-consults/[id]/sdne/route.ts`
- `src/app/api/neuro-consults/[id]/report/route.ts`
- `src/app/api/ai/historian/localizer/route.ts`
- `src/app/api/ai/historian/escalation/route.ts`
- `src/app/api/ai/historian/scales/route.ts`
- `src/app/patient/tools/page.tsx`
- `migrations/036_patient_web_tools.sql`
- `migrations/037_sdne_integration.sql`
- `migrations/038_consult_reports.sql`

## Pending

- **Run migrations 032–038** against RDS before staging test
- **Visual verification** on staging after Amplify deploy
- **SDNE XR app** needs to POST results back to the SDNE API endpoint
- **Patient tools page** needs auth/session token for real patient use (currently demo-mode)
