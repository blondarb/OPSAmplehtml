DROP INDEX IF EXISTS idx_historian_invites_startup_attempt;

ALTER TABLE historian_invites
  DROP COLUMN IF EXISTS startup_attempt_id;
