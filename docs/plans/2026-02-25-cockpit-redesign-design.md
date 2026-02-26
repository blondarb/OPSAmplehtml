# Clinical Cockpit Redesign

**Date:** 2026-02-25
**Status:** Approved
**Scope:** `/physician` route — PhysicianHome, ScheduleColumn, MorningBriefing, NotificationFeed

## Summary

Redesign the Clinical Cockpit from a fixed 3-column layout to a 2-column layout with a slide-over notification drawer. Add calendar navigation, time-phased briefing, improved navigation, and richer notification cards with inline clinical data and quick actions.

## Current State

- 3-column layout: Schedule (280px) | Morning Briefing (flex) | Notifications (300px)
- Week strip shows Mon–Fri for current week only, no navigation
- Morning Briefing is static — generates once, labeled "Morning Briefing" regardless of time
- Notifications are always visible, show minimal data, no inline actions
- Navigation between cockpit/appointments/chart views lacks breadcrumbs or obvious back affordance
- All data is hardcoded demo data

## Design

### 1. Layout: 2-Column + Slide-Over Drawer

**Default view:** Two columns with notification drawer closed.

```
┌───────────────────────────────────────────────────────────┐
│  Clinical Cockpit         Feb 25, 2026       🔔 (4)      │
├────────────────────┬──────────────────────────────────────┤
│                    │                                      │
│  Schedule Column   │  Briefing & Context Column           │
│  (280–320px)       │  (flex: 1)                           │
│                    │                                      │
│  [< Mon–Fri >]     │  ┌─ Time-Phased Briefing ─────────┐ │
│  [📅 toggle]       │  │  Morning / Midday / End of Day  │ │
│                    │  │  AI narrative + reasoning        │ │
│  Appointment list  │  └─────────────────────────────────┘ │
│  + Prep buttons    │                                      │
│                    │  (remaining space available)          │
│                    │                                      │
└────────────────────┴──────────────────────────────────────┘
```

**Notification drawer** slides in from the right when bell icon is clicked:
- Width: 380px
- Overlays content (does not push columns)
- Slight backdrop dim (rgba(0,0,0,0.15))
- Close via: X button, backdrop click, or Esc key
- Smooth slide animation (300ms ease)

### 2. Calendar Navigation (Schedule Column)

#### Week Strip (Default)
- Keep existing Mon–Fri strip
- Add `<` / `>` arrows flanking the week strip for prev/next week navigation
- Add "Today" pill button that jumps back to current week (only visible when viewing a different week)
- Week strip remains interactive — click any day to view that day's schedule

#### Month Grid (Toggle)
- Calendar icon button below the week strip toggles a mini-month grid
- Standard 7-column calendar grid (Sun–Sat or Mon–Sun per locale)
- Days with appointments show a small teal dot indicator
- Click any day to:
  1. Collapse the month grid
  2. Navigate the week strip to that day's week
  3. Show that day's appointments
- Prev/next month arrows in the month header
- Current day highlighted with teal background
- Selected day highlighted with teal outline
- Clicking the calendar icon again collapses back to week strip only

#### Quick Prep Button
- Each appointment card gets a "Prep" icon button (teal, clipboard icon)
- Visible on hover (desktop) or always visible (mobile/touch)
- Clicking opens Chart Prep for that patient (calls `onSelectPatient` with a prep flag)

### 3. Time-Phased Briefing (Center Column)

The briefing card sits at the top of the center column. Its label, icon, and AI prompt focus change based on time of day:

| Phase | Hours | Label | Icon | Color Accent | Focus |
|-------|-------|-------|------|-------------|-------|
| Morning | < 11:00 | Morning Briefing | ☀️ sunrise | Amber/gold | Day preview, priorities, urgent patients, prep needs |
| Midday | 11:00–15:00 | Midday Update | 🌤 sun | Teal | Progress, new results, schedule changes, items needing attention |
| End of Day | > 15:00 | End of Day Summary | 🌅 sunset | Indigo/purple | Unsigned notes, pending tasks, incomplete docs, tomorrow prep |

**Behavior:**
- Phase is determined by `new Date().getHours()` on component mount and on a 5-minute interval
- Each phase uses a distinct system prompt variant (appended to existing briefing prompt)
- Timestamp shows "Updated X:XX AM/PM"
- Regenerate button persists across all phases
- Show reasoning toggle persists
- When significant new info arrives and the briefing is stale (>30 min since last generation), show a subtle "New info available · Refresh" badge on the regenerate button
- Dark gradient card styling is preserved from current MorningBriefing component
- The card takes only the space it needs — no forced full-height

**Below the briefing card:** Remaining space in the center column is available for future content. For now, it stays empty/clean.

