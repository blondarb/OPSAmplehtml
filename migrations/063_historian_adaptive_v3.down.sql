DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM historian_sessions
     WHERE interview_prompt_version = 'comprehensive-v3'
  ) OR EXISTS (
    SELECT 1 FROM historian_invites
     WHERE interview_prompt_version = 'comprehensive-v3'
  ) THEN
    RAISE EXCEPTION 'Cannot remove Comprehensive v3 vocabulary while v3 rows exist';
  END IF;
END $$;

ALTER TABLE historian_sessions
  DROP CONSTRAINT IF EXISTS historian_sessions_prompt_version_check;
ALTER TABLE historian_sessions
  ADD CONSTRAINT historian_sessions_prompt_version_check
  CHECK (
    interview_prompt_version IS NULL OR
    interview_prompt_version IN ('standard-v1', 'comprehensive-v1', 'comprehensive-v2')
  );

ALTER TABLE historian_invites
  DROP CONSTRAINT IF EXISTS historian_invites_interview_prompt_version_check;
ALTER TABLE historian_invites
  ADD CONSTRAINT historian_invites_interview_prompt_version_check
  CHECK (interview_prompt_version IN ('comprehensive-v1', 'comprehensive-v2'));
