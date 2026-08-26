-- Fail closed rather than erase v4 product artifacts or staged-job evidence.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM historian_sessions
     WHERE interview_prompt_version = 'comprehensive-v4'
        OR diagnostic_sufficiency IS NOT NULL
        OR clinician_history_report IS NOT NULL
  ) OR EXISTS (
    SELECT 1 FROM historian_eval_jobs
     WHERE pipeline_version = 2 OR current_stage <> 'legacy'
  ) OR EXISTS (
    SELECT 1 FROM historian_evaluations WHERE input_digest IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Cannot remove Comprehensive v4 schema while v4 evidence exists';
  END IF;
END $$;

DROP INDEX IF EXISTS uq_historian_evaluations_digest;
ALTER TABLE historian_evaluations
  DROP CONSTRAINT IF EXISTS chk_historian_evaluations_input_digest,
  DROP COLUMN IF EXISTS input_digest;

ALTER TABLE historian_eval_jobs
  DROP CONSTRAINT IF EXISTS chk_historian_eval_jobs_pipeline_version,
  DROP CONSTRAINT IF EXISTS chk_historian_eval_jobs_current_stage,
  DROP COLUMN IF EXISTS pipeline_version,
  DROP COLUMN IF EXISTS current_stage;

ALTER TABLE historian_sessions
  DROP CONSTRAINT IF EXISTS chk_historian_sessions_diagnostic_sufficiency_object,
  DROP CONSTRAINT IF EXISTS chk_historian_sessions_clinician_history_report_object,
  DROP COLUMN IF EXISTS diagnostic_sufficiency,
  DROP COLUMN IF EXISTS clinician_history_report;

ALTER TABLE historian_sessions
  DROP CONSTRAINT IF EXISTS historian_sessions_prompt_version_check;
ALTER TABLE historian_sessions
  ADD CONSTRAINT historian_sessions_prompt_version_check
  CHECK (
    interview_prompt_version IS NULL OR
    interview_prompt_version IN (
      'standard-v1', 'comprehensive-v1', 'comprehensive-v2', 'comprehensive-v3'
    )
  );
ALTER TABLE historian_invites
  DROP CONSTRAINT IF EXISTS historian_invites_interview_prompt_version_check;
ALTER TABLE historian_invites
  ADD CONSTRAINT historian_invites_interview_prompt_version_check
  CHECK (
    interview_prompt_version IN (
      'comprehensive-v1', 'comprehensive-v2', 'comprehensive-v3'
    )
  );
