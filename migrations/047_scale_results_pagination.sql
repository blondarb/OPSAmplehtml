-- Migration 047: scale_results pagination — paginated scale_step support
-- Lets scale_results rows live in 'in_progress' state with partial responses,
-- bumping current_index per item answered. On final item, total_score +
-- interpretation + severity_level + completed_at get populated and status
-- flips to 'complete'.
--
-- Pattern mirrors migration 046 (triage async+polling NOT NULL drops).
--
-- Run: psql $RDS_URL -f migrations/047_scale_results_pagination.sql
-- Rollback: see DROP statements at the bottom

-- Add status + current_index columns
ALTER TABLE scale_results
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'complete'
    CHECK (status IN ('in_progress', 'complete'));

ALTER TABLE scale_results
  ADD COLUMN IF NOT EXISTS current_index INTEGER NOT NULL DEFAULT 0;

-- Backfill existing rows as 'complete' (they were all bulk-inserted under
-- the pre-pagination contract)
UPDATE scale_results SET status = 'complete' WHERE status IS NULL;

-- Relax NOT NULL on fields that aren't populated until completion
ALTER TABLE scale_results ALTER COLUMN total_score    DROP NOT NULL;
ALTER TABLE scale_results ALTER COLUMN interpretation DROP NOT NULL;
ALTER TABLE scale_results ALTER COLUMN severity_level DROP NOT NULL;

-- patient_id was added NOT NULL out-of-band after migration 034. The demo
-- /consult flow has no patient row to reference, and the legacy
-- ?action=submit handler also did not populate this column — relaxing it
-- to keep both flows working.
ALTER TABLE scale_results ALTER COLUMN patient_id DROP NOT NULL;

-- completed_at already has DEFAULT NOW() — drop the default + NOT NULL so
-- in-progress rows don't get an artificial timestamp
ALTER TABLE scale_results ALTER COLUMN completed_at DROP DEFAULT;
ALTER TABLE scale_results ALTER COLUMN completed_at DROP NOT NULL;

-- Index for finding the in-progress row for a session/scale
CREATE INDEX IF NOT EXISTS idx_scale_results_in_progress
  ON scale_results (historian_session_id, scale_id)
  WHERE status = 'in_progress';

-- ─── Rollback ───────────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS idx_scale_results_in_progress;
-- ALTER TABLE scale_results ALTER COLUMN completed_at SET NOT NULL;
-- ALTER TABLE scale_results ALTER COLUMN completed_at SET DEFAULT NOW();
-- ALTER TABLE scale_results ALTER COLUMN severity_level SET NOT NULL;
-- ALTER TABLE scale_results ALTER COLUMN interpretation SET NOT NULL;
-- ALTER TABLE scale_results ALTER COLUMN total_score    SET NOT NULL;
-- ALTER TABLE scale_results DROP COLUMN current_index;
-- ALTER TABLE scale_results DROP COLUMN status;
