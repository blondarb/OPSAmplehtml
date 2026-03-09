# Clinical Narrative Pipeline — March 4, 2026

## Audience
Next Claude Code session working on the wearable monitoring dashboard or AI interpretation features.

## Current State
- **Build/Deploy**: Clean, production live at `ops-amplehtml.vercel.app`
- **Branch**: `main` (commit `7a0fd0e` — working tree clean, all pushed)
- **Live URL**: https://ops-amplehtml.vercel.app/wearable
- **Supabase project**: `czspsioerfaktnnrnmcw` (us-east-2)
- **Edge Function**: `analyze-assessment` at v3 (deployed directly via Supabase MCP)

## Work Completed

### 1. Split DiseaseTrack into Motor + Cognitive Tracks (PR #69)
Separated the monolithic DiseaseTrack component into two clinically distinct components:
- **MotorTrack**: Tremor monitoring chart + guided tremor assessment card + finger tapping assessment card
- **CognitiveTrack**: Verbal fluency chart + assessment card, extensible registry for future tests (trail making, clock drawing, reaction time, digit span)

| File | Change |
|------|--------|
| `src/components/wearable/MotorTrack.tsx` | Renamed from DiseaseTrack; tremor + tapping assessments |
| `src/components/wearable/CognitiveTrack.tsx` | New; config-driven test registry for cognitive assessments |
| `src/components/wearable/trackUtils.ts` | Shared utilities extracted from DiseaseTrack |
| `src/components/wearable/PatientTimeline.tsx` | Renders both MotorTrack and CognitiveTrack |

### 2. Fixed Null Safety & Data Format Issues
- `structured_summary` in ClinicalNarrative type made nullable (DB column is nullable JSONB)
- Null-safe array access in ClinicalNarrativePanel and LongitudinalSummaryBanner
- Snake_case → camelCase normalization for tapping data (`taps_per_second` → `tapsPerSecond`, etc.) in the demo-data API route
- Null guards on all `.toFixed()` calls in MotorTrack and CognitiveTrack

### 3. AI Clinical Interpretation Pipeline (End-to-End)
Built a full 2-stage AI pipeline for generating clinical narratives from assessment data:

**Stage 1** (gpt-4o-mini): Structured metric extraction — pulls clinically relevant numbers from raw assessment data
**Stage 2** (gpt-5.2): Clinical narrative generation — interprets metrics in clinical context with severity flags

| File | Change |
|------|--------|
| `src/app/api/wearable/analyze-assessment/route.ts` | New API route proxying to Supabase Edge Function; passes `X-OpenAI-Key` header |
| `src/components/wearable/MotorTrack.tsx` | Added "Generate AI Clinical Interpretation" buttons for tremor (purple) and tapping (blue) |
| `src/components/wearable/CognitiveTrack.tsx` | Added "Generate AI Clinical Interpretation" button (green) for fluency |
| `src/components/wearable/PatientTimeline.tsx` | Passes `onGenerateNarrative` callback to both tracks |
| `src/app/wearable/page.tsx` | `handleGenerateNarrative()` calls API + refreshes patient data after generation |

**Edge Function** (`analyze-assessment` on Supabase project `czspsioerfaktnnrnmcw`):
- Handles 4 analysis types: `fluency`, `tremor`, `tapping`, `longitudinal`
- `getOpenAIKey(req)` helper: checks `Deno.env.get("OPENAI_API_KEY")` first, falls back to `X-OpenAI-Key` header
- `callOpenAI()` with proper HTTP status + `json.error` checks
- Stores results in `wearable_clinical_narratives` table

### 4. Bug Fixes During Pipeline Bring-Up
| Bug | Root Cause | Fix |
|-----|-----------|-----|
| "OpenAI returned empty response from gpt-5-mini" | `callOpenAI` didn't check for errors before accessing `json.choices`; model name may have been invalid | Added HTTP status + `json.error` checks; changed model to `gpt-4o-mini` |
| "Incorrect API key provided: undefined" (401) | `OPENAI_API_KEY` was never set as a Supabase secret | Pass key from Vercel env vars via `X-OpenAI-Key` header to Edge Function |

