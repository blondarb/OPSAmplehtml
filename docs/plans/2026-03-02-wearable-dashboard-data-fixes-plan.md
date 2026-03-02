# Wearable Dashboard Data Fixes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 6 data display issues on the `/wearable` dashboard so live Apple Watch data renders correctly alongside demo data.

**Architecture:** All fixes are in the web dashboard layer (normalizer, chart components, page polling). No database migrations. No iOS app changes. The API normalizer gets smarter about missing data, the charts handle null gracefully, and the page auto-refreshes.

**Tech Stack:** Next.js 15 (App Router), React, Recharts, Supabase (read-only queries), TypeScript

**Design doc:** `docs/plans/2026-03-02-wearable-dashboard-data-fixes-design.md`

---

### Task 1: Update Types — Make Fields Nullable

**Files:**
- Modify: `src/lib/wearable/types.ts`

**Step 1: Update DailyMetrics interface**

Make `resting_hr` nullable and add `sleep_total`:

```typescript
export interface DailyMetrics {
  avg_hr: number
  resting_hr: number | null    // was: number — null when HealthKit has no data
  hrv_rmssd: number
  hrv_7day_avg: number
  total_steps: number
  steps_7day_avg: number
  sleep_hours: number | null   // was: number — null when watch not worn overnight
  sleep_deep: number | null    // was: number — null when stages unavailable
  sleep_rem: number | null     // was: number
  sleep_light: number | null   // was: number
  sleep_awake: number | null   // was: number
  sleep_total: number | null   // NEW — total sleep when stages unavailable
  sleep_efficiency: number | null  // was: number — null when no sleep data
  awakenings: number | null    // was: number — null when no sleep data
  tremor_pct?: number
  dyskinetic_mins?: number
  spo2_avg?: number
  spo2_min?: number
  active_calories?: number
}
```

**Step 2: Update ChartDataPoint in PatientTimeline.tsx**

Update the `ChartDataPoint` interface to match:

```typescript
// In src/components/wearable/PatientTimeline.tsx
export interface ChartDataPoint {
  date: string
  avg_hr: number
  resting_hr: number | null
  hrv_rmssd: number
  hrv_7day_avg: number
  total_steps: number
  steps_7day_avg: number
  sleep_hours: number | null
  sleep_deep: number | null
  sleep_rem: number | null
  sleep_light: number | null
  sleep_awake: number | null
  sleep_total: number | null
  sleep_efficiency: number | null
  awakenings: number | null
  tremor_pct?: number
  dyskinetic_mins?: number
  hasAnomaly: boolean
  anomalySeverity: string | null
  overall_status: string
}
```

**Step 3: Build to verify no type errors**

Run: `npm run build`
Expected: Type errors in components that now receive nullable fields — that's expected. We'll fix them in subsequent tasks.

**Step 4: Commit**

```
feat(wearable): make DailyMetrics fields nullable for missing data
```

---

### Task 2: Fix Normalizer — Handle Missing Data + Rolling Averages + Baselines

**Files:**
- Modify: `src/app/api/wearable/demo-data/route.ts`

**Step 1: Rewrite normalizeMetrics to handle nulls**

Replace the existing `normalizeMetrics` function:

