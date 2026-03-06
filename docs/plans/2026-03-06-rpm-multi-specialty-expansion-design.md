# RPM Multi-Specialty Expansion & Enhanced Monitoring Design

**Date:** 2026-03-06
**Status:** Design / Research
**Author:** Claude (with clinical direction from Dr. Arbogast)

---

## 1. Executive Summary

This document expands Sevaro's Remote Patient Monitoring (RPM) platform beyond its neurology foundation into **multi-specialty chronic disease monitoring**. The core thesis: we've built a sophisticated 4-layer architecture (ingestion → processing → AI analysis → alert routing) for neurology patients. That same architecture — with disease-specific pattern libraries, AI prompts, and dashboard sections — can serve **heart failure, COPD, diabetes, and general cardiology** patients using the same consumer wearables and connected devices (Apple Watch, Whoop, CGMs, smart scales).

Additionally, this document covers two neurology-specific enhancements:
1. **Spiral Drawing Analysis** — digitized spiral tracing on smartphone/tablet to differentiate Parkinson's vs Essential Tremor
2. **Apathy Monitoring** — behavioral biomarkers from wearable data to track apathy as a neuropsychiatric symptom

### Why Now

- The infrastructure is proven: real Apple Watch data flowing through to clinician dashboards
- RPM billing codes (99453–99458) are specialty-agnostic — same reimbursement for cardiology, pulmonology, endocrinology
- Consumer device ecosystem is mature: Whoop API, Dexcom Clarity, Withings Health Mate all have developer access
- The AI analysis layer is modular: adding a new disease pattern library is a configuration change, not a rearchitecture
- CMS ACCESS Model (July 2026) incentivizes RPM for chronic conditions across specialties

---

## 2. New Neurology Features

### 2.1 Spiral Drawing Analysis (Movement Disorders)

#### Clinical Background

Archimedes spiral drawing is a standard bedside test in movement disorder neurology. The characteristics of hand-drawn spirals differ systematically between Parkinson's Disease (PD) and Essential Tremor (ET):

| Feature | Parkinson's Disease | Essential Tremor |
|---------|-------------------|------------------|
| Tremor frequency | 4–6 Hz (rest tremor) | 6–12 Hz (action/postural) |
| Spiral appearance | Micrographia, tight loops, progressive size reduction | Large-amplitude oscillations perpendicular to stroke |
| Tremor onset | Appears at rest, may dampen with intentional movement | Appears/worsens with intentional movement (drawing) |
| Pen pressure | Often increased (rigidity) | Normal or variable |
| Speed | Slow, progressive deceleration (bradykinesia) | Normal to fast with rhythmic oscillation |
| Asymmetry | Typically unilateral dominant | Often bilateral but may have dominant side |

#### Digitized Spiral Metrics

When a patient traces a spiral on a touchscreen, we can extract ~75 quantitative features:

**Primary Differentiating Metrics:**
- **Tremor frequency (Hz)**: FFT analysis of radial displacement — PD: 4–6 Hz, ET: 6–12 Hz
- **Tremor amplitude**: Peak-to-peak radial deviation from ideal spiral path — ET >> PD
- **Drawing speed**: Average velocity and velocity variability — PD shows progressive deceleration
- **Spiral tightness ratio**: Ratio of inner to outer loop spacing — PD shows micrographia (progressive tightening)
- **Smoothness index**: Jerk metric (rate of change of acceleration) — PD has higher jerk due to cogwheel rigidity
- **Pen pressure profile**: Mean, variance, and trend — PD tends toward higher sustained pressure
- **Radial deviation from template**: How far the drawn spiral deviates from the target — ET shows perpendicular oscillation

**Secondary Metrics:**
- Drawing duration (total time to complete spiral)
- Number of direction reversals
- Pause frequency and duration (freezing episodes in PD)
- Asymmetry score (dominant vs non-dominant hand comparison)
- Consistency score (trial-to-trial variability across 3 attempts)

#### Classification Accuracy (Literature)

Published studies on digitized spiral analysis report:
- **PD vs ET differentiation**: 85–95% accuracy using machine learning on spiral features
- **PD vs healthy controls**: 90–98% accuracy
- **ET severity grading**: Strong correlation between spiral metrics and clinical Fahn-Tolosa-Marin tremor rating scale
- **Longitudinal tracking**: Spiral metrics correlate with UPDRS motor scores over time, enabling between-visit disease progression monitoring

#### Existing Apps/Algorithms (Competitive Landscape)

1. **Spiralometry (academic)** — MATLAB-based analysis, not consumer-facing
2. **DrawADiagnosis** — Research app from University of Haifa, ~93% PD vs ET accuracy
3. **Apple ResearchKit Active Tasks** — Includes tremor task but not spiral-specific
4. **PD-Monitor (University of Oxford)** — Smartphone-based PD monitoring including spiral
5. **CloudUPDRS** — Cloud-based UPDRS scoring with motor tasks

#### SevaroMonitor Implementation Concept

**User Flow:**
1. Patient opens SevaroMonitor app → "Assessments" tab → "Spiral Drawing"
2. Screen shows a light gray spiral template (Archimedes spiral, 3 turns)
3. Instructions: "Using your index finger, trace the spiral from center to outside as smoothly as you can"
4. Patient traces with finger on touchscreen (captures x, y, timestamp, pressure at 120Hz)
5. Repeat 3 times (best-of-3 for reliability)
6. Optional: repeat with non-dominant hand (asymmetry comparison)
7. Raw data uploaded to Supabase → AI analysis → clinical narrative

**Data Model (new table: `wearable_spiral_assessments`):**

