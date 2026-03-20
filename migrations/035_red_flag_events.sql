-- Migration 035: Red Flag Events
-- Creates red_flag_events table and adds red_flag_count to neurology_consults.
-- Run against the ops_amplehtml RDS database.

CREATE TABLE IF NOT EXISTS red_flag_events (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  consult_id      UUID NOT NULL,
  flag_name       TEXT NOT NULL,
  severity        TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'moderate')),
  detected_symptoms JSONB NOT NULL DEFAULT '[]',
  confidence      NUMERIC(4, 3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  escalation_from_tier TEXT NOT NULL CHECK (escalation_from_tier IN ('immediate', 'urgent', 'same_day', 'routine')),
  escalation_to_tier   TEXT NOT NULL CHECK (escalation_to_tier   IN ('immediate', 'urgent', 'same_day', 'routine')),
  detected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ
);

-- Index for per-consult lookups (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_red_flag_events_consult_id
  ON red_flag_events (consult_id);

-- Index for unacknowledged critical flags dashboard
CREATE INDEX IF NOT EXISTS idx_red_flag_events_severity_ack
  ON red_flag_events (severity, acknowledged_at)
  WHERE acknowledged_at IS NULL;

-- Add red_flag_count to neurology_consults (no-op if already exists)
ALTER TABLE neurology_consults
  ADD COLUMN IF NOT EXISTS red_flag_count INTEGER NOT NULL DEFAULT 0;
