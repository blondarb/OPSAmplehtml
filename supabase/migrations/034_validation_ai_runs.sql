-- ============================================================
-- Migration 034: Validation AI Runs — Multi-Run Consistency
-- ============================================================
-- Stores multiple AI triage runs per validation case to measure
-- AI self-consistency (intra-rater reliability). Each case can
-- have a temp=0 deterministic baseline plus N runs at temp=0.2.

CREATE TABLE IF NOT EXISTS validation_ai_runs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id               UUID NOT NULL REFERENCES validation_cases(id) ON DELETE CASCADE,
  run_number            INTEGER NOT NULL,                       -- 0 = baseline (temp=0), 1..N = standard runs
  temperature           NUMERIC(3,2) NOT NULL DEFAULT 0.2,      -- model temperature used
  -- AI results
  ai_triage_tier        TEXT,
  ai_weighted_score     NUMERIC(4,2),
  ai_dimension_scores   JSONB,
  ai_subspecialty       TEXT,
  ai_redirect_to_non_neuro BOOLEAN DEFAULT false,
  ai_redirect_specialty TEXT,
  ai_confidence         TEXT,
  ai_session_id         UUID REFERENCES triage_sessions(id),
  ai_raw_response       JSONB,
  -- Timing
  duration_ms           INTEGER,                                -- how long the API call took
  error                 TEXT,                                    -- null if successful
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One run per case per run_number
CREATE UNIQUE INDEX IF NOT EXISTS idx_validation_ai_runs_case_run
  ON validation_ai_runs(case_id, run_number);

-- Fast lookups by case
CREATE INDEX IF NOT EXISTS idx_validation_ai_runs_case
  ON validation_ai_runs(case_id, created_at);

-- RLS
ALTER TABLE validation_ai_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view AI runs"
  ON validation_ai_runs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert AI runs"
  ON validation_ai_runs FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update AI runs"
  ON validation_ai_runs FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete AI runs"
  ON validation_ai_runs FOR DELETE
  TO authenticated
  USING (true);
