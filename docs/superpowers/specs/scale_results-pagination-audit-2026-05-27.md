# scale_results Pagination Audit (2026-05-27)

**Purpose:** Confirm the existing `scale_results` table needs schema changes before paginated `scale_step` can land in Phase 4.

## Current schema (migration 034)

From `migrations/034_scale_results.sql`:

| Column | Type | Constraint | Notes |
|---|---|---|---|
| `id` | UUID | PRIMARY KEY DEFAULT gen_random_uuid() | |
| `historian_session_id` | UUID | REFERENCES historian_sessions(id) ON DELETE CASCADE | nullable |
| `consult_id` | UUID | (FK to neurology_consults once Phase 1 table exists) | nullable |
| `scale_id` | TEXT | NOT NULL | e.g. 'phq9' |
| `scale_name` | TEXT | NOT NULL | e.g. 'Patient Health Questionnaire-9' |
| `scale_abbreviation` | TEXT | NOT NULL | e.g. 'PHQ-9' |
| `raw_responses` | JSONB | **NOT NULL** | full response set expected on insert |
| `total_score` | INTEGER | **NOT NULL** | final score expected on insert |
| `subscale_scores` | JSONB | nullable | e.g. ALSFRS-R |
| `interpretation` | TEXT | **NOT NULL** | final interpretation expected on insert |
| `severity_level` | TEXT | **NOT NULL** + CHECK | none/minimal/mild/moderate/moderately_severe/severe |
| `triggered_alerts` | JSONB | nullable | |
| `admin_mode` | TEXT | NOT NULL DEFAULT 'voice_administrable' + CHECK | |
| `administered_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| `completed_at` | TIMESTAMPTZ | **NOT NULL DEFAULT NOW()** | assumes immediate completion |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

## Pagination needs (Phase 4 — `scale_step`)

The paginated `scale_step` tool requires the server to:

1. **Insert a row at scale start** — when the model calls `scale_step({scale_id, reason})` with no `prev_index`. At this point we have only `scale_id`, `scale_name`, `scale_abbreviation`, `admin_mode`, `historian_session_id`. We do NOT have `total_score`, `interpretation`, `severity_level`, or `completed_at`.
2. **Update the row per item answered** — append to `raw_responses` JSONB, bump a `current_index` field that tracks which item is next.
3. **On final item: complete the row** — compute `total_score`, `interpretation`, `severity_level`, set `completed_at`, flip a `status` flag.

The current `NOT NULL` constraints on `total_score`, `interpretation`, `severity_level`, and `completed_at` block step 1.

## Required migration 047 changes

| Change | Reason |
|---|---|
| `ADD COLUMN status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','complete'))` | Track row lifecycle |
| `ADD COLUMN current_index INTEGER NOT NULL DEFAULT 0` | Track which item is next |
| `DROP NOT NULL` on `total_score` | Populate only at completion |
| `DROP NOT NULL` on `interpretation` | Populate only at completion |
| `DROP NOT NULL` on `severity_level` | Populate only at completion |
| `ALTER COLUMN completed_at DROP DEFAULT NOW()` + `DROP NOT NULL` | Don't fake a completion timestamp on insert |
| Backfill: `UPDATE scale_results SET status='complete' WHERE status IS NULL` | All existing rows are complete by definition |
| `CREATE INDEX idx_scale_results_in_progress ON scale_results (historian_session_id, scale_id) WHERE status = 'in_progress'` | Server lookup of the in-progress row by session+scale |

## Precedent

Migration 046 (triage async+polling pattern, PR #112) did the same thing for triage tables: dropped `NOT NULL` on result columns so pending rows could be inserted before the AI populated results. The paginated `scale_step` pattern mirrors this approach exactly.

## Notes

- `raw_responses` is already JSONB — can hold partial answer sets without any schema change. Server just appends to the JSONB object as items are answered.
- Item ordering, item text, and scoring methods all live in `src/lib/consult/scales/scale-library.ts` (TypeScript), not in the DB. No DB changes needed for those.
- The `consult_scales` table mentioned in the spec is a misnomer — the actual table is `scale_results` (per migration 034). Plan tasks 4.1-4.3 reference `scale_results` correctly.
