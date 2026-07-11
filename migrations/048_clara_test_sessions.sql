-- Migration 048: clara_test_sessions
--
-- Storage for the Clara browser voice test harness (/rnd/clara, R&D /
-- internal only, feature-flagged, password-gated — see
-- src/app/rnd/clara/page.tsx). Each row is one test call: the full turn-by-
-- turn transcript, Gate 0 verdict + classifier output per turn, and the
-- final routing decision. Field names deliberately mirror
-- sevaro-voice-agent's ConsultClassificationResult
-- (src/services/consult-classification/consultclassificationService.ts) so
-- that repo's eval harness can replay/score sessions logged here.
--
-- Synthetic data only — this table must never receive real PHI.
--
-- Run: psql $RDS_URL -f migrations/048_clara_test_sessions.sql
-- Rollback: DROP TABLE IF EXISTS clara_test_sessions;

CREATE TABLE IF NOT EXISTS clara_test_sessions (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Free-text label the tester can set before/after a run (e.g. "stroke BEFAST scenario").
  test_label               TEXT,

  -- Ordered turn-by-turn transcript. Each element:
  --   { role: 'user'|'assistant', text, ts (epoch ms),
  --     gate0?: { fired, category, matchedTerms },
  --     classification?: ConsultClassificationResult-shaped object (see below) }
  turns                    JSONB        NOT NULL DEFAULT '[]',

  -- Final/most-severe classification result for the session, using the SAME
  -- field names as ConsultClassificationResult so the eval harness can diff
  -- against sevaro-voice-agent's live output directly.
  consult_type             TEXT,
  confidence               NUMERIC(4,3),
  rationale                TEXT,
  stat_level                INTEGER,
  red_flags                JSONB        DEFAULT '[]',
  urgency_level            TEXT,
  needs_clarification      BOOLEAN      DEFAULT FALSE,
  clarification_questions  JSONB        DEFAULT '[]',

  -- Narrated routing decision (no real Twilio transfer / Synapse write in this phase).
  routing                  JSONB,

  -- True if Gate 0 (deterministic red-flag intercept) fired at any point in the session.
  gate0_fired               BOOLEAN      NOT NULL DEFAULT FALSE,

  duration_seconds          INTEGER,
  turn_count                INTEGER,

  -- Free-form metadata (voice provider/model ids, app version, etc.) for debugging.
  metadata                  JSONB,

  created_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clara_test_sessions_created_at ON clara_test_sessions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clara_test_sessions_consult_type ON clara_test_sessions (consult_type);
