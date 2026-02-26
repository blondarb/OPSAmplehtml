# Clinical Cockpit Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the Clinical Cockpit from a 3-column layout to a 2-column layout with slide-over notification drawer, calendar navigation, time-phased briefing, and improved navigation.

**Architecture:** The Cockpit (`/physician`) currently renders PhysicianHome with 3 inline columns (ScheduleColumn, MorningBriefing, NotificationFeed). We'll shift to 2 columns (Schedule + Briefing center area) with NotificationFeed refactored into a slide-over drawer triggered by a bell icon. ScheduleColumn gets week navigation and a toggleable month grid. MorningBriefing becomes time-phased (Morning/Midday/End of Day). Navigation gets breadcrumbs and a back arrow.

**Tech Stack:** Next.js 15, React, TypeScript, Tailwind/inline styles, Lucide icons

**Design doc:** `docs/plans/2026-02-25-cockpit-redesign-design.md`

---

## Task 1: Refactor PhysicianHome to 2-Column Layout + Notification Bell

**Files:**
- Modify: `src/components/PhysicianHome.tsx` (lines 1–84)

**Step 1: Add state and imports for notification drawer**

Add to the top of PhysicianHome:
```tsx
import { useState, useEffect } from 'react'
import { Bell, X } from 'lucide-react'
```

Add state inside the component:
```tsx
const [drawerOpen, setDrawerOpen] = useState(false)

// Close drawer on Esc
useEffect(() => {
  const handleKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') setDrawerOpen(false)
  }
  window.addEventListener('keydown', handleKey)
  return () => window.removeEventListener('keydown', handleKey)
}, [])
```

**Step 2: Replace the header to add the bell icon**

Replace the existing header's right-side "Online" badge section (lines 45–55) to include both the Online badge and a bell icon with a red badge showing notification count:

```tsx
<div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
  <span style={{
    display: 'flex', alignItems: 'center', gap: '4px',
    fontSize: '12px', fontWeight: 600, color: '#10B981',
    padding: '4px 10px', borderRadius: '20px', background: '#D1FAE5',
  }}>
    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981' }} />
    Online
  </span>
  {/* Notification bell */}
  <button
    onClick={() => setDrawerOpen(!drawerOpen)}
    style={{
      position: 'relative', background: 'none', border: 'none',
      cursor: 'pointer', padding: '6px', borderRadius: '8px',
      display: 'flex', alignItems: 'center',
      color: drawerOpen ? '#0D9488' : 'var(--text-muted)',
      transition: 'color 0.2s',
    }}
  >
    <Bell size={20} />
    <span style={{
      position: 'absolute', top: '2px', right: '2px',
      width: '16px', height: '16px', borderRadius: '50%',
      background: '#EF4444', color: 'white',
      fontSize: '9px', fontWeight: 700,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      4
    </span>
  </button>
</div>
```

**Step 3: Change the 3-column body to 2-column + drawer overlay**

Replace the 3-column flex container (lines 58–81) with a 2-column layout plus an overlay drawer:

