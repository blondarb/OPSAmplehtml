# Card 6: Longitudinal Wearable Data & AI Monitoring — Product Playbook

---

## 1. Executive Summary

The Longitudinal Wearable Data & AI Monitoring card demonstrates how continuous data from consumer wearable devices — Apple Watch, Samsung Galaxy Watch, Oura Ring, and others — can be ingested, analyzed by AI, and converted into clinically actionable insights and alerts for neurology patients. This bridges the critical gap between office visits: a neurology patient is seen for 30 minutes every 3-6 months, but their disease is active 24/7. Wearable data fills this gap by providing continuous physiological monitoring that can detect seizure-like events, Parkinson's motor fluctuations, migraine prodromal patterns, MS fatigue decline, and dementia-related sleep and behavioral changes. For clinicians, this means proactive rather than reactive care. For patients, it means a safety net that watches for concerning patterns. For investors, it demonstrates a platform play that turns commodity wearable data into high-value clinical intelligence — a defensible data moat in digital neurology.

**Samsung Galaxy Watch Partnership Strategy:** The platform prioritizes Samsung Galaxy Watch integration through the Samsung Health SDK, which is significantly more open and developer-friendly than Apple HealthKit. A Samsung partnership provides elevated API access, co-development support, and potential device subsidies for pilot patients. Combined with the SDNE (Standardized Digital Neuro Exam) from Card 5, this creates a uniquely powerful longitudinal story: structured clinical baselines at each office visit (SDNE) plus continuous wearable data between visits (Galaxy Watch) = the most complete picture of a neurology patient's disease trajectory available anywhere. The build follows a two-phase approach: Phase 1 deploys rules-based alerting (2-3 months), then Phase 2 layers on ML inference models trained on real patient data (after 3-6 months of data collection).

---

## 2. How To Use This Section

