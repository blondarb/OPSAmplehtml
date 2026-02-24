# Navigation Standardization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Standardize all feature pages with a two-tier hybrid navigation (PlatformShell + colored FeatureSubHeader), add journey-aware next-step links, separate Patient Messaging into its own route, repurpose the Command Center dashboard, and add a landing overview to the Post-Visit Check-In.

**Architecture:** Create a shared `FeatureSubHeader` component that every feature page uses. Wrap all pages with `PlatformShell` from `layout.tsx` level (instead of per-page). Extract Patient Messaging from `PatientPortal.tsx` into a standalone page component. Replace the `/dashboard` duplicate ClinicalNote with a new overview dashboard.

**Tech Stack:** Next.js 15 App Router, TypeScript, Tailwind CSS + inline styles, Lucide React icons, Framer Motion (existing)

**Design doc:** `docs/plans/2026-02-24-navigation-standardization-design.md`

---

## Task 1: Create FeatureSubHeader Component

**Files:**
- Create: `src/components/layout/FeatureSubHeader.tsx`

**Step 1: Create the shared sub-header component**

```tsx
'use client'

import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface FeatureSubHeaderProps {
  title: string
  icon: LucideIcon
  accentColor: string        // hex like '#F59E0B'
  showDemo?: boolean          // default true
  homeLink?: string           // default '/'
  nextStep?: {
    label: string
    route: string
  }
}

export default function FeatureSubHeader({
  title,
  icon: Icon,
  accentColor,
  showDemo = true,
  homeLink = '/',
  nextStep,
}: FeatureSubHeaderProps) {
  return (
    <div
      style={{
        background: accentColor,
        padding: '10px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: 48,
      }}
    >
      {/* Left: ← Home */}
      <Link
        href={homeLink}
        style={{
          color: 'white',
          textDecoration: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 14,
          fontWeight: 500,
          opacity: 0.9,
        }}
      >
        <ChevronLeft size={16} />
        Home
      </Link>

      {/* Center: Icon + Title + Demo badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon size={18} color="white" />
        <span style={{ color: 'white', fontWeight: 600, fontSize: 15 }}>
          {title}
        </span>
        {showDemo && (
          <span
            style={{
              background: 'rgba(255,255,255,0.2)',
              color: 'white',
              fontSize: 11,
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 4,
              letterSpacing: 0.5,
            }}
          >
            Demo
          </span>
        )}
      </div>

      {/* Right: Next Step → or empty spacer */}
      {nextStep ? (
        <Link
          href={nextStep.route}
          style={{
            color: 'white',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 14,
            fontWeight: 500,
            opacity: 0.9,
          }}
        >
          {nextStep.label}
          <ChevronRight size={16} />
        </Link>
      ) : (
        <div style={{ width: 60 }} />
      )}
    </div>
  )
}
```

**Step 2: Verify build**

