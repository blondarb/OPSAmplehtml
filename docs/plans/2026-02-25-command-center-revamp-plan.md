# Command Center Revamp — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the static Command Center placeholder with an AI-powered clinical operations hub featuring an AI morning briefing, live aggregate metrics, batch-approvable AI action queue, and 3-level priority patient drill-down.

**Architecture:** Five-zone vertical layout inside existing `PlatformShell` + `FeatureSubHeader` shell. Role toggle (My Patients / All Patients) and time range selector sit at the top. Inline hardcoded demo data in each component with API fallback for live Supabase data. GPT-5.2 for briefing and action generation. Two new Supabase tables for action tracking and briefing caching.

**Tech Stack:** Next.js 15.1 App Router, TypeScript, Tailwind + inline styles, Supabase (PostgreSQL), OpenAI GPT-5.2/GPT-5-mini, Lucide React icons

**Design Doc:** `docs/plans/2026-02-25-command-center-revamp-design.md`

**Existing file to replace:** `src/components/CommandCenterDashboard.tsx` (159-line static placeholder)

**Key codebase patterns to follow:**
- Demo data: hardcoded arrays at top of component files (see `NotificationFeed.tsx`, `ScheduleColumn.tsx`)
- API routes: `createClient()` from `@/lib/supabase/server`, `supabase.auth.getUser()` for auth, `NextResponse.json()`
- OpenAI key: check `process.env.OPENAI_API_KEY` first, fallback to `supabase.rpc('get_openai_key')`
- Layout: `PlatformShell` wraps page, `FeatureSubHeader` provides colored title bar
- Styling: inline styles for dark theme (`#0f172a` → `#1e293b` gradient backgrounds, slate text colors)
- No unit tests in this codebase — QA is visual via browser

---

## Phase 1: Foundation (Tasks 1-3)

### Task 1: Commit design doc and handoff doc

**Files:**
- Stage: `docs/plans/2026-02-25-command-center-revamp-design.md`
- Stage: `docs/HANDOFF_2026-02-25_command-center-revamp.md`

**Step 1:** Stage and commit

```bash
git add docs/plans/2026-02-25-command-center-revamp-design.md docs/HANDOFF_2026-02-25_command-center-revamp.md
git commit -m "docs(command-center): add revamp design doc and session handoff"
```

---

### Task 2: Supabase migration — command center tables

**Files:**
- Create: `supabase/migrations/030_command_center.sql`

**Step 1:** Write migration with two new tables

```sql
-- 030_command_center.sql
-- Command Center: AI action tracking and briefing cache

-- AI-suggested actions with approval workflow
CREATE TABLE IF NOT EXISTS command_center_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  physician_id UUID NOT NULL,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'message', 'call', 'order', 'refill', 'pa_followup',
    'scale_reminder', 'care_gap', 'appointment', 'pcp_summary'
  )),
  title TEXT NOT NULL,
  description TEXT,
  drafted_content TEXT,
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'dismissed', 'executed')),
  approved_at TIMESTAMPTZ,
  approved_by UUID,
  batch_id UUID,
  source_data JSONB DEFAULT '{}'::jsonb,
  tenant_id UUID
);

-- Indexes for common queries
CREATE INDEX idx_cc_actions_physician ON command_center_actions(physician_id, status);
CREATE INDEX idx_cc_actions_patient ON command_center_actions(patient_id);
CREATE INDEX idx_cc_actions_batch ON command_center_actions(batch_id) WHERE batch_id IS NOT NULL;

-- RLS
ALTER TABLE command_center_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own actions" ON command_center_actions
  FOR SELECT USING (auth.uid() = physician_id OR tenant_id = (SELECT current_setting('app.tenant_id', true))::uuid);
CREATE POLICY "Users can update their own actions" ON command_center_actions
  FOR UPDATE USING (auth.uid() = physician_id);
CREATE POLICY "Authenticated users can insert actions" ON command_center_actions
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Cached AI briefings
CREATE TABLE IF NOT EXISTS command_center_briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  physician_id UUID,
  view_mode TEXT NOT NULL CHECK (view_mode IN ('my_patients', 'all_patients')),
  time_range TEXT NOT NULL DEFAULT 'today' CHECK (time_range IN ('today', 'yesterday', 'last_7_days')),
  narrative TEXT NOT NULL,
  reasoning JSONB DEFAULT '[]'::jsonb,
  urgent_count INTEGER DEFAULT 0,
  data_snapshot JSONB DEFAULT '{}'::jsonb,
  tenant_id UUID
);

CREATE INDEX idx_cc_briefings_physician ON command_center_briefings(physician_id, created_at DESC);

ALTER TABLE command_center_briefings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view briefings" ON command_center_briefings
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can insert briefings" ON command_center_briefings
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
```