```sql
CREATE TABLE wearable_spiral_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES wearable_patients(id) NOT NULL,
  assessment_date TIMESTAMPTZ DEFAULT NOW(),
  hand TEXT NOT NULL CHECK (hand IN ('left', 'right')),
  trial_number INT NOT NULL CHECK (trial_number BETWEEN 1 AND 5),

  -- Raw data (stored as JSONB for flexibility)
  raw_points JSONB NOT NULL,  -- [{x, y, t, pressure}, ...]
  sampling_rate_hz NUMERIC,

  -- Computed metrics
  tremor_frequency_hz NUMERIC,
  tremor_amplitude NUMERIC,
  drawing_speed_avg NUMERIC,
  drawing_speed_variance NUMERIC,
  spiral_tightness_ratio NUMERIC,
  smoothness_index NUMERIC,      -- jerk metric
  pen_pressure_mean NUMERIC,
  pen_pressure_variance NUMERIC,
  radial_deviation_mean NUMERIC,
  radial_deviation_max NUMERIC,
  total_duration_ms INT,
  pause_count INT,
  pause_total_ms INT,
  direction_reversals INT,

  -- Composite scores
  composite_score NUMERIC,
  pd_probability NUMERIC,        -- 0.0–1.0 probability of PD pattern
  et_probability NUMERIC,        -- 0.0–1.0 probability of ET pattern
  classification TEXT,            -- 'pd_pattern', 'et_pattern', 'indeterminate', 'normal'

  -- AI narrative
  ai_narrative_id UUID REFERENCES wearable_clinical_narratives(id),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_spiral_patient_date ON wearable_spiral_assessments(patient_id, assessment_date DESC);
```

**AI Analysis Pipeline:**
- Stage 1: Feature extraction from raw touch points (can run on-device or server-side)
- Stage 2: Classification model (PD vs ET vs normal) — initially rule-based using frequency/amplitude thresholds, later ML model trained on collected data
- Stage 3: GPT-5.2 narrative generation contextualizing the result with patient history, medication timing, and longitudinal trend

**Dashboard Integration:**
- New "Spiral" sub-track within MotorTrack on the 30-day timeline
- Show composite score trend over time (weekly spiral assessments)
- Overlay with medication timing to detect motor fluctuations
- Alert: "Spiral metrics show 25% worsening over 4 weeks — consider medication adjustment"

**Demo Script Addition:**
> "Between visits, the patient completes a simple spiral drawing on their phone once a week. Watch how the tremor frequency and amplitude change over this 30-day period. See here on day 14 — after the medication adjustment — the spiral smoothness improved by 30%. That's objective motor tracking without an office visit."

---

### 2.2 Apathy Monitoring (Neuropsychiatric)

#### Clinical Background

Apathy is one of the most common and disabling neuropsychiatric symptoms across neurology:
- **Parkinson's Disease**: 40–60% prevalence, often precedes motor symptoms
- **Dementia/MCI**: 50–80% prevalence, associated with faster cognitive decline
- **MS**: 20–40% prevalence, independent of depression
- **Stroke**: 30–40% prevalence, predicts poor rehabilitation outcomes
- **TBI**: 20–50% prevalence, persists long-term

Apathy is distinct from depression — it's a loss of motivation, initiative, and emotional engagement without the sadness/guilt of depression. It's currently measured by clinical scales (Apathy Evaluation Scale, Lille Apathy Rating Scale) administered every 3–6 months. Wearable data can provide continuous proxy measurements.

#### Wearable Behavioral Biomarkers for Apathy

| Biomarker | Data Source | What It Indicates | Alert Threshold |
|-----------|------------|-------------------|----------------|
| **Daily step count decline** | Accelerometer | Reduced initiative to move | >30% below baseline for 5+ days |
| **Activity bout frequency** | Accelerometer | Fewer discrete activity episodes | <3 bouts/day (vs baseline of 8+) |
| **Sedentary time increase** | Accelerometer + HR | Extended periods of inactivity | >14 hrs/day sedentary for 3+ days |
| **Phone interaction decline** | Smartphone usage | Reduced engagement with device | >40% reduction in screen time + app opens |
| **Social contact reduction** | Call/message logs | Withdrawal from social engagement | Zero outgoing calls/texts for 3+ days |
| **Circadian rhythm flattening** | Activity + light | Loss of daily activity structure | <50% amplitude of normal circadian rhythm |
| **Sleep schedule drift** | Sleep data | Loss of routine maintenance | >2 hour variation in sleep/wake times |
| **Self-care gaps** | Composite | Neglect of routine activities | Multiple indicators converging |

#### Implementation Concept

**New Disease Pattern (add to AI system prompt):**
```
APATHY_PATTERN:
  signals: [step_decline, activity_bouts, sedentary_time, circadian_amplitude]
  trigger: 3+ of 4 signals abnormal for 5+ consecutive days
  context: Distinguish from depression (apathy = reduced activity WITHOUT sleep architecture disruption typical of depression)
  context: Distinguish from physical limitation (apathy = CAN move but DON'T; physical limitation = progressive inability)
  alert_level: ATTENTION
  action: "Behavioral pattern suggests possible increasing apathy. Consider Apathy Evaluation Scale at next visit. Review medications for apathy-inducing agents (SSRIs, beta-blockers, dopamine antagonists)."
  patient_nudge: "We've noticed you've been less active lately. Sometimes changes in motivation happen gradually. If you'd like to talk about how you're feeling, reach out to your care team."
```

**Dashboard Section:**
- Apathy Risk Score (0–10) derived from behavioral biomarkers
- Trend line showing apathy score over 30 days
- Correlation overlay: apathy score vs medication changes
- Population comparison: "Patient's activity level is in the 15th percentile for their age/diagnosis group"

---

## 3. Multi-Specialty Expansion

### 3.1 Heart Failure (Cardiology)

#### Why Heart Failure

Heart failure affects 6.7M Americans and is the #1 cause of hospital readmission. CMS penalizes hospitals for 30-day readmissions (Hospital Readmissions Reduction Program). RPM has strong evidence for reducing readmissions by 20–40%. The monitoring data model maps cleanly to our existing architecture.

#### Data Sources & Metrics

