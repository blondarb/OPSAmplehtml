# Analytics Dashboard & TCM/CCM Billing — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend Card 5 into a three-part hub: follow-up conversations (existing), analytics dashboard with Recharts, and a TCM/CCM billing worksheet with phased time tracking and CSV/PDF export.

**Architecture:** `/follow-up` becomes a hub page with 3 tiles. Existing conversation page relocates to `/follow-up/conversation`. New analytics page queries existing `followup_sessions` and `followup_escalations` tables for aggregated metrics rendered in Recharts. New billing page uses a `followup_billing_entries` table with auto-created entries per completed session, phased time tracking (prep/call/doc/coordination), CPT code suggestions, and export.

**Tech Stack:** Next.js 15, React 18, TypeScript, Recharts (new dependency), Supabase, inline styles.

**Design Doc:** `docs/plans/2026-02-22-analytics-billing-design.md`

---

## Task 1: Install Recharts

**Files:** None (package only)

**Step 1:** Install Recharts

```bash
cd /Users/stevearbogast/dev/repos/OPSamplehtml
npm install recharts
```

**Step 2:** Commit

```bash
git add package.json package-lock.json
git commit -m "chore: add recharts for analytics charts"
```

---

## Task 2: Supabase Migration — Billing Entries Table

**Files:**
- Create: `supabase/migrations/023_followup_billing.sql`

**Step 1:** Write migration SQL

Creates `followup_billing_entries` table with all columns from the design doc. Indexes on `session_id`, `billing_month`, `billing_status`, `patient_id`.

Key columns:
- `session_id UUID FK → followup_sessions(id) ON DELETE CASCADE`
- `patient_id UUID FK → patients(id) ON DELETE SET NULL`
- Time phases: `prep_minutes`, `call_minutes`, `documentation_minutes`, `coordination_minutes`, `total_minutes`
- Billing: `program TEXT` ('tcm'/'ccm'), `cpt_code TEXT`, `cpt_rate NUMERIC(8,2)`, `billing_status TEXT` (not_reviewed/pending_review/ready_to_bill/billed)
- TCM compliance: `tcm_discharge_date DATE`, `tcm_contact_within_2_days BOOLEAN`, `tcm_f2f_scheduled BOOLEAN`
- Audit: `reviewed_by TEXT`, `reviewed_at TIMESTAMPTZ`, `notes TEXT`
- `billing_month TEXT` stored as 'YYYY-MM' for easy monthly grouping
- `meets_threshold BOOLEAN` — whether total_minutes meets the CPT code's minimum requirement
- `updated_at TIMESTAMPTZ DEFAULT now()`

**Step 2:** Commit

```bash
git add supabase/migrations/023_followup_billing.sql
git commit -m "feat(billing): add followup_billing_entries table"
```

---

## Task 3: Billing Types + CPT Code Definitions

**Files:**
- Create: `src/lib/follow-up/billingTypes.ts`
- Create: `src/lib/follow-up/cptCodes.ts`

**Step 1:** Create billing types

`billingTypes.ts` — TypeScript interfaces for the billing system:

```typescript
export type BillingProgram = 'tcm' | 'ccm'
export type BillingStatus = 'not_reviewed' | 'pending_review' | 'ready_to_bill' | 'billed'

export interface BillingEntry {
  id: string
  session_id: string
  created_at: string
  updated_at: string
  patient_id: string | null
  patient_name: string
  service_date: string
  billing_month: string
  program: BillingProgram
  cpt_code: string
  cpt_rate: number
  prep_minutes: number
  call_minutes: number
  documentation_minutes: number
  coordination_minutes: number
  total_minutes: number
  meets_threshold: boolean
  billing_status: BillingStatus
  reviewed_by: string | null
  reviewed_at: string | null
  notes: string | null
  tcm_discharge_date: string | null
  tcm_contact_within_2_days: boolean | null
  tcm_f2f_scheduled: boolean | null
  // Joined from session
  follow_up_method?: string
  escalation_level?: string
  conversation_status?: string
}

export interface BillingMonthlySummary {
  totalSessions: number
  billableSessions: number
  totalBillableMinutes: number
  estimatedRevenue: number
}

export interface AnalyticsSummary {
  totalCalls: number
  completionRate: number
  avgDuration: number
  estimatedRevenue: number
}

export interface AnalyticsData {
  summary: AnalyticsSummary
  volumeByPeriod: Array<{ period: string; count: number }>
  completionTrend: Array<{ period: string; rate: number }>
  escalationDistribution: { urgent: number; same_day: number; next_visit: number; informational: number }
  medicationAdherence: { filledRate: number; takingRate: number; sideEffectRate: number }
  functionalStatus: { better: number; same: number; worse: number }
  modeDistribution: { sms: number; voice: number }
  recentEscalations: Array<{
    id: string
    patientName: string
    tier: string
    category: string
    date: string
    acknowledged: boolean
    sessionId: string
  }>
}
```

