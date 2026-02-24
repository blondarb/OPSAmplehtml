# Card 6: Wearable Monitoring POC — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the Phase 1A POC of the Longitudinal Wearable Data & AI Monitoring card — a standalone demo page at `/wearable` with 30-day patient timeline, clinician alert dashboard, and AI analysis log.

**Architecture:** Next.js page at `/wearable` (no auth, demo mode) with 6 scrollable content sections. Supabase stores demo data (4 tables). Two API routes: one loads demo data, one calls OpenAI gpt-5.2 for AI analysis. Recharts renders 5 data tracks with baseline bands and anomaly markers. Homepage gets a new card linking to `/wearable`.

**Tech Stack:** Next.js 15, TypeScript, Recharts (already installed), Supabase, OpenAI gpt-5.2, inline styles (project convention).

**Full spec:** `/Users/stevearbogast/Desktop/playbooks/06_wearable_monitoring.md`
**Design doc:** `/Users/stevearbogast/dev/repos/OPSAmplehtml/docs/plans/2026-02-23-wearable-monitoring-design.md`

---

## Task 1: Types & Constants

**Files:**
- Create: `src/lib/wearable/types.ts`

**Step 1: Create the types file**

All TypeScript interfaces, type unions, and display constants for the wearable domain. Follow the triage pattern: literal union types first, interfaces in dependency order, display config objects, string constants last.

Key types to define:

```typescript
// Severity and status unions
export type AlertSeverity = 'urgent' | 'attention' | 'informational'
export type OverallStatus = 'normal' | 'watch' | 'concern' | 'alert'
export type AlertType = 'patient_nudge' | 'clinician_notification' | 'urgent_escalation' | 'log_only'
export type AnomalyType = 'fall_event' | 'seizure_like' | 'sustained_decline' | 'medication_pattern' | 'sleep_fragmentation' | 'hrv_depression' | 'pattern_match'
export type IntegrationStatus = 'live' | 'planned' | 'future'
export type DashboardView = 'triage_team' | 'neurologist'

// Data interfaces
export interface WearablePatient { id, name, age, sex, primary_diagnosis, medications, wearable_devices, baseline_metrics, monitoring_start_date }
export interface DailyMetrics { avg_hr, resting_hr, hrv_rmssd, hrv_7day_avg, total_steps, steps_7day_avg, sleep_hours, sleep_deep, sleep_rem, sleep_light, sleep_awake, sleep_efficiency, awakenings, tremor_pct, dyskinetic_mins }
export interface DailySummary { id, patient_id, date, metrics: DailyMetrics, anomalies_detected, ai_analysis, overall_status }
export interface WearableAnomaly { id, patient_id, detected_at, anomaly_type, severity, trigger_data, ai_assessment, ai_reasoning, clinical_significance, recommended_action, patient_message }
export interface WearableAlert { id, anomaly_id, patient_id, created_at, alert_type, severity, title, body, acknowledged, escalated_to_md, action_taken }

// AI analysis response (matches playbook Section 6.4 output format)
export interface AIAnalysisResponse { analysis_period, overall_status, narrative_summary, anomalies[], trends_observed[], data_quality_notes }

// Demo data bundle (returned by /api/wearable/demo-data)
export interface WearableDemoData { patient: WearablePatient, dailySummaries: DailySummary[], anomalies: WearableAnomaly[], alerts: WearableAlert[] }

// Clinical use case table row
export interface ClinicalUseCase { diagnosis, wearable_signal, anomaly_to_detect, alert_trigger, suggested_action }

// Display config
export const SEVERITY_DISPLAY: Record<AlertSeverity, { label, color, bgColor, borderColor }> = { urgent: { label: 'Urgent', color: '#DC2626', ... }, attention: { ... }, informational: { ... } }

// Wearable device info
export interface WearableDevice { name, image_icon, data_types[], integration_status: IntegrationStatus, priority }

export const WEARABLE_DEVICES: WearableDevice[] = [
  { name: 'Samsung Galaxy Watch', ... status: 'live', priority: 1 },
  { name: 'Apple Watch', ... status: 'planned', priority: 2 },
  { name: 'Oura Ring', ... status: 'future', priority: 3 },
]

// Clinical use cases (8 diagnoses from playbook Section 3)
export const CLINICAL_USE_CASES: ClinicalUseCase[] = [...]

// Disclaimer text
export const WEARABLE_DISCLAIMER_TEXT = 'This system analyzes consumer wearable device data to identify patterns that may be clinically relevant. Consumer wearables are not medical devices and their measurements may not be accurate. All alerts are intended to support, not replace, clinical judgment.'
```

**Step 2: Commit**

```bash
git add src/lib/wearable/types.ts
git commit -m "feat(wearable): add TypeScript types and constants for Card 6"
```

---

## Task 2: Supabase Migration

**Files:**
- Create: `supabase/migrations/024_wearable_monitoring.sql`

Check existing migrations first: `ls supabase/migrations/` to confirm the next sequence number is 024.

**Step 1: Write the migration**

```sql
-- 024_wearable_monitoring.sql
-- Card 6: Longitudinal Wearable Data & AI Monitoring
-- Creates tables for wearable patient data, daily summaries, anomalies, and alerts.
-- ================================================================

-- Wearable patients (demo patient records)
CREATE TABLE IF NOT EXISTS wearable_patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Demographics
  name TEXT NOT NULL,
  age INTEGER NOT NULL,
  sex TEXT NOT NULL,
  primary_diagnosis TEXT NOT NULL,

  -- Clinical context
  medications JSONB NOT NULL DEFAULT '[]'::jsonb,
  wearable_devices JSONB NOT NULL DEFAULT '[]'::jsonb,
  baseline_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Monitoring
  monitoring_start_date DATE NOT NULL DEFAULT CURRENT_DATE
);

-- Daily aggregated summaries (frontend renders these, NOT raw data points)
CREATE TABLE IF NOT EXISTS wearable_daily_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES wearable_patients(id) ON DELETE CASCADE,
  date DATE NOT NULL,

  -- Aggregated metrics
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- AI analysis
  anomalies_detected JSONB NOT NULL DEFAULT '[]'::jsonb,
  ai_analysis TEXT,
  overall_status TEXT NOT NULL DEFAULT 'normal',

  UNIQUE(patient_id, date)
);

CREATE INDEX IF NOT EXISTS idx_wearable_daily_summaries_patient_date
  ON wearable_daily_summaries (patient_id, date DESC);

-- AI-detected anomalies
CREATE TABLE IF NOT EXISTS wearable_anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES wearable_patients(id) ON DELETE CASCADE,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Classification
  anomaly_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'informational',

  -- AI reasoning
  trigger_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_assessment TEXT,
  ai_reasoning TEXT,
  clinical_significance TEXT,
  recommended_action TEXT,
  patient_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_wearable_anomalies_patient
  ON wearable_anomalies (patient_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_wearable_anomalies_severity
  ON wearable_anomalies (severity);

-- Clinical alerts generated from anomalies
CREATE TABLE IF NOT EXISTS wearable_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anomaly_id UUID REFERENCES wearable_anomalies(id) ON DELETE SET NULL,
  patient_id UUID NOT NULL REFERENCES wearable_patients(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Alert details
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'informational',
  title TEXT NOT NULL,
  body TEXT,

  -- Status
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  escalated_to_md BOOLEAN NOT NULL DEFAULT false,
  action_taken TEXT
);

CREATE INDEX IF NOT EXISTS idx_wearable_alerts_patient
  ON wearable_alerts (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wearable_alerts_severity
  ON wearable_alerts (severity, acknowledged);

-- RLS policies (demo mode — allow all)
ALTER TABLE wearable_patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE wearable_daily_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE wearable_anomalies ENABLE ROW LEVEL SECURITY;
ALTER TABLE wearable_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to wearable_patients" ON wearable_patients FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to wearable_daily_summaries" ON wearable_daily_summaries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to wearable_anomalies" ON wearable_anomalies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to wearable_alerts" ON wearable_alerts FOR ALL USING (true) WITH CHECK (true);
```

