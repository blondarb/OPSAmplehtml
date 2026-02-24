# Card 6: Wearable Monitoring POC — Design Document

**Date:** 2026-02-23
**Card:** 6 (new addition to landing page)
**Route:** `/wearable`
**Playbook:** `playbooks/06_wearable_monitoring.md`

---

## Overview

Build the Phase 1A POC of the Longitudinal Wearable Data & AI Monitoring card. Full playbook scope: all 6 page sections, Supabase tables with seeded 30-day demo data, Recharts timeline visualization, clinician alert dashboard with triage/neurologist views, AI analysis log with Claude API reasoning chain, and homepage card.

## Approach

Full Playbook POC (Approach A):
- All 6 content sections from playbook Section 4.1
- Supabase tables matching playbook Section 5.2
- 30-day demo dataset for Linda Martinez (Parkinson's) per playbook Section 4.3
- Recharts timeline with 5 data tracks + anomaly markers + baseline bands
- Clinician alert dashboard with Triage Team + Neurologist views
- AI Analysis Log powered by Claude API (claude-sonnet)
- Homepage card linking to `/wearable`
- No auth required (demo mode)

## Route & Homepage Integration

- New Next.js page at `src/app/wearable/page.tsx`
- Standalone scrollable page, no auth (same pattern as `/triage` and `/follow-up`)
- New card on `LandingPage.tsx` with sky blue accent (`#0EA5E9`), watch/activity icon
- Page layout: dark header bar with back-to-home link, then 6 content sections stacked vertically

## Supabase Schema

Four tables:

### wearable_patients
| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Patient ID |
| name | text | Display name |
| age | integer | Patient age |
| sex | text | Patient sex |
| primary_diagnosis | text | Primary neurological diagnosis |
| medications | jsonb | Current medication list |
| wearable_devices | jsonb | Connected devices and status |
| baseline_metrics | jsonb | Calculated personal baselines |
| monitoring_start_date | date | When monitoring began |

### wearable_daily_summaries
| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Summary ID |
| patient_id | uuid (FK) | Patient reference |
| date | date | Summary date |
| metrics | jsonb | Daily computed metrics (avg HR, total steps, sleep hours, HRV mean, tremor %, dyskinetic mins, sleep efficiency, awakenings) |
| anomalies_detected | jsonb | Array of anomaly descriptions |
| ai_analysis | text | AI's daily assessment |
| overall_status | text | normal, watch, concern, alert |

### wearable_anomalies
| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Anomaly ID |
| patient_id | uuid (FK) | Patient reference |
| detected_at | timestamptz | When AI detected the anomaly |
| anomaly_type | text | fall_event, sustained_decline, medication_pattern, etc. |
| severity | text | urgent, attention, informational |
| trigger_data | jsonb | Specific data points that triggered |
| ai_assessment | text | AI's clinical assessment |
| ai_reasoning | text | Full reasoning chain |
| clinical_significance | text | Why this matters clinically |
| recommended_action | text | What should happen |
| patient_message | text | Message sent to patient (if applicable) |

### wearable_alerts
| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Alert ID |
| anomaly_id | uuid (FK) | Source anomaly |
| patient_id | uuid (FK) | Patient reference |
| created_at | timestamptz | Alert creation time |
| alert_type | text | patient_nudge, clinician_notification, urgent_escalation |
| severity | text | urgent, attention, informational |
| title | text | Short alert title |
| body | text | Alert content |
| acknowledged | boolean | Whether reviewed |
| escalated_to_md | boolean | Whether triage team escalated |
| action_taken | text | What action was taken |

## Frontend Components (~25 files)

All in `src/components/wearable/`:

### Section 1: Concept Hero
- `ConceptHero.tsx` — animated visual (wearable → AI → alerts), explainer text, 3 value props

### Section 2: Data Sources
- `DataSourceCards.tsx` — device cards (Samsung Galaxy Watch = live, Apple Watch = Phase 2, Oura = Phase 2) with integration status badges
- `DataTypeMatrix.tsx` — table showing which data types from which devices

### Section 3: Clinical Use Cases
- `ClinicalUseCaseTable.tsx` — interactive table with 8 diagnoses, clickable rows
- `UseCaseDetailPanel.tsx` — expanded view per diagnosis with example data and AI detection logic

### Section 4: Patient Timeline (Core)
- `PatientTimeline.tsx` — 30-day horizontal scrollable container, day selector
- `HeartRateTrack.tsx` — Recharts line (5-min avg HR + resting HR trend), red palette
- `HRVTrack.tsx` — Recharts line (daily RMSSD + 7-day rolling avg), purple palette
- `SleepTrack.tsx` — Recharts stacked bar (deep/REM/light/awake hours), blue palette
- `ActivityTrack.tsx` — Recharts bar (daily steps + rolling avg), green palette
- `DiseaseTrack.tsx` — Recharts bar/line (tremor % + dyskinetic mins), orange palette
- `BaselineBand.tsx` — gray shaded reference area behind each track showing personal baseline range
- `AnomalyMarker.tsx` — clickable red/orange/yellow flag markers on timeline
- `AnomalyDetailPanel.tsx` — slide-out panel showing anomaly detail, AI assessment, alert generated
- `DailySummaryPopover.tsx` — click any day for daily summary, data quality, AI analysis

### Section 5: Clinician Alert Dashboard
- `ClinicianAlertDashboard.tsx` — container with tab toggle between views
- `TriageTeamView.tsx` — MA/RN view: all alerts sorted by severity, batch-escalate buttons
- `NeurologistView.tsx` — filtered: only escalated + Tier 1 auto-escalated alerts
- `AlertCard.tsx` — individual alert with severity color, timestamp, AI assessment, action buttons (Reviewed, Escalate to MD, Schedule Follow-up)
- `AutoDraftOrderPanel.tsx` — pre-drafted PT referral for Day 27 second fall, one-click "Sign and Send"

### Section 6: AI Analysis Log
- `AIAnalysisLog.tsx` — reasoning chain display: data examined → patterns found → decision → rationale

### Shared
- `DisclaimerBanner.tsx` — safety disclaimer per playbook Section 7.4
- `PatientNudgePreview.tsx` — preview of patient-facing messages (empathetic, grade 6, actionable)
- `SDNEBaselineOverlay.tsx` — blue diamond markers on timeline showing SDNE exam dates (mockup)

### Types
- `src/lib/wearable/types.ts` — all TypeScript interfaces matching the Supabase schema

## API Endpoints

### GET /api/wearable/demo-data
- No auth required
- Returns: patient record + 30 daily summaries + anomalies + alerts
- Source: Supabase queries

### POST /api/wearable/analyze
- No auth required
- Request: `{ patient_id, analysis_window_days, include_baseline_comparison }`
- Calls Claude API (claude-sonnet-4-5-20250929) with the system prompt from playbook Section 6.4
- Returns: structured JSON with anomalies, trends, narrative summary, reasoning chains
- Used for the "live AI analysis" demo moment in the AI Analysis Log

## Demo Data — Linda Martinez 30-Day Scenario

Per playbook Section 4.3:

| Days | Scenario | Key Metrics |
|------|----------|------------|
| 1-10 | Stable baseline | Steps ~5,500, Sleep 6.5-7h, HR 68, HRV 32ms, Tremor 12%, Dyskinetic 8min |
| 11 | Missed medication dose | Tremor → 38%, Dyskinetic → 45min, Steps → 3,200, HRV → 24ms |
| 12 | Resume medication | Tremor → 14%, Steps → 4,800 |
| 13-18 | Gradual worsening | Steps 5,200→3,600, Tremor 14%→28%, Dyskinetic 10→35min |
| 15 | AI detects 3-day decline | Orange alert: "Consider medication timing review" |
| 19 | Fall detected | HR spike to 112, Red urgent alert |
| 20 | Activity drop + fragmented sleep | Patient nudge sent |
| 21-25 | Partial recovery | Steps slowly increasing, tremor stabilizing |
| 27 | Second fall | Urgent: "2 falls in 9 days. PT referral, med review, home safety." Auto-draft PT order |
| 28-30 | New baseline establishing | Data continues |

## Seed Script

`scripts/seed-wearable-demo.ts` — generates all 4 tables of demo data with realistic physiological variation (not pure random). Uses sinusoidal patterns for circadian HR variation, random walk for day-to-day HRV, and manual overrides for the clinical events above. Run via `npx tsx scripts/seed-wearable-demo.ts`.

## AI Integration

- Model: Claude claude-sonnet-4-5-20250929 (good balance of speed and reasoning quality)
- System prompt: from playbook Section 6.4 (clinical monitoring AI, pattern detection + interpretation)
- Input: patient context + baseline metrics + 7-day daily summary window
- Output: structured JSON per playbook Section 6.4 output format
- Guardrails: no diagnosis, no medication recommendations, err on side of caution, grade 6 patient messages

## Key Visual Design Decisions

1. **Baseline bands** — gray shaded area behind each Recharts line showing the patient's personal normal range. Most important visual element per playbook.
2. **Anomaly markers** — red/orange/yellow circular markers overlaid on timeline at detected events
3. **Color palette** — HR: red, HRV: purple, Sleep: blue tones, Steps: green, Disease: orange (matches playbook Section 4.2)
4. **Alert severity** — Red (urgent), Orange (attention), Yellow (informational) — consistent across timeline markers and dashboard cards
5. **Homepage card** — Sky blue `#0EA5E9` accent, activity/watch icon, "Wearable Monitoring" title
6. **Inline styles** — matches project convention (Tailwind + inline styles, no CSS modules)

## What's NOT in Phase 1A

- No real wearable device connection
- No real-time data sync
- No patient SMS/push delivery
- No multi-patient view
- No HealthKit or Samsung SDK integration
- No ML inference models (Phase 2)
- SDNE overlay is mockup data only
