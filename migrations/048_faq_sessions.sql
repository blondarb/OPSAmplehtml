-- Migration 048 — Neuro FAQ Voice (POC) session audit table
-- POC SKELETON. Apply against ops_amplehtml. Stores SCRUBBED audit trail only —
-- NO audio is ever persisted. See safety_architecture.md §7–8.

CREATE TABLE IF NOT EXISTS faq_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        TEXT,
  session_id       TEXT NOT NULL,
  -- Each turn: { utterance_scrubbed, gate_verdicts, faq_id_served, escalation, ts }
  turns            JSONB NOT NULL DEFAULT '[]'::jsonb,
  topics           TEXT[],
  escalation_fired BOOLEAN NOT NULL DEFAULT false,
  escalation_reason TEXT,
  refusal_count    INT NOT NULL DEFAULT 0,
  duration_seconds INT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_faq_sessions_created_at ON faq_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_faq_sessions_escalation ON faq_sessions(escalation_fired) WHERE escalation_fired = true;
