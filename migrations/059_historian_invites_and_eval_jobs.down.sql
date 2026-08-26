DROP TABLE IF EXISTS historian_eval_jobs;
DROP TABLE IF EXISTS historian_invites;

DROP INDEX IF EXISTS idx_historian_sessions_consult;

ALTER TABLE historian_sessions
  DROP CONSTRAINT IF EXISTS historian_sessions_interview_mode_check,
  DROP CONSTRAINT IF EXISTS historian_sessions_prompt_version_check,
  DROP COLUMN IF EXISTS authorized_by_user_id,
  DROP COLUMN IF EXISTS interview_prompt_version,
  DROP COLUMN IF EXISTS interview_mode,
  DROP COLUMN IF EXISTS consult_id;
