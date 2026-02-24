# Sevaro Ambulatory Handoff — February 24, 2026

## Audience
Next dev session (Claude or human) working on OPSAmplehtml.

## Current State
- **Build/Deploy status**: Compiles clean, deployed to **production** at https://ops-amplehtml.vercel.app
- **Branch**: `main` — fully pushed, up to date with `origin/main`
- **Supabase**: Migration `025_user_profiles.sql` applied to remote project `outpatient_synapse` (`czspsioerfaktnnrnmcw`)
- **Environment**: Next.js 15.1.x, Node (Vercel build), Supabase CLI 2.72.7

## Work Completed

### Homepage Redesign (15 Tasks, All Complete)

Replaced the flat 6-card homepage with a narrative three-track patient journey layout. Rebranded from "Sevaro Clinical" to "Sevaro Ambulatory."

| File | Change |
|------|--------|
| `package.json` | Added `lucide-react` and `framer-motion` dependencies |
| `supabase/migrations/025_user_profiles.sql` | New `user_profiles` table (extends auth.users with role/org/specialty), `user_activity_log` table, auto-create trigger, RLS policies, indexes |
| `src/contexts/AuthContext.tsx` | Auth context provider with user/session/profile state, signIn/signUp/signOut methods, onAuthStateChange listener with proper cleanup |
| `src/hooks/useActivityLog.ts` | Fire-and-forget activity logging hook |
| `src/components/layout/PlatformShell.tsx` | Sticky dark nav bar for marketing pages with auth-aware user dropdown, ARIA attributes, Escape key support |
| `src/components/homepage/journeyData.ts` | Data layer defining 3 journey tracks (10 total cards) with Lucide icons |
| `src/components/homepage/HeroSection.tsx` | Full-viewport hero with dark gradient, staggered fade-in, smooth-scroll CTA |
| `src/components/homepage/JourneyCard.tsx` | Card with status badge (Live/Building/Planned), icon, description, hover lift |
| `src/components/homepage/JourneyTrack.tsx` | Track with horizontal desktop timeline / vertical mobile timeline |
| `src/components/homepage/ByTheNumbers.tsx` | 4 metrics with count-up animation on scroll |
| `src/components/homepage/BuiltWith.tsx` | Partner strip (Anthropic, Samsung, Supabase, Vercel) |
| `src/components/homepage/Footer.tsx` | Three-column footer with disclaimer |
| `src/app/page.tsx` | Replaced old LandingPage import with new composition (PlatformShell + sections). `'use client'` directive added for Lucide icon serialization. |
| `src/app/login/page.tsx` | Redesigned with PlatformShell, redirect support (`?redirect=/triage` shows contextual banner), privacy messaging, open redirect protection, `htmlFor`/`id` on labels |
| `src/app/signup/page.tsx` | Rebranded to "Join Sevaro Ambulatory", redirect-aware, PlatformShell wrapper, `htmlFor`/`id` on labels |
| `src/app/layout.tsx` | Wrapped children in AuthProvider, updated metadata to "Sevaro Ambulatory" |
| `src/middleware.ts` | Rewritten for auth route protection. Uses `getUser()` (not `getSession()`) for JWT verification. Public routes pass through, protected routes redirect to `/login?redirect={path}`. |
| `src/components/PatientPortal.tsx` | Reads `?tab=` query param for direct linking from homepage cards |
| `src/components/LandingPage.tsx` | **Deleted** — replaced by new homepage components (413 lines removed) |

### Code Review Fixes (Post-Implementation)

| Issue | Severity | Fix |
|-------|----------|-----|
| Auth subscription memory leak | Critical | Added proper `unsubscribe` cleanup in AuthContext useEffect |
| Open redirect vulnerability | Critical | Validated redirect param is relative path (`starts with /`, not `//`) |
| `getSession()` in middleware | Critical | Changed to `getUser()` for server-side JWT validation |
| Missing `htmlFor`/`id` on labels | Important | Added to all login and signup form fields |
| Dropdown lacks ARIA | Important | Added `aria-expanded`, `aria-haspopup`, `role="menu"`, `role="menuitem"` |
| No Escape key handler | Important | Added keydown listener to close dropdown |
| Redirect not forwarded login<->signup | Important | Links now preserve `?redirect` param between pages |

### Commits (18 total for this feature)

```
6fd28df fix: address code review findings (security, accessibility, auth)
ffce283 chore: remove deprecated LandingPage component
9921162 fix: resolve build errors in homepage redesign
1022015 feat(auth): update signup page with PlatformShell and Sevaro Ambulatory branding
df09f13 feat(patient): read tab query param for direct linking from homepage
868a887 feat(auth): redesign login page with redirect support and privacy messaging
81887fa feat(homepage): replace card grid with three-track journey layout
cd4e987 feat(homepage): add hero, journey tracks, metrics, footer components
d4619ea feat(shell): add PlatformShell nav bar with auth-aware user menu
111e981 feat(auth): add session-based route protection in middleware
41923f7 feat(auth): wrap app in AuthProvider, update branding to Sevaro Ambulatory
3bba4f9 feat(auth): add useActivityLog hook for fire-and-forget tracking
896a7ad feat(auth): add AuthContext provider with Supabase integration
06a0b10 feat(auth): add user_profiles and activity_log migration
46a2b15 chore: add lucide-react and framer-motion dependencies
4c9914b docs: add homepage redesign implementation plan
00c826e docs: add homepage redesign playbook and design document
d3b2a00 docs: add Sevaro Monitor iOS companion app implementation plan
```

## What Was NOT Done
- **Seed demo users** — Deferred to Phase 2. Users must be created manually in Supabase Auth dashboard.
- **Role-based content overlays** — All users see the same content regardless of role. Phase 2 scope.
- **/about page** — Link exists in nav but no content page. Placeholder.
- **Privacy/Terms pages** — Excluded from Phase 1 (footer links to Home/About/Sign In instead).
- **Google OAuth** — Email/password only for Phase 1.
- **I1 from code review (page.tsx as Server Component)** — `page.tsx` has `'use client'` due to Lucide icon serialization. Could be refactored to pass icon names as strings instead, but low priority.
- **Recursive RLS on admin policy** — The "Admins can read all profiles" RLS policy on `user_profiles` queries itself. Works but could be moved to JWT claims for better performance at scale.

## Known Risks / Watch Items
1. **Framer Motion `whileInView` animations** — Require IntersectionObserver. In headless/automated testing tools, cards may render with `opacity: 0`. Real browsers work fine.
2. **`page.tsx` is a client component** — Entire homepage is client-rendered. For SEO/performance, could refactor to Server Component by passing icon names as strings instead of Lucide components.
3. **No demo users seeded** — Login will fail until users are created in Supabase Auth. Consider adding a seed script or demo account.
4. **`user_profiles` auto-create trigger** — Runs on auth.users INSERT. If the trigger fails silently, profile fetching in AuthContext will gracefully catch the error (profile just stays null).

## Required Next Steps
1. **Create at least one demo user** in Supabase Auth dashboard for testing login flow.
2. **Build /about page** — currently a dead link in the nav.
3. **Consider SEO** — refactor `page.tsx` from client to Server Component if search indexing matters.
4. **Phase 2 features** — role-based overlays, Google OAuth, demo user seeding, Privacy/Terms pages.

## Files to Review First
- `src/app/page.tsx` — the new homepage composition
- `src/components/homepage/journeyData.ts` — card data (to add/change journey cards)
- `src/contexts/AuthContext.tsx` — auth state management
- `src/middleware.ts` — route protection rules
- `docs/plans/2026-02-24-homepage-redesign-design.md` — original design spec
