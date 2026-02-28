# Role-Based Operations Dashboards Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the single `/dashboard` page with three role-based pages: a landing page role chooser, an MA flow-board dashboard, and a Practice Manager metrics console.

**Architecture:** All data is demo/static (TypeScript constants, no DB or API calls). Shared types and demo data live in `src/lib/dashboard/`. Each dashboard is a standalone page under the existing `/dashboard` route using Next.js nested routes. Reusable components (`StatusTile`, `DisclaimerBanner`) are imported from `src/components/command-center/`; all new components go in `src/components/dashboard/`. The existing `CommandCenterPage` and its zone components are preserved unchanged (no deletions) since the old code may be referenced by other features.

**Tech Stack:** Next.js 15 App Router, TypeScript, inline styles (project convention), Lucide icons, Tailwind CSS for layout utilities only.

**Design doc:** `docs/plans/2026-02-25-role-based-dashboards-design.md`

---

## Task Sequence Overview

| # | Task | New Files | Modified Files |
|---|------|-----------|----------------|
| 1 | Shared types | 1 | 0 |
| 2 | Demo data: providers, sites, MAs | 1 | 0 |
| 3 | Demo data: 18 patients | 1 | 0 |
| 4 | Demo data: MA tasks | 1 | 0 |
| 5 | Demo data: Practice Manager metrics | 1 | 0 |
| 6 | Landing page (role chooser) | 1 | 1 |
| 7 | MA — Provider Status Strip | 2 | 0 |
| 8 | MA — Patient Flow Card | 1 | 0 |
| 9 | MA — Patient Detail Panel | 1 | 0 |
| 10 | MA — Timeline Row + Flow Board | 2 | 0 |
| 11 | MA — Task Card + Task Queue | 2 | 0 |
| 12 | MA — Dashboard page (orchestrator) | 2 | 0 |
| 13 | PM — Clinic Pulse (metrics bar) | 1 | 0 |
| 14 | PM — Provider Performance panel | 1 | 0 |
| 15 | PM — Staffing & Coverage panel | 1 | 0 |
| 16 | PM — Pending Actions Overview | 1 | 0 |
| 17 | PM — Alerts panel | 1 | 0 |
| 18 | PM — Activity Feed | 1 | 0 |
| 19 | PM — Quality Snapshot | 1 | 0 |
| 20 | PM — Site Comparison table | 1 | 0 |
| 21 | PM — Dashboard page (orchestrator) | 2 | 0 |
| 22 | Update homepage card description | 0 | 1 |
| 23 | Documentation updates | 0 | 4+ |
| 24 | Visual QA + commit | 0 | 0 |

---

## Task 1: Shared TypeScript Types

**Files:**
- Create: `src/lib/dashboard/types.ts`

**What to build:**

Define all the shared interfaces from the design doc. These types are used by both dashboards and the demo data files.

```typescript
// Provider, PatientScheduleItem, MATask, ClinicSite, VirtualMA
// Plus: FlowStage, VisitType, AIReadiness, TaskType, TaskPriority
// Plus PM-specific: PracticeMetrics, ProviderPerformance, QualityMetrics, ActivityEvent, OperationalAlert
```

Key types (copy from design doc Section "Shared Data Model"):
- `Provider` — id, name, credentials, specialty, status, current_patient_id, next_patient_time, stats
- `PatientScheduleItem` — id, name, age, sex, diagnosis, appointment details, flow_stage, ai_readiness, location
- `MATask` — id, type, patient_id, provider_id, priority, status, description, due_by
- `ClinicSite` — id, name, location, timezone, providers_today, patients_today, local_ma info, ehr_integration
- `VirtualMA` — id, name, assigned_provider_ids, role, active_task_count

Add Practice Manager types not in the design doc (derived from the metrics table):
- `PracticeMetrics` — patients_today (total/seen/remaining), utilization, avg_wait_time, no_shows, ai_prep_rate
- `ProviderPerformance` — provider_id, name, utilization_pct, seen, total, running_behind_minutes, status_note
- `QualityMetrics` — note_completion, note_ehr_paste, followup_completion, triage_turnaround (each with value, target, trend)
- `ActivityEvent` — time, event_type, description, patient_name, provider_name, site_name
- `OperationalAlert` — id, severity, title, description, related_provider/patient