**Step 2:** Commit

```bash
git add supabase/migrations/030_command_center.sql
git commit -m "feat(command-center): add migration 030 for actions and briefings tables"
```

---

### Task 3: TypeScript types

**Files:**
- Create: `src/lib/command-center/types.ts`

**Step 1:** Write all TypeScript types for the Command Center

```typescript
// Types for Command Center revamp

// -- Enums / union types --

export type ViewMode = 'my_patients' | 'all_patients'
export type TimeRange = 'today' | 'yesterday' | 'last_7_days'

export type ActionType =
  | 'message' | 'call' | 'order' | 'refill' | 'pa_followup'
  | 'scale_reminder' | 'care_gap' | 'appointment' | 'pcp_summary'

export type Confidence = 'high' | 'medium' | 'low'
export type ActionStatus = 'pending' | 'approved' | 'dismissed' | 'executed'
export type PatientUrgency = 'urgent' | 'attention' | 'watch' | 'stable'
export type CategoryFilter =
  | 'all' | 'messages' | 'refills' | 'results' | 'wearables'
  | 'followups' | 'triage' | 'ehr' | 'scales'

// -- Zone 1: AI Briefing --

export interface BriefingResponse {
  narrative: string
  reasoning: string[]
  urgent_count: number
  generated_at: string
}

export interface BriefingRequest {
  physician_id: string | null
  view_mode: ViewMode
  time_range: TimeRange
}

// -- Zone 2: Status Tiles --

export interface TileMetric {
  total: number
  sublabel: string
  trend?: 'up' | 'down' | 'flat'
}

export interface MetricsResponse {
  schedule: TileMetric & { new: number; cancelled: number }
  messages: TileMetric & { urgent: number; oldest_days: number }
  refills: TileMetric & { overdue: number }
  results: TileMetric & { oldest_days: number }
  wearables: TileMetric & { urgent: number }
  followups: TileMetric & { same_day: number }
  triage: TileMetric & { emergent: number }
  ehr: TileMetric & { results_to_sign: number }
}

export interface StatusTileConfig {
  key: keyof MetricsResponse
  label: string
  icon: string       // Lucide icon name
  color: string      // accent hex
  category: CategoryFilter
}

// -- Zone 3: AI Action Queue --

export interface ActionItem {
  id: string
  action_type: ActionType
  confidence: Confidence
  patient_id: string | null
  patient_name: string
  title: string
  description: string
  drafted_content: string | null
  batch_id: string | null
  status: ActionStatus
  created_at: string
}

export interface BatchGroup {
  batch_id: string
  action_type: ActionType
  count: number
  all_high_confidence: boolean
  label: string
  action_ids: string[]
}

export interface ActionsResponse {
  actions: ActionItem[]
  batch_groups: BatchGroup[]
}

// -- Zone 4: Priority Patient Queue --

export interface PendingItems {
  messages: number
  refills: number
  results: number
  wearables: number
  followups: number
  triage: number
  scales: number
  ehr: number
}

export interface PatientQueueItem {
  id: string
  name: string
  age: number
  sex: string
  primary_diagnosis: string
  urgency: PatientUrgency
  pending_items: PendingItems
  ai_micro_summary: string
  last_contact: {
    date: string
    method: string
  }
  sources: string[]  // 'sevaro' | 'ehr' | 'wearable'
}

export interface PatientSummaryResponse {
  ai_summary: string
  pending_items: {
    category: string
    description: string
    age: string
  }[]
  recent_events: {
    date: string
    event: string
    source: string
  }[]
  quick_links: {
    chart: string
    wearable: string
    followup: string
  }
}

export interface PatientsResponse {
  patients: PatientQueueItem[]
}

// -- Component prop types --

export interface CommandCenterState {
  viewMode: ViewMode
  timeRange: TimeRange
  categoryFilter: CategoryFilter
  urgencyFilter: PatientUrgency | 'all'
  searchQuery: string
}
```

**Step 2:** Commit

