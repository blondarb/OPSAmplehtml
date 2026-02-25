# Command Center Revamp — Design Document

**Date:** 2026-02-25
**Route:** `/dashboard`
**Replaces:** Current `CommandCenterDashboard.tsx` (static placeholder)

---

## Overview

Revamp the Command Center from a static placeholder with hardcoded numbers into an AI-powered clinical operations hub. The page opens with an AI morning briefing, shows live aggregate metrics, presents batch-approvable AI-suggested actions, and provides a 3-level drill-down into patient-level data. Designed for both solo neurologists (my patients) and care navigators/practice managers (all patients).

## Approach

**AI Morning Briefing + Priority Queue** (Approach A from brainstorming):
- AI-generated narrative briefing at the top ("chief resident briefing" concept)
- Live aggregate metrics from all data sources
- AI action queue with batch-approve capability and confidence scores
- Priority patient queue with 3-level drill-down (queue → AI summary → full data)
- Role toggle (My Patients / All Patients)
- Hybrid data: queries live Supabase tables, falls back to seeded demo data if empty

## Page Structure

**Route:** `/dashboard` (existing)
**Shell:** `PlatformShell` + `FeatureSubHeader` (title: "Command Center", accent: `#4F46E5`)
**Background:** Dark gradient (`#0f172a` → `#1e293b`) matching existing pages

### Role Toggle

Segmented control in top-right of content area:
- **My Patients** — filters to logged-in physician's panel (demo: Dr. Arbogast)
- **All Patients** — practice-wide view for navigators/managers

### Time Context

"Today" label with date + dropdown: Today / Yesterday / Last 7 Days

### 5 Page Zones (top to bottom)

1. AI Morning Briefing
2. Aggregate Status Bar (8 tiles)
3. AI Action Queue (batch approve)
4. Priority Patient Queue (3-level drill-down)
5. Quick Access Links (condensed nav)

---

## Zone 1: AI Morning Briefing

A prominent card at top with subtle gradient border (indigo → teal).

### Layout

- **Header:** "Morning Briefing" + sparkle/AI icon + timestamp ("Generated 6:42 AM")
- **Body:** AI-generated 4-6 sentence narrative
- **Footer:** "Regenerate" button + "Show reasoning" toggle

### AI Briefing Content

The AI reads across ALL data sources and generates a prioritized narrative:

```
Good morning, Dr. Arbogast. You have 14 patients on your panel today.
3 need your attention: Maria Santos had her second fall in 9 days —
wearable data shows progressive tremor worsening and her PT referral
hasn't been placed yet. James Okonkwo reported a breakthrough seizure
during his post-visit follow-up yesterday — his levetiracetam level
may need adjustment. Dorothy Chen's family sent a message 2 days ago
that hasn't been read. On the positive side, 4 follow-up calls
completed overnight with no escalations, and your triage queue is clear.
```

### Design Rules

- Highlights top 3 most urgent items by patient name
- Ends with a "good news" line showing what's working
- "Show reasoning" reveals which data sources the AI consulted
- For demo: seeded data generates a compelling briefing every time
- For production: AI synthesizes from live Supabase queries

### API

`POST /api/command-center/briefing`
- Input: `{ physician_id, view_mode: 'my_patients' | 'all_patients', time_range }`
- AI model: GPT-5.2 (complex multi-source synthesis)
- Reads: `wearable_alerts`, `followup_sessions`, `patient_messages`, `triage_sessions`, `patient_medications`, `imaging_studies`, `visits`, `clinical_scale_history`
- Output: `{ narrative: string, reasoning: string[], urgent_count: number, generated_at: string }`

---

## Zone 2: Aggregate Status Bar

8 live metric tiles in a horizontal row (wraps on mobile, 2-column grid).

