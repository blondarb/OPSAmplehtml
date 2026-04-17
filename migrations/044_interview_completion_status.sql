-- ============================================================================
-- Migration 044: interview_completion_status
--
-- Distinguishes interviews the AI finished naturally (via save_interview_output)
-- from interviews the patient ended early. Downstream consumers (report
-- generation, physician review UI) branch on this so a partial intake is not
-- treated as a complete clinical history.
--
-- Nullable: existing rows and in-flight sessions have no value until end.
--
-- Run against: AWS RDS PostgreSQL (ops_amplehtml database)
-- ============================================================================

ALTER TABLE historian_sessions
  ADD COLUMN IF NOT EXISTS interview_completion_status TEXT;

ALTER TABLE neurology_consults
  ADD COLUMN IF NOT EXISTS interview_completion_status TEXT;

ALTER TABLE historian_sessions
  DROP CONSTRAINT IF EXISTS chk_historian_sessions_interview_completion_status;
ALTER TABLE historian_sessions
  ADD CONSTRAINT chk_historian_sessions_interview_completion_status
  CHECK (interview_completion_status IS NULL
         OR interview_completion_status IN ('complete', 'ended_early'));

ALTER TABLE neurology_consults
  DROP CONSTRAINT IF EXISTS chk_neurology_consults_interview_completion_status;
ALTER TABLE neurology_consults
  ADD CONSTRAINT chk_neurology_consults_interview_completion_status
  CHECK (interview_completion_status IS NULL
         OR interview_completion_status IN ('complete', 'ended_early'));