```bash
git add src/lib/command-center/types.ts
git commit -m "feat(command-center): add TypeScript types for all zones"
```

---

## Phase 2: API Layer (Tasks 4-7)

### Task 4: Metrics API endpoint

**Files:**
- Create: `src/app/api/command-center/metrics/route.ts`

**Step 1:** Write the metrics route with Supabase queries and demo fallback

The endpoint queries 8 data sources for aggregate counts. If Supabase returns empty results (no real data), it falls back to realistic demo numbers.

Key queries:
- `visits` WHERE `visit_date = today` → schedule count
- `patient_messages` WHERE `is_read = false AND direction = 'inbound'` → unread messages
- `patient_medications` WHERE refill approaching → pending refills
- `imaging_studies` WHERE ordered but no impression → missing results
- `wearable_alerts` WHERE `acknowledged = false` → wearable alerts
- `followup_sessions` WHERE `escalation_level IN ('same_day', 'urgent')` → follow-up escalations
- `triage_sessions` WHERE `status = 'pending_review'` → triage queue
- EHR items → seeded demo data only

Return format matches `MetricsResponse` type. Include `sublabel` strings like "1 urgent, 2 days old".

**Step 2:** Commit

```bash
git add src/app/api/command-center/metrics/route.ts
git commit -m "feat(command-center): add metrics API with 8-source aggregate counts"
```

---

### Task 5: Actions API endpoints

**Files:**
- Create: `src/app/api/command-center/actions/route.ts` (GET — list actions)
- Create: `src/app/api/command-center/actions/[id]/approve/route.ts` (POST — approve single)
- Create: `src/app/api/command-center/actions/batch-approve/route.ts` (POST — batch approve)

**Step 1:** Write GET route for listing actions

Queries `command_center_actions` WHERE `status = 'pending'`. Falls back to demo data (15-20 pre-built action items across all 9 categories with varied confidence levels). Groups actions by `batch_id` to produce `batch_groups` array. Sets `all_high_confidence` based on whether every item in a batch is `confidence = 'high'`.

**Step 2:** Write POST approve route

Updates single action: `SET status = 'approved', approved_at = NOW(), approved_by = user.id`. Demo fallback: returns success with updated item.

**Step 3:** Write POST batch-approve route

Accepts `{ action_ids: string[] }`. Updates all matching actions to approved. Demo fallback: returns success with count.

**Step 4:** Commit

```bash
git add src/app/api/command-center/actions/
git commit -m "feat(command-center): add actions API with approve and batch-approve"
```

---

### Task 6: Patients API endpoints

**Files:**
- Create: `src/app/api/command-center/patients/route.ts` (GET — priority queue)
- Create: `src/app/api/command-center/patients/[id]/summary/route.ts` (GET — AI patient summary)

**Step 1:** Write GET patients route

Accepts query params: `view_mode`, `category`, `urgency`, `search`. Joins across `patients`, `patient_messages`, `patient_medications`, `imaging_studies`, `wearable_alerts`, `followup_sessions`, `triage_sessions` to compute `pending_items` counts per patient. Sorts by urgency (urgent > attention > watch > stable). Falls back to demo data with 12-15 patients.

Each patient row includes: name, age, sex, primary_diagnosis, urgency, pending_items, ai_micro_summary (short hardcoded string), last_contact, sources.

**Step 2:** Write GET patient summary route

Accepts patient ID. For demo: returns pre-written AI summary + pending item details + recent event timeline + quick links. For production: would call GPT-5.2 to synthesize across all data sources.

**Step 3:** Commit

```bash
git add src/app/api/command-center/patients/
git commit -m "feat(command-center): add patients priority queue and summary APIs"
```

---

### Task 7: Briefing API endpoint

**Files:**
- Create: `src/app/api/command-center/briefing/route.ts`
- Create: `src/lib/command-center/briefingPrompt.ts`

**Step 1:** Write the briefing system prompt

The prompt instructs GPT-5.2 to act as a chief resident giving a morning briefing. It receives a JSON snapshot of all data sources (counts, urgent items, patient names) and generates a 4-6 sentence narrative highlighting the top 3 urgent items by patient name, ending with a positive "good news" line. Output format: `{ narrative, reasoning[], urgent_count }`.

**Step 2:** Write the briefing POST route