| # | Tile | Icon Color | Example | Sublabel | Data Source |
|---|------|-----------|---------|----------|-------------|
| 1 | Today's Schedule | Indigo `#4F46E5` | 9 patients | 2 new, 1 cancelled | `visits` WHERE date = today |
| 2 | Unanswered Messages | Teal `#0D9488` | 4 | 1 urgent, 2 days old | `patient_messages` WHERE is_read = false AND direction = 'inbound' |
| 3 | Pending Refills | Purple `#8B5CF6` | 3 | 1 overdue | `patient_medications` WHERE refill approaching/past |
| 4 | Missing Results | Orange `#F59E0B` | 2 | 1 MRI > 14 days | `imaging_studies` WHERE ordered but no impression |
| 5 | Wearable Alerts | Sky blue `#0EA5E9` | 5 | 2 urgent | `wearable_alerts` WHERE acknowledged = false |
| 6 | Follow-Up Escalations | Green `#16A34A` | 3 | 1 same-day | `followup_sessions` WHERE escalation_level IN ('same_day', 'urgent') |
| 7 | Triage Queue | Amber `#D97706` | 8 | 2 emergent | `triage_sessions` WHERE status = 'pending_review' |
| 8 | EHR Inbox | Slate `#64748B` | 6 | 3 results to sign | Seeded EHR demo data (Epic/Athena simulation) |

### Behavior

- Clicking any tile scrolls to Zone 4 (Priority Patient Queue) pre-filtered to that category
- Each tile has a small trend arrow (up/down/flat) compared to yesterday
- EHR items feed into native categories too (e.g., EHR "result to sign" also increments "Missing Results")

### Tile Component Design

```
┌─────────────────────┐
│  ● UNANSWERED MSGS  │  ← colored dot + uppercase label
│  4                   │  ← large number, colored
│  1 urgent, 2 days    │  ← gray sublabel
└─────────────────────┘
```

---

## Zone 3: AI Action Queue (Batch Approve)

Card with header "AI Suggested Actions" + sparkle icon + batch count.

### Action Item Structure

Each item contains:
- **Action type icon** (phone, message, clipboard, pill, calendar, etc.)
- **Confidence badge** — High (green), Medium (yellow), Low (orange)
- **Patient name + brief context**
- **Proposed action description**
- **Pre-drafted content** (expandable — click to see the actual message/order text)
- **Approve / Edit / Dismiss** buttons

### Action Categories

| Category | Icon | AI Drafts | What "Approve" Does | Example |
|----------|------|-----------|---------------------|---------|
| Send patient message | MessageCircle | Full message text | Marks as queued-to-send | Medication reminder, check-in |
| Automated follow-up call | Phone | Call script + context | Queues AI follow-up call | Post-visit check, missed appointment |
| Order suggestion | ClipboardList | Pre-filled order details | Shows order for physician signature | PT referral, lab order, imaging |
| Refill authorization | Pill | Refill details | Marks as authorized | Routine refill for stable chronic med |
| Prior auth follow-up | FileText | Fax/call script to insurance | Sends follow-up | PA pending > 14 days |
| Scale reminder | Activity | Patient-facing message with link | Sends to patient | Quarterly PHQ-9, annual MoCA |
| Care gap closure | AlertCircle | Message to patient or referring provider | Sends message | Missing sleep study report, PT referral loop |
| Appointment scheduling | Calendar | Proposed date/time | Confirms appointment | Overdue follow-up, post-escalation |
| Clinical summary for PCP | FileText | AI-generated letter | Queues for signature | Quarterly update to referring PCP |

### Batch Approve

- Actions of the same type are grouped under a batch header
- Example: "3 Refill Reminders" with "Approve All 3" button
- Batch approve button only appears when ALL items in the group are High confidence
- Mixed-confidence groups must be approved individually

### Confidence Scoring

- **High** (green badge): Routine, pattern-matched, low risk. Example: refill reminder for stable chronic med taken >6 months.
- **Medium** (yellow badge): Likely correct but worth a glance. Example: follow-up call for patient who missed appointment.
- **Low** (orange badge): AI is uncertain, definitely review. Example: order suggestion based on limited data.

### API

`GET /api/command-center/actions`
- Input: `{ physician_id, view_mode, time_range }`
- AI model: GPT-5.2
- Returns: `{ actions: ActionItem[], batch_groups: BatchGroup[] }`

