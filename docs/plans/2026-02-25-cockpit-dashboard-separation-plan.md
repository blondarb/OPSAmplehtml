# Cockpit vs Dashboard Separation — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Separate the Clinician Cockpit and Operations Dashboard into distinct tools with clear audiences — Cockpit for providers (briefing + schedule + notifications), Dashboard for practice managers (operational summary + action queue + patient queue).

**Architecture:** Incremental refactor of existing components. Move MorningBriefing from Dashboard to Cockpit center column. Replace Dashboard Zone 1 with a new OperationalSummary. Rearrange homepage cards to 4+3 layout. Rename Dashboard toggle from "My Patients / All Patients" to "By Provider".

**Tech Stack:** Next.js 15 App Router, TypeScript, React, Tailwind CSS + inline styles, Supabase, lucide-react icons

**Design doc:** `docs/plans/2026-02-25-cockpit-dashboard-separation-design.md`

---

### Task 1: Update homepage card data — new 4+3 layout

**Files:**
- Modify: `src/components/homepage/journeyData.ts`

**Step 1: Update clinicianTrack cards**

Replace the current 5-card `clinicianTrack.cards` array (lines 26–68) with 4 cards in this order:

1. AI-Powered Triage (unchanged — keep as-is)
2. Clinician Cockpit (replaces both "Clinician Dashboard" and "My Schedule"):
   - `phase: 'My Day'`
   - `name: 'Clinician Cockpit'`
   - `route: '/physician'`
   - `icon: CalendarClock` (already imported)
   - `status: 'live'`
   - `description: 'Morning briefing, today\'s schedule, and priority notifications — your clinical home base.'`
3. Documentation (unchanged — keep as-is)
4. Digital Neurological Exam (unchanged — keep as-is)

Remove the separate "Clinician Dashboard" card (currently routes to `/dashboard`) and the separate "My Schedule" card (currently routes to `/physician`). The Cockpit absorbs both.

**Step 2: Update ongoingCareTrack cards**

Add the Operations Dashboard as the first card in `ongoingCareTrack.cards` (lines 109–130):

- `phase: 'Operations'`
- `name: 'Operations Dashboard'`
- `route: '/dashboard'`
- `icon: LayoutDashboard` (already imported)
- `status: 'live'`
- `description: 'Practice-wide operational intelligence — staffing, action queue, and patient priority across all providers.'`

Keep the existing Follow-Up Agent and Wearable Monitoring cards after it. Result: 3 cards in Ongoing Care.

**Step 3: Verify the build compiles**

Run: `npm run build`
Expected: No TypeScript errors. Homepage renders 4 clinician cards + 3 ongoing care cards.

**Step 4: Commit**

```bash
git add src/components/homepage/journeyData.ts
git commit -m "feat: rearrange homepage to 4+3 layout (Cockpit in Clinician, Dashboard in Ongoing Care)"
```

---

### Task 2: Redesign PhysicianHome — replace ProviderCommColumn with MorningBriefing

**Files:**
- Modify: `src/components/PhysicianHome.tsx`

**Step 1: Add MorningBriefing import and replace ProviderCommColumn**

In `PhysicianHome.tsx`:

1. Remove the import of `ProviderCommColumn` (line 6)
2. Add import: `import MorningBriefing from './command-center/MorningBriefing'`
3. Remove the `handleOpenThread` and `handleCreateConsult` handlers (lines 30–35) — no longer needed
4. In the 3-column layout (lines 67–83), replace the `<ProviderCommColumn>` component with `<MorningBriefing viewMode="my_patients" timeRange="today" />`
5. Wrap the MorningBriefing in a scrollable container div matching the column styling:
   ```tsx
   <div style={{
     flex: 1,
     borderLeft: '1px solid var(--border)',
     borderRight: '1px solid var(--border)',
     overflow: 'auto',
     padding: '16px',
     background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
   }}>
     <MorningBriefing viewMode="my_patients" timeRange="today" />
   </div>
   ```

The result is: Schedule (left) | Morning Briefing (center, dark bg) | Notifications (right).

**Step 2: Verify the build compiles**

Run: `npm run build`
Expected: No TypeScript errors.

**Step 3: Commit**

```bash
git add src/components/PhysicianHome.tsx
git commit -m "feat: replace ProviderComm column with Morning Briefing in Cockpit"
```

---

### Task 3: Update PhysicianPageWrapper — change header to "Clinician Cockpit"

**Files:**
- Modify: `src/components/PhysicianPageWrapper.tsx`

**Step 1: Change FeatureSubHeader title and icon**

In `PhysicianPageWrapper.tsx`:

1. Change the `FeatureSubHeader` title from `"My Schedule"` to `"Clinician Cockpit"` (line 35)
2. Change the import from `CalendarClock` to `Home` from lucide-react (line 6)
3. Change the `icon` prop from `CalendarClock` to `Home` (line 36)

