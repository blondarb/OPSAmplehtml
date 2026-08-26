-- Migration 064: invitation-only Comprehensive v4 report-first evaluation.
--
-- Additive product artifacts remain outside browser-supplied structured_output.
-- The server owns diagnostic_sufficiency; the durable worker owns the cited
-- clinician report and staged evaluation state. No legacy row is backfilled.

ALTER TABLE historian_sessions
  ADD COLUMN IF NOT EXISTS diagnostic_sufficiency jsonb,
  ADD COLUMN IF NOT EXISTS clinician_history_report jsonb;

ALTER TABLE historian_sessions
  DROP CONSTRAINT IF EXISTS chk_historian_sessions_diagnostic_sufficiency_object,
  DROP CONSTRAINT IF EXISTS chk_historian_sessions_clinician_history_report_object;
ALTER TABLE historian_sessions
  ADD CONSTRAINT chk_historian_sessions_diagnostic_sufficiency_object
    CHECK (diagnostic_sufficiency IS NULL OR jsonb_typeof(diagnostic_sufficiency) = 'object'),
  ADD CONSTRAINT chk_historian_sessions_clinician_history_report_object
    CHECK (clinician_history_report IS NULL OR jsonb_typeof(clinician_history_report) = 'object');

ALTER TABLE historian_eval_jobs
  ADD COLUMN IF NOT EXISTS pipeline_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS current_stage text NOT NULL DEFAULT 'legacy';

ALTER TABLE historian_eval_jobs
  DROP CONSTRAINT IF EXISTS chk_historian_eval_jobs_pipeline_version,
  DROP CONSTRAINT IF EXISTS chk_historian_eval_jobs_current_stage;
ALTER TABLE historian_eval_jobs
  ADD CONSTRAINT chk_historian_eval_jobs_pipeline_version
    CHECK (pipeline_version IN (1, 2)),
  ADD CONSTRAINT chk_historian_eval_jobs_current_stage
    CHECK (current_stage IN (
      'legacy',
      'report_pending',
      'report_ready',
      'ddx_withheld',
      'ddx_ready',
      'supplements_ready',
      'completed'
    ));

ALTER TABLE historian_evaluations
  ADD COLUMN IF NOT EXISTS input_digest text;

ALTER TABLE historian_evaluations
  DROP CONSTRAINT IF EXISTS chk_historian_evaluations_input_digest;
ALTER TABLE historian_evaluations
  ADD CONSTRAINT chk_historian_evaluations_input_digest
    CHECK (input_digest IS NULL OR input_digest ~ '^[0-9a-f]{64}$');

CREATE UNIQUE INDEX IF NOT EXISTS uq_historian_evaluations_digest
  ON historian_evaluations (session_id, evaluator, prompt_version, input_digest)
  WHERE input_digest IS NOT NULL;

ALTER TABLE historian_sessions
  DROP CONSTRAINT IF EXISTS historian_sessions_prompt_version_check;
ALTER TABLE historian_sessions
  ADD CONSTRAINT historian_sessions_prompt_version_check
  CHECK (
    interview_prompt_version IS NULL OR
    interview_prompt_version IN (
      'standard-v1',
      'comprehensive-v1',
      'comprehensive-v2',
      'comprehensive-v3',
      'comprehensive-v4'
    )
  );
ALTER TABLE historian_invites
  DROP CONSTRAINT IF EXISTS historian_invites_interview_prompt_version_check;
ALTER TABLE historian_invites
  ADD CONSTRAINT historian_invites_interview_prompt_version_check
  CHECK (
    interview_prompt_version IN (
      'comprehensive-v1',
      'comprehensive-v2',
      'comprehensive-v3',
      'comprehensive-v4'
    )
  );
