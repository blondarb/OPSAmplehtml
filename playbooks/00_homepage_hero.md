# Homepage & Platform Shell — Product Playbook

## 1. Tagline

**The Neurology Clinic of Tomorrow — Built Today**

## 2. Hero Paragraph (58 words)

From the first referral to years of continuous monitoring, this platform reimagines every step of outpatient neurology with AI. Intelligent triage gets the right patient to the right neurologist faster. A digital neurological exam makes the subjective objective. AI agents follow up after every visit. And wearable data turns the time between appointments into actionable clinical intelligence.

## 3. The Problem with "6 Cards in a Grid"

> **Implementation note:** The current build uses **7 cards organized in a 4+3 layout across 2 rows** — Top row (Clinician Journey, 4 cards): AI-Powered Triage, Clinician Cockpit, Documentation, Digital Neuro Exam; Bottom row (Ongoing Care, 3 cards): Operations Dashboard, AI Follow-Up Agent, Wearable Monitoring. See `src/components/homepage/journeyData.ts`.

The original homepage concept was a simple 6-card grid: click a card, see a demo. This works for an engineer reviewing modules, but it fails for the two audiences that matter most:

* **Clinicians** see a disconnected list of tools rather than an integrated workflow. It feels like a tech company's feature list, not a clinic.
* **Investors** see 6 separate products and wonder which one you're actually building, rather than seeing a unified platform play.

The homepage needs to accomplish three things simultaneously:

1. **Tell the patient journey story** — show how the platform follows a patient from referral through years of monitoring, with each card as a chapter in that story
2. **Feel like a real product** — with login, navigation, and a coherent UI shell that says "this is software you would use" not "this is a demo site"
3. **Let each audience find their path** — clinicians want to see clinical workflow, investors want to see market opportunity, Samsung/partners want to see the technology platform

## 4. Recommended Page Layout (UX/UI Specification)

### 4.1 Platform Shell (Persistent)

Before the homepage content, the entire site needs a platform shell — a persistent navigation frame that makes every page feel like part of one product.

**Top Navigation Bar (sticky):**

| Element | Position | Details |
|---------|----------|---------|
| Logo + Product Name | Left | "NeuroPlatform" (or chosen product name) + subtle logomark |
| Navigation links | Center | Home · Platform · About |
| User avatar + name | Right | Shows logged-in user (e.g., "Dr. Arbogast") with dropdown: Profile, Settings, Log Out |
| Login/Register button | Right (if not logged in) | "Sign In" button, clean and minimal |

**Design note:** The nav bar appears on every page. It makes the demo feel like a real SaaS product, not a collection of standalone pages. The user avatar is key — it signals "this is your workspace."

### 4.2 Hero Section

| Element | Details |
|---------|---------|
| Background | Subtle animated gradient (dark navy → deep teal) or abstract neural pathway visualization. Not a stock photo. |
| Tagline | "The Neurology Clinic of Tomorrow — Built Today" — large (48-64px), bold, white text, centered |
| Hero paragraph | The 58-word paragraph, centered below, max-width 700px, 18px, light gray or white text |
| Primary CTA | "Follow a Patient's Journey ↓" — scrolls to the journey section. Ghost button style (border, no fill), white text |
| Secondary CTA | "Watch the 3-Minute Demo" — opens a modal or separate route with a guided walkthrough (Phase 2) |

### 4.3 The Patient Journey Section (Replaces the Card Grid)

**THIS IS THE KEY UX CHANGE.** Instead of 6 equal cards in a grid, arrange them as a horizontal patient journey timeline — a visual narrative that follows a single patient from referral to long-term monitoring.

> **Implementation note:** The current build renders a **4+3 two-row layout**: Top row (Clinician Journey, 4 cards) = AI-Powered Triage, Clinician Cockpit, Documentation, Digital Neuro Exam; Bottom row (Ongoing Care, 3 cards) = Operations Dashboard, AI Follow-Up Agent, Wearable Monitoring.