**Step 2: Commit**

```bash
git add supabase/migrations/024_wearable_monitoring.sql
git commit -m "feat(wearable): add Supabase migration for wearable monitoring tables"
```

**Step 3: Apply migration to Supabase**

This step requires user confirmation per CLAUDE.md rules (Supabase migration targeting remote). Ask the user before running. Use the Supabase MCP tool `apply_migration` with project_id `wygfhizdvstvvvjcohez` — wait, that's the RepGenius project. Check for the OPSAmplehtml Supabase project ID first by looking at the `.env.local` or running `supabase projects list`.

Actually — check `src/lib/supabase/client.ts` or `.env.local` for the Supabase URL to determine the project. The migration can also be applied via Supabase dashboard SQL editor or via `supabase db push`.

---

## Task 3: Seed Script

**Files:**
- Create: `scripts/seed-wearable-demo.ts`

**Step 1: Write the seed script**

This generates the Linda Martinez 30-day demo dataset per playbook Section 4.3. The script:
1. Creates the patient record
2. Generates 30 daily summaries with realistic physiological variation
3. Creates ~7 anomaly records for the key clinical events
4. Creates corresponding alert records

Key implementation notes:
- Use sinusoidal variation for circadian HR patterns (±3 bpm from base)
- Add small random jitter to each metric (±5-10% of base) for realism
- Hard-code the clinical events at specific days per the playbook scenario
- The script connects to Supabase and upserts data (safe to re-run)

