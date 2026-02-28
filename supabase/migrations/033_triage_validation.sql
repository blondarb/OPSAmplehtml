-- ============================================================
-- Migration 033: Triage Validation / Inter-Rater Reliability
-- ============================================================
-- Supports independent reviewer validation of AI triage results.
-- Reviewers grade the same set of clinical notes; results are
-- compared via Fleiss' Kappa, Weighted Kappa, and ICC.

-- 1. Validation Cases — the pool of notes reviewers will grade
CREATE TABLE IF NOT EXISTS validation_cases (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number   INTEGER NOT NULL,
  title         TEXT NOT NULL,                          -- short label, e.g. "Case 1 — Headache Referral"
  referral_text TEXT NOT NULL,                          -- the full referral note shown to reviewers
  patient_age   INTEGER,
  patient_sex   TEXT CHECK (patient_sex IN ('M','F','Other')),
  -- AI results for later comparison (populated when AI triages the same note)
  ai_triage_tier          TEXT,                         -- emergent, urgent, etc.
  ai_weighted_score       NUMERIC(4,2),
  ai_dimension_scores     JSONB,
  ai_subspecialty         TEXT,
  ai_confidence           TEXT,
  ai_session_id           UUID REFERENCES triage_sessions(id),
  -- metadata
  study_name    TEXT NOT NULL DEFAULT 'default',        -- group cases into studies
  is_calibration BOOLEAN NOT NULL DEFAULT false,        -- true = practice case, excluded from stats
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique case number per study
CREATE UNIQUE INDEX IF NOT EXISTS idx_validation_cases_study_num
  ON validation_cases(study_name, case_number);

-- 2. Validation Reviews — one per reviewer per case
CREATE TABLE IF NOT EXISTS validation_reviews (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id         UUID NOT NULL REFERENCES validation_cases(id) ON DELETE CASCADE,
  reviewer_id     UUID NOT NULL REFERENCES auth.users(id),
  -- Reviewer's assessment
  triage_tier             TEXT NOT NULL CHECK (triage_tier IN (
    'emergent','urgent','semi_urgent','routine_priority','routine','non_urgent','insufficient_data'
  )),
  subspecialty            TEXT,                          -- recommended subspecialty
  confidence              TEXT CHECK (confidence IN ('high','moderate','low')),
  key_factors             TEXT[] DEFAULT '{}',           -- checkboxes: what drove the decision
  reasoning               TEXT,                         -- free-text explanation
  -- Timing
  started_at              TIMESTAMPTZ,
  completed_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_seconds        INTEGER,                      -- how long the reviewer spent
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Each reviewer can only review each case once
CREATE UNIQUE INDEX IF NOT EXISTS idx_validation_reviews_unique
  ON validation_reviews(case_id, reviewer_id);

-- Index for fast reviewer progress queries
CREATE INDEX IF NOT EXISTS idx_validation_reviews_reviewer
  ON validation_reviews(reviewer_id, created_at);

-- 3. RLS Policies
ALTER TABLE validation_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE validation_reviews ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view cases
CREATE POLICY "Authenticated users can view validation cases"
  ON validation_cases FOR SELECT
  TO authenticated
  USING (true);

-- Only admins (or via API) can insert/update cases
CREATE POLICY "Authenticated users can insert validation cases"
  ON validation_cases FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update validation cases"
  ON validation_cases FOR UPDATE
  TO authenticated
  USING (true);

-- Reviewers can insert their own reviews
CREATE POLICY "Users can insert own reviews"
  ON validation_reviews FOR INSERT
  TO authenticated
  WITH CHECK (reviewer_id = auth.uid());

-- Reviewers can view all reviews (needed for results page)
CREATE POLICY "Authenticated users can view all reviews"
  ON validation_reviews FOR SELECT
  TO authenticated
  USING (true);

-- Reviewers can update their own reviews
CREATE POLICY "Users can update own reviews"
  ON validation_reviews FOR UPDATE
  TO authenticated
  USING (reviewer_id = auth.uid());
