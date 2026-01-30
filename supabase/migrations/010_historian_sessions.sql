-- 010_historian_sessions.sql
-- Creates the historian_sessions table for the AI Neurologic Historian feature.
-- Stores voice interview sessions between patients and the AI historian.
--
-- IMPORTANT: Run this ONLY after reviewing.  Do NOT auto-run.
-- ================================================================

CREATE TABLE IF NOT EXISTS historian_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         TEXT NOT NULL DEFAULT 'default',
  session_type      TEXT NOT NULL DEFAULT 'new_patient',  -- new_patient | follow_up
  patient_name      TEXT NOT NULL DEFAULT '',
  referral_reason   TEXT,
  structured_output JSONB,           -- Full structured clinical data from interview
  narrative_summary TEXT,            -- AI-generated narrative summary
  transcript        JSONB,           -- Array of { role, text, timestamp }
  red_flags         JSONB,           -- Array of { flag, severity, context }
  safety_escalated  BOOLEAN NOT NULL DEFAULT false,
  duration_seconds  INTEGER DEFAULT 0,
  question_count    INTEGER DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'in_progress',  -- in_progress | completed | abandoned
  reviewed          BOOLEAN NOT NULL DEFAULT false,
  imported_to_note  BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_historian_sessions_tenant
  ON historian_sessions (tenant_id);

CREATE INDEX IF NOT EXISTS idx_historian_sessions_tenant_status
  ON historian_sessions (tenant_id, status);

-- RLS policies (allow all for demo, matching 009 pattern)
ALTER TABLE historian_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON historian_sessions
  FOR ALL USING (true) WITH CHECK (true);