```typescript
// scripts/seed-wearable-demo.ts
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Linda Martinez — 58F, Parkinson's Disease
const PATIENT = {
  name: 'Linda Martinez',
  age: 58,
  sex: 'F',
  primary_diagnosis: "Parkinson's Disease",
  medications: [
    { name: 'Carbidopa/Levodopa', dose: '25/100mg', frequency: 'TID' }
  ],
  wearable_devices: [
    { name: 'Samsung Galaxy Watch 7', status: 'connected', data_types: ['hr', 'hrv', 'steps', 'sleep', 'accelerometer', 'gyroscope', 'spo2'] }
  ],
  baseline_metrics: {
    resting_hr: 68, hrv_rmssd: 32, daily_steps: 5500,
    sleep_hours: 6.75, tremor_pct: 12, dyskinetic_mins: 8,
    sleep_efficiency: 0.85, awakenings: 1.5
  },
  monitoring_start_date: '2026-01-24' // 30 days before today
}

// Helper: add jitter to a base value
function jitter(base: number, pct: number): number {
  return Math.round((base + base * (Math.random() - 0.5) * 2 * pct) * 10) / 10
}

// Generate 30 days of data per playbook Section 4.3
function generateDailySummaries(patientId: string) {
  const startDate = new Date('2026-01-24')
  const summaries = []

  for (let day = 0; day < 30; day++) {
    const date = new Date(startDate)
    date.setDate(date.getDate() + day)
    const dateStr = date.toISOString().split('T')[0]
    const dayNum = day + 1

    let metrics: Record<string, number>
    let anomalies: string[] = []
    let status = 'normal'

    if (dayNum <= 10) {
      // Baseline period
      metrics = {
        avg_hr: jitter(72, 0.03), resting_hr: jitter(68, 0.02),
        hrv_rmssd: jitter(32, 0.08), hrv_7day_avg: 32,
        total_steps: jitter(5500, 0.1), steps_7day_avg: 5500,
        sleep_hours: jitter(6.75, 0.05), sleep_deep: jitter(1.5, 0.1),
        sleep_rem: jitter(1.8, 0.1), sleep_light: jitter(3.0, 0.1),
        sleep_awake: jitter(0.45, 0.15), sleep_efficiency: jitter(85, 0.03),
        awakenings: Math.round(jitter(1.5, 0.2)),
        tremor_pct: jitter(12, 0.1), dyskinetic_mins: jitter(8, 0.15),
      }
    } else if (dayNum === 11) {
      // Missed medication dose — spike
      metrics = {
        avg_hr: 78, resting_hr: 72, hrv_rmssd: 24, hrv_7day_avg: 31,
        total_steps: 3200, steps_7day_avg: 5300,
        sleep_hours: 5.5, sleep_deep: 0.8, sleep_rem: 1.2, sleep_light: 2.8,
        sleep_awake: 0.7, sleep_efficiency: 72, awakenings: 3,
        tremor_pct: 38, dyskinetic_mins: 45,
      }
      anomalies = ['Missed medication dose: tremor spike to 38%, dyskinetic minutes 45']
      status = 'alert'
    } else if (dayNum === 12) {
      // Recovery
      metrics = {
        avg_hr: 74, resting_hr: 69, hrv_rmssd: 28, hrv_7day_avg: 30,
        total_steps: 4800, steps_7day_avg: 5200,
        sleep_hours: 6.2, sleep_deep: 1.2, sleep_rem: 1.5, sleep_light: 3.0,
        sleep_awake: 0.5, sleep_efficiency: 80, awakenings: 2,
        tremor_pct: 14, dyskinetic_mins: 12,
      }
      status = 'watch'
    } else if (dayNum >= 13 && dayNum <= 18) {
      // Gradual worsening (playbook: steps 5200->3600, tremor 14->28%, dyskinetic 10->35)
      const progress = (dayNum - 13) / 5 // 0 to 1
      metrics = {
        avg_hr: 72 + progress * 4, resting_hr: 68 + progress * 3,
        hrv_rmssd: 30 - progress * 8, hrv_7day_avg: 30 - progress * 5,
        total_steps: Math.round(5200 - progress * 1600),
        steps_7day_avg: Math.round(5100 - progress * 1000),
        sleep_hours: 6.5 - progress * 0.8, sleep_deep: 1.3 - progress * 0.4,
        sleep_rem: 1.6 - progress * 0.3, sleep_light: 3.0, sleep_awake: 0.6 + progress * 0.3,
        sleep_efficiency: 82 - progress * 10, awakenings: Math.round(2 + progress * 1.5),
        tremor_pct: 14 + progress * 14, dyskinetic_mins: Math.round(10 + progress * 25),
      }
      status = dayNum >= 15 ? 'concern' : 'watch'
      if (dayNum === 15) {
        anomalies = ['3-day sustained activity decline with rising tremor percentages']
      }
    } else if (dayNum === 19) {
      // Fall detected
      metrics = {
        avg_hr: 82, resting_hr: 72, hrv_rmssd: 20, hrv_7day_avg: 24,
        total_steps: 2800, steps_7day_avg: 3800,
        sleep_hours: 5.8, sleep_deep: 0.9, sleep_rem: 1.1, sleep_light: 3.0,
        sleep_awake: 0.8, sleep_efficiency: 70, awakenings: 3,
        tremor_pct: 30, dyskinetic_mins: 38,
      }
      anomalies = ['Fall detected: accelerometer impact + brief inactivity + HR spike to 112']
      status = 'alert'
    } else if (dayNum === 20) {
      // Activity drop, fragmented sleep
      metrics = {
        avg_hr: 76, resting_hr: 70, hrv_rmssd: 22, hrv_7day_avg: 23,
        total_steps: 2400, steps_7day_avg: 3500,
        sleep_hours: 5.2, sleep_deep: 0.7, sleep_rem: 1.0, sleep_light: 2.8,
        sleep_awake: 0.7, sleep_efficiency: 68, awakenings: 3,
        tremor_pct: 28, dyskinetic_mins: 32,
      }
      anomalies = ['Sustained activity and sleep decline following fall event']
      status = 'concern'
    } else if (dayNum >= 21 && dayNum <= 25) {
      // Partial recovery
      const progress = (dayNum - 21) / 4
      metrics = {
        avg_hr: 76 - progress * 4, resting_hr: 70 - progress * 2,
        hrv_rmssd: 22 + progress * 6, hrv_7day_avg: 23 + progress * 4,
        total_steps: Math.round(2800 + progress * 1800),
        steps_7day_avg: Math.round(3200 + progress * 1200),
        sleep_hours: 5.5 + progress * 0.8, sleep_deep: 0.9 + progress * 0.3,
        sleep_rem: 1.2 + progress * 0.3, sleep_light: 2.8 + progress * 0.2,
        sleep_awake: 0.6 - progress * 0.15, sleep_efficiency: 72 + progress * 8,
        awakenings: Math.round(2.5 - progress),
        tremor_pct: 26 - progress * 6, dyskinetic_mins: Math.round(28 - progress * 10),
      }
      status = 'watch'
    } else if (dayNum === 26) {
      // Continued recovery
      metrics = {
        avg_hr: 73, resting_hr: 69, hrv_rmssd: 28, hrv_7day_avg: 27,
        total_steps: 4500, steps_7day_avg: 4200,
        sleep_hours: 6.3, sleep_deep: 1.2, sleep_rem: 1.5, sleep_light: 3.0,
        sleep_awake: 0.6, sleep_efficiency: 79, awakenings: 2,
        tremor_pct: 20, dyskinetic_mins: 18,
      }
      status = 'watch'
    } else if (dayNum === 27) {
      // Second fall
      metrics = {
        avg_hr: 80, resting_hr: 71, hrv_rmssd: 21, hrv_7day_avg: 26,
        total_steps: 2200, steps_7day_avg: 3900,
        sleep_hours: 5.0, sleep_deep: 0.6, sleep_rem: 0.9, sleep_light: 2.8,
        sleep_awake: 0.7, sleep_efficiency: 66, awakenings: 4,
        tremor_pct: 30, dyskinetic_mins: 35,
      }
      anomalies = ['Second fall detected: 2 falls in 9 days']
      status = 'alert'
    } else {
      // Days 28-30: New baseline establishing
      const progress = (dayNum - 28) / 2
      metrics = {
        avg_hr: 74 - progress * 2, resting_hr: 69,
        hrv_rmssd: 26 + progress * 3, hrv_7day_avg: 26 + progress * 2,
        total_steps: Math.round(3800 + progress * 800),
        steps_7day_avg: Math.round(3700 + progress * 400),
        sleep_hours: 6.0 + progress * 0.3, sleep_deep: 1.0 + progress * 0.2,
        sleep_rem: 1.3 + progress * 0.1, sleep_light: 3.0, sleep_awake: 0.55,
        sleep_efficiency: 75 + progress * 3, awakenings: 2,
        tremor_pct: 22 - progress * 2, dyskinetic_mins: Math.round(20 - progress * 4),
      }
      status = 'watch'
    }

    summaries.push({
      patient_id: patientId,
      date: dateStr,
      metrics,
      anomalies_detected: anomalies,
      ai_analysis: anomalies.length > 0 ? `Anomaly detected: ${anomalies[0]}` : 'No clinically concerning patterns detected.',
      overall_status: status,
    })
  }
  return summaries
}

// Generate anomalies per playbook scenario
function generateAnomalies(patientId: string, startDate: string) {
  const start = new Date(startDate)
  function dayDate(dayNum: number) {
    const d = new Date(start)
    d.setDate(d.getDate() + dayNum - 1)
    return d.toISOString()
  }

  return [
    {
      patient_id: patientId, detected_at: dayDate(11),
      anomaly_type: 'medication_pattern', severity: 'attention',
      trigger_data: { tremor_pct: 38, dyskinetic_mins: 45, steps: 3200, hrv: 24 },
      ai_assessment: 'Significant medication-related event. Resting tremor spiked to 38% with dyskinetic minutes at 45, consistent with a missed or delayed Carbidopa/Levodopa dose.',
      ai_reasoning: 'Multiple simultaneous metric deviations: tremor +217% above baseline, dyskinetic minutes +463% above baseline, steps -42% below baseline, HRV -25% below baseline. The rapid onset and concurrent nature of all deviations is consistent with medication interruption rather than disease progression.',
      clinical_significance: 'Medication adherence event. The simultaneous tremor spike and motor fluctuation increase suggest a missed dose rather than disease progression.',
      recommended_action: 'Monitor for recovery. If pattern repeats, consider medication adherence counseling or dose timing review.',
      patient_message: null,
    },
    {
      patient_id: patientId, detected_at: dayDate(15),
      anomaly_type: 'sustained_decline', severity: 'attention',
      trigger_data: { steps_trend: [5200, 4800, 4500], tremor_trend: [14, 16, 19], days: 3 },
      ai_assessment: '3-day sustained activity decline with rising resting tremor percentages. Pattern consistent with medication wearing-off or disease progression.',
      ai_reasoning: 'Step count has declined 13% over 3 consecutive days while resting tremor percentage has risen from 14% to 19%. These concurrent trends in opposite directions (activity down, tremor up) are a reliable signal of motor function deterioration in Parkinson\'s patients.',
      clinical_significance: 'Progressive motor decline beyond normal variation. The trend direction and duration (3+ days) meet the threshold for clinical attention.',
      recommended_action: 'Consider medication timing review. Evaluate for wearing-off phenomena.',
      patient_message: null,
    },
    {
      patient_id: patientId, detected_at: dayDate(19),
      anomaly_type: 'fall_event', severity: 'urgent',
      trigger_data: { accelerometer_impact: true, inactivity_seconds: 90, hr_spike: 112, hr_baseline: 68 },
      ai_assessment: 'Fall event detected. Accelerometer registered high-impact event followed by 90 seconds of inactivity. Heart rate spiked to 112 bpm (65% above resting baseline).',
      ai_reasoning: 'Three concurrent signals confirm fall: (1) accelerometer impact exceeding fall threshold, (2) subsequent inactivity period >60 seconds, (3) heart rate spike >30 bpm above baseline. High confidence fall event.',
      clinical_significance: 'Fall in a Parkinson\'s patient with progressive motor decline over the preceding week. Assess for injury and evaluate fall risk factors.',
      recommended_action: 'Urgent: Assess for injury. Review fall risk. Consider PT referral. Review medication timing.',
      patient_message: 'Hi Linda, it looks like you may have had a fall today. We hope you\'re okay. If you\'re hurt or need help, please call 911 or your emergency contact right away. Your care team has been notified and may reach out to check on you.',
    },
    {
      patient_id: patientId, detected_at: dayDate(20),
      anomaly_type: 'sustained_decline', severity: 'attention',
      trigger_data: { steps: 2400, sleep_efficiency: 68, awakenings: 3, post_fall: true },
      ai_assessment: 'Continued decline following fall event. Activity significantly reduced, sleep fragmented with 3 awakenings.',
      ai_reasoning: 'Post-fall pattern: activity dropped further (2,400 steps vs. 5,500 baseline), sleep efficiency dropped to 68% with 3 awakenings (vs. baseline 85% and 1.5). This pattern is common after falls in Parkinson\'s patients — fear of falling reduces activity, pain/anxiety disrupts sleep.',
      clinical_significance: 'Post-fall deconditioning risk. The combination of reduced activity and disrupted sleep can accelerate motor decline.',
      recommended_action: 'Patient nudge: encourage communication with care team. Monitor for further decline.',
      patient_message: 'Hi Linda, if you\'ve been feeling any changes in how you move or your energy level this week, it might be a good time to give your care team a call. You can reach our office at [number] anytime. We\'re here to help.',
    },
    {
      patient_id: patientId, detected_at: dayDate(27),
      anomaly_type: 'fall_event', severity: 'urgent',
      trigger_data: { accelerometer_impact: true, inactivity_seconds: 75, hr_spike: 108, falls_in_9_days: 2 },
      ai_assessment: '2 falls in 9 days. Second fall event confirmed by accelerometer impact, inactivity, and heart rate spike. This recurrent fall pattern in the context of progressive motor decline requires urgent clinical intervention.',
      ai_reasoning: 'Fall detection criteria met (impact + inactivity + HR spike). Critical context: this is the second fall in 9 days (Day 19 and Day 27). Two falls in <14 days in a Parkinson\'s patient with concurrent tremor worsening and activity decline represents a significant fall risk escalation requiring multidisciplinary intervention.',
      clinical_significance: 'Recurrent falls in Parkinson\'s disease. High fall risk requiring PT evaluation, medication review, and home safety assessment.',
      recommended_action: 'Urgent: PT evaluation referral, medication review, home safety assessment. Auto-draft PT referral order.',
      patient_message: 'Hi Linda, we noticed another fall event. Your care team has been alerted and will reach out soon. If you need immediate help, please call 911.',
    },
  ]
}

// Generate alerts corresponding to anomalies
function generateAlerts(patientId: string, anomalyIds: string[], anomalies: { severity: string, anomaly_type: string, detected_at: string, recommended_action: string, patient_message: string | null }[]) {
  const alerts = []
  for (let i = 0; i < anomalies.length; i++) {
    const a = anomalies[i]
    // Clinician alert for every anomaly
    alerts.push({
      anomaly_id: anomalyIds[i],
      patient_id: patientId,
      created_at: a.detected_at,
      alert_type: a.severity === 'urgent' ? 'urgent_escalation' : 'clinician_notification',
      severity: a.severity,
      title: a.anomaly_type === 'fall_event' ? 'Fall Event Detected' :
             a.anomaly_type === 'sustained_decline' ? 'Sustained Activity Decline' :
             a.anomaly_type === 'medication_pattern' ? 'Medication Pattern Detected' : 'Anomaly Detected',
      body: a.recommended_action,
      acknowledged: i < 3, // First 3 anomalies acknowledged for demo
      escalated_to_md: a.severity === 'urgent',
      action_taken: i < 3 ? 'Reviewed by triage team' : null,
    })
    // Patient nudge if message exists
    if (a.patient_message) {
      alerts.push({
        anomaly_id: anomalyIds[i],
        patient_id: patientId,
        created_at: a.detected_at,
        alert_type: 'patient_nudge',
        severity: 'informational',
        title: 'Patient Message Sent',
        body: a.patient_message,
        acknowledged: true,
        escalated_to_md: false,
        action_taken: 'Delivered via SMS',
      })
    }
  }
  return alerts
}

async function seed() {
  console.log('Seeding wearable demo data...')

  // 1. Delete existing demo data (idempotent)
  const { data: existingPatients } = await supabase
    .from('wearable_patients')
    .select('id')
    .eq('name', 'Linda Martinez')
  if (existingPatients && existingPatients.length > 0) {
    for (const p of existingPatients) {
      await supabase.from('wearable_alerts').delete().eq('patient_id', p.id)
      await supabase.from('wearable_anomalies').delete().eq('patient_id', p.id)
      await supabase.from('wearable_daily_summaries').delete().eq('patient_id', p.id)
    }
    await supabase.from('wearable_patients').delete().eq('name', 'Linda Martinez')
    console.log('Cleared existing demo data.')
  }

  // 2. Insert patient
  const { data: patient, error: patientErr } = await supabase
    .from('wearable_patients')
    .insert(PATIENT)
    .select('id')
    .single()
  if (patientErr) throw new Error(`Patient insert failed: ${patientErr.message}`)
  console.log(`Created patient: ${patient.id}`)

  // 3. Insert daily summaries
  const summaries = generateDailySummaries(patient.id)
  const { error: summErr } = await supabase.from('wearable_daily_summaries').insert(summaries)
  if (summErr) throw new Error(`Summaries insert failed: ${summErr.message}`)
  console.log(`Inserted ${summaries.length} daily summaries.`)

  // 4. Insert anomalies
  const anomalyData = generateAnomalies(patient.id, PATIENT.monitoring_start_date)
  const { data: insertedAnomalies, error: anomErr } = await supabase
    .from('wearable_anomalies')
    .insert(anomalyData)
    .select('id')
  if (anomErr) throw new Error(`Anomalies insert failed: ${anomErr.message}`)
  console.log(`Inserted ${insertedAnomalies.length} anomalies.`)

  // 5. Insert alerts
  const anomalyIds = insertedAnomalies.map(a => a.id)
  const alertData = generateAlerts(patient.id, anomalyIds, anomalyData as any)
  const { error: alertErr } = await supabase.from('wearable_alerts').insert(alertData)
  if (alertErr) throw new Error(`Alerts insert failed: ${alertErr.message}`)
  console.log(`Inserted ${alertData.length} alerts.`)

  console.log('Wearable demo data seeded successfully!')
}

seed().catch(err => {
  console.error('Seed failed:', err)
  process.exit(1)
})
```

