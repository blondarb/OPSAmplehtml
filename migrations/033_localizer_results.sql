-- ============================================================================
-- Migration 033: Localizer Results on neurology_consults
-- Phase 2 — Background Localizer (Evidence Engine)
--
-- Adds columns to neurology_consults to store the most recent output from
-- the Background Localizer (/api/ai/historian/localizer).
--
-- The localizer runs every 3 user turns during an active historian session.
-- Results are persisted here so the physician observer panel can display
-- the live differential and evidence context even after the session ends.
--
-- Prerequisites: Migration 032 (neurology_consults table) must be applied first.
--
-- Run against: AWS RDS PostgreSQL (ops_amplehtml database)
-- ============================================================================

-- ── Add localizer result columns ──────────────────────────────────────────────

ALTER TABLE neurology_consults
  -- Most recent ranked differential from the localizer
  ADD COLUMN IF NOT EXISTS localizer_differential    JSONB,

  -- Most recent suggested follow-up questions (array of strings as JSON)
  ADD COLUMN IF NOT EXISTS localizer_questions       JSONB,

  -- Most recent neuroanatomical localization hypothesis (text)
  ADD COLUMN IF NOT EXISTS localizer_hypothesis      TEXT,

  -- KB source document names from the last successful retrieval
  ADD COLUMN IF NOT EXISTS localizer_kb_sources      JSONB,

  -- Timestamp of the most recent successful localizer call
  ADD COLUMN IF NOT EXISTS localizer_last_run_at     TIMESTAMPTZ,

  -- Total number of localizer calls during the historian session
  ADD COLUMN IF NOT EXISTS localizer_run_count       INTEGER NOT NULL DEFAULT 0;

-- ── Index for physician panel queries ────────────────────────────────────────
-- The physician panel polls for sessions with recent localizer activity.
-- Index on last_run_at allows efficient range queries.

CREATE INDEX IF NOT EXISTS idx_neurology_consults_localizer_last_run
  ON neurology_consults(localizer_last_run_at DESC)
  WHERE localizer_last_run_at IS NOT NULL;

-- ── Verification query ────────────────────────────────────────────────────────
-- Run after applying to confirm columns were added:
--
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'neurology_consults'
--   AND column_name LIKE 'localizer_%'
-- ORDER BY column_name;
--
-- Expected output:
--   localizer_differential  | jsonb
--   localizer_hypothesis    | text
--   localizer_kb_sources    | jsonb
--   localizer_last_run_at   | timestamp with time zone
--   localizer_questions     | jsonb
--   localizer_run_count     | integer