`POST /api/command-center/actions/[id]/approve`
- Executes the approved action (demo: marks as completed, shows confirmation)

`POST /api/command-center/actions/batch-approve`
- Input: `{ action_ids: string[] }`
- Approves multiple actions at once

---

## Zone 4: Priority Patient Queue

Sortable, filterable list of patients needing attention. Sorted by urgency (most urgent first).

### Patient Row (Level 1 — Scan)

```
┌──┬───────────────────────────────────────────────────────────────┐
│▐ │ Maria Santos, 68F  · Parkinson's Disease                     │
│▐ │ [✉] [💊] [📺] [⌚]  "Progressive tremor + 2 falls. PT needed" │
│▐ │                                          Last: 2 days ago    │
└──┴───────────────────────────────────────────────────────────────┘
 ↑ colored severity border (red/orange/yellow/green)
```

**Row contents:**
- Colored left border indicating overall urgency (red = urgent, orange = attention, yellow = watch, green = stable)
- Patient name + age/sex
- Primary diagnosis
- Pending item icon badges (envelope, pill, image, watch, phone, brain) — each represents a category with pending items
- AI micro-summary — one sentence
- Last contact timestamp and method
- Source badges — small tags showing data origin ("Sevaro", "EHR", "Wearable")

### Expanded Patient Card (Level 2 — AI Summary)

Click a row to expand inline:

- **AI patient summary** — 3-5 sentences covering everything across all systems for this patient
- **Pending items list** with details:
  - "Unread message from daughter (2 days ago): 'Mom has been more confused this week...'"
  - "Donepezil refill due in 3 days"
  - "MRI Brain ordered 18 days ago — no report received"
  - "Wearable: tremor score increased 40% over last 7 days"
- **Recent event timeline** — last 7 days of events across all systems
- **Quick action buttons**: View Chart | View Wearable Data | View Follow-Up | Send Message

### Full Detail View (Level 3 — Deep Dive)

Click "View Full Details" or any quick action button → navigates to the relevant feature page (`/physician`, `/wearable`, `/follow-up`) with the patient pre-selected.

### Filters

- **Category filter**: Messages, Refills, Results, Wearables, Follow-ups, Triage, EHR, All
- **Urgency filter**: Urgent, Attention, Watch, All
- **Physician filter** (All Patients mode only): dropdown of physicians
- **Search**: by patient name

---

## Zone 5: Quick Access Links

Condensed horizontal strip at bottom. 6 pill-shaped links:

| Link | Route | Color Dot |
|------|-------|-----------|
| AI Triage | /triage | `#F59E0B` |
| Physician Workspace | /physician | `#0D9488` |
| Digital Neuro Exam | /sdne | `#1E40AF` |
| Patient Portal | /patient | `#8B5CF6` |
| Post-Visit Follow-Up | /follow-up | `#16A34A` |
| Wearable Monitoring | /wearable | `#0EA5E9` |

Same as current Quick Access but smaller, since the page above now does the real work.

---

## Neurology-Specific Intelligence

Beyond the core 8 metric categories, the AI briefing and action queue surface these neurology-specific items:

| Item | Clinical Rationale | How It Surfaces |
|------|-------------------|-----------------|
| Overdue clinical scales | PHQ-9/GAD-7 need periodic re-scoring; MoCA for memory patients | Badge: "MoCA due (last: 8 months ago)" + AI action: "Send scale reminder" |
| Medication interaction warnings | New Rx from PCP that interacts with anti-epileptics | AI briefing mention + urgent action item |
| SDNE exam trend alerts | Digital neuro exam scores declining over time | Badge: "SDNE tremor score +40% over 3 visits" |
| Prior authorization status | Specialty meds (Botox, CGRP, MS DMTs) need PA | Badge: "Ajovy PA pending 12 days" + AI action: "Send PA follow-up" |
| Lab monitoring reminders | Tegretol→CBC, Depakote→levels, MS DMTs→labs | Badge: "Depakote level overdue 4 months" + AI action: "Order lab" |
| Referral loop closure | Did the patient go to PT/OT/sleep as referred? | Badge: "Sleep study referral 6 weeks — no report" + AI action: "Send closure request" |
| EHR inbox items | Results to sign, referral responses, portal messages | Source-tagged items in relevant categories |

