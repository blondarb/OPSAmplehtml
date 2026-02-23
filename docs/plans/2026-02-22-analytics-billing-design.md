# Follow-Up Analytics Dashboard & TCM/CCM Billing — Design Document

**Date:** 2026-02-22
**Depends on:** Card 5 Post-Visit Follow-Up Agent (branch `feature/card-5-post-visit-agent`)
**New Routes:** `/follow-up` (hub), `/follow-up/conversation`, `/follow-up/analytics`, `/follow-up/billing`

---

## Overview

Extends the Post-Visit Follow-Up Agent (Card 5) from a single conversation page into a three-part hub: follow-up conversations, an analytics dashboard with real charts, and a TCM/CCM billing worksheet with phased time tracking and CSV/PDF export.

## Approach

Approach A — Full Hub with Recharts:
- Card 5 becomes a hub page with 3 tiles linking to sub-routes
- Install Recharts for data visualization (bar, line, pie/donut charts)
- New `followup_billing_entries` table for phased time tracking
- Educational billing guide integrated into the worksheet
- Export capability for billing team handoff

## Hub Page Structure

Card 5 on the homepage still links to `/follow-up`, but that route becomes a hub page with 3 tiles:

1. **Start Follow-Up** → `/follow-up/conversation` (existing conversation page, relocated)
2. **Analytics Dashboard** → `/follow-up/analytics` (new)
3. **Billing & Time Tracking** → `/follow-up/billing` (new)

The existing conversation page moves from `/follow-up/page.tsx` to `/follow-up/conversation/page.tsx`. All its components stay the same.

## Analytics Dashboard (`/follow-up/analytics`)

Dual-audience dashboard (practice manager + clinician) with date range filter.

### Operational Metrics (top stat cards)

- **Total Calls** — count of `followup_sessions` in date range
- **Completion Rate** — `completed` sessions / total sessions
- **Avg Duration** — average `duration_seconds` across completed sessions
- **Est. Revenue** — sum of billable entries x applicable CPT rate

### Charts (Recharts)

- **Follow-Up Volume** — bar chart, sessions per week/day
- **Completion Rate Trend** — line chart, completion % over time
- **Escalation Distribution** — pie/donut chart by tier (urgent/same_day/next_visit/informational)
- **Medication Adherence** — horizontal bar: % filled, % taking, % reporting side effects
- **Functional Status** — horizontal bar: % better / same / worse
- **Mode Distribution** — donut chart: SMS vs Voice

### Recent Escalations Table

- Lists recent `followup_escalations` with patient name, tier badge, category, date, acknowledged status
- Color-coded tier badges (red/orange/yellow/green)

### Data Source

All queried from existing `followup_sessions` and `followup_escalations` tables. One new API route aggregates server-side.

## Billing & Time Tracking (`/follow-up/billing`)

Monthly worksheet for TCM/CCM billing with phased time tracking.

### Billable Time Model (AI-Assisted)

In the AI-assisted follow-up model, billable clinical staff time includes:

| Phase | Default | What the human does |
|---|---|---|
| Prep | 2 min | Reviews AI-prepared patient context before initiating |
| Call Oversight | auto from session | Monitors live dashboard while AI conducts conversation |
| Documentation Review | 5 min | Reviews and approves AI-generated clinical summary |
| Coordination | 0 or 10 min | Post-call actions: pharmacy calls, scheduling, escalation follow-up (0 if no escalation, 10 if escalation triggered) |

Note: AI processing time is NOT billable. Only human clinical staff time counts. The call oversight phase is billable because staff supervises the AI conversation in real-time via the live dashboard.

### CPT Code Reference

**TCM (Transitional Care Management) — Post-Discharge:**

| Code | Complexity | F2F Requirement | Rate |
|---|---|---|---|
| 99496 | High | Within 7 days of discharge | $272.68 |
| 99495 | Moderate | Within 14 days of discharge | $201.20 |

TCM requirements: Contact within 2 business days of discharge. Billed once per 30-day discharge period. Patient must not be readmitted.

**CCM (Chronic Care Management) — Ongoing Monthly:**

| Code | Time | Who Provides | Rate |
|---|---|---|---|
| 99490 | First 20 min | Clinical staff | $37.07 |
| 99439 | Each add'l 20 min (max 2x) | Clinical staff | $31.00 |
| 99491 | First 30 min | Physician/QHP personally | $82.16 |
| 99437 | Each add'l 30 min (max 2x) | Physician/QHP personally | $57.58 |
| 99487 | First 60 min (complex) | Clinical staff | $87.00 |

CCM requirements: Patient must have 2+ chronic conditions expected to last 12+ months. Documented patient consent required.

### Worksheet UI

Each completed follow-up session appears as a card showing:
- Patient name, date, mode (SMS/Voice), call duration
- Program selector (TCM/CCM dropdown)
- Auto-suggested CPT code based on program + total minutes
- Time breakdown with suggested defaults and editable actuals
- Threshold validation (green check if meets minimum, warning if under)
- TCM-specific guardrails (discharge date, 2-day contact window, F2F requirement)
- Billing status workflow: Not Reviewed → Pending Review → Ready to Bill → Billed
- Reviewer name and notes fields

### Monthly Summary (stat cards)

- Total Sessions this month
- Billable sessions (status = ready_to_bill or billed)
- Total Billable Time (sum of all total_minutes)
- Estimated Revenue (sum of applicable CPT rates)

### Educational Guide

