-- Migration 061 down: fail closed if v2 rows would be invalid under v1.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM historian_sessions WHERE interview_prompt_version = 'comprehensive-v2' OR interview_termination_reason = 'complete_with_uncertainty')
     OR EXISTS (SELECT 1 FROM historian_invites WHERE interview_prompt_version = 'comprehensive-v2')
     OR EXISTS (SELECT 1 FROM neurology_consults WHERE interview_termination_reason = 'complete_with_uncertainty') THEN
    RAISE EXCEPTION 'Cannot revert migration 061 while Comprehensive v2 or complete_with_uncertainty rows exist';
  END IF;
END $$;

ALTER TABLE historian_sessions
  DROP CONSTRAINT IF EXISTS historian_sessions_prompt_version_check,
  DROP CONSTRAINT IF EXISTS chk_historian_sessions_termination_reason,
  DROP CONSTRAINT IF EXISTS chk_historian_sessions_completion_reason_match;
ALTER TABLE historian_sessions
  ADD CONSTRAINT historian_sessions_prompt_version_check
    CHECK (interview_prompt_version IS NULL OR interview_prompt_version IN ('standard-v1', 'comprehensive-v1')),
  ADD CONSTRAINT chk_historian_sessions_termination_reason
    CHECK (interview_termination_reason IS NULL OR interview_termination_reason IN ('coverage_complete', 'patient_requested_stop', 'safety_escalated', 'hard_stop', 'manual_end', 'transport_lost', 'provider_error', 'unresponsive')),
  ADD CONSTRAINT chk_historian_sessions_completion_reason_match
    CHECK (interview_termination_reason IS NULL OR (interview_completion_status = 'complete' AND interview_termination_reason = 'coverage_complete') OR (interview_completion_status = 'ended_early' AND interview_termination_reason <> 'coverage_complete'));

ALTER TABLE historian_invites
  DROP CONSTRAINT IF EXISTS historian_invites_interview_prompt_version_check;
ALTER TABLE historian_invites
  ADD CONSTRAINT historian_invites_interview_prompt_version_check
  CHECK (interview_prompt_version = 'comprehensive-v1');

ALTER TABLE neurology_consults
  DROP CONSTRAINT IF EXISTS chk_neurology_consults_termination_reason,
  DROP CONSTRAINT IF EXISTS chk_neurology_consults_completion_reason_match;
ALTER TABLE neurology_consults
  ADD CONSTRAINT chk_neurology_consults_termination_reason
    CHECK (interview_termination_reason IS NULL OR interview_termination_reason IN ('coverage_complete', 'patient_requested_stop', 'safety_escalated', 'hard_stop', 'manual_end', 'transport_lost', 'provider_error', 'unresponsive')),
  ADD CONSTRAINT chk_neurology_consults_completion_reason_match
    CHECK (interview_termination_reason IS NULL OR (interview_completion_status = 'complete' AND interview_termination_reason = 'coverage_complete') OR (interview_completion_status = 'ended_early' AND interview_termination_reason <> 'coverage_complete'));
