-- ============================================================================
-- Migration 032: neurology_consults
-- Phase 1 — Integrated Neuro Intake Engine
--
-- Creates the unified consult record that tracks a patient referral through
-- the full intake pipeline: Triage → Intake Agent → AI Historian.
--
-- This table is the backbone for all downstream phases (localizer, scales,
-- red flag escalation, report generator).
--
-- Run against: AWS RDS PostgreSQL (ops_amplehtml database)
-- ============================================================================

CREATE TABLE IF NOT EXISTS neurology_consults (

  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Optional patient link (may be null for new referrals without existing records)
  patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,

  -- ── Pipeline status ──────────────────────────────────────────────────────
  -- Valid progression: triage_pending → triage_complete → intake_pending →
  --   intake_in_progress → intake_complete → historian_pending →
  --   historian_in_progress → historian_complete → complete
  status TEXT NOT NULL DEFAULT 'triage_pending',

  -- ── Triage phase ─────────────────────────────────────────────────────────
  triage_session_id      UUID REFERENCES triage_sessions(id) ON DELETE SET NULL,
  triage_urgency         TEXT,            -- TriageTier value (emergent, urgent, etc.)
  triage_tier_display    TEXT,            -- Display label (EMERGENT, URGENT, etc.)
  triage_summary         TEXT,            -- Human-readable summary for downstream steps
  triage_chief_complaint TEXT,            -- Extracted chief complaint
  triage_red_flags       TEXT[],          -- Red flag array from triage scoring
  triage_subspecialty    TEXT,            -- Recommended subspecialty
  triage_completed_at    TIMESTAMPTZ,

  -- ── Intake / Follow-up phase ─────────────────────────────────────────────
  intake_session_id       UUID REFERENCES followup_sessions(id) ON DELETE SET NULL,
  intake_status           TEXT,           -- Mirrors followup_sessions.status
  intake_summary          TEXT,           -- Summary extracted from intake conversation
  intake_escalation_level TEXT,           -- urgent | same_day | next_visit | informational
  intake_transcript_excerpt TEXT,         -- Key excerpt for quick review
  intake_completed_at     TIMESTAMPTZ,

  -- ── AI Historian phase ───────────────────────────────────────────────────
  historian_session_id       UUID REFERENCES historian_sessions(id) ON DELETE SET NULL,
  historian_summary          TEXT,        -- narrative_summary from historian
  historian_structured_output JSONB,      -- Full OLDCARTS structured output
  historian_red_flags        JSONB,       -- Array of {flag, severity, context}
  historian_safety_escalated BOOLEAN NOT NULL DEFAULT FALSE,
  historian_completed_at     TIMESTAMPTZ,

  -- ── Source data ──────────────────────────────────────────────────────────
  referral_text TEXT,                     -- Original referral text that was triaged
  notes         TEXT,                     -- Clinician annotations / free text

  -- ── Timestamps ──────────────────────────────────────────────────────────
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
-- Common lookup patterns: by patient, by status, by triage session
CREATE INDEX IF NOT EXISTS idx_neurology_consults_patient_id
  ON neurology_consults(patient_id)
  WHERE patient_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_neurology_consults_status
  ON neurology_consults(status);

CREATE INDEX IF NOT EXISTS idx_neurology_consults_triage_session
  ON neurology_consults(triage_session_id)
  WHERE triage_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_neurology_consults_created_at
  ON neurology_consults(created_at DESC);

-- ── Auto-update updated_at ────────────────────────────────────────────────
-- Reuse the same trigger function pattern used elsewhere in this DB.
-- If the function already exists (from another table), this is a no-op.
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_neurology_consults_updated_at
  BEFORE UPDATE ON neurology_consults
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ── Status constraint ─────────────────────────────────────────────────────
ALTER TABLE neurology_consults
  ADD CONSTRAINT chk_neurology_consults_status
  CHECK (status IN (
    'triage_pending',
    'triage_complete',
    'intake_pending',
    'intake_in_progress',
    'intake_complete',
    'historian_pending',
    'historian_in_progress',
    'historian_complete',
    'complete'
  ));
