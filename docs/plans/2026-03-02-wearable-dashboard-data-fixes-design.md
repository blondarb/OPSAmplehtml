# Wearable Dashboard Data Fixes — Design Doc

**Date**: 2026-03-02
**Status**: Draft
**Scope**: Web dashboard only (OPSAmplehtml). iOS app (SevaroMonitor) changes noted as future work.

---

## Problem Summary

Live Apple Watch data from the Sevaro Monitor iOS app displays incorrectly on the `/wearable` dashboard:

1. **Resting HR**: Shows 0 on days HealthKit doesn't compute a value, drawing the chart line to zero
2. **Sleep architecture**: iOS app sends total sleep hours but not stage breakdowns — chart renders empty bars
3. **Rolling averages**: `steps_7day_avg` and `hrv_7day_avg` fall back to current day's value (no actual rolling computation)
4. **Baselines**: Patient baseline metrics are all zeros, making reference bands useless
5. **No auto-refresh**: Page loads once, user must manually refresh to see new data
6. **Disease track**: Hardcoded as "Parkinson's Motor Metrics" even for Essential Tremor patients

### Observed Data (Steve's live patient record)

| Date | resting_hr | sleep_hours | sleep_deep/rem/light/awake | daily_steps | tremor_pct |
|------|-----------|-------------|---------------------------|-------------|------------|
| Mar 2 | 63 | 5.59 | all null | 587 | null |
| Mar 1 | 0 | 4.99 | all null | 218 | null |
| Feb 28 | 0 | 6.6 | all null | 533 | null |
| Feb 27 | 64 | 5.41 | all null | 860 | null |
| Feb 26 | 73 | 4.98 | all null | 4489 | null |
| Feb 25 | 66 | 0 | all null | 5748 | null |
| Feb 24 | 64 | 0 | all null | 4538 | 65.4 |

---

## Fix 1: Resting HR — Treat 0 as Missing

**File**: `src/app/api/wearable/demo-data/route.ts` (`normalizeMetrics`)

Convert `resting_hr: 0` to `null` in the normalizer. A resting HR of 0 is never a real reading — it means HealthKit didn't compute one that day.

**File**: `src/components/wearable/HeartRateTrack.tsx`