| Metric | Device/Source | Normal Range | Alert Thresholds | Clinical Significance |
|--------|-------------|--------------|-----------------|----------------------|
| **Daily weight** | Smart scale (Withings Body+, Garmin Index S2) | Stable ±1 kg | >2 lb (0.9 kg) in 24h OR >5 lb (2.3 kg) in 7 days | Fluid retention → decompensation |
| **Resting HR** | Apple Watch, Whoop | 60–80 bpm | >100 bpm sustained OR >20% above baseline | Sympathetic activation, decompensation |
| **HRV (RMSSD)** | Apple Watch, Whoop | Patient-specific | >25% decline from baseline for 3+ days | Autonomic dysfunction, worsening HF |
| **SpO2** | Apple Watch, pulse oximeter | >95% | <92% sustained OR >3% decline from baseline | Pulmonary edema, respiratory compromise |
| **Blood pressure** | Connected cuff (Withings BPM, Omron) | <130/80 (target) | SBP >160 or <90; DBP >100 | Afterload changes, hypotension from over-diuresis |
| **Activity/steps** | Any wearable | Patient-specific | >40% decline for 3+ days | Exercise intolerance, functional decline |
| **Sleep position** | Apple Watch (inferred) | Flat/reclined | Increasingly upright sleep | Orthopnea — classic HF decompensation sign |
| **Respiratory rate** | Whoop, Apple Watch (overnight) | 12–20 breaths/min | >22 sustained | Pulmonary congestion |
| **Fluid intake** (self-report) | App-based logging | 1.5–2L/day | >2.5L/day without instruction | Fluid overload risk |

#### Heart Failure Pattern Library

```
HF_DECOMPENSATION_PATTERN:
  signals: [weight_gain, resting_hr_increase, spo2_decline, activity_decline, sleep_disruption]
  trigger: weight_gain > 2lb/24h OR (3+ signals abnormal for 2+ days)
  severity:
    CRITICAL: weight_gain > 5lb/3days + SpO2 < 90% → "Possible acute decompensation. Consider ER evaluation."
    URGENT: weight_gain > 3lb/3days + HR > 100 → "Fluid retention with tachycardia. Same-day clinician review."
    ATTENTION: weight_gain > 2lb/7days + activity_decline → "Gradual fluid accumulation. Adjust diuretics."
  patient_nudge: "Your daily check-in shows some changes. Please take your medications as prescribed and contact your care team if you feel more short of breath than usual."

HF_MEDICATION_RESPONSE:
  signals: [weight_stable, hr_controlled, bp_in_range, activity_maintained]
  trigger: All 4 signals in range for 14+ days after medication change
  alert_level: INFORMATIONAL
  action: "Patient appears to be responding well to recent medication adjustment. Document for next visit."

HF_OVERDIURESIS:
  signals: [weight_loss_rapid, bp_low, hr_increase, dizziness_reported]
  trigger: weight_loss > 3lb/3days + SBP < 90
  severity: URGENT
  action: "Possible over-diuresis. Review diuretic dosing. Check renal function."
```

#### Dashboard Design — Heart Failure Section

**Primary View: "Fluid Balance Dashboard"**
- **Weight trend chart** (30 days): Daily weight with ±2 lb warning band and ±5 lb danger band
- **Vital sign tiles**: Resting HR | BP | SpO2 | Respiratory Rate (each with trend arrow)
- **Composite HF Risk Score**: 0–10 scale combining all metrics (green/yellow/orange/red)
- **Medication adherence**: Self-reported or smart pill bottle data
- **Symptom diary**: Patient-reported dyspnea, edema, fatigue (1–5 scale)

**Alert Card Design:**
> **ATTENTION** — Weight Trend Alert
> James Wilson, 72M | CHF (EF 35%) | NYHA Class III
> Weight: +3.2 lb over 5 days (168.4 → 171.6 lb)
> Resting HR: 88 → 96 bpm | SpO2: 95% → 93%
> AI Assessment: "Gradual fluid retention with mild tachycardia and declining oxygenation. Pattern consistent with early decompensation. Consider increasing furosemide from 40mg to 60mg daily and recheck weight in 48 hours."
> [Adjust Diuretic] [Schedule Call] [View 30-Day Trend]

---

### 3.2 COPD (Pulmonology)

#### Why COPD

COPD affects 16M diagnosed Americans (estimated 16M more undiagnosed). Like heart failure, it has high readmission rates and CMS penalties. Exacerbations are the primary driver of morbidity, mortality, and cost. Early detection of exacerbations (ECOPD) can prevent hospitalization.

#### Data Sources & Metrics

| Metric | Device/Source | Normal Range | Alert Thresholds | Clinical Significance |
|--------|-------------|--------------|-----------------|----------------------|
| **SpO2** | Apple Watch, pulse oximeter | >92% (COPD baseline often lower) | >3% decline from personal baseline | Exacerbation, pneumonia |
| **Respiratory rate** | Whoop (overnight), Apple Watch | Patient-specific (often 18–24 for COPD) | >25% increase from baseline | Increased work of breathing |
| **Resting HR** | Any wearable | Patient-specific | >20% increase from baseline | Hypoxia compensation, infection |
| **Peak expiratory flow** | Connected spirometer (Nuvoair, MIR) | Patient-specific (% predicted) | <80% of personal best | Airflow limitation worsening |
| **Activity/steps** | Any wearable | Patient-specific | >30% decline for 2+ days | Exercise intolerance, exacerbation prodrome |
| **Sleep quality** | Apple Watch, Whoop | Patient-specific | Fragmentation increase + SpO2 dips | Nocturnal hypoxemia |
| **Cough frequency** | Smartphone mic (passive) | Baseline count | >50% increase | Exacerbation symptom |
| **Symptom diary** | App self-report | Daily CAT score | CAT increase >2 points | Exacerbation threshold |
| **Inhaler usage** | Smart inhaler (Propeller Health, Hailie) | As prescribed | Rescue inhaler >2x/day increase | Loss of control |

#### COPD Pattern Library

