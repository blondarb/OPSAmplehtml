# Sevaro Clinical Handoff — February 25, 2026

## Audience
Next Claude Code session picking up Command Center implementation.

## Current State
- **Build/Deploy status**: Last commit compiles clean. Design doc written but NOT committed.
- **Branch**: `main` — no feature branch created yet. Design work only, no code changes.
- **Live URL**: https://ops-amplehtml.vercel.app/
- **Environment**: Next.js 15.1.x, TypeScript, Supabase, OpenAI GPT-5/5.2

## Work Completed

### Command Center Revamp — Full Design Document

Brainstormed and designed a complete revamp of the `/dashboard` Command Center from a static placeholder (4 hardcoded metric cards + quick links) into an AI-powered clinical operations hub.

**Design decisions made:**
- **Approach A selected**: AI Morning Briefing + Priority Queue (over mission control grid or Kanban)
- **Role toggle**: My Patients / All Patients views (both physician and care navigator personas)
- **5-zone page layout**: AI Briefing → 8 Status Tiles → AI Action Queue → Priority Patient Queue → Quick Access
- **Batch approve with confidence scores**: AI suggests actions, groups them by type, shows High/Medium/Low confidence. Batch approve only for all-High groups.
- **3-level drill-down**: Scan queue → per-patient AI summary → link to full feature page
- **Hybrid data strategy**: Live Supabase queries with seeded demo fallback
- **EHR integration (simulated)**: EHR inbox items feed into native categories with source badges, not a separate silo
- **9 AI automation categories**: messages, calls, orders, refills, PA follow-ups, scale reminders, care gap closure, appointments, PCP summaries
- **6 neurology-specific intelligence items**: overdue scales, medication interactions, SDNE trends, PA status, lab monitoring, referral loop closure

| File | Change |
|------|--------|
| `docs/plans/2026-02-25-command-center-revamp-design.md` | **NEW** — Full design document (~450 lines) |

## What Was NOT Done
- **Implementation plan not written** — Design is complete but the step-by-step build plan (writing-plans skill) was not created. This is the immediate next step.
- **No feature branch created** — Still on `main`. Need to create `feature/command-center-revamp` before coding.
- **No Supabase migration written** — Design specifies 2 new tables (`command_center_actions`, `command_center_briefings`) but SQL not written yet.
- **No seed script written** — Design calls for `scripts/seed-command-center-demo.ts` with 15-20 demo patients.
- **Design doc not committed** — It's an untracked file.

## Known Risks / Watch Items
1. **AI briefing API complexity** — The briefing endpoint reads across 10+ Supabase tables. Need to be thoughtful about query efficiency and what data to pass to GPT-5.2 context.
2. **Existing untracked files** — There are several untracked migrations and API routes (`026_notifications.sql`, `027_provider_messages.sql`, etc.) from prior work that are NOT committed. These may overlap with Command Center needs (especially notifications and provider messages). Review before building.
3. **Patient data consistency** — The design reuses demo patients from other features (Maria Santos, James Okonkwo, Dorothy Chen). The seed script needs to reference existing patient IDs from `wearable_patients` and `followup_sessions` seeds.
4. **8 status tiles on mobile** — Design says 2-column grid on mobile. With 8 tiles that's 4 rows — may feel long. Consider collapsing to 4 primary tiles on mobile with "Show all" expand.
5. **Action queue AI prompt design** — The action generation prompt needs to be neurology-aware (understand which meds need monitoring, which scales are overdue, etc.). This is the hardest prompt to get right.

## Required Next Steps
1. **Read the design doc**: `docs/plans/2026-02-25-command-center-revamp-design.md`
2. **Review existing untracked work**: Check if `026_notifications.sql`, `useNotificationCounts.ts`, and the provider-messages API overlap with Command Center needs
3. **Create implementation plan**: Invoke `writing-plans` skill to break the design into ordered build tasks
4. **Create feature branch**: `git checkout -b feature/command-center-revamp`
5. **Build in this order** (rough guidance from design):
   - Supabase migration (2 new tables)
   - TypeScript types
   - Demo data seed script
   - API endpoints (metrics → actions → patients → briefing)
   - Leaf components (tiles, badges, indicators)
   - Container components (each zone)
   - Main page orchestrator
   - AI prompt engineering (briefing, actions, patient summaries)
6. **Commit design doc** before starting implementation

## Files to Review First
- `docs/plans/2026-02-25-command-center-revamp-design.md` — The full design (read this first)
- `src/components/CommandCenterDashboard.tsx` — Current placeholder being replaced
- `src/app/dashboard/page.tsx` — Route shell (stays the same, component swap)
- `supabase/migrations/022_followup_sessions.sql` — Follow-up schema (data source)
- `supabase/migrations/024_wearable_monitoring.sql` — Wearable schema (data source)
- `supabase/migrations/009_patient_portal.sql` — Patient messages schema (data source)
- `supabase/migrations/020_triage_sessions.sql` — Triage schema (data source)
