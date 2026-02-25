# Wearable Monitoring Page — Live Data Update

**Date**: 2026-02-25
**Status**: Approved
**Scope**: Update the wearable monitoring page to reflect real Apple Watch data flowing from the Sevaro Monitor iOS app

## Context

The Sevaro Monitor iOS companion app is now live on device, collecting real Apple Watch data (HR, HRV, steps, SpO2, sleep, tremor) via HealthKit and syncing daily summaries to Supabase. The wearable monitoring page needs to reflect this real integration rather than showing only demo/seeded data.

## Changes

### 1. Patient Switcher

Add a dropdown at the top of the page (below the "Wearable Monitoring" header bar) that allows toggling between patients.

- **API change**: `/api/wearable/demo-data` accepts optional `patient_id` query param. If provided, fetches that patient's data; otherwise defaults to Linda (demo).
- **Switcher UI**: Shows each patient's name, diagnosis, and a **Live** or **Demo** badge.
- **Page badge**: The "Demo" badge in the header changes to **"Live"** when viewing a real patient.

### 2. Data Sources Update

- **Apple Watch card**: Badge changes from "Planned" (orange) to **"Live Integration"** (green). Add subtitle: "via Sevaro Monitor iOS app".
- **Data path visualization**: Below the device cards, add a horizontal flow diagram: `Apple Watch -> HealthKit -> Sevaro Monitor (iPhone) -> Supabase -> AI Engine`. Each node has an icon and one-line description.
- **Samsung Galaxy Watch**: Stays as "Live Integration" for demo context. When viewing the real patient, the active device indicator highlights Apple Watch instead.

### 3. Hero Section — Architecture Diagram

- **Keep** the existing 3-step summary (Wearable Device -> AI Analysis -> Clinical Alerts).
- **Add below**: A detailed 5-node architecture pipeline in a subtle card:
  - Apple Watch (HR, HRV, Sleep, Steps, SpO2)
  - HealthKit (iOS health data store)
  - Sevaro Monitor iOS (collects & syncs daily)
  - Supabase Cloud (stores summaries & baselines)
  - AI Analysis + Alerts (pattern detection & routing)

### 4. Real Data Display

When viewing a real patient:
- PatientTimeline, metrics grid, and other components render actual Supabase data.
- Empty sections (no anomalies/alerts yet) show "No data yet" gracefully.
- Sleep = 0 is fine (reflects actual Apple Watch sleep tracking state).

### 5. Not In Scope (This Update)

- AI analysis triggering (Run Analysis button) — future work
- Real-time WebSocket updates — future work
- Samsung Galaxy Watch live integration — demo only
- Oura Ring integration — future

## Files to Modify

1. `/src/app/api/wearable/demo-data/route.ts` — accept patient_id param, query any patient
2. `/src/app/wearable/page.tsx` — add patient switcher, pass selected patient to components
3. `/src/components/wearable/ConceptHero.tsx` — add architecture diagram below 3-step flow
4. `/src/components/wearable/DataSourceCards.tsx` — update Apple Watch to Live, add data path flow
5. Various child components — handle empty data gracefully ("No data yet")