```
ECOPD_EARLY_DETECTION:
  signals: [spo2_decline, rr_increase, activity_decline, rescue_inhaler_increase, symptom_score_increase]
  trigger: 3+ signals abnormal for 2+ consecutive days
  severity:
    CRITICAL: SpO2 < 88% + RR > 30 → "Severe exacerbation likely. Consider ER evaluation."
    URGENT: SpO2 decline + activity decline + symptoms worsening → "Probable early exacerbation. Start action plan (prednisone burst + antibiotic if purulent sputum)."
    ATTENTION: Activity decline + sleep disruption → "Monitor closely. Patient may be entering exacerbation prodrome."

COPD_NOCTURNAL_HYPOXEMIA:
  signals: [overnight_spo2_dips, sleep_fragmentation, morning_hr_elevation]
  trigger: >5 SpO2 dips below 88% per night for 3+ nights
  alert_level: ATTENTION
  action: "Nocturnal hypoxemia pattern detected. Consider overnight oximetry study or supplemental O2 evaluation."
```

---

### 3.3 Diabetes (Endocrinology)

#### Why Diabetes

38M Americans have diabetes (type 1 + type 2). CGM adoption is exploding — no longer limited to insulin-dependent patients. Time-in-range (TIR) is replacing A1c as the primary glycemic control metric. CGM data is the richest continuous data stream in all of medicine (readings every 5 minutes, 288/day).

#### Data Sources & Metrics

| Metric | Device/Source | Target Range | Alert Thresholds | Clinical Significance |
|--------|-------------|-------------|-----------------|----------------------|
| **Glucose (continuous)** | Dexcom G7, Libre 3, Medtronic Guardian | 70–180 mg/dL | <54 (urgent low), <70 (low), >250 (high), >400 (urgent high) | Hypo/hyperglycemia |
| **Time in Range (TIR)** | CGM-derived | >70% (70–180) | <50% for 3+ days | Poor glycemic control |
| **Time Below Range (TBR)** | CGM-derived | <4% (<70), <1% (<54) | >4% (<70) or any time <54 | Hypoglycemia risk |
| **Time Above Range (TAR)** | CGM-derived | <25% (>180), <5% (>250) | >50% (>180) for 3+ days | Sustained hyperglycemia |
| **Glycemic variability (CV)** | CGM-derived | <36% | >36% sustained | Unstable control, hypo risk |
| **GMI (Glucose Mgmt Indicator)** | CGM-derived (14-day) | <7% | >8% or rising trend | Estimated A1c equivalent |
| **Weight** | Smart scale | Stable or trending per plan | >5% gain in 30 days | Medication effect, dietary |
| **Activity** | Any wearable | 150 min/week moderate | <50% of target | Exercise impacts insulin sensitivity |
| **Sleep** | Apple Watch, Whoop | 7–9 hours | <5 hrs or fragmented | Sleep deprivation → insulin resistance |
| **Meal timing** | App self-report | Consistent schedule | Irregular patterns | Dawn phenomenon, post-meal spikes |

#### International Consensus TIR Targets

| Population | TIR (70-180) | TBR <70 | TBR <54 | TAR >180 | TAR >250 |
|-----------|-------------|---------|---------|----------|----------|
| Type 1 & Type 2 | >70% | <4% | <1% | <25% | <5% |
| Older/high-risk | >50% | <1% | <0.5% | <50% | <10% |
| Pregnancy (Type 1) | >70% (63-140) | <4% (<63) | <1% (<54) | <25% (>140) | — |

#### Diabetes Pattern Library

```
DM_HYPOGLYCEMIA_PATTERN:
  signals: [glucose_below_70, glucose_below_54, tbr_increasing, nocturnal_lows]
  trigger: TBR > 4% for 3+ days OR any glucose < 54
  severity:
    CRITICAL: glucose < 54 for > 15 min → "Severe hypoglycemia event. Verify patient safety. Review insulin dosing."
    URGENT: TBR > 8% for 2+ days → "Recurrent hypoglycemia. Reduce basal insulin or sulfonylurea dose."
    ATTENTION: Nocturnal lows pattern → "Overnight hypoglycemia pattern detected. Consider reducing evening basal dose."

DM_HYPERGLYCEMIA_PATTERN:
  signals: [tar_increasing, glucose_sustained_above_250, gmi_rising]
  trigger: TAR > 50% for 3+ days OR glucose > 250 for > 4 hours
  severity:
    URGENT: glucose > 400 → "Severe hyperglycemia. Check for DKA symptoms (nausea, vomiting, abdominal pain). Consider ER if symptomatic."
    ATTENTION: TAR > 50% for 5+ days → "Sustained hyperglycemia. Review medication adherence, dietary changes, illness."
  patient_nudge: "Your glucose levels have been running higher than your target range. Stay hydrated and take your medications as prescribed. If you feel unwell (nausea, excessive thirst), contact your care team."

DM_DAWN_PHENOMENON:
  signals: [early_morning_glucose_rise, overnight_stability_then_spike]
  trigger: Glucose rises > 30 mg/dL between 3 AM and 7 AM on 5+ of 7 days
  alert_level: INFORMATIONAL
  action: "Dawn phenomenon pattern detected. Consider adding/adjusting basal insulin or GLP-1 RA timing."

DM_EXERCISE_RESPONSE:
  signals: [post_exercise_glucose_drop, activity_glucose_correlation]
  trigger: Informational — track correlation between activity bouts and glucose response
  alert_level: INFORMATIONAL
  action: "Document exercise-glucose relationship for patient education and medication timing."
```

#### Dashboard Design — Diabetes Section

**Primary View: "Glycemic Control Dashboard"**
- **Ambulatory Glucose Profile (AGP)**: Standardized report showing median, IQR, and 10th–90th percentile glucose curves over 24 hours (industry standard format)
- **TIR donut chart**: Visual breakdown of time in/above/below range
- **14-day trend tiles**: TIR | GMI | CV | Average Glucose (each with trend arrow)
- **Hypo event log**: List of hypoglycemic episodes with timestamp, duration, nadir
- **Meal-glucose overlay**: Activity and meal timing correlated with glucose trace

---

### 3.4 General Cardiology (Beyond Heart Failure)

#### Why Cardiology