**Layout: Horizontal scrolling journey with vertical depth**

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                      │
│  ● ─────────── ● ─────────── ● ─────────── ● ─────────── ● ─────────── ●           │
│  │             │             │             │             │             │             │
│  REFERRAL     PHYSICIAN     IN-OFFICE     POST-VISIT   BETWEEN      THE FULL       │
│  TRIAGE       WORKSPACE     EXAM          FOLLOW-UP    VISITS       PICTURE        │
│                                                                                      │
│  AI-Powered   My Patients   Digital       AI Follow-Up Continuous   Clinician       │
│  Triage       & Schedule    Neuro Exam    Agent        Wearable     Command Center  │
│                                                                     Monitoring      │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

**Design details:**

* A subtle horizontal line connects all 6 steps, with a filled circle at each node — like a subway map or timeline
* Above each node: a short journey phase label (2-3 words) that tells the patient story
* Below each node: the card — a clickable panel that expands or navigates to the full card page
* The active/hovered card lifts slightly (subtle shadow) and shows a brief 1-sentence description
* A "Follow the Journey" animation gently scrolls through the timeline on first load, highlighting each phase in sequence (2 seconds per card, auto-pauses on interaction)
* On mobile: the timeline becomes a vertical scroll with cards stacked

### 4.4 Recommended Card Reordering and Relabeling

The cards should be reordered to follow the patient journey chronology, not the order they were built.

> **Implementation note:** The current build uses `/physician` for card 2 (not `/ehr`), labeled "Physician Workspace." Card 4 uses `/follow-up` (not `/post-visit`), with a separate patient-facing route at `/follow-up/conversation`.

| Journey Order | Journey Phase | Old Card # | Old Label | New Label | 1-Line Description |
|---------------|---------------|------------|-----------|-----------|---------------------|
| 1 | Referral Triage | Card 3 | AI Triage Tool | AI-Powered Triage | "A referral arrives. AI reads it, scores acuity, and routes to the right subspecialist — in seconds." |
| 2 | Physician Workspace | Card 1 | EHR Sandbox | My Patients & Schedule | "Your schedule, your charts, your triage recommendations — the physician's home base." |
| 3 | In-Office Exam | Card 5 | SDNE | Digital Neurological Exam | "The exam that remembers everything — quantified, reproducible, trackable over time." |
| 4 | Post-Visit Follow-Up | Card 4 | Post-Visit AI Agent | AI Follow-Up Agent | "Your AI care coordinator checks in after every visit — before the patient forgets to call." |
| 5 | Between Visits | Card 6 | Wearable Monitoring | Continuous Wearable Monitoring | "Galaxy Watch + AI turn the months between visits into actionable clinical intelligence." |
| 6 | The Full Picture | Card 2 | Clinical Dashboard | Operations Dashboard | "Everything in one place — triage queue, alerts, wearable trends, SDNE history, follow-up status." |

**Why this order:**

* **Triage comes first** because that's what actually initiates the patient journey. A referral arrives at the clinic — someone (or something) has to decide how urgent it is and where it goes. This happens before the patient appears on the physician's schedule. Triage is the intake funnel.
* **"My Patients & Schedule" comes second** because this is the physician's first encounter with the patient. After triage has sorted the referral, the patient shows up on your schedule. You open their chart. You see the triage recommendation. This is the EHR view — but it's not "referral intake," it's the physician's workspace.
* **The SDNE comes third** because that's the in-office exam — the moment you're face-to-face with the patient.
* **Follow-up, monitoring, and the command center** follow the visit in natural chronological order.
* **The Clinician Command Center comes last** because it's the aggregation layer — it pulls from all other cards. Placing it at the end says "this is where it all comes together."

### 4.5 Below the Journey: Supporting Sections

**Section: "By the Numbers" (Investor-Facing)**

A clean, centered row of 3-4 key metrics that ground the vision in market reality:

* **6-month** average wait time for new neurology patients nationally
* **30%** of referrals are misdirected to the wrong subspecialty
* **$100+** per patient/month in RPM revenue currently left on the table
* **24/7** monitoring between 30-minute visits every 3-6 months

**Section: "Built With" (Technology Partners)**

A subtle logo bar showing technology partners:

* OpenAI · Samsung · Supabase · Vercel · Apple HealthKit (Phase 2)
* Note: Production may use different AI providers (see AI Model Flexibility notes in individual card playbooks)
* This is important for Samsung partnership conversations — they see their brand alongside the platform