1. Auth check
2. Gather data snapshot from Supabase (reuse metrics queries + top patients)
3. Check cache in `command_center_briefings` (reuse if < 1 hour old)
4. If no cache: call GPT-5.2 with system prompt + data snapshot
5. Cache result in `command_center_briefings`
6. Return `BriefingResponse`
7. Demo fallback: return hardcoded compelling briefing narrative

**Step 3:** Commit

```bash
git add src/lib/command-center/briefingPrompt.ts src/app/api/command-center/briefing/route.ts
git commit -m "feat(command-center): add AI morning briefing API with GPT-5.2"
```

---

## Phase 3: Leaf Components (Tasks 8-9)

### Task 8: Small reusable components

**Files:**
- Create: `src/components/command-center/StatusTile.tsx`
- Create: `src/components/command-center/ConfidenceBadge.tsx`
- Create: `src/components/command-center/UrgencyIndicator.tsx`
- Create: `src/components/command-center/SourceBadge.tsx`
- Create: `src/components/command-center/PendingItemBadges.tsx`

**Step 1:** Write `StatusTile.tsx`

A card showing: colored dot + uppercase label, large number in accent color, gray sublabel, optional trend arrow (↑↓→). Clickable — calls `onTileClick(category)` prop. Matches the design:

```
┌─────────────────────┐
│  ● UNANSWERED MSGS  │  ← colored dot + uppercase label
│  4                   │  ← large number, colored
│  1 urgent, 2 days    │  ← gray sublabel
└─────────────────────┘
```

Dark card background (`#1e293b`), rounded corners, hover highlight.

**Step 2:** Write `ConfidenceBadge.tsx`

Small pill badge: High (green `#22C55E`), Medium (yellow `#EAB308`), Low (orange `#F97316`). Text: "High" / "Medium" / "Low". Props: `confidence: Confidence`.

**Step 3:** Write `UrgencyIndicator.tsx`

Colored left border strip for patient rows. Red (`#EF4444`) = urgent, Orange (`#F59E0B`) = attention, Yellow (`#EAB308`) = watch, Green (`#22C55E`) = stable. Props: `urgency: PatientUrgency`.

**Step 4:** Write `SourceBadge.tsx`

Small tag: "Sevaro" (teal), "EHR" (slate `#64748B`), "Wearable" (sky `#0EA5E9`). Uppercase, 0.65rem font. Props: `source: string`.

**Step 5:** Write `PendingItemBadges.tsx`

Row of small icon badges. Each icon represents a pending category (envelope for messages, pill for refills, image for results, watch for wearables, phone for follow-ups, brain for triage, clipboard for scales, inbox for EHR). Only shows badges where count > 0. Props: `items: PendingItems`.

**Step 6:** Commit

```bash
git add src/components/command-center/StatusTile.tsx src/components/command-center/ConfidenceBadge.tsx src/components/command-center/UrgencyIndicator.tsx src/components/command-center/SourceBadge.tsx src/components/command-center/PendingItemBadges.tsx
git commit -m "feat(command-center): add leaf components (tile, badges, indicators)"
```

---

### Task 9: Action item components

**Files:**
- Create: `src/components/command-center/DraftedContentPreview.tsx`
- Create: `src/components/command-center/ActionItem.tsx`
- Create: `src/components/command-center/ActionBatchGroup.tsx`

**Step 1:** Write `DraftedContentPreview.tsx`

Expandable section showing AI-drafted content (message text, order details, call script). Toggle with "Show draft" / "Hide draft" link. Monospace-ish font, slate background, subtle border. Props: `content: string`, `isExpanded: boolean`, `onToggle: () => void`.

**Step 2:** Write `ActionItem.tsx`

Single action card with:
- Left: action type icon (Lucide: MessageCircle, Phone, ClipboardList, Pill, FileText, Activity, AlertCircle, Calendar)
- Center: patient name (bold), title, description, confidence badge
- Expandable: drafted content preview
- Right: Approve (green), Edit (blue), Dismiss (gray) buttons
- Props: `action: ActionItem`, `onApprove`, `onDismiss`

**Step 3:** Write `ActionBatchGroup.tsx`

Groups actions of the same type. Header: "3 Refill Reminders" with type icon. "Approve All 3" button (only if `all_high_confidence`). Expandable to show individual items. Props: `group: BatchGroup`, `actions: ActionItem[]`, `onBatchApprove`, `onApproveOne`, `onDismissOne`.

**Step 4:** Commit