```typescript
function normalizeMetrics(raw: Record<string, unknown>): Record<string, unknown> {
  const avgHr = Number(raw.avg_hr) || 0
  const rawRestingHr = Number(raw.resting_hr)
  const restingHr = (rawRestingHr > 0) ? rawRestingHr : null  // 0 means HealthKit had no data

  const sleepHours = Number(raw.sleep_hours) || 0
  const sleepEfficiency = Number(raw.sleep_efficiency) || 0
  const noSleepData = sleepHours === 0 && sleepEfficiency === 0

  // Check if sleep stage breakdown is available
  const sleepDeep = Number(raw.sleep_deep) || 0
  const sleepRem = Number(raw.sleep_rem) || 0
  const sleepLight = Number(raw.sleep_light) || 0
  const sleepAwake = Number(raw.sleep_awake) || 0
  const hasStages = (sleepDeep + sleepRem + sleepLight + sleepAwake) > 0

  const totalSteps = Number(raw.total_steps) || Number(raw.daily_steps) || 0

  return {
    avg_hr: avgHr,
    resting_hr: restingHr,
    hrv_rmssd: Number(raw.hrv_rmssd) || 0,
    hrv_7day_avg: 0,       // placeholder — computed below in rolling avg pass
    total_steps: totalSteps,
    steps_7day_avg: 0,     // placeholder — computed below in rolling avg pass
    // Sleep fields
    sleep_hours: noSleepData ? null : sleepHours,
    sleep_deep: noSleepData ? null : (hasStages ? sleepDeep : null),
    sleep_rem: noSleepData ? null : (hasStages ? sleepRem : null),
    sleep_light: noSleepData ? null : (hasStages ? sleepLight : null),
    sleep_awake: noSleepData ? null : (hasStages ? sleepAwake : null),
    sleep_total: noSleepData ? null : (!hasStages && sleepHours > 0 ? sleepHours : null),
    sleep_efficiency: noSleepData ? null : sleepEfficiency,
    awakenings: noSleepData ? null : (Number(raw.awakenings) || 0),
    // Disease-specific (preserve as-is)
    tremor_pct: raw.tremor_pct != null ? Number(raw.tremor_pct) : undefined,
    dyskinetic_mins: raw.dyskinetic_mins != null ? Number(raw.dyskinetic_mins) : undefined,
    // iOS-specific
    spo2_avg: raw.spo2_avg != null ? Number(raw.spo2_avg) : undefined,
    spo2_min: raw.spo2_min != null ? Number(raw.spo2_min) : undefined,
    active_calories: raw.active_calories != null ? Number(raw.active_calories) : undefined,
  }
}
```

**Step 2: Add rolling average computation**

Add this helper function after `normalizeMetrics`:

```typescript
function computeRollingAverages(summaries: Array<Record<string, unknown>>): void {
  for (let i = 0; i < summaries.length; i++) {
    const metrics = summaries[i].metrics as Record<string, unknown>
    const windowStart = Math.max(0, i - 6)
    const window = summaries.slice(windowStart, i + 1)

    // Steps rolling avg
    const stepValues = window
      .map(s => Number((s.metrics as Record<string, unknown>).total_steps) || 0)
      .filter(v => v > 0)
    metrics.steps_7day_avg = stepValues.length > 0
      ? Math.round(stepValues.reduce((a, b) => a + b, 0) / stepValues.length)
      : 0

    // HRV rolling avg
    const hrvValues = window
      .map(s => Number((s.metrics as Record<string, unknown>).hrv_rmssd) || 0)
      .filter(v => v > 0)
    metrics.hrv_7day_avg = hrvValues.length > 0
      ? Math.round(hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length * 10) / 10
      : 0
  }
}
```

**Step 3: Add baseline auto-computation**

Add this helper function:

```typescript
function computeBaselineFromData(
  patient: Record<string, unknown>,
  summaries: Array<Record<string, unknown>>
): Record<string, unknown> {
  const baseline = patient.baseline_metrics as Record<string, unknown>

  // Check if baselines are all zeros
  const hasBaseline = (Number(baseline?.resting_hr) || 0) > 0 ||
                      (Number(baseline?.hrv_rmssd) || 0) > 0 ||
                      (Number(baseline?.avg_steps || baseline?.daily_steps) || 0) > 0 ||
                      (Number(baseline?.sleep_hours) || 0) > 0

  if (hasBaseline || summaries.length < 3) {
    return baseline
  }

  // Compute from actual data, excluding zeros/nulls
  const avg = (vals: number[]) => {
    const valid = vals.filter(v => v > 0)
    return valid.length > 0 ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length * 10) / 10 : 0
  }

  const metrics = summaries.map(s => s.metrics as Record<string, unknown>)

  return {
    ...baseline,
    resting_hr: avg(metrics.map(m => Number(m.resting_hr) || 0)),
    hrv_rmssd: avg(metrics.map(m => Number(m.hrv_rmssd) || 0)),
    avg_steps: avg(metrics.map(m => Number(m.total_steps) || 0)),
    sleep_hours: avg(metrics.map(m => Number(m.sleep_hours) || 0)),
    sleep_efficiency: avg(metrics.map(m => Number(m.sleep_efficiency) || 0)),
    tremor_pct: baseline?.tremor_pct,
  }
}
```