Also export union types: `FlowStage`, `VisitType`, `TaskType`, `TaskPriority`, `ProviderStatus`, `EhrIntegration`.

**Step 1:** Create the file with all interfaces and union types.

**Step 2:** Run `npx tsc --noEmit` to verify no type errors.

**Step 3:** Commit: `feat(dashboard): add shared types for role-based dashboards`

---

## Task 2: Demo Data — Providers, Sites, Virtual MAs

**Files:**
- Create: `src/lib/dashboard/demoProviders.ts`

**What to build:**

Static arrays using the types from Task 1. Data comes directly from the design doc tables.

3 providers:
- Dr. Anita Chen (MD, General Neurology, available, 2 seen / 5 remaining)
- Dr. Raj Patel (DO, Headache/Epilepsy, in_visit, 2 seen / 5 remaining)
- Dr. Sofia Rivera (MD, MS/Neuroimmunology, in_visit +8 min behind, 2 seen / 4 remaining + 1 cancelled)

3 clinic sites:
- Riverview Neurology (Epic FHIR, local MA Jessica, 8 patients)
- Lakewood Medical (Cerner FHIR, local MA Andrea, 6 patients)
- Home Visits (no EHR, no local MA, 4 patients)

2 virtual MAs:
- Sarah (primary, Chen + Patel, 4 active tasks)
- Marcus (primary, Rivera + float, 3 active tasks)

**Step 1:** Create the file exporting `DEMO_PROVIDERS`, `DEMO_CLINIC_SITES`, `DEMO_VIRTUAL_MAS`.

**Step 2:** Run `npx tsc --noEmit` to verify.

**Step 3:** Commit: `feat(dashboard): add demo providers, sites, and virtual MAs`

---

## Task 3: Demo Data — 18 Morning Patients

**Files:**
- Create: `src/lib/dashboard/demoPatients.ts`

**What to build:**

A `DEMO_PATIENTS: PatientScheduleItem[]` array with all 18 patients from the design doc table, grouped by provider. Each patient has full `ai_readiness` and `flow_stage` set per the design doc snapshot at ~9:40 AM.

Key storytelling moments to preserve:
- Delgado: no-show, no AI prep, urgent GBS suspect
- Santos: home, video not connecting, historian sent but not completed
- Kim: gold standard — all AI ready, vitals done, ready for video
- Okonkwo: in_visit with Rivera, +8 min behind
- Rivera 8:30 slot: cancelled

Also export helper functions:
- `getPatientsByProvider(providerId: string)` — filter patients for a provider
- `getPatientsBySite(siteId: string)` — filter patients for a site

**Step 1:** Create the file with all 18 patients and helpers.

**Step 2:** Run `npx tsc --noEmit`.

**Step 3:** Commit: `feat(dashboard): add 18 demo patients with flow stages and AI readiness`

---

## Task 4: Demo Data — MA Tasks

**Files:**
- Create: `src/lib/dashboard/demoTasks.ts`

**What to build:**

A `DEMO_MA_TASKS: MATask[]` array. Tasks are derived from the patient situations in the design doc. Approximately 10-12 tasks covering the full range of task types.

Example tasks (derived from patient stories):
1. `send_historian_link` — Voss (Patel), routine, historian sent but not completed
2. `tech_help` — Santos (Chen), urgent, video not connecting for home visit
3. `call_patient` — Delgado (Chen), urgent, no-show for GBS suspect
4. `send_intake_form` — Price (Chen), time_sensitive, no pre-visit data
5. `post_visit_task` — Brown (Patel), routine, post-visit tasks pending
6. `prep_records` — Jennings (Chen), routine, new patient records from triage
7. `check_video` — Alvarez (Rivera), time_sensitive, home patient upcoming
8. `coordinate_local_ma` — Chen Dongyue (Rivera), routine, waiting for vitals confirmation
9. `send_historian_link` — Moore (Patel), time_sensitive, no pre-visit data
10. `send_historian_link` — Park (Rivera), time_sensitive, no pre-visit data

