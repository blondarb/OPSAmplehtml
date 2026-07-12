-- Migration 049: clara_test_feedback
--
-- Human (thumbs up/down) feedback on individual Clara triage decisions
-- surfaced by the Clara browser voice test harness (/rnd/clara, R&D /
-- internal only — see migrations/048_clara_test_sessions.sql). Each row is
-- one reviewer verdict on one classification: the decision snapshot at the
-- time of review (so the labeled case is self-contained even if the
-- upstream rulebook/prompt later changes), the verdict, an optional
-- free-text reason, and an optional human-corrected consultType.
--
-- A 👎 + corrected_consult_type is a labeled eval case: { input transcript
-- context lives in the parent clara_test_sessions.turns row, output =
-- consult_type/confidence/... below, label = corrected_consult_type }. The
-- sevaro-voice-agent eval harness can join on session_id + turn_index to
-- pull the original transcript turn and build a scored fixture from it.
--
-- Synthetic data only — this table must never receive real PHI.
--
-- Run: psql $RDS_URL -f migrations/049_clara_test_feedback.sql
-- Rollback: DROP TABLE IF EXISTS clara_test_feedback;

CREATE TABLE IF NOT EXISTS clara_test_feedback (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parent test call. ON DELETE SET NULL (not CASCADE) — feedback is the
  -- valuable labeled artifact here; it should survive even if the raw
  -- session row it was reviewed from is later pruned.
  session_id               UUID         REFERENCES clara_test_sessions(id) ON DELETE SET NULL,

  -- Index into the parent session's `turns` JSONB array identifying which
  -- user turn this decision came from. Null = feedback on the session's
  -- overall/final classification rather than one specific turn.
  turn_index                INTEGER,

  -- Decision snapshot at time of review — same field names as
  -- ConsultClassificationResult / clara_test_sessions, so this row is a
  -- self-contained labeled case independent of later prompt/rulebook drift.
  consult_type              TEXT,
  urgency_level             TEXT,
  stat_level                INTEGER,
  confidence                NUMERIC(4,3),
  rationale                 TEXT,
  red_flags                 JSONB        DEFAULT '[]',
  gate0_fired               BOOLEAN      NOT NULL DEFAULT FALSE,
  routing_target            TEXT,

  -- Reviewer verdict.
  verdict                   TEXT         NOT NULL CHECK (verdict IN ('up', 'down')),
  reason                    TEXT,

  -- Optional human-corrected label for a 👎 — one of Clara's 7 consult
  -- types. Intentionally not FK/enum-constrained against a types table
  -- (none exists); validated at the API layer against claraRulebook's
  -- CONSULT_TYPE instead, so this column stays a plain TEXT free label.
  corrected_consult_type    TEXT,

  created_by                TEXT,
  created_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clara_test_feedback_session_id ON clara_test_feedback (session_id);
CREATE INDEX IF NOT EXISTS idx_clara_test_feedback_verdict ON clara_test_feedback (verdict);
CREATE INDEX IF NOT EXISTS idx_clara_test_feedback_created_at ON clara_test_feedback (created_at DESC);