**Step 2:** Create CPT code definitions

`cptCodes.ts` — CPT code constants with rates, thresholds, and descriptions. These rates are 2025 CMS national averages.

```typescript
export interface CptCodeDef {
  code: string
  program: 'tcm' | 'ccm'
  name: string
  description: string
  rate: number
  minMinutes: number
  whoProvides: string
  isAddOn: boolean
  addOnTo?: string
}

export const CPT_CODES: Record<string, CptCodeDef> = {
  '99496': {
    code: '99496',
    program: 'tcm',
    name: 'TCM High Complexity',
    description: 'Face-to-face within 7 days of discharge',
    rate: 272.68,
    minMinutes: 0, // TCM is per-event, not time-based
    whoProvides: 'Physician/QHP',
    isAddOn: false,
  },
  '99495': {
    code: '99495',
    program: 'tcm',
    name: 'TCM Moderate Complexity',
    description: 'Face-to-face within 14 days of discharge',
    rate: 201.20,
    minMinutes: 0,
    whoProvides: 'Physician/QHP',
    isAddOn: false,
  },
  '99490': {
    code: '99490',
    program: 'ccm',
    name: 'CCM Non-Complex (first 20 min)',
    description: 'First 20 minutes of clinical staff CCM per month',
    rate: 37.07,
    minMinutes: 20,
    whoProvides: 'Clinical staff',
    isAddOn: false,
  },
  '99439': {
    code: '99439',
    program: 'ccm',
    name: 'CCM Non-Complex (add-on 20 min)',
    description: 'Each additional 20 minutes (max 2x/month)',
    rate: 31.00,
    minMinutes: 20,
    whoProvides: 'Clinical staff',
    isAddOn: true,
    addOnTo: '99490',
  },
  '99491': {
    code: '99491',
    program: 'ccm',
    name: 'CCM by Physician/QHP (first 30 min)',
    description: 'First 30 minutes personally provided by physician',
    rate: 82.16,
    minMinutes: 30,
    whoProvides: 'Physician/QHP',
    isAddOn: false,
  },
  '99437': {
    code: '99437',
    program: 'ccm',
    name: 'CCM by Physician/QHP (add-on 30 min)',
    description: 'Each additional 30 minutes by physician (max 2x/month)',
    rate: 57.58,
    minMinutes: 30,
    whoProvides: 'Physician/QHP',
    isAddOn: true,
    addOnTo: '99491',
  },
  '99487': {
    code: '99487',
    program: 'ccm',
    name: 'CCM Complex (first 60 min)',
    description: 'First 60 minutes, moderate-to-high complexity MDM',
    rate: 87.00,
    minMinutes: 60,
    whoProvides: 'Clinical staff',
    isAddOn: false,
  },
}

export function suggestCptCode(program: 'tcm' | 'ccm', totalMinutes: number): string {
  if (program === 'tcm') return '99496' // Default to high complexity
  if (totalMinutes >= 60) return '99487'
  if (totalMinutes >= 30) return '99491'
  return '99490'
}

export function getThreshold(cptCode: string): number {
  return CPT_CODES[cptCode]?.minMinutes ?? 0
}
```

**Step 3:** Commit

```bash
git add src/lib/follow-up/billingTypes.ts src/lib/follow-up/cptCodes.ts
git commit -m "feat(billing): add billing types and CPT code definitions"
```

---

## Task 4: Analytics API Route

**Files:**
- Create: `src/app/api/follow-up/analytics/route.ts`

**Step 1:** Implement GET endpoint

Accepts query params `from` and `to` (ISO date strings). Defaults: `from` = 30 days ago, `to` = now.