Also export: `getTasksByProvider(providerId)`, `getTasksByPriority()`.

**Step 1:** Create the file.

**Step 2:** Run `npx tsc --noEmit`.

**Step 3:** Commit: `feat(dashboard): add demo MA tasks derived from patient stories`

---

## Task 5: Demo Data — Practice Manager Metrics

**Files:**
- Create: `src/lib/dashboard/demoMetrics.ts`

**What to build:**

Static objects for Practice Manager dashboard. All values come from the "Practice Manager Metrics" table in the design doc.

Export:
- `DEMO_PRACTICE_METRICS: PracticeMetrics` — the 5 top-bar metrics
- `DEMO_PROVIDER_PERFORMANCE: ProviderPerformance[]` — 3 providers with utilization bars
- `DEMO_QUALITY_METRICS: QualityMetrics` — 4 quality metrics with progress values
- `DEMO_ACTIVITY_FEED: ActivityEvent[]` — ~12-15 chronological events (check-ins, visit starts/ends, note signatures, historian completions, no-shows) from 8:00 AM to 9:40 AM
- `DEMO_OPERATIONAL_ALERTS: OperationalAlert[]` — 3-4 alerts (Rivera behind, Delgado no-show, patients missing pre-visit data, Santos tech issue)

**Step 1:** Create the file.

**Step 2:** Run `npx tsc --noEmit`.

**Step 3:** Commit: `feat(dashboard): add practice manager demo metrics and activity feed`

---

## Task 6: Landing Page (Role Chooser)

**Files:**
- Create: `src/components/dashboard/RoleChooserPage.tsx`
- Modify: `src/app/dashboard/page.tsx` (replace current content)

**What to build:**

The `/dashboard` page becomes a role chooser with two glassmorphic cards on a dark gradient background. Uses the same dark theme as the current dashboard (`#0F172A → #1E293B`).

Layout:
- Dark gradient background, centered content
- Title: "Operations Dashboard" with subtitle "Choose your view"
- Two cards side by side (stacked on mobile):
  - **MA Dashboard** card: `Users` icon, description, teaser metric ("18 patients across 3 providers today" — computed from demo data), "Enter" button linking to `/dashboard/ma`
  - **Practice Manager** card: `BarChart3` icon, description, teaser metric ("87% utilization, 3 sites active" — from demo metrics), "Enter" button linking to `/dashboard/admin`
- `DisclaimerBanner` at bottom
- Cards use glassmorphic style: `background: rgba(30, 41, 59, 0.8)`, `backdropFilter: blur(12px)`, border `rgba(255,255,255,0.1)`, rounded corners

Modify `src/app/dashboard/page.tsx`:
- Replace `CommandCenterPage` import with `RoleChooserPage`
- Keep `PlatformShell` and `FeatureSubHeader` wrapper
- Update title to "Operations Dashboard"

**Step 1:** Create `RoleChooserPage.tsx` component.

**Step 2:** Update `page.tsx` to render the new component.

**Step 3:** Run dev server, verify the page renders at `/dashboard` with two cards that link correctly.

**Step 4:** Commit: `feat(dashboard): add role chooser landing page at /dashboard`

---

## Task 7: MA — Provider Status Strip

**Files:**
- Create: `src/components/dashboard/ma/ProviderCard.tsx`
- Create: `src/components/dashboard/ma/ProviderStatusStrip.tsx`

**What to build:**

**ProviderCard:** A single provider card showing:
- Name + credentials ("Dr. Anita Chen, MD")
- Status dot: green (available), red (in_visit), yellow (behind), gray (offline)
- Current/next patient text
- "2 seen / 5 remaining" count
- If running behind: "+8 min" badge in red
- Click handler: calls `onProviderSelect(providerId)` for filtering
- Selected state: teal left border or subtle highlight

Style: Light theme — white card, subtle border, clean typography. Not glassmorphic.

**ProviderStatusStrip:** Horizontal row of 3 `ProviderCard` components.
- Props: `providers: Provider[]`, `selectedProviderId: string | null`, `onProviderSelect: (id: string | null) => void`
- Sticky at top of the MA dashboard
- Clicking already-selected provider deselects (sets to null = show all)