**Step 4: Wire helpers into the GET handler**

In the GET handler, after normalizing summaries but before returning the response, add:

```typescript
// After: const dailySummaries = (summariesRes.data || []).map(...)

// Compute rolling 7-day averages
computeRollingAverages(dailySummaries)

// Auto-compute baselines if patient's are all zeros
const effectiveBaseline = computeBaselineFromData(patient, dailySummaries)
const patientWithBaseline = { ...patient, baseline_metrics: effectiveBaseline }

return NextResponse.json({
  patient: patientWithBaseline,   // was: patient
  dailySummaries,
  anomalies: anomaliesRes.data || [],
  alerts: alertsRes.data || [],
})
```

**Step 5: Verify API locally**

Run: `npm run dev`
Open: `http://localhost:3000/api/wearable/demo-data?patient_id=870d8c68-bc85-427e-8bee-69fb36447c54`
Verify: `resting_hr` is `null` (not 0) on days it was missing. `sleep_total` is populated. `steps_7day_avg` differs from `total_steps`. Baseline has non-zero values.

Also verify demo patient (Linda Martinez) still returns correct data with stages and baselines.

**Step 6: Commit**

```
feat(wearable): fix normalizer for missing data, add rolling averages and baseline computation
```

---

### Task 3: Fix HeartRateTrack — Handle Null Resting HR

**Files:**
- Modify: `src/components/wearable/HeartRateTrack.tsx`

**Step 1: Add connectNulls to resting HR line**

Change the resting HR `<Line>` component (around line 146):

```tsx
<Line
  type="monotone"
  dataKey="resting_hr"
  stroke="#DC2626"
  strokeWidth={2}
  connectNulls={true}
  dot={{ r: 2, fill: '#DC2626' }}
  activeDot={{ r: 5, fill: '#DC2626' }}
/>
```

**Step 2: Update tooltip formatter to handle null**

Update the tooltip formatter (around line 126):

```tsx
formatter={(value: any, name: any) => {
  if (value === null || value === undefined) return ['—', name === 'avg_hr' ? 'Avg HR' : 'Resting HR']
  const label = name === 'avg_hr' ? 'Avg HR' : 'Resting HR'
  return [`${value} bpm`, label]
}}
```

**Step 3: Verify visually**

Run: `npm run dev`, navigate to `/wearable`, select your live patient.
Expected: Resting HR line bridges over days with no data instead of dropping to 0.

**Step 4: Commit**

```
fix(wearable): bridge resting HR line over missing data days
```

---

### Task 4: Fix SleepTrack — Total Sleep Fallback

**Files:**
- Modify: `src/components/wearable/SleepTrack.tsx`

**Step 1: Detect rendering mode from data**

Add mode detection at the top of the component, before the return:

```tsx
// Detect if ANY day has stage data
const hasAnyStageData = data.some(d =>
  (d.sleep_deep != null && d.sleep_deep > 0) ||
  (d.sleep_rem != null && d.sleep_rem > 0) ||
  (d.sleep_light != null && d.sleep_light > 0)
)
```

**Step 2: Update the chart to support both modes**