```bash
git add src/components/command-center/DraftedContentPreview.tsx src/components/command-center/ActionItem.tsx src/components/command-center/ActionBatchGroup.tsx
git commit -m "feat(command-center): add action item and batch group components"
```

---

## Phase 4: Zone Components (Tasks 10-16)

### Task 10: Role toggle and time range selector

**Files:**
- Create: `src/components/command-center/RoleToggle.tsx`
- Create: `src/components/command-center/TimeRangeSelector.tsx`

**Step 1:** Write `RoleToggle.tsx`

Segmented control with two options: "My Patients" / "All Patients". Active segment has indigo background (`#4F46E5`), inactive is transparent with border. Props: `value: ViewMode`, `onChange: (mode: ViewMode) => void`.

**Step 2:** Write `TimeRangeSelector.tsx`

"Today" label with date display + dropdown selector: Today / Yesterday / Last 7 Days. Subtle dark dropdown matching page theme. Props: `value: TimeRange`, `onChange: (range: TimeRange) => void`.

**Step 3:** Commit

```bash
git add src/components/command-center/RoleToggle.tsx src/components/command-center/TimeRangeSelector.tsx
git commit -m "feat(command-center): add role toggle and time range selector"
```

---

### Task 11: Zone 1 — Morning Briefing

**Files:**
- Create: `src/components/command-center/MorningBriefing.tsx`

**Step 1:** Write the component

Prominent card with gradient border (indigo → teal). Contains:
- Header: "Morning Briefing" + Sparkles icon + timestamp ("Generated 6:42 AM")
- Body: narrative text (from API or demo), 1rem, `#e2e8f0`, line-height 1.7
- Footer: "Regenerate" button (calls POST briefing API), "Show reasoning" toggle
- Loading state: pulsing skeleton
- Demo fallback narrative hardcoded (the Maria Santos / James Okonkwo / Dorothy Chen example from design doc)

Props: `viewMode: ViewMode`, `timeRange: TimeRange`.

Uses `fetch('/api/command-center/briefing')` on mount and when viewMode/timeRange changes.

**Step 2:** Commit

```bash
git add src/components/command-center/MorningBriefing.tsx
git commit -m "feat(command-center): add AI morning briefing zone"
```

---

### Task 12: Zone 2 — Status Bar

**Files:**
- Create: `src/components/command-center/StatusBar.tsx`

**Step 1:** Write the component

Horizontal row of 8 `StatusTile` components. Flex wrap for responsive (desktop: single row, tablet: 2 rows of 4, mobile: 2-column grid). Fetches from `/api/command-center/metrics` on mount.

Tile config array defining all 8 tiles with labels, icons, colors, and category mappings (matching design doc table). Clicking a tile calls `onCategoryFilter(category)` to scroll Zone 4 and pre-filter.

Demo fallback: hardcoded metric values matching design doc examples.

Props: `viewMode: ViewMode`, `timeRange: TimeRange`, `onCategoryFilter: (cat: CategoryFilter) => void`.

**Step 2:** Commit

```bash
git add src/components/command-center/StatusBar.tsx
git commit -m "feat(command-center): add 8-tile status bar zone"
```

---

### Task 13: Zone 3 — Action Queue

**Files:**
- Create: `src/components/command-center/ActionQueue.tsx`

**Step 1:** Write the component

Card with header "AI Suggested Actions" + Sparkles icon + pending count badge. Contains:
- Batch groups at top (each rendered as `ActionBatchGroup`)
- Individual (non-batched) actions below (each as `ActionItem`)
- Empty state: "No pending actions" with check icon

Fetches from `/api/command-center/actions` on mount. Handles approve/dismiss/batch-approve by calling respective API endpoints and updating local state optimistically.

Demo data: 15-20 hardcoded actions across all 9 categories with mixed confidence levels. 3 batch groups (refills, scale reminders, messages) pre-defined.

Props: `viewMode: ViewMode`, `timeRange: TimeRange`.

**Step 2:** Commit

```bash
git add src/components/command-center/ActionQueue.tsx
git commit -m "feat(command-center): add AI action queue with batch approve"
```

---

### Task 14: Patient row and detail card

**Files:**
- Create: `src/components/command-center/PatientRow.tsx`
- Create: `src/components/command-center/PatientDetailCard.tsx`

**Step 1:** Write `PatientRow.tsx`