- **Step 1:** Navigate to the Wearable Monitoring card from the homepage.
- **Step 2:** You will see a hero section explaining the concept: continuous wearable data → AI analysis → clinical alerts.
- **Step 3:** The **Data Source Overview** shows supported wearables and what data each provides, with integration status indicators.
- **Step 4:** The **Clinical Use Case Mapping** table shows which wearable signals map to which neurological diagnoses, what anomalies to detect, and what actions to trigger.
- **Step 5:** The **Patient Timeline** is the core visualization: a timeline view of a demo patient's wearable data over 30 days. Scroll through to see daily data streams (heart rate, sleep, steps, HRV) with AI-detected anomalies highlighted.
- **Step 6:** Click on a highlighted anomaly to see the AI's assessment: what pattern was detected, clinical significance, and the alert generated (patient-facing message vs. clinician notification).
- **Step 7:** The **Clinician Alert Dashboard** shows alerts generated from wearable data, color-coded by severity.
- **Step 8:** The **AI Analysis Log** shows the reasoning chain: what data the AI examined, what patterns it found, and why it triggered (or didn't trigger) an alert.

---

## 3. Clinical Context & Problem Statement

### The Problem

Neurology is fundamentally a longitudinal specialty. Most neurological conditions — Parkinson's, epilepsy, MS, migraine, dementia — are chronic, progressive, and variable. Yet the clinical model is episodic: patients are seen every 3-6 months for a 30-minute visit, and the clinician makes treatment decisions based on the patient's recollection of what happened in the intervening months.

This model fails in predictable ways:

- **Recall bias**: Patients can't accurately remember how many seizures, migraines, or falls they had over 3 months
- **Snapshot problem**: The patient's exam today may not represent their typical status (good day vs. bad day)
- **Delayed intervention**: Significant decline can occur between visits without detection
- **Missed patterns**: Subtle trends (gradual gait slowing, increasing sleep fragmentation, rising tremor severity) are invisible when measured months apart
- **Emergency-driven care**: Without proactive monitoring, the first sign of trouble is often an ER visit

### The Opportunity

Over 30% of American adults now wear a smartwatch or fitness tracker. These devices continuously collect physiologically meaningful data: heart rate, HRV, accelerometry, sleep staging, blood oxygen, GPS patterns, voice data, and more. For neurology patients, this data contains clinically relevant signals that are currently being thrown away.

### Patient Population and Clinical Use Cases

| Diagnosis | Wearable Signal | Anomaly to Detect | Alert Trigger | Suggested Action |
|---|---|---|---|---|
| **Parkinson's Disease** | Accelerometer, gyroscope (tremor), step count, gait metrics | Increased tremor amplitude, fall events, gait velocity decline, motor fluctuations | 2+ falls in 7 days; sustained tremor increase; 20%+ step decline over 2 weeks | Alert team: PT referral, medication adjustment, fall risk assessment |
| **Epilepsy** | Heart rate (ictal tachycardia), HRV (autonomic changes), accelerometer (convulsive movement) | Seizure-like event pattern (sudden HR spike + rhythmic movement) | Any detected seizure-like event | Alert team: medication review, seizure diary reconciliation, EEG consideration |
| **Migraine** | Sleep disruption, HRV dip, activity decline, heart rate patterns | Prodromal pattern: HRV decrease + sleep disruption + activity drop 24-48h before migraine | Frequency increase (>25% above baseline); pattern matches migraine prodrome | Patient AI nudge ("This might be a good time to use your acute medication"); log for clinician. *(CMIO note: This HRV + sleep fragmentation prodrome correlation is cutting-edge and incredibly accurate — highlight this use case prominently in demos.)* |
| **Multiple Sclerosis** | Fatigue scores (self-report + activity proxy), step count, sleep quality, HRV | Sustained activity decrease, fatigue increase, sleep quality decline | 3-day sustained decline in activity + sleep disruption | Alert team: evaluate for relapse, check for infection/UTI, consider MRI |
| **Dementia / MCI** | Sleep architecture (REM, deep sleep), GPS patterns (wandering), step count, circadian rhythm | Sleep fragmentation increase, nighttime wandering, activity rhythm disruption, step count decline | Nighttime GPS wandering event; sustained sleep architecture change; circadian disruption | Alert caregiver + clinician; evaluate for progression; safety assessment |
| **ALS** | Respiratory rate, voice biomarkers (via phone mic), grip strength (phone interaction), activity level | Respiratory rate increase, voice quality decline, decreasing phone interaction force, progressive activity decline | Respiratory rate trending up; voice metrics declining | Alert team: pulmonary function test, evaluate for NIV, reassess functional status |
| **Essential Tremor** | Accelerometer (tremor during daily activity) | Tremor amplitude increase, frequency changes, new tremor during previously unaffected activities | Sustained tremor worsening over 2+ weeks | Alert team: medication efficacy review |
| **Post-Concussion** | Sleep quality, cognitive load tolerance (activity patterns), HRV, step count | Sleep disruption, activity tolerance decline, HRV depression | Symptom burden not improving on expected trajectory | Alert team: re-evaluate recovery timeline, consider specialty referral |

### Why AI Adds Value

Raw wearable data is overwhelming and noisy. A patient's Apple Watch generates thousands of data points per day. Without AI, this data is unusable in clinical practice. The AI:

1. **Filters noise**: Separates clinically meaningful signals from normal variation
2. **Detects patterns**: Identifies multi-day trends that no human could track across thousands of patients
3. **Contextualizes**: Interprets wearable data in the context of the patient's diagnosis and medication
4. **Alerts intelligently**: Sends the right alert to the right person at the right time — patient nudge vs. clinician notification vs. urgent escalation
5. **Learns baselines**: Establishes each patient's individual baseline and detects meaningful deviations

---

## 4. Functional Requirements

### 4.1 Page Sections

**Section 1: Concept Overview**

| Element | Details |
|---|---|
| Hero visual | Animation showing wearable devices → data streams → AI brain → clinical alerts |
| Explainer text | 2-3 paragraphs on the concept, accessible to non-technical readers |
| Key value props | "24/7 monitoring between visits", "AI-detected patterns you can't see in a single visit", "Right alert, right person, right time" |

**Section 2: Data Source Overview**

| Element | Details |
|---|---|
| Wearable device cards | Card per supported platform showing: device image, data types available, integration status (live / planned / future) |
| Data type matrix | Table showing which data types come from which devices |
| Integration priority | Visual indicator of which integrations come first (**Samsung Health SDK → HealthKit → Health Connect → Oura**) |

**Section 3: Clinical Use Case Mapping**

| Element | Details |
|---|---|
| Interactive table | The diagnosis-signal-anomaly-trigger-action mapping table from Section 3 above |
| Clickable diagnoses | Click a diagnosis to expand into detailed view with example patient data |
| AI reasoning display | For each use case, show the AI's detection logic |

**Section 4: Patient Timeline (Core Visualization)**

| Element | Details |
|---|---|
| Timeline view | 30-day horizontal scrollable timeline |
| Data streams | Stacked tracks: Heart Rate, HRV, Sleep (hours + stages), Steps, Activity Level, Custom (tremor, seizure events) |
| Anomaly markers | Red/orange/yellow flags on the timeline where AI detected anomalies |
| Daily summary | Click on any day to see: daily summary, data quality, AI analysis |
| Anomaly detail panel | Click on an anomaly marker to see: what was detected, clinical significance, alert generated |
| Baseline comparison | Shaded band showing patient's personal baseline range |

**Section 5: Clinician Alert Dashboard**

| Element | Details |
|---|---|
| **Triage Team View** | Default view for MA/RN staff: all alerts sorted by severity. Triage team reviews and batch-escalates only true clinical concerns to the neurologist's inbox. This prevents 50+ alerts/day from reaching the physician directly. |
| Alert list | Chronological list of AI-generated alerts for the demo patient |
| Severity indicators | Red (urgent), Orange (attention), Yellow (informational) |
| Alert details | Each alert shows: timestamp, trigger data, AI assessment, recommended action, patient-facing message sent (if any) |
| Action buttons | "Reviewed" (acknowledge), "Escalate to MD" (push to neurologist inbox), "Schedule Follow-up", "Auto-Draft Order" |
| **Neurologist View** | Filtered view showing only alerts escalated by triage team + all Tier 1 urgent alerts (auto-escalated) |

> **Design rationale (CMIO):** With 1,000 patients on the platform, the neurologist cannot receive every alert directly. The MA/RN triage team filters noise, and the neurologist sees only the signals that require physician-level decision-making. Tier 1 urgent alerts (falls, seizures) bypass triage and go directly to the neurologist.

**Section 6: AI Analysis Log**

| Element | Details |
|---|---|
| Reasoning chain | For each analysis cycle, show: data examined → patterns found → decision (alert / no alert) → rationale |
| Transparency emphasis | "Every alert decision is explainable and auditable" |

### 4.2 Patient Timeline — Detailed Data Tracks

**Heart Rate Track:**
- Continuous HR line graph (5-min averages)
- Resting HR trend line
- Anomaly highlighting: sudden spikes (seizure-like), sustained elevation (infection/stress), bradycardia
- Color: heart rate in red, resting HR trend in dark red

**HRV Track:**
- Daily RMSSD or SDNN value
- 7-day rolling average trend line
- Anomaly highlighting: sustained HRV depression (migraine prodrome, MS fatigue, autonomic dysfunction)
- Color: HRV in purple

**Sleep Track:**
- Horizontal bars per night showing: total sleep time, sleep stages (deep, REM, light, awake)
- Sleep efficiency percentage
- Anomaly highlighting: fragmentation increase, REM reduction, nighttime awakening patterns
- Color: deep sleep in dark blue, REM in teal, light in light blue, awake in red

**Activity Track:**
- Daily step count bar graph
- 7-day rolling average
- Anomaly highlighting: sustained decline, sudden drop, pattern change
- Color: steps in green

**Custom Disease Track:**
- For Parkinson's: resting tremor percentage and dyskinetic symptom minutes per day (aligned with Apple HealthKit Movement Disorder API outputs; Samsung Galaxy Watch accelerometer/gyroscope provides equivalent raw tremor data via Samsung Health SDK, normalized to same scale)
- For Epilepsy: detected seizure-like events
- For Migraine: headache day markers (patient-reported or AI-predicted prodrome)
- Color: disease-specific events in orange

**SDNE Baseline Overlay (Cross-Card Integration):**
- When SDNE (Card 5) data exists for a patient, overlay structured clinical exam baselines on the timeline as vertical reference markers
- Each SDNE visit shows: structured tremor assessment, gait evaluation, cognitive scores at the time of the in-office exam
- This creates the **longitudinal story**: clinical exam at Visit 1 (SDNE) → continuous wearable data between visits → clinical exam at Visit 2 (SDNE) → continuous wearable data → etc.
- Color: SDNE markers in blue diamond icons on timeline

### 4.3 Demo Data Specifications

**Demo Patient: Linda Martinez, 58F, Parkinson's Disease, on Carbidopa/Levodopa**

30 days of wearable data with the following embedded clinical events.

> **Data source strategy (CMIO):** Do NOT use a pure synthetic random number generator — it produces data that looks like static, not a human heartbeat. Natural circadian rhythms are impossible to fake convincingly. **Strongly recommended:** Use a real, de-identified 30-day Apple Watch export from a healthy volunteer (see **Apple Health Data Trial Pathway** in Phase 1B — the product lead's own Apple Health export is the fastest path), then manually alter specific days in the JSON to inject the clinical events below (missed dose, falls, tremor spikes). The natural resting-heart-rate dips during sleep, the weekend activity pattern differences, and the physiological variability of real data will make the demo 100x more credible to a neurologist audience. The same `parse_apple_health_xml.ts` script built for the BYOD track handles this export.

- **Days 1-10:** Baseline period. Stable metrics. Steps ~5,500/day. Sleep 6.5-7h. Resting HR 68. HRV RMSSD 32ms. Resting tremor % 12% (mild). Dyskinetic minutes ~8/day.
- **Day 11:** Missed medication dose (simulated). Resting tremor % spikes to 38%. Dyskinetic minutes spike to 45. Steps drop to 3,200. HRV dips to 24ms.
- **Day 12:** Resumes medication. Resting tremor % returns to 14%. Steps recover partially to 4,800.
- **Days 13-18:** Gradual worsening. Steps trending down: 5,200 → 4,800 → 4,500 → 4,200 → 3,900 → 3,600. Sleep efficiency declining. Resting tremor % creeping up: 14% → 16% → 19% → 22% → 25% → 28%. Dyskinetic minutes rising: 10 → 14 → 18 → 22 → 28 → 35.
- **Day 15:** AI detects: "3-day sustained activity decline with rising resting tremor percentages. Pattern consistent with medication wearing-off or disease progression." → Clinician alert (Orange): "Consider medication timing review."
- **Day 19:** Fall detected (accelerometer impact + brief inactivity). HR spike to 112. → Clinician alert (Red): "Fall event detected. Assess for injury and fall risk."
- **Day 20:** Activity drops further. Sleep fragmented (3 awakenings). → Patient nudge: "Hi Linda, if you've been feeling any changes in how you move or your energy level this week, it might be a good time to give your care team a call. You can reach our office at [number] anytime." *(Actionable nudge — does NOT share raw metrics like "your activity dropped 30%")*
- **Days 21-25:** Partial recovery (medication adjusted in simulated visit). Steps slowly increase. Tremor stabilizes.
- **Day 27:** Second fall detected. → Urgent clinician alert: "2 falls in 9 days. Recommend: PT evaluation, medication review, home safety assessment." **AI auto-drafts a PT referral order** for the clinician to review — one click to "Sign and Send." This reduces friction from alert to action.
- **Days 28-30:** New baseline establishing. Data continues.

---

## 5. Technical Architecture

### 5.1 Frontend Components (React / Next.js)

```
src/
├── app/
│   └── wearable/
│       └── page.tsx                         # Main wearable monitoring page
├── components/
│   └── wearable/
│       ├── ConceptHero.tsx                      # Concept overview section
│       ├── DataSourceCards.tsx                   # Wearable device integration cards
│       ├── DataTypeMatrix.tsx                    # Which data from which device
│       ├── ClinicalUseCaseTable.tsx              # Diagnosis-signal-alert mapping
│       ├── UseCaseDetailPanel.tsx                # Expanded view per diagnosis
│       ├── PatientTimeline.tsx                   # Core 30-day timeline container
│       ├── TimelineTrack.tsx                     # Generic data track component
│       ├── HeartRateTrack.tsx                    # HR-specific track
│       ├── HRVTrack.tsx                          # HRV-specific track
│       ├── SleepTrack.tsx                        # Sleep stages track
│       ├── ActivityTrack.tsx                     # Steps/activity track
│       ├── DiseaseTrack.tsx                      # Disease-specific event track
│       ├── AnomalyMarker.tsx                     # Clickable anomaly flag on timeline
│       ├── AnomalyDetailPanel.tsx                # Expanded anomaly detail
│       ├── DailySummaryPopover.tsx               # Click-on-day detail
│       ├── BaselineBand.tsx                      # Personal baseline range overlay
│       ├── ClinicianAlertDashboard.tsx            # Alert list panel (with Triage Team + Neurologist views)
│       ├── TriageTeamView.tsx                     # MA/RN default view: all alerts, batch-escalate to MD
│       ├── NeurologistView.tsx                    # Filtered: only escalated + Tier 1 auto-escalated alerts
│       ├── AlertCard.tsx                          # Individual alert card
│       ├── AutoDraftOrderPanel.tsx                # Pre-drafted PT referral / order for one-click signing
│       ├── AIAnalysisLog.tsx                      # Reasoning chain display (the "moat" — emphasize in demo)
│       ├── PatientNudgePreview.tsx                # Preview of patient-facing messages (actionable only)
│       ├── SDNEBaselineOverlay.tsx                 # SDNE exam markers on timeline (Card 5 cross-integration)
│       ├── SamsungDataSourceBadge.tsx              # Samsung Galaxy Watch connection status indicator
│       └── DisclaimerBanner.tsx                   # Safety disclaimer
```

### 5.2 Supabase Schema

**Table: `wearable_patients`**

| Column | Type | Description |
|---|---|---|
| `id` | `uuid` (PK) | Patient ID |
| `name` | `text` | Display name |
| `age` | `integer` | Patient age |
| `sex` | `text` | Patient sex |
| `primary_diagnosis` | `text` | Primary neurological diagnosis |
| `medications` | `jsonb` | Current medication list |
| `wearable_devices` | `jsonb` | Connected devices and their status |
| `baseline_metrics` | `jsonb` | Calculated personal baselines |
| `monitoring_start_date` | `date` | When monitoring began |
| `alert_preferences` | `jsonb` | Patient's alert preferences |

**Table: `wearable_data_points`**

| Column | Type | Description |
|---|---|---|
| `id` | `uuid` (PK) | Data point ID |
| `patient_id` | `uuid` (FK) | Patient reference |
| `timestamp` | `timestamptz` | Measurement time |
| `data_source` | `text` | samsung_health (Phase 1 primary), healthkit, health_connect, oura |
| `data_type` | `text` | heart_rate, hrv, steps, sleep, blood_oxygen, tremor, etc. |
| `value` | `float` | Numeric value |
| `unit` | `text` | bpm, ms, steps, hours, etc. |
| `metadata` | `jsonb` | Additional context (sleep stage, activity type, etc.) |
| `quality_flag` | `text` | good, suspect, poor |

**Table: `wearable_daily_summaries`**

| Column | Type | Description |
|---|---|---|
| `id` | `uuid` (PK) | Summary ID |
| `patient_id` | `uuid` (FK) | Patient reference |
| `date` | `date` | Summary date |
| `metrics` | `jsonb` | All daily computed metrics (avg HR, total steps, sleep hours, HRV mean, etc.) |
| `anomalies_detected` | `jsonb` | Array of anomaly descriptions |
| `ai_analysis` | `text` | AI's daily assessment |
| `overall_status` | `text` | normal, watch, concern, alert |

**Table: `wearable_anomalies`**

| Column | Type | Description |
|---|---|---|
| `id` | `uuid` (PK) | Anomaly ID |
| `patient_id` | `uuid` (FK) | Patient reference |
| `detected_at` | `timestamptz` | When AI detected the anomaly |
| `anomaly_type` | `text` | fall_event, seizure_like, sustained_decline, pattern_match, etc. |
| `severity` | `text` | urgent, attention, informational |
| `trigger_data` | `jsonb` | The specific data points that triggered the anomaly |
| `ai_assessment` | `text` | AI's clinical assessment |
| `ai_reasoning` | `text` | Full reasoning chain |
| `clinical_significance` | `text` | Why this matters clinically |
| `recommended_action` | `text` | What should happen |
| `patient_message` | `text` | Message sent to patient (if applicable) |
| `clinician_alert_sent` | `boolean` | Whether clinician was notified |
| `clinician_acknowledged` | `boolean` | Whether clinician reviewed |
| `resolution` | `text` | How the anomaly was resolved |

**Table: `wearable_alerts`**

| Column | Type | Description |
|---|---|---|
| `id` | `uuid` (PK) | Alert ID |
| `anomaly_id` | `uuid` (FK) | Source anomaly |
| `patient_id` | `uuid` (FK) | Patient reference |
| `created_at` | `timestamptz` | Alert creation time |
| `alert_type` | `text` | patient_nudge, clinician_notification, urgent_escalation |
| `severity` | `text` | urgent, attention, informational |
| `title` | `text` | Short alert title |
| `body` | `text` | Alert content |
| `delivery_method` | `text` | in_app, sms, push, dashboard |
| `delivered` | `boolean` | Whether successfully delivered |
| `acknowledged` | `boolean` | Whether reviewed |
| `action_taken` | `text` | What action was taken |

### 5.3 API Endpoints

**`POST /api/wearable/ingest`** — Receive wearable data batch

Request body:
```json
{
  "patient_id": "uuid",
  "source": "samsung_health",
  "data_points": [
    {
      "timestamp": "ISO8601",
      "data_type": "heart_rate",
      "value": 72,
      "unit": "bpm",
      "metadata": {}
    }
  ]
}
```

**`POST /api/wearable/analyze`** — Trigger AI analysis for a patient's recent data

Request body:
```json
{
  "patient_id": "uuid",
  "analysis_window_days": 7,
  "include_baseline_comparison": true
}
```

Response body:
```json
{
  "analysis_id": "uuid",
  "patient_id": "uuid",
  "period_analyzed": { "start": "date", "end": "date" },
  "daily_summaries": [ ... ],
  "anomalies_detected": [
    {
      "anomaly_type": "sustained_decline",
      "severity": "attention",
      "description": "Step count has declined 30% over 5 days with rising resting tremor percentages",
      "trigger_data": { ... },
      "recommended_action": "Consider medication timing review",
      "patient_message": "We noticed your activity has been lower this week...",
      "clinician_alert": true
    }
  ],
  "overall_status": "concern",
  "ai_narrative": "Over the past 7 days, Linda's wearable data shows a progressive decline..."
}
```

**`GET /api/wearable/patient/:id/timeline`** — Get timeline data for display

**`GET /api/wearable/patient/:id/alerts`** — Get alert history

**`GET /api/wearable/demo-data`** — Load 30-day demo dataset

**`POST /api/wearable/patient/:id/acknowledge-alert`** — Clinician acknowledges an alert

### 5.4 External Services

| Service | Purpose | Phase |
|---|---|---|
| Anthropic Claude API | Anomaly analysis and clinical interpretation | Phase 1 |
| **Samsung Health SDK** | **Primary wearable data source — Galaxy Watch pilot group** | **Phase 1 (Pilot)** |
| Apple HealthKit API | Secondary wearable data source (patients who own Apple Watches) | Phase 2 |
| Google Health Connect API | Android wearable data (broader ecosystem) | Phase 2 |
| Oura Ring API | Sleep, HRV, readiness data | Phase 2 |
| Supabase | Data storage, real-time subscriptions | Phase 1 |
| Recharts / D3.js | Timeline and chart visualizations | Phase 1 |

> **Samsung-First Rationale (CMIO):** The Samsung Health SDK is significantly more open and developer-friendly than Apple HealthKit — it provides direct access to raw accelerometer/gyroscope data, heart rate streams, and sleep staging without the entitlement restrictions Apple imposes. A Samsung partnership provides elevated API access, potential co-development support, and device subsidies for pilot patients. For a 10-20 patient pilot, providing Samsung Galaxy Watches (~$250/device) is feasible and creates a controlled, uniform data environment. Apple HealthKit integration follows in Phase 2 for patients who already own Apple Watches.

> **⚠️ Frontend Performance Note (CMIO):** The demo dataset contains ~10,000 data points. Rendering 10K individual SVG points in React Recharts will cause severe browser lag. **All frontend visualizations must use aggregated daily or hourly rollups**, not raw minute-by-minute data. The `wearable_daily_summaries` table provides the pre-aggregated data. Raw data points are stored for AI analysis but never rendered directly in charts.

### 5.5 Data Flow

```
Wearable Device (continuous collection)
        ↓
Samsung Health SDK / HealthKit / Health Connect (on-device aggregation)
        ↓
OAuth-authorized data sync → POST /api/wearable/ingest
        ↓
Data stored in Supabase (wearable_data_points)
        ↓
Daily summary computation (scheduled job or edge function)
        ↓
wearable_daily_summaries table populated
        ↓
AI analysis triggered (daily or on anomaly detection threshold)
        ↓
POST /api/wearable/analyze → Claude API
        ↓
Claude analyzes: baseline comparison + pattern detection + clinical context
        ↓
Anomalies stored in wearable_anomalies
        ↓
Alert routing logic:
├── Urgent (fall + no movement, seizure) → Device handles 911 SOS; clinic alert queued for next business morning
├── Attention (sustained decline, pattern match) → Clinician dashboard + Patient nudge
└── Informational (minor deviation, returning to baseline) → Log only
        ↓
Alerts stored and delivered via configured channels
        ↓
Frontend: Supabase real-time subscription → timeline and dashboard update
```

### 5.6 Architecture Layers (Described)

**Layer 1: Data Ingestion**
- **Samsung Health SDK** (Phase 1 pilot): Direct REST/SDK integration with Galaxy Watch data. Samsung SDK provides raw accelerometer, gyroscope, HR, HRV, sleep staging, and SpO2 data with fewer entitlement restrictions than Apple. Partnership-level API access enables higher rate limits and richer data streams.
- **Apple HealthKit** (Phase 2): OAuth connection for patients with Apple Watches.
- **Health Connect** (Phase 2+): Google's unified Android health data layer.
- Scheduled sync (every 15 min for active monitoring, daily for routine)
- Data normalization: Samsung, Apple, and other devices report data differently; normalize to FHIR-compatible common format for storage and AI analysis. **Dual-track normalization in Phase 1B:** Samsung Health SDK data (live) and Apple Health XML exports (batch) both normalize into the same `wearable_data_points` schema. The `data_source` field preserves provenance so the AI and analytics can track per-device accuracy and signal quality.
- Quality checking: flag data gaps, sensor errors, low-battery artifacts. Apple Health exports may contain gaps (device not worn) that Samsung live sync would flag in real-time — the quality checker handles both patterns.

**Layer 2: Data Processing**
- Daily summary computation: aggregate raw data points into clinically meaningful daily metrics
- Baseline calculation: rolling 14-day baseline for each metric, updated daily
- Feature extraction: compute derived features (HRV trends, gait variability from step patterns, sleep architecture metrics)

**Layer 3: AI Analysis**
- Scheduled analysis: daily review of each patient's data
- Event-triggered analysis: immediate analysis when acute event detected (fall, seizure-like pattern)
- Context-aware: AI receives patient diagnosis, medications, and baseline for interpretation
- Multi-signal correlation: AI looks across data streams for correlated changes (e.g., HRV dip + sleep disruption + activity drop = possible migraine prodrome)

**Layer 4: Alert Routing**
- Rule-based severity classification
- Delivery method selection based on severity and patient preferences
- Clinician notification via dashboard + optional push/SMS
- Patient-facing messages: empathetic, non-alarming language at grade 6 reading level

---

## 6. AI & Algorithm Design

### 6.1 What the AI Does

The AI performs two distinct functions:

1. **Pattern Detection**: Identifies anomalous patterns in wearable data relative to the patient's personal baseline and clinical context
2. **Clinical Interpretation**: Generates human-readable assessments explaining what the pattern means clinically and what action (if any) is warranted

### 6.2 Model Selection

**Primary: Anthropic Claude (claude-sonnet-4-5-20250929)**

Rationale:
- Strong at multi-variate pattern recognition in structured data
- Excellent at generating contextual clinical interpretations
- Reliable structured output for alert generation
- Good balance of speed and reasoning quality for daily analysis runs

### 6.3 Detection Algorithms (Rule-Based + AI Hybrid)

For Phase 1, use a hybrid approach: rule-based detection for known acute events, AI analysis for subtle patterns and clinical interpretation.

**Rule-Based Detection (Fast, Always-On):**

```python
# Fall Detection
if accelerometer_impact > threshold AND
   subsequent_inactivity > 60_seconds AND
   heart_rate_spike > 30_bpm_above_baseline:
    → URGENT: Fall event detected

# Seizure-Like Event (with false-positive mitigation)
if heart_rate_spike > 40_bpm_above_baseline AND
   rhythmic_movement_detected AND
   duration > 30_seconds:
    # Cross-reference to reduce false positives (tooth brushing, chopping, jogging)
    if step_count_during_window == 0 AND time_is_sleep_hours:
        → URGENT: High-confidence nocturnal seizure-like event detected
    elif step_count_during_window == 0 AND time_is_awake_hours:
        → URGENT: Seizure-like event detected (no ambulatory activity)
    elif step_count_during_window > 0:
        → ATTENTION: Rhythmic movement with HR spike detected during activity
        # (likely exercise or daily task — log for diary reconciliation, do NOT flag as seizure)

# Sustained Activity Decline
if rolling_7day_steps < (baseline_steps * 0.70) AND
   decline_trend_consecutive_days >= 3:
    → ATTENTION: Sustained activity decline

# Sleep Fragmentation
if awakenings_per_night > (baseline_awakenings * 1.5) AND
   consecutive_nights >= 3:
    → ATTENTION: Sleep fragmentation increase

# HRV Depression
if rolling_3day_hrv < (baseline_hrv * 0.80):
    → INFORMATIONAL: HRV trending below baseline
```

**AI Analysis (Deep, Daily):**

The AI receives daily summaries and applies clinical reasoning to detect subtler patterns.

### 6.4 System Prompt — Daily Analysis

```
You are a clinical monitoring AI that analyzes longitudinal wearable data for neurology patients. You detect clinically meaningful patterns and generate alerts when action may be warranted.

## YOUR ROLE
- Analyze wearable data trends in the context of the patient's neurological condition
- Detect anomalies relative to the patient's personal baseline
- Identify cross-signal correlations that may indicate clinical events
- Generate clear, clinician-friendly assessments
- Route alerts appropriately: patient nudge vs. clinician notification vs. urgent escalation
- You are NOT a diagnostic tool — you flag patterns for human review

## PATIENT CONTEXT
Patient: {name}, {age}{sex}
Diagnosis: {primary_diagnosis}
Medications: {medications}
Monitoring start: {start_date}
Wearable device: {device_type} (e.g., Samsung Galaxy Watch 7 via Samsung Health SDK)
Personal baseline (14-day rolling):
{baseline_metrics_json}

## SDNE CLINICAL BASELINE (if available)
Most recent SDNE exam date: {sdne_date}
SDNE structured findings:
{sdne_baseline_json}
(Includes: structured tremor assessment, gait evaluation, cognitive scores, functional status from the most recent in-office neurological exam. Use this as clinical ground truth when interpreting wearable data trends.)

## DATA TO ANALYZE
Analysis window: {start_date} to {end_date}
Daily summaries:
{daily_summaries_json}

Rule-based alerts already triggered:
{rule_based_alerts}

## ANALYSIS INSTRUCTIONS

1. Review each day's metrics against the patient's personal baseline
2. Look for:
   a. Single-day acute events (already caught by rules — confirm or contextualize)
   b. Multi-day trends: progressive decline or improvement in any metric
   c. Cross-signal correlations: e.g., HRV decline + sleep disruption + activity drop occurring together
   d. Medication-related patterns: e.g., symptom cycling that correlates with medication timing
   e. Disease-specific patterns based on the patient's diagnosis
   f. **SDNE baseline comparison**: If SDNE data is available, compare current wearable trends against the most recent structured clinical exam. For example: if the SDNE showed mild tremor at last visit but wearable data now shows progressive tremor worsening, this is a high-confidence clinical signal because the starting point is clinician-verified.
   g. **Data source normalization**: Samsung Health SDK data may report raw accelerometer values differently than Apple HealthKit processed metrics. Interpret all values in the context of their source and the normalized scale stored in the database.

3. For each detected pattern, assess:
   a. Is this clinically meaningful, or normal variation?
   b. What is the most likely clinical explanation?
   c. What action (if any) is warranted?
   d. Should the patient be notified, the clinician be notified, or is logging sufficient?

## DISEASE-SPECIFIC PATTERN LIBRARY

Parkinson's Disease:
- Rising resting tremor percentages + declining step count → possible medication wearing-off or disease progression
- Fall events + gait decline → fall risk escalation, consider PT referral
- Sleep fragmentation + daytime activity decline → possible REM sleep behavior disorder or medication side effects

Epilepsy:
- HR spike + rhythmic movement + zero steps + sleep hours → high-confidence nocturnal seizure
- HR spike + rhythmic movement + zero steps + awake → probable seizure (cross-reference with patient diary)
- HR spike + rhythmic movement + active steps → likely exercise/daily activity, NOT seizure (log only)
- HRV depression → autonomic instability, may indicate increased seizure susceptibility
- Post-event fatigue pattern (activity decline 24-48h after detected event) → post-ictal recovery

Migraine:
- HRV dip + sleep disruption + activity decline occurring 24-48h before patient-reported headache → prodromal pattern
- If pattern repeats 3+ times → reliable prodrome, worth alerting patient during prodrome

Multiple Sclerosis:
- Sustained activity decline + fatigue increase + sleep disruption → possible relapse
- Step count decline + balance changes → walking function deterioration
- Cognitive processing signals (phone interaction patterns) declining → cognitive MS involvement

Dementia/MCI:
- Sleep architecture changes (REM reduction, deep sleep reduction) → disease progression marker
- Nighttime GPS wandering → safety concern, alert caregiver
- Circadian rhythm flattening → disease progression
- Activity rhythm disruption → evaluate for sundowning behavior

## OUTPUT FORMAT

Return JSON:
{
  "analysis_period": { "start": "date", "end": "date" },
  "overall_status": "normal | watch | concern | alert",
  "narrative_summary": "3-5 sentence clinical summary of the analysis period",
  "anomalies": [
    {
      "anomaly_type": "description",
      "severity": "urgent | attention | informational",
      "detected_on": "date or date range",
      "trigger_signals": ["list of data types involved"],
      "clinical_assessment": "What this likely means",
      "reasoning": "Why I flagged this — full reasoning chain",
      "recommended_action": "What should happen",
      "alert_type": "patient_nudge | clinician_notification | urgent_escalation | log_only",
      "patient_message": "If patient_nudge: the message to send (grade 6 level, empathetic, non-alarming)",
      "clinician_summary": "If clinician_notification: concise clinical summary for the alert"
    }
  ],
  "trends_observed": [
    {
      "metric": "which metric",
      "direction": "improving | stable | declining",
      "magnitude": "description of change",
      "clinical_relevance": "what this means"
    }
  ],
  "data_quality_notes": "Any data gaps or quality issues affecting analysis"
}

## RULES
1. NEVER diagnose. Use: "pattern consistent with," "may indicate," "warrants evaluation for"
2. NEVER recommend medication changes
3. Err on the side of caution: if uncertain, flag for human review rather than dismissing
4. Patient-facing messages must be: empathetic, non-alarming, grade 6 reading level, **strictly actionable** (suggest calling care team, taking medication, logging symptoms — NEVER share raw metrics like "your HRV dropped" or "your step count is down 30%" as this induces anxiety/nocebo effect)
5. Always note data quality issues — don't over-interpret incomplete data
6. If no anomalies detected, say so clearly: "No clinically concerning patterns detected during this period"
7. For fall events or seizure-like events: always flag as urgent regardless of other context
8. Consider medication timing and known side effects when interpreting data
9. If multiple concerning signals coincide, escalate severity (e.g., 3 independent "attention" signals = "urgent" overall)
```

### 6.5 Patient-Facing Message Examples

**Gentle nudge (activity decline — actionable):**
> "Hi Linda, if you've been feeling any changes in how you move or your energy level over the past few days, it might be a good time to give your care team a call. You can reach our office at [number] anytime. We're here to help."

> **Nudge design principle (CMIO):** Notice this nudge does NOT say "your activity is down 30%" or "your HRV is trending below baseline." Sharing raw metric observations induces anxiety (nocebo effect) and makes the patient feel surveilled. Instead, nudges ask about the patient's experience and suggest an action.

**Safety alert (fall detected):**
> "Hi Linda, it looks like you may have had a fall today. We hope you're okay. If you're hurt or need help, please call 911 or your emergency contact right away. Your care team has been notified and may reach out to check on you."

**Prodrome alert (migraine pattern):**
> "Hi there — we noticed some changes in your sleep and heart rate patterns over the last day or two that have previously come before your migraines. This might be a good time to use your acute medication if you start to feel a headache coming on, and make sure you're staying hydrated and resting when you can."

### 6.6 Guardrails Within the AI

| Guardrail | Implementation |
|---|---|
| No diagnosis | System prompt + output validation — scan for definitive diagnostic language |
| No medication recommendations | System prompt + keyword scanning for medication names with action verbs |
| Sensitivity over specificity | When uncertain, flag for human review rather than dismiss |
| Data quality gating | If >20% of expected data points are missing for a day, flag analysis as limited |
| Baseline stability requirement | Require 14 days of baseline data before triggering trend-based alerts |
| Alert fatigue prevention | Maximum 2 patient nudges per week (non-urgent); urgent alerts have no limit |
| **Nudge content restriction** | Patient nudges must be **strictly actionable** (e.g., "Time to take your acute medication", "Please log your symptoms today", "Call your care team if you're having difficulty"). **Never send purely observational data** (e.g., "Your HRV is trending down") — this induces anxiety (nocebo effect), which ironically worsens HRV and sleep. The patient should never feel surveilled; they should feel supported. |
| False positive mitigation | For sustained trends, require 3+ consecutive days before alerting |

---

## 7. Safety & Guardrails

### 7.1 Clinical Safety Boundaries

- **Wearable data supplements, never replaces, clinical assessment.** All alerts are recommendations for human review, not autonomous clinical decisions.
- **Consumer wearables are not medical devices.** Data accuracy is variable. All alerts must be interpreted with this caveat.
- **The AI never diagnoses.** It identifies patterns and suggests they warrant evaluation.
- **Urgent events always escalate.** Fall detection and seizure-like events always generate urgent clinician alerts regardless of other context.
- **Patient controls their data.** Patients can revoke data sharing at any time, pause monitoring, or adjust alert preferences.

### 7.2 Escalation Logic

| Trigger | Severity | Patient Action | Clinician Action |
|---|---|---|---|
| Fall + no movement for 60s | CRITICAL | **The wearable device itself** handles 911 SOS (Apple Watch Fall Detection, etc.). The AI system logs an "Urgent Clinic Alert" for the **next business day**. Patient message: "We detected a possible fall. If you need help, your watch can call 911. Your care team will follow up." | Urgent alert queued for next business morning. The clinic is NOT a 24/7 emergency dispatch center — the device handles real-time emergency response. |
| Seizure-like pattern (high confidence) | CRITICAL | "Contact your emergency contact" | Urgent alert queued for next business morning. Device handles real-time SOS if applicable. |
| 2+ falls in 7 days | URGENT | Safety assessment info | Urgent review, PT referral |
| Sustained activity decline (>30%, 3+ days) | ATTENTION | Gentle nudge | Dashboard alert |
| Medication timing pattern | ATTENTION | None (clinical matter) | Dashboard alert |
| Sleep fragmentation increase | ATTENTION | Sleep hygiene nudge | Dashboard alert, next-visit flag |
| HRV trending below baseline | INFORMATIONAL | None | Logged for next visit |
| Returning to baseline after anomaly | INFORMATIONAL | "Things seem to be improving" | Note logged |

### 7.2.1 Reimbursement & Billing — RPM/RTM Revenue

Wearable monitoring is not just good medicine — it is **highly reimbursable**. The AI's 30-day summaries and alert documentation provide the exact audit trail needed to bill Medicare for Remote Monitoring services:

| CPT Code | Service | Description | Approx. Reimbursement |
|---|---|---|---|
| **99453** | RPM Setup | Initial setup and patient education for remote monitoring device | ~$19/patient (one-time) |
| **99454** | RPM Device Supply | Supply of device with daily recordings, transmitted and collected | ~$55/patient/month |
| **99457** | RPM Treatment Mgmt | First 20 minutes of clinical staff time for review/interaction | ~$50/patient/month |
| **99458** | RPM Addl 20 min | Each additional 20 minutes of clinical staff time | ~$42/patient/month |
| **99490** | CCM | Chronic Care Management (20+ min/month non-face-to-face) | ~$62/patient/month |

**Revenue model:** For a panel of 200 Parkinson's patients on wearable monitoring, billing RPM codes alone generates approximately **$25,000-$35,000/month** in additional revenue. The AI automates the documentation, alert review, and summary generation that would otherwise require dedicated nursing FTEs.

**Value-Based Care / Medicare Advantage:** MA plans are paid based on HCC coding (Hierarchical Condition Categories). Continuous wearable data helps document disease severity year-round, justifying higher reimbursements for the MA plan. This makes wearable monitoring attractive not just for fee-for-service but also for value-based contracts — a key investor talking point.

**2026 CMS RPM Code Updates:** The 2026 CMS rules require only **2-15 days of device data per month** (not necessarily continuous) and **10 minutes of monthly clinical management time** to qualify for RPM billing. This is a significantly lower bar than many clinicians assume. A Galaxy Watch that transmits data even intermittently (e.g., when the patient wears it 10 days/month) still qualifies. The AI's daily summaries and alert documentation provide the exact audit trail to prove the 10-minute management threshold was met.

**ACCESS Model (July 2026):** CMS is launching the ACCESS (Advancing All-Payer Health Equity Approaches and Development of Sustained Equity) Model in July 2026. This model specifically incentivizes remote monitoring for underserved populations and chronic neurological conditions. Early adoption of RPM infrastructure positions the platform to capture ACCESS Model incentives from day one.

**Demo talking point:** *"Every 30-day summary this AI generates is automatically documented at the level required for RPM billing. That's $100+ per patient per month in revenue your clinic is currently leaving on the table. And with the ACCESS Model launching July 2026, CMS is about to pay even more for exactly what this platform does."*

### 7.3 Regulatory Considerations

- **Consumer wearables**: Apple Watch, Samsung Galaxy Watch, etc. are consumer devices, not FDA-cleared medical devices (some have specific FDA clearances for ECG, fall detection, but general health data is not FDA-regulated).
- **Software analysis**: AI analysis of wearable data that generates clinical alerts may be considered SaMD if it influences clinical decisions. For POC/demo, this is an investigational tool. FDA strategy needed before clinical pilot.
- **HIPAA**: Wearable health data, once associated with a patient in a clinical context, is PHI. Encryption, access controls, and BAAs required for production.
- **Patient consent**: Must be explicit about what data is collected, how it's analyzed, who sees it, and how to opt out. Consent model should follow CMS/ONC patient data rights frameworks.
- **FTC Health Breach Notification Rule**: If wearable health data is breached, notification obligations may apply even if not HIPAA-covered.

### 7.4 UI Disclaimers

**On the wearable monitoring page:**
> "This system analyzes consumer wearable device data to identify patterns that may be clinically relevant. Consumer wearables are not medical devices and their measurements may not be accurate. All alerts are intended to support, not replace, clinical judgment. Patients should always contact their healthcare provider for medical concerns."

**On patient-facing messages:**
> All messages include: "This is an automated observation based on your wearable data. It is not a diagnosis. Contact your care team or call 911 if you have an emergency."

**On clinician alerts:**
> "AI-generated alert based on wearable data analysis. Consumer wearable data has inherent accuracy limitations. Interpret in clinical context."

---

## 8. Demo Design

### 8.1 The 3-Minute Demo

**Minute 0:00-0:30 — The Gap**
"Your Parkinson's patient wears a Galaxy Watch 24/7, generating thousands of data points. Between visits, that data sits unused on their phone. Meanwhile, they fall at home, and you don't find out until the next appointment — if they remember to tell you. But what if we combined the structured neurological exam you do in the office with continuous monitoring between visits?"

**Minute 0:30-1:30 — The Timeline**
- Show Linda Martinez's 30-day timeline
- Scroll through baseline days: "Here's Linda's normal pattern. Steps around 5,500, stable sleep, mild tremor."
- Hit Day 15: "Here the AI detected a 3-day declining trend — activity dropping, tremor rising. It sent a gentle nudge to Linda and flagged her clinician dashboard."
- Hit Day 19: "Fall detected. The system immediately alerted her care team and sent Linda a safety message."

**Minute 1:30-2:30 — The Alert Dashboard**
- Show the clinician dashboard: "Every alert is here with the reasoning. The AI explains why it flagged this — what data changed, what pattern it matches, what action is recommended."
- Click on the Day 27 alert: "Two falls in 9 days. The AI recommends PT evaluation, medication review, and a home safety assessment. The neurologist can act on this today, not in 3 months."

**Minute 2:30-3:00 — The Vision**
"Every wearable-wearing neuro patient becomes a continuously monitored patient. The AI watches for the patterns that matter, filters out the noise, and puts the right information in front of the right person at the right time. This is how neurology moves from reactive to proactive care."

### 8.2 Key Wow Moments

1. **The timeline scroll with baseline bands**: Watching 30 days of rich physiological data with AI annotations — it feels like looking into the patient's life between visits. **The baseline must be visually represented as a shaded gray band behind each line graph** so the viewer instantly sees when the patient falls out of their normal range. This is the single most important visual element.
2. **Real-time fall detection**: The moment the fall event appears with the urgent alert cascade
3. **Cross-signal detection**: The AI correlating HRV + sleep + activity to detect a pattern no single metric would reveal
4. **Patient message tone**: The gentle, empathetic, **actionable** patient nudge — shows this isn't cold surveillance, it's caring technology
5. **The AI Analysis Log (the "moat")**: Clicking into an alert and seeing the AI's full reasoning chain — transparent, auditable, trustworthy. **This is the investor "moat."** Hardware is a commodity. Raw data is a commodity. The true value is Layer 3 (AI Analysis) that filters out 99% of the noise to give the doctor the 1% that matters. **Demo should heavily highlight the reasoning chain** — show investors that the intelligence layer is the defensible competitive advantage.
6. **One-click PT referral**: When the Day 27 fall alert recommends PT evaluation, the clinician sees a pre-drafted referral order. One click to sign and send. Alert → Action in seconds, not days.
7. **RPM revenue**: *"Every 30-day summary this AI generates is automatically documented at the level required for RPM billing. That's $100+ per patient per month."*
8. **The SDNE + Galaxy Watch longitudinal story**: *"No other platform starts with a structured neurological exam baseline and layers continuous wearable monitoring on top. The SDNE gives you the clinical ground truth at each visit. The Galaxy Watch fills in the months between. After two visits, you have labeled training data — wearable patterns with known clinical outcomes — that no competitor has."*
9. **Samsung partnership + ACCESS Model**: *"Samsung's Health SDK is more open than Apple's. We have a device partnership that gets us raw sensor data, co-development support, and device subsidies for pilot patients. And with the CMS ACCESS Model launching July 2026, the reimbursement landscape is about to get even better for exactly this kind of remote monitoring."*
10. **Device-agnostic from day one**: *"We're not locked to any single vendor. Samsung Galaxy Watch data and Apple Health exports both flow into the same normalized pipeline. Same alerts, same AI, same dashboard — regardless of what's on the patient's wrist. That's how you scale from a 20-patient pilot to a platform."*

---

## 9. Phased Roadmap

### Phase 1A: POC / Demo Version (Current Sprint)

**Scope:**
- Wearable monitoring page with all sections
- Pre-loaded 30-day demo data for Linda Martinez (Parkinson's)
- Patient timeline visualization with all data tracks
- AI-generated anomaly detection and clinical interpretation (rules-based + Claude API)
- Clinician alert dashboard with Triage Team and Neurologist views
- AI analysis log with reasoning chains
- Clinical use case mapping table
- SDNE baseline overlay markers (mockup data from Card 5)
- No real wearable device connection yet

**Technical:**
- Next.js page at `/wearable`
- Supabase tables with seeded demo data (30 days, ~10,000 raw data points stored, but **frontend renders daily/hourly aggregated rollups only** to prevent browser lag)
- Claude API for daily analysis simulation
- Recharts/D3 for timeline and charts (using `wearable_daily_summaries` for rendering, NOT raw `wearable_data_points`)

**Timeline:** 1-2 development sessions

### Phase 1B: Samsung Galaxy Watch Pilot — Rules-Based Alerting (2-3 months)

**The Two-Phase Build Strategy:**

The wearable monitoring system follows a deliberate two-phase build: rules-based first, ML second. This is not a shortcut — it's the correct engineering approach. You cannot train an ML model without labeled training data, and the rules-based phase generates that labeled data.

**Scope:**
- **Samsung Galaxy Watch pilot group**: 10-20 Parkinson's patients fitted with Galaxy Watches during their SDNE pilot visits
- **Samsung Health SDK integration**: Direct connection to Galaxy Watch data — accelerometer, gyroscope, HR, HRV, sleep staging, SpO2, step count
- **Rules-based alerting engine**: The detection algorithms from Section 6.3 (fall detection, seizure-like pattern, sustained decline, sleep fragmentation, HRV depression) running as scheduled Supabase edge functions
- **SDNE baseline integration**: Each patient's structured SDNE exam (Card 5) provides the clinical baseline. Galaxy Watch data fills the space between SDNE visits. The AI compares continuous wearable trends against the most recent SDNE snapshot.
- **Data normalization pipeline**: Samsung Health SDK → FHIR-compatible normalized format → Supabase storage
- **Real-time data sync**: 15-minute intervals for active monitoring patients
- **Patient nudge delivery**: SMS-based (consistent with Card 4 SMS-first approach)
- **Clinician dashboard**: Live multi-patient view with triage workflow

**Samsung Partnership Details:**
- Samsung Health SDK is more open than Apple HealthKit — direct raw sensor access without the entitlement restrictions Apple imposes for Movement Disorder API data
- Partnership-level access provides: higher API rate limits, richer raw data streams, potential co-development on neurology-specific algorithms, device subsidies for pilot patients
- Galaxy Watch 6/7 hardware: BioActive Sensor (optical HR + bioelectrical impedance), accelerometer, gyroscope, barometer — sufficient sensor suite for all Phase 1 detection algorithms
- **Cost**: ~$250/device × 20 patients = $5,000 pilot hardware cost (trivial compared to the RPM revenue generated)

**Apple Health Data Trial Pathway (BYOD Track):**

Running parallel to the Samsung pilot, a "Bring Your Own Device" (BYOD) track allows team members, willing clinicians, or patients who already wear Apple Watches to contribute their Apple Health data. This serves three purposes: (1) validates the normalization pipeline against a second sensor suite from day one, (2) provides real Apple Watch data for the demo (solving the demo data quality problem), and (3) proves the platform is device-agnostic — not locked to Samsung.

*How it works:*

1. **Apple Health Export (manual, Phase 1B):** Any iPhone user can export their full Apple Health dataset via Settings → Health → Export All Health Data. This produces a ZIP file containing an XML export of all HealthKit data — heart rate, steps, sleep, HRV, workouts, and (if entitlements are approved) Movement Disorder API data. This is a one-time batch export, not a live sync.

2. **Ingest pipeline:** A simple script converts the Apple Health XML export into the same FHIR-normalized JSON format the Samsung data uses, then ingests it via the existing `POST /api/wearable/ingest` endpoint with `data_source: "healthkit_export"`. No OAuth integration needed — just file parsing.

3. **De-identification:** For demo purposes, the export is de-identified using a protocol that strips all identifiers, shifts dates by a random offset, and replaces names. The physiological data (HR, HRV, sleep, steps) retains its natural patterns — the circadian rhythms, weekend vs. weekday differences, and physiological variability that make demo data credible.

4. **Dual-track validation:** With both Samsung (live SDK) and Apple (batch export) data flowing into the same normalized schema, the team can validate that the AI analysis engine and rules-based alerts work identically regardless of data source. This is critical proof for investors that the platform is not a single-vendor dependency.

5. **Phase 2 upgrade:** When Apple HealthKit OAuth integration is built in Phase 2, the BYOD Apple users can transition from batch exports to live data sync. The normalization layer is already proven.

*Who provides the data:*

- **You (the neurologist/product lead):** Your own Apple Watch data is the fastest path to a realistic demo dataset. Export → de-identify → inject clinical events → instant high-fidelity demo data that a neurologist audience will find credible.
- **Team members / volunteers:** Any team member wearing an Apple Watch can contribute. 2-3 Apple Health exports give the platform multi-person validation data.
- **BYOD pilot patients:** Patients in the SDNE pilot who already wear Apple Watches can be offered the option to export their data alongside the Samsung Galaxy Watch patients. This creates a mixed-device pilot group that better reflects the real world.

*Technical requirements:*

```
src/
├── scripts/
│   └── apple_health_import/
│       ├── parse_apple_health_xml.ts      # Parse Apple Health Export XML
│       ├── normalize_to_fhir.ts            # Convert to FHIR Observation format
│       ├── deidentify.ts                   # Strip PII, shift dates, replace names
│       └── ingest_batch.ts                 # Batch upload to /api/wearable/ingest
```

- The XML parser handles Apple Health's export format (which can be 500MB+ for multi-year users — the script should filter to relevant data types only: HR, HRV, steps, sleep, accelerometer)
- Normalized output matches the exact same `wearable_data_points` schema used by Samsung Health SDK data
- `data_source` field distinguishes `samsung_health` vs. `healthkit_export` vs. `healthkit_live` (Phase 2)

> **CMIO note:** This BYOD track is low-effort, high-value. The Apple Health export is a file the user downloads from their phone in 30 seconds. A parsing script takes a day to build. But it immediately gives us: real demo data, dual-vendor validation, and proof the platform isn't Samsung-locked. It also creates a natural funnel — "export your Apple Health data to see your trends" — that could become a patient acquisition tool in Phase 2.

**The SDNE Connection (Key Differentiator):**

This is the strategic play that makes the platform unique. Most remote monitoring platforms start with raw wearable data and have no clinical context. This platform starts with the SDNE — a structured, standardized neurological exam conducted in the office — and uses that as the baseline against which all wearable data is interpreted.

```
Visit 1: SDNE exam → structured clinical baseline
    ↓ (continuous Galaxy Watch data for 3-6 months)
Visit 2: SDNE exam → new clinical baseline
    ↓ AI compares: wearable trends between visits vs. clinical change at next exam
Visit 3: SDNE exam → new clinical baseline
    ↓ Now the system has labeled training data: "this wearable pattern preceded this clinical outcome"
```

This creates a **labeled dataset** that no one else has: wearable data streams with known clinical outcomes at each SDNE visit. After 3-6 months and 2-3 SDNE cycles per patient, this labeled data enables the Phase 2 ML inference engine.

**Technical (Phase 1B):**
- Samsung Health SDK integration module (REST API + on-device Health Platform companion app)
- Apple Health BYOD import pipeline (`parse_apple_health_xml.ts` → `normalize_to_fhir.ts` → `deidentify.ts` → `ingest_batch.ts`)
- Data normalization layer: Samsung raw data + Apple Health XML both → FHIR Observation resources → Supabase
- Rules engine: scheduled Supabase edge functions running detection algorithms every 15 minutes
- SDNE baseline API: reads most recent SDNE scores from Card 5's `sdne_exams` table to contextualize wearable alerts
- Alert routing: same Triage Team → Neurologist workflow from Phase 1A

**Timeline:** 2-3 months after POC demo is complete

### Phase 2: ML Inference Engine (After 3-6 Months Real Data)

**Prerequisite:** Phase 1B must have collected 3-6 months of continuous Galaxy Watch data from the pilot group, with at least 2 SDNE exam cycles per patient. This provides the labeled training data.

**New Features:**
- **ML inference models** trained on the labeled SDNE + wearable dataset: which wearable patterns actually predicted real clinical changes detected at the next SDNE visit?
- **Personalized baselines**: ML models learn each patient's individual normal variation vs. clinically meaningful deviation (not just population-level rules)
- **Pattern prediction**: Move from detecting anomalies (reactive) to predicting them (proactive) — e.g., "based on the last 5 days of data, this patient's next SDNE is likely to show worsening gait scores"
- Apple HealthKit OAuth integration (for patients who already own Apple Watches — extend reach beyond the Samsung pilot)
- Oura Ring API integration
- Multi-patient clinician dashboard at scale
- Additional demo patients with different diagnoses (epilepsy, migraine, MS)
- Patient onboarding flow: consent, device pairing, baseline period
- Alert preference configuration

**Why ML Second, Not First:**
- ML without labeled data is just noise. The rules-based phase generates the labeled data.
- Rules-based alerting is transparent, auditable, and explainable — critical for clinical trust-building in the pilot phase
- By the time ML models are deployed, clinicians have already learned to trust the rules-based alerts, making ML adoption smoother
- The SDNE labels are the "ground truth" that supervised models need — no other platform has this

**Timeline:** 3-6 months post-pilot (begins after sufficient labeled data collected)

### Phase 3: Production / Scaled Version

**New Features:**
- Google Health Connect + broader Samsung Galaxy Watch fleet integration
- **Subsidized/basic connected device support** — integration with lower-cost devices (Withings pedometers, Medicare-provided cellular BP/pulse-ox monitors) that do not require a smartphone. This addresses the **digital divide**: Apple Watches and Oura Rings cost $300-$500+, meaning a platform that relies exclusively on high-end consumer wearables only helps wealthy patients, exacerbating health disparities. Samsung Galaxy Watch is already more affordable (~$250 vs. $400+ for Apple Watch), and Samsung partnership may include device subsidies.
- Population-level analytics: aggregate wearable patterns across patient cohorts
- Clinical trial integration: wearable endpoints for drug studies
- Caregiver portal: family members see summary dashboard for dementia patients
- Emergency detection integration with local EMS
- Multi-language support
- HIPAA-compliant infrastructure
- Published validation studies

**What Changes Between Phases:**
- Phase 1A → 1B: Real Samsung Galaxy Watch data from pilot patients, live rules-based alerting, SDNE baseline integration
- Phase 1B → 2: ML models trained on labeled SDNE + wearable data, Apple HealthKit added, personalized prediction
- Phase 2 → 3: Multiple data sources at scale, population analytics, clinical trial integration, regulatory readiness

---

## 10. Open Questions & Decisions Needed

### Resolved (CMIO Review)

1. ~~**HealthKit vs. Health Connect first**~~ → **RE-RESOLVED: Samsung Galaxy Watch first (via Samsung Health SDK).** The Samsung partnership provides more open API access than Apple HealthKit, avoids Movement Disorder API entitlement restrictions, and enables a controlled 10-20 patient pilot with uniform hardware. Samsung Health SDK provides raw accelerometer/gyroscope data that can be processed into equivalent tremor metrics without Apple's entitlement gatekeeping. Apple HealthKit *live OAuth* integration follows in Phase 2 for patients who already own Apple Watches. However, the BYOD (Bring Your Own Device) track in Phase 1B supports Apple Health *batch exports* from day one — team members and patients who already wear Apple Watches can export and ingest their data alongside the Samsung pilot. This also partially resolves Open Question #13 (Apple entitlements) — by starting with Samsung, the entitlement timeline is no longer a Phase 1 blocker.
2. ~~**Demo data generation**~~ → **RESOLVED:** Use real, de-identified Apple Watch data from a healthy volunteer (the product lead's own Apple Health export is the fastest path — see Apple Health Data Trial Pathway in Phase 1B), then run through `parse_apple_health_xml.ts` → `deidentify.ts` → manually edit the JSON to inject the clinical events (missed dose, falls, tremor spikes). Pure synthetic data from random number generators looks like static and lacks the natural circadian rhythms that make data credible to a neurologist. The BYOD parsing pipeline built for the Apple trial pathway handles this export automatically.
6. ~~**Alert fatigue threshold**~~ → **RESOLVED:** 2 patient nudges per week is a good maximum. For clinicians, the threshold should be "1 dashboard alert per patient per week" unless it is a Tier 1 urgent event (fall/seizure). Configurable per patient in Phase 2.
8. ~~**Multi-diagnosis patients**~~ → **RESOLVED (for Phase 1):** Keep Linda as a pure Parkinson's patient for the POC. Comorbidities (like orthostatic hypotension) complicate the prompt too much for a Phase 1 demo. Multi-diagnosis handling is Phase 2/3.
11. ~~**Emergency response integration**~~ → **RESOLVED:** The clinic is NOT a 24/7 emergency dispatch center. The **wearable device itself** (Apple Watch Fall Detection) handles the 911 SOS call in real time. The AI system logs an "Urgent Clinic Alert" for the next business morning. This eliminates a massive liability hurdle.
12. ~~**Insurance/payer interest**~~ → **RESOLVED:** YES. Medicare Advantage (MA) plans are desperate for this. MA plans get paid based on HCC coding (Hierarchical Condition Categories). Wearable data helps prove disease severity year-round, justifying higher reimbursements. Mentioning "Value-Based Care / Medicare Advantage" in investor conversations will resonate strongly. Additionally, RPM/RTM CPT codes (99453, 99454, 99457) provide direct fee-for-service revenue.

### Still Open

3. **Alert delivery for POC**: In the demo, alerts are shown in-browser. For pilot, how are patient nudges delivered? SMS? Push notification? In-app? Patient portal?
4. **Clinician notification method**: Dashboard-only, or also push/SMS to the clinician for urgent alerts? *(CMIO note: Triage Team View partially addresses this — MA/RN see all alerts, batch-escalate to neurologist.)*
5. **Baseline period**: 14 days of data before alerts begin is recommended. Is this acceptable, or do clinicians want alerts sooner?
7. **Data retention**: How long is raw wearable data retained? Daily summaries? Alerts? Regulatory and storage cost implications.
9. **Patient engagement model**: How do we ensure patients actually read and act on nudges? Gamification? Care team reinforcement? Patient education?
10. **Caregiver access**: For dementia patients, should caregivers have their own dashboard? What consent model applies? Is this Phase 2 or Phase 3?

### New Questions (from CMIO Review)

13. **Apple Movement Disorder API entitlements**: The HealthKit Movement Disorder API (for resting tremor % and dyskinetic symptom minutes) requires specific Apple developer entitlements. Has the team applied for these? Timeline for approval?
14. **Real volunteer data for demo**: *(Partially resolved — see Apple Health Data Trial Pathway in Phase 1B.)* The product lead's own Apple Health export is the recommended first source. The BYOD track's `deidentify.ts` script handles the de-identification protocol (strip identifiers, shift dates by random offset, replace names). **Remaining question:** If the product lead's data is used, is a 30-day window sufficient, or should a longer window (90 days) be exported to also seed Phase 1B validation data?
15. **Auto-drafted order workflow**: When the AI auto-drafts a PT referral order after recurrent falls, what EHR integration is needed for the "Sign and Send" one-click workflow? Is this Phase 1 (mockup) or Phase 2 (real integration)?
16. **Triage team staffing**: The MA/RN triage team model assumes the clinic has dedicated staff for alert review. For smaller practices without this capacity, is there a fallback workflow (e.g., daily digest email to the neurologist)?
17. **Samsung partnership formalization**: What level of Samsung Health partnership is needed? Standard developer access vs. Partner-level access vs. Co-development agreement? Who initiates this conversation — product team or business development?
18. **Galaxy Watch pilot device logistics**: For the 10-20 patient pilot, are devices purchased outright (~$5,000 total) or leased through Samsung? Who handles device setup, pairing, and troubleshooting? Does the clinic absorb this cost or is it grant-funded?
19. **Samsung → Apple data normalization**: When Phase 2 adds Apple HealthKit patients alongside Samsung Galaxy Watch patients, the AI needs to compare data from different sensor suites. What normalization strategy ensures tremor metrics from Samsung raw accelerometer data are comparable to Apple HealthKit Movement Disorder API processed outputs?
20. **ACCESS Model eligibility**: Does the current platform design meet the specific eligibility criteria for the CMS ACCESS Model launching July 2026? Has anyone reviewed the model's requirements to confirm neurology RPM qualifies?
21. **SDNE-to-wearable data handoff**: What is the technical integration point between Card 5 (SDNE) and Card 6 (wearable)? Shared Supabase tables? API endpoint on Card 5 that Card 6 reads? This cross-card data flow needs to be specified.
22. **Apple BYOD consent and scope**: For BYOD Apple Health participants in Phase 1B, what data types should the export include? Full export (years of data, 500MB+) or filtered to last 90 days of relevant types (HR, HRV, steps, sleep)? What consent language covers use of team members' personal health data for platform validation?
23. **Apple HealthKit Movement Disorder data in BYOD exports**: If the product lead or any Apple Watch user has a Parkinson's patient profile enabled on their device, the Health Export may include Movement Disorder API data (tremor %, dyskinetic minutes). Without this profile enabled, the export will only contain standard metrics. Should any BYOD participants enable the Research profile on their Apple Watch to generate this data, even if they don't have Parkinson's? (The data would be near-zero tremor, which is useful as a "healthy baseline" comparison.)