**Step 2: Verify the build compiles**

Run: `npm run build`
Expected: No TypeScript errors.

**Step 3: Commit**

```bash
git add src/components/PhysicianPageWrapper.tsx
git commit -m "feat: rename My Schedule header to Clinician Cockpit"
```

---

### Task 4: Create OperationalSummary component for Dashboard Zone 1

**Files:**
- Create: `src/components/command-center/OperationalSummary.tsx`

**Step 1: Create the OperationalSummary component**

Build a new component that replaces MorningBriefing in the Dashboard. It should:

- Accept props: `viewMode: string, timeRange: string` (same as MorningBriefing for API compatibility)
- Use the same gradient border styling as MorningBriefing (linear-gradient #4F46E5 → #0D9488, 1px padding, #1e293b inner background)
- Header: `LayoutDashboard` icon (from lucide-react) + "Operational Summary" title
- Display a hardcoded demo operational summary narrative (practice-manager tone):
  ```
  "Clinic capacity is at 87% today — 42 patients across 4 providers. Dr. Arbogast has 14 patients (2 new, 1 urgent). Dr. Patel has 12 (3 follow-ups flagged for review). Average wait time is 18 minutes, up from 12 yesterday. Staffing: 3 of 4 MAs on floor, 1 called out. Action backlog: 23 items pending (8 refills, 6 messages, 5 orders, 4 scale reminders). No open triage queue items."
  ```
- Include a "reasoning" section (collapsible, same as MorningBriefing):
  ```
  ["Queried visits: 42 total across 4 providers", "Queried staffing: 3/4 MAs checked in", "Computed avg wait from check-in timestamps: 18 min", "Queried command_center_actions: 23 pending (grouped by type)", "Queried triage_sessions: 0 pending review"]
  ```
- Include Regenerate button (same styling as MorningBriefing)
- Include "Show reasoning" toggle (same styling)
- Include "Generated at" timestamp

Model the component closely on `MorningBriefing.tsx` but with:
- Different icon (`LayoutDashboard` instead of `Sparkles`)
- Different title ("Operational Summary" instead of "Morning Briefing")
- Different fallback narrative (practice-wide operations, not individual provider)
- Same API pattern (calls `/api/command-center/briefing` but can differentiate later)

**Step 2: Verify the build compiles**

Run: `npm run build`
Expected: No TypeScript errors.

**Step 3: Commit**

```bash
git add src/components/command-center/OperationalSummary.tsx
git commit -m "feat: add OperationalSummary component for Dashboard Zone 1"
```

---

### Task 5: Swap Dashboard Zone 1 — replace MorningBriefing with OperationalSummary

**Files:**
- Modify: `src/components/command-center/CommandCenterPage.tsx`

**Step 1: Replace MorningBriefing import and usage**

1. Change the import on line 6 from `MorningBriefing` to `OperationalSummary`:
   ```tsx
   import OperationalSummary from './OperationalSummary'
   ```
2. Replace `<MorningBriefing viewMode={viewMode} timeRange={timeRange} />` (line 50) with:
   ```tsx
   <OperationalSummary viewMode={viewMode} timeRange={timeRange} />
   ```
3. Update the Zone 1 comment from `{/* Zone 1: Morning Briefing */}` to `{/* Zone 1: Operational Summary */}`

**Step 2: Verify the build compiles**

Run: `npm run build`
Expected: No TypeScript errors.

**Step 3: Commit**

```bash
git add src/components/command-center/CommandCenterPage.tsx
git commit -m "feat: swap Dashboard Zone 1 from Morning Briefing to Operational Summary"
```

---

### Task 6: Rename Dashboard toggle — "By Provider" filter

**Files:**
- Modify: `src/components/command-center/RoleToggle.tsx`

**Step 1: Update toggle labels**

In `RoleToggle.tsx`, change the `OPTIONS` array (lines 8–11):

From:
```tsx
{ key: 'my_patients', label: 'My Patients' },
{ key: 'all_patients', label: 'All Patients' },
```

To:
```tsx
{ key: 'my_patients', label: 'By Provider' },
{ key: 'all_patients', label: 'All Patients' },
```

The `key` values stay the same to avoid breaking downstream logic — only the display label changes.

**Step 2: Verify the build compiles**

Run: `npm run build`
Expected: No TypeScript errors.

**Step 3: Commit**

```bash
git add src/components/command-center/RoleToggle.tsx
git commit -m "feat: rename Dashboard toggle from My Patients to By Provider"
```

---

### Task 7: Update Dashboard page header — rename to "Operations Dashboard"

**Files:**
- Modify: `src/app/dashboard/page.tsx`

**Step 1: Change the FeatureSubHeader title**

In `src/app/dashboard/page.tsx`, change line 12:

From: `title="Command Center"`
To: `title="Operations Dashboard"`

**Step 2: Verify the build compiles**

Run: `npm run build`
Expected: No TypeScript errors.

**Step 3: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat: rename Command Center header to Operations Dashboard"
```

---

### Task 8: Update QuickAccessStrip links

**Files:**
- Modify: `src/components/command-center/QuickAccessStrip.tsx`

**Step 1: Update link labels and routes**

In `QuickAccessStrip.tsx`, replace the `QUICK_LINKS` array (lines 6–13) with:

```tsx
const QUICK_LINKS = [
  { label: 'AI Triage', href: '/triage', color: '#F59E0B' },
  { label: 'Clinician Cockpit', href: '/physician', color: '#0D9488' },
  { label: 'Documentation', href: '/ehr', color: '#8B5CF6' },
  { label: 'Digital Neuro Exam', href: '/sdne', color: '#1E40AF' },
  { label: 'Follow-Up Agent', href: '/follow-up', color: '#16A34A' },
  { label: 'Wearable Monitoring', href: '/wearable', color: '#0EA5E9' },
]
```

Changes: "Physician Workspace" → "Clinician Cockpit", removed Patient Portal, added Documentation, reordered to match clinician journey.

**Step 2: Verify the build compiles**

Run: `npm run build`
Expected: No TypeScript errors.

**Step 3: Commit**

```bash
git add src/components/command-center/QuickAccessStrip.tsx
git commit -m "feat: update QuickAccess links to match new card names"
```

---

### Task 9: Update ClinicalNote IconSidebar tooltip

**Files:**
- Modify: `src/components/ClinicalNote.tsx`

**Step 1: Verify the "home" icon tooltip**

Check line 60 of `ClinicalNote.tsx`. The tooltip already says "Clinical Cockpit" — confirm it says:
```tsx
{ id: 'home', tooltip: 'Clinical Cockpit', ... }
```

If it already matches, no change needed. If not, update to "Clinical Cockpit".

**Step 2: Commit (only if changed)**

```bash
git add src/components/ClinicalNote.tsx
git commit -m "fix: ensure home icon tooltip says Clinical Cockpit"
```

---

### Task 10: Update documentation — CLAUDE.md and playbooks

**Files:**
- Modify: `CLAUDE.md` — update Recent Changes section
- Modify: `playbooks/00_homepage_hero.md` — update card layout description
- Modify: `playbooks/01_my_patients_schedule.md` — note that Cockpit now includes briefing
- Modify: `playbooks/02_clinician_command_center.md` — note rename to Operations Dashboard, Zone 1 change

**Step 1: Add to CLAUDE.md Recent Changes**

Add a new entry at the top of the "Recent Changes" section:

```
- **Cockpit/Dashboard Separation (2026-02-25)**: Separated Clinician Cockpit and Operations Dashboard into distinct tools. Cockpit (`/physician`) now has 3 columns: Schedule | Morning Briefing | Notifications — purely "overview of my day" with no inline charting. Dashboard (`/dashboard`) renamed to Operations Dashboard with new Zone 1 Operational Summary (practice-wide metrics for practice managers). Homepage rearranged to 4+3: top row (Clinician Journey) = AI Triage, Clinician Cockpit, Documentation, Digital Neuro Exam; bottom row (Ongoing Care) = Operations Dashboard, Follow-Up Agent, Wearable. Dashboard "My Patients" toggle renamed to "By Provider". See `docs/plans/2026-02-25-cockpit-dashboard-separation-design.md`.
```

**Step 2: Update playbook headers**

In each playbook, update the relevant sections to reflect the new card placement and naming. Key changes:
- `playbooks/00_homepage_hero.md`: Update the card grid to show 4+3 layout
- `playbooks/01_my_patients_schedule.md`: Note that the Cockpit now includes the Morning Briefing and that the schedule card is merged into the Cockpit
- `playbooks/02_clinician_command_center.md`: Rename to Operations Dashboard, note Zone 1 is now Operational Summary, note toggle renamed to "By Provider"

**Step 3: Commit**

```bash
git add CLAUDE.md playbooks/00_homepage_hero.md playbooks/01_my_patients_schedule.md playbooks/02_clinician_command_center.md
git commit -m "docs: update CLAUDE.md and playbooks for Cockpit/Dashboard separation"
```

---

### Task 11: Build verification and visual check

**Step 1: Run full build**

Run: `npm run build`
Expected: Clean build with no errors.

**Step 2: Run dev server and verify**

Run: `npm run dev`

Check these routes:
- `/` (homepage) — should show 4 cards in Clinician Journey, 3 in Ongoing Care
- `/physician` — should show Schedule | Morning Briefing | Notifications (no patient chart)
- `/dashboard` — should show Operational Summary in Zone 1, "By Provider" toggle
- `/ehr` — should work normally (patient chart)

**Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address build/visual issues from Cockpit/Dashboard separation"
```
