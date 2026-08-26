-- Migration 062: bind invited Historian startup, recovery, and transcript
-- writes to one server-minted attempt. A recovered retry receives a different
-- value, making delayed requests from the prior browser/provider stale.

ALTER TABLE historian_invites
  ADD COLUMN IF NOT EXISTS startup_attempt_id uuid;

CREATE INDEX IF NOT EXISTS idx_historian_invites_startup_attempt
  ON historian_invites (session_id, startup_attempt_id)
  WHERE startup_attempt_id IS NOT NULL;