Collapsible panel at top of billing page explaining:
- What activities count as billable time
- Difference between TCM and CCM
- CMS documentation requirements for audits
- That AI processing time is NOT billable, only human supervision/coordination

### Export

- **CSV**: All fields (patient, date, program, CPT code, time phases, total, status, reviewer, notes)
- **PDF**: Formatted billing summary report suitable for handoff to billing team

## Data Schema

### New Table: `followup_billing_entries`

| Column | Type | Description |
|---|---|---|
| id | uuid (PK) | Billing entry ID |
| session_id | uuid (FK → followup_sessions) | Link to follow-up session |
| created_at | timestamptz | Entry creation |
| updated_at | timestamptz | Last modification |
| patient_id | uuid (FK → patients) | Patient reference |
| patient_name | text | Display name |
| service_date | date | Date the follow-up occurred |
| billing_month | text | YYYY-MM for monthly grouping |
| program | text | 'tcm' or 'ccm' |
| cpt_code | text | CPT code (99490, 99491, 99495, 99496, 99487, etc.) |
| cpt_rate | numeric(8,2) | Reimbursement rate |
| prep_minutes | integer | Chart review / prep (default 2) |
| call_minutes | integer | Auto-filled from session duration |
| documentation_minutes | integer | Post-call review (default 5) |
| coordination_minutes | integer | Care coordination (default 0, 10 if escalation) |
| total_minutes | integer | Sum of all phases |
| meets_threshold | boolean | Whether total meets CPT minimum |
| billing_status | text | not_reviewed, pending_review, ready_to_bill, billed |
| reviewed_by | text | Reviewing clinician |
| reviewed_at | timestamptz | Review timestamp |
| notes | text | Free-text |
| tcm_discharge_date | date | For TCM entries only |
| tcm_contact_within_2_days | boolean | TCM compliance check |
| tcm_f2f_scheduled | boolean | TCM compliance check |

### Migration: `023_followup_billing.sql`

Creates table with indexes on `session_id`, `billing_month`, `billing_status`, `patient_id`.

## API Routes

| Route | Method | Purpose |
|---|---|---|
| `GET /api/follow-up/analytics` | GET | Aggregated metrics. Query: `from`, `to` date range. |
| `GET /api/follow-up/billing` | GET | Billing entries for a month. Query: `month=2026-02`. |
| `POST /api/follow-up/billing` | POST | Create or update a billing entry. |
| `GET /api/follow-up/billing/export` | GET | Export. Query: `month`, `format=csv\|pdf`. |

### Analytics Response Shape

```json
{
  "summary": { "totalCalls": 47, "completionRate": 0.89, "avgDuration": 720, "estimatedRevenue": 4260 },
  "volumeByPeriod": [{ "period": "2026-02-W1", "count": 12 }],
  "completionTrend": [{ "period": "2026-02-W1", "rate": 0.85 }],
  "escalationDistribution": { "urgent": 2, "same_day": 6, "next_visit": 13, "informational": 26 },
  "medicationAdherence": { "filledRate": 0.91, "takingRate": 0.85, "sideEffectRate": 0.22 },
  "functionalStatus": { "better": 0.62, "same": 0.31, "worse": 0.07 },
  "modeDistribution": { "sms": 32, "voice": 15 },
  "recentEscalations": []
}
```

### Auto-Creation Flow

When a follow-up session's `conversation_status` changes to `completed`, the message API creates a `followup_billing_entries` row with smart defaults:
- `call_minutes` from session `duration_seconds / 60`
- `prep_minutes` = 2
- `documentation_minutes` = 5
- `coordination_minutes` = 0 (10 if `escalation_level` != 'none')
- `program` = 'ccm' (default for neurology)
- `cpt_code` auto-suggested based on program + total minutes
- `billing_status` = 'not_reviewed'

## Tech Stack Addition

| Component | Choice | Rationale |
|---|---|---|
| Charts | Recharts | Lightweight (~45kb), React-native, composable, good for responsive charts |

## File Structure (New/Modified)

```
src/
├── app/
│   └── follow-up/
│       ├── page.tsx                              # Hub page (replaces current conversation page)
│       ├── conversation/
│       │   └── page.tsx                          # Existing conversation page (relocated)
│       ├── analytics/
│       │   └── page.tsx                          # Analytics dashboard
│       └── billing/
│           └── page.tsx                          # Billing worksheet
├── components/
│   └── follow-up/
│       ├── HubTile.tsx                           # Reusable hub tile component
│       ├── AnalyticsDashboard.tsx                # Main analytics component
│       ├── StatCard.tsx                          # Metric stat card
│       ├── EscalationTable.tsx                   # Recent escalations table
│       ├── BillingWorksheet.tsx                  # Main billing component
│       ├── BillingEntryCard.tsx                  # Individual session billing card
│       ├── BillingGuide.tsx                      # Educational collapsible panel
│       └── CptReference.tsx                      # CPT code reference table
├── lib/
│   └── follow-up/
│       ├── billingTypes.ts                       # Billing-specific types
│       └── cptCodes.ts                           # CPT code definitions and rates
supabase/
└── migrations/
    └── 023_followup_billing.sql                  # Billing entries table
```

## Deferred

- Actual claim submission / clearinghouse integration
- EHR write-back of billing entries
- Multi-provider billing (tracking which provider supervised each call)
- Add-on code logic (99439/99437 for additional time increments)
- Patient consent tracking for CCM enrollment