Queries `followup_sessions` for:
1. Total count, completed count → completion rate
2. Average `duration_seconds`
3. Group by week for volume chart
4. Aggregate `medications_discussed` JSONB for adherence rates
5. Count `functional_status` values
6. Count `follow_up_method` values
7. Group `escalation_level` values for distribution

Queries `followup_escalations` for recent items (last 10).

Queries `followup_billing_entries` for estimated revenue (sum `cpt_rate` where `billing_status` in ('ready_to_bill', 'billed')).

Returns `AnalyticsData` shape from `billingTypes.ts`.

Pattern: matches existing API routes — `createClient()` from `@/lib/supabase/server`, error handling with try/catch, NextResponse.json.

Note: Medication adherence calculation requires parsing the `medications_discussed` JSONB column. Each session stores an array of `{ medication, filled, taking, sideEffects }`. Aggregate across all sessions: filledRate = count(filled=true) / total, etc.

Functional status aggregation: count sessions where `functional_status = 'better'` / total completed sessions, etc.

**Step 2:** Commit

```bash
git add src/app/api/follow-up/analytics/route.ts
git commit -m "feat(analytics): add aggregated analytics API endpoint"
```

---

## Task 5: Billing API Routes

**Files:**
- Create: `src/app/api/follow-up/billing/route.ts`
- Create: `src/app/api/follow-up/billing/export/route.ts`

**Step 1:** Implement billing CRUD endpoint

`GET /api/follow-up/billing?month=2026-02` — Returns all billing entries for the month, joined with session data (follow_up_method, escalation_level, conversation_status).

`POST /api/follow-up/billing` — Creates or updates a billing entry. Request body includes all editable fields (program, cpt_code, time phases, billing_status, reviewed_by, notes, TCM fields). Computes `total_minutes` and `meets_threshold` server-side. Uses upsert on `session_id` to avoid duplicates.

**Step 2:** Implement export endpoint

`GET /api/follow-up/billing/export?month=2026-02&format=csv` — Returns a downloadable file.

CSV format: columns for patient_name, service_date, program, cpt_code, cpt_rate, prep_minutes, call_minutes, documentation_minutes, coordination_minutes, total_minutes, meets_threshold, billing_status, reviewed_by, notes.

PDF format: For POC, generate a simple HTML-to-text formatted summary. True PDF generation can be deferred (would need a library like jsPDF or server-side rendering). For now, return a formatted text document with `.txt` extension that's print-friendly.

Headers: `Content-Disposition: attachment; filename=billing-2026-02.csv`

**Step 3:** Commit

```bash
git add src/app/api/follow-up/billing/route.ts src/app/api/follow-up/billing/export/route.ts
git commit -m "feat(billing): add billing CRUD and export API endpoints"
```

---

## Task 6: Auto-Create Billing Entry on Session Complete

**Files:**
- Modify: `src/app/api/follow-up/message/route.ts`

**Step 1:** Add billing entry auto-creation

In the message route, find the section where `conversation_complete` is set to `true` (when the AI indicates wrap-up is done). After updating the session status to `completed`, insert a new row into `followup_billing_entries` with smart defaults:

```typescript
// After setting conversation_status = 'completed'
const callMinutes = Math.ceil((durationSeconds || 0) / 60)
const hasEscalation = escalationLevel !== 'none' && escalationLevel !== 'informational'
const coordMinutes = hasEscalation ? 10 : 0
const totalMinutes = 2 + callMinutes + 5 + coordMinutes

await supabase.from('followup_billing_entries').insert({
  session_id: currentSessionId,
  patient_id: patientId || null,
  patient_name: patient_context.name,
  service_date: new Date().toISOString().split('T')[0],
  billing_month: new Date().toISOString().slice(0, 7),
  program: 'ccm',
  cpt_code: suggestCptCode('ccm', totalMinutes),
  cpt_rate: CPT_CODES[suggestCptCode('ccm', totalMinutes)]?.rate || 37.07,
  prep_minutes: 2,
  call_minutes: callMinutes,
  documentation_minutes: 5,
  coordination_minutes: coordMinutes,
  total_minutes: totalMinutes,
  meets_threshold: totalMinutes >= (CPT_CODES[suggestCptCode('ccm', totalMinutes)]?.minMinutes || 20),
  billing_status: 'not_reviewed',
})
```