Replace the bars section inside the `<BarChart>` (the four `<Bar>` elements). When stages are available, use the existing stacked bars. When not, use a single `sleep_total` bar:

```tsx
{hasAnyStageData ? (
  <>
    <Bar dataKey="sleep_deep" stackId="sleep" fill={SLEEP_COLORS.sleep_deep} radius={[0, 0, 0, 0]} />
    <Bar dataKey="sleep_rem" stackId="sleep" fill={SLEEP_COLORS.sleep_rem} radius={[0, 0, 0, 0]} />
    <Bar dataKey="sleep_light" stackId="sleep" fill={SLEEP_COLORS.sleep_light} radius={[0, 0, 0, 0]} />
    <Bar dataKey="sleep_awake" stackId="sleep" fill={SLEEP_COLORS.sleep_awake} radius={[4, 4, 0, 0]} />
  </>
) : (
  <Bar dataKey="sleep_total" fill="#6366F1" radius={[4, 4, 0, 0]} opacity={0.8} />
)}
```

**Step 3: Update the legend for total-only mode**

Replace the `CustomLegend` with a mode-aware version:

```tsx
function CustomLegend({ hasStages }: { hasStages: boolean }) {
  if (hasStages) {
    const items = Object.entries(SLEEP_COLORS)
    return (
      <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '4px' }}>
        {items.map(([key, color]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '10px', height: '10px', background: color, borderRadius: '2px' }} />
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>{SLEEP_LABELS[key]}</span>
          </div>
        ))}
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{ width: '10px', height: '10px', background: '#6366F1', borderRadius: '2px' }} />
        <span style={{ fontSize: '11px', color: '#94a3b8' }}>Total Sleep</span>
      </div>
    </div>
  )
}
```

Pass the prop: `<Legend content={<CustomLegend hasStages={hasAnyStageData} />} />`

**Step 4: Update subtitle for total-only mode**

Below the title span, add a subtitle when in total-only mode:

```tsx
{!hasAnyStageData && (
  <span style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic' }}>
    Stage breakdown not available from device
  </span>
)}
```

**Step 5: Update tooltip for total-only mode**

```tsx
formatter={(value: any, name: any) => {
  if (value === null || value === undefined) return ['—', 'No data']
  const label = name === 'sleep_total' ? 'Total Sleep' : (SLEEP_LABELS[name] || name)
  return [`${Number(value).toFixed(1)} hrs`, label]
}}
```

**Step 6: Verify visually**

Open `/wearable` with live patient: should see indigo "Total Sleep" bars with subtitle.
Open `/wearable` with demo patient (Linda): should see stacked colored bars as before.
Days with no sleep data (Feb 24, 25) should show no bar at all.

**Step 7: Commit**

```
fix(wearable): show total sleep bar when stage breakdown unavailable
```

---

### Task 5: Fix DailySummaryPopover — Handle Nullable Fields

**Files:**
- Modify: `src/components/wearable/DailySummaryPopover.tsx`

**Step 1: Fix resting HR display**

In the MetricCard for Avg Heart Rate (around line 119-126), handle null resting HR:

```tsx
<MetricCard
  label="Avg Heart Rate"
  value={Math.round(m.avg_hr)}
  unit="bpm"
  subLabel="Resting"
  subValue={m.resting_hr != null ? Math.round(m.resting_hr) : '—'}
  subUnit={m.resting_hr != null ? ' bpm' : ''}
/>
```

**Step 2: Fix HRV display**

```tsx
<MetricCard
  label="HRV (RMSSD)"
  value={Math.round(m.hrv_rmssd)}
  unit="ms"
  subLabel="7-day avg"
  subValue={m.hrv_7day_avg > 0 ? Math.round(m.hrv_7day_avg) : '—'}
  subUnit={m.hrv_7day_avg > 0 ? ' ms' : ''}
/>
```

**Step 3: Fix sleep Deep/REM display**

Replace the Awakenings MetricCard (around line 157-163):