Use `connectNulls={true}` on the resting HR `<Line>` so Recharts bridges over missing days instead of dropping to zero. The avg HR line continues normally (it's always populated).

**File**: `src/components/wearable/DailySummaryPopover.tsx`

Show "—" instead of "0 bpm" for resting HR when null.

---

## Fix 2: Sleep Architecture — Fallback to Total Sleep

**File**: `src/app/api/wearable/demo-data/route.ts` (`normalizeMetrics`)

When `sleep_deep`, `sleep_rem`, `sleep_light`, `sleep_awake` are all 0/null BUT `sleep_hours > 0`:
- Set `sleep_total = sleep_hours` (new field)
- Keep stage fields as `null` (not 0)

When `sleep_hours = 0` AND `sleep_efficiency = 0`:
- Treat as "no sleep data collected" (watch not worn overnight)
- Set all sleep fields to `null`

**File**: `src/components/wearable/SleepTrack.tsx`

Two rendering modes:
1. **Stages available** (demo patient Linda): Stacked bars as today (deep/REM/light/awake)
2. **Total only** (live patient): Single "Total Sleep" bar in a neutral color, with subtitle "Stage breakdown not available from device"
3. **No data**: Show a small "—" marker for that day

**File**: `src/components/wearable/DailySummaryPopover.tsx`

Show "N/A" for Deep/REM sub-label when stages aren't available.

---

## Fix 3: Rolling 7-Day Averages — Server-Side Computation

**File**: `src/app/api/wearable/demo-data/route.ts`

After fetching and normalizing daily summaries, compute actual rolling averages:

```
For each day i:
  window = summaries[max(0, i-6) .. i]
  steps_7day_avg = avg(window.total_steps or daily_steps, excluding nulls)
  hrv_7day_avg = avg(window.hrv_rmssd, excluding nulls)
  Inject into normalized metrics
```

For the first 6 days, use whatever days are available (partial average). This ensures both demo and live patients get correct rolling averages.

---

## Fix 4: Baseline Auto-Computation (Read-Only)

**File**: `src/app/api/wearable/demo-data/route.ts`

When the patient's `baseline_metrics` has all zeros AND there are 3+ days of data:
- Compute baselines from actual data: `avg(resting_hr)`, `avg(hrv_rmssd)`, `avg(steps)`, `avg(sleep_hours)`, `avg(sleep_efficiency)`
- Exclude null/zero values from averages (e.g., don't average in the days where resting HR was 0)
- Return the computed baselines in the API response — do NOT write back to Supabase (let the iOS app handle that via its existing 7-day baseline logic)

This is a read-only computation. The iOS app's `updateBaselineIfReady()` will eventually write real baselines once it has enough data.

---

## Fix 5: Auto-Refresh Polling (15 minutes)

**File**: `src/app/wearable/page.tsx`

Add a `useEffect` with `setInterval` that:
1. Re-fetches `/api/wearable/demo-data?patient_id=X` every 15 minutes
2. Silently updates state (no loading spinner — just swap data)
3. Pauses when `document.visibilityState === 'hidden'` (tab not active)
4. Resumes and immediately refreshes when tab becomes visible again (if 15+ min elapsed)

Show a small "Last updated: X min ago" indicator near the patient switcher.

---

## Fix 6: Disease Track — Diagnosis-Aware

**File**: `src/components/wearable/DiseaseTrack.tsx`

Accept `diagnosis: string` as a prop. Behavior:

| Diagnosis | Title | Metrics Shown | Notes |
|-----------|-------|---------------|-------|
| Parkinson's Disease | Parkinson's Motor Metrics | tremor_pct + dyskinetic_mins (dual axis) | Current behavior |
| Essential Tremor | Essential Tremor Monitoring | tremor_pct only (single axis) | Note when data is sparse |
| Other diagnoses | (hidden) | — | Don't render the track at all |

When tremor data exists for fewer than 3 of the displayed days, show an informational banner: "Tremor data is collected intermittently via accelerometer. More data points will appear over time."

When NO tremor data exists at all, show: "No tremor data available yet. Ensure the Sevaro Monitor app has motion permissions enabled."

---

## Files Changed

| File | Change |
|------|--------|
| `src/app/api/wearable/demo-data/route.ts` | Normalizer fixes, rolling averages, baseline computation |
| `src/components/wearable/HeartRateTrack.tsx` | `connectNulls` for resting HR line |
| `src/components/wearable/SleepTrack.tsx` | Total sleep fallback, no-data handling |
| `src/components/wearable/ActivityTrack.tsx` | No changes needed (normalizer handles steps) |
| `src/components/wearable/DiseaseTrack.tsx` | Diagnosis-aware title and metrics |
| `src/components/wearable/PatientTimeline.tsx` | Pass diagnosis to DiseaseTrack |
| `src/components/wearable/DailySummaryPopover.tsx` | Handle null resting HR and missing sleep stages |
| `src/app/wearable/page.tsx` | Auto-refresh polling, last-updated indicator |
| `src/lib/wearable/types.ts` | Add `sleep_total` to DailyMetrics, make resting_hr nullable |

---

## Demo Patient (Linda Martinez) Safety

All changes must be backward-compatible with the demo patient who has:
- Full sleep stage breakdowns
- Populated baselines
- Tremor and dyskinetic data
- Diagnosis = "Parkinson's Disease"

The normalizer and chart components should detect which data mode applies per-patient and render accordingly.

---

## Future iOS App Work (Not in This PR)

1. Send sleep stage breakdowns (`sleep_deep`, `sleep_rem`, `sleep_light`, `sleep_awake`)
2. Send `null` instead of `0` for resting HR when HealthKit has no samples
3. Investigate why hourly snapshots aren't reaching the API
4. Investigate tremor background task scheduling consistency
5. Verify baseline auto-computation is firing after 7 days