**Step 2: Add npm script**

Add to `package.json` scripts:
```json
"seed:wearable": "npx tsx scripts/seed-wearable-demo.ts"
```

**Step 3: Run the seed script**

```bash
npm run seed:wearable
```

Expected output:
```
Seeding wearable demo data...
Created patient: <uuid>
Inserted 30 daily summaries.
Inserted 5 anomalies.
Inserted 8 alerts.
Wearable demo data seeded successfully!
```

**Step 4: Commit**

```bash
git add scripts/seed-wearable-demo.ts package.json
git commit -m "feat(wearable): add demo data seed script for Linda Martinez 30-day scenario"
```

---

## Task 4: API Routes

**Files:**
- Create: `src/app/api/wearable/demo-data/route.ts`
- Create: `src/app/api/wearable/analyze/route.ts`
- Create: `src/lib/wearable/systemPrompt.ts`

### Step 1: Write the demo-data API route

GET endpoint that loads all demo data from Supabase in a single bundle.

```typescript
// src/app/api/wearable/demo-data/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()

    // Get patient (demo patient — Linda Martinez)
    const { data: patients, error: pErr } = await supabase
      .from('wearable_patients')
      .select('*')
      .eq('name', 'Linda Martinez')
      .limit(1)
    if (pErr) throw pErr
    if (!patients || patients.length === 0) {
      return NextResponse.json({ error: 'Demo patient not found. Run npm run seed:wearable first.' }, { status: 404 })
    }
    const patient = patients[0]

    // Get daily summaries, anomalies, and alerts in parallel
    const [summariesRes, anomaliesRes, alertsRes] = await Promise.all([
      supabase.from('wearable_daily_summaries').select('*').eq('patient_id', patient.id).order('date', { ascending: true }),
      supabase.from('wearable_anomalies').select('*').eq('patient_id', patient.id).order('detected_at', { ascending: true }),
      supabase.from('wearable_alerts').select('*').eq('patient_id', patient.id).order('created_at', { ascending: true }),
    ])

    return NextResponse.json({
      patient,
      dailySummaries: summariesRes.data || [],
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

### Step 2: Write the system prompt

```typescript
// src/lib/wearable/systemPrompt.ts
// Full system prompt from playbook Section 6.4