Level 1 scan row. Left colored border via `UrgencyIndicator`. Shows: patient name + age/sex, primary diagnosis, `PendingItemBadges`, AI micro-summary (italic, `#94a3b8`), last contact time, `SourceBadge` tags. Clickable to expand.

Props: `patient: PatientQueueItem`, `isExpanded: boolean`, `onToggle: () => void`.

**Step 2:** Write `PatientDetailCard.tsx`

Level 2 expanded card (inline below row). Fetches from `/api/command-center/patients/[id]/summary`. Shows:
- AI patient summary (3-5 sentences)
- Pending items list with detail strings
- Recent events timeline (last 7 days)
- Quick action buttons: View Chart, View Wearable Data, View Follow-Up, Send Message
- Loading state with skeleton

Demo fallback: hardcoded summaries per patient.

Props: `patientId: string`, `patientName: string`.

**Step 3:** Commit

```bash
git add src/components/command-center/PatientRow.tsx src/components/command-center/PatientDetailCard.tsx
git commit -m "feat(command-center): add patient row and expandable detail card"
```

---

### Task 15: Zone 4 — Patient Queue

**Files:**
- Create: `src/components/command-center/PatientQueue.tsx`

**Step 1:** Write the component

Container for the priority patient list. Contains:
- Filter bar: category pills, urgency pills, physician dropdown (All Patients mode), search input
- Patient list: sorted by urgency, rendered as `PatientRow` components
- Expandable rows using local state to track which patient is expanded
- Ref for scroll-to targeting (when a status tile is clicked)

Fetches from `/api/command-center/patients` with filter params. Demo fallback: 12-15 patients with varied urgency levels and pending item distributions.

Props: `viewMode: ViewMode`, `timeRange: TimeRange`, `categoryFilter: CategoryFilter`, `onCategoryFilterChange: (cat: CategoryFilter) => void`.

Exposes `scrollRef` via `forwardRef` so StatusBar tile clicks can scroll to this zone.

**Step 2:** Commit

```bash
git add src/components/command-center/PatientQueue.tsx
git commit -m "feat(command-center): add priority patient queue with filters"
```

---

### Task 16: Zone 5 — Quick Access + Disclaimer

**Files:**
- Create: `src/components/command-center/QuickAccessStrip.tsx`
- Create: `src/components/command-center/DisclaimerBanner.tsx`

**Step 1:** Write `QuickAccessStrip.tsx`

Horizontal strip of 6 pill-shaped links (matching current feature links but smaller/condensed): AI Triage, Physician Workspace, Digital Neuro Exam, Patient Portal, Post-Visit Follow-Up, Wearable Monitoring. Each has colored dot + label. Uses Next.js `Link`.

**Step 2:** Write `DisclaimerBanner.tsx`

Subtle banner at bottom: "Demo Environment — All data shown is simulated for demonstration purposes." Slate background, small text, info icon. Matches existing disclaimer pattern from current `CommandCenterDashboard.tsx`.

**Step 3:** Commit

```bash
git add src/components/command-center/QuickAccessStrip.tsx src/components/command-center/DisclaimerBanner.tsx
git commit -m "feat(command-center): add quick access strip and disclaimer"
```

---

## Phase 5: Assembly (Tasks 17-19)

### Task 17: Main page orchestrator

**Files:**
- Create: `src/components/command-center/CommandCenterPage.tsx`

**Step 1:** Write the orchestrator component

Top-level component managing all state and rendering all 5 zones in order. Contains:
- State: `viewMode`, `timeRange`, `categoryFilter`, `urgencyFilter`, `searchQuery`
- Header area: `RoleToggle` + `TimeRangeSelector` side by side
- Zone 1: `MorningBriefing`
- Zone 2: `StatusBar` (with `onCategoryFilter` wired to scroll Zone 4 + set filter)
- Zone 3: `ActionQueue`
- Zone 4: `PatientQueue` (with ref for scroll targeting)
- Zone 5: `QuickAccessStrip`
- Footer: `DisclaimerBanner`

Dark gradient background (`#0f172a` → `#1e293b`). Max-width container with responsive padding. Vertical spacing between zones (`gap: 24px`).

**Step 2:** Commit

```bash
git add src/components/command-center/CommandCenterPage.tsx
git commit -m "feat(command-center): add main page orchestrator with 5 zones"
```

---

### Task 18: Wire to dashboard route

