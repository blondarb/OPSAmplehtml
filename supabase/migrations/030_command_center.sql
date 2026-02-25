-- 030_command_center.sql
-- Command Center tables for AI-generated action suggestions and cached briefings.
-- Actions represent things the AI recommends (messages, orders, refills, etc.)
-- that a physician can approve, dismiss, or execute.
-- Briefings cache AI-generated narrative summaries to avoid re-generating
-- on every page load.
-- ================================================================

-- ----------------------------------------------------------------
-- Table 1: command_center_actions
-- AI-generated action suggestions with approval workflow
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS command_center_actions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  physician_id     UUID NOT NULL,
  patient_id       UUID REFERENCES patients(id) ON DELETE CASCADE,
  action_type      TEXT NOT NULL CHECK (action_type IN (
    'message', 'call', 'order', 'refill', 'pa_followup',
    'scale_reminder', 'care_gap', 'appointment', 'pcp_summary'
  )),
  title            TEXT NOT NULL,
  description      TEXT,
  drafted_content  TEXT,
  confidence       TEXT NOT NULL CHECK (confidence IN (
    'high', 'medium', 'low'
  )),
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'approved', 'dismissed', 'executed'
  )),
  approved_at      TIMESTAMPTZ,
  approved_by      UUID,
  batch_id         UUID,
  source_data      JSONB NOT NULL DEFAULT '{}'::jsonb,
  tenant_id        UUID
);

-- Physician's pending/active actions
CREATE INDEX IF NOT EXISTS idx_cc_actions_physician
  ON command_center_actions (physician_id, status);

-- Patient-linked actions
CREATE INDEX IF NOT EXISTS idx_cc_actions_patient
  ON command_center_actions (patient_id);

-- Batch lookup (only rows that belong to a batch)
CREATE INDEX IF NOT EXISTS idx_cc_actions_batch
  ON command_center_actions (batch_id)
  WHERE batch_id IS NOT NULL;

-- ----------------------------------------------------------------
-- Table 2: command_center_briefings
-- Cached AI briefings to avoid re-generating on every page load
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS command_center_briefings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  physician_id     UUID,  -- NULL for all-patients view
  view_mode        TEXT NOT NULL CHECK (view_mode IN (
    'my_patients', 'all_patients'
  )),
  time_range       TEXT NOT NULL DEFAULT 'today' CHECK (time_range IN (
    'today', 'yesterday', 'last_7_days'
  )),
  narrative        TEXT NOT NULL,
  reasoning        JSONB NOT NULL DEFAULT '[]'::jsonb,
  urgent_count     INTEGER NOT NULL DEFAULT 0,
  data_snapshot    JSONB NOT NULL DEFAULT '{}'::jsonb,
  tenant_id        UUID
);

-- Latest briefing per physician
CREATE INDEX IF NOT EXISTS idx_cc_briefings_physician
  ON command_center_briefings (physician_id, created_at DESC);

-- ----------------------------------------------------------------
-- RLS (demo mode — allow all)
-- ----------------------------------------------------------------
ALTER TABLE command_center_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to command_center_actions" ON command_center_actions
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE command_center_briefings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to command_center_briefings" ON command_center_briefings
  FOR ALL USING (true) WITH CHECK (true);
