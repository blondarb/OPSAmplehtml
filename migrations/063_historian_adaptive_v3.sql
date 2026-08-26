-- Migration 063: default-off Comprehensive v3 adaptive interview vocabulary.
--
-- This permits an invitation/session to record the AI-led Nova + Claude
-- conductor + silent-review contract.  Enabling the feature flag and relay
-- admission mode remains a separate QA deployment action.

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
      'comprehensive-v3'
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
      'comprehensive-v3'
    )
  );
