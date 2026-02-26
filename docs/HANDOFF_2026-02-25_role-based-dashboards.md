# Sevaro Clinical Handoff — February 25, 2026

## Audience
Next Claude Code session that picks up implementation of the role-based dashboards.

## Current State
- **Build/Deploy status**: No code changes made this session — design only
- **Branch**: `claude/cockpit-dashboard-separation` (clean, no uncommitted changes)
- **Live URL**: https://ops-amplehtml.vercel.app/dashboard (still shows old single-role dashboard)
- **Design doc**: `docs/plans/2026-02-25-role-based-dashboards-design.md` — **read this first**

## Work Completed

### Operational Model Definition
- Documented the teleneurology operational model: doctors always remote, patients at clinic or home, host EHR is Epic or Cerner, virtual MA model
- Saved to Claude memory files (`operational-model.md`, `role-based-views.md`, `dashboard-data-model.md`)

### Role-Based Dashboard Design (Approved)
- Designed three new pages replacing the current single `/dashboard`:
  - `/dashboard` — role chooser landing page (two cards: MA Dashboard / Practice Manager)
  - `/dashboard/ma` — MA flow board (light clinical theme, timeline rows per provider, task queue)
  - `/dashboard/admin` — Practice Manager console (dark ops theme, metrics, staffing, quality)
- Defined shared data model: Provider, PatientScheduleItem, MATask, ClinicSite, VirtualMA types
- Created demo data: 3 providers, 2 virtual MAs, 3 clinic sites, 18 morning patients with cross-card overlap
- Demo snapshot at ~9:40 AM tells a coherent story (no-show, tech issues, running behind, varying AI readiness)

| File | Change |
|------|--------|
| `docs/plans/2026-02-25-role-based-dashboards-design.md` | Full design doc with layouts, data model, demo data |

## What Was NOT Done
- **No implementation plan written** — needs `writing-plans` skill to break design into sequenced tasks
- **No code written** — all existing dashboard code is unchanged
- **No doc updates** — playbook and CLAUDE.md still describe old single-role dashboard (update after implementation, not before)
- **Demo data unification** across all 7 platform cards — flagged as future project

## Known Risks / Watch Items
1. **Playbook 02 is outdated** — `playbooks/02_clinician_command_center.md` still describes single-role 5-zone layout. Update after implementation.
2. **CLAUDE.md Section 14** — still describes "Command Center Revamp" with old 5-zone layout. Update after implementation.
3. **docs/IMPLEMENTATION_STATUS.md** and **docs/CONSOLIDATED_ROADMAP.md** — don't mention role-based split. Update after implementation.
4. **Homepage card** (`src/components/homepage/journeyData.ts`) — currently links to `/dashboard` which is fine (it'll become the landing page), but description text may need updating.
5. **Existing components** in `src/components/command-center/` can be partially reused (StatusTile, UrgencyIndicator, ConfidenceBadge, SourceBadge, DisclaimerBanner) but CommandCenterPage.tsx and its zone components will need significant refactoring or replacement.

## Required Next Steps
1. **Read the design doc**: `docs/plans/2026-02-25-role-based-dashboards-design.md`
2. **Create implementation plan** using `writing-plans` skill — break into sequenced tasks
3. **Build in this order** (suggested):
   - Shared data model and demo data (TypeScript types + constants)
   - Landing page (`/dashboard`)
   - MA Dashboard (`/dashboard/ma`) — the most novel piece
   - Practice Manager Dashboard (`/dashboard/admin`)
4. **Update docs** after implementation: playbook 02, CLAUDE.md, IMPLEMENTATION_STATUS.md, CONSOLIDATED_ROADMAP.md
5. **Commit with doc updates** per project policy

## Files to Review First
1. `docs/plans/2026-02-25-role-based-dashboards-design.md` — the design
2. `src/components/command-center/CommandCenterPage.tsx` — current orchestrator to understand what exists
3. `src/lib/command-center/types.ts` — current data types
4. `src/lib/command-center/demoActions.ts` — current demo data pattern
5. `src/app/dashboard/page.tsx` — current page structure