**Section: Footer**

* "Built by [Your Name/Company]"
* "Powered by AI" (keep provider-agnostic in branding)
* Privacy Policy · Terms · Contact
* "This is a demonstration platform. Not for clinical use."

## 5. Authentication & User System

### 5.1 Why Add Login

The current site has no authentication — anyone with the URL can see everything. Adding login serves multiple purposes:

1. **Demo credibility**: A login screen makes the platform feel like real software, not a public demo page
2. **User tracking**: Know who's viewing what, how long they spend on each card, what they click
3. **Role-based views**: Show different content to different users
4. **Security**: Prevent unauthorized access to demo data and playbooks
5. **Future-proofing**: Production authentication is a requirement anyway

### 5.2 Authentication Approach

**Recommended: Supabase Auth (built-in, free tier)**

| Feature | Details |
|---------|---------|
| Email/password login | Standard email + password registration and login |
| Magic link (passwordless) | "Sign in with a link sent to your email" |
| OAuth providers | Google, GitHub, Microsoft |
| Session management | JWT-based, automatic refresh, secure cookie storage |
| Row-level security (RLS) | Supabase RLS policies can restrict data access by user role |

**User roles:**

| Role | Access | Use Case |
|------|--------|----------|
| admin | Everything + admin panel | Product team |
| clinician | All clinical cards + clinical depth views | Neurologists reviewing the platform |
| investor | All cards + market data overlays + analytics | Investors and advisors |
| partner | All cards + technology integration views | Samsung, AI providers, other partners |
| demo | Limited read-only view, pre-loaded demo data | General public demo access |

### 5.3 What's Public vs. What's Gated

| Page | Access |
|------|--------|
| Homepage (hero + journey overview + By the Numbers) | Public — no login required |
| /login, /about | Public |
> **Implementation note:** The current build uses `/physician` instead of `/ehr` and `/follow-up` instead of `/post-visit`.

| /triage, /ehr, /sdne, /post-visit, /wearable, /dashboard | Protected — login required |

When an unauthenticated user clicks a card on the journey timeline, they are redirected to the login page with a clear message: "Sign in to explore [Card Name]."

### 5.4 Privacy-Forward Login Experience

**Login page messaging (displayed prominently above the form):**

> Your privacy matters. We use your login only to personalize your experience and remember where you left off. We do not sell, share, or use your information for any purpose beyond this platform. No marketing emails. No third-party tracking. You can delete your account at any time.

**Privacy design principles:**

* Minimal data collection: Only email + password (or Google OAuth)
* No dark patterns: No pre-checked marketing consent boxes
* Transparent activity logging: Disclose if platform logs user activity
* Easy account deletion: "Delete my account" option in Profile settings
* Session security: JWT tokens with short expiry, automatic refresh

**Login page design:**

* Product name + tagline at the top
* Privacy message in a subtle info box
* Clean form: Email → Password → "Sign In" button
* "Sign in with Google" as a secondary option
* "New here? Request Demo Access" link at the bottom
* Small footer: "Questions? Contact [email]" + link to Privacy Policy

### 5.5 Login Flow

```
User visits site
    ↓
Homepage: hero + patient journey + By the Numbers (ALL PUBLIC)
    ↓
User clicks a card (e.g., "AI-Powered Triage")
    ↓
Redirect to /login with message: "Sign in to explore AI-Powered Triage"
    ↓
Login page with privacy messaging + form
    ↓
Authenticated → redirect to the card they originally clicked
    ↓
User role determines content overlays and access
```

### 5.6 Supabase Schema — Users & Sessions

**Table: user_profiles (extends auth.users)**

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK, FK to auth.users) | User ID |
| display_name | text | Full name |
| role | text | admin, clinician, investor, partner, demo |
| organization | text | Company/practice name |
| specialty | text | For clinicians: neurology subspecialty |
| created_at | timestamptz | Account creation |
| last_login | timestamptz | Most recent login |

**Table: user_activity_log**

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Log entry ID |
| user_id | uuid (FK) | Who |
| action | text | page_view, card_click, demo_run, button_click |
| target | text | Which card or page |
| metadata | jsonb | Additional context |
| timestamp | timestamptz | When |