### 4. Navigation Improvements

#### Breadcrumb Bar
- Appears below the Cockpit header when navigating away from the home view
- Format: `Clinical Cockpit > Patient Name` (when viewing appointments/chart)
- "Clinical Cockpit" is clickable — returns to cockpit view
- Styled as small text (13px), muted color, with `>` separator

#### Back Arrow
- Left-pointing arrow icon in the cockpit header area when in appointments or chart view
- Clicking returns to cockpit view (same as clicking "Clinical Cockpit" in breadcrumb)

#### Notification Drawer Toggle
- Bell icon with numeric badge in the Cockpit header (right-aligned)
- Badge shows count of unread/unacknowledged notifications
- Badge color: red for any critical, teal for normal
- Clicking toggles the drawer open/closed

### 5. Notification Drawer (Slide-Over)

#### Structure
- Header: "Notifications" title + X close button
- Filter tabs: All | Urgent | Messages | Tasks (same as current, with count badges)
- Scrollable notification list
- Each notification card enhanced with inline data and quick actions

#### Enhanced Notification Cards

**Inline clinical data snippets** (1–2 key data points shown directly on the card):

| Notification Type | Inline Data |
|-------------------|-------------|
| wearable_alert | Vitals: "BP: 180/95 · HR: 102 · SpO2: 94%" |
| refill_request | Med: "Topiramate 100mg · Last filled: 3/1/26" |
| lab_result | Key values: "TSH: 8.2 (H) · Free T4: 0.6 (L)" |
| incomplete_doc | Missing fields: "Missing: Assessment, Plan" |
| patient_message | First line of message text |
| consult_request | Requesting provider + urgency |
| care_gap | Scale name + days overdue: "PHQ-9 · 45 days overdue" |

**Expandable detail section:**
- Chevron toggle on each card
- Expands to show full clinical context:
  - Full vitals panel for wearable alerts
  - Medication history for refill requests
  - Complete lab panel for lab results
  - Full message thread preview for messages
  - Visit details for incomplete docs

**Quick action buttons** (per notification type):

| Notification Type | Primary Action | Secondary Action |
|-------------------|---------------|-----------------|
| refill_request | Approve | Deny |
| patient_message | Review Draft | Reply |
| lab_result | Acknowledge | View Full |
| incomplete_doc | Open Note | — |
| wearable_alert | View Patient | Acknowledge |
| consult_request | Accept | Decline |
| care_gap | Order Scale | Dismiss |

**Visual design:**
- Same accent color system as current (red for critical, blue for messages, etc.)
- Left border accent (3px) preserved
- Icon + colored background preserved
- Actions row at bottom of each card
- Expand/collapse with smooth animation

### 6. Files to Modify

| File | Change |
|------|--------|
| `src/components/PhysicianHome.tsx` | 2-column layout, add notification drawer trigger, breadcrumb support |
| `src/components/home/ScheduleColumn.tsx` | Week navigation arrows, month grid toggle, quick prep buttons |
| `src/components/command-center/MorningBriefing.tsx` | Time-phased labels/icons/prompts, refresh badge |
| `src/components/home/NotificationFeed.tsx` | Refactor to slide-over drawer, add inline data, expandable details, quick actions |
| `src/components/ClinicalNote.tsx` | Breadcrumb/back navigation support |

### 7. New Components (if needed)

| Component | Purpose |
|-----------|---------|
| `MiniCalendar` | Month grid calendar (could be inline in ScheduleColumn or extracted) |
| `NotificationDrawer` | Wrapper for slide-over behavior (backdrop, animation, close handlers) |

### 8. Demo Data Updates

Notification demo data needs enhancement to include clinical data fields:

```typescript
// Example enhanced notification
{
  id: 'n1',
  type: 'wearable_alert',
  priority: 'critical',
  title: 'Fall detected',
  patient: 'Linda Martinez',
  // NEW: inline clinical data
  clinicalData: {
    vitals: { bp: '180/95', hr: 102, spo2: 94 },
    timestamp: '2:15 PM today',
    location: 'Home'
  },
  // NEW: expanded detail
  detailText: 'Wearable detected sudden acceleration change consistent with fall event. Patient heart rate elevated post-event. No response to automated check-in prompt after 5 minutes.',
  // NEW: quick actions
  actions: [
    { label: 'View Patient', type: 'primary' },
    { label: 'Acknowledge', type: 'secondary' }
  ]
}
```

### 9. Non-Goals (This Phase)

- Real-time API data (remains demo data)
- Mobile-specific responsive layout changes
- Appointment CRUD (create/edit/cancel)
- Integration with external calendar systems
- Push notifications or WebSocket updates