Cardiovascular disease is the #1 cause of death globally. Consumer wearables are already FDA-cleared for atrial fibrillation detection (Apple Watch, Samsung Galaxy Watch). Expanding beyond HF into arrhythmia monitoring, hypertension management, and cardiac rehab creates the broadest RPM patient population.

#### Data Sources & Metrics

| Metric | Device/Source | Clinical Use | Alert Thresholds |
|--------|-------------|-------------|-----------------|
| **Irregular rhythm notification** | Apple Watch (FDA-cleared) | AFib detection | Any notification → verify with 12-lead or KardiaMobile |
| **Single-lead ECG** | KardiaMobile, Apple Watch | AFib confirmation, QTc monitoring | AFib detected (84% PPV per Apple Heart Study) |
| **Blood pressure** | Connected cuff (Withings, Omron) | Hypertension management | SBP >140 or <90 sustained |
| **Resting HR** | Any wearable | Rate control (AFib), beta-blocker monitoring | >110 bpm (uncontrolled AFib), <50 (over-treated) |
| **HRV** | Apple Watch, Whoop | Autonomic function, stress, recovery | Sustained decline > 25% from baseline |
| **Activity/exercise** | Any wearable | Cardiac rehab compliance | <150 min/week moderate activity |
| **VO2 max estimate** | Apple Watch, Garmin | Cardiorespiratory fitness | Declining trend over weeks |
| **Recovery HR** | Whoop, Apple Watch | Cardiac fitness marker | Recovery HR < 12 bpm at 1 min post-exercise |

#### Cardiology Pattern Library

```
AFIB_DETECTION:
  signals: [irregular_rhythm_notification, elevated_resting_hr, hrv_chaotic]
  trigger: Apple Watch irregular rhythm notification
  severity:
    URGENT: First-ever detection + HR > 110 → "New-onset AFib with rapid ventricular response. Evaluate stroke risk (CHA2DS2-VASc). Consider rate control."
    ATTENTION: Known AFib + HR intermittently > 110 → "Breakthrough rapid rate. Review rate control medication."
  action: "Verify with 12-lead ECG or KardiaMobile. Calculate CHA2DS2-VASc. Initiate anticoagulation if indicated."

HYPERTENSION_UNCONTROLLED:
  signals: [systolic_elevated, diastolic_elevated, morning_surge]
  trigger: Average SBP > 140 or DBP > 90 over 7-day period (home readings)
  alert_level: ATTENTION
  action: "Home BP averaging above target. Consider medication uptitration or adherence assessment."

CARDIAC_REHAB_COMPLIANCE:
  signals: [weekly_exercise_minutes, exercise_hr_response, recovery_metrics]
  trigger: <100 min/week moderate activity for 2+ weeks (target: 150 min)
  alert_level: INFORMATIONAL
  action: "Cardiac rehab exercise target not met. Patient engagement outreach recommended."
```

---

## 4. Device Integration Expansion

### 4.1 Whoop Band

**Available Data (via Whoop API/Developer Platform):**

| Category | Metrics | RPM Relevance |
|----------|---------|---------------|
| **Recovery** | Recovery score (0–100%), HRV (RMSSD), resting HR, respiratory rate, SpO2, skin temperature | Daily readiness assessment; recovery decline correlates with disease flares |
| **Strain** | Daily strain (0–21 scale), cardiovascular load, activity calories | Exercise capacity tracking, cardiac rehab compliance |
| **Sleep** | Total sleep, sleep stages (light/deep/REM/awake), sleep efficiency, sleep latency, disturbances | Sleep architecture changes (neurodegeneration, HF, COPD) |
| **Health** | Respiratory rate (overnight), blood oxygen, skin temp trends | COPD exacerbation detection, infection early warning |
| **Cycles** | Workout detection, HR zones, max HR | Exercise response and fitness trends |

**Integration Notes:**
- Whoop API requires OAuth2 authentication with user consent
- Data available via REST API in JSON format
- Real-time webhooks available for certain events
- **Limitation**: Whoop is NOT FDA-cleared as a medical device — same consumer wearable disclaimers as Apple Watch
- **Strength**: Whoop excels at recovery/HRV data quality; popular among health-conscious patients
- Third-party aggregators (Vital, Terra, Tryvital) can simplify multi-wearable API management

**RPM Billing Consideration:** Whoop data alone satisfies 99454 (device supply/data transmission) requirements when the patient transmits data for 16+ days/month. However, the device itself isn't provided by the practice, so 99454 may require a practice-supplied device (smart scale, BP cuff) as the "qualifying device" with Whoop as supplementary.

### 4.2 Continuous Glucose Monitors (CGMs)

**Available Systems:**

| System | Data Access | Update Frequency | Key Features |
|--------|------------|------------------|-------------|
| **Dexcom G7** | Dexcom Clarity API (cloud), Dexcom Share (real-time) | Every 5 minutes | Most open API; partner integration program; real-time data sharing |
| **Abbott Libre 3** | LibreView API (cloud) | Every minute (on-device), synced periodically | Largest market share; API access via LibreView platform |
| **Medtronic Guardian 4** | CareLink API (limited) | Every 5 minutes | Integrated with insulin pump ecosystem; more restricted API |

**Integration Architecture:**
```
CGM Device → Manufacturer Cloud (Dexcom Clarity / LibreView / CareLink)
  → Sevaro API (OAuth2 pull or webhook push)
    → wearable_daily_summaries (aggregated TIR, avg glucose, hypo events)
    → wearable_hourly_snapshots (hourly glucose stats)
    → wearable_anomalies (hypo/hyper events detected)
```

**Key Consideration:** Cross-brand CGM accuracy varies. Dexcom G7 MARD (mean absolute relative difference) is ~8.2%, Libre 3 is ~7.9%. Clinicians should be aware that glucose values are estimates, not lab-grade measurements. Dashboard should display which CGM system is providing data.

### 4.3 Smart Scales

**Available Devices:**