---

## EHR Integration (Simulated)

For the demo, EHR inbox data is seeded alongside native Sevaro data.

### How EHR Items Surface

- EHR items are **not** a separate silo — they feed into the existing categories
- A "result to sign" from Epic shows up in the "Missing Results" tile
- A patient portal message from Epic shows up in "Unanswered Messages"
- Each item carries a small **source badge** ("EHR" tag in slate gray) so the clinician knows the origin

### Seeded EHR Demo Data

| Item Type | Example | Maps To Category |
|-----------|---------|------------------|
| Result to sign | "MRI Brain — Linda Martinez" | Missing Results |
| Referral response | "PT evaluation completed for Maria Santos" | Care gap closure |
| Patient portal message | "Question about medication timing" | Unanswered Messages |
| Task notification | "Prior auth approved for Ajovy" | Pending Refills (resolved) |
| Lab result | "Depakote level: 82 mcg/mL (therapeutic)" | Missing Results (resolved) |

---

## Data Architecture

### Data Sources (Live Supabase Tables)

| Table | What We Query | For Zone |
|-------|--------------|----------|
| `patient_messages` | Unread inbound messages | Zones 1, 2, 4 |
| `patient_medications` | Refill dates, medication lists | Zones 1, 2, 3, 4 |
| `imaging_studies` | Ordered studies without results | Zones 1, 2, 4 |
| `wearable_alerts` | Unacknowledged alerts | Zones 1, 2, 4 |
| `wearable_anomalies` | Recent anomalies with AI assessment | Zones 1, 3 |
| `wearable_daily_summaries` | Trend data for patient summaries | Zone 4 |
| `followup_sessions` | Escalation levels, completion status | Zones 1, 2, 4 |
| `followup_escalations` | Unacknowledged escalations | Zones 1, 2, 3 |
| `triage_sessions` | Pending review items | Zones 1, 2, 4 |
| `visits` | Today's schedule | Zone 2 |
| `clinical_scale_history` | Overdue scales | Zones 3, 4 |
| `patients` | Demographics, diagnoses | All zones |

### New Supabase Table: `command_center_actions`

Stores AI-generated action suggestions and their approval status.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Action ID |
| created_at | timestamptz | When AI generated this action |
| physician_id | uuid | Target physician |
| patient_id | uuid (FK) | Related patient |
| action_type | text | message, call, order, refill, pa_followup, scale_reminder, care_gap, appointment, pcp_summary |
| title | text | Short action title |
| description | text | Context description |
| drafted_content | text | AI-drafted message/order text |
| confidence | text | high, medium, low |
| status | text | pending, approved, dismissed, executed |
| approved_at | timestamptz | When approved |
| approved_by | uuid | Who approved |
| batch_id | uuid | Group ID for batch actions |
| source_data | jsonb | References to source records that triggered this action |

### New Supabase Table: `command_center_briefings`

Caches AI briefings to avoid re-generating on every page load.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Briefing ID |
| created_at | timestamptz | Generation timestamp |
| physician_id | uuid | Target physician (null for all-patients view) |
| view_mode | text | my_patients, all_patients |
| time_range | text | today, yesterday, last_7_days |
| narrative | text | AI-generated briefing text |
| reasoning | jsonb | Data sources consulted |
| urgent_count | integer | Number of urgent items identified |
| data_snapshot | jsonb | Summary of data state at generation time |

### Seeded Demo Data

`scripts/seed-command-center-demo.ts`:
- 15-20 patients across various states
- Mix of urgent/attention/watch/stable patients
- Pre-generated EHR inbox items
- Pre-generated AI actions with varied confidence levels
- Realistic message threads, medication timelines, imaging orders
- Uses existing demo patients from other features (Maria Santos, James Okonkwo, Dorothy Chen, etc.) for cross-feature consistency

