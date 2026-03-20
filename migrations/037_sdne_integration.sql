-- Phase 6: SDNE Integration
-- Links Standardized Digital Neurologic Exam sessions to the consult pipeline

ALTER TABLE neurology_consults
  ADD COLUMN IF NOT EXISTS sdne_session_id TEXT,
  ADD COLUMN IF NOT EXISTS sdne_session_flag TEXT,           -- GREEN/YELLOW/RED
  ADD COLUMN IF NOT EXISTS sdne_domain_flags JSONB,          -- { "Motor": "RED", "Gait": "YELLOW", ... }
  ADD COLUMN IF NOT EXISTS sdne_detected_patterns JSONB,     -- [{ description, confidence }]
  ADD COLUMN IF NOT EXISTS sdne_completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_consults_sdne_session ON neurology_consults(sdne_session_id)
  WHERE sdne_session_id IS NOT NULL;
