# Homepage Redesign + Authentication — Design Document

**Date:** 2026-02-24
**Product Name:** Sevaro Ambulatory
**Playbook:** `playbooks/00_homepage_hero.md`

## Overview

Redesign the homepage from a flat 6-card grid into a narrative patient-journey layout with three tracks (Clinician, Patient, Ongoing Care), add a platform navigation shell, and integrate Supabase authentication with route protection.

## Product Name

**Sevaro Ambulatory** — replaces "Sevaro Clinical" on the homepage and nav bar. Existing feature pages retain their current branding.

## Homepage Layout (Top to Bottom)

### 1. Platform Shell Nav Bar (PlatformShell component)

Sticky top nav bar applied to marketing pages only (/, /login, /about). Feature pages (physician, triage, etc.) keep their existing navigation.

- **Left:** "Sevaro Ambulatory" product name, links to /
- **Center:** Home · Platform · About
- **Right:** If authenticated → user initials avatar + name + dropdown (Profile, Settings, Log Out). If not → "Sign In" button.
- **Styling:** bg-slate-900, text-white, h-16, px-6

### 2. Hero Section

- Full-width, min-height 80vh
- Background: CSS gradient (slate-900 → slate-800 → teal-900)
- Tagline: "The Neurology Clinic of Tomorrow — Built Today" (text-5xl, bold, white)
- Paragraph (58 words): "From the first referral to years of continuous monitoring, this platform reimagines every step of outpatient neurology with AI. Intelligent triage gets the right patient to the right neurologist faster. A digital neurological exam makes the subjective objective. AI agents follow up after every visit. And wearable data turns the time between appointments into actionable clinical intelligence."
- CTA: "Follow a Patient's Journey" — ghost button, scrolls to journey section

### 3. Clinician Journey Track (3 cards)

Section title: "The Clinician Journey"
Subtitle: "From referral to exam — AI at every step"

Horizontal timeline (desktop) / vertical stack (mobile):

| # | Journey Phase | Card Name | Route | Lucide Icon | Status | Description |
|---|---------------|-----------|-------|-------------|--------|-------------|
| 1 | Referral Triage | AI-Powered Triage | /triage | Brain | Live | "A referral arrives. AI reads it, scores acuity, and routes to the right subspecialist." |
| 2 | Physician Workspace | Physician Workspace | /physician | CalendarClock | Live | "Your schedule, your charts, your triage recommendations — the physician's home base." |
| 3 | In-Office Exam | Digital Neurological Exam | /sdne | Activity | Live | "The exam that remembers everything — quantified, reproducible, trackable over time." |

### 4. Patient Journey Track (4 cards)

Section title: "The Patient Journey"
Subtitle: "Guided care before, during, and after every visit"

| # | Journey Phase | Card Name | Route | Lucide Icon | Status | Description |
|---|---------------|-----------|-------|-------------|--------|-------------|
| 1 | Before the Visit | Patient Intake | /patient?tab=intake | ClipboardList | Live | "Complete your intake forms and medical history before your appointment." |
| 2 | AI History-Taking | AI Health Interview | /patient/historian | Mic | Live | "Have a voice conversation with an AI that takes your neurological history." |
| 3 | Between Visits | Patient Messaging | /patient?tab=messages | MessageCircle | Live | "Send questions and updates to your care team between visits." |
| 4 | After the Visit | Post-Visit Check-In | /follow-up/conversation | HeartPulse | Live | "Your AI care coordinator follows up on how you're feeling after your visit." |

### 5. Ongoing Care Track (3 cards)

Section title: "Ongoing Care"
Subtitle: "Continuous intelligence between the 30-minute visits"

| # | Journey Phase | Card Name | Route | Lucide Icon | Status | Description |
|---|---------------|-----------|-------|-------------|--------|-------------|
| 1 | Post-Visit | AI Follow-Up Agent | /follow-up | MessageSquare | Live | "AI care coordination — track medication tolerance, symptoms, and escalation alerts." |
| 2 | Between Visits | Wearable Monitoring | /wearable | Watch | Live | "Galaxy Watch + AI turn the months between visits into actionable clinical intelligence." |
| 3 | The Full Picture | Clinician Command Center | /dashboard | LayoutDashboard | Live | "Everything in one place — triage queue, alerts, wearable trends, follow-up status." |

### 6. "By the Numbers" Section

Dark background (slate-900). 4 metric cards:

| Metric | Label |
|--------|-------|
| 6 months | Average wait for new neurology patients |
| 30% | Referrals misdirected to wrong subspecialty |
| $100+ | Monthly RPM revenue per patient left on the table |
| 24/7 | AI monitoring between 30-minute visits |

### 7. "Built With" Section

White background. Centered text: "Anthropic Claude · Samsung · Supabase · Vercel"

### 8. Footer

Three columns:
- Left: "Sevaro Ambulatory" + "Reimagining outpatient neurology with AI"
- Center: Home, About, Privacy, Terms links
- Right: "Built by Steve Arbogast" + "Powered by Anthropic Claude"
- Bottom: Disclaimer: "This is a demonstration platform. Not intended for clinical use."

## Authentication System

### Tables (Supabase migration)

**user_profiles** (extends auth.users):
- id (uuid PK, FK to auth.users)
- display_name (text)
- role (text: admin, clinician, investor, partner, demo)
- organization (text)
- specialty (text)
- created_at (timestamptz)
- last_login (timestamptz)

**user_activity_log**:
- id (uuid PK)
- user_id (uuid FK)
- action (text)
- target (text)
- metadata (jsonb)
- timestamp (timestamptz)

Auto-create trigger: on auth.users INSERT → create user_profiles row with role='demo'.

RLS: Users read own profile. Admins read all. Users insert own activity.

### Auth Context Provider

`src/contexts/AuthContext.tsx`:
- Provides: user, session, userProfile (with role), signIn, signUp, signOut, loading
- Uses Supabase onAuthStateChange listener
- Fetches user_profiles on auth state change

### Login Page (`/login`)

- Accepts `?redirect=/path` query param
- Shows redirect context: "Sign in to explore [Card Name]"
- Privacy message in info box above form
- Email + password form
- "Sign In" button (teal)
- "New here? Sign Up" link
- On success: redirect to `?redirect` path or /
- Style: max-width 420px card, centered, white on slate-50

### Route Protection (Middleware)

**Public routes:** `/`, `/login`, `/signup`, `/about`, `/auth`
**Protected routes:** Everything else (`/triage`, `/physician`, `/dashboard`, `/sdne`, `/follow-up`, `/wearable`, `/patient`)

Unauthenticated access to protected route → redirect to `/login?redirect={original_path}`

### Activity Logging Hook

`src/hooks/useActivityLog.ts`:
- logActivity(action, target, metadata?) — fire-and-forget
- Uses authenticated user ID
- Call on page mount (page_view) and card click (card_click)

## Animations (Framer Motion)

- Hero: staggered fade-in for tagline → paragraph → CTA (0.3s intervals)
- Journey cards: fade-in + slide-up on scroll into view (whileInView)
- Timeline line: draw animation from left to right
- Metric numbers: count-up on scroll into view
- Card hover: 4px lift + shadow expansion (150ms ease)

## New Dependencies

```
npm install lucide-react framer-motion
```

## Files to Create/Modify

### New Files
- `src/components/layout/PlatformShell.tsx` — nav bar component
- `src/components/homepage/HeroSection.tsx` — hero with tagline + CTA
- `src/components/homepage/JourneyTrack.tsx` — reusable journey timeline component
- `src/components/homepage/JourneyCard.tsx` — individual card component
- `src/components/homepage/ByTheNumbers.tsx` — metrics section
- `src/components/homepage/BuiltWith.tsx` — partner logos section
- `src/components/homepage/Footer.tsx` — footer component
- `src/contexts/AuthContext.tsx` — auth provider
- `src/hooks/useActivityLog.ts` — activity logging hook
- `supabase/migrations/025_user_profiles.sql` — auth tables

### Modified Files
- `src/app/page.tsx` — replace LandingPage with new homepage
- `src/app/layout.tsx` — wrap with AuthProvider (PlatformShell only on marketing pages)
- `src/app/login/page.tsx` — redesign with privacy messaging + redirect support
- `src/middleware.ts` — add auth route protection
- `src/components/PatientPortal.tsx` — read `?tab=` query param to set initial tab
- `package.json` — add lucide-react, framer-motion

### Deprecated
- `src/components/LandingPage.tsx` — replaced by new homepage components (can be deleted)

## Scope Exclusions (Phase 2)

- Seed demo users (create manually in Supabase)
- Role-based content overlays (all users see same content)
- /about page content (placeholder link)
- /privacy page content (placeholder link)
- Account deletion flow
- "Request Demo Access" workflow
- Google OAuth (email/password only for Phase 1)
- Separate route pages for patient portal tabs (using query params instead)