Import `suggestCptCode` and `CPT_CODES` from `@/lib/follow-up/cptCodes`.

This should be a best-effort insert — wrap in try/catch so a billing insert failure doesn't break the conversation response.

**Step 2:** Commit

```bash
git add src/app/api/follow-up/message/route.ts
git commit -m "feat(billing): auto-create billing entry when session completes"
```

---

## Task 7: Hub Page + Relocate Conversation

**Files:**
- Move: `src/app/follow-up/page.tsx` → `src/app/follow-up/conversation/page.tsx`
- Create: `src/app/follow-up/page.tsx` (new hub page)
- Create: `src/components/follow-up/HubTile.tsx`

**Step 1:** Relocate existing conversation page

Move `src/app/follow-up/page.tsx` to `src/app/follow-up/conversation/page.tsx`. The file content stays identical — Next.js App Router handles the route change automatically.

```bash
mkdir -p src/app/follow-up/conversation
mv src/app/follow-up/page.tsx src/app/follow-up/conversation/page.tsx
```

**Step 2:** Create HubTile component

`HubTile.tsx` — A reusable tile component for the hub page.

Props:
```typescript
{
  href: string
  icon: React.ReactNode
  title: string
  description: string
  cta: string
  accentColor: string // e.g., '#16A34A'
}
```

UI: Card with icon circle, title, description, CTA button. Dark theme. Hover effect with accent-colored border glow. Same card styling as LandingPage cards but slightly smaller.

**Step 3:** Create new hub page

`src/app/follow-up/page.tsx` — Hub page with header and 3 tiles.

Header: Same green bar as before but title changes to "Post-Visit Follow-Up Center". Back link goes to `/` (Home).

Three HubTile cards in a centered row:

1. **Start Follow-Up** — Phone icon, "Initiate a patient follow-up call via SMS or voice", "Launch Follow-Up →", links to `/follow-up/conversation`, accent green `#16A34A`
2. **Analytics Dashboard** — Bar chart icon, "Completion rates, escalation trends, medication adherence patterns", "View Analytics →", links to `/follow-up/analytics`, accent blue `#3B82F6`
3. **Billing & Time Tracking** — Dollar/receipt icon, "TCM/CCM billing worksheets, phased time tracking, CSV/PDF export", "Open Billing →", links to `/follow-up/billing`, accent amber `#F59E0B`

Below tiles: `DisclaimerBanner`

**Step 4:** Commit

```bash
git add src/app/follow-up/page.tsx src/app/follow-up/conversation/page.tsx src/components/follow-up/HubTile.tsx
git commit -m "feat(follow-up): convert to hub page with conversation, analytics, billing tiles"
```

---

## Task 8: StatCard Component

**Files:**
- Create: `src/components/follow-up/StatCard.tsx`

**Step 1:** Build reusable stat card

Props: `{ label: string; value: string | number; subtitle?: string; color?: string }`

UI: Compact card showing a large value (font-size 2rem, bold), label below in muted text, optional subtitle in even smaller muted text. Dark background `#1e293b`, border `#334155`, `borderRadius: 12px`. Optional accent `color` on the value text.

Used by both analytics and billing pages for their summary stat rows.

**Step 2:** Commit

```bash
git add src/components/follow-up/StatCard.tsx
git commit -m "feat(follow-up): add reusable StatCard component"
```

---

## Task 9: Analytics Dashboard Page

**Files:**
- Create: `src/app/follow-up/analytics/page.tsx`
- Create: `src/components/follow-up/AnalyticsDashboard.tsx`
- Create: `src/components/follow-up/EscalationTable.tsx`

**Step 1:** Build EscalationTable component

Props: `{ escalations: AnalyticsData['recentEscalations'] }`

UI: Table with columns: Patient, Tier (color-coded badge), Category, Date, Acknowledged (checkmark/x). Rows clickable (could link to session in future). Dark themed table with alternating row backgrounds.

**Step 2:** Build AnalyticsDashboard component

Props: `{ data: AnalyticsData }`

This is the main analytics content component. Renders:

1. **Summary stat cards** — 4 StatCard components in a row (Total Calls, Completion Rate as %, Avg Duration formatted as "Xm", Est. Revenue as $X,XXX)

