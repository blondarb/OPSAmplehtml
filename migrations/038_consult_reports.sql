-- Phase 7: Unified Report Generator
-- Stores generated consult reports

CREATE TABLE IF NOT EXISTS consult_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consult_id UUID NOT NULL REFERENCES neurology_consults(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft',        -- 'draft', 'final', 'amended'
  report_data JSONB NOT NULL,                  -- Full ConsultReport JSON
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_at TIMESTAMPTZ,
  finalized_by TEXT                             -- Cognito user ID
);

CREATE INDEX IF NOT EXISTS idx_reports_consult ON consult_reports(consult_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON consult_reports(status);