**Step 1:** Build `ProviderCard`.

**Step 2:** Build `ProviderStatusStrip`.

**Step 3:** Verify types compile: `npx tsc --noEmit`.

**Step 4:** Commit: `feat(dashboard/ma): add provider status strip with selectable cards`

---

## Task 8: MA — Patient Flow Card

**Files:**
- Create: `src/components/dashboard/ma/PatientFlowCard.tsx`

**What to build:**

A compact card representing one patient in the flow board timeline. Approximately 120px wide, 80px tall.

Contents:
- Patient name (truncated if long)
- Visit type badge: "New" (indigo), "F-U" (slate), "Urgent" (red) — small pill
- Location icon: building (clinic) or home icon
- AI readiness dots: 3 small circles — green check if done, hollow circle if not
  - Historian (H), SDNE (S), Chart Prep (P)
- Alert flag icon if any MA task is urgent for this patient

Visual encoding for flow stage (card background/border):
- `completed`: green left border, muted background
- `in_visit`: teal left border, white background (active)
- `ready_for_video` / `vitals_done` / `checked_in`: amber left border, light yellow hint
- `not_arrived`: dashed border, light gray
- `no_show`: red left border, red-tinted background
- `cancelled`: strikethrough text, gray

Props: `patient: PatientScheduleItem`, `isExpanded: boolean`, `onClick: () => void`

**Step 1:** Build the component with all visual states.

**Step 2:** Verify types: `npx tsc --noEmit`.

**Step 3:** Commit: `feat(dashboard/ma): add patient flow card with stage-based visual encoding`

---

## Task 9: MA — Patient Detail Panel

**Files:**
- Create: `src/components/dashboard/ma/PatientDetailPanel.tsx`

**What to build:**

An expandable inline detail panel shown below a `PatientFlowCard` when clicked. Shows full patient context for the MA.

Sections:
1. **Header**: Patient name, age/sex, chief complaint, provider, appointment time
2. **Location**: Clinic name + room or "Home Visit", video link status
3. **AI Readiness checklist**:
   - Historian: status badge (not_sent / sent / completed / imported)
   - SDNE: status badge (not_applicable / pending / completed)
   - Chart Prep: status badge (not_started / in_progress / ready)
4. **Flow Status**: Horizontal steps showing all stages, current one highlighted
5. **Quick Actions**: Row of buttons — "Send Historian Link", "Call Patient", "Check Video", "Open Chart"
   - Buttons are visual only (no real actions in demo) — show toast on click

Props: `patient: PatientScheduleItem`, `tasks: MATask[]` (filtered for this patient), `onClose: () => void`

Style: White card with subtle shadow, appears as an expansion below the flow card row.

**Step 1:** Build the component.

**Step 2:** Verify types: `npx tsc --noEmit`.

**Step 3:** Commit: `feat(dashboard/ma): add patient detail panel with AI readiness and quick actions`

---

## Task 10: MA — Timeline Row + Flow Board

**Files:**
- Create: `src/components/dashboard/ma/TimelineRow.tsx`
- Create: `src/components/dashboard/ma/PatientFlowBoard.tsx`

**What to build:**

**TimelineRow:** One horizontal row representing a single provider's morning schedule.
- Left label: Provider name + status dot
- Time axis: tick marks at 30-min intervals (8:00, 8:30, 9:00... 11:30)
- Patient cards positioned at their appointment time slots
- A "now" indicator line (vertical red dashed line at ~9:40 AM)
- Empty slots shown as light dashed outlines
- Cancelled slot shown with "Cancelled" text

Props: `provider: Provider`, `patients: PatientScheduleItem[]`, `expandedPatientId: string | null`, `onPatientClick: (id: string) => void`, `block: 'morning' | 'afternoon'`

**PatientFlowBoard:** Container for all timeline rows.
- Renders one `TimelineRow` per provider (filtered by `selectedProviderId` if set)
- Time header row with tick marks
- Block toggle: "Morning (8-12)" / "Afternoon (1-5)" — only morning has data for demo
- Horizontal scroll on smaller screens
- Manages `expandedPatientId` state — when a flow card is clicked, the detail panel slides open below that row

