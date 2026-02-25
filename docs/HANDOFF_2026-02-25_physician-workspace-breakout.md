# Sevaro Clinical Handoff — February 25, 2026 (Physician Workspace Card Breakout)

## Audience
Next Claude session or developer. User wants to redesign the Clinician Dashboard next.

## Current State
- **Build/Deploy status**: Production is live and clean — all PRs merged (#39, #40, #41, #42)
- **Branch**: `main` at commit `888894a`
- **Live URL**: https://ops-amplehtml.vercel.app/
- **Uncommitted changes**: Documentation-only updates (CLAUDE.md, CHANGELOG.md, design docs, playbooks) — need to be committed

## Work Completed

### Physician Workspace Card Breakout
Replaced the single "Physician Workspace" homepage card with 3 distinct entry points in the Clinician Journey track:

| Card | Route | Behavior |
|------|-------|----------|
| **Clinician Dashboard** | `/dashboard` | Command Center (5-zone AI dashboard, unchanged) |
| **My Schedule** | `/physician` | Lands on calendar view (`initialViewMode="appointments"`), click patient for inline chart swap |
| **Documentation** | `/ehr` | Lands on random sample patient chart (`initialViewMode="chart"`), supports `?patient=ID` |

### Key Implementation Details
- **Server→Client serialization fix**: Lucide icons can't pass from Server Components to Client Components as props. Created dedicated client wrapper components that import icons within the `'use client'` boundary.
- **Ongoing Care track**: Removed duplicate Command Center card (now 2 cards: Follow-Up Agent + Wearable Monitoring)
- **Naming evolution**: Started as "Clinical EHR" → renamed to "Documentation" since the entire platform is an EHR

| File | Change |
|------|--------|
| `src/components/homepage/journeyData.ts` | 3 new cards replacing 1; removed Command Center from Ongoing Care |
| `src/components/EhrPageWrapper.tsx` | New client wrapper — title "Documentation", `initialViewMode="chart"` |
| `src/components/PhysicianPageWrapper.tsx` | New client wrapper — title "My Schedule", `initialViewMode="appointments"` |
| `src/app/ehr/page.tsx` | New route — random patient or `?patient=ID` |
| `src/app/ehr/layout.tsx` | Auth guard (copied from physician) |
| `src/app/physician/page.tsx` | Refactored to schedule-first via wrapper |
| `src/components/ClinicalNote.tsx` | Added `initialViewMode` prop to control landing view |
| `src/lib/dashboardData.ts` | `fetchDashboardData(patientId?)` — optional param, random selection fallback |

## What Was NOT Done
- **Dashboard redesign** — User explicitly deferred to next session. Wants to clarify "Clinical Cockpit vs Clinician Dashboard" — currently the cockpit view (3-column: schedule + notifications + provider comm) exists inside ClinicalNote as `viewMode="cockpit"`, while the Command Center (`/dashboard`) is the 5-zone AI dashboard. These need to be reconciled or clearly differentiated.
- **Playbook updates for card breakout** — Playbooks have unrelated pending changes from other sessions mixed in with the uncommitted files

## Known Risks / Watch Items
1. **Cockpit vs Dashboard confusion**: `ClinicalNote` has a `viewMode="cockpit"` (3-column PhysicianHome view) that's distinct from `/dashboard` (CommandCenterPage). The user flagged this needs clarification — which is the "real" dashboard? Should cockpit be removed, merged, or kept as a separate view?
2. **Random patient on /ehr**: Each page load picks a different random patient. This is intentional for demos but could confuse users expecting consistency.
3. **Uncommitted doc changes**: CLAUDE.md, CHANGELOG.md, design docs, and playbooks have updates staged locally but not committed.

## Required Next Steps
1. **Commit documentation updates** — The CLAUDE.md, CHANGELOG, and design doc updates from this session need to be committed
2. **Dashboard redesign session** — Clarify Clinical Cockpit vs Clinician Dashboard, decide on consolidation/differentiation, and redesign accordingly
3. **Verify production** — Confirm all 5 Clinician Journey cards render correctly and route to the right destinations

## Files to Review First (for Dashboard Redesign)
- `src/components/ClinicalNote.tsx` — Contains `viewMode` state machine (`'cockpit' | 'appointments' | 'chart'`)
- `src/components/PhysicianHome.tsx` — The "Clinical Cockpit" 3-column layout
- `src/components/home/` — Schedule, Notification, ProviderComm columns
- `src/components/command-center/CommandCenterPage.tsx` — The 5-zone Command Center
- `docs/plans/2026-02-24-clinical-cockpit-design.md` — Original cockpit design doc
- `docs/plans/2026-02-25-command-center-revamp-design.md` — Command Center revamp design
- `playbooks/02_clinician_command_center.md` — Command Center playbook