```tsx
{/* Two-column layout: Schedule | Briefing */}
<div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
  <ScheduleColumn
    onSelectPatient={onSelectPatient}
    onScheduleNew={onScheduleNew}
    onScheduleFollowup={onScheduleFollowup}
  />
  <div style={{
    flex: 1,
    borderLeft: '1px solid var(--border)',
    overflow: 'auto',
    padding: '16px',
    background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
  }}>
    <MorningBriefing viewMode="my_patients" timeRange="today" />
  </div>

  {/* Notification Drawer Backdrop */}
  {drawerOpen && (
    <div
      onClick={() => setDrawerOpen(false)}
      style={{
        position: 'absolute', inset: 0,
        background: 'rgba(0,0,0,0.15)',
        zIndex: 10,
        transition: 'opacity 0.3s ease',
      }}
    />
  )}

  {/* Notification Drawer */}
  <div style={{
    position: 'absolute', top: 0, right: 0, bottom: 0,
    width: '380px', zIndex: 11,
    transform: drawerOpen ? 'translateX(0)' : 'translateX(100%)',
    transition: 'transform 0.3s ease',
    boxShadow: drawerOpen ? '-4px 0 24px rgba(0,0,0,0.12)' : 'none',
    display: 'flex', flexDirection: 'column',
    background: 'var(--bg-white)',
    borderLeft: '1px solid var(--border)',
  }}>
    {/* Drawer header */}
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '16px', borderBottom: '1px solid var(--border)',
    }}>
      <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
        Notifications
      </span>
      <button
        onClick={() => setDrawerOpen(false)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-muted)', padding: '4px', borderRadius: '6px',
        }}
      >
        <X size={18} />
      </button>
    </div>
    <div style={{ flex: 1, overflow: 'hidden' }}>
      <NotificationFeed
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        onAction={handleNotifAction}
        onNavigateToPatient={handleNavigateToPatient}
      />
    </div>
  </div>
</div>
```

**Step 4: Remove the borderRight from NotificationFeed**

In `src/components/home/NotificationFeed.tsx`, line 86, change the outer div style — remove `borderRight: '1px solid var(--border)'` and remove `minWidth: 0`. The drawer wrapper handles its own border now. Also remove `flex: 1` since the drawer controls width:

```tsx
<div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-white)' }}>
```

**Step 5: Verify the layout**

Run: `npm run dev`
Expected: Cockpit shows 2 columns (schedule + dark briefing). Bell icon in top-right with red "4" badge. Clicking bell slides in notification drawer from right. Clicking backdrop or X or pressing Esc closes it.

**Step 6: Commit**

```bash
git add src/components/PhysicianHome.tsx src/components/home/NotificationFeed.tsx
git commit -m "refactor: cockpit 2-column layout with notification slide-over drawer"
```

---

## Task 2: Week Navigation Arrows + Today Button on ScheduleColumn

**Files:**
- Modify: `src/components/home/ScheduleColumn.tsx` (lines 1–168)

**Step 1: Add week offset state and navigation logic**

Add state and computed dates at the top of the component (after existing state):

```tsx
const [weekOffset, setWeekOffset] = useState(0)

// Calculate the Monday of the displayed week
const displayMonday = new Date(today)
displayMonday.setDate(today.getDate() - todayDayIndex + (weekOffset * 7))

// Generate the 5 weekdays for the displayed week
const weekDays = WEEKDAYS.map((day, i) => {
  const d = new Date(displayMonday)
  d.setDate(displayMonday.getDate() + i)
  return { label: day, date: d.getDate(), month: d.getMonth(), year: d.getFullYear(), isToday: weekOffset === 0 && i === todayDayIndex }
})
```

**Step 2: Add prev/next arrows and Today button to the week strip**

Replace the week strip section (lines 63–82) with:

```tsx
{/* Week strip with navigation */}
<div style={{ padding: '12px 16px 8px', borderBottom: '1px solid var(--border)' }}>
  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
    {/* Prev week arrow */}
    <button
      onClick={() => setWeekOffset(prev => prev - 1)}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        padding: '4px', borderRadius: '6px', color: 'var(--text-muted)',
        fontSize: '16px', display: 'flex', alignItems: 'center',
      }}
      title="Previous week"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
    </button>

    {/* Day buttons */}
    {weekDays.map((wd, i) => (
      <div key={i} style={{
        flex: 1, textAlign: 'center', padding: '6px 0', borderRadius: '8px',
        fontSize: '12px', fontWeight: 600,
        background: wd.isToday ? '#0D9488' : 'transparent',
        color: wd.isToday ? 'white' : 'var(--text-muted)',
        cursor: 'pointer', transition: 'all 0.2s',
      }}>
        <div>{wd.label}</div>
        <div style={{ fontSize: '14px', fontWeight: 700, marginTop: '2px' }}>{wd.date}</div>
      </div>
    ))}

    {/* Next week arrow */}
    <button
      onClick={() => setWeekOffset(prev => prev + 1)}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        padding: '4px', borderRadius: '6px', color: 'var(--text-muted)',
        fontSize: '16px', display: 'flex', alignItems: 'center',
      }}
      title="Next week"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
    </button>
  </div>

  {/* Today button — only show when viewing a different week */}
  {weekOffset !== 0 && (
    <div style={{ display: 'flex', justifyContent: 'center', marginTop: '6px' }}>
      <button
        onClick={() => setWeekOffset(0)}
        style={{
          fontSize: '11px', fontWeight: 600, padding: '3px 12px',
          borderRadius: '12px', border: '1px solid #0D9488',
          background: 'transparent', color: '#0D9488', cursor: 'pointer',
        }}
      >
        Today
      </button>
    </div>
  )}
</div>
```

