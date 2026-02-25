# Physician Workspace Card Breakout — Design Document

**Date:** 2026-02-25
**Status:** Approved
**Author:** Claude (brainstorming session)

## Summary

Break the single "Physician Workspace" homepage card into 3 separate cards in the Clinician track, each routing to a distinct physician tool: Dashboard, Schedule, and EHR.

## Motivation

The current homepage has one "Physician Workspace" card that drops the user directly into a clinical note editor for a single hardcoded patient. This skips the schedule entirely and buries the Command Center dashboard in a separate journey track. Physicians need clear, separated entry points for their three core workflows:

1. **Dashboard** — Morning briefing, action queue, patient priorities
2. **Schedule** — See today's patients, pick who to chart
3. **EHR** — Go directly into a patient's chart (for demos or quick access)

## Approach

**Approach A: Minimal Swap** — Replace the single Physician Workspace card with 3 cards in the existing Clinician track. Keep the 3-track homepage layout and all other cards unchanged.

## Routing Architecture

### Current

| Route | Component | Purpose |
|-------|-----------|---------|
| `/physician` | ClinicalNote | Chart editor (one hardcoded patient) |
| `/dashboard` | CommandCenterPage | Command Center (unchanged) |

### New

| Route | Component | Purpose |
|-------|-----------|---------|
| `/physician` | Schedule-first wrapper | AppointmentsDashboard with inline chart swap on patient click |
| `/ehr` | ClinicalNote | Direct-to-chart (random demo patient or `?patient=ID`) |
| `/dashboard` | CommandCenterPage | Command Center (unchanged) |

### Navigation Flow

```
Homepage → "My Schedule" card → /physician → AppointmentsDashboard
                                               ↓ click patient
                                             ClinicalNote (inline swap)
                                               ↓ back button
                                             AppointmentsDashboard

Homepage → "Clinical EHR" card → /ehr → ClinicalNote (random patient)

Homepage → "Clinician Dashboard" card → /dashboard → CommandCenterPage (unchanged)
```

## Homepage Card Changes

### Current Clinician Track (3 cards)

1. AI-Powered Triage → `/triage`
2. Physician Workspace → `/physician`
3. Digital Neurological Exam → `/sdne`

### New Clinician Track (5 cards)

1. AI-Powered Triage → `/triage` (unchanged)
2. **Clinician Dashboard** → `/dashboard` — "AI-powered command center with morning briefing, action queue, and patient priority list"
3. **My Schedule** → `/physician` — "Day, week, and month calendar views with appointment management and patient chart access"
4. **Clinical EHR** → `/ehr` — "Full clinical documentation with AI-assisted note creation, voice dictation, and clinical scales"
5. Digital Neurological Exam → `/sdne` (unchanged)

## `/physician` Page Redesign (Schedule-First)

### Landing State
- `AppointmentsDashboard` renders as main content (day/week/month views, filters, date navigation — all existing functionality)
- Wrapped in `PlatformShell` with `FeatureSubHeader` ("My Schedule" with calendar icon)

### Patient Selection
- Clicking a patient in any view (day table row, week card, month card) swaps from `AppointmentsDashboard` to `ClinicalNote` for that patient
- A "Back to Schedule" button appears in the header area
- Clicking back returns to the schedule at the same date/view the user left

### Implementation
- `/physician/page.tsx` server component fetches schedule data
- Client wrapper manages `viewMode` state (`'schedule' | 'chart'`) and selected patient ID
- When `viewMode === 'schedule'`: render `AppointmentsDashboard`
- When `viewMode === 'chart'`: fetch patient data, render `ClinicalNote`

## `/ehr` Route (Direct Chart Access)

### Landing State
- Server component picks a random demo patient (or specific one via `?patient=ID` query param)
- Renders `ClinicalNote` with that patient's data
- Wrapped in `PlatformShell` with `FeatureSubHeader` ("Clinical EHR" with clipboard icon)

### Implementation
- Essentially the current `/physician/page.tsx` logic moved to `/ehr/page.tsx`
- Added random patient selection when no patient is specified
- Supports `?patient=<id>` query parameter for direct linking from schedule or other features

## Files Changed

| File | Change |
|------|--------|
| `src/components/homepage/journeyData.ts` | Replace Physician Workspace card with 3 new cards |
| `src/app/physician/page.tsx` | Refactor to schedule-first with inline chart swap |
| `src/app/ehr/page.tsx` | New route — ClinicalNote with random/specified patient |
| `src/app/ehr/layout.tsx` | New layout — auth protection (copy from physician) |
| `/dashboard` | No changes |

## Out of Scope

- Homepage layout changes (stays 3-track)
- Other journey track card changes
- Cross-card data integration (Summary tab, pre-visit briefing)
- Dashboard redesign (separate effort, as discussed)