export const WEARABLE_ANALYSIS_SYSTEM_PROMPT = `You are a clinical monitoring AI...`
// Copy the full system prompt from playbook Section 6.4 verbatim.
// Template variables: {name}, {age}, {sex}, {primary_diagnosis}, {medications},
// {start_date}, {baseline_metrics_json}, {daily_summaries_json}, {rule_based_alerts}

export function buildAnalysisUserPrompt(params: {
  name: string
  age: number
  sex: string
  primary_diagnosis: string
  medications: unknown[]
  baseline_metrics: Record<string, number>
  start_date: string
  end_date: string
  daily_summaries: unknown[]
  rule_based_alerts: unknown[]
}) {
  return `
PATIENT CONTEXT:
Patient: ${params.name}, ${params.age}${params.sex}
Diagnosis: ${params.primary_diagnosis}
Medications: ${JSON.stringify(params.medications)}
Personal baseline (14-day rolling): ${JSON.stringify(params.baseline_metrics)}

DATA TO ANALYZE:
Analysis window: ${params.start_date} to ${params.end_date}
Daily summaries:
${JSON.stringify(params.daily_summaries, null, 2)}

Rule-based alerts already triggered:
${JSON.stringify(params.rule_based_alerts, null, 2)}
`
}
```

### Step 3: Write the analyze API route

```typescript
// src/app/api/wearable/analyze/route.ts
import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { WEARABLE_ANALYSIS_SYSTEM_PROMPT, buildAnalysisUserPrompt } from '@/lib/wearable/systemPrompt'

export const maxDuration = 60

