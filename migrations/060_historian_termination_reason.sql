-- Migration 060: explicit Historian termination reason
--
-- save_interview_output can occur after complete coverage or as a terminal
-- partial save (patient stop, safety escalation, hard ceiling, transport loss,
-- provider error, manual end, or unresponsiveness). Persist the cause so a
-- successful tool call can never make a partial history look complete.

ALTER TABLE historian_sessions
  ADD COLUMN IF NOT EXISTS interview_termination_reason text;

ALTER TABLE neurology_consults
  ADD COLUMN IF NOT EXISTS interview_termination_reason text;

ALTER TABLE historian_sessions
  DROP CONSTRAINT IF EXISTS chk_historian_sessions_termination_reason;
ALTER TABLE historian_sessions
  ADD CONSTRAINT chk_historian_sessions_termination_reason
  CHECK (
    interview_termination_reason IS NULL
    OR interview_termination_reason IN (
      'coverage_complete',
      'patient_requested_stop',
      'safety_escalated',
      'hard_stop',
      'manual_end',
      'transport_lost',
      'provider_error',
      'unresponsive'
    )
  );

ALTER TABLE neurology_consults
  DROP CONSTRAINT IF EXISTS chk_neurology_consults_termination_reason;
ALTER TABLE neurology_consults
  ADD CONSTRAINT chk_neurology_consults_termination_reason
  CHECK (
    interview_termination_reason IS NULL
    OR interview_termination_reason IN (
      'coverage_complete',
      'patient_requested_stop',
      'safety_escalated',
      'hard_stop',
      'manual_end',
      'transport_lost',
      'provider_error',
      'unresponsive'
    )
  );

ALTER TABLE historian_sessions
  DROP CONSTRAINT IF EXISTS chk_historian_sessions_completion_reason_match;
ALTER TABLE historian_sessions
  ADD CONSTRAINT chk_historian_sessions_completion_reason_match
  CHECK (
    interview_termination_reason IS NULL
    OR (interview_completion_status = 'complete' AND interview_termination_reason = 'coverage_complete')
    OR (interview_completion_status = 'ended_early' AND interview_termination_reason <> 'coverage_complete')
  );

ALTER TABLE neurology_consults
  DROP CONSTRAINT IF EXISTS chk_neurology_consults_completion_reason_match;
ALTER TABLE neurology_consults
  ADD CONSTRAINT chk_neurology_consults_completion_reason_match
  CHECK (
    interview_termination_reason IS NULL
    OR (interview_completion_status = 'complete' AND interview_termination_reason = 'coverage_complete')
    OR (interview_completion_status = 'ended_early' AND interview_termination_reason <> 'coverage_complete')
  );