```tsx
<MetricCard
  label="Awakenings"
  value={m.awakenings != null ? m.awakenings : '—'}
  subLabel="Deep/REM"
  subValue={
    m.sleep_deep != null && m.sleep_rem != null
      ? `${m.sleep_deep.toFixed(1)}/${m.sleep_rem.toFixed(1)}`
      : 'N/A'
  }
  subUnit={m.sleep_deep != null ? ' hrs' : ''}
/>
```

**Step 4: Fix sleep hours display**

```tsx
<MetricCard
  label="Sleep"
  value={m.sleep_hours != null ? m.sleep_hours.toFixed(1) : '—'}
  unit={m.sleep_hours != null ? 'hrs' : ''}
  subLabel="Efficiency"
  subValue={m.sleep_efficiency != null ? `${(m.sleep_efficiency * 100).toFixed(0)}` : '—'}
  subUnit={m.sleep_efficiency != null ? '%' : ''}
/>
```

**Step 5: Commit**

```
fix(wearable): handle null fields in daily summary popover
```

---

### Task 6: Fix DiseaseTrack — Diagnosis-Aware

**Files:**
- Modify: `src/components/wearable/DiseaseTrack.tsx`
- Modify: `src/components/wearable/PatientTimeline.tsx`

**Step 1: Add diagnosis prop to DiseaseTrack**

Update the interface and component signature:

```tsx
interface DiseaseTrackProps {
  data: ChartDataPoint[]
  baseline: BaselineMetrics
  diagnosis: string   // NEW
  onDayClick: (date: string) => void
}
```

**Step 2: Add early return for unsupported diagnoses**

At the top of the component body:

```tsx
const isParkinsons = diagnosis.toLowerCase().includes('parkinson')
const isEssentialTremor = diagnosis.toLowerCase().includes('essential tremor')

if (!isParkinsons && !isEssentialTremor) {
  return null // Don't render for non-tremor diagnoses
}
```

**Step 3: Count tremor data points for sparse-data message**

```tsx
const tremorDays = data.filter(d => d.tremor_pct != null && d.tremor_pct !== undefined).length
const hasTremorData = tremorDays > 0
const sparseTremorData = hasTremorData && tremorDays < 3
```

**Step 4: Update title and render conditionally**

Replace the hardcoded "Parkinson's Motor Metrics" title:

```tsx
<span style={{ fontSize: '14px', fontWeight: 600, color: '#f1f5f9' }}>
  {isParkinsons ? "Parkinson's Motor Metrics" : 'Essential Tremor Monitoring'}
</span>
```

For Essential Tremor, hide the dyskinetic mins legend item and line.

**Step 5: Add informational banners for sparse/no data**

After the chart, inside the outer div:

```tsx
{!hasTremorData && (
  <div style={{
    marginTop: '12px',
    padding: '10px 14px',
    background: 'rgba(99, 102, 241, 0.08)',
    border: '1px solid rgba(99, 102, 241, 0.2)',
    borderRadius: '8px',
  }}>
    <p style={{ color: '#818CF8', fontSize: '0.8rem', margin: 0 }}>
      No tremor data available yet. Ensure the Sevaro Monitor app has motion permissions enabled.
    </p>
  </div>
)}
{sparseTremorData && (
  <div style={{
    marginTop: '12px',
    padding: '10px 14px',
    background: 'rgba(245, 158, 11, 0.08)',
    border: '1px solid rgba(245, 158, 11, 0.2)',
    borderRadius: '8px',
  }}>
    <p style={{ color: '#F59E0B', fontSize: '0.8rem', margin: 0 }}>
      Tremor data is collected intermittently via accelerometer ({tremorDays} data point{tremorDays !== 1 ? 's' : ''} so far). More data points will appear over time.
    </p>
  </div>
)}
```

**Step 6: Conditionally render dyskinetic line for Parkinson's only**