const AI_MODEL = 'gpt-5.2'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { patient_id, analysis_window_days = 7 } = body

    if (!patient_id) {
      return NextResponse.json({ error: 'patient_id is required.' }, { status: 400 })
    }

    // Load patient + recent summaries from Supabase
    const supabase = await createClient()
    const { data: patient } = await supabase
      .from('wearable_patients').select('*').eq('id', patient_id).single()
    if (!patient) {
      return NextResponse.json({ error: 'Patient not found.' }, { status: 404 })
    }

    const { data: summaries } = await supabase
      .from('wearable_daily_summaries').select('*')
      .eq('patient_id', patient_id)
      .order('date', { ascending: false })
      .limit(analysis_window_days)

    const { data: existingAnomalies } = await supabase
      .from('wearable_anomalies').select('anomaly_type, severity, detected_at')
      .eq('patient_id', patient_id)
      .order('detected_at', { ascending: false })
      .limit(10)

    // Get OpenAI API key
    let apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      try {
        const { data: setting } = await supabase.rpc('get_openai_key')
        apiKey = setting
      } catch { /* Supabase may not be available */ }
    }
    if (!apiKey) {
      return NextResponse.json({ error: 'AI API key not configured.' }, { status: 500 })
    }

    const openai = new OpenAI({ apiKey })
    const sortedSummaries = (summaries || []).reverse()
    const dates = sortedSummaries.map(s => s.date)

    const userPrompt = buildAnalysisUserPrompt({
      name: patient.name,
      age: patient.age,
      sex: patient.sex,
      primary_diagnosis: patient.primary_diagnosis,
      medications: patient.medications || [],
      baseline_metrics: patient.baseline_metrics || {},
      start_date: dates[0] || '',
      end_date: dates[dates.length - 1] || '',
      daily_summaries: sortedSummaries,
      rule_based_alerts: existingAnomalies || [],
    })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 45000)
    let completion
    try {
      completion = await openai.chat.completions.create(
        {
          model: AI_MODEL,
          messages: [
            { role: 'system', content: WEARABLE_ANALYSIS_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
          max_completion_tokens: 4000,
          temperature: 0.2,
        },
        { signal: controller.signal }
      )
    } finally {
      clearTimeout(timeout)
    }

    const rawContent = completion.choices[0]?.message?.content
    if (!rawContent) {
      return NextResponse.json({ error: 'AI returned empty response.' }, { status: 500 })
    }

    let analysis
    try {
      analysis = JSON.parse(rawContent)
    } catch {
      return NextResponse.json({ error: 'AI returned invalid JSON.' }, { status: 500 })
    }

    return NextResponse.json(analysis)

  } catch (error: unknown) {
    console.error('Wearable analyze API Error:', error)
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json({ error: 'AI analysis timed out. Please try again.' }, { status: 504 })
    }
    const message = error instanceof Error ? error.message : 'An error occurred during analysis.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

### Step 4: Commit

```bash
git add src/app/api/wearable/ src/lib/wearable/systemPrompt.ts
git commit -m "feat(wearable): add demo-data and analyze API routes"
```

---

## Task 5: Homepage Card

**Files:**
- Modify: `src/components/LandingPage.tsx`

**Step 1: Add the Wearable Monitoring card**

After the Post-Visit Follow-Up card (line ~348), before the closing `</div>` of the selection cards container, add a new card. Color: `#0EA5E9` (sky blue). Icon: activity/pulse line SVG. Title: "Wearable Monitoring". Route: `/wearable`.

Follow the exact same card pattern as the existing 5 cards (Link wrapper, hover handlers, icon div, h2, p, button div).

**Step 2: Commit**

```bash
git add src/components/LandingPage.tsx
git commit -m "feat(wearable): add Wearable Monitoring card to homepage"
```

---

## Task 6: Page Shell + Section 1 (Concept Hero) + Section 2 (Data Sources)

**Files:**
- Create: `src/app/wearable/page.tsx`
- Create: `src/components/wearable/ConceptHero.tsx`
- Create: `src/components/wearable/DataSourceCards.tsx`
- Create: `src/components/wearable/DataTypeMatrix.tsx`

### Step 1: Create the page shell

Follow the triage/follow-up page pattern exactly:
- `'use client'` at top
- useState for loading state and demo data
- useEffect to fetch from `/api/wearable/demo-data` on mount
- Header bar: sky blue `#0EA5E9` background, back link to `/`, "Wearable Monitoring" title, "DEMO" badge
- Content: maxWidth 1200px (wider than triage's 800px — timeline needs space), centered
- Stack all 6 sections vertically with `gap: '48px'`
- Loading state: spinner + "Loading wearable demo data..."
- Error state: message with retry button
- At bottom: DisclaimerBanner

### Step 2: Create ConceptHero component

Simple visual section:
- 3-step flow diagram: Wearable Device → AI Analysis → Clinical Alerts (inline SVGs connected by arrows)
- 2-3 paragraphs of explainer text (from playbook Section 4.1 — concept overview)
- 3 value prop pills: "24/7 monitoring between visits", "AI-detected patterns", "Right alert, right person, right time"
- Dark card background (`#1e293b`), light border, rounded corners

### Step 3: Create DataSourceCards component

- 3 device cards in a flex row: Samsung Galaxy Watch (live), Apple Watch (planned), Oura Ring (future)
- Each card: device name, data types list, integration status badge (green/amber/gray)
- Use `WEARABLE_DEVICES` from types.ts
- Priority indicator (Samsung = 1st)

### Step 4: Create DataTypeMatrix component

- Simple table showing which data types come from which devices
- Rows: HR, HRV, Steps, Sleep, Accelerometer, Gyroscope, SpO2, Blood Oxygen
- Columns: Samsung, Apple Watch, Oura
- Checkmark or dash for availability

### Step 5: Commit

```bash
git add src/app/wearable/ src/components/wearable/ConceptHero.tsx src/components/wearable/DataSourceCards.tsx src/components/wearable/DataTypeMatrix.tsx
git commit -m "feat(wearable): add page shell, concept hero, and data source sections"
```

---

## Task 7: Section 3 — Clinical Use Cases

**Files:**
- Create: `src/components/wearable/ClinicalUseCaseTable.tsx`
- Create: `src/components/wearable/UseCaseDetailPanel.tsx`

### Step 1: Create ClinicalUseCaseTable

- Interactive table with 8 diagnosis rows (from `CLINICAL_USE_CASES` in types.ts)
- Columns: Diagnosis, Wearable Signal, Anomaly to Detect, Alert Trigger, Suggested Action
- Clickable rows that expand to show UseCaseDetailPanel
- Dark table styling matching the project theme (`#1e293b` bg, `#334155` borders)
- Color-coded diagnosis column (each diagnosis gets a subtle accent)

### Step 2: Create UseCaseDetailPanel

- Expanded view showing:
  - Detailed description of what the AI monitors for this diagnosis
  - Example wearable data patterns
  - AI detection logic in plain English
- Collapsible (click row again to close)

### Step 3: Commit

```bash
git add src/components/wearable/ClinicalUseCaseTable.tsx src/components/wearable/UseCaseDetailPanel.tsx
git commit -m "feat(wearable): add clinical use case table with expandable details"
```

---

## Task 8: Section 4 — Patient Timeline (Core Visualization)

This is the most complex task. Build the 30-day timeline with 5 Recharts tracks, baseline bands, and day selection.

**Files:**
- Create: `src/components/wearable/PatientTimeline.tsx`
- Create: `src/components/wearable/HeartRateTrack.tsx`
- Create: `src/components/wearable/HRVTrack.tsx`
- Create: `src/components/wearable/SleepTrack.tsx`
- Create: `src/components/wearable/ActivityTrack.tsx`
- Create: `src/components/wearable/DiseaseTrack.tsx`
- Create: `src/components/wearable/BaselineBand.tsx`

### Step 1: Create PatientTimeline container

- Props: `{ dailySummaries: DailySummary[], anomalies: WearableAnomaly[], patient: WearablePatient }`
- Section title: "Patient Timeline — Linda Martinez, 58F, Parkinson's Disease"
- 30-day date range header with patient info
- Stacks the 5 track components vertically
- Each track shares the same X-axis (dates) for alignment
- Selected day state — clicking any point on any chart highlights that day across all tracks
- SDNE overlay mockup: blue diamond markers at Day 1 and Day 30 (simulated exam dates)

### Step 2: Create shared baseline band approach

The `<ReferenceArea>` component from Recharts draws a shaded band. Each track receives `baselineMin` and `baselineMax` props for the gray band.

Pattern for each track:
```tsx
<ResponsiveContainer width="100%" height={180}>
  <LineChart data={chartData}>
    <ReferenceArea y1={baselineMin} y2={baselineMax} fill="#374151" fillOpacity={0.3} />
    <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={formatDate} />
    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} domain={[yMin, yMax]} />
    <Tooltip {...darkTooltipStyle} />
    <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={dotRenderer} />
  </LineChart>
</ResponsiveContainer>
```

Import `ReferenceArea` from Recharts (already available in project).

### Step 3: Create HeartRateTrack

- Data: `metrics.avg_hr` and `metrics.resting_hr` per day
- Two lines: avg HR (lighter red) and resting HR trend (dark red)
- Baseline band: ±5 from baseline resting HR (63-73)
- Y-axis label: "Heart Rate (bpm)"
- Anomaly dots: red circles on days with anomalies

### Step 4: Create HRVTrack

- Data: `metrics.hrv_rmssd` and `metrics.hrv_7day_avg` per day
- Two lines: daily RMSSD (lighter purple) and 7-day rolling average (dark purple)
- Baseline band: ±6 from baseline HRV (26-38)
- Y-axis label: "HRV (RMSSD ms)"

### Step 5: Create SleepTrack

- Data: `metrics.sleep_deep`, `metrics.sleep_rem`, `metrics.sleep_light`, `metrics.sleep_awake`
- Recharts StackedBarChart with 4 segments
- Colors: deep sleep #1e3a5f, REM #0d9488, light #60a5fa, awake #ef4444
- Baseline band: gray band at total sleep baseline (6.25-7.25 hours)
- Y-axis label: "Sleep (hours)"

### Step 6: Create ActivityTrack

- Data: `metrics.total_steps` and `metrics.steps_7day_avg`
- Bar chart (daily steps in green bars) + line overlay (7-day rolling average)
- Baseline band: ±800 from baseline steps (4700-6300)
- Y-axis label: "Steps"

### Step 7: Create DiseaseTrack

- Data: `metrics.tremor_pct` and `metrics.dyskinetic_mins`
- Two lines: tremor % (orange solid) and dyskinetic minutes (orange dashed)
- Dual Y-axis: left for tremor %, right for dyskinetic minutes
- Baseline band: ±4 from baseline tremor (8-16%)
- Y-axis label: "Parkinson's Motor Metrics"

### Step 8: Commit

```bash
git add src/components/wearable/PatientTimeline.tsx src/components/wearable/HeartRateTrack.tsx src/components/wearable/HRVTrack.tsx src/components/wearable/SleepTrack.tsx src/components/wearable/ActivityTrack.tsx src/components/wearable/DiseaseTrack.tsx
git commit -m "feat(wearable): add patient timeline with 5 Recharts data tracks and baseline bands"
```

---

## Task 9: Timeline Anomaly Markers + Detail Panel + Daily Summary

**Files:**
- Create: `src/components/wearable/AnomalyMarker.tsx`
- Create: `src/components/wearable/AnomalyDetailPanel.tsx`
- Create: `src/components/wearable/DailySummaryPopover.tsx`
- Modify: `src/components/wearable/PatientTimeline.tsx` (wire up click handlers)

### Step 1: Create AnomalyMarker

Custom Recharts dot renderer that draws colored circles on anomaly days:
- Red for urgent, orange for attention, yellow for informational
- Slightly larger than normal dots (r=8 vs r=4)
- Pulsing animation on urgent markers
- onClick triggers the detail panel

Implementation: Use Recharts' custom `dot` prop on Line components. When a day has anomalies (check against anomalies array by date), render a larger colored circle.

### Step 2: Create AnomalyDetailPanel

- Slide-out panel (right side or modal overlay) when an anomaly marker is clicked
- Shows: anomaly type badge, severity color, timestamp, trigger data visualization, AI assessment text, AI reasoning chain, recommended action, patient message (if sent)
- Close button
- Styled as a dark card with colored left border matching severity

### Step 3: Create DailySummaryPopover

- Clicking any day on any chart shows a popover with:
  - Date header
  - All metrics for that day in a compact grid
  - Overall status badge
  - AI analysis text for that day
  - Data quality indicator

### Step 4: Wire up PatientTimeline

- Add selectedDay state
- Pass onClick handlers to all tracks
- Render AnomalyDetailPanel when an anomaly day is selected
- Render DailySummaryPopover when a non-anomaly day is selected

### Step 5: Commit

```bash
git add src/components/wearable/AnomalyMarker.tsx src/components/wearable/AnomalyDetailPanel.tsx src/components/wearable/DailySummaryPopover.tsx src/components/wearable/PatientTimeline.tsx
git commit -m "feat(wearable): add anomaly markers, detail panel, and daily summary popover"
```

---

## Task 10: Section 5 — Clinician Alert Dashboard

**Files:**
- Create: `src/components/wearable/ClinicianAlertDashboard.tsx`
- Create: `src/components/wearable/TriageTeamView.tsx`
- Create: `src/components/wearable/NeurologistView.tsx`
- Create: `src/components/wearable/AlertCard.tsx`
- Create: `src/components/wearable/AutoDraftOrderPanel.tsx`

### Step 1: Create AlertCard

- Props: `{ alert: WearableAlert, anomaly?: WearableAnomaly, onAcknowledge, onEscalate }`
- Left color border matching severity (red/orange/yellow)
- Content: title, timestamp, body text, severity badge
- Action buttons: "Reviewed" (acknowledge), "Escalate to MD", "Schedule Follow-up"
- Acknowledged alerts get a subtle dimming/checkmark
- Escalated alerts show "Escalated" badge

### Step 2: Create AutoDraftOrderPanel

- Shown for the Day 27 second fall alert
- Pre-drafted PT referral order text
- Patient info auto-filled
- "Sign and Send" button (mock — shows "Order Sent!" confirmation)
- Styled as a highlighted card within the alert

### Step 3: Create TriageTeamView

- Default view for MA/RN staff
- All alerts sorted by severity (urgent first), then by date
- Unacknowledged alerts at top with "Needs Review" header
- Batch action: "Mark as Reviewed" for multiple alerts
- Count badges: "3 Urgent", "2 Attention", etc.

### Step 4: Create NeurologistView

- Filtered view: only shows alerts where `escalated_to_md === true` OR `severity === 'urgent'`
- Cleaner, less noisy than triage view
- Auto-draft order panel visible for relevant alerts

### Step 5: Create ClinicianAlertDashboard

- Container with tab toggle: "Triage Team" | "Neurologist"
- `DashboardView` state toggles between the two views
- Summary stats bar: total alerts, urgent count, unacknowledged count
- Pass alerts and anomalies (for context) to child views

### Step 6: Commit

```bash
git add src/components/wearable/ClinicianAlertDashboard.tsx src/components/wearable/TriageTeamView.tsx src/components/wearable/NeurologistView.tsx src/components/wearable/AlertCard.tsx src/components/wearable/AutoDraftOrderPanel.tsx
git commit -m "feat(wearable): add clinician alert dashboard with triage and neurologist views"
```

---

## Task 11: Section 6 — AI Analysis Log + Shared Components

**Files:**
- Create: `src/components/wearable/AIAnalysisLog.tsx`
- Create: `src/components/wearable/DisclaimerBanner.tsx`
- Create: `src/components/wearable/PatientNudgePreview.tsx`
- Create: `src/components/wearable/SDNEBaselineOverlay.tsx`

### Step 1: Create AIAnalysisLog

- Props: `{ patientId: string }` (calls analyze API on demand)
- "Run AI Analysis" button that calls `POST /api/wearable/analyze`
- Loading state with rotating messages: "Analyzing wearable data...", "Detecting patterns...", "Generating clinical assessment..."
- Results display:
  - Overall status badge
  - Narrative summary paragraph
  - Anomalies list — each with expandable reasoning chain
  - Trends observed — metric, direction arrow, magnitude, clinical relevance
  - Data quality notes
- The reasoning chain is the "moat" — display it prominently with a "How AI Reached This Conclusion" header
- Each reasoning step is a collapsible card showing data examined → pattern found → decision → rationale
- Transparency emphasis: "Every alert decision is explainable and auditable" callout

### Step 2: Create DisclaimerBanner

- Same pattern as triage DisclaimerBanner but with `WEARABLE_DISCLAIMER_TEXT`
- Amber warning style

### Step 3: Create PatientNudgePreview

- Shows examples of patient-facing messages from the anomalies
- 3 example nudges: gentle nudge (activity decline), safety alert (fall), prodrome alert (migraine)
- Each in a styled card showing the tone and language
- Callout: "All messages are empathetic, actionable, and at a 6th-grade reading level. Raw metrics are never shared with patients."

### Step 4: Create SDNEBaselineOverlay

- Mockup component showing blue diamond markers on the timeline at Day 1 and Day 30
- Tooltip on hover: "SDNE Exam — Structured neurological assessment baseline"
- Note: "Cross-card integration with Card 5 (SDNE). Clinical exam provides ground truth for AI interpretation."
- This is a visual mockup only — no real SDNE data integration in Phase 1A

### Step 5: Commit

```bash
git add src/components/wearable/AIAnalysisLog.tsx src/components/wearable/DisclaimerBanner.tsx src/components/wearable/PatientNudgePreview.tsx src/components/wearable/SDNEBaselineOverlay.tsx
git commit -m "feat(wearable): add AI analysis log, disclaimer, nudge preview, and SDNE overlay"
```

---

## Task 12: Final Integration + Verification

**Files:**
- Modify: `src/app/wearable/page.tsx` (wire up all sections)
- Modify: `src/components/wearable/PatientTimeline.tsx` (add SDNE overlay)

### Step 1: Wire up all sections in page.tsx

Ensure the page loads demo data and passes it to all sections:
1. ConceptHero (no data props)
2. DataSourceCards + DataTypeMatrix (no data props — use constants)
3. ClinicalUseCaseTable (no data props — use constants)
4. PatientTimeline (dailySummaries, anomalies, patient)
5. ClinicianAlertDashboard (alerts, anomalies)
6. AIAnalysisLog (patientId)
7. PatientNudgePreview (anomalies — for message examples)
8. DisclaimerBanner (no props)

### Step 2: Verify the build compiles

```bash
cd /Users/stevearbogast/dev/repos/OPSAmplehtml && npm run build
```

Fix any TypeScript errors.

### Step 3: Test locally

```bash
npm run dev
```

Navigate to `http://localhost:3000` — verify the new card appears on the homepage.
Navigate to `http://localhost:3000/wearable` — verify all 6 sections render with demo data.

### Step 4: Final commit

```bash
git add -A
git commit -m "feat(wearable): complete Card 6 wearable monitoring POC integration"
```

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Types & Constants | `src/lib/wearable/types.ts` |
| 2 | Supabase Migration | `supabase/migrations/024_wearable_monitoring.sql` |
| 3 | Seed Script | `scripts/seed-wearable-demo.ts` |
| 4 | API Routes | `src/app/api/wearable/*/route.ts`, `src/lib/wearable/systemPrompt.ts` |
| 5 | Homepage Card | `src/components/LandingPage.tsx` |
| 6 | Page Shell + Hero + Data Sources | `src/app/wearable/page.tsx`, 3 components |
| 7 | Clinical Use Cases | 2 components |
| 8 | Patient Timeline (5 tracks) | 6 components |
| 9 | Anomaly Markers + Detail Panel | 4 components |
| 10 | Alert Dashboard | 5 components |
| 11 | AI Analysis Log + Shared | 4 components |
| 12 | Integration + Verification | Wire up + build test |

**Total new files:** ~30 (types, migration, seed script, 2 API routes, system prompt, ~22 components, page)
**Modified files:** 2 (LandingPage.tsx, package.json)
