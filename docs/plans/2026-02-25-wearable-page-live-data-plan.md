# Wearable Page Live Data Update — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update the wearable monitoring page to show real Apple Watch data from the Sevaro Monitor iOS app alongside the existing demo patient, with a patient switcher, updated device status, architecture diagram, and on-demand GPT-5.2 AI analysis of real biometric data.

**Architecture:** The API route gets a patient_id parameter and normalizes field names between the iOS app format (daily_steps, spo2_avg) and the existing web TypeScript interfaces (total_steps). The page adds a patient selector dropdown that fetches the patient list on mount, then loads the selected patient's data. ConceptHero gets an architecture pipeline. DataSourceCards updates Apple Watch to Live.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Supabase, React 18, inline styles (no Tailwind)

---

### Task 1: Update API Route to Accept Patient ID

**Files:**
- Modify: `/Users/stevearbogast/dev/repos/OPSAmplehtml/src/app/api/wearable/demo-data/route.ts`

**Step 1: Update the GET handler to accept a patient_id search param**

Replace the hardcoded Linda Martinez query. When `patient_id` is provided, fetch that patient by ID. Otherwise fall back to Linda by name. Add a metrics normalizer that maps iOS field names to the existing TypeScript interface fields.

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Normalize metrics from iOS app format to web dashboard format
function normalizeMetrics(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    avg_hr: raw.avg_hr ?? 0,
    resting_hr: raw.resting_hr ?? 0,
    hrv_rmssd: raw.hrv_rmssd ?? 0,
    hrv_7day_avg: raw.hrv_7day_avg ?? raw.hrv_rmssd ?? 0,
    total_steps: raw.total_steps ?? raw.daily_steps ?? 0,
    steps_7day_avg: raw.steps_7day_avg ?? raw.total_steps ?? raw.daily_steps ?? 0,
    sleep_hours: raw.sleep_hours ?? 0,
    sleep_deep: raw.sleep_deep ?? 0,
    sleep_rem: raw.sleep_rem ?? 0,
    sleep_light: raw.sleep_light ?? 0,
    sleep_awake: raw.sleep_awake ?? 0,
    sleep_efficiency: raw.sleep_efficiency ?? 0,
    awakenings: raw.awakenings ?? 0,
    tremor_pct: raw.tremor_pct ?? undefined,
    dyskinetic_mins: raw.dyskinetic_mins ?? undefined,
    // Preserve iOS-specific fields for display
    spo2_avg: raw.spo2_avg ?? undefined,
    spo2_min: raw.spo2_min ?? undefined,
    active_calories: raw.active_calories ?? undefined,
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const patientId = request.nextUrl.searchParams.get('patient_id')

    let patient
    if (patientId) {
      const { data, error } = await supabase
        .from('wearable_patients')
        .select('*')
        .eq('id', patientId)
        .single()
      if (error) throw error
      patient = data
    } else {
      const { data, error } = await supabase
        .from('wearable_patients')
        .select('*')
        .eq('name', 'Linda Martinez')
        .limit(1)
      if (error) throw error
      if (!data || data.length === 0) {
        return NextResponse.json(
          { error: 'Demo patient not found. Run npm run seed:wearable first.' },
          { status: 404 }
        )
      }
      patient = data[0]
    }

    const [summariesRes, anomaliesRes, alertsRes] = await Promise.all([
      supabase.from('wearable_daily_summaries').select('*').eq('patient_id', patient.id).order('date', { ascending: true }),
      supabase.from('wearable_anomalies').select('*').eq('patient_id', patient.id).order('detected_at', { ascending: true }),
      supabase.from('wearable_alerts').select('*').eq('patient_id', patient.id).order('created_at', { ascending: true }),
    ])

    // Normalize metrics in each daily summary
    const dailySummaries = (summariesRes.data || []).map((s: Record<string, unknown>) => ({
      ...s,
      metrics: normalizeMetrics(s.metrics as Record<string, unknown>),
    }))

    return NextResponse.json({
      patient,
      dailySummaries,
      anomalies: anomaliesRes.data || [],
      alerts: alertsRes.data || [],
    })
  } catch (error: unknown) {
    console.error('Wearable demo-data API Error:', error)
    const message = error instanceof Error ? error.message : 'An error occurred loading demo data.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

**Step 2: Verify build**

Run: `cd /Users/stevearbogast/dev/repos/OPSAmplehtml && npx next build 2>&1 | tail -5`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/app/api/wearable/demo-data/route.ts
git commit -m "feat(wearable): accept patient_id param and normalize iOS metrics"
```

---

### Task 2: Add Patient List API Route

**Files:**
- Create: `/Users/stevearbogast/dev/repos/OPSAmplehtml/src/app/api/wearable/patients/route.ts`

**Step 1: Create a new route that returns all wearable patients (for the switcher dropdown)**

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('wearable_patients')
      .select('id, name, age, sex, primary_diagnosis, wearable_devices, monitoring_start_date')
      .order('name')

    if (error) throw error

    // Tag each patient as 'demo' or 'live' based on whether they have
    // an Apple Watch with status 'connected' (from the iOS app)
    const patients = (data || []).map((p: Record<string, unknown>) => {
      const devices = p.wearable_devices as Array<{ name: string; status?: string }>
      const hasLiveAppleWatch = devices?.some(
        (d) => d.name === 'Apple Watch' && d.status === 'connected'
      )
      return { ...p, source: hasLiveAppleWatch ? 'live' : 'demo' }
    })

    return NextResponse.json({ patients })
  } catch (error: unknown) {
    console.error('Wearable patients API Error:', error)
    const message = error instanceof Error ? error.message : 'Failed to load patients'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

**Step 2: Verify build**

Run: `cd /Users/stevearbogast/dev/repos/OPSAmplehtml && npx next build 2>&1 | tail -5`

**Step 3: Commit**

```bash
git add src/app/api/wearable/patients/route.ts
git commit -m "feat(wearable): add patients list endpoint for switcher"
```

---

### Task 3: Add Patient Switcher to Page

**Files:**
- Modify: `/Users/stevearbogast/dev/repos/OPSAmplehtml/src/app/wearable/page.tsx`
- Modify: `/Users/stevearbogast/dev/repos/OPSAmplehtml/src/lib/wearable/types.ts`

**Step 1: Add PatientSummary type to types.ts**

Add at the bottom of the types file, before the string constants:

```typescript
// Patient summary for the switcher dropdown
export interface PatientSummary {
  id: string
  name: string
  age: number
  sex: string
  primary_diagnosis: string
  source: 'live' | 'demo'
}
```

**Step 2: Update the page component**

Add patient list fetching, a selected patient state, and a dropdown switcher. Pass the `source` to `FeatureSubHeader` to toggle the Demo/Live badge. Key changes:

- New state: `patients` (PatientSummary[]), `selectedPatientId` (string | null)
- On mount: fetch `/api/wearable/patients`, then fetch data for the first patient
- On patient change: re-fetch `/api/wearable/demo-data?patient_id=...`
- Pass `showDemo={selectedSource === 'demo'}` to FeatureSubHeader
- Add `badgeText` prop to FeatureSubHeader (new)

The patient switcher dropdown renders above the ConceptHero inside the content area. Style: dark select matching the page theme (`background: #1e293b`, `color: #e2e8f0`, `border: 1px solid #334155`). Each option shows: `Name — Diagnosis [Live/Demo]`.

**Step 3: Update FeatureSubHeader to support custom badge text**

Add optional `badgeText` prop to `FeatureSubHeaderProps`. When provided, show that text instead of "Demo". When `showDemo` is false and no `badgeText`, show nothing. When source is 'live', pass `badgeText="Live"` with a green-tinted background instead of the default white-tinted one.

Add to the interface:
```typescript
badgeText?: string
badgeBg?: string
```

Replace the badge rendering:
```typescript
{(showDemo || badgeText) && (
  <span style={{
    background: badgeBg || 'rgba(255,255,255,0.2)',
    color: 'white',
    fontSize: 11,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 4,
    letterSpacing: 0.5,
  }}>
    {badgeText || 'Demo'}
  </span>
)}
```

**Step 4: Verify build**

Run: `cd /Users/stevearbogast/dev/repos/OPSAmplehtml && npx next build 2>&1 | tail -5`

**Step 5: Commit**

```bash
git add src/app/wearable/page.tsx src/lib/wearable/types.ts src/components/layout/FeatureSubHeader.tsx
git commit -m "feat(wearable): add patient switcher with Live/Demo badge"
```

---

### Task 4: Update Apple Watch to Live Integration

**Files:**
- Modify: `/Users/stevearbogast/dev/repos/OPSAmplehtml/src/lib/wearable/types.ts`

**Step 1: Change Apple Watch integration_status from 'planned' to 'live'**

In the `WEARABLE_DEVICES` array, update the Apple Watch entry:

```typescript
{
  name: 'Apple Watch',
  image_icon: 'apple-watch',
  data_types: ['HR', 'HRV', 'Steps', 'Sleep', 'SpO2', 'Accelerometer', 'Fall Detection', 'ECG'],
  integration_status: 'live',
  priority: 2,
},
```

**Step 2: Update the POC banner text**

Replace `WEARABLE_POC_BANNER_TEXT`:

```typescript
export const WEARABLE_POC_BANNER_TEXT =
  'This wearable monitoring dashboard combines live Apple Watch data (via the Sevaro Monitor iOS app) with simulated data to demonstrate AI-assisted pattern detection for neurological conditions.'
```

**Step 3: Commit**

```bash
git add src/lib/wearable/types.ts
git commit -m "feat(wearable): update Apple Watch to Live, update POC banner"
```

---

### Task 5: Add Data Path Visualization to DataSourceCards

**Files:**
- Modify: `/Users/stevearbogast/dev/repos/OPSAmplehtml/src/components/wearable/DataSourceCards.tsx`

**Step 1: Add a horizontal pipeline below the device cards**

After the device cards row, add a new section titled "Live Data Pipeline" showing 5 nodes connected by arrows:

1. **Apple Watch** (icon: watch, color: #0EA5E9) — "HR, HRV, Sleep, Steps, SpO2"
2. **HealthKit** (icon: heart, color: #FF2D55) — "iOS health data store"
3. **Sevaro Monitor** (icon: phone, color: #10B981) — "Collects & syncs daily"
4. **Supabase Cloud** (icon: database, color: #3ECF8E) — "Stores summaries & baselines"
5. **AI Analysis** (icon: brain, color: #8B5CF6) — "Pattern detection & alerts"

Style: same dark card background as ConceptHero (`background: #1e293b`, `border: 1px solid #334155`, `borderRadius: 12px`). Each node is a small circle icon with label below. Nodes connected by dashed arrows (same style as ConceptHero arrows). Add subtitle "via Sevaro Monitor iOS app" under the section header.

Wrap in a `<div>` with `marginTop: '24px'`.

**Step 2: Verify build and visually check**

Run: `cd /Users/stevearbogast/dev/repos/OPSAmplehtml && npm run dev`
Navigate to `/wearable` and verify the pipeline renders correctly.

**Step 3: Commit**

```bash
git add src/components/wearable/DataSourceCards.tsx
git commit -m "feat(wearable): add live data pipeline visualization"
```

---

### Task 6: Add Architecture Diagram to ConceptHero

**Files:**
- Modify: `/Users/stevearbogast/dev/repos/OPSAmplehtml/src/components/wearable/ConceptHero.tsx`

**Step 1: Add a detailed architecture section below the value prop pills**

After the value prop pills div, add a new card section:

- Title: "System Architecture" with subtitle "How data flows from wrist to clinical insight"
- 5-node horizontal pipeline (same nodes as Task 5 data path but with more detail):
  1. **Apple Watch** — "Continuous biometric collection: HR every 5 min, HRV, SpO2, accelerometer, sleep stages"
  2. **HealthKit** — "Apple's on-device health data aggregation layer"
  3. **Sevaro Monitor (iPhone)** — "Daily collection via HealthKit queries, tremor assessment via CoreMotion, encrypted sync to cloud"
  4. **Supabase** — "Patient profiles, daily summaries, baseline metrics, anomaly records"
  5. **AI Engine (GPT-5.2)** — "Baseline comparison, multi-day trend analysis, anomaly detection, alert routing"

Style: subtle inner card (`background: rgba(14, 165, 233, 0.05)`, `border: 1px solid rgba(14, 165, 233, 0.15)`, `borderRadius: 8px`, `padding: 24px`, `marginTop: 24px`).

**Step 2: Update the concept description paragraph**

Replace the third paragraph ("This proof of concept demonstrates the full pipeline using simulated data...") with:

"This system now includes a live integration path: Apple Watch data flows through the Sevaro Monitor iOS companion app into Supabase, where the AI engine can analyze it against personal baselines. The demo patient shows 30 days of simulated Parkinson's data; live patients show real Apple Watch biometrics."

**Step 3: Verify build**

Run: `cd /Users/stevearbogast/dev/repos/OPSAmplehtml && npx next build 2>&1 | tail -5`

**Step 4: Commit**

```bash
git add src/components/wearable/ConceptHero.tsx
git commit -m "feat(wearable): add system architecture diagram to hero"
```

---

### Task 7: Handle Empty Data Gracefully

**Files:**
- Modify: `/Users/stevearbogast/dev/repos/OPSAmplehtml/src/components/wearable/PatientTimeline.tsx`
- Modify: `/Users/stevearbogast/dev/repos/OPSAmplehtml/src/components/wearable/ClinicianAlertDashboard.tsx`
- Modify: `/Users/stevearbogast/dev/repos/OPSAmplehtml/src/components/wearable/AIAnalysisLog.tsx`
- Modify: `/Users/stevearbogast/dev/repos/OPSAmplehtml/src/components/wearable/PatientNudgePreview.tsx`

**Step 1: Add empty state messages**

For each component, check if its data array is empty. If so, render a centered message instead of the component content:

```typescript
// Pattern for each component — add at top of render, after the section header
if (!dataArray || dataArray.length === 0) {
  return (
    <div>
      {/* Keep existing section header */}
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '12px',
        padding: '48px 24px',
        textAlign: 'center',
      }}>
        <p style={{ color: '#64748b', fontSize: '0.9rem', margin: 0 }}>
          No data yet — sync from the Sevaro Monitor app to see results here.
        </p>
      </div>
    </div>
  )
}
```

Apply this pattern to:
- `PatientTimeline` — check `dailySummaries.length === 0`
- `ClinicianAlertDashboard` — check `alerts.length === 0`
- `AIAnalysisLog` — check `anomalies.length === 0`
- `PatientNudgePreview` — check `anomalies.length === 0`

**Step 2: Verify build**

Run: `cd /Users/stevearbogast/dev/repos/OPSAmplehtml && npx next build 2>&1 | tail -5`

**Step 3: Commit**

```bash
git add src/components/wearable/PatientTimeline.tsx src/components/wearable/ClinicianAlertDashboard.tsx src/components/wearable/AIAnalysisLog.tsx src/components/wearable/PatientNudgePreview.tsx
git commit -m "feat(wearable): add empty state messages for real patient data"
```

---

### Task 8: Update DailyMetrics Type for iOS Fields

**Files:**
- Modify: `/Users/stevearbogast/dev/repos/OPSAmplehtml/src/lib/wearable/types.ts`

**Step 1: Add optional iOS-specific fields to DailyMetrics interface**

The normalizer in Task 1 maps iOS fields, but we should also make the type aware of additional fields the iOS app sends. Add to DailyMetrics:

```typescript
export interface DailyMetrics {
  avg_hr: number
  resting_hr: number
  hrv_rmssd: number
  hrv_7day_avg: number
  total_steps: number
  steps_7day_avg: number
  sleep_hours: number
  sleep_deep: number
  sleep_rem: number
  sleep_light: number
  sleep_awake: number
  sleep_efficiency: number
  awakenings: number
  tremor_pct?: number
  dyskinetic_mins?: number
  // iOS-specific fields (from Sevaro Monitor app)
  spo2_avg?: number
  spo2_min?: number
  active_calories?: number
}
```

**Step 2: Commit**

```bash
git add src/lib/wearable/types.ts
git commit -m "feat(wearable): add iOS-specific fields to DailyMetrics type"
```

---

### Task 9: Add Run AI Analysis Button

**Files:**
- Modify: `/Users/stevearbogast/dev/repos/OPSAmplehtml/src/app/wearable/page.tsx`

**Step 1: Add analysis state and handler to the page component**

Add new state variables:
```typescript
const [analyzing, setAnalyzing] = useState(false)
const [analysisResult, setAnalysisResult] = useState<AIAnalysisResponse | null>(null)
const [analysisError, setAnalysisError] = useState<string | null>(null)
```

Add the handler function:
```typescript
async function runAnalysis() {
  if (!data?.patient?.id) return
  setAnalyzing(true)
  setAnalysisError(null)
  setAnalysisResult(null)
  try {
    const res = await fetch('/api/wearable/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patient_id: data.patient.id, analysis_window_days: 7 }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || 'Analysis failed')
    }
    const result = await res.json()
    setAnalysisResult(result)
    // Re-fetch patient data to pick up any new anomalies/alerts written by the analysis
    const refreshRes = await fetch(`/api/wearable/demo-data?patient_id=${data.patient.id}`)
    if (refreshRes.ok) {
      const refreshed = await refreshRes.json()
      setData(refreshed)
    }
  } catch (err) {
    setAnalysisError(err instanceof Error ? err.message : 'Analysis failed')
  } finally {
    setAnalyzing(false)
  }
}
```

**Step 2: Add the Run Analysis button and result card to the page layout**

Place this between the PatientTimeline and ClinicianAlertDashboard sections in the content area:

```tsx
{/* AI Analysis Section */}
<div>
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '16px',
  }}>
    <div>
      <h2 style={{ color: '#fff', fontSize: '1.15rem', fontWeight: 700, margin: '0 0 4px' }}>
        AI Analysis
      </h2>
      <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0 }}>
        Run GPT-5.2 analysis on this patient&apos;s wearable data
      </p>
    </div>
    <button
      onClick={runAnalysis}
      disabled={analyzing || !data}
      style={{
        padding: '10px 24px',
        borderRadius: '8px',
        background: analyzing ? '#334155' : '#8B5CF6',
        color: '#fff',
        border: 'none',
        fontSize: '0.85rem',
        fontWeight: 600,
        cursor: analyzing ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}
    >
      {analyzing && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'wearable-spin 1s linear infinite' }}>
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      )}
      {analyzing ? 'Analyzing...' : 'Run AI Analysis'}
    </button>
  </div>

  {analysisError && (
    <div style={{
      background: 'rgba(220, 38, 38, 0.1)',
      border: '1px solid rgba(220, 38, 38, 0.3)',
      borderRadius: '8px',
      padding: '12px 16px',
      marginBottom: '16px',
    }}>
      <p style={{ color: '#fca5a5', fontSize: '0.85rem', margin: 0 }}>{analysisError}</p>
    </div>
  )}

  {analysisResult && (
    <div style={{
      background: '#1e293b',
      border: '1px solid #334155',
      borderRadius: '12px',
      padding: '24px',
    }}>
      {/* Status badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <span style={{
          padding: '4px 12px',
          borderRadius: '8px',
          background: analysisResult.overall_status === 'normal' ? 'rgba(16, 185, 129, 0.15)' :
                      analysisResult.overall_status === 'watch' ? 'rgba(37, 99, 235, 0.15)' :
                      analysisResult.overall_status === 'concern' ? 'rgba(217, 119, 6, 0.15)' :
                      'rgba(220, 38, 38, 0.15)',
          color: analysisResult.overall_status === 'normal' ? '#10B981' :
                 analysisResult.overall_status === 'watch' ? '#3B82F6' :
                 analysisResult.overall_status === 'concern' ? '#F59E0B' : '#DC2626',
          fontSize: '0.8rem',
          fontWeight: 600,
        }}>
          {analysisResult.overall_status.toUpperCase()}
        </span>
        <span style={{ color: '#64748b', fontSize: '0.8rem' }}>
          {analysisResult.analysis_period}
        </span>
      </div>

      {/* Narrative */}
      <p style={{ color: '#cbd5e1', fontSize: '0.85rem', lineHeight: 1.7, margin: '0 0 16px' }}>
        {analysisResult.narrative_summary}
      </p>

      {/* Anomalies detected */}
      {analysisResult.anomalies && analysisResult.anomalies.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <h4 style={{ color: '#e2e8f0', fontSize: '0.9rem', fontWeight: 600, margin: '0 0 8px' }}>
            Anomalies Detected
          </h4>
          {analysisResult.anomalies.map((a, i) => (
            <div key={i} style={{
              background: '#0f172a',
              borderRadius: '8px',
              padding: '12px 16px',
              marginBottom: '8px',
            }}>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                <span style={{ color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 600 }}>
                  {a.description}
                </span>
              </div>
              <p style={{ color: '#94a3b8', fontSize: '0.8rem', margin: '4px 0 0', lineHeight: 1.5 }}>
                {a.clinical_significance}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Trends */}
      {analysisResult.trends_observed && analysisResult.trends_observed.length > 0 && (
        <div>
          <h4 style={{ color: '#e2e8f0', fontSize: '0.9rem', fontWeight: 600, margin: '0 0 8px' }}>
            Trends Observed
          </h4>
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            {analysisResult.trends_observed.map((t, i) => (
              <li key={i} style={{ color: '#94a3b8', fontSize: '0.8rem', marginBottom: '4px', lineHeight: 1.5 }}>
                {t}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Not HIPAA disclaimer */}
      <div style={{
        marginTop: '16px',
        padding: '8px 12px',
        background: 'rgba(245, 158, 11, 0.08)',
        border: '1px solid rgba(245, 158, 11, 0.2)',
        borderRadius: '6px',
      }}>
        <p style={{ color: '#F59E0B', fontSize: '0.75rem', margin: 0, fontStyle: 'italic' }}>
          This analysis is for demonstration purposes only. This system is not HIPAA-compliant and should not be used for clinical decision-making.
        </p>
      </div>
    </div>
  )}
</div>
```

**Step 3: Import AIAnalysisResponse type**

At the top of page.tsx, update the import:
```typescript
import type { WearableDemoData, PatientSummary, AIAnalysisResponse } from '@/lib/wearable/types'
```

**Step 4: Verify build**

Run: `cd /Users/stevearbogast/dev/repos/OPSAmplehtml && npx next build 2>&1 | tail -5`

**Step 5: Commit**

```bash
git add src/app/wearable/page.tsx
git commit -m "feat(wearable): add Run AI Analysis button with GPT-5.2 integration"
```

---

### Task 10: Visual Verification and Final Polish

**Step 1: Start dev server and test both patients**

Run: `cd /Users/stevearbogast/dev/repos/OPSAmplehtml && npm run dev`

Test checklist:
- [ ] Page loads with patient switcher
- [ ] Switcher shows Linda (Demo) and Steve (Live)
- [ ] Selecting Steve loads real Apple Watch data
- [ ] Header badge changes from "Demo" to "Live"
- [ ] Apple Watch card shows "Live Integration" (green)
- [ ] Data path pipeline renders correctly
- [ ] Architecture diagram displays below 3-step flow
- [ ] Empty sections (alerts, anomalies) show "No data yet" message
- [ ] Run AI Analysis button appears, clicking triggers GPT-5.2
- [ ] Analysis result card renders with status, narrative, anomalies, trends
- [ ] HIPAA disclaimer appears below analysis results
- [ ] Selecting Linda loads demo data as before
- [ ] All existing demo functionality still works

**Step 2: Commit any final polish**

```bash
git add -A
git commit -m "polish(wearable): final adjustments from visual verification"
```