### Hybrid Data Strategy

```
1. Query live Supabase tables
2. If results are empty or insufficient (< 5 patients), merge with seeded demo data
3. AI briefing always uses whatever data is available
4. Seeded data is clearly marked with a "Demo" badge in the UI
```

---

## API Endpoints

### `POST /api/command-center/briefing`

Generates the AI morning briefing.

Request:
```json
{
  "physician_id": "uuid | null",
  "view_mode": "my_patients | all_patients",
  "time_range": "today | yesterday | last_7_days"
}
```

Response:
```json
{
  "narrative": "Good morning, Dr. Arbogast...",
  "reasoning": ["Queried wearable_alerts: 5 unacknowledged", "Queried patient_messages: 4 unread", ...],
  "urgent_count": 3,
  "generated_at": "2026-02-25T06:42:00Z"
}
```

### `GET /api/command-center/metrics`

Returns aggregate counts for the status bar tiles.

Response:
```json
{
  "schedule": { "total": 9, "new": 2, "cancelled": 1 },
  "messages": { "total": 4, "urgent": 1, "oldest_days": 2 },
  "refills": { "total": 3, "overdue": 1 },
  "results": { "total": 2, "oldest_days": 18 },
  "wearables": { "total": 5, "urgent": 2 },
  "followups": { "total": 3, "same_day": 1 },
  "triage": { "total": 8, "emergent": 2 },
  "ehr": { "total": 6, "results_to_sign": 3 }
}
```

### `GET /api/command-center/actions`

Returns AI-suggested actions.

Response:
```json
{
  "actions": [
    {
      "id": "uuid",
      "action_type": "order",
      "confidence": "high",
      "patient_name": "Maria Santos",
      "title": "PT referral",
      "description": "2nd fall in 9 days, progressive tremor worsening",
      "drafted_content": "Referral for Physical Therapy evaluation...",
      "batch_id": null
    }
  ],
  "batch_groups": [
    {
      "batch_id": "uuid",
      "action_type": "refill",
      "count": 3,
      "all_high_confidence": true,
      "label": "3 Refill Reminders"
    }
  ]
}
```

### `POST /api/command-center/actions/[id]/approve`

Approves a single action.

### `POST /api/command-center/actions/batch-approve`

Approves multiple actions. Request: `{ action_ids: string[] }`

### `GET /api/command-center/patients`

Returns the priority patient queue.

Query params: `?view_mode=my_patients&category=all&urgency=all&physician_id=&search=`

Response:
```json
{
  "patients": [
    {
      "id": "uuid",
      "name": "Maria Santos",
      "age": 68,
      "sex": "F",
      "primary_diagnosis": "Parkinson's Disease",
      "urgency": "urgent",
      "pending_items": {
        "messages": 0,
        "refills": 1,
        "results": 1,
        "wearables": 2,
        "followups": 0,
        "triage": 0,
        "scales": 1,
        "ehr": 0
      },
      "ai_micro_summary": "Progressive tremor worsening + 2 falls. PT referral needed.",
      "last_contact": { "date": "2026-02-23", "method": "wearable_alert" }
    }
  ]
}
```

### `GET /api/command-center/patients/[id]/summary`

Returns the Level 2 AI patient summary.

Response:
```json
{
  "ai_summary": "Maria Santos is a 68-year-old woman with Parkinson's Disease...",
  "pending_items": [...],
  "recent_events": [...],
  "quick_links": {
    "chart": "/physician?patient=uuid",
    "wearable": "/wearable?patient=uuid",
    "followup": "/follow-up?patient=uuid"
  }
}
```

---

## Component Structure