### 5.7 Seed Users (Pre-Created for Demo)

| Email | Password | Role | Name | Purpose |
|-------|----------|------|------|---------|
| demo@neuroplatform.ai | demo2026 | demo | Demo User | General public access |
| dr.arbogast@neuroplatform.ai | (set by you) | admin | Dr. Arbogast | Your admin account |
| investor@neuroplatform.ai | invest2026 | investor | Investor View | Hand out for investor demos |
| samsung@neuroplatform.ai | partner2026 | partner | Samsung Partner | Hand out for Samsung meetings |
| neurologist@neuroplatform.ai | neuro2026 | clinician | Dr. Sample | Hand out for clinical reviewers |

## 6. Visual Design Direction

### 6.1 Color Palette

| Use | Color | Hex |
|-----|-------|-----|
| Primary | Deep Navy | #0F172A |
| Accent | Teal / Cyan | #06B6D4 |
| Alert/Urgent | Warm Red | #EF4444 |
| Success/Good | Emerald | #10B981 |
| Warning/Attention | Amber | #F59E0B |
| Background | Near White | #F8FAFC |
| Card Background | White | #FFFFFF |
| Text Primary | Slate 900 | #0F172A |
| Text Secondary | Slate 500 | #64748B |

### 6.2 Typography

* **Headings**: Inter (bold, clean, modern)
* **Body**: Inter (regular)
* **Monospace** (code/data): JetBrains Mono
* **Hierarchy**: Tagline 48-64px → Section headers 28-32px → Card titles 20-24px → Body 16-18px

### 6.3 Card Design

Each journey card should be a glassmorphism-style panel with:

* White background with subtle border (border: 1px solid rgba(15, 23, 42, 0.08))
* Subtle drop shadow on hover (lift effect)
> **Implementation note:** Status badges are implemented in `JourneyCard.tsx` with three states: **Live** (emerald), **Building** (amber), **Planned** (slate). Currently all 10 cards are marked `live`.

* A status indicator in the top-right corner: Live / In Development / Planned
* An icon unique to each card (Lucide React icons):
  * AI-Powered Triage → Brain
  * My Patients & Schedule → CalendarClock or ClipboardList
  * Digital Neurological Exam → Scan or Activity
  * AI Follow-Up Agent → MessageSquare
  * Continuous Wearable Monitoring → Watch
  * Operations Dashboard → LayoutDashboard

### 6.4 Animations (Subtle, Professional)

* Hero section: Tagline fades in (0.5s), paragraph fades in (0.3s delay), CTA fades in (0.5s delay)
* Journey timeline: Nodes connect with a subtle drawing animation on scroll-into-view
* Card hover: 4px lift + shadow expansion (150ms ease)
* Page transitions: Cross-fade between pages (200ms)
* No spinners, no bouncing, no flashy animations. This is clinical software, not a marketing site.

## 7. Implementation Notes

### Key Technical Decisions

1. **Supabase Auth** for authentication — no additional services needed
2. **Next.js App Router** for page routing (already in use)
3. **Tailwind CSS** for styling (already in use)
4. **Framer Motion** for animations (lightweight, React-native)
5. **Lucide React** for icons
6. **Recharts** for any data visualizations on the homepage

### Packages to Install

```bash
npm install lucide-react framer-motion
```

Note: @supabase/supabase-js and @supabase/ssr should already be installed.

## 8. Implementation Specification

### STEP 1: Platform Shell (Persistent Navigation)

**File: `src/components/layout/PlatformShell.tsx`**
- Sticky top navigation bar with:
  - Left: Product name "NeuroPlatform" linking to /
  - Center: Nav links (Home, Platform, About) — use Next.js Link
  - Right: If authenticated → user avatar (initials circle) + name + dropdown (Profile, Settings, Log Out). If not authenticated → "Sign In" button.
- Use Tailwind: bg-slate-900, text-white, h-16, flex items-center justify-between, px-6

**File: `src/app/layout.tsx`**
- Wrap all children in PlatformShell
- Import Inter font from next/font/google

### STEP 2: Authentication (Supabase Auth)

