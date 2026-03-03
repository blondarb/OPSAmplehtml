# Wearable Dashboard & SevaroMonitor iOS Fixes — March 2–3, 2026

## Audience
Next Claude Code session working on the wearable monitoring card or the SevaroMonitor iOS app.

## Current State
- **Build/Deploy**: Clean, production live at `ops-amplehtml.vercel.app`
- **Branch**: All merged to `main` (PR #59 for web fixes)
- **SevaroMonitor iOS**: All pushed to `main` on `blondarb/SevaroMonitor`
- **Supabase project**: `czspsioerfaktnnrnmcw` (us-east-2)

## Work Completed This Session

### 1. Wearable Dashboard Data Fixes (PR #59 — OPSAmplehtml)

**Problem**: Real Apple Watch data from SevaroMonitor iOS app wasn't displaying correctly on the `/wearable` web dashboard. Six issues identified.

**Fixes applied (8 tasks):**

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| Resting HR 0 rendered as data point | HealthKit returns 0 when unavailable | Treat 0 as null in `normalizeMetrics()` |
| Sleep chart empty (no stage bars) | Real data has null stages | `SleepTrack.tsx` fallback: single "Total Sleep" bar when stages unavailable |
| No rolling 7-day averages | Client expected pre-computed fields | `computeRollingAverages()` server-side in demo-data route |
| Baselines all zeros | Baselines hardcoded to 0 | `computeBaselineFromData()` auto-computes from actual data |
| Disease track wrong title | Hardcoded "Parkinson's Motor Metrics" | `DiseaseTrack.tsx` accepts diagnosis prop, renders ET vs PD appropriately |
| No auto-refresh | Stale data until manual reload | 15-minute visibility-aware polling in `page.tsx` |

**Files modified (OPSAmplehtml):**
- `src/lib/wearable/types.ts` — Made DailyMetrics fields nullable, added `sleep_total`
- `src/app/api/wearable/demo-data/route.ts` — `normalizeMetrics()`, `computeRollingAverages()`, `computeBaselineFromData()`
- `src/components/wearable/PatientTimeline.tsx` — Updated ChartDataPoint, pass diagnosis to DiseaseTrack
- `src/components/wearable/HeartRateTrack.tsx` — `connectNulls={true}` on resting HR, null-safe tooltip
- `src/components/wearable/SleepTrack.tsx` — Total sleep fallback with stage detection
- `src/components/wearable/DailySummaryPopover.tsx` — Null-safe rendering
- `src/components/wearable/DiseaseTrack.tsx` — Diagnosis-aware ET vs PD rendering
- `src/app/wearable/page.tsx` — Auto-refresh polling with `visibilitychange` listener

### 2. Sleep Midnight Boundary Fix (SevaroMonitor iOS)

**Problem**: iPhone Health app showed 7h46m sleep but dashboard showed 5.59h. Overnight sleep sessions were split at midnight across two calendar days.

**Fix**: Changed `HealthKitCollector.swift` to use a 6 PM-to-6 PM "sleep day" window for sleep queries only. All other metrics remain midnight-to-midnight.

**File**: `SevaroMonitor/Services/HealthKitCollector.swift` — Added `sleepPredicate` with 6 PM boundaries, passed to `collectSleepData()` instead of `predicate`.

### 3. Sleep Stage Breakdown (SevaroMonitor iOS)

**Problem**: iOS app lumped all sleep stages into one `sleepHours` total. Dashboard showed single bar instead of stacked Deep/Light/REM/Awake bars.

**Fix**: Split the `collectSleepData()` switch statement to track per-stage seconds (asleepCore → light, asleepDeep → deep, asleepREM → rem, awake). Added `sleepDeep`, `sleepLight`, `sleepRem`, `sleepAwake` fields to `DailyMetrics` struct and `SleepResult`.

**Files**:
- `SevaroMonitor/Services/HealthKitCollector.swift` — Per-stage tracking in sleep collection
- `SevaroMonitor/Models/WearableModels.swift` — Added 4 optional sleep stage fields + CodingKeys

## Pending: Guided Tremor Assessment

**Design doc committed**: `SevaroMonitor/docs/plans/2026-03-03-guided-tremor-assessment-design.md`

**Concept**: 3-task clinical tremor assessment with voice + visual guidance:
1. **Postural Hold** (10 sec) — hold phone at arm's length
2. **Pouring Motion** (10 sec) — tilt phone like pouring water
3. **Drinking Motion** (10 sec) — bring phone to mouth like drinking

**Scoring**: Per-task tremor % + intensity, composite score averaging all three. Results stored in new `wearable_tremor_assessments` Supabase table.

**Implementation scope**:
- iOS: 3 new files (TremorAssessmentService, TremorAssessmentView, TremorAssessmentResult model) + 4 modified
- Supabase: 1 migration (new table)
- Web: Update DiseaseTrack.tsx to show assessment results with composite + per-task breakdown

**No implementation plan written yet** — design doc only. Next session should write the implementation plan and build it.

## Key Architecture Notes

### Data Pipeline
```
Apple Watch → HealthKit → SevaroMonitor iOS app → Supabase (JSONB metrics) → Web Dashboard
```

### iOS Sync Mechanisms
- **Daily Summary**: BGAppRefreshTask every ~20 hours
- **Hourly Snapshots**: HealthKit background delivery every 60 min
- **Critical Events**: Immediate HealthKit background delivery
- **Manual**: Opening the app triggers sync

### Supabase Schema
- `wearable_daily_summaries` — JSONB `metrics` column (no migration needed for new fields)
- `wearable_tremor_assessments` — NEW table needed for guided assessments

## Open Items
- Sleep stage data will appear on dashboard once patient opens app and syncs (next sync after app install)
- The 6 PM sleep window fix is deployed to Sdaip16p — verify sleep hours match iPhone on next day's data
- Guided tremor assessment needs implementation plan + build