```
src/
├── app/
│   ├── dashboard/
│   │   └── page.tsx                              # Page shell (unchanged route)
│   └── api/
│       └── command-center/
│           ├── briefing/route.ts                 # AI briefing generation
│           ├── metrics/route.ts                  # Aggregate metric counts
│           ├── actions/
│           │   ├── route.ts                      # List AI actions
│           │   ├── [id]/approve/route.ts         # Approve single action
│           │   └── batch-approve/route.ts        # Batch approve
│           └── patients/
│               ├── route.ts                      # Priority patient queue
│               └── [id]/summary/route.ts         # Per-patient AI summary
├── components/
│   └── command-center/
│       ├── CommandCenterPage.tsx                  # Main page orchestrator
│       ├── RoleToggle.tsx                         # My Patients / All Patients segmented control
│       ├── TimeRangeSelector.tsx                  # Today / Yesterday / Last 7 Days
│       ├── MorningBriefing.tsx                    # Zone 1: AI briefing card
│       ├── StatusBar.tsx                          # Zone 2: 8-tile metric bar
│       ├── StatusTile.tsx                         # Individual metric tile
│       ├── ActionQueue.tsx                        # Zone 3: AI action queue container
│       ├── ActionItem.tsx                         # Individual action with approve/edit/dismiss
│       ├── ActionBatchGroup.tsx                   # Grouped batch-approvable actions
│       ├── ConfidenceBadge.tsx                    # High/Medium/Low confidence indicator
│       ├── DraftedContentPreview.tsx              # Expandable pre-drafted content
│       ├── PatientQueue.tsx                       # Zone 4: Priority patient list
│       ├── PatientRow.tsx                         # Level 1: scannable patient row
│       ├── PatientDetailCard.tsx                  # Level 2: expanded AI summary
│       ├── PendingItemBadges.tsx                  # Icon badges for pending categories
│       ├── SourceBadge.tsx                        # "Sevaro" / "EHR" / "Wearable" origin tag
│       ├── UrgencyIndicator.tsx                   # Red/orange/yellow/green severity
│       ├── QuickAccessStrip.tsx                   # Zone 5: condensed nav links
│       └── DisclaimerBanner.tsx                   # Demo disclaimer
├── lib/
│   └── command-center/
│       ├── types.ts                              # TypeScript types
│       ├── briefingPrompt.ts                     # System prompt for AI briefing
│       ├── actionPrompt.ts                       # System prompt for action generation
│       ├── patientSummaryPrompt.ts               # System prompt for per-patient summaries
│       └── demoData.ts                           # Seeded demo data for hybrid mode
scripts/
└── seed-command-center-demo.ts                   # Demo data seeder
supabase/
└── migrations/
    └── 026_command_center.sql                    # New tables
```

---

## Visual Design

### Colors (consistent with existing design system)

- Page background: `#0f172a` → `#1e293b` gradient
- Briefing card border: indigo → teal gradient
- Status tiles: each has its own accent color (listed above)
- Action items: white/slate cards on dark background
- Urgency colors: Red `#EF4444`, Orange `#F59E0B`, Yellow `#EAB308`, Green `#22C55E`
- Confidence: High `#22C55E`, Medium `#EAB308`, Low `#F97316`

### Typography

- Briefing narrative: 1rem, `#e2e8f0`, line-height 1.7
- Tile numbers: 2rem bold, tile accent color
- Patient names: 0.95rem bold, white
- AI summaries: 0.85rem, `#94a3b8`, italic
- Badges/labels: 0.7rem uppercase, letter-spacing 0.05em

### Responsive

- Desktop: all tiles in one row, patient queue full width
- Tablet: tiles in 2 rows of 4, queue full width
- Mobile: tiles in 2-column grid, patient rows stack vertically, briefing full width

---

## Deferred to Future Phases

- Real EHR integration (Epic FHIR, Athena API)
- Real-time WebSocket updates (currently polling on page load)
- Notification preferences (which alerts to surface, frequency)
- Customizable dashboard layout (drag-and-drop tiles)
- Shift handoff report generation
- Multi-clinic aggregation
- Audit trail for approved actions
- Role-based access control (which actions each role can approve)
- Scheduled briefing delivery (email/SMS morning briefing)
- Analytics on action approval rates and AI accuracy
