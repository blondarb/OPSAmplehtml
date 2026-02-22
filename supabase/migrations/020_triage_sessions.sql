-- 020_triage_sessions.sql
-- AI Triage Tool: stores triage sessions with dimension scores,
-- tier results, clinical reasoning, and physician overrides.
-- ================================================================

CREATE TABLE IF NOT EXISTS triage_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Input
  referral_text TEXT NOT NULL,
  patient_age INTEGER,
  patient_sex TEXT,
  referring_provider_type TEXT,

  -- AI Output
  triage_tier TEXT NOT NULL,
  confidence TEXT NOT NULL,
  dimension_scores JSONB NOT NULL,
  weighted_score NUMERIC(4,2),
  clinical_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  red_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  suggested_workup JSONB NOT NULL DEFAULT '[]'::jsonb,
  failed_therapies JSONB NOT NULL DEFAULT '[]'::jsonb,
  missing_information JSONB,
  subspecialty_recommendation TEXT,
  subspecialty_rationale TEXT,

  -- Audit
  ai_model_used TEXT NOT NULL,
  ai_raw_response JSONB,

  -- Physician Override
  physician_override_tier TEXT,
  physician_override_reason TEXT,
  flagged_for_review BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending_review',

  -- Patient link (optional)
  patient_id UUID REFERENCES patients(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_triage_sessions_created_at ON triage_sessions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_triage_sessions_tier ON triage_sessions (triage_tier);
CREATE INDEX IF NOT EXISTS idx_triage_sessions_status ON triage_sessions (status);
CREATE INDEX IF NOT EXISTS idx_triage_sessions_patient_id ON triage_sessions (patient_id);
CREATE INDEX IF NOT EXISTS idx_triage_sessions_flagged ON triage_sessions (flagged_for_review) WHERE flagged_for_review = true;
