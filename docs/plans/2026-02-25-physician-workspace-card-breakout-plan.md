# Physician Workspace Card Breakout — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Break the single Physician Workspace homepage card into 3 cards (Dashboard, Schedule, EHR) with proper routing.

**Architecture:** Replace one card in `journeyData.ts` with three. Refactor `/physician` to be schedule-first (render `AppointmentsDashboard`, swap to `ClinicalNote` on patient click). Create new `/ehr` route for direct chart access with random patient selection. `/dashboard` is unchanged.

**Tech Stack:** Next.js 15 App Router, TypeScript, React, Supabase, Tailwind CSS

**Design doc:** `docs/plans/2026-02-25-physician-workspace-card-breakout-design.md`

---

### Task 1: Update homepage journey cards

**Files:**
- Modify: `src/components/homepage/journeyData.ts`

**Step 1: Replace the Physician Workspace card with 3 new cards**

In `journeyData.ts`, add the `Stethoscope` and `ClipboardCheck` imports from lucide-react (keep existing `CalendarClock` and `LayoutDashboard`). Replace the single Physician Workspace card object in `clinicianTrack.cards` with these three entries between Triage and SDNE:

```typescript
{
  phase: 'Command Center',
  name: 'Clinician Dashboard',
  route: '/dashboard',
  icon: LayoutDashboard,
  status: 'live',
  description: 'AI-powered command center with morning briefing, action queue, and patient priority list.',
},
{
  phase: 'Schedule',
  name: 'My Schedule',
  route: '/physician',
  icon: CalendarClock,
  status: 'live',
  description: 'Day, week, and month calendar views with appointment management and patient chart access.',
},
{
  phase: 'Chart & Document',
  name: 'Clinical EHR',
  route: '/ehr',
  icon: Stethoscope,
  status: 'live',
  description: 'Full clinical documentation with AI-assisted note creation, voice dictation, and clinical scales.',
},
```

**Step 2: Remove the duplicate Command Center card from ongoingCareTrack**

Since the Dashboard card now lives in the Clinician track, remove the "Command Center" card from `ongoingCareTrack.cards` (the third entry with `route: '/dashboard'`). The Ongoing Care track will then have 2 cards: AI Follow-Up Agent and Wearable Monitoring.

**Step 3: Verify the homepage renders correctly**

Run `npm run dev` and visit `http://localhost:3000`. Confirm:
- Clinician track shows 5 cards: Triage, Dashboard, Schedule, EHR, SDNE
- Ongoing Care track shows 2 cards: Follow-Up, Wearable
- All card links point to correct routes
- No console errors

**Step 4: Commit**

```bash
git add src/components/homepage/journeyData.ts
git commit -m "feat: break physician workspace into 3 homepage cards (Dashboard, Schedule, EHR)"
```

---

### Task 2: Create `/ehr` route for direct chart access

**Files:**
- Create: `src/app/ehr/layout.tsx`
- Create: `src/app/ehr/page.tsx`
- Modify: `src/lib/dashboardData.ts` (add `patientId` parameter)

**Step 1: Add optional `patientId` parameter to `fetchDashboardData`**

In `src/lib/dashboardData.ts`, change the function signature to accept an optional patient ID:

```typescript
export async function fetchDashboardData(patientId?: string) {
```

Then modify the patient fetch query. Replace the current `.limit(1).single()` call with logic that:
- If `patientId` is provided: fetch that specific patient by ID
- If no `patientId`: fetch all patients, then pick one at random using `Math.floor(Math.random() * patients.length)`

The rest of the function stays the same — it uses `patients?.id` for subsequent queries.

**Step 2: Create the auth layout**

Create `src/app/ehr/layout.tsx` — identical to `src/app/physician/layout.tsx`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function EhrLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return <>{children}</>
}
```

**Step 3: Create the EHR page**

Create `src/app/ehr/page.tsx`. This is the current `/physician/page.tsx` with two changes:
1. Read `?patient=ID` from searchParams
2. Pass that ID to `fetchDashboardData(patientId)`
3. Wrap in `PlatformShell` + `FeatureSubHeader` with title "Clinical EHR", Stethoscope icon, teal accent color `#0D9488`

