# Card 2: Operations Dashboard — Product Playbook

> **⚠️ ACTIVE DEVELOPMENT (February 2026):** This card has been renamed to **Operations Dashboard** (previously "Clinician Command Center"). The current build implements a 5-zone layout: Operational Summary (Zone 1, practice-wide metrics replacing the former Morning Briefing) + Status Bar + Action Queue + Patient Queue + Quick Access. The target audience is practice managers and medical directors (not individual clinicians — the clinician's daily view is now the Clinician Cockpit at `/physician`). The "My Patients / All Patients" toggle has been renamed to "By Provider / All Patients". For the current build's architecture, see the main CLAUDE.md and the codebase at `src/app/dashboard/` and `src/components/command-center/`.

---

## 1. Executive Summary

The Operations Dashboard (formerly Clinician Command Center) is the operational intelligence layer of the platform — a single-screen dashboard that aggregates real-time data from every other card into an actionable overview. It answers the question a clinic medical director, practice administrator, or supervising neurologist asks at 7:30 AM and again at 4:00 PM: "What needs my attention right now?" The Command Center pulls from the triage queue (Card 3), the follow-up escalation pipeline (Card 4), the wearable alert stream (Card 6), SDNE population trends (Card 5), and the physician schedule (Card 1) — and presents them in a unified, priority-sorted view. This is not a read-only analytics dashboard. It is a clinical operations tool with action buttons: acknowledge an alert, escalate to a physician, schedule a callback, open a patient chart, draft an order. For investors, the Command Center demonstrates platform maturity — it proves that the individual AI tools are not standalone experiments but components of an integrated clinical intelligence system. For health system administrators, it demonstrates the operational ROI: reduced time-to-action on escalations, measurable alert-to-resolution workflows, and population-level visibility into panel health. For Samsung and other technology partners, it shows how wearable data becomes clinically actionable at scale — not just for one patient, but across an entire panel.

> **Design principle (CMIO):** The Operations Dashboard is primarily a practice-level operations console for practice managers and medical directors — "which patients across the practice need intervention, and who is handling it." Individual clinician daily views are handled by the Clinician Cockpit (`/physician`). For a neurology group with 5 physicians and 3,000 patients, this is the bird's-eye view. The "By Provider" filter allows drilling into a single provider's panel.

---

## 2. How To Use This Section

- **Step 1:** Navigate to the Operations Dashboard from the homepage (bottom row, "Ongoing Care" track).
- **Step 2:** You will see four **Priority Lanes** at the top — color-coded swim lanes showing the most urgent items across the platform: Triage Queue (amber), Follow-Up Escalations (red/orange), Wearable Alerts (blue), and Pending Messages (teal). Each lane shows a count and the most urgent items.
- **Step 3:** Below the Priority Lanes, the **Patient Panel Overview** shows population-level metrics: total active patients, patients with active wearable monitoring, patients overdue for follow-up, and panel health score.
- **Step 4:** Click on any item in a Priority Lane to expand it. Expanded items show: patient name, clinical context, recommended action, and action buttons (Acknowledge, Escalate, Open Chart, Schedule Callback).
- **Step 5:** The **Activity Feed** on the right side shows a chronological log of all platform events: triage completions, follow-up conversations, wearable anomalies, schedule changes. Filter by event type or patient.
- **Step 6:** Use the **Time Range** selector to view today, this week, or this month. Historical views show trends: are escalations increasing? Are triage volumes growing?
- **Step 7:** The **Quick Access** panel provides one-click navigation to every other card in the platform, plus links to frequently used external tools (PACS, Epic, VizAI).
- **Step 8:** Use the **By Provider / All Patients** toggle to view one physician's panel or the entire practice.

---

## 3. Clinical Context & Problem Statement

### The Problem

Modern neurology practices generate an overwhelming volume of clinical data — and no one has a unified view.

1. **The MA/RN** checks the triage queue in one system, the patient messages in another, the wearable alerts in a third (if they exist at all), and the follow-up callbacks on a paper list. Information is fragmented across systems, windows, and browser tabs.
2. **The supervising neurologist** learns about urgent cases via interruption — a nurse walks into the office and says "we have a patient who reported a seizure on the follow-up call." There is no systematic feed of clinically significant events.
3. **The practice administrator** has no real-time visibility into clinical operations. Volume reports come monthly. Quality metrics come quarterly. By the time a problem is visible in the data, it's been a problem for weeks.
4. **Between-visit events are invisible.** A patient's Galaxy Watch detects 2 falls at 3 AM. An AI follow-up call captures "I've been feeling really hopeless." A triage referral arrives for a possible GBS case. These events happen asynchronously, and unless someone is actively checking each system, they pile up unaddressed.

The result: urgent items get missed, routine items create noise, and the clinical team spends time hunting for information instead of acting on it. This is not a technology problem — it's a cockpit design problem. The instruments exist, but no one built the instrument panel.

### The Clinical Workflow

```
Events occur (triage, follow-up, wearable, messages)
        ↓
Events accumulate in separate systems
        ↓
Clinical team discovers events through manual checking or interruption
        ↓
Response time varies: minutes for interruptions, hours/days for queue-checked items
```

The Operations Dashboard replaces this with:

```
Events occur → Operations Dashboard aggregates and prioritizes → Clinical team sees unified queue → Action taken → Resolution logged
```

### Who Uses This Dashboard

| Role | Primary Use | View |
|---|---|---|
| **MA/RN (Triage Team)** | Process triage queue, handle routine follow-up flags, manage schedule | Default view: all Priority Lanes, focus on routine items |
| **Neurologist** | Review escalated cases, make clinical decisions, monitor panel health | Filtered view: escalated items only + personal panel metrics |
| **Practice Administrator** | Monitor operational metrics, track volumes, identify bottlenecks | Analytics overlay: weekly/monthly trends, throughput metrics |
| **CMIO / Medical Director** | Quality oversight, protocol compliance, population health trends | Population view: cross-provider metrics, protocol adherence rates |

### Why AI Adds Value

- **Priority scoring**: AI ranks items by clinical urgency, not just arrival time — a possible GBS referral floats above a stable neuropathy even if it arrived later
- **Pattern detection**: AI identifies cross-system patterns that no single view reveals — "this patient's wearable shows declining activity AND they reported feeling worse on the follow-up call AND they missed their last appointment"
- **Alert fatigue reduction**: AI groups related alerts (3 wearable anomalies for the same patient become 1 consolidated alert) and suppresses known-benign patterns
- **Predictive flagging** (Phase 3): Based on wearable trends and follow-up data, AI predicts which patients are likely to need intervention before they trigger an explicit alert

---

## 4. Functional Requirements

### 4.1 Page Layout

| Section | Position | Details |
|---|---|---|
| **Top Bar** | Full width, sticky | Date/time range selector (Today / This Week / This Month / Custom), By Provider / All Patients toggle, Refresh button, Last updated timestamp |
| **Priority Lanes** | Full width, 4 columns | Four color-coded swim lanes: Triage Queue (amber), Follow-Up Escalations (red/orange), Wearable Alerts (blue), Pending Messages (teal). Each shows count + 3-5 most urgent items. |
| **Patient Panel Overview** | Full width, below Priority Lanes | Population-level metric cards in a horizontal row |
| **Main Content Area** | Left 65% | Expanded priority item list — all items from all lanes, merged and sorted by urgency |
| **Activity Feed** | Right 35% | Chronological event log with filters |
| **Quick Access** | Bottom or sidebar | Card navigation links + external tool links |

### 4.2 Priority Lanes — Detailed

**Lane 1: Triage Queue (Amber — `#F59E0B`)**

| Element | Details |
|---|---|
| **Source** | `triage_sessions` where `status = 'pending_review'` |
| **Count display** | "8 pending · 2 emergent" |
| **Sort order** | Emergent first, then by triage tier (urgent → semi-urgent → routine-priority → routine → non-urgent), then by `created_at` |
| **Item display** | Patient name, age/sex, triage tier badge (color-coded), chief complaint (truncated to 1 line), time in queue |
| **Emergent items** | Displayed with pulsing red border and "REDIRECT TO ED" label. These should never sit in a queue — the lane visually screams when an emergent case exists. |
| **Action buttons** | "Review" (opens full triage result), "Approve" (marks as approved), "Override" (opens override form), "Open Chart" (navigates to Card 1) |

> **Design rationale (CMIO):** An emergent triage result sitting in a queue is a patient safety issue. The UI must make it impossible to ignore: pulsing animation, top of list, and a dedicated "time in queue" counter that turns red after 15 minutes. In production, emergent triages would bypass this queue entirely and page the physician — but in the demo, showing it in the queue with urgency indicators is effective.

**Lane 2: Follow-Up Escalations (Red/Orange — `#DC2626` / `#EA580C`)**

| Element | Details |
|---|---|
| **Source** | `followup_escalations` where `acknowledged = false`, joined to `followup_sessions` |
| **Count display** | "3 escalated · 1 urgent · 2 same-day" |
| **Sort order** | Tier 1 (urgent/red) first, then Tier 2 (same-day/orange), then Tier 3 (next-visit/yellow) |
| **Item display** | Patient name, escalation tier badge, trigger text (what the patient said, truncated), follow-up method (SMS/voice icon), timestamp |
| **Tier 1 items** | Red background, bold text. Trigger text shown in full (not truncated) — the physician needs to see exactly what the patient said. |
| **Action buttons** | "Acknowledge" (mark as seen), "Call Patient" (opens phone dialer or queues callback), "Open Conversation" (links to Card 4 full transcript), "Open Chart" (links to Card 1), "Add to Chart" (pushes summary to clinical note) |

**Lane 3: Wearable Alerts (Blue — `#0EA5E9`)**

| Element | Details |
|---|---|
| **Source** | `wearable_alerts` where `acknowledged = false`, joined to `wearable_anomalies` and `wearable_patients` |
| **Count display** | "5 alerts · 2 critical" |
| **Sort order** | Urgent (red) first, then attention (orange), then informational (yellow) |
| **Item display** | Patient name, diagnosis badge, alert title, severity indicator, anomaly type (fall, seizure-like, sustained decline), detected timestamp |
| **Critical items** | Red severity indicator with count: "2 falls in 9 days" or "Seizure-like event detected" |
| **Consolidated alerts** | If multiple anomalies exist for the same patient in the same window, they are grouped into a single consolidated alert: "Linda Martinez: 2 falls (Day 19, Day 27) + sustained activity decline + rising tremor %" |
| **Action buttons** | "Acknowledge" (mark as reviewed), "View Timeline" (links to Card 6 patient timeline), "Open Chart" (links to Card 1), "Schedule Follow-up", "Auto-Draft Order" (pre-populates a PT referral or medication adjustment order) |

> **Design rationale (CMIO):** Wearable alerts are the noisiest lane. Without consolidation, 1,000 patients on wearable monitoring could generate 50+ alerts per day, most of which are informational or duplicate. The triage team (MA/RN) handles this lane by default — they review and batch-escalate only true clinical concerns to the neurologist's view. Tier 1 urgent alerts (falls, seizure-like events) bypass the triage team and go directly to both views.

**Lane 4: Pending Messages (Teal — `#0D9488`)**

| Element | Details |
|---|---|
| **Source** | `patient_messages` where `status = 'unread'` or `status = 'needs_response'` |
| **Count display** | "6 pending · 1 urgent" |
| **Sort order** | Urgent first, then by `created_at` (oldest first — FIFO for messages) |
| **Item display** | Patient name, message preview (first line, truncated), source (portal, phone, fax), timestamp, days waiting |
| **Urgent items** | Messages flagged by the AI historian (red flag), messages mentioning safety keywords, messages waiting >48 hours |
| **Action buttons** | "Read" (opens full message), "Reply" (opens response composer), "Route to Provider" (assigns to specific physician), "Open Chart" (links to Card 1) |

### 4.3 Patient Panel Overview

A row of metric cards showing population-level data:

| Metric | Source | Display |
|---|---|---|
| **Total Active Patients** | `patients` where active | Large number + small trend arrow (↑/↓ vs. last month) |
| **On Wearable Monitoring** | `wearable_patients` where monitoring active | Count + percentage of panel |
| **Follow-Up Completion Rate** | `followup_sessions` completed / total scheduled this week | Percentage with color: ≥90% green, 75-89% amber, <75% red |
| **Avg Time-to-Triage** | `triage_sessions` avg time from creation to physician review | Minutes. Target: <60 min for urgent, <24h for routine |
| **Avg Escalation Response** | `followup_escalations` avg time from creation to acknowledgment | Minutes. Color: <15 min green, 15-60 min amber, >60 min red |
| **Overdue Follow-Ups** | Patients past their scheduled follow-up window with no completed session | Count with severity: red if >10 patients overdue |
| **Panel Health Score** | AI-computed composite (Phase 2) | Score out of 100: stable baselines, few escalations, high follow-up rate = high score |

### 4.4 Activity Feed

| Element | Details |
|---|---|
| **Feed items** | Chronological list of platform events, newest first |
| **Event types** | Triage completed (amber dot), Follow-up conversation completed (green dot), Follow-up escalation (red dot), Wearable anomaly detected (blue dot), Wearable alert sent (blue dot), Schedule change (gray dot), Note signed (teal dot), Message received (teal dot) |
| **Per-item display** | Colored dot + timestamp + event description (1-2 lines) + patient name link + source card badge |
| **Filters** | Pill filters by event type: All, Triage, Follow-Up, Wearable, Schedule, Messages |
| **Patient filter** | Search box to filter feed to a specific patient |
| **Auto-refresh** | Feed updates via Supabase real-time subscription (demo: polling every 30 seconds) |

### 4.5 Merged Priority List (Main Content Area)

When the user wants a single unified view instead of separate lanes, the main content area shows all items merged and sorted by clinical priority:

| Priority Level | Items | Visual |
|---|---|---|
| **CRITICAL** | Emergent triage, Tier 1 follow-up escalations, urgent wearable alerts (falls, seizures) | Red left border, pulsing dot |
| **HIGH** | Urgent triage, Tier 2 follow-up escalations, attention wearable alerts | Orange left border |
| **MODERATE** | Semi-urgent triage, Tier 3 follow-up flags, informational wearable alerts, messages >24h | Yellow left border |
| **ROUTINE** | Routine/non-urgent triage, Tier 4 informational, new messages | No border (default) |

Each item in the merged list shows:
- Source badge (Triage / Follow-Up / Wearable / Message)
- Patient name and age/sex
- Clinical summary (1-2 lines)
- Time in queue / time since detection
- Action buttons appropriate to the item type

### 4.6 Quick Access Panel

| Link | Destination | Icon |
|---|---|---|
| AI Triage Tool | `/triage` | Brain |
| Physician Workspace | `/physician` | CalendarClock |
| Digital Neuro Exam | `/sdne` | Activity |
| Patient Portal | `/patient` | Users |
| Post-Visit Follow-Up | `/follow-up` | MessageSquare |
| Wearable Monitoring | `/wearable` | Watch |
| PACS Viewer | External link | Image |
| Epic / EHR | External link | FileText |

### 4.7 Sample Demo Data

The Command Center should be pre-populated with data that tells a coherent story across all lanes:

**Triage Queue:**
- Harold Jennings, 74M — Routine-priority, possible parkinsonism (same patient from Card 3 demo)
- Sarah Mitchell, 28F — Semi-urgent, chronic migraine, failed 3 preventives (Card 3 demo)
- Eleanor Voss, 66F — Semi-urgent, new tremor (Card 3 demo)
- Carlos Delgado, 58M — Urgent, progressive bilateral leg weakness (suspected GBS) (Card 3 demo)
- Vague Referral — Insufficient data, "eval for headache" (Card 3 demo)
- 3 additional routine triages (background volume)

**Follow-Up Escalations:**
- James Okonkwo, 42M — **URGENT**: Reported seizure 2 days post-visit (Card 4 demo, Scenario 2)
- Robert Alvarez, 55M — **CRITICAL**: Expressed hopelessness, safety protocol activated (Card 4 demo, Scenario 4)
- Keisha Brown, 28F — **URGENT**: Ran out of Keppra 3 days ago, insurance issue (Card 4 demo, Scenario 6)

**Wearable Alerts:**
- Linda Martinez, 58F — **URGENT**: 2 falls in 9 days, sustained tremor increase, activity decline (Card 6 demo patient)
- Demo Patient B — **ATTENTION**: Sleep fragmentation increase over 5 days, possible MS fatigue pattern
- Demo Patient C — **INFORMATIONAL**: Step count 15% below baseline, within normal seasonal variation

**Pending Messages:**
- Dorothy Chen, 72F — Insurance denied donepezil prescription, asking for prior auth (Card 4 demo, Scenario 3)
- 3 routine patient portal messages (scheduling requests, medication refills)
- 2 referral faxes awaiting processing

**Activity Feed (Last 24 Hours):**
```
4:30 PM — Triage completed: Carlos Delgado → URGENT (GBS suspected)
3:15 PM — Follow-up escalation: Robert Alvarez → CRITICAL (safety protocol)
2:45 PM — Wearable alert: Linda Martinez → Fall detected (2nd in 9 days)
1:30 PM — Follow-up completed: Maria Santos → No escalation (routine)
12:00 PM — Triage completed: Sarah Mitchell → Semi-urgent (chronic migraine)
11:15 AM — Follow-up escalation: James Okonkwo → URGENT (seizure reported)
10:30 AM — Wearable alert: Linda Martinez → Sustained activity decline detected
9:00 AM — Follow-up escalation: Keisha Brown → URGENT (Keppra cessation)
8:30 AM — Schedule: 12 patients scheduled for today
8:00 AM — Triage completed: Harold Jennings → Routine-priority (parkinsonism)
```

> **Design rationale (CMIO):** The demo data is carefully constructed so that the Operations Dashboard tells a story of an active neurology practice with a mix of routine and urgent items. The critical items (Robert Alvarez's safety protocol, Carlos Delgado's GBS, Keisha Brown's medication cessation) demonstrate the safety net value. The wearable alerts (Linda Martinez's falls) demonstrate the between-visit monitoring value. The routine items (scheduling messages, stable triages) demonstrate that the system handles volume. Every item in the Operations Dashboard can be traced back to a specific demo scenario in another card — this proves integration.

---

## 5. Technical Architecture

### 5.1 Frontend Components (React / Next.js)

```
src/
├── app/
│   └── dashboard/
│       └── page.tsx                          # Operations Dashboard page (renders CommandCenterDashboard)
├── components/
│   ├── CommandCenterDashboard.tsx             # Master orchestrator (Phase 1: hardcoded; Phase 2: live data)
│   │
│   │   # ── Priority Lane Components ──
│   ├── command-center/
│   │   ├── PriorityLanes.tsx                    # Four-column lane container
│   │   ├── TriageQueueLane.tsx                  # Triage queue lane (amber)
│   │   ├── FollowUpEscalationLane.tsx           # Follow-up escalations lane (red/orange)
│   │   ├── WearableAlertLane.tsx                # Wearable alerts lane (blue)
│   │   ├── PendingMessagesLane.tsx              # Pending messages lane (teal)
│   │   ├── PriorityLaneItem.tsx                 # Individual item card within a lane
│   │   ├── PriorityBadge.tsx                    # CRITICAL / HIGH / MODERATE / ROUTINE badge
│   │   ├── EmergentPulse.tsx                    # Pulsing animation for emergent/critical items
│   │   │
│   │   │   # ── Patient Panel Overview ──
│   │   ├── PanelOverview.tsx                    # Population-level metric cards row
│   │   ├── MetricCard.tsx                       # Individual metric card with trend arrow
│   │   │
│   │   │   # ── Merged Priority List ──
│   │   ├── MergedPriorityList.tsx               # All items merged and sorted by urgency
│   │   ├── MergedPriorityItem.tsx               # Individual merged item with source badge
│   │   ├── ActionButtonBar.tsx                  # Action buttons per item type
│   │   │
│   │   │   # ── Activity Feed ──
│   │   ├── ActivityFeed.tsx                     # Chronological event log
│   │   ├── ActivityFeedItem.tsx                 # Individual event with colored dot
│   │   ├── ActivityFeedFilters.tsx              # Event type and patient filters
│   │   │
│   │   │   # ── Controls ──
│   │   ├── TimeRangeSelector.tsx                # Today / This Week / This Month / Custom
│   │   ├── ProviderFilter.tsx                   # By Provider / All Patients toggle
│   │   ├── QuickAccessPanel.tsx                 # Card navigation + external tool links
│   │   └── DemoDisclaimer.tsx                   # "Simulated data" banner
```

### 5.2 Supabase Schema

The Operations Dashboard is primarily a **read-only aggregation view** — it reads from tables created by other cards. No new tables are needed for Phase 1. Phase 2 introduces operational tracking tables.

**Tables Read (All Existing)**

| Table | Source Card | Data Pulled |
|---|---|---|
| `triage_sessions` | Card 3 | Pending triages, tier, confidence, reasons, workup |
| `followup_sessions` | Card 4 | Active/completed conversations, escalation level |
| `followup_escalations` | Card 4 | Unacknowledged escalations with severity, trigger text |
| `wearable_patients` | Card 6 | Patients with active wearable monitoring |
| `wearable_anomalies` | Card 6 | Detected anomalies with severity |
| `wearable_alerts` | Card 6 | Generated alerts, acknowledged status |
| `wearable_daily_summaries` | Card 6 | Daily metrics for sparkline visualizations |
| `patient_messages` | Core | Pending patient messages |
| `patients` | Core | Patient demographics for display |
| `visits` | Core | Visit records for schedule data |
| `physician_schedules` | Card 1 | Schedule slots (Phase 2) |
| `sdne_sessions` | Card 5 | SDNE exam count and latest scores (for panel overview) |

**Phase 2: New Table: `command_center_actions`** (Audit trail for dashboard actions)

| Column | Type | Description |
|---|---|---|
| `id` | `uuid` (PK) | Action ID |
| `created_at` | `timestamptz` | Action timestamp |
| `user_id` | `uuid` (FK to auth.users) | Who took the action |
| `user_role` | `text` | ma, rn, physician, admin |
| `action_type` | `text` | acknowledge, escalate, schedule_callback, open_chart, route_to_provider, auto_draft_order |
| `source_type` | `text` | triage, follow_up, wearable, message |
| `source_id` | `uuid` | ID of the source item (triage_session, escalation, alert, message) |
| `patient_id` | `uuid` (FK) | Patient involved |
| `metadata` | `jsonb` | Additional context (e.g., escalation notes, provider routed to) |
| `resolution_time_seconds` | `integer` | Time from event creation to action (calculated) |

**Phase 2: New Table: `panel_health_snapshots`** (Daily computed panel health metrics)

| Column | Type | Description |
|---|---|---|
| `id` | `uuid` (PK) | Snapshot ID |
| `snapshot_date` | `date` | Date of snapshot |
| `physician_id` | `uuid` (FK, nullable) | Per-provider or null for practice-wide |
| `total_active_patients` | `integer` | Count of active patients |
| `patients_on_wearable` | `integer` | Count with active wearable monitoring |
| `follow_up_completion_rate` | `float` | Percentage of scheduled follow-ups completed |
| `avg_triage_time_minutes` | `float` | Average time from triage creation to physician review |
| `avg_escalation_response_minutes` | `float` | Average time from escalation to acknowledgment |
| `overdue_follow_ups` | `integer` | Patients past follow-up window |
| `panel_health_score` | `integer` | AI-computed composite score (0-100) |
| `score_components` | `jsonb` | Breakdown of panel health score components |

### 5.3 API Endpoints

**`GET /api/command-center`** — Fetch all Operations Dashboard data

Request query:
```
?date_range=today&physician_id=all
```

Response:
```json
{
  "timestamp": "2026-02-24T08:00:00Z",
  "triage_queue": {
    "total": 8,
    "emergent": 0,
    "urgent": 1,
    "items": [
      {
        "id": "uuid",
        "patient_name": "Carlos Delgado",
        "patient_age": 58,
        "patient_sex": "M",
        "triage_tier": "urgent",
        "triage_tier_display": "Urgent — Within 1 Week",
        "chief_complaint": "Progressive bilateral leg weakness x5 days",
        "red_flags": ["Rapidly progressive weakness — evaluate for GBS"],
        "created_at": "2026-02-24T16:30:00Z",
        "time_in_queue_minutes": 30,
        "status": "pending_review"
      }
    ]
  },
  "follow_up_escalations": {
    "total": 3,
    "urgent": 2,
    "critical": 1,
    "items": [
      {
        "id": "uuid",
        "session_id": "uuid",
        "patient_name": "Robert Alvarez",
        "patient_age": 55,
        "patient_sex": "M",
        "severity": "urgent",
        "trigger_text": "Honestly, I just feel hopeless. What's the point of all this?",
        "trigger_category": "suicidal_ideation",
        "ai_assessment": "Patient expressed passive suicidal ideation. Safety protocol activated.",
        "follow_up_method": "sms",
        "created_at": "2026-02-24T15:15:00Z",
        "acknowledged": false
      }
    ]
  },
  "wearable_alerts": {
    "total": 5,
    "critical": 2,
    "items": [
      {
        "id": "uuid",
        "patient_name": "Linda Martinez",
        "patient_age": 58,
        "patient_sex": "F",
        "primary_diagnosis": "Parkinson's Disease",
        "severity": "urgent",
        "title": "2 falls in 9 days + sustained activity decline",
        "anomalies": [
          { "type": "fall_event", "detected_at": "2026-02-05T03:15:00Z" },
          { "type": "fall_event", "detected_at": "2026-02-13T14:22:00Z" },
          { "type": "sustained_decline", "detected_at": "2026-02-10T08:00:00Z" }
        ],
        "recommended_action": "PT evaluation, medication review, home safety assessment",
        "acknowledged": false
      }
    ]
  },
  "pending_messages": {
    "total": 6,
    "urgent": 1,
    "items": [
      {
        "id": "uuid",
        "patient_name": "Dorothy Chen",
        "patient_age": 72,
        "patient_sex": "F",
        "preview": "My insurance denied the donepezil prescription...",
        "source": "patient_portal",
        "created_at": "2026-02-23T10:00:00Z",
        "days_waiting": 1
      }
    ]
  },
  "panel_overview": {
    "total_active_patients": 487,
    "on_wearable_monitoring": 43,
    "follow_up_completion_rate": 0.87,
    "avg_triage_time_minutes": 42,
    "avg_escalation_response_minutes": 8,
    "overdue_follow_ups": 6
  },
  "activity_feed": [
    {
      "event_type": "triage_completed",
      "timestamp": "2026-02-24T16:30:00Z",
      "description": "Triage completed: Carlos Delgado → URGENT (GBS suspected)",
      "patient_name": "Carlos Delgado",
      "source_card": "triage"
    }
  ]
}
```

**`POST /api/command-center/action`** — Log a dashboard action

Request:
```json
{
  "action_type": "acknowledge",
  "source_type": "follow_up",
  "source_id": "uuid",
  "patient_id": "uuid",
  "metadata": { "notes": "Called patient, spoke with daughter. Stable. Follow-up scheduled." }
}
```

**`GET /api/command-center/panel-health`** — Fetch panel health metrics

Request query:
```
?physician_id=uuid&date_range=30d
```

Response:
```json
{
  "current_score": 82,
  "trend": "stable",
  "components": {
    "follow_up_completion": { "score": 87, "weight": 0.25 },
    "escalation_response_time": { "score": 92, "weight": 0.25 },
    "triage_throughput": { "score": 78, "weight": 0.20 },
    "wearable_alert_resolution": { "score": 71, "weight": 0.15 },
    "message_response_time": { "score": 80, "weight": 0.15 }
  },
  "historical": [
    { "date": "2026-02-17", "score": 80 },
    { "date": "2026-02-24", "score": 82 }
  ]
}
```

### 5.4 External Services

| Service | Purpose |
|---|---|
| Supabase | Database queries across all card tables, real-time subscriptions for live updates |
| Supabase Realtime | Push updates to dashboard when new events occur (new triage, new escalation, new alert) |
| OpenAI gpt-5-mini | Panel health score computation, alert consolidation logic (Phase 2) |
| Vercel | Frontend hosting and serverless API routes |

### 5.5 Data Flow

```
Platform events occur in real-time:
  ├── Card 3: New triage session created
  ├── Card 4: Follow-up conversation triggers escalation
  ├── Card 6: Wearable anomaly detected, alert generated
  └── Core: Patient message received
        ↓
GET /api/command-center aggregates data:
  ├── SELECT from triage_sessions WHERE status = 'pending_review'
  ├── SELECT from followup_escalations WHERE acknowledged = false
  ├── SELECT from wearable_alerts WHERE acknowledged = false
  ├── SELECT from patient_messages WHERE status IN ('unread', 'needs_response')
  └── Compute panel_overview metrics from aggregate queries
        ↓
Frontend renders Priority Lanes + Panel Overview + Activity Feed
        ↓
User takes action (acknowledge, escalate, open chart, etc.)
        ↓
POST /api/command-center/action logs the action
        ↓
UPDATE source table (e.g., wearable_alerts SET acknowledged = true)
        ↓
Dashboard refreshes (real-time subscription or poll)
```

**Real-time Updates (Phase 2):**
```
Supabase Realtime subscription on:
  ├── triage_sessions (INSERT)
  ├── followup_escalations (INSERT)
  ├── wearable_alerts (INSERT)
  └── patient_messages (INSERT)
        ↓
On new event → Dashboard lane count increments
        ↓
If CRITICAL/URGENT → Visual pulse animation + optional browser notification
```

---

## 6. AI & Algorithm Design

### 6.1 What the AI Does

The AI in this card performs three functions (Phase 1 uses rules-based logic; Phase 2-3 add ML):

1. **Priority scoring**: Rank all items across all lanes by clinical urgency, creating the merged priority list
2. **Alert consolidation**: Group multiple related alerts for the same patient into a single actionable item
3. **Panel health computation** (Phase 2): Calculate a composite score reflecting overall panel health

### 6.2 Priority Scoring Algorithm

Phase 1 uses a deterministic rules-based priority system — no AI model needed.

**Priority Level Assignment Rules:**

```javascript
function assignPriority(item) {
  // CRITICAL — requires immediate action
  if (item.source === 'triage' && item.triage_tier === 'emergent') return 'CRITICAL';
  if (item.source === 'follow_up' && item.severity === 'urgent'
      && ['suicidal_ideation', 'stroke_symptoms', 'seizure', 'allergic_reaction',
          'abrupt_cessation'].includes(item.trigger_category)) return 'CRITICAL';
  if (item.source === 'wearable' && item.severity === 'urgent'
      && ['fall_event', 'seizure_like'].includes(item.anomaly_type)) return 'CRITICAL';

  // HIGH — requires same-day action
  if (item.source === 'triage' && item.triage_tier === 'urgent') return 'HIGH';
  if (item.source === 'follow_up' && item.severity === 'same_day') return 'HIGH';
  if (item.source === 'wearable' && item.severity === 'attention') return 'HIGH';
  if (item.source === 'message' && item.days_waiting >= 2) return 'HIGH';

  // MODERATE — requires action within 48 hours
  if (item.source === 'triage' && item.triage_tier === 'semi_urgent') return 'MODERATE';
  if (item.source === 'follow_up' && item.severity === 'next_visit') return 'MODERATE';
  if (item.source === 'wearable' && item.severity === 'informational') return 'MODERATE';
  if (item.source === 'message' && item.days_waiting >= 1) return 'MODERATE';

  // ROUTINE — can be addressed during normal workflow
  return 'ROUTINE';
}
```

**Sort Order Within Priority Level:**

```javascript
function sortItems(items) {
  return items.sort((a, b) => {
    // First: priority level (CRITICAL > HIGH > MODERATE > ROUTINE)
    const priorityOrder = { CRITICAL: 0, HIGH: 1, MODERATE: 2, ROUTINE: 3 };
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    // Second: time in queue (older items first — FIFO within same priority)
    return new Date(a.created_at) - new Date(b.created_at);
  });
}
```

### 6.3 Alert Consolidation Algorithm

When multiple alerts exist for the same patient, consolidate them:

```javascript
function consolidateAlerts(alerts) {
  const byPatient = groupBy(alerts, 'patient_id');

  return Object.entries(byPatient).map(([patientId, patientAlerts]) => {
    if (patientAlerts.length === 1) return patientAlerts[0];

    // Consolidated alert takes the highest severity
    const maxSeverity = patientAlerts.reduce((max, a) =>
      severityOrder[a.severity] < severityOrder[max.severity] ? a : max
    );

    return {
      ...maxSeverity,
      title: `${patientAlerts.length} alerts: ${patientAlerts.map(a => a.anomaly_type).join(', ')}`,
      consolidated: true,
      child_alerts: patientAlerts,
      recommended_action: deriveConsolidatedAction(patientAlerts)
    };
  });
}
```

### 6.4 Panel Health Score (Phase 2)

The panel health score is a composite of 5 operational metrics:

| Component | Weight | Calculation | Target |
|---|---|---|---|
| Follow-Up Completion | 25% | % of scheduled follow-ups completed this week | ≥90% = 100 points |
| Escalation Response Time | 25% | Avg minutes from escalation to acknowledgment | <15 min = 100 points |
| Triage Throughput | 20% | Avg hours from triage creation to physician review | <4h = 100 points |
| Wearable Alert Resolution | 15% | % of alerts acknowledged within 24 hours | ≥95% = 100 points |
| Message Response Time | 15% | Avg hours from message receipt to response | <24h = 100 points |

**Score Interpretation:**
- 90-100: Excellent — practice is running smoothly
- 75-89: Good — minor areas need attention
- 60-74: Fair — several areas need improvement
- <60: Needs attention — review operational workflows

### 6.5 Guardrails

| Guardrail | Implementation |
|---|---|
| No clinical decisions | Dashboard presents data and recommended actions but never makes clinical decisions. All actions require human initiation. |
| Escalation never suppressed | The consolidation algorithm can group alerts but never reduces severity or hides individual alerts. Every alert is accessible via drill-down. |
| Critical items always visible | CRITICAL items cannot be filtered, hidden, or collapsed. They persist at the top of every view until acknowledged. |
| Acknowledgment audit trail | Every acknowledgment, escalation, and action is logged in `command_center_actions` with timestamp, user, and role. |
| No auto-dismissal | Alerts and escalations do not auto-resolve. A human must explicitly acknowledge each item. |

---

## 7. Safety & Guardrails

### 7.1 Clinical Safety Boundaries

- **The Operations Dashboard is a routing and awareness tool, not a clinical decision engine.** It presents data and suggests actions. A human reviews and acts.
- **CRITICAL items cannot be dismissed without explicit action.** The pulsing animation and red border persist until the item is acknowledged. There is no "dismiss all" button for critical items.
- **Escalation acknowledgment creates an audit record.** When a physician acknowledges a follow-up escalation, the system records who acknowledged it, when, and what action was taken. This is the compliance audit trail.
- **The triage team (MA/RN) serves as the first filter for wearable alerts.** This prevents 50+ informational alerts per day from reaching the physician. However, Tier 1 urgent alerts (falls, seizure-like events) bypass the triage team and appear in both views simultaneously.
- **After-hours behavior**: Follow-up escalations that occur after clinic hours include after-hours messaging (Card 4 Section 7.2.1). The Operations Dashboard displays the after-hours flag prominently.

### 7.2 Alert Fatigue Prevention

| Risk | Mitigation |
|---|---|
| Too many wearable alerts | Consolidation groups related alerts. MA/RN triage team handles routine items. Phase 2 adds ML-based noise suppression. |
| Redundant follow-up flags | If a follow-up conversation triggers multiple escalations (e.g., patient reports seizure AND medication cessation), they are grouped under one patient entry with multiple severity indicators. |
| Stale triage items | Time-in-queue counter turns amber at 4 hours, red at 24 hours. Stale items float to the top of the queue. |
| Information overload | Provider filter restricts view to personal panel. Time range selector limits to today/this week. Merged priority list shows only highest-priority items by default with "Show all" expansion. |

### 7.3 Regulatory Considerations

- **HIPAA**: The Operations Dashboard displays PHI (patient names, diagnoses, clinical data) for multiple patients simultaneously. Access must be restricted to authorized clinical staff. Screen lock and session timeout apply. PHI toggle (from TopNav) redacts identifiers for presentations.
- **Clinical documentation**: Actions taken from the Operations Dashboard (acknowledge, escalate, schedule callback) are logged but do NOT constitute clinical documentation. The action log is an operational record, not a medical record.
- **Billing**: The Operations Dashboard facilitates RPM (Remote Patient Monitoring) and CCM (Chronic Care Management) billing by tracking time spent reviewing wearable data and follow-up summaries. Phase 3 adds billing code tracking.

### 7.4 UI Disclaimers

**On the Operations Dashboard page:**
> "This Operations Dashboard shows simulated aggregate data. In production, this view would pull real-time metrics from the EHR, wearable integrations, and AI follow-up system."

**On action buttons:**
> "All actions are logged. Clinical decisions based on this dashboard should be documented in the patient's medical record."

**On panel health metrics:**
> "Panel health scores are computed from operational metrics and are not clinical quality measures."

---

## 8. Demo Design

### 8.1 The 3-Minute Demo

**Minute 0:00-0:30 — The Problem Statement**
"You're the medical director of a neurology practice. It's 3 PM. Somewhere in your system, a patient reported a seizure on an AI follow-up call 2 hours ago. Another patient's wearable detected a fall at 3 AM. A referral for possible GBS has been sitting in the triage queue since lunch. And you don't know about any of it — because the information is scattered across four different systems. This is the Operations Dashboard."

**Minute 0:30-1:30 — The Priority Lanes**
- Point to the four Priority Lanes: "At a glance, I can see 8 pending triages, 3 follow-up escalations, 5 wearable alerts, and 6 pending messages."
- Click on Robert Alvarez in the Follow-Up Escalation lane (CRITICAL): "This patient expressed hopelessness during his AI follow-up call. The safety protocol was activated — 988 Lifeline number provided. This was flagged 45 minutes ago. I can see exactly what he said, and I can call him right from here."
- Click on Linda Martinez in the Wearable Alerts lane (URGENT): "Two falls in 9 days, plus her activity level is declining and her tremor is increasing. The system consolidated 4 separate anomalies into one actionable alert. I can open her timeline, schedule a follow-up, or draft a PT referral with one click."
- "None of this existed in any EHR. This information was generated by the platform's AI tools — triage, follow-up, wearable monitoring — and surfaced here in real-time."

**Minute 1:30-2:30 — The Operational Value**
- Point to the Panel Overview: "487 active patients, 43 on wearable monitoring, 87% follow-up completion rate, average escalation response time 8 minutes."
- Click on the Activity Feed: "Everything that happened today — triages completed, follow-up calls finished, wearable anomalies detected — in a single chronological view. Filter by patient, filter by event type."
- Point to the triage queue: "Carlos Delgado was triaged as urgent for possible GBS. He's been in the queue for 30 minutes. I can review the full triage result and approve or override — without leaving this screen."

**Minute 2:30-3:00 — The Revenue and Compliance Story**
- "Every action I take here is logged: when I reviewed the alert, what I did, how long it took. That's your compliance audit trail. And every minute I spend reviewing wearable data and follow-up conversations counts toward RPM and CCM billing — CPT 99453 through 99458. The Operations Dashboard doesn't just improve clinical operations — it documents the work that generates revenue."
- "This is not six separate tools. This is one platform. Triage feeds the queue. Follow-up catches problems. Wearables monitor between visits. And this Operations Dashboard is where it all comes together."

### 8.2 Key Wow Moments

1. **The Priority Lanes**: Four lanes, four sources, one screen. The audience immediately sees that information from triage, follow-up, wearables, and messages is unified. No other system does this in neurology.
2. **The CRITICAL escalation**: Robert Alvarez expressed hopelessness and the safety protocol activated. The audience sees the exact words the patient used, the AI's response, and the physician's action buttons — all in one place. This demonstrates the clinical safety net.
3. **Wearable alert consolidation**: Linda Martinez has 4 separate anomalies (2 falls, sustained decline, rising tremor) consolidated into a single actionable alert. This demonstrates that the system is intelligent, not just a notification firehose.
4. **Time-in-queue for GBS**: Carlos Delgado's possible GBS has been in the triage queue for 30 minutes. The timer is visible. In a real clinic, this referral might sit for days. The Command Center makes the wait time visible and creates urgency.
5. **The Activity Feed**: A real-time log of everything the platform did today. This demonstrates that the system is alive — not a static dashboard, but a continuously updating operational intelligence layer.

### 8.3 Demo Walkthrough Script

**Opening the Operations Dashboard:**
> "This is the Operations Dashboard — the bird's-eye view of your entire practice. Four priority lanes, each pulling from a different AI system in the platform."

**Follow-Up Escalation Lane:**
> "Let me start with the most critical item. Robert Alvarez — he was seen last week for Parkinson's, and during the AI follow-up call, he said 'I just feel hopeless. What's the point of all this?' The safety protocol activated immediately: 988 Lifeline number provided, clinical team flagged. I can see his exact words, the AI's response, and I can call him right now. This was caught by an AI — not a nurse who happened to call at the right time."

**Wearable Alerts Lane:**
> "Linda Martinez, Parkinson's patient. Her Galaxy Watch detected 2 falls in 9 days. But the system didn't just send me two separate fall alerts — it consolidated them with her other data: sustained activity decline and rising resting tremor. One alert, all the context I need, and I can draft a PT referral right from here."

**Triage Queue Lane:**
> "And look at the triage queue — Carlos Delgado, possible GBS. Progressive bilateral leg weakness over 5 days. Triaged as urgent. He's been in this queue for 30 minutes. In most practices, a referral like this sits in a fax tray for days. Here, it's visible, prioritized, and I can act on it immediately."

---

## 9. Phased Roadmap

### Phase 1: POC / Demo Version (Current Sprint)

**Scope:**
- Operations Dashboard page with 4 Priority Lanes populated from hardcoded demo data
- Status cards (existing) upgraded to interactive Priority Lane layout
- Quick Access panel linking to all 6 cards (existing, enhanced)
- Activity Feed with chronological demo events
- Patient Panel Overview with hardcoded metrics
- Demo data that overlaps with other cards' demo scenarios
- No real-time data integration (all pre-seeded)
- No action logging (actions are visual-only)

**Technical:**
- Next.js page at `/dashboard` (existing)
- Refactored `CommandCenterDashboard.tsx` from simple status cards to Priority Lane layout
- Hardcoded demo data matching other cards' demo scenarios
- No new Supabase tables needed (reads existing demo data or uses component-level constants)

**Timeline:** 1-2 development sessions

> **CMIO recommendation:** Phase 1 priority is the visual impact. Four color-coded Priority Lanes with real demo data that traces back to other cards — that's the demo. The Activity Feed adds temporal context. The action buttons can be visual-only for Phase 1 (click produces a toast/confirmation rather than writing to DB). The operational metrics (Panel Overview) can use hardcoded numbers that tell a plausible story.

### Phase 2: Live Data Integration

**New Features:**
- Live data queries from existing Supabase tables (triage_sessions, followup_escalations, wearable_alerts, patient_messages)
- Real-time updates via Supabase Realtime subscriptions
- Action logging to `command_center_actions` table
- Working action buttons: acknowledge writes to source table, escalate routes to physician, open chart navigates
- Panel health score computation (rules-based)
- Time-in-queue calculations with visual urgency indicators
- Provider filter for multi-physician practices
- Browser notifications for CRITICAL items
- Alert consolidation algorithm

**Timeline:** 2-4 months post-POC

### Phase 3: Production / Scaled Operations

**New Features:**
- ML-based priority scoring (replaces rules-based)
- Predictive flagging: AI predicts which patients are likely to need intervention based on trends
- Custom dashboard layouts per role (MA/RN view vs. physician view vs. administrator view)
- Shift handoff report: AI generates an end-of-day summary of outstanding items
- Multi-site aggregation: single Operations Dashboard across multiple clinic locations
- EHR integration: push action logs and acknowledgments to Epic/Athena
- RPM/CCM billing timer: tracks time spent on wearable review and follow-up review for billing codes
- Historical analytics: weekly/monthly trends for escalation volumes, response times, panel health
- Quality measure dashboards: MIPS, HEDIS, and practice-specific quality metrics
- Custom alert rules: configure per-practice thresholds for wearable anomaly detection

**What Changes Between Phases:**
- Phase 1 → 2: Hardcoded data becomes live Supabase queries. Actions become real (write to DB). Real-time subscriptions replace manual refresh.
- Phase 2 → 3: Rules-based scoring becomes ML. Single-site becomes multi-site. Adds billing integration, quality metrics, and predictive AI.

---

## 10. Open Questions & Decisions Needed

### Resolved

1. ~~**Layout approach**~~ → **RESOLVED:** Priority Lanes (swim lane pattern) rather than a single sorted list. Lanes preserve source context while the merged list provides a unified priority view.
2. ~~**Who sees what**~~ → **RESOLVED:** MA/RN triage team sees all lanes (default view). Neurologist sees only escalated items + personal panel. Configurable via Provider Filter.
3. ~~**Real-time vs. polling**~~ → **RESOLVED:** Phase 1: static demo data. Phase 2: Supabase Realtime subscriptions for inserts on key tables, with 30-second polling as fallback.
4. ~~**Alert consolidation approach**~~ → **RESOLVED:** Group by patient, take highest severity, show drill-down to individual alerts.

### Still Open

5. **Browser notifications**: Should CRITICAL items trigger browser push notifications? This is high-value (physician gets notified even if not looking at the dashboard) but adds complexity (notification permission, mobile support, do-not-disturb handling).
6. **Shift handoff workflow**: When the MA/RN shift ends, should the Operations Dashboard generate an automated handoff summary? If so, what does it include? Outstanding items, actions taken, items not yet addressed?
7. **Panel health score adoption**: Will physicians and administrators actually look at a composite panel health score, or is it a vanity metric? Consider: the score is most useful if it's benchmarked — "Your panel health is 82, practice average is 78, top quartile is 91."
8. **Wearable alert volume at scale**: With 1,000 patients on wearable monitoring, the Wearable Alerts lane could have 50+ items per day. Is the current consolidation algorithm sufficient, or do we need an ML-based noise filter from Phase 2?
9. **Cross-card action triggers**: When a physician acknowledges a wearable alert and clicks "Schedule Follow-up," should this trigger a Card 4 follow-up conversation automatically? Or just create a scheduling task for the MA? Automatic triggering is more integrated but creates a complex cross-card dependency.
10. **Dashboard access for non-clinical staff**: Should practice administrators (non-clinical) have access to the Operations Dashboard? They need operational metrics but should not see PHI. Consider a "de-identified view" that shows aggregate metrics without patient names.

### New Questions (from CMIO Review)

11. **Escalation response SLA**: Should the system enforce a response SLA (e.g., Tier 1 must be acknowledged within 15 minutes)? If the SLA is breached, what happens — auto-escalate to a backup physician? Send a text message to the attending?
12. **Duplicate event handling**: If a patient calls the office (creating a message) AND the AI follow-up detects the same issue (creating an escalation), the Operations Dashboard shows two items for the same problem. How should duplicates be handled — manual merge by MA, or AI-assisted deduplication?
13. **RPM billing integration**: RPM requires 16+ days of data collection AND 20+ minutes of clinical staff time per month per patient. Should the Operations Dashboard track both metrics per patient and flag when the billing threshold is reached? This is Phase 3 scope but architecture decisions affect Phase 2.
14. **Regulatory audit trail**: In production, the `command_center_actions` table becomes a HIPAA audit log. Should it be immutable (append-only, no updates/deletes)? Should it include the user's IP address and session ID?