Props: `providers: Provider[]`, `patients: PatientScheduleItem[]`, `tasks: MATask[]`, `selectedProviderId: string | null`, `block: 'morning' | 'afternoon'`, `onBlockChange: (block) => void`

**Step 1:** Build `TimelineRow`.

**Step 2:** Build `PatientFlowBoard` wrapping rows with time header and block toggle.

**Step 3:** Verify types: `npx tsc --noEmit`.

**Step 4:** Commit: `feat(dashboard/ma): add timeline rows and patient flow board`

---

## Task 11: MA — Task Card + Task Queue

**Files:**
- Create: `src/components/dashboard/ma/MATaskCard.tsx`
- Create: `src/components/dashboard/ma/MATaskQueue.tsx`

**What to build:**

**MATaskCard:** Single task in the queue.
- Type icon (mapped from task type — phone, mail, clipboard, etc.)
- Patient name + provider name
- Task description
- Priority badge: Urgent (red), Time-Sensitive (amber), Routine (slate)
- Due-by time if set
- "Complete" button (visual only — toggles to completed state with checkmark)

**MATaskQueue:** Bottom panel, collapsible.
- Header: "Task Queue" with count badge and collapse toggle
- Filter tabs: "All" / "By Provider" dropdown / "By Type" dropdown
- Tasks sorted: Urgent first, then Time-Sensitive, then Routine
- Routine tasks collapsed by default (expandable "Show N routine tasks")
- Respects `selectedProviderId` from the status strip filter

Props for `MATaskQueue`: `tasks: MATask[]`, `providers: Provider[]`, `selectedProviderId: string | null`

**Step 1:** Build `MATaskCard`.

**Step 2:** Build `MATaskQueue` with filtering and collapsing.

**Step 3:** Verify types: `npx tsc --noEmit`.

**Step 4:** Commit: `feat(dashboard/ma): add task queue with priority sorting and filtering`

---

## Task 12: MA Dashboard Page (Orchestrator)

**Files:**
- Create: `src/components/dashboard/ma/MADashboardPage.tsx`
- Create: `src/app/dashboard/ma/page.tsx`

**What to build:**

**MADashboardPage:** Orchestrator component wiring all MA sub-components together.
- State: `selectedProviderId`, `block` (morning/afternoon), `expandedPatientId`
- Layout (top to bottom):
  1. `ProviderStatusStrip` (sticky)
  2. `PatientFlowBoard` (main content, scrollable)
  3. `MATaskQueue` (bottom, collapsible)
  4. `DisclaimerBanner`
- Background: light clinical — `#F8FAFC`
- Max width: 1400px, centered

**page.tsx:** Next.js page file.
- Wraps `MADashboardPage` in `PlatformShell` + `FeatureSubHeader`
- FeatureSubHeader: title "MA Dashboard", icon `Users`, accent color `#0D9488` (teal), homeLink `/dashboard`

**Step 1:** Build `MADashboardPage` wiring all components with state.

**Step 2:** Create `src/app/dashboard/ma/page.tsx`.

**Step 3:** Run dev server, navigate to `/dashboard/ma`, verify:
- Provider strip shows 3 providers with correct statuses
- Flow board shows patients at correct time slots with visual encoding
- Clicking a patient expands detail panel
- Task queue shows prioritized tasks
- Provider click filters both board and queue
- Block toggle works (afternoon shows empty state)

**Step 4:** Commit: `feat(dashboard/ma): add MA dashboard page with flow board and task queue`

---

## Task 13: PM — Clinic Pulse (Top Metrics Bar)

**Files:**
- Create: `src/components/dashboard/admin/ClinicPulse.tsx`

**What to build:**