**Step 3: Update the "Today" label to reflect selected week**

Replace the today label (lines 84–92) with date-aware label:

```tsx
<div style={{ padding: '12px 16px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
    {weekOffset === 0 ? 'Today' : displayMonday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' week'} &middot; {DEMO_APPOINTMENTS.length} patients
  </span>
  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
    {(weekOffset === 0 ? today : displayMonday).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
  </span>
</div>
```

**Step 4: Verify**

Run: `npm run dev`
Expected: Left/right arrows flank the week strip. Clicking `<` shows previous week dates. Clicking `>` shows next week. "Today" pill appears when not on current week. Clicking "Today" returns to current week.

**Step 5: Commit**

```bash
git add src/components/home/ScheduleColumn.tsx
git commit -m "feat: add week navigation arrows and Today button to schedule column"
```

---

## Task 3: Toggleable Mini-Month Calendar Grid

**Files:**
- Modify: `src/components/home/ScheduleColumn.tsx`

**Step 1: Add month calendar state**

Add to the ScheduleColumn component:

```tsx
import { Calendar } from 'lucide-react'

const [showMonthGrid, setShowMonthGrid] = useState(false)
const [displayMonth, setDisplayMonth] = useState(today.getMonth())
const [displayYear, setDisplayYear] = useState(today.getFullYear())
```

**Step 2: Add calendar toggle button**

Add a calendar icon button right after the week strip section (after the Today button `div`), inside the same wrapper:

```tsx
{/* Calendar toggle */}
<div style={{ display: 'flex', justifyContent: 'center', marginTop: showMonthGrid ? '0' : '6px' }}>
  <button
    onClick={() => setShowMonthGrid(!showMonthGrid)}
    style={{
      background: showMonthGrid ? '#F0FDFA' : 'none',
      border: showMonthGrid ? '1px solid #99F6E4' : 'none',
      cursor: 'pointer', padding: '4px 8px', borderRadius: '6px',
      color: showMonthGrid ? '#0D9488' : 'var(--text-muted)',
      display: 'flex', alignItems: 'center', gap: '4px',
      fontSize: '11px', fontWeight: 600,
    }}
  >
    <Calendar size={14} />
    {showMonthGrid ? 'Hide calendar' : 'Month view'}
  </button>
</div>
```

**Step 3: Build the month grid component inline**

Add the month grid below the toggle button, inside the same padded section:

```tsx
{showMonthGrid && (
  <div style={{ marginTop: '8px', padding: '0 4px' }}>
    {/* Month header with prev/next */}
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
      <button
        onClick={() => {
          if (displayMonth === 0) { setDisplayMonth(11); setDisplayYear(y => y - 1) }
          else setDisplayMonth(m => m - 1)
        }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
        {new Date(displayYear, displayMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
      </span>
      <button
        onClick={() => {
          if (displayMonth === 11) { setDisplayMonth(0); setDisplayYear(y => y + 1) }
          else setDisplayMonth(m => m + 1)
        }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>

    {/* Day-of-week headers */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', marginBottom: '4px' }}>
      {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
        <span key={d} style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', padding: '2px 0' }}>{d}</span>
      ))}
    </div>

    {/* Calendar days grid */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center' }}>
      {(() => {
        const firstDay = new Date(displayYear, displayMonth, 1).getDay()
        const daysInMonth = new Date(displayYear, displayMonth + 1, 0).getDate()
        const cells: React.ReactNode[] = []
        // Empty cells before first day
        for (let i = 0; i < firstDay; i++) {
          cells.push(<div key={`empty-${i}`} />)
        }
        // Day cells
        for (let d = 1; d <= daysInMonth; d++) {
          const isToday = d === today.getDate() && displayMonth === today.getMonth() && displayYear === today.getFullYear()
          // Demo: dots on weekdays only (Mon-Fri) to simulate appointments
          const dayOfWeek = new Date(displayYear, displayMonth, d).getDay()
          const hasAppts = dayOfWeek >= 1 && dayOfWeek <= 5
          cells.push(
            <button
              key={d}
              onClick={() => {
                // Calculate week offset from today for the clicked date
                const clickedDate = new Date(displayYear, displayMonth, d)
                const diffDays = Math.floor((clickedDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
                const clickedDayOfWeek = clickedDate.getDay()
                // Find the Monday of clicked date's week
                const daysFromMonday = clickedDayOfWeek === 0 ? 6 : clickedDayOfWeek - 1
                const clickedMonday = new Date(clickedDate)
                clickedMonday.setDate(clickedDate.getDate() - daysFromMonday)
                const todayMonday = new Date(today)
                todayMonday.setDate(today.getDate() - todayDayIndex)
                const weekDiff = Math.round((clickedMonday.getTime() - todayMonday.getTime()) / (1000 * 60 * 60 * 24 * 7))
                setWeekOffset(weekDiff)
                setShowMonthGrid(false)
              }}
              style={{
                width: '28px', height: '28px', margin: '1px auto',
                borderRadius: '50%', border: 'none',
                background: isToday ? '#0D9488' : 'transparent',
                color: isToday ? 'white' : 'var(--text-primary)',
                fontSize: '12px', fontWeight: isToday ? 700 : 400,
                cursor: 'pointer', position: 'relative',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {d}
              {hasAppts && !isToday && (
                <span style={{
                  position: 'absolute', bottom: '1px', left: '50%', transform: 'translateX(-50%)',
                  width: '4px', height: '4px', borderRadius: '50%', background: '#0D9488',
                }} />
              )}
            </button>
          )
        }
        return cells
      })()}
    </div>
  </div>
)}
```

**Step 4: Verify**

Run: `npm run dev`
Expected: "Month view" button appears below week strip. Clicking it expands a mini calendar grid. Today is highlighted teal. Weekdays have small teal dots. Prev/next month arrows work. Clicking a day collapses the grid and navigates the week strip to that week. Clicking "Hide calendar" collapses it.

**Step 5: Commit**

```bash
git add src/components/home/ScheduleColumn.tsx
git commit -m "feat: add toggleable mini-month calendar grid to schedule column"
```

---

## Task 4: Quick Prep Button on Schedule Appointments

**Files:**
- Modify: `src/components/home/ScheduleColumn.tsx`

**Step 1: Add prep button to each appointment card**

Inside the appointment's top row (the flex container with time, name, and prep dot), add a prep button that appears on hover. Add `onPrepPatient` to props:

Update the ScheduleColumnProps interface:
```tsx
interface ScheduleColumnProps {
  onSelectPatient: (appointmentId: string) => void
  onPrepPatient?: (appointmentId: string) => void  // NEW
  onScheduleNew: () => void
  onScheduleFollowup: () => void
}
```

Add the prep button inside each appointment's top row, between the name and the prep dot:

```tsx
{/* Quick Prep button — visible on hover when prep not done */}
{apt.prepStatus !== 'done' && hoveredId === apt.id && (
  <button
    onClick={(e) => {
      e.stopPropagation()
      onPrepPatient?.(apt.id)
    }}
    title="Start Chart Prep"
    style={{
      background: '#F0FDFA', border: '1px solid #99F6E4',
      borderRadius: '6px', padding: '2px 8px',
      fontSize: '10px', fontWeight: 600, color: '#0D9488',
      cursor: 'pointer', whiteSpace: 'nowrap',
      transition: 'all 0.15s',
    }}
  >
    Prep
  </button>
)}
```

**Step 2: Update PhysicianHome to pass the onPrepPatient callback**

In `src/components/PhysicianHome.tsx`, add the callback:

```tsx
<ScheduleColumn
  onSelectPatient={onSelectPatient}
  onPrepPatient={(id) => {
    // Navigate to patient's chart prep
    onSelectPatient(id)
  }}
  onScheduleNew={onScheduleNew}
  onScheduleFollowup={onScheduleFollowup}
/>
```

**Step 3: Verify**

Run: `npm run dev`
Expected: Hovering over an appointment that needs prep (orange or red dot) shows a small teal "Prep" button. Clicking it triggers navigation. Done-prep appointments don't show the button.

**Step 4: Commit**

```bash
git add src/components/home/ScheduleColumn.tsx src/components/PhysicianHome.tsx
git commit -m "feat: add quick prep button on schedule appointments"
```

---

## Task 5: Time-Phased Briefing (Morning / Midday / End of Day)

**Files:**
- Modify: `src/components/command-center/MorningBriefing.tsx` (lines 1–328)

**Step 1: Add time phase logic and phase-specific config**

Add this above the component function:

```tsx
import { Sunrise, Sun, Sunset } from 'lucide-react'

type BriefingPhase = 'morning' | 'midday' | 'endofday'

function getCurrentPhase(): BriefingPhase {
  const hour = new Date().getHours()
  if (hour < 11) return 'morning'
  if (hour < 15) return 'midday'
  return 'endofday'
}

const PHASE_CONFIG: Record<BriefingPhase, { label: string; icon: typeof Sunrise; accentFrom: string; accentTo: string }> = {
  morning: { label: 'Morning Briefing', icon: Sunrise, accentFrom: '#F59E0B', accentTo: '#0D9488' },
  midday: { label: 'Midday Update', icon: Sun, accentFrom: '#0D9488', accentTo: '#3B82F6' },
  endofday: { label: 'End of Day Summary', icon: Sunset, accentFrom: '#6366F1', accentTo: '#8B5CF6' },
}

const FALLBACK_BRIEFINGS: Record<BriefingPhase, BriefingData> = {
  morning: {
    narrative: "Good morning, Dr. Arbogast. You have 14 patients on your panel today. Three need your attention: Maria Santos had her second fall in 9 days — wearable data shows progressive tremor worsening and her PT referral hasn't been placed yet. James Okonkwo reported a breakthrough seizure during his post-visit follow-up yesterday — his levetiracetam level may need adjustment. Dorothy Chen's family sent a message 2 days ago that hasn't been read — they report increased confusion this week. On the positive side, 4 follow-up calls completed overnight with no escalations, and your triage queue is clear.",
    reasoning: [
      'Queried wearable_alerts: 5 unacknowledged (2 urgent for Maria Santos)',
      'Queried followup_sessions: 3 escalations (1 same-day for James Okonkwo)',
      'Queried patient_messages: 4 unread inbound (1 from Dorothy Chen family)',
      'Queried visits: 14 scheduled today (2 new patients)',
      'Queried triage_sessions: 0 pending review',
      'Queried followup_sessions: 4 completed overnight, 0 escalated',
    ],
    urgent_count: 3,
    generated_at: new Date().toISOString(),
  },
  midday: {
    narrative: "Midday check-in, Dr. Arbogast. You've seen 5 of 8 patients so far. Robert Chen's headache evaluation flagged possible papilledema — Sarah ordered the MRI stat and results should be back by 3 PM. James Wilson's seizure workup is in progress; EEG is scheduled for tomorrow. Two new messages came in since this morning: Maria Garcia is asking about her Topiramate side effects (AI draft ready), and Helen Park's pharmacy sent a refill request for Keppra. One unsigned note from Robert Chen's visit needs your Assessment and Plan.",
    reasoning: [
      'Queried visits: 5 of 8 completed (3 remaining this afternoon)',
      'Queried imaging_orders: 1 stat MRI ordered for Robert Chen (pending)',
      'Queried patient_messages: 2 new since 8 AM (1 with AI draft ready)',
      'Queried refill_requests: 1 new (Helen Park — Keppra)',
      'Queried incomplete_docs: 1 unsigned note (Robert Chen — missing A&P)',
      'Queried wearable_alerts: Maria Santos fall alert acknowledged at 9:15 AM',
    ],
    urgent_count: 1,
    generated_at: new Date().toISOString(),
  },
  endofday: {
    narrative: "End of day wrap-up, Dr. Arbogast. All 8 patients have been seen. Two items need attention before you sign off: Robert Chen's note is still unsigned (Assessment and Plan sections missing — 2 days overdue now). Helen Park's Keppra refill request is pending your approval. On the positive side, Robert Chen's MRI came back normal (no papilledema confirmed), Maria Santos' PT referral was placed, and James Wilson's EEG is confirmed for tomorrow at 9 AM. Three follow-up calls are queued for tonight — no manual action needed.",
    reasoning: [
      'Queried visits: 8 of 8 completed (100% for today)',
      'Queried incomplete_docs: 2 unsigned notes (Robert Chen 2d overdue, Helen Park)',
      'Queried refill_requests: 1 pending approval (Helen Park — Keppra)',
      'Queried imaging_results: 1 new (Robert Chen MRI Brain — normal)',
      'Queried referrals: Maria Santos PT referral placed at 2:30 PM',
      'Queried followup_sessions: 3 queued for tonight, 0 require manual review',
    ],
    urgent_count: 2,
    generated_at: new Date().toISOString(),
  },
}
```

**Step 2: Update the component to use phase-based rendering**

Add phase state and periodic update:

```tsx
const [phase, setPhase] = useState<BriefingPhase>(getCurrentPhase)

// Check phase every 5 minutes
useEffect(() => {
  const interval = setInterval(() => {
    setPhase(getCurrentPhase())
  }, 5 * 60 * 1000)
  return () => clearInterval(interval)
}, [])
```

Update the fallback in fetchBriefing to use `FALLBACK_BRIEFINGS[phase]` instead of the single `FALLBACK_BRIEFING`.

**Step 3: Update the header to show phase icon and label**

Replace the hardcoded "Morning Briefing" label and sparkles icon in the header row with:

```tsx
const config = PHASE_CONFIG[phase]
const PhaseIcon = config.icon
```

Then in JSX:
```tsx
<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
  <PhaseIcon size={18} color="#0D9488" />
  <span style={{ fontSize: '1rem', fontWeight: 700, color: '#e2e8f0' }}>
    {config.label}
  </span>
</div>
```

**Step 4: Update the gradient border to use phase colors**

Replace the hardcoded `linear-gradient(135deg, #4F46E5, #0D9488)` with:

```tsx
background: `linear-gradient(135deg, ${config.accentFrom}, ${config.accentTo})`
```

Apply this to the outer wrapper, skeleton, and error state.

**Step 5: Remove the old single FALLBACK_BRIEFING constant**

Delete the old `FALLBACK_BRIEFING` constant (lines 18–31) since we now use `FALLBACK_BRIEFINGS`.

**Step 6: Verify**