**Files:**
- Modify: `src/app/dashboard/page.tsx`
- Keep (do not delete): `src/components/CommandCenterDashboard.tsx` (rename to `CommandCenterDashboard.old.tsx` for reference)

**Step 1:** Update dashboard page to render new component

Change the import from `CommandCenterDashboard` to the new `CommandCenterPage` wrapped in `PlatformShell` + `FeatureSubHeader`:

```typescript
import CommandCenterPage from '@/components/command-center/CommandCenterPage'
import PlatformShell from '@/components/layout/PlatformShell'
import FeatureSubHeader from '@/components/layout/FeatureSubHeader'
import { LayoutDashboard } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default function DashboardPage() {
  return (
    <PlatformShell>
      <FeatureSubHeader
        title="Command Center"
        icon={LayoutDashboard}
        accentColor="#4F46E5"
        showDemo={true}
      />
      <CommandCenterPage />
    </PlatformShell>
  )
}
```

**Step 2:** Rename old component for reference

```bash
mv src/components/CommandCenterDashboard.tsx src/components/CommandCenterDashboard.old.tsx
```

**Step 3:** Commit

```bash
git add src/app/dashboard/page.tsx src/components/CommandCenterDashboard.old.tsx
git commit -m "feat(command-center): wire new Command Center to dashboard route"
```

---

### Task 19: Update documentation

**Files:**
- Modify: `CLAUDE.md` — update Project Structure, Database Schema, API Routes, Key Features, Component Structure sections
- Modify: `docs/CHANGELOG.md` — add Command Center Revamp entry
- Modify: `docs/IMPLEMENTATION_STATUS.md` — mark Command Center as COMPLETE

**Step 1:** Update CLAUDE.md

Add to Project Structure:
- `src/components/command-center/` directory with all new components
- `src/lib/command-center/` directory with types and prompts
- `src/app/api/command-center/` directory with all API routes

Add to Database Schema:
- `command_center_actions` and `command_center_briefings` tables

Add to API Routes:
- All 6 new command-center endpoints

Add to Key Features section:
- Command Center description with 5 zones

**Step 2:** Update CHANGELOG.md

Add entry for Command Center Revamp with all features listed.

**Step 3:** Commit

```bash
git add CLAUDE.md docs/CHANGELOG.md docs/IMPLEMENTATION_STATUS.md
git commit -m "docs(command-center): update CLAUDE.md, changelog, and implementation status"
```

---

## Build Order Summary

| Task | What | Files | Commit |
|------|------|-------|--------|
| 1 | Commit design + handoff docs | 2 docs | `docs(command-center): add revamp design doc and session handoff` |
| 2 | Migration 030 | 1 SQL | `feat(command-center): add migration 030...` |
| 3 | TypeScript types | 1 TS | `feat(command-center): add TypeScript types...` |
| 4 | Metrics API | 1 route | `feat(command-center): add metrics API...` |
| 5 | Actions API | 3 routes | `feat(command-center): add actions API...` |
| 6 | Patients API | 2 routes | `feat(command-center): add patients priority queue...` |
| 7 | Briefing API + prompt | 2 files | `feat(command-center): add AI morning briefing API...` |
| 8 | Leaf components | 5 TSX | `feat(command-center): add leaf components...` |
| 9 | Action components | 3 TSX | `feat(command-center): add action item and batch group...` |
| 10 | Role toggle + time range | 2 TSX | `feat(command-center): add role toggle and time range...` |
| 11 | Morning Briefing zone | 1 TSX | `feat(command-center): add AI morning briefing zone` |
| 12 | Status Bar zone | 1 TSX | `feat(command-center): add 8-tile status bar zone` |
| 13 | Action Queue zone | 1 TSX | `feat(command-center): add AI action queue...` |
| 14 | Patient row + detail | 2 TSX | `feat(command-center): add patient row and detail card` |
| 15 | Patient Queue zone | 1 TSX | `feat(command-center): add priority patient queue...` |
| 16 | Quick Access + Disclaimer | 2 TSX | `feat(command-center): add quick access strip...` |
| 17 | Page orchestrator | 1 TSX | `feat(command-center): add main page orchestrator...` |
| 18 | Wire to dashboard | 2 files | `feat(command-center): wire new Command Center...` |
| 19 | Documentation | 3 docs | `docs(command-center): update CLAUDE.md, changelog...` |

**Total: 19 tasks, ~35 files, 19 commits**
