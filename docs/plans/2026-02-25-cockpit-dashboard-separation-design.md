# Cockpit vs Dashboard Separation Design

**Date:** 2026-02-25
**Status:** Approved
**Approach:** Incremental Refactor (modify existing components in place)

## Problem

The Clinician Cockpit (`/physician`) and Command Center Dashboard (`/dashboard`) have overlapping features and unclear audience separation. Both pull from the same cross-card data sources (triage, follow-up, wearables, SDNE), but serve different users and purposes. The Morning Briefing lives on the Dashboard but is a clinician tool, not a practice manager tool.

## Core Principle

- **Clinician Cockpit** = the provider's personal workspace (my patients, my day, my briefing)
- **Operations Dashboard** = the practice-wide operational command layer (all providers, all patients, actionable metrics)

## Homepage Card Layout

### Current: 2 rows of 3 (6 cards)

- Top: AI Triage, My Schedule, Documentation
- Bottom: Command Center, Follow-Up Agent, Wearable

### New: Top 4 + Bottom 3 (7 cards)

**Top Row — Clinician Journey:**

| # | Card | Route | Description |
|---|------|-------|-------------|
| 1 | AI-Powered Triage | `/triage` | AI intake and triage |
| 2 | Clinician Cockpit | `/physician` | Morning briefing, schedule, notifications |
| 3 | Documentation | `/ehr` | Full EHR charting |
| 4 | Digital Neuro Exam | `/sdne` | Structured digital neuro exam |

**Bottom Row — Ongoing Care:**

| # | Card | Route | Description |
|---|------|-------|-------------|
| 1 | Operations Dashboard | `/dashboard` | Practice-wide metrics and action queue |
| 2 | AI Follow-Up Agent | `/post-visit` | Post-visit automated follow-up |
| 3 | Wearable Monitoring | `/wearable` | Continuous remote monitoring |

**Rationale:** Top row tells the story of a single patient encounter. Bottom row shows what runs across the practice in the background.

## Clinician Cockpit (`/physician`)

### Target Audience
Individual neurologist starting or managing their clinical day.

### Layout: 3 Columns

```
┌─────────────────┬──────────────────────┬─────────────────┐
│   Schedule       │   Morning Briefing   │  Notifications   │
│                 │                      │                 │
│ Today's patients │ AI-generated daily   │ Priority-sorted  │
│ w/ time, name,  │ briefing personalized│ notification     │
│ visit type,     │ to this provider's   │ cards            │
│ chief complaint │ patients & schedule  │                 │
│                 │                      │ Filter tabs:     │
│ Click patient → │ Collapsible sections:│ All / Urgent /   │
│ navigate to     │ • Key patients       │ Messages / Tasks │
│ /ehr?patient=ID │ • Pending actions    │                 │
│                 │ • Schedule highlights│ Badge counts     │
│ Clinic volume   │                      │                 │
│ summary at top  │ Show Reasoning toggle│                 │
│                 │ Regenerate button    │                 │
│                 │ Gradient border      │                 │
└─────────────────┴──────────────────────┴─────────────────┘
```

### Key Changes from Current
- **Center column:** Patient chart REMOVED, replaced with Morning Briefing (moved from Dashboard)
- **Patient charting:** Now exclusively at `/ehr` (Documentation). Clicking a patient in the schedule navigates there.
- **Briefing context:** Morning briefing before noon, afternoon summary after noon.
- **No inline chart:** The Cockpit is purely "overview of my day" — actual charting happens in Documentation.

### Briefing Content (Provider-Personal)
- Key patients to watch today (flagged by AI based on triage, wearable alerts, follow-up escalations)
- Pending actions for this provider (unsigned notes, refill requests, messages)
- Schedule highlights (new patients, urgent visits, telemedicine)
- Personalized to the logged-in provider's panel

## Operations Dashboard (`/dashboard`)

### Target Audience
Medical directors, practice administrators, supervising neurologists, triage teams.

### Layout: 5 Zones (unchanged structure)

**Zone 1 — Operational Summary (CHANGED from Morning Briefing):**
- Practice-wide operational summary (not clinician-personal)
- Content: staffing levels, average wait time, appointment backlog, clinic capacity, provider availability
- AI-generated with operations-focused prompt
- Keeps gradient border and glassmorphic card styling

**Zone 2 — Status Bar (unchanged):**
- 8 clickable metric tiles with trend arrows

**Zone 3 — Action Queue (unchanged):**
- Batch-approvable groups, confidence badges, approve/dismiss

**Zone 4 — Patient Queue (unchanged):**
- Urgency-sorted patient list with 3-level drill-down

**Zone 5 — Quick Access (updated):**
- Update pill links to reflect new card names (Clinician Cockpit, Documentation, etc.)

### Controls

**Role Toggle (RENAMED):**
- "My Patients / All Patients" → "By Provider" filter
- Allows filtering by specific clinician or showing all
- Default: All patients (practice manager perspective)

### Visual Identity (unchanged)
- Dark gradient background (#0F172A → #1E293B)
- Indigo accent, glassmorphic cards
- "Operations room" aesthetic

## Data Flow Summary

```
Cross-card data sources (triage, follow-up, wearables, SDNE)
    │
    ├── Cockpit: synthesized PER PATIENT for this provider
    │   (briefing shows "your 3 key patients today")
    │
    └── Dashboard: aggregated ACROSS ALL PATIENTS for the practice
        (action queue shows all pending refills across all providers)
```

## What Moves Where

| Feature | Currently | Moves To |
|---------|-----------|----------|
| Morning Briefing | Dashboard Zone 1 | Cockpit center column |
| Patient Chart (inline) | Cockpit center column | Removed (use /ehr) |
| Operational Summary | Does not exist | Dashboard Zone 1 (new) |
| Schedule card (homepage) | Own card | Merged into Cockpit card |
| Digital Neuro Exam | Not on homepage | New card in Clinician Journey row |
| Dashboard card | Clinician Journey row | Ongoing Care row |

## Implementation Approach

Incremental refactor of existing components:

1. Modify `PhysicianHome.tsx` — replace center column (patient chart) with Morning Briefing component
2. Move `MorningBriefing.tsx` from `command-center/` to shared location, adapt for personal context
3. Create new `OperationalSummary.tsx` for Dashboard Zone 1
4. Update `CommandCenterPage.tsx` — swap Zone 1 component, rename toggle
5. Update homepage card configuration — 4+3 layout with new names and routes
6. Update playbooks to reflect new card assignments and audiences
7. Update CLAUDE.md with new structure