Run: `npm run dev`
Expected: Briefing card shows the appropriate phase label and icon for the current time of day. The gradient border color shifts based on phase. The fallback narrative matches the time of day.

**Step 7: Commit**

```bash
git add src/components/command-center/MorningBriefing.tsx
git commit -m "feat: time-phased briefing (morning/midday/end of day)"
```

---

## Task 6: Enhanced Notification Cards with Inline Clinical Data

**Files:**
- Modify: `src/components/home/NotificationFeed.tsx` (lines 1–218)

**Step 1: Add clinicalData and expandable detail fields to the demo data type and entries**

Update the `DemoNotification` interface:

```tsx
interface DemoNotification {
  id: string
  sourceType: string
  priority: 'critical' | 'high' | 'normal' | 'low'
  title: string
  body: string
  time: string
  patientName?: string
  aiDraft?: string
  actionLabel: string
  secondaryAction?: string
  filterGroup: string
  // NEW fields
  clinicalSnippet?: string        // 1-2 key data points shown inline
  detailText?: string             // Full clinical context for expand
  quickActions?: { label: string; style: 'primary' | 'secondary' }[]  // Override default action buttons
}
```

Update each demo notification to include clinical snippets. For example:

- `n1` (fall detected): `clinicalSnippet: 'BP: 142/88 · HR: 92 · Last fall: 4h ago'`, `detailText: 'Wearable detected 2 fall events in 4 hours...`
- `n2` (seizure): `clinicalSnippet: 'HR spike: 145 bpm · Duration: 2m 14s'`
- `n3` (message): already has aiDraft, add `clinicalSnippet: 'Re: Topiramate 100mg dosage change'`
- `n8` (lab result): `clinicalSnippet: 'MRI Brain · Completed Feb 23'`
- `n9` (refill): `clinicalSnippet: 'Topiramate 50mg · 90-day · Last: Dec 2025'`, `quickActions: [{ label: 'Approve', style: 'primary' }, { label: 'Deny', style: 'secondary' }]`
- `n11` (care gap): `clinicalSnippet: 'PHQ-9 · Last: Sep 2025 (score: 12) · 45d overdue'`

**Step 2: Add expanded detail state and render the clinical snippet**

Add state:
```tsx
const [expandedDetail, setExpandedDetail] = useState<string | null>(null)
```

After the body text `<p>` and before the AI Draft section, add:

```tsx
{/* Inline clinical data snippet */}
{notif.clinicalSnippet && (
  <div style={{
    marginTop: '4px', padding: '4px 8px',
    borderRadius: '4px', background: 'var(--bg-gray)',
    fontSize: '11px', fontWeight: 500, color: 'var(--text-primary)',
    fontFamily: 'monospace',
    display: 'flex', alignItems: 'center', gap: '6px',
  }}>
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
    </svg>
    {notif.clinicalSnippet}
  </div>
)}
```

**Step 3: Add expandable detail section**

After the clinical snippet (and after the aiDraft section), add:

```tsx
{/* Expandable clinical detail */}
{notif.detailText && (
  <div style={{ marginTop: '6px' }}>
    <button
      onClick={() => setExpandedDetail(expandedDetail === notif.id ? null : notif.id)}
      style={{
        fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)',
        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: '4px',
      }}
    >
      {expandedDetail === notif.id ? 'Less detail ▴' : 'More detail ▾'}
    </button>
    {expandedDetail === notif.id && (
      <div style={{
        marginTop: '4px', padding: '8px 10px', borderRadius: '6px',
        background: '#F8FAFC', border: '1px solid var(--border)',
        fontSize: '12px', color: 'var(--text-primary)', lineHeight: 1.5,
      }}>
        {notif.detailText}
      </div>
    )}
  </div>
)}
```

**Step 4: Verify**

Run: `npm run dev`
Expected: Notification cards now show inline clinical data in a monospace snippet below the body text. Cards with detailText show a "More detail" toggle that expands to show full clinical context. Refill requests show Approve/Deny buttons.

