ALTER TABLE historian_sessions
  DROP CONSTRAINT IF EXISTS chk_historian_sessions_completion_reason_match,
  DROP CONSTRAINT IF EXISTS chk_historian_sessions_termination_reason,
  DROP COLUMN IF EXISTS interview_termination_reason;

ALTER TABLE neurology_consults
  DROP CONSTRAINT IF EXISTS chk_neurology_consults_completion_reason_match,
  DROP CONSTRAINT IF EXISTS chk_neurology_consults_termination_reason,
  DROP COLUMN IF EXISTS interview_termination_reason;
