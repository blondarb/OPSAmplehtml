# Clinical Cockpit — Physician Workspace Redesign

**Date**: 2026-02-24
**Status**: Implemented (Phases 1-5)

## Problem

The physician workspace had two disconnected modes (appointments/calendar and chart/clinical note) with no unified notification system, no inter-provider communication, no incomplete documentation detection, and no wearable alert surfacing.

## Solution: Dashboard Home + Drill-Down

A unified **Clinical Cockpit** home view that surfaces everything needing physician attention alongside the schedule, with drill-down into focused chart work. An urgency banner persists across all views.

### Layout

```
┌──────────────────────────────────────────────────────┐
│ TopNav + Urgency Banner (persistent across views)    │
├────┬──────────────┬──────────────┬───────────────────┤
│Icon│ Schedule     │ Notification │ Provider           │
│Side│ Column       │ Feed         │ Communication      │
│bar │ (280px)      │ (flex)       │ (300px)            │
└────┴──────────────┴──────────────┴───────────────────┘
```

Clicking a patient or notification drills into the existing chart view.

## Database Schema

Four new tables plus one ALTER:

| Table | Purpose |
|-------|---------|
| `notifications` | Unified notification aggregator (9 source types, priority levels, snooze) |
| `provider_threads` | Chat thread metadata (patient-linked or general) |
| `provider_messages` | Messages within threads |
| `consult_requests` | Structured consult requests with urgency and type |
| `patient_messages` (ALTER) | Added `ai_draft`, `ai_assisted`, `draft_status` columns |

Migrations: `026_notifications.sql`, `027_provider_messages.sql`, `028_consult_requests.sql`, `029_patient_messages_ai.sql`

## API Routes

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/notifications` | GET, POST, PATCH | List/create/update notifications |
| `/api/provider-messages` | GET, POST | Messages in a thread |
| `/api/provider-messages/threads` | GET, POST | Thread CRUD |
| `/api/consults` | GET, POST, PATCH | Consult requests |
| `/api/incomplete-docs` | GET | Detect unsigned/incomplete notes |
| `/api/ai/draft-response` | POST | Generate AI draft for patient messages (GPT-5-mini) |

## UI Components

### UrgencyBanner (`src/components/UrgencyBanner.tsx`)
- Renders below TopNav when critical items exist
- Color-coded pill segments: red (alerts), blue (messages), orange (docs), purple (consults)
- Session-dismissable, slide-down animation

### PhysicianHome (`src/components/PhysicianHome.tsx`)
- Orchestrator for three-column layout with "Clinical Cockpit" header

### ScheduleColumn (`src/components/home/ScheduleColumn.tsx`)
- Mini week strip, today's patients with prep status dots and type badges
- Schedule Follow-up and New Patient buttons

### NotificationFeed (`src/components/home/NotificationFeed.tsx`)
- Filter tabs: All | Urgent | Messages | Tasks
- Priority-sorted cards for 9 notification types
- AI draft preview (collapsible) for patient message cards
- Per-card actions: Review & Send, Respond, Complete Now, Approve/Deny, etc.

### ProviderCommColumn (`src/components/home/ProviderCommColumn.tsx`)
- Team Chat threads with unread badges and patient-linked tags
- Quick Consult form: provider picker, type, urgency pills, question
- Recent consult history

### useNotificationCounts (`src/hooks/useNotificationCounts.ts`)
- Provides per-category counts for badges and urgency banner
- Polls every 30 seconds, falls back to demo data

## Integration

- `ClinicalNote.tsx` updated: new `'cockpit'` viewMode, updated IconSidebar with 5 functional icons + badges, UrgencyBanner between TopNav and content
- AI draft responses: always draft, never auto-send (physician reviews before sending)

## Design Decisions

1. **Dashboard Home + Drill-Down** over split-screen — matches Epic/Oracle mental model
2. **Unified notification table** — single source of truth for all notification types
3. **Demo data pattern** — hardcoded sample data with API fallback, consistent with rest of prototype
4. **GPT-5-mini for drafts** — cost-effective for message drafting; GPT-5.2 reserved for complex extraction
5. **Session-dismissable banner** — respects physician workflow without permanently hiding alerts