**Step 5: Commit**

```bash
git add src/components/home/NotificationFeed.tsx
git commit -m "feat: enhanced notification cards with inline clinical data and expandable details"
```

---

## Task 7: Navigation Breadcrumbs and Back Arrow

**Files:**
- Modify: `src/components/ClinicalNote.tsx`
- Modify: `src/components/PhysicianHome.tsx`

**Step 1: Add breadcrumb state to ClinicalNote**

In ClinicalNote, around line 193 where `viewMode` state is defined, the component already tracks `viewMode`. We need to add a display name for the current patient when in chart/appointments mode. The patient name is already available via the `patient` prop.

**Step 2: Add breadcrumb bar when in non-cockpit views**

In ClinicalNote's render, just before the main content area where `viewMode === 'cockpit'` is checked (around line 1435), add a breadcrumb bar:

```tsx
{/* Breadcrumb navigation */}
{viewMode !== 'cockpit' && initialViewMode === 'cockpit' && (
  <div style={{
    padding: '8px 16px',
    borderBottom: '1px solid var(--border)',
    display: 'flex', alignItems: 'center', gap: '8px',
    background: 'var(--bg-white)',
  }}>
    <button
      onClick={() => setViewMode('cockpit')}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: 'var(--text-muted)', padding: '2px',
        display: 'flex', alignItems: 'center',
      }}
      title="Back to Cockpit"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
    </button>
    <button
      onClick={() => setViewMode('cockpit')}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: '#0D9488', fontSize: '13px', fontWeight: 500, padding: 0,
      }}
    >
      Clinical Cockpit
    </button>
    <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>&gt;</span>
    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
      {patient?.name || 'Patient'}
    </span>
  </div>
)}
```

**Step 3: Verify**

Run: `npm run dev`
Expected: When clicking an appointment from the Cockpit, a breadcrumb bar appears: `< Clinical Cockpit > Patient Name`. Clicking "Clinical Cockpit" or the back arrow returns to the Cockpit view. Breadcrumb does not appear when landing directly on `/ehr` (chart mode).

**Step 4: Commit**

```bash
git add src/components/ClinicalNote.tsx
git commit -m "feat: add breadcrumb navigation and back arrow for cockpit views"
```

---

## Task 8: Visual Polish and Integration Testing

**Files:**
- Review all modified files

**Step 1: Verify the complete flow**

Run `npm run dev` and test the full user journey:
1. Load `/physician` — see 2-column layout (schedule + briefing)
2. Click `<` / `>` week arrows — week strip navigates
3. Click "Month view" — month grid appears, click a day, grid collapses
4. Hover an un-prepped appointment — "Prep" button appears
5. Click bell icon — notification drawer slides in from right
6. See inline clinical data on notification cards
7. Expand a notification detail
8. Use Approve/Deny on a refill notification
9. Close drawer via X, backdrop click, or Esc
10. Click an appointment — breadcrumb appears
11. Click "Clinical Cockpit" in breadcrumb — returns to cockpit

**Step 2: Fix any visual issues**

Adjust spacing, colors, or transitions as needed.

**Step 3: Run build check**

Run: `npm run build`
Expected: Build succeeds with no TypeScript errors.

**Step 4: Commit**

```bash
git add -A
git commit -m "fix: visual polish and integration for cockpit redesign"
```

---

## Task 9: Update Documentation

**Files:**
- Modify: `CLAUDE.md` — update "Recent Changes" section
- Modify: `playbooks/01_my_patients_schedule.md` — if calendar/navigation changes affect the playbook

**Step 1: Add to CLAUDE.md Recent Changes**

Add entry describing the cockpit redesign (2-column layout, calendar nav, time-phased briefing, notification drawer, breadcrumbs).

**Step 2: Commit**

```bash
git add CLAUDE.md playbooks/01_my_patients_schedule.md
git commit -m "docs: update documentation for cockpit redesign"
```