| Device | Data Points | API Access | Notes |
|--------|------------|-----------|-------|
| **Withings Body+ / Body Comp** | Weight, BMI, body fat %, muscle mass, water %, bone mass | Withings Health Mate API (best-in-class) | Most RPM-friendly; used in clinical trials |
| **Garmin Index S2** | Weight, BMI, body fat %, muscle mass, bone mass, water % | Garmin Connect API | Good ecosystem integration |
| **Eufy Smart Scale** | Weight, body composition (13 metrics) | Limited API | Consumer-grade, not ideal for RPM |
| **Renpho Smart Scale** | Weight, body composition | Limited API | Popular but limited clinical integration |

**RPM-Critical Feature:** Daily weight is the single most important metric for heart failure RPM. The smart scale should auto-sync (WiFi preferred over Bluetooth-only) so the patient doesn't need to actively transfer data. Withings is the gold standard here — auto-syncs over WiFi, has a robust API, and is used in multiple RPM clinical trials.

**Recommended Primary Device:** Withings Body+ ($99) or Withings Body Comp ($199)
- WiFi auto-sync (no phone needed for daily weight upload)
- Multi-user support (household)
- Clinical-grade weight accuracy (±100g)
- Well-documented REST API with webhook support
- Used in published HF RPM studies

### 4.4 Blood Pressure Monitors

| Device | Features | API Access | RPM Suitability |
|--------|---------|-----------|----------------|
| **Withings BPM Connect** | Clinically validated, WiFi sync, stores readings | Withings API | Excellent — same ecosystem as scale |
| **Omron Evolv** | FDA-cleared, Bluetooth, Omron Connect app | Omron API (limited) | Good accuracy, weaker API |
| **QardioArm** | Clinically validated, Bluetooth, Apple Health sync | Qardio API | Good design, moderate API |

### 4.5 Connected Spirometers (COPD)

| Device | Features | API Access |
|--------|---------|-----------|
| **Nuvoair Air Next** | FDA-cleared, Bluetooth, PEF + FEV1 | Nuvoair API |
| **MIR Spirobank Smart** | FDA-cleared, Bluetooth/USB | MIR API |
| **Propeller Health inhaler sensors** | Smart inhaler attachment, tracks usage + location | Propeller API |

---

## 5. Infrastructure & Architecture Changes

### 5.1 Multi-Specialty Data Model

The current schema is neurology-specific. To support multiple specialties, we need a **specialty-aware abstraction layer**:

**Option A: Specialty Column on Existing Tables (Recommended for MVP)**
```sql
-- Add specialty context to existing tables
ALTER TABLE wearable_patients ADD COLUMN specialties TEXT[] DEFAULT '{"neurology"}';
ALTER TABLE wearable_patients ADD COLUMN conditions JSONB DEFAULT '[]';
-- conditions: [{"code": "G20", "name": "Parkinson's", "specialty": "neurology"}, {"code": "I50.9", "name": "Heart Failure", "specialty": "cardiology"}]

-- Add specialty-specific metric fields to daily summaries
ALTER TABLE wearable_daily_summaries ADD COLUMN weight_kg NUMERIC;
ALTER TABLE wearable_daily_summaries ADD COLUMN systolic_bp INT;
ALTER TABLE wearable_daily_summaries ADD COLUMN diastolic_bp INT;
ALTER TABLE wearable_daily_summaries ADD COLUMN respiratory_rate NUMERIC;
ALTER TABLE wearable_daily_summaries ADD COLUMN glucose_avg NUMERIC;
ALTER TABLE wearable_daily_summaries ADD COLUMN glucose_tir NUMERIC;  -- time in range %
ALTER TABLE wearable_daily_summaries ADD COLUMN glucose_tbr NUMERIC;  -- time below range %
ALTER TABLE wearable_daily_summaries ADD COLUMN glucose_tar NUMERIC;  -- time above range %
ALTER TABLE wearable_daily_summaries ADD COLUMN peak_flow NUMERIC;    -- COPD
ALTER TABLE wearable_daily_summaries ADD COLUMN rescue_inhaler_count INT;
```

**Option B: Separate Specialty Tables (For Scale)**
```sql
-- Heart failure daily metrics
CREATE TABLE wearable_hf_daily (
  id UUID PRIMARY KEY,
  patient_id UUID REFERENCES wearable_patients(id),
  date DATE NOT NULL,
  weight_kg NUMERIC,
  weight_change_24h NUMERIC,  -- auto-computed
  weight_change_7d NUMERIC,   -- auto-computed
  systolic_bp INT,
  diastolic_bp INT,
  fluid_intake_ml INT,
  nyha_class INT,             -- self-reported 1-4
  dyspnea_score INT,          -- 1-5
  edema_score INT,            -- 0-4
  UNIQUE(patient_id, date)
);

-- Diabetes daily metrics
CREATE TABLE wearable_dm_daily (
  id UUID PRIMARY KEY,
  patient_id UUID REFERENCES wearable_patients(id),
  date DATE NOT NULL,
  glucose_avg NUMERIC,
  glucose_min NUMERIC,
  glucose_max NUMERIC,
  glucose_cv NUMERIC,          -- coefficient of variation
  tir_70_180 NUMERIC,         -- % time in range
  tbr_70 NUMERIC,             -- % time below 70
  tbr_54 NUMERIC,             -- % time below 54
  tar_180 NUMERIC,            -- % time above 180
  tar_250 NUMERIC,            -- % time above 250
  gmi NUMERIC,                -- glucose management indicator
  hypo_event_count INT,
  cgm_active_percent NUMERIC, -- % of day with CGM data
  UNIQUE(patient_id, date)
);

-- COPD daily metrics
CREATE TABLE wearable_copd_daily (
  id UUID PRIMARY KEY,
  patient_id UUID REFERENCES wearable_patients(id),
  date DATE NOT NULL,
  spo2_avg NUMERIC,
  spo2_min NUMERIC,
  spo2_dip_count INT,         -- number of desaturation events
  respiratory_rate_avg NUMERIC,
  peak_flow NUMERIC,
  peak_flow_pct_predicted NUMERIC,
  rescue_inhaler_count INT,
  cat_score INT,              -- COPD Assessment Test (0-40)
  cough_frequency INT,        -- if available from audio monitoring
  UNIQUE(patient_id, date)
);
```