```typescript
import ClinicalNote from '@/components/ClinicalNote'
import PlatformShell from '@/components/layout/PlatformShell'
import FeatureSubHeader from '@/components/layout/FeatureSubHeader'
import { Stethoscope } from 'lucide-react'
import { fetchDashboardData } from '@/lib/dashboardData'

export const dynamic = 'force-dynamic'

export default async function EhrPage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string }>
}) {
  const params = await searchParams
  const data = await fetchDashboardData(params.patient)

  return (
    <PlatformShell>
      <FeatureSubHeader
        title="Clinical EHR"
        icon={Stethoscope}
        accentColor="#0D9488"
        showDemo={true}
      />
      <ClinicalNote
        user={data.user}
        patient={data.patient}
        currentVisit={data.currentVisit}
        priorVisits={data.priorVisits}
        imagingStudies={data.imagingStudies}
        scoreHistory={data.scoreHistory}
        patientMessages={data.patientMessages}
        patientIntakeForms={data.patientIntakeForms}
        historianSessions={data.historianSessions}
      />
    </PlatformShell>
  )
}
```

**Step 4: Verify**

Run `npm run dev`. Visit `http://localhost:3000/ehr` (must be logged in). Confirm:
- Page loads with a patient chart
- `FeatureSubHeader` shows "Clinical EHR" with teal bar and Home link
- Refreshing loads a potentially different random patient
- Visiting `/ehr?patient=<some-id>` loads that specific patient

**Step 5: Commit**

```bash
git add src/app/ehr/layout.tsx src/app/ehr/page.tsx src/lib/dashboardData.ts
git commit -m "feat: add /ehr route with random patient selection and direct linking"
```

---

### Task 3: Refactor `/physician` to schedule-first

**Files:**
- Modify: `src/app/physician/page.tsx`
- Create: `src/components/PhysicianSchedulePage.tsx` (client wrapper)

**Step 1: Create the client-side schedule wrapper component**

Create `src/components/PhysicianSchedulePage.tsx`. This is a client component that manages the schedule↔chart view toggle:

```typescript
'use client'

import { useState, useCallback } from 'react'
import AppointmentsDashboard from './appointments/AppointmentsDashboard'
import ClinicalNote from './ClinicalNote'
import PlatformShell from './layout/PlatformShell'
import FeatureSubHeader from './layout/FeatureSubHeader'
import { CalendarClock, ArrowLeft } from 'lucide-react'
import type { Appointment } from './appointments/appointmentUtils'
```

State: `viewMode` (`'schedule' | 'chart'`), `selectedPatientData` (null or fetched patient data for ClinicalNote), `loading` boolean.

**Schedule view:** Render `AppointmentsDashboard` with `onSelectPatient` handler. When a patient is selected, fetch their data via `/api/patient-data?id=<patient_id>` (or use the existing pattern from `ClinicalNote.handleSelectPatient`), store result, and switch to chart view.

**Chart view:** Render `ClinicalNote` with the fetched patient data. Show a "Back to Schedule" button in the `FeatureSubHeader` area (or above ClinicalNote).

Key insight: `ClinicalNote` already handles the `appointments → chart` toggle internally via its `viewMode` state. So the simplest approach is to render `ClinicalNote` but have it start in `'appointments'` mode instead of `'cockpit'` mode. This requires adding a prop to `ClinicalNote` like `initialViewMode`.

**Revised approach:** Instead of building a new wrapper, modify `ClinicalNote` to accept an `initialViewMode` prop that defaults to `'cockpit'` (preserving current behavior). The `/physician` page passes `initialViewMode="appointments"` to start in schedule view.

**Step 2: Add `initialViewMode` prop to ClinicalNote**