## What Was NOT Done
- **Longitudinal analysis**: The `longitudinal` analysis type exists in the Edge Function but there's no UI trigger for it yet. The `LongitudinalSummaryBanner` component is built but has no data.
- **Auto-generation on sync**: Narratives are generated on-demand via button click. They could auto-generate when new assessments sync from the iOS app.
- **Narrative caching/refresh**: Once generated, narratives persist in the DB. There's no "regenerate" button if the user wants a fresh interpretation.
- **OPENAI_API_KEY Supabase secret**: Still not set. The header passthrough works but is less secure. Should be set via `supabase secrets set OPENAI_API_KEY=sk-...` when CLI is authenticated.

## Known Risks / Watch Items
1. **API key in header**: The OpenAI API key travels from Vercel → Edge Function via HTTP header. This works but the key should be set as a Supabase secret for production.
2. **Edge Function deployed outside git**: The Edge Function code was deployed via Supabase MCP, not from the repo. The source isn't version-controlled in OPSAmplehtml. Consider adding `supabase/functions/analyze-assessment/index.ts` to the repo.
3. **Model names**: Stage 1 uses `gpt-4o-mini`, Stage 2 uses `gpt-5.2`. The changelog from February mentions migrating from `gpt-4o-mini` → `gpt-5-mini`, but `gpt-5-mini` didn't work for Stage 1. Verify model availability.
4. **Fluency AI-Enhanced scoring**: When the fluency narrative generates, the composite score changes (51.0 → 85.0) and an "AI Enhanced" badge appears. This suggests the Edge Function is updating the assessment record. Verify this is intentional.

## What to Build Next

### Near-term (wearable dashboard)
1. **Longitudinal Summary Banner**: Wire up the `longitudinal` analysis type to generate a 30-day trend synthesis across all assessment types. Trigger it after any individual narrative is generated, or add a dedicated "Generate 30-Day Summary" button.
2. **Narrative Regenerate**: Add a small refresh icon on existing ClinicalNarrativePanel to re-run the AI pipeline if the clinician wants a fresh interpretation.
3. **Auto-generate on assessment sync**: When a new assessment arrives from the iOS app, automatically trigger narrative generation instead of requiring manual button clicks.
4. **Severity flags → alert system**: The AI pipeline produces severity flags (e.g., `pouring_motion_score: moderate`). These could feed into the Clinician Alert Dashboard section that currently shows "No data yet."

### Medium-term (platform)
5. **SDNE Integration (Phase 2)**: The mockup section on the wearable page shows Day 1 and Day 30 SDNE exams. Cross-card integration with the SDNE card would let the AI correlate wearable trends with objective exam findings.
6. **Assessment History View**: Show all past assessments (not just latest) in an expandable timeline, each with their AI narrative.
7. **Clinician Annotations**: Let physicians add notes/corrections to AI narratives. Important for clinical trust and documentation.

### iOS companion (SevaroMonitor)
8. **New assessment types**: Clock Drawing Test, Trail Making Test, Reaction Time — the CognitiveTrack registry is ready for them.
9. **Assessment reminders**: Push notifications prompting patients to complete assessments on a schedule.

## Files to Review First
- `src/app/api/wearable/analyze-assessment/route.ts` — The proxy route (has the X-OpenAI-Key header logic)
- `src/components/wearable/MotorTrack.tsx` — Tremor + tapping cards with generate buttons
- `src/components/wearable/CognitiveTrack.tsx` — Fluency card with generate button
- `src/app/wearable/page.tsx` — `handleGenerateNarrative()` function and data refresh flow
- `src/components/wearable/ClinicalNarrativePanel.tsx` — Renders the AI narrative with severity flags