**Recommendation:** Start with Option A (add columns to existing `wearable_daily_summaries`) for the initial multi-specialty MVP. Move to Option B when we have 50+ patients per specialty and need query performance optimization.

### 5.2 Device Abstraction Layer

Currently, Apple Watch data flows directly into our schema. With multiple device types, we need an **ingestion abstraction**:

```
                    ┌─────────────────┐
                    │  SevaroMonitor   │ (Apple HealthKit)
                    │  (iOS App)       │
                    └────────┬────────┘
                             │
┌──────────────┐    ┌────────▼────────┐    ┌─────────────────┐
│ Withings API │───▶│                  │◀───│ Dexcom Clarity  │
│ (Scale, BP)  │    │   Ingestion      │    │ (CGM)           │
└──────────────┘    │   Gateway        │    └─────────────────┘
                    │                  │
┌──────────────┐    │   /api/wearable/ │    ┌─────────────────┐
│ Whoop API    │───▶│   ingest         │◀───│ Propeller Health│
│ (Recovery)   │    │                  │    │ (Smart Inhaler)  │
└──────────────┘    └────────┬────────┘    └─────────────────┘
                             │
                    ┌────────▼────────┐
                    │   Normalize &    │
                    │   Store          │
                    │   (wearable_     │
                    │   daily_summaries│
                    │   + specialty    │
                    │   tables)        │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   AI Analysis    │
                    │   (specialty-    │
                    │   specific       │
                    │   pattern libs)  │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   Alert Routing  │
                    │   (Postgres      │
                    │   triggers)      │
                    └─────────────────┘
```

**New API Route:** `/api/wearable/ingest`
- Accepts data from any device source in a standardized format
- Maps device-specific fields to our canonical schema
- Handles authentication per device platform (OAuth2 tokens stored per patient)
- Idempotent upserts (safe to re-send data)

### 5.3 Dashboard Sectioning

The current dashboard is a single 30-day timeline optimized for neurology. For multi-specialty, we need **condition-specific dashboard sections**:

```
┌──────────────────────────────────────────────────────┐
│  Patient: James Wilson, 72M                          │
│  Conditions: Parkinson's Disease | Heart Failure     │
│  Devices: Apple Watch | Withings Scale | Withings BP │
├──────────────────────────────────────────────────────┤
│  [Neurology] [Cardiology] [All Metrics]    ← tabs   │
├──────────────────────────────────────────────────────┤
│                                                      │
│  NEUROLOGY TAB:                                      │
│  ├── Heart Rate Track (existing)                     │
│  ├── HRV Track (existing)                            │
│  ├── Sleep Track (existing)                          │
│  ├── Activity Track (existing)                       │
│  ├── Motor Track (existing + spiral drawing)         │
│  └── Cognitive Track (existing)                      │
│                                                      │
│  CARDIOLOGY TAB:                                     │
│  ├── Weight Track (daily weight + fluid balance)     │
│  ├── Blood Pressure Track (systolic/diastolic trend) │
│  ├── Heart Rate Track (shared with neuro)            │
│  ├── SpO2 Track (shared with neuro)                  │
│  └── Activity Track (shared with neuro)              │
│                                                      │
│  ALL METRICS TAB:                                    │
│  └── Full 30-day timeline (all tracks combined)      │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**Key Design Principle:** Many tracks are shared between specialties (HR, HRV, sleep, activity). The difference is the **AI interpretation context** — the same HR data means different things for a Parkinson's patient (autonomic dysfunction, medication side effect) vs a heart failure patient (decompensation, rate control). The AI prompt includes the patient's condition list to generate specialty-appropriate analysis.

---

## 6. RPM Billing & Reimbursement

### CPT Code Summary

| CPT Code | Description | 2025 Rate | 2026 Rate | Requirements |
|----------|------------|-----------|-----------|-------------|
| **99453** | RPM setup & patient education | ~$19.32 | ~$19.44 | One-time; initial device setup and training |
| **99454** | RPM device supply & daily data transmission | ~$55.72 | ~$56.04 | Monthly; device must transmit data 16+ days/month |
| **99457** | RPM treatment management (first 20 min/month) | ~$50.18 | ~$50.46 | Monthly; 20 min clinical time reviewing data, care plan |
| **99458** | RPM additional 20 min/month | ~$41.94 | ~$42.16 | Monthly; additional 20 min beyond 99457 |
| **99091** | Collection/interpretation of physiologic data | ~$56.88 | ~$57.14 | Monthly; 30+ min data review (cannot bill with 99457) |
| **99490** | Chronic care management (20 min/month) | ~$62.04 | ~$62.36 | Monthly; can bill concurrently with RPM codes |

**New 2026 Codes (proposed):**
- **99445**: RPM clinical staff time (RN/MA data review) — separate from physician time
- **99470**: AI-assisted RPM data analysis — under consideration for 2027

### Revenue Model per Specialty

| Specialty | Monthly per Patient | 100 Patients/Year | Key Billing Codes |
|-----------|-------------------|-------------------|-------------------|
| **Neurology (current)** | $125–$155 | $150K–$186K | 99453 + 99454 + 99457 + 99458 |
| **Heart Failure** | $125–$175 | $150K–$210K | 99453 + 99454 + 99457 + 99458 + 99490 |
| **COPD** | $105–$155 | $126K–$186K | 99453 + 99454 + 99457 + 99458 |
| **Diabetes** | $105–$155 | $126K–$186K | 99453 + 99454 + 99457 + 99458 |
| **Cardiology (general)** | $105–$155 | $126K–$186K | 99453 + 99454 + 99457 + 99458 |

**Concurrent Billing:** A patient with multiple conditions (e.g., Parkinson's + Heart Failure) can justify both RPM (99457/99458) and CCM (99490) in the same month if documented separately. This increases per-patient revenue to $175–$220/month.

**AI Impact on Billing Efficiency:**
- AI-generated 30-day summaries automatically document the clinical review time required for 99457/99458
- Pattern detection reduces time-per-patient for data review (from 20 min manual to 5 min AI-assisted review + sign-off)
- This means a single clinician can manage 4x more RPM patients, dramatically improving the revenue-to-cost ratio

---

## 7. Phased Roadmap

### Phase 1: Enhanced Neurology (Current + 4–6 weeks)
- [ ] Implement spiral drawing in SevaroMonitor iOS app
- [ ] Add `wearable_spiral_assessments` table and API
- [ ] Add spiral track to MotorTrack on dashboard
- [ ] Add apathy monitoring pattern to AI system prompt
- [ ] Add apathy behavioral biomarker tracking to daily summaries

### Phase 2: Heart Failure MVP (6–8 weeks)
- [ ] Integrate Withings API (smart scale + BP cuff)
- [ ] Add weight/BP columns to daily summaries (Option A schema)
- [ ] Build Heart Failure pattern library in AI system prompt
- [ ] Build Weight Track and BP Track dashboard components
- [ ] Add HF-specific alert cards and patient nudges
- [ ] Create HF demo patient with 30-day simulated data
- [ ] Add Cardiology tab to patient dashboard

### Phase 3: Diabetes MVP (8–10 weeks)
- [ ] Integrate Dexcom Clarity API (CGM data pull)
- [ ] Build diabetes daily metrics (TIR, TBR, TAR, CV, GMI)
- [ ] Build AGP (Ambulatory Glucose Profile) visualization
- [ ] Build Diabetes pattern library in AI system prompt
- [ ] Create diabetes demo patient with 30-day CGM data
- [ ] Add Endocrinology tab to patient dashboard

### Phase 4: COPD MVP (10–12 weeks)
- [ ] Integrate connected spirometer API (Nuvoair or MIR)
- [ ] Add COPD-specific metrics (PEF, rescue inhaler, CAT score)
- [ ] Build COPD pattern library in AI system prompt
- [ ] Build respiratory track dashboard components
- [ ] Create COPD demo patient with 30-day data

### Phase 5: Multi-Specialty Dashboard (12–16 weeks)
- [ ] Implement condition-based dashboard tab system
- [ ] Build unified device management panel (patient → devices → data sources)
- [ ] Implement ingestion gateway for multi-device data normalization
- [ ] Cross-specialty AI analysis (e.g., Parkinson's patient with concurrent HF)
- [ ] Whoop API integration
- [ ] Clinician workload dashboard (RPM panel size, time per patient, billing summary)

### Phase 6: Advanced Features (16+ weeks)
- [ ] ML-trained spiral classification model (trained on collected data)
- [ ] Cohort analytics (population-level trends across specialty panels)
- [ ] Patient-facing RPM portal (view own data, log symptoms)
- [ ] Smart inhaler integration (Propeller Health)
- [ ] Voice biomarker analysis (ALS progression tracking)
- [ ] Integration with practice management for automated RPM billing

---

## 8. Open Questions

1. **Samsung vs Apple vs Whoop priority?** Current implementation is Apple-first. Should we add Whoop next (broader health data, popular with health-conscious patients) or Samsung (original partnership strategy)?

2. **CGM brand priority?** Dexcom has the most open API but Libre has the largest market share. Start with Dexcom for easier integration?

3. **Multi-specialty dashboard tabs vs separate pages?** Should a patient with PD + HF see specialty tabs on one page, or separate dashboard pages per condition?

4. **Withings as "qualifying device" for RPM billing?** If we provide a Withings scale to patients, that may satisfy 99454 requirements. Explore Withings clinic/partner program for bulk device pricing.

5. **FDA SaMD classification impact?** Our current disclaimers treat this as decision support. As we add clinical pattern detection across specialties, does the regulatory risk increase? When do we need formal FDA engagement?

6. **Spiral drawing: on-device analysis vs cloud?** Running FFT and feature extraction on-device reduces latency and data transfer. But cloud analysis allows us to improve algorithms without app updates. Hybrid approach?

7. **Apathy vs depression differentiation:** The behavioral biomarkers overlap. How do we ensure the AI doesn't conflate reduced activity from apathy (motivational) with depression (mood) or physical limitation (functional)? Need validated clinical decision rules.

8. **Cross-specialty alert deduplication:** If a patient has PD + HF, an elevated resting HR is relevant to both specialties. Do we generate two alerts or one merged alert with dual clinical context?

---

## 9. Competitive Landscape

| Company | Focus | Strengths | Our Differentiator |
|---------|-------|----------|-------------------|
| **Current Health (Best Buy)** | General RPM | Large device catalog, retail distribution | We have AI-powered clinical interpretation, not just data display |
| **Biofourmis** | Cardiology RPM | FDA-cleared RhythmAnalytics, strong clinical evidence | We're multi-specialty and include neurology (no competitor does) |
| **Livongo (Teladoc)** | Diabetes RPM | Large diabetes panel, CGM integration | We combine CGM with wearable data for holistic view |
| **Propeller Health** | COPD (inhalers) | Smart inhaler market leader | We integrate inhaler data with wearable data for richer picture |
| **Rune Labs** | Neurology (PD) | Apple Watch PD monitoring, FDA engagement | We go beyond PD to full neurology + multi-specialty |
| **StrivePD (Roche)** | Parkinson's | Clinical trial-grade PD monitoring | We're clinic-facing (RPM billing), not trial-facing |

**Our Unique Position:** No competitor combines neurology-depth monitoring with multi-specialty expansion using the same platform. Most RPM companies are either specialty-specific (Rune Labs = PD only, Propeller = COPD only) or specialty-agnostic (Current Health = generic data display). We have **deep clinical intelligence per specialty** on a **shared platform**.

---

*This document should be reviewed alongside:*
- `playbooks/06_wearable_monitoring.md` — Current neurology monitoring playbook
- `docs/plans/2026-02-23-wearable-monitoring-design.md` — Original wearable design
- `docs/plans/2026-02-24-sevaro-monitor-plan.md` — SevaroMonitor iOS app plan
