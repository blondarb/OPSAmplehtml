-- Migration 063: historian_review_feedback
--
-- Human-in-the-loop review of AI Historian output. A physician/reviewer marks
-- agree/disagree + optional notes on each section of a completed interview's
-- review on the /rnd/historian dashboard. This is the HUMAN judgement layer,
-- distinct from historian_evaluations (058), which stores AI-EVALUATOR output
-- (thoroughness, independent_ddx, agreement, and now physician_summary +
-- thoroughness_lean generated on-demand for the live dashboard).
--
-- `section` is free-form-but-enumerated TEXT (not an ENUM) so new reviewable
-- sections can be added without a migration. Current sections:
--   'differential' | 'physician_summary' | 'thoroughness'
-- `verdict` is 'agree' | 'disagree'.
--
-- One verdict per (session, reviewer, section) — the dashboard UPSERTs on this
-- unique key so a reviewer changing their mind overwrites their prior verdict
-- rather than accumulating rows. idx_hrf_session supports "all feedback for
-- this session" lookups.
--
-- Additive only — no backfill, no default beyond created_at.
--
-- Run: psql $RDS_URL -f migrations/063_historian_review_feedback.sql
-- Rollback: migrations/063_historian_review_feedback.down.sql
--
-- NOT applied here — additive only, applied by a later rollout task.

CREATE TABLE IF NOT EXISTS historian_review_feedback (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  reviewer TEXT NOT NULL,           -- reviewer email (Cognito id token)
  section TEXT NOT NULL,            -- 'differential' | 'physician_summary' | 'thoroughness'
  verdict TEXT NOT NULL,            -- 'agree' | 'disagree'
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, reviewer, section)
);
CREATE INDEX IF NOT EXISTS idx_hrf_session ON historian_review_feedback (session_id, created_at DESC);