Run: `npm run build 2>&1 | head -30`
Expected: Clean compile (component isn't imported yet, but should have no syntax errors)

**Step 3: Commit**

```bash
git add src/components/layout/FeatureSubHeader.tsx
git commit -m "feat: add shared FeatureSubHeader component for two-tier navigation"
```

---

## Task 2: Add PlatformShell to Root Layout

Move PlatformShell from the homepage into `layout.tsx` so every page gets it automatically. But we need it to only show on feature pages — not inside the Physician Workspace or Patient Portal which have their own chrome.

**Files:**
- Modify: `src/app/layout.tsx` (44 lines)
- Modify: `src/app/page.tsx` (28 lines) — remove PlatformShell wrapper (now in layout)

**Step 1: Update layout.tsx to include PlatformShell**

In `src/app/layout.tsx`, add the PlatformShell import and wrap children. The PlatformShell already handles auth-aware rendering.

Add import at top:
```tsx
import PlatformShell from '@/components/layout/PlatformShell'
```

Wrap `{children}` with `<PlatformShell>`:
```tsx
<AuthProvider>
  <PlatformShell>
    {children}
  </PlatformShell>
</AuthProvider>
```

**Important:** `PlatformShell` is a client component. Since `layout.tsx` is a server component, wrapping children in a client component is fine — Next.js handles this correctly.

**Step 2: Remove PlatformShell from homepage**

In `src/app/page.tsx`, remove the `<PlatformShell>` wrapper since it's now in layout. The homepage should just render its content directly:

```tsx
'use client'

import HeroSection from '@/components/homepage/HeroSection'
import JourneyTrack from '@/components/homepage/JourneyTrack'
import { clinicianTrack, patientTrack, ongoingCareTrack } from '@/components/homepage/journeyData'
import ByTheNumbers from '@/components/homepage/ByTheNumbers'
import BuiltWith from '@/components/homepage/BuiltWith'
import Footer from '@/components/homepage/Footer'

export default function Home() {
  return (
    <main>
      <HeroSection />
      <JourneyTrack track={clinicianTrack} />
      <JourneyTrack track={patientTrack} />
      <JourneyTrack track={ongoingCareTrack} />
      <ByTheNumbers />
      <BuiltWith />
      <Footer />
    </main>
  )
}
```

**Step 3: Verify build and check homepage still renders**

Run: `npm run build 2>&1 | head -30`
Expected: Clean compile

**Step 4: Commit**

```bash
git add src/app/layout.tsx src/app/page.tsx
git commit -m "feat: move PlatformShell to root layout for global navigation"
```

**⚠️ Checkpoint:** Before proceeding, check that PlatformShell doesn't break pages that have their own full-screen layouts (Physician, Patient Portal). If it does, we'll need to add a `hidePlatformShell` mechanism — see Task 2b below.

---

## Task 2b: Handle Pages That Need to Hide PlatformShell

The Physician Workspace (`/physician`) and Patient Portal (`/patient`) have their own full-page chrome. PlatformShell on top would create double navigation. Two approaches:

**Option A (simpler):** Don't put PlatformShell in layout. Instead, create a wrapper component that each feature page imports. Pages that don't want it (physician, patient) skip it.

**Option B (cleaner):** Use a route group. Put pages that need PlatformShell in `(with-shell)/` and pages that don't in `(no-shell)/`.

**Recommended: Option A** — less structural change. Create a `FeaturePage` wrapper component that combines PlatformShell + FeatureSubHeader, and each page uses it explicitly. Revert the layout.tsx change from Task 2 if needed.

If Task 2 causes double-chrome issues, revert it and instead have each page import PlatformShell + FeatureSubHeader directly. The pattern per page would be:

```tsx
<PlatformShell>
  <FeatureSubHeader title="..." icon={...} accentColor="..." nextStep={{...}} />
  {/* page content */}
</PlatformShell>
```

Pages like `/physician` and `/patient` would NOT use this wrapper and instead add just a `← Home` link to their existing nav.

**Step 1:** If Task 2 broke physician/patient pages, revert layout.tsx and page.tsx changes
**Step 2:** Restore PlatformShell in page.tsx (homepage only)
**Step 3:** Commit the revert if needed

---

## Task 3: Add Navigation to Triage Page

**Files:**
- Modify: `src/app/triage/page.tsx` (484 lines)

The triage page already has a header section (lines 273-328) with a back link to "/" and title. We need to:
1. Wrap the page in PlatformShell
2. Replace the existing header with FeatureSubHeader

**Step 1: Add imports**

At top of file, add:
```tsx
import PlatformShell from '@/components/layout/PlatformShell'
import FeatureSubHeader from '@/components/layout/FeatureSubHeader'
import { Brain } from 'lucide-react'
```

**Step 2: Wrap the page content**

Find the outermost container div (around line 268) and wrap everything in:
```tsx
<PlatformShell>
  <FeatureSubHeader
    title="AI Triage Tool"
    icon={Brain}
    accentColor="#F59E0B"
    nextStep={{ label: 'Physician Workspace', route: '/physician' }}
  />
  {/* existing page content minus the old header */}
</PlatformShell>
```

**Step 3: Remove the old inline header**

Remove the existing header block (approximately lines 273-328) that has the back arrow, title, and demo badge — FeatureSubHeader replaces all of it.

**Step 4: Verify build**

Run: `npm run build 2>&1 | head -30`

**Step 5: Commit**

```bash
git add src/app/triage/page.tsx
git commit -m "feat: add standardized navigation to triage page"
```

---

## Task 4: Add Navigation to SDNE Page

**Files:**
- Modify: `src/app/sdne/page.tsx` (85 lines)

SDNE already has a blue header with ← Home. Replace it with PlatformShell + FeatureSubHeader.

**Step 1: Add imports**

```tsx
import PlatformShell from '@/components/layout/PlatformShell'
import FeatureSubHeader from '@/components/layout/FeatureSubHeader'
import { Activity } from 'lucide-react'
```

**Step 2: Wrap page and replace header**

Replace the existing header (lines 19-69) with:
```tsx
<PlatformShell>
  <FeatureSubHeader
    title="Digital Neurological Exam"
    icon={Activity}
    accentColor="#1E40AF"
  />
  {/* iframe content stays as-is */}
</PlatformShell>
```

Note: SDNE is the last card in the Clinician track (3/3), so no `nextStep` prop.

**Step 3: Remove old header block** (lines 19-69)

**Step 4: Verify build, commit**

```bash
git add src/app/sdne/page.tsx
git commit -m "feat: add standardized navigation to SDNE page"
```

---

## Task 5: Add Navigation to Follow-Up Hub

**Files:**
- Modify: `src/app/follow-up/page.tsx` (96 lines)

**Step 1: Add imports**

```tsx
import PlatformShell from '@/components/layout/PlatformShell'
import FeatureSubHeader from '@/components/layout/FeatureSubHeader'
import { MessageSquare } from 'lucide-react'
```

**Step 2: Replace header (lines 11-27) with:**

```tsx
<PlatformShell>
  <FeatureSubHeader
    title="AI Follow-Up Agent"
    icon={MessageSquare}
    accentColor="#16A34A"
    nextStep={{ label: 'Wearable Monitoring', route: '/wearable' }}
  />
  {/* hub tiles content */}
</PlatformShell>
```

**Step 3: Remove old header, verify build, commit**

```bash
git add src/app/follow-up/page.tsx
git commit -m "feat: add standardized navigation to follow-up hub"
```

---

## Task 6: Add Navigation to Follow-Up Conversation + Landing Overview

**Files:**
- Modify: `src/app/follow-up/conversation/page.tsx` (216 lines)

This page needs two changes: standardized nav AND a new landing overview state.

**Step 1: Add imports**

```tsx
import PlatformShell from '@/components/layout/PlatformShell'
import FeatureSubHeader from '@/components/layout/FeatureSubHeader'
import { HeartPulse } from 'lucide-react'
```

**Step 2: Add landing state**

Add a `showLanding` state variable:
```tsx
const [showLanding, setShowLanding] = useState(true)
```

**Step 3: Create the landing overview JSX**

Before the existing conversation content, add a landing screen:

```tsx
{showLanding ? (
  <div style={{ maxWidth: 640, margin: '60px auto', padding: '0 24px', textAlign: 'center' }}>
    <div style={{
      width: 64, height: 64, borderRadius: '50%',
      background: 'linear-gradient(135deg, #16A34A, #22C55E)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      margin: '0 auto 24px',
    }}>
      <HeartPulse size={32} color="white" />
    </div>
    <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12, color: '#1e293b' }}>
      Post-Visit Check-In
    </h1>
    <p style={{ fontSize: 16, color: '#64748b', lineHeight: 1.6, marginBottom: 32 }}>
      After every visit, our AI care coordinator follows up with the patient to check on
      medication tolerance, symptom changes, and any new concerns. This conversation
      generates structured alerts for the care team when escalation is needed.
    </p>
    <div style={{
      background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12,
      padding: 24, marginBottom: 32, textAlign: 'left',
    }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: '#16A34A', marginBottom: 12 }}>
        What happens during a check-in:
      </h3>
      <ul style={{ fontSize: 14, color: '#475569', lineHeight: 1.8, paddingLeft: 20, margin: 0 }}>
        <li>AI asks about medication side effects and adherence</li>
        <li>Screens for new or worsening symptoms</li>
        <li>Checks if the patient has questions about their care plan</li>
        <li>Generates a structured summary for the clinician</li>
        <li>Flags urgent concerns for immediate review</li>
      </ul>
    </div>
    <button
      onClick={() => setShowLanding(false)}
      style={{
        background: '#16A34A', color: 'white', border: 'none',
        padding: '14px 32px', borderRadius: 8, fontSize: 16,
        fontWeight: 600, cursor: 'pointer',
      }}
    >
      Start Check-In Demo
    </button>
  </div>
) : (
  /* existing conversation content */
)}
```

**Step 4: Wrap page with PlatformShell + FeatureSubHeader**

```tsx
<PlatformShell>
  <FeatureSubHeader
    title="Post-Visit Check-In"
    icon={HeartPulse}
    accentColor="#16A34A"
  />
  {/* landing or conversation content */}
</PlatformShell>
```

Post-Visit Check-In is patient track 4/4, so no `nextStep`.

**Step 5: Remove old header (lines 59-109), verify build, commit**

```bash
git add src/app/follow-up/conversation/page.tsx
git commit -m "feat: add landing overview and standardized nav to post-visit check-in"
```

---

## Task 7: Add Navigation to Wearable Page

**Files:**
- Modify: `src/app/wearable/page.tsx` (207 lines)

**Step 1: Add imports**

```tsx
import PlatformShell from '@/components/layout/PlatformShell'
import FeatureSubHeader from '@/components/layout/FeatureSubHeader'
import { Watch } from 'lucide-react'
```

**Step 2: Replace header (lines 48-101) with PlatformShell + FeatureSubHeader**

```tsx
<PlatformShell>
  <FeatureSubHeader
    title="Wearable Monitoring"
    icon={Watch}
    accentColor="#0EA5E9"
    nextStep={{ label: 'Command Center', route: '/dashboard' }}
  />
  {/* page content */}
</PlatformShell>
```

**Step 3: Remove old header, verify build, commit**

```bash
git add src/app/wearable/page.tsx
git commit -m "feat: add standardized navigation to wearable page"
```

---

## Task 8: Add Navigation to Patient Portal

**Files:**
- Modify: `src/components/PatientPortal.tsx`

The Patient Portal has its own dark-themed header with a purple logo. We want to add PlatformShell above it, and standardize the existing header as the sub-header.

**Step 1: Add imports**

```tsx
import PlatformShell from '@/components/layout/PlatformShell'
import FeatureSubHeader from '@/components/layout/FeatureSubHeader'
import { ClipboardList } from 'lucide-react'
```

**Step 2: Wrap the entire PatientPortal return value**

```tsx
<PlatformShell>
  <FeatureSubHeader
    title="Patient Intake"
    icon={ClipboardList}
    accentColor="#8B5CF6"
    nextStep={{ label: 'AI Health Interview', route: '/patient/historian' }}
  />
  {/* existing PatientPortal content, minus the old header */}
</PlatformShell>
```

**Step 3: Remove the old custom header** (lines 221-267 approximately)

The existing header has the purple logo, "Sevaro Patient Portal" title, and right-aligned Home button. FeatureSubHeader replaces all of this.

**Step 4: Verify build, commit**

```bash
git add src/components/PatientPortal.tsx
git commit -m "feat: add standardized navigation to patient portal"
```

---

## Task 9: Add Navigation to AI Historian Page

**Files:**
- Modify: `src/components/NeurologicHistorian.tsx`

Similar to Patient Portal — add PlatformShell above, replace the custom header with FeatureSubHeader.

**Step 1: Add imports**

```tsx
import PlatformShell from '@/components/layout/PlatformShell'
import FeatureSubHeader from '@/components/layout/FeatureSubHeader'
import { Mic } from 'lucide-react'
```

**Step 2: Wrap component and replace header**

```tsx
<PlatformShell>
  <FeatureSubHeader
    title="AI Health Interview"
    icon={Mic}
    accentColor="#0D9488"
    nextStep={{ label: 'Patient Messaging', route: '/patient/messages' }}
  />
  {/* existing historian content minus old header */}
</PlatformShell>
```

**Step 3: Remove old header, preserve the safety escalation overlay** (it should appear above everything when active)

**Step 4: Verify build, commit**

```bash
git add src/components/NeurologicHistorian.tsx
git commit -m "feat: add standardized navigation to AI historian page"
```

---

## Task 10: Create Standalone Patient Messaging Page

**Files:**
- Create: `src/app/patient/messages/page.tsx`
- Modify: `src/components/PatientPortal.tsx` — identify and extract messages content

**Step 1: Create the new page**

Create `src/app/patient/messages/page.tsx`:

```tsx
import PatientMessages from '@/components/PatientMessages'

export default function PatientMessagesPage() {
  return <PatientMessages />
}
```

**Step 2: Create the PatientMessages component**

Create `src/components/PatientMessages.tsx`. Extract the Messages tab content from `PatientPortal.tsx` (the "Messages" tab JSX around lines 737-799 and the related state/handlers) into this new standalone component. Wrap it with PlatformShell + FeatureSubHeader:

```tsx
'use client'

import PlatformShell from '@/components/layout/PlatformShell'
import FeatureSubHeader from '@/components/layout/FeatureSubHeader'
import { MessageCircle } from 'lucide-react'

export default function PatientMessages() {
  return (
    <PlatformShell>
      <FeatureSubHeader
        title="Patient Messaging"
        icon={MessageCircle}
        accentColor="#8B5CF6"
        nextStep={{ label: 'Post-Visit Check-In', route: '/follow-up/conversation' }}
      />
      <div style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
        {/* Messages content extracted from PatientPortal */}
        {/* Include the Write Message / Chat with AI mode toggle */}
        {/* Include the MessageConversationalChat component */}
      </div>
    </PlatformShell>
  )
}
```

The exact content to extract depends on how tightly coupled the messages tab is to PatientPortal state. Read `PatientPortal.tsx` carefully to identify all state variables and handlers the Messages tab uses, and copy them into the new component.

**Step 3: Update PatientPortal to remove Messages tab**

In `PatientPortal.tsx`, remove the Messages service card from the hub and the Messages tab content. The portal now only has Intake Form and AI Historian cards. Keep a link to `/patient/messages` if useful.

**Step 4: Verify build, test both pages, commit**

```bash
git add src/app/patient/messages/page.tsx src/components/PatientMessages.tsx src/components/PatientPortal.tsx
git commit -m "feat: extract patient messaging into standalone page at /patient/messages"
```

---

## Task 11: Repurpose Dashboard as Overview

**Files:**
- Modify: `src/app/dashboard/page.tsx` (24 lines — currently renders ClinicalNote)
- Create: `src/components/CommandCenterDashboard.tsx`

**Step 1: Create the overview dashboard component**

Create `src/components/CommandCenterDashboard.tsx`:

```tsx
'use client'

import Link from 'next/link'
import PlatformShell from '@/components/layout/PlatformShell'
import FeatureSubHeader from '@/components/layout/FeatureSubHeader'
import { LayoutDashboard, Brain, MessageSquare, Watch, CalendarClock, Activity } from 'lucide-react'

interface DashboardCardProps {
  title: string
  description: string
  icon: React.ComponentType<{ size?: number; color?: string }>
  route: string
  color: string
  metric?: string
  metricLabel?: string
}

function DashboardCard({ title, description, icon: Icon, route, color, metric, metricLabel }: DashboardCardProps) {
  return (
    <Link href={route} style={{ textDecoration: 'none' }}>
      <div style={{
        background: 'white', borderRadius: 12, padding: 24,
        border: '1px solid #e2e8f0', cursor: 'pointer',
        transition: 'transform 150ms, box-shadow 150ms',
      }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'
          ;(e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
          ;(e.currentTarget as HTMLElement).style.boxShadow = 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 8, background: color + '15',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon size={20} color={color} />
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#1e293b', margin: 0 }}>{title}</h3>
        </div>
        <p style={{ fontSize: 14, color: '#64748b', margin: 0, lineHeight: 1.5 }}>{description}</p>
        {metric && (
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
            <span style={{ fontSize: 24, fontWeight: 700, color }}>{metric}</span>
            <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 8 }}>{metricLabel}</span>
          </div>
        )}
      </div>
    </Link>
  )
}

export default function CommandCenterDashboard() {
  return (
    <PlatformShell>
      <FeatureSubHeader
        title="Clinician Command Center"
        icon={LayoutDashboard}
        accentColor="#4F46E5"
      />
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>
          Command Center
        </h1>
        <p style={{ fontSize: 16, color: '#64748b', marginBottom: 32 }}>
          High-level overview of your clinic. Jump to any feature from here.
        </p>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 20,
        }}>
          <DashboardCard
            title="Triage Queue"
            description="AI-scored referrals waiting for subspecialty routing."
            icon={Brain}
            route="/triage"
            color="#F59E0B"
            metric="—"
            metricLabel="pending referrals"
          />
          <DashboardCard
            title="Physician Workspace"
            description="Open the EHR to document visits, review charts, and manage patients."
            icon={CalendarClock}
            route="/physician"
            color="#0D9488"
          />
          <DashboardCard
            title="Digital Neuro Exam"
            description="View and analyze neurologic exam sessions from SDNE screenings."
            icon={Activity}
            route="/sdne"
            color="#1E40AF"
            metric="13"
            metricLabel="total sessions"
          />
          <DashboardCard
            title="Follow-Up Agent"
            description="AI-driven post-visit coordination, symptom tracking, and escalation alerts."
            icon={MessageSquare}
            route="/follow-up"
            color="#16A34A"
            metric="—"
            metricLabel="active follow-ups"
          />
          <DashboardCard
            title="Wearable Monitoring"
            description="Galaxy Watch data and AI insights from between-visit monitoring."
            icon={Watch}
            route="/wearable"
            color="#0EA5E9"
            metric="—"
            metricLabel="active devices"
          />
        </div>
      </div>
    </PlatformShell>
  )
}
```

**Step 2: Update dashboard page to use new component**

Replace `src/app/dashboard/page.tsx`:

```tsx
import CommandCenterDashboard from '@/components/CommandCenterDashboard'

export default function DashboardPage() {
  return <CommandCenterDashboard />
}
```

**Step 3: Verify build, commit**

```bash
git add src/app/dashboard/page.tsx src/components/CommandCenterDashboard.tsx
git commit -m "feat: repurpose /dashboard as overview command center (replaces duplicate EHR)"
```

---

## Task 12: Add Home Link to Physician Workspace

**Files:**
- Modify: `src/components/TopNav.tsx`

The Physician Workspace uses TopNav which has no back-to-home link. We need to add a subtle `← Home` link to the left side, before the search bar.

**Step 1: Add Link import**

```tsx
import Link from 'next/link'
```

**Step 2: Add Home link to the left side of TopNav**

Find the left section of TopNav (where the logo/search bar starts) and add before it:

```tsx
<Link
  href="/"
  style={{
    color: '#94a3b8',
    textDecoration: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 13,
    fontWeight: 500,
    marginRight: 12,
    whiteSpace: 'nowrap',
  }}
>
  ← Home
</Link>
```

**Step 3: Verify build, commit**

```bash
git add src/components/TopNav.tsx
git commit -m "feat: add Home link to physician workspace TopNav"
```

---

## Task 13: Update Homepage Journey Data

**Files:**
- Modify: `src/components/homepage/journeyData.ts`

**Step 1: Update Patient Messaging route**

Change line 78 from:
```tsx
route: '/patient?tab=messages',
```
to:
```tsx
route: '/patient/messages',
```

**Step 2: Update Command Center description**

Change the description for Clinician Command Center (line 119) to reflect its new purpose:
```tsx
description: 'High-level overview — triage queue, follow-up alerts, wearable trends, all in one place.',
```

**Step 3: Verify build, commit**

```bash
git add src/components/homepage/journeyData.ts
git commit -m "feat: update journey data for messaging route and command center description"
```

---

## Task 14: Update Middleware for New Route

**Files:**
- Modify: `src/middleware.ts`

**Step 1: Verify `/patient/messages` is protected**

Check the middleware. The current pattern protects everything except public routes (`/`, `/login`, `/signup`, `/about`, `/auth`). Since `/patient/messages` starts with `/patient`, it should already be caught by the wildcard protection. Verify this is the case — if the middleware uses explicit path matching, add `/patient/messages` to the protected list.

**Step 2: Commit only if changes were needed**

```bash
git add src/middleware.ts
git commit -m "feat: ensure /patient/messages route is protected by auth middleware"
```

---

## Task 15: Visual Verification and Final Commit

**Step 1: Run full build**

Run: `npm run build`
Expected: Clean compile, no errors

**Step 2: Start dev server and verify each page**

Run: `npm run dev`

Check each page visually:
- [ ] `/` — Homepage renders, journey cards have correct routes
- [ ] `/triage` — PlatformShell + amber sub-header + → Physician Workspace
- [ ] `/physician` — PlatformShell + ← Home in TopNav
- [ ] `/sdne` — PlatformShell + blue sub-header (end of track, no next)
- [ ] `/patient` — PlatformShell + purple sub-header + → AI Health Interview
- [ ] `/patient/historian` — PlatformShell + teal sub-header + → Patient Messaging
- [ ] `/patient/messages` — PlatformShell + purple sub-header + → Post-Visit Check-In (NEW)
- [ ] `/follow-up` — PlatformShell + green sub-header + → Wearable Monitoring
- [ ] `/follow-up/conversation` — Landing overview with "Start Check-In" button, then conversation
- [ ] `/wearable` — PlatformShell + cyan sub-header + → Command Center
- [ ] `/dashboard` — PlatformShell + indigo sub-header, overview cards (NEW)

**Step 3: Check mobile responsiveness**

Resize browser to 375px width and verify sub-header doesn't break on small screens. May need to hide "Next Step" text on mobile and show only the arrow.

**Step 4: Final commit if any tweaks needed**

```bash
git add -A
git commit -m "fix: visual polish and responsive adjustments for navigation standardization"
```