Wrap the dyskinetic_mins `<Line>` and its right Y-axis in `{isParkinsons && (...)}`.

For Essential Tremor, remove the right Y-axis entirely and use only the left axis for tremor_pct.

**Step 7: Pass diagnosis from PatientTimeline**

In `PatientTimeline.tsx`, update the DiseaseTrack usage:

```tsx
<DiseaseTrack
  data={chartData}
  baseline={patient.baseline_metrics}
  diagnosis={patient.primary_diagnosis}  // NEW
  onDayClick={handleDayClick}
/>
```

**Step 8: Verify visually**

- Live patient (Essential Tremor): Should show "Essential Tremor Monitoring" with single tremor line, sparse data banner.
- Demo patient (Parkinson's): Should show dual-axis chart as before.

**Step 9: Commit**

```
feat(wearable): make disease track diagnosis-aware for ET vs PD
```

---

### Task 7: Add Auto-Refresh Polling

**Files:**
- Modify: `src/app/wearable/page.tsx`

**Step 1: Add state for last-updated timestamp**

Add to the existing state declarations:

```tsx
const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
```

**Step 2: Set lastUpdated on data fetch**

In the `init()` function, after `setData(dJson)`, add: `setLastUpdated(new Date())`

In `handlePatientChange()`, after `setData(json)`, add: `setLastUpdated(new Date())`

**Step 3: Add polling useEffect**

Add after the init useEffect:

```tsx
// Auto-refresh every 15 minutes, pause when tab hidden
useEffect(() => {
  if (!selectedPatientId) return

  const POLL_INTERVAL = 15 * 60 * 1000 // 15 minutes
  let intervalId: ReturnType<typeof setInterval>
  let lastFetchTime = Date.now()

  async function silentRefresh() {
    try {
      const res = await fetch(`/api/wearable/demo-data?patient_id=${selectedPatientId}`)
      if (res.ok) {
        const json = await res.json()
        setData(json)
        setLastUpdated(new Date())
        lastFetchTime = Date.now()
      }
    } catch {
      // Silent fail — don't disrupt the UI
    }
  }

  function startPolling() {
    intervalId = setInterval(silentRefresh, POLL_INTERVAL)
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
      // If enough time passed while hidden, refresh immediately
      if (Date.now() - lastFetchTime >= POLL_INTERVAL) {
        silentRefresh()
      }
      startPolling()
    } else {
      clearInterval(intervalId)
    }
  }

  startPolling()
  document.addEventListener('visibilitychange', handleVisibilityChange)

  return () => {
    clearInterval(intervalId)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  }
}, [selectedPatientId])
```

**Step 4: Add "Last updated" indicator**

In the JSX, after the patient switcher dropdown (around line 246), add:

```tsx
{lastUpdated && (
  <span style={{ color: '#64748b', fontSize: '0.75rem' }}>
    Last updated: {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
  </span>
)}
```

**Step 5: Verify**

Open `/wearable` — should see "Last updated: HH:MM" next to the patient switcher. The time should update after 15 minutes (or test by temporarily setting interval to 10 seconds).

**Step 6: Commit**

```
feat(wearable): add 15-minute auto-refresh with visibility-aware polling
```

---

### Task 8: Build Verification + Final Commit

**Step 1: Run build**

Run: `npm run build`
Expected: Clean build, no type errors.

**Step 2: Run lint**

Run: `npm run lint`
Expected: No new lint errors.

**Step 3: Visual smoke test all scenarios**

Test on `/wearable`:
1. Demo patient (Linda Martinez): All charts render with full data, stacked sleep bars, Parkinson's disease track with dual axis
2. Live patient (Steve): Resting HR bridges over null days, total sleep bars show, rolling averages differ from daily values, baselines computed, disease track shows "Essential Tremor Monitoring" with sparse data banner

**Step 4: Commit any fixups, then done**

```
chore(wearable): build verification and cleanup
```
