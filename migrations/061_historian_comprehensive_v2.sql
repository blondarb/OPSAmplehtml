-- Migration 061: default-off Comprehensive v2 persistence vocabulary.
--
-- This permits invitations and sessions to record the v2 controller contract,
-- without enabling it.  A complete_with_uncertainty termination represents an
-- interview whose required patient evidence was obtained but includes an
-- explicitly unknown or declined answer; it is complete, never ended early.

ALTER TABLE historian_sessions
  DROP CONSTRAINT IF EXISTS historian_sessions_prompt_version_check;
ALTER TABLE historian_sessions
  ADD CONSTRAINT historian_sessions_prompt_version_check
  CHECK (interview_prompt_version IS NULL OR interview_prompt_version IN ('standard-v1', 'comprehensive-v1', 'comprehensive-v2'));

ALTER TABLE historian_invites
  DROP CONSTRAINT IF EXISTS historian_invites_interview_prompt_version_check;
ALTER TABLE historian_invites
  ADD CONSTRAINT historian_invites_interview_prompt_version_check
  CHECK (interview_prompt_version IN ('comprehensive-v1', 'comprehensive-v2'));

ALTER TABLE historian_sessions
  DROP CONSTRAINT IF EXISTS chk_historian_sessions_termination_reason,
  DROP CONSTRAINT IF EXISTS chk_historian_sessions_completion_reason_match;
ALTER TABLE historian_sessions
  ADD CONSTRAINT chk_historian_sessions_termination_reason
    CHECK (interview_termination_reason IS NULL OR interview_termination_reason IN ('coverage_complete', 'complete_with_uncertainty', 'patient_requested_stop', 'safety_escalated', 'hard_stop', 'manual_end', 'transport_lost', 'provider_error', 'unresponsive')),
  ADD CONSTRAINT chk_historian_sessions_completion_reason_match
    CHECK (interview_termination_reason IS NULL OR (interview_completion_status = 'complete' AND interview_termination_reason IN ('coverage_complete', 'complete_with_uncertainty')) OR (interview_completion_status = 'ended_early' AND interview_termination_reason NOT IN ('coverage_complete', 'complete_with_uncertainty')));

ALTER TABLE neurology_consults
  DROP CONSTRAINT IF EXISTS chk_neurology_consults_termination_reason,
  DROP CONSTRAINT IF EXISTS chk_neurology_consults_completion_reason_match;
ALTER TABLE neurology_consults
  ADD CONSTRAINT chk_neurology_consults_termination_reason
    CHECK (interview_termination_reason IS NULL OR interview_termination_reason IN ('coverage_complete', 'complete_with_uncertainty', 'patient_requested_stop', 'safety_escalated', 'hard_stop', 'manual_end', 'transport_lost', 'provider_error', 'unresponsive')),
  ADD CONSTRAINT chk_neurology_consults_completion_reason_match
    CHECK (interview_termination_reason IS NULL OR (interview_completion_status = 'complete' AND interview_termination_reason IN ('coverage_complete', 'complete_with_uncertainty')) OR (interview_completion_status = 'ended_early' AND interview_termination_reason NOT IN ('coverage_complete', 'complete_with_uncertainty')));