**2a. Auth Context Provider: `src/contexts/AuthContext.tsx`**
- Provides: user, session, signIn, signUp, signOut, loading
- Uses onAuthStateChange listener
- Exposes user role from user_profiles table

**2b. Login Page: `src/app/login/page.tsx`**
- Accept optional `?redirect=/path` query param
- Display redirect message: "Sign in to explore [Card Name]"
- Privacy message in light blue/slate info box above form
- Clean centered form: Email, Password, Sign In, Google OAuth, Request Demo Access
- On success: redirect to `?redirect` path or /
- Style: max-width 420px card, centered, white on slate-50, rounded-xl, shadow-lg

**2c. Supabase Migration**
- user_profiles table (extends auth.users)
- user_activity_log table
- Auto-create profile trigger on signup
- RLS policies

**2d. Route Protection Middleware**
- Public routes: /, /login, /about
> **Implementation note:** Current routes are `/physician` (not `/ehr`) and `/follow-up` (not `/post-visit`). Additional routes include `/patient`, `/patient/historian`, and `/patient/messages`.

- Protected routes: /triage, /sdne, /wearable, /post-visit, /dashboard, /ehr
- Redirect to /login?redirect={path} when unauthenticated

### STEP 3: Homepage Redesign

**File: `src/app/page.tsx`**

**3a. Hero Section**
- Full-width, min-height 80vh
- CSS gradient (slate-900 via slate-800 to teal-900)
- Tagline: "The Neurology Clinic of Tomorrow — Built Today" (text-5xl font-bold text-white)
- Hero paragraph (text-lg text-slate-300, max-w-2xl mx-auto)
- CTA: "Follow a Patient's Journey ↓" (ghost button, scrolls to journey)

**3b. Patient Journey Section**
- Section ID: "journey"
- Background: white or slate-50
- Title: "The Patient Journey" + subtitle
- Horizontal timeline (desktop) / vertical stack (mobile)
- 7 cards with Lucide icons, status badges, hover lift effects arranged in 4+3 layout

> **Implementation note:** The current build uses **7 cards in a 4+3 two-row layout**. Top row (Clinician Journey): AI-Powered Triage, Clinician Cockpit (`/physician`), Documentation (`/ehr`), Digital Neuro Exam (`/sdne`). Bottom row (Ongoing Care): Operations Dashboard (`/dashboard`), AI Follow-Up Agent (`/follow-up`), Wearable Monitoring (`/wearable`). All cards are currently marked `live`.

Card order:
1. AI-Powered Triage → Brain → /triage → Live
2. My Patients & Schedule → CalendarClock → /ehr → Live
3. Digital Neurological Exam → Activity → /sdne → Live
4. AI Follow-Up Agent → MessageSquare → /post-visit → Live
5. Continuous Wearable Monitoring → Watch → /wearable → Building
6. Clinician Command Center → LayoutDashboard → /dashboard → Building

**3c. "By the Numbers" Section**
- Dark background (slate-900)
- 4 metric cards: 6 months, 30%, $100+, 24/7

**3d. "Built With" Section**
- White background, centered partner text labels

**3e. Footer**
- Three columns: product info, links, attribution
- Demo disclaimer

### STEP 4: Activity Logging Hook

**File: `src/hooks/useActivityLog.ts`**
- logActivity(action, target, metadata?)
- Fire-and-forget, uses authenticated user ID

### STEP 5: Animations

- Hero: staggered fade-in (Framer Motion)
- Journey cards: fade-in + slide-up on scroll
- Timeline line: draw animation
- Metric numbers: count-up on scroll

## 9. Open Questions

### Resolved

4. **Demo access policy** → Hero is public, cards are gated.

### Still Open

1. **Product name**: "NeuroPlatform" is a placeholder. What should the actual product name be?
2. **Custom domain**: Is there a domain, or still on Vercel subdomain?
3. **Google OAuth**: Enable from day one, or start with email/password only?
5. **"My Patients & Schedule" and "Clinician Command Center" status**: Built yet? If not, mark as Building/Planned.
6. **User testing invitations**: Should there be a "Request Access" flow?
7. **Privacy policy page**: Create /privacy for Phase 1, or placeholder?
8. **Account deletion**: Functional in Phase 1, or Phase 2?