2. **Charts section — Operational** (side by side):
   - Follow-Up Volume: `<BarChart>` from Recharts with `<Bar>` in green
   - Completion Rate Trend: `<LineChart>` with `<Line>` in blue

3. **Charts section — Clinical** (side by side):
   - Escalation Distribution: `<PieChart>` with `<Pie>` using tier colors (red/orange/yellow/green)
   - Medication Adherence: `<BarChart>` horizontal with 3 bars (Filled/Taking/Side Effects)

4. **Charts section — Secondary** (side by side):
   - Functional Status: `<BarChart>` horizontal (Better green / Same yellow / Worse red)
   - Mode Distribution: `<PieChart>` donut (SMS vs Voice)

5. **Recent Escalations**: `<EscalationTable>` component

All Recharts components use dark theme: `fill` colors matching our palette, no grid lines, axis text in `#94a3b8`, tooltip with dark bg.

Recharts imports needed:
```typescript
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
```

Wrap each chart in `<ResponsiveContainer width="100%" height={250}>`.

**Step 3:** Build analytics page

`src/app/follow-up/analytics/page.tsx` — `'use client'` page.

State: `data: AnalyticsData | null`, `loading: boolean`, `error: string | null`, `dateRange: '7d' | '30d' | 'all'`

On mount and when `dateRange` changes, fetch `GET /api/follow-up/analytics?from=X&to=Y`. Calculate `from` based on dateRange selection.

Header: Green bar with "← Follow-Up Center" (links to `/follow-up`), "Analytics Dashboard", Demo badge.

Date range filter: 3 pill buttons below header ("Last 7 Days", "Last 30 Days", "All Time").

Content: Loading spinner while fetching, error state, then `<AnalyticsDashboard data={data} />` when loaded.

**Step 4:** Commit

```bash
git add src/app/follow-up/analytics/page.tsx src/components/follow-up/AnalyticsDashboard.tsx src/components/follow-up/EscalationTable.tsx
git commit -m "feat(analytics): add analytics dashboard page with Recharts visualizations"
```

---

## Task 10: Billing Components

**Files:**
- Create: `src/components/follow-up/BillingGuide.tsx`
- Create: `src/components/follow-up/CptReference.tsx`
- Create: `src/components/follow-up/BillingEntryCard.tsx`
- Create: `src/components/follow-up/BillingWorksheet.tsx`

**Step 1:** Build BillingGuide component

No props. Collapsible educational panel explaining:
- What counts as billable time (with the 4 phases: prep, call oversight, documentation review, coordination)
- Note that AI processing time is NOT billable, only human clinical staff time
- Difference between TCM and CCM programs
- CMS documentation requirements for audits

Uses `useState` for expanded/collapsed state. Yellow-tinted info background matching the DisclaimerBanner style. Default: expanded on first visit (could use localStorage to remember).

**Step 2:** Build CptReference component

No props. Static reference table showing all CPT codes from `CPT_CODES` constant, organized in two columns: TCM Codes (left) and CCM Codes (right). Each row: code, name, rate, minimum minutes, who provides.

**Step 3:** Build BillingEntryCard component

Props:
```typescript
{
  entry: BillingEntry
  onUpdate: (updates: Partial<BillingEntry>) => void
}
```

UI: Card showing one billing entry with:
- Header: Patient name, date, mode badge, call duration
- Program selector: dropdown (TCM/CCM)
- CPT code: auto-suggested based on program + total minutes, displayed with rate
- Time breakdown table: 4 rows (Prep, Call Oversight, Documentation Review, Coordination) with "Suggested" column (read-only defaults) and "Actual" column (editable number inputs). Call minutes are read-only (auto from session).
- Total row with computed sum
- Threshold indicator: green checkmark or yellow warning
- TCM guardrails: if program=tcm, show discharge date input, contact-within-2-days checkbox, F2F-scheduled checkbox, plus warning text about requirements
- Status dropdown: Not Reviewed / Pending Review / Ready to Bill / Billed
- Reviewed by: text input
- Notes: textarea
- All editable fields call `onUpdate` with the changed fields

Time phase defaults (shown in "Suggested" column):
- Prep: 2 min
- Call Oversight: session duration (read-only)
- Documentation Review: 5 min
- Coordination: 0 min (10 if escalation_level is urgent or same_day)

**Step 4:** Build BillingWorksheet component

