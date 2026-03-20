-- Migration 034: Scale Results — Scale Auto-Administration Engine (Phase 3)
-- Creates the scale_results table and adds a summary column to neurology_consults.
--
-- Run: psql $RDS_URL -f migrations/034_scale_results.sql
-- Rollback: see DROP statements at the bottom

-- ─── scale_results ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scale_results (
  id                     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Session linkage (Phase 1/2 uses consult_id; historian-only sessions use historian_session_id)
  historian_session_id   UUID         REFERENCES historian_sessions(id) ON DELETE CASCADE,
  consult_id             UUID,        -- FK to neurology_consults.id once Phase 1 table exists

  -- Scale identification
  scale_id               TEXT         NOT NULL,   -- e.g. 'phq9', 'nihss', 'alsfrs_r'
  scale_name             TEXT         NOT NULL,   -- e.g. 'Patient Health Questionnaire-9'
  scale_abbreviation     TEXT         NOT NULL,   -- e.g. 'PHQ-9'

  -- Responses and scoring
  raw_responses          JSONB        NOT NULL,   -- { q1: 2, q2: 1, ... }
  total_score            INTEGER      NOT NULL,
  subscale_scores        JSONB,                   -- { bulbar: 10, fine_motor: 9, ... } (ALSFRS-R)
  interpretation         TEXT         NOT NULL,   -- e.g. 'Moderate depression'
  severity_level         TEXT         NOT NULL    -- minimal | mild | moderate | moderately_severe | severe | none
                           CHECK (severity_level IN ('none','minimal','mild','moderate','moderately_severe','severe')),

  -- Clinical alerts (critical | warning | info) serialized from scoring-engine
  triggered_alerts       JSONB,                   -- [{ type: 'critical', message: '...' }]

  -- Administration metadata
  admin_mode             TEXT         NOT NULL DEFAULT 'voice_administrable'
                           CHECK (admin_mode IN ('voice_administrable','exam_required')),

  -- Timestamps
  administered_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  completed_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

-- Primary lookup: all scales for a historian session
CREATE INDEX IF NOT EXISTS idx_scale_results_historian_session
  ON scale_results (historian_session_id)
  WHERE historian_session_id IS NOT NULL;

-- Primary lookup: all scales for a consult (Phase 1/2)
CREATE INDEX IF NOT EXISTS idx_scale_results_consult_id
  ON scale_results (consult_id)
  WHERE consult_id IS NOT NULL;

-- Quickly find results by scale type across sessions (analytics)
CREATE INDEX IF NOT EXISTS idx_scale_results_scale_id
  ON scale_results (scale_id);

-- Alert queries (find sessions with critical alerts)
CREATE INDEX IF NOT EXISTS idx_scale_results_triggered_alerts
  ON scale_results USING GIN (triggered_alerts)
  WHERE triggered_alerts IS NOT NULL;

-- ─── neurology_consults update ────────────────────────────────────────────────
-- Adds a denormalized summary column so the consult list view can show
-- completed scales without a JOIN. Only runs if the table already exists.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'neurology_consults'
  ) THEN
    ALTER TABLE neurology_consults
      ADD COLUMN IF NOT EXISTS scale_results_summary JSONB;

    COMMENT ON COLUMN neurology_consults.scale_results_summary IS
      'Denormalized summary of completed scales: [{ scale_id, abbreviation, score, severity_level, completed_at }]';
  END IF;
END;
$$;

-- ─── Comments ─────────────────────────────────────────────────────────────────

COMMENT ON TABLE scale_results IS
  'Completed clinical scale administrations from the Scale Auto-Administration Engine (Phase 3). '
  'Linked to historian_sessions for historian-only flows, or to neurology_consults for full pipeline flows.';

COMMENT ON COLUMN scale_results.raw_responses IS
  'Map of question ID to numeric response value, as submitted by the AI or physician.';

COMMENT ON COLUMN scale_results.triggered_alerts IS
  'Array of { type, message, action? } objects from the scoring engine. '
  'Critical alerts (PHQ-9 Q9, NIHSS ≥ 21) must be surfaced immediately in the UI.';

COMMENT ON COLUMN scale_results.admin_mode IS
  'voice_administrable: asked by the historian AI. exam_required: must be done by physician (NIHSS, MoCA).';

-- ─── Rollback (run manually if needed) ───────────────────────────────────────
-- DROP INDEX IF EXISTS idx_scale_results_triggered_alerts;
-- DROP INDEX IF EXISTS idx_scale_results_scale_id;
-- DROP INDEX IF EXISTS idx_scale_results_consult_id;
-- DROP INDEX IF EXISTS idx_scale_results_historian_session;
-- DROP TABLE IF EXISTS scale_results;
-- ALTER TABLE neurology_consults DROP COLUMN IF EXISTS scale_results_summary;