In `src/components/ClinicalNote.tsx`, at the `ClinicalNoteProps` interface (around line 25), add:

```typescript
initialViewMode?: 'cockpit' | 'appointments' | 'chart'
```

Then in the component's state initialization (around line 191), change:

```typescript
const [viewMode, setViewMode] = useState<'appointments' | 'chart' | 'cockpit'>(initialViewMode || 'cockpit')
```

And update the destructuring of props to include `initialViewMode`.

**Step 3: Refactor `/physician/page.tsx` to schedule-first**

Replace the current `src/app/physician/page.tsx` with a version that:
1. Wraps in `PlatformShell` + `FeatureSubHeader` (title "My Schedule", CalendarClock icon, teal accent)
2. Calls `fetchDashboardData()` for initial data
3. Renders `ClinicalNote` with `initialViewMode="appointments"`

```typescript
import ClinicalNote from '@/components/ClinicalNote'
import PlatformShell from '@/components/layout/PlatformShell'
import FeatureSubHeader from '@/components/layout/FeatureSubHeader'
import { CalendarClock } from 'lucide-react'
import { fetchDashboardData } from '@/lib/dashboardData'

export const dynamic = 'force-dynamic'

export default async function PhysicianPage() {
  const data = await fetchDashboardData()

  return (
    <PlatformShell>
      <FeatureSubHeader
        title="My Schedule"
        icon={CalendarClock}
        accentColor="#0D9488"
        showDemo={true}
      />
      <ClinicalNote
        user={data.user}
        patient={data.patient}
        currentVisit={data.currentVisit}
        priorVisits={data.priorVisits}
        imagingStudies={data.imagingStudies}
        scoreHistory={data.scoreHistory}
        patientMessages={data.patientMessages}
        patientIntakeForms={data.patientIntakeForms}
        historianSessions={data.historianSessions}
        initialViewMode="appointments"
      />
    </PlatformShell>
  )
}
```

**Step 4: Verify**

Run `npm run dev`. Visit `http://localhost:3000/physician` (logged in). Confirm:
- Page loads showing `AppointmentsDashboard` (day/week/month calendar) — NOT the chart editor
- `FeatureSubHeader` shows "My Schedule" with teal bar
- Clicking a patient in the day view switches to the chart view for that patient
- The "home" icon in the sidebar returns to the schedule
- `/ehr` still works as before (direct chart access)

**Step 5: Commit**

```bash
git add src/app/physician/page.tsx src/components/ClinicalNote.tsx
git commit -m "feat: refactor /physician to schedule-first with initialViewMode prop"
```

---

### Task 4: Build verification and cleanup

**Step 1: Run production build**

```bash
npm run build
```

Fix any TypeScript or build errors.

**Step 2: End-to-end smoke test**

Manually verify the full flow:
1. Visit `/` — 3 tracks render, Clinician track has 5 cards
2. Click "Clinician Dashboard" → `/dashboard` → Command Center loads
3. Click Home → back to homepage
4. Click "My Schedule" → `/physician` → Calendar/schedule loads (not chart)
5. Click a patient → chart loads inline
6. Click Home icon → back to schedule
7. Click Home in header → back to homepage
8. Click "Clinical EHR" → `/ehr` → Random patient chart loads directly
9. Refresh `/ehr` → may load different patient

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: address build errors from physician workspace card breakout"
```

---

### Task 5: Update documentation

**Files:**
- Modify: `CLAUDE.md` (Recent Changes, routing docs)
- Modify: `src/components/homepage/journeyData.ts` (already done)

**Step 1: Update CLAUDE.md**

Add to Recent Changes section and update the Project Structure section:
- Add `/ehr` route description
- Update `/physician` description to "Schedule-first with inline chart swap"
- Update the Clinician track card listing
- Note that Command Center card moved from Ongoing Care to Clinician track

**Step 2: Commit docs**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for physician workspace card breakout"
```