Props:
```typescript
{
  entries: BillingEntry[]
  summary: BillingMonthlySummary
  onUpdateEntry: (id: string, updates: Partial<BillingEntry>) => void
  onExport: (format: 'csv' | 'pdf') => void
}
```

UI: Renders in order:
1. Monthly summary stat cards (4x StatCard: Total Sessions, Billable, Total Time, Est. Revenue)
2. `<BillingGuide />` (collapsible)
3. List of `<BillingEntryCard />` components, one per entry
4. `<CptReference />` at the bottom

**Step 5:** Commit

```bash
git add src/components/follow-up/BillingGuide.tsx src/components/follow-up/CptReference.tsx src/components/follow-up/BillingEntryCard.tsx src/components/follow-up/BillingWorksheet.tsx
git commit -m "feat(billing): add billing worksheet components"
```

---

## Task 11: Billing Page

**Files:**
- Create: `src/app/follow-up/billing/page.tsx`

**Step 1:** Build billing page

`'use client'` page.

State: `entries: BillingEntry[]`, `summary: BillingMonthlySummary`, `loading: boolean`, `error: string | null`, `currentMonth: string` (YYYY-MM format, defaults to current month)

Month navigation: "◀" and "▶" buttons to go to previous/next month, with the month name displayed between them (e.g., "February 2026").

On mount and when `currentMonth` changes, fetch `GET /api/follow-up/billing?month=YYYY-MM`.

When a BillingEntryCard calls `onUpdate`, POST to `/api/follow-up/billing` with the entry ID and updates. On success, refetch the list.

Export buttons: "Export CSV" and "Export PDF" buttons in the header area. On click, navigate to `GET /api/follow-up/billing/export?month=YYYY-MM&format=csv` (or pdf) — browser downloads the file.

Header: Green bar with "← Follow-Up Center" (links to `/follow-up`), "Billing & Time Tracking", Demo badge.

Content: Loading spinner while fetching, then `<BillingWorksheet>` when loaded.

**Step 2:** Commit

```bash
git add src/app/follow-up/billing/page.tsx
git commit -m "feat(billing): add billing page with monthly worksheet"
```

---

## Task 12: Update Conversation Page Back Link

**Files:**
- Modify: `src/app/follow-up/conversation/page.tsx`

**Step 1:** Update header back link

Change the "← Home" link in the header from `/` to `/follow-up` and change the text to "Follow-Up Center". The user should navigate back to the hub, not all the way to the homepage.

**Step 2:** Commit

```bash
git add src/app/follow-up/conversation/page.tsx
git commit -m "fix(follow-up): update conversation page back link to hub"
```

---

## Task 13: Typecheck + Final Commit

**Step 1:** Run typecheck

```bash
cd /Users/stevearbogast/dev/repos/OPSamplehtml
npx tsc --noEmit
```

Fix any type errors in the new files (pre-existing errors in `tests/note-merge.test.ts` are expected and unrelated).

**Step 2:** Final commit if any fixes needed

```bash
git add -A
git commit -m "fix: resolve type errors in analytics/billing"
```

---

## Task 14: Push Branch

**Step 1:** Push to remote

```bash
git push origin feature/card-5-post-visit-agent
```

---

## Summary of Files Created/Modified

**New files (15):**
```
supabase/migrations/023_followup_billing.sql
src/lib/follow-up/billingTypes.ts
src/lib/follow-up/cptCodes.ts
src/app/api/follow-up/analytics/route.ts
src/app/api/follow-up/billing/route.ts
src/app/api/follow-up/billing/export/route.ts
src/app/follow-up/page.tsx (new hub — replaces old)
src/app/follow-up/conversation/page.tsx (relocated)
src/app/follow-up/analytics/page.tsx
src/app/follow-up/billing/page.tsx
src/components/follow-up/HubTile.tsx
src/components/follow-up/StatCard.tsx
src/components/follow-up/AnalyticsDashboard.tsx
src/components/follow-up/EscalationTable.tsx
src/components/follow-up/BillingGuide.tsx
src/components/follow-up/CptReference.tsx
src/components/follow-up/BillingEntryCard.tsx
src/components/follow-up/BillingWorksheet.tsx
```

**Modified files (1):**
```
src/app/api/follow-up/message/route.ts (add billing entry auto-creation)
```