Horizontal row of 5 metric tiles across the top, reusing the `StatusTile` component from `src/components/command-center/StatusTile.tsx` (it's already dark-themed).

5 tiles from the design doc:
1. **Patients Today**: 42 total, "28 seen, 14 remaining", no trend
2. **Utilization**: 87%, "↑ 4% vs last week", trend up
3. **Avg Wait Time**: 8 min, "↓ 2 min improved", trend down (green = good)
4. **No-Shows**: 3, "7% rate", no trend
5. **AI Prep Rate**: 71%, "↑ 12% vs last week", trend up

Note: `StatusTile`'s trend colors assume up=red, down=green. For utilization and AI prep, up is good. Either swap colors in context or add a `trendPositive` prop. Simplest: just use the existing tile and accept that up-arrow is red (it still shows the trend direction correctly; the color nuance is minor for a demo).

Layout: CSS grid, 5 columns on desktop, wrapping on mobile.

**Step 1:** Build `ClinicPulse` using `StatusTile`.

**Step 2:** Verify types: `npx tsc --noEmit`.

**Step 3:** Commit: `feat(dashboard/admin): add clinic pulse metrics bar`

---

## Task 14: PM — Provider Performance Panel

**Files:**
- Create: `src/components/dashboard/admin/ProviderPerformancePanel.tsx`

**What to build:**

A dark glassmorphic card showing a row per provider:
- Provider name + credentials
- Utilization bar (horizontal, colored fill — green >80%, amber 60-80%, red <60%)
- "Seen / Total" text
- Status note (e.g., "On schedule", "Running +8 min behind" in red)
- If running behind: subtle red indicator

Data from `DEMO_PROVIDER_PERFORMANCE`.

Style: Dark card (`rgba(30,41,59,0.6)`), backdrop blur, border `rgba(255,255,255,0.1)`.

**Step 1:** Build the panel.

**Step 2:** Verify types: `npx tsc --noEmit`.

**Step 3:** Commit: `feat(dashboard/admin): add provider performance panel`

---

## Task 15: PM — Staffing & Coverage Panel

**Files:**
- Create: `src/components/dashboard/admin/StaffingPanel.tsx`

**What to build:**

Dark glassmorphic card with two sub-sections:

**Virtual MA Assignments:**
- Row per MA: name, role badge (primary/float), assigned providers list, active task count
- Data from `DEMO_VIRTUAL_MAS`

**Clinic Sites:**
- Row per site: name, local MA name (or "N/A"), patient count, EHR badge (Epic/Cerner/None)
- Data from `DEMO_CLINIC_SITES`

**Home Visits group:** count + "covered by virtual MA"

**Step 1:** Build the panel.

**Step 2:** Verify types: `npx tsc --noEmit`.

**Step 3:** Commit: `feat(dashboard/admin): add staffing and coverage panel`

---

## Task 16: PM — Pending Actions Overview

**Files:**
- Create: `src/components/dashboard/admin/PendingActionsOverview.tsx`

**What to build:**

Dark glassmorphic card with aggregate action counts by type. These counts can be derived from the existing `DEMO_ACTIONS` in `src/lib/command-center/demoActions.ts` or from a new small summary constant.

Show:
- Refills: count
- Messages: count
- Results/Orders: count
- Prior Auths: count
- Care Gaps: count
- Total pending with "View Action Queue →" link to `/dashboard/ma` (since MA handles actions)

Each row: icon, label, count, subtle bar proportional to total.

**Step 1:** Build the panel.

**Step 2:** Verify types: `npx tsc --noEmit`.

**Step 3:** Commit: `feat(dashboard/admin): add pending actions overview panel`

---

## Task 17: PM — Alerts Panel

**Files:**
- Create: `src/components/dashboard/admin/AlertsPanel.tsx`

**What to build:**

Dark glassmorphic card showing 3-4 operational alerts from `DEMO_OPERATIONAL_ALERTS`.

Each alert:
- Severity badge: red (critical), amber (warning), blue (info)
- Title + description
- Related provider/patient names
- Timestamp

Example alerts:
1. Critical: "No-show: Carlos Delgado (GBS suspect)" — urgent safety concern
2. Warning: "Dr. Rivera running +8 min behind" — schedule impact
3. Warning: "3 patients missing pre-visit data" — AI prep gap
4. Info: "Maria Santos — video connection issue" — tech support needed

**Step 1:** Build the panel.

**Step 2:** Verify types: `npx tsc --noEmit`.

**Step 3:** Commit: `feat(dashboard/admin): add operational alerts panel`

---

## Task 18: PM — Activity Feed

**Files:**
- Create: `src/components/dashboard/admin/ActivityFeed.tsx`

**What to build:**

Dark glassmorphic card with a chronological event log. Scrollable, most recent at top.

Each event entry:
- Time (e.g., "9:35 AM")
- Event type icon (check-in, visit start/end, note signed, historian done, no-show)
- Description (e.g., "James Okonkwo checked in at Riverview")
- Provider + site context

Data from `DEMO_ACTIVITY_FEED`. ~12-15 events from 8:00 to 9:40 AM covering the full morning story.

Max height with scroll, "Show all" toggle if more than 8 visible.

**Step 1:** Build the panel.

**Step 2:** Verify types: `npx tsc --noEmit`.

**Step 3:** Commit: `feat(dashboard/admin): add activity feed panel`

---

## Task 19: PM — Quality Snapshot

**Files:**
- Create: `src/components/dashboard/admin/QualitySnapshot.tsx`

**What to build:**

Dark glassmorphic card with 4 quality metrics, each shown as a label + progress bar + percentage.

From the design doc:
1. Note Completion: 85% (6/7 signed)
2. Note → EHR Paste Rate: 71% (5/7 pasted) — critical teleneurology metric
3. Follow-Up Completion: 90%
4. Triage Turnaround: 42 min vs 60 min target — shown as "42/60 min" with green (under target)

Progress bar colors: green if >= target, amber if close, red if below.

**Step 1:** Build the panel.

**Step 2:** Verify types: `npx tsc --noEmit`.

**Step 3:** Commit: `feat(dashboard/admin): add quality snapshot panel`

---

## Task 20: PM — Site Comparison Table

**Files:**
- Create: `src/components/dashboard/admin/SiteComparison.tsx`

**What to build:**

Dark glassmorphic card, collapsible (collapsed by default). Shows a table comparing clinic sites.

Columns: Site Name | Patients | Utilization % | Avg Wait | AI Prep Rate
Rows: Riverview, Lakewood, Home Visits
Totals row at bottom (bold)

Data derived from `DEMO_CLINIC_SITES` + per-site patient counts.

Collapse toggle: "Site Comparison" header with chevron.

**Step 1:** Build the panel.

**Step 2:** Verify types: `npx tsc --noEmit`.

**Step 3:** Commit: `feat(dashboard/admin): add site comparison table`

---

## Task 21: PM Dashboard Page (Orchestrator)

**Files:**
- Create: `src/components/dashboard/admin/AdminDashboardPage.tsx`
- Create: `src/app/dashboard/admin/page.tsx`

**What to build:**

**AdminDashboardPage:** Orchestrator wiring all PM sub-components.

Layout (per design doc 4-zone structure):
1. **Zone 1** (top): `ClinicPulse` — full width metrics bar
2. **Zone 2** (left column): `ProviderPerformancePanel`, `StaffingPanel`, `PendingActionsOverview` — stacked
3. **Zone 3** (right column): `AlertsPanel`, `ActivityFeed`, `QualitySnapshot` — stacked
4. **Zone 4** (bottom): `SiteComparison` — full width, collapsible
5. `DisclaimerBanner` at bottom

Two-column layout for zones 2+3 on desktop (CSS grid: `1fr 1fr`), single column on mobile.

Controls at top-right:
- Site selector dropdown: "All Sites" / individual sites (filter is visual only for demo)
- "Last updated: 9:40 AM" timestamp + refresh icon (refresh does nothing in demo, just resets timestamp)

Background: dark gradient `#0F172A → #1E293B` (same as current dashboard).

**page.tsx:** Next.js page.
- Wraps `AdminDashboardPage` in `PlatformShell` + `FeatureSubHeader`
- FeatureSubHeader: title "Practice Manager Dashboard", icon `BarChart3`, accent color `#4F46E5` (indigo), homeLink `/dashboard`

**Step 1:** Build `AdminDashboardPage` with grid layout.

**Step 2:** Create `src/app/dashboard/admin/page.tsx`.

**Step 3:** Run dev server, navigate to `/dashboard/admin`, verify:
- Clinic pulse shows 5 metric tiles
- Two-column layout renders correctly
- All panels display with correct demo data
- Site comparison is collapsed by default, expands on click
- Dark theme is consistent throughout

**Step 4:** Commit: `feat(dashboard/admin): add practice manager dashboard page`

---

## Task 22: Update Homepage Card Description

**Files:**
- Modify: `src/components/homepage/journeyData.ts`

**What to build:**

Update the Operations Dashboard card description to reflect the new role-based landing page.

Find the card with `route: '/dashboard'` and update:
- `description` to mention role-based views (MA flow board + Practice Manager metrics)
- Keep `route: '/dashboard'` — it now goes to the role chooser

**Step 1:** Read the file, find the card, update the description text.

**Step 2:** Verify the homepage renders correctly.

**Step 3:** Commit: `docs(homepage): update Operations Dashboard card description for role-based views`

---

## Task 23: Documentation Updates

**Files to update:**
- `CLAUDE.md` — Update Section 14 (Command Center Revamp) to describe role-based dashboards, add to Recent Changes
- `docs/IMPLEMENTATION_STATUS.md` — Mark role-based dashboards as COMPLETE
- `docs/CONSOLIDATED_ROADMAP.md` — Update status
- `playbooks/02_clinician_command_center.md` — Update to reflect the 3-page dashboard structure (landing, MA, PM)

**What to update in CLAUDE.md:**
- Section 14 currently says "Command Center Revamp". Update to describe the role-based split: landing page, MA Dashboard (3-zone: provider strip, flow board, task queue), Practice Manager Dashboard (4-zone: pulse, left/right columns, site comparison).
- Add file paths for new components under Project Structure.
- Add to Recent Changes section.

**Step 1:** Update each file.

**Step 2:** Verify no broken references.

**Step 3:** Commit: `docs: update documentation for role-based dashboard implementation`

---

## Task 24: Visual QA + Final Commit

**What to do:**

Run the dev server and verify all three pages end-to-end:

1. `/dashboard` — Role chooser renders, both cards link correctly
2. `/dashboard/ma` — Full MA flow board with provider strip, timeline, task queue
3. `/dashboard/admin` — Full PM console with metrics, panels, activity feed
4. Homepage card at `/` links to `/dashboard` correctly
5. Mobile responsive: check all three pages at 375px width
6. No console errors or TypeScript warnings

Fix any issues found.

**Final commit** (if needed): `fix: visual polish for role-based dashboards`

---

## File Summary

### New files (by directory):

```
src/lib/dashboard/
  types.ts
  demoProviders.ts
  demoPatients.ts
  demoTasks.ts
  demoMetrics.ts

src/components/dashboard/
  RoleChooserPage.tsx
  ma/
    ProviderCard.tsx
    ProviderStatusStrip.tsx
    PatientFlowCard.tsx
    PatientDetailPanel.tsx
    TimelineRow.tsx
    PatientFlowBoard.tsx
    MATaskCard.tsx
    MATaskQueue.tsx
    MADashboardPage.tsx
  admin/
    ClinicPulse.tsx
    ProviderPerformancePanel.tsx
    StaffingPanel.tsx
    PendingActionsOverview.tsx
    AlertsPanel.tsx
    ActivityFeed.tsx
    QualitySnapshot.tsx
    SiteComparison.tsx
    AdminDashboardPage.tsx

src/app/dashboard/
  page.tsx (modified)
  ma/
    page.tsx (new)
  admin/
    page.tsx (new)
```

### Modified files:
- `src/app/dashboard/page.tsx` — swap to role chooser
- `src/components/homepage/journeyData.ts` — update card description
- `CLAUDE.md` — update Section 14 + Recent Changes
- `docs/IMPLEMENTATION_STATUS.md`
- `docs/CONSOLIDATED_ROADMAP.md`
- `playbooks/02_clinician_command_center.md`

### Preserved (not deleted):
- All files in `src/components/command-center/` — existing code untouched
- `src/lib/command-center/` — existing types and demo data untouched
