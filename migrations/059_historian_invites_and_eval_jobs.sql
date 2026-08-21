-- Migration 059: server-bound Comprehensive Historian invitations and durable DDx work
--
-- A clinician creates a one-time patient link. Only SHA-256 digests of the
-- invitation and browser-grant tokens are stored; the URL carries the raw
-- invitation token in its fragment so it is not sent in HTTP request lines or
-- referrer headers. The invitation pre-creates the historian session and binds
-- it to one tenant, consult, patient, clinician, provider, mode, and prompt
-- version. Patient-facing APIs resolve that binding from an HttpOnly grant and
-- ignore caller-supplied identity/context fields.
--
-- The evaluation job is the database source of truth for the physician-only
-- full-transcript differential. SQS messages contain only the opaque job UUID;
-- a scheduled dispatcher can recover pending, retry-due, or expired leases.

ALTER TABLE historian_sessions
  ADD COLUMN IF NOT EXISTS consult_id uuid REFERENCES neurology_consults(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS interview_mode text,
  ADD COLUMN IF NOT EXISTS interview_prompt_version text,
  ADD COLUMN IF NOT EXISTS authorized_by_user_id text;

ALTER TABLE historian_sessions
  DROP CONSTRAINT IF EXISTS historian_sessions_interview_mode_check,
  DROP CONSTRAINT IF EXISTS historian_sessions_prompt_version_check;

ALTER TABLE historian_sessions
  ADD CONSTRAINT historian_sessions_interview_mode_check
    CHECK (interview_mode IS NULL OR interview_mode IN ('standard', 'comprehensive')),
  ADD CONSTRAINT historian_sessions_prompt_version_check
    CHECK (
      interview_prompt_version IS NULL
      OR interview_prompt_version IN ('standard-v1', 'comprehensive-v1')
    );

CREATE INDEX IF NOT EXISTS idx_historian_sessions_consult
  ON historian_sessions (tenant_id, consult_id, created_at DESC)
  WHERE consult_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS historian_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  consult_id uuid NOT NULL REFERENCES neurology_consults(id) ON DELETE RESTRICT,
  patient_id uuid REFERENCES patients(id) ON DELETE SET NULL,
  session_id uuid NOT NULL UNIQUE REFERENCES historian_sessions(id) ON DELETE RESTRICT,
  invited_by_user_id text NOT NULL,
  provider text NOT NULL DEFAULT 'nova' CHECK (provider = 'nova'),
  interview_mode text NOT NULL DEFAULT 'comprehensive'
    CHECK (interview_mode = 'comprehensive'),
  interview_prompt_version text NOT NULL DEFAULT 'comprehensive-v1'
    CHECK (interview_prompt_version = 'comprehensive-v1'),
  token_hash char(64) NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'redeemed', 'in_progress', 'completed', 'revoked', 'expired')),
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  revoked_at timestamptz,
  identity_verified_at timestamptz,
  verification_attempts integer NOT NULL DEFAULT 0
    CHECK (verification_attempts >= 0 AND verification_attempts <= 5),
  grant_token_hash char(64) UNIQUE,
  grant_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (grant_token_hash IS NULL AND grant_expires_at IS NULL)
    OR (grant_token_hash IS NOT NULL AND grant_expires_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_historian_invites_consult
  ON historian_invites (tenant_id, consult_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_historian_invites_grant
  ON historian_invites (grant_token_hash)
  WHERE grant_token_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS historian_eval_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  session_id uuid NOT NULL UNIQUE REFERENCES historian_sessions(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'leased', 'retry_wait', 'completed', 'failed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error_code text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    status <> 'leased'
    OR (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_historian_eval_jobs_dispatch
  ON historian_eval_jobs (next_attempt_at, created_at)
  WHERE status IN ('pending', 'retry_wait', 'leased');
