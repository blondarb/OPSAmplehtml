-- Migration 053: PHI-free closed-loop alert outbox for emergency actions.
--
-- Alert rows intentionally contain only opaque action/alert identifiers,
-- bounded severity/level metadata, and publisher lifecycle evidence. Delivery
-- content and tenant/patient/source data remain outside the queue contract.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'triage_emergency_actions_handoff_evidence_check'
       AND conrelid = 'triage_emergency_actions'::regclass
  ) THEN
    ALTER TABLE triage_emergency_actions
      ADD CONSTRAINT triage_emergency_actions_handoff_evidence_check CHECK (
        status <> 'handed_off' OR (
          contact_attempted_at IS NOT NULL
          AND contact_channel IS NOT NULL
          AND instruction_given IS NOT NULL
          AND delivery_status IN ('delivered', 'not_applicable')
          AND understanding_status IN ('confirmed', 'not_applicable')
          AND outcome IS NOT NULL
          AND (
            (delivery_status = 'delivered'
              AND understanding_status = 'confirmed')
            OR (contact_channel = 'emergency_services'
              AND delivery_status = 'not_applicable'
              AND understanding_status = 'not_applicable')
          )
        )
      ) NOT VALID;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS triage_emergency_action_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emergency_action_id uuid NOT NULL
    REFERENCES triage_emergency_actions(id) ON DELETE RESTRICT,
  sequence_number integer NOT NULL CHECK (sequence_number >= 0),
  alert_kind text NOT NULL CHECK (alert_kind IN ('initial', 'reminder')),
  severity text NOT NULL DEFAULT 'emergency' CHECK (severity = 'emergency'),
  escalation_level smallint NOT NULL CHECK (escalation_level BETWEEN 0 AND 3),
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN (
      'pending', 'leased', 'failed', 'sent', 'terminal_failure', 'suppressed'
    )
  ),
  max_attempts integer NOT NULL DEFAULT 5 CHECK
    (max_attempts BETWEEN 1 AND 10),
  attempt_count integer NOT NULL DEFAULT 0 CHECK
    (attempt_count BETWEEN 0 AND max_attempts),
  next_attempt_at timestamptz,
  lease_token uuid,
  lease_owner text,
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  outcome_lease_token uuid,
  sent_at timestamptz,
  terminal_failed_at timestamptz,
  suppressed_at timestamptz,
  last_error_code text,
  last_error_detail text,
  last_error_at timestamptz,
  last_error_lease_token uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (emergency_action_id, sequence_number),
  CHECK (lease_owner IS NULL OR length(lease_owner) BETWEEN 1 AND 200),
  CHECK (last_error_code IS NULL OR length(last_error_code) BETWEEN 1 AND 100),
  CHECK (last_error_detail IS NULL OR length(last_error_detail) BETWEEN 1 AND 500),
  CHECK (
    (status = 'pending'
      AND attempt_count = 0
      AND next_attempt_at IS NOT NULL
      AND lease_token IS NULL AND lease_owner IS NULL
      AND claimed_at IS NULL AND lease_expires_at IS NULL
      AND outcome_lease_token IS NULL
      AND sent_at IS NULL AND terminal_failed_at IS NULL
      AND suppressed_at IS NULL
      AND last_error_code IS NULL AND last_error_detail IS NULL
      AND last_error_at IS NULL AND last_error_lease_token IS NULL)
    OR (status = 'leased'
      AND attempt_count BETWEEN 1 AND max_attempts
      AND next_attempt_at IS NULL
      AND lease_token IS NOT NULL AND lease_owner IS NOT NULL
      AND claimed_at IS NOT NULL AND lease_expires_at IS NOT NULL
      AND lease_expires_at > claimed_at
      AND outcome_lease_token IS NULL
      AND sent_at IS NULL AND terminal_failed_at IS NULL
      AND suppressed_at IS NULL)
    OR (status = 'failed'
      AND attempt_count BETWEEN 1 AND max_attempts - 1
      AND next_attempt_at IS NOT NULL
      AND lease_token IS NULL AND lease_owner IS NULL
      AND claimed_at IS NULL AND lease_expires_at IS NULL
      AND outcome_lease_token IS NOT NULL
      AND sent_at IS NULL AND terminal_failed_at IS NULL
      AND suppressed_at IS NULL
      AND last_error_code IS NOT NULL AND last_error_detail IS NOT NULL
      AND last_error_at IS NOT NULL AND last_error_lease_token IS NOT NULL)
    OR (status = 'sent'
      AND attempt_count BETWEEN 1 AND max_attempts
      AND next_attempt_at IS NULL
      AND lease_token IS NULL AND lease_owner IS NULL
      AND claimed_at IS NULL AND lease_expires_at IS NULL
      AND outcome_lease_token IS NOT NULL
      AND sent_at IS NOT NULL AND terminal_failed_at IS NULL
      AND suppressed_at IS NULL)
    OR (status = 'terminal_failure'
      AND attempt_count = max_attempts
      AND next_attempt_at IS NULL
      AND lease_token IS NULL AND lease_owner IS NULL
      AND claimed_at IS NULL AND lease_expires_at IS NULL
      AND outcome_lease_token IS NOT NULL
      AND sent_at IS NULL AND terminal_failed_at IS NOT NULL
      AND suppressed_at IS NULL
      AND last_error_code IS NOT NULL AND last_error_detail IS NOT NULL
      AND last_error_at IS NOT NULL AND last_error_lease_token IS NOT NULL)
    OR (status = 'suppressed'
      AND next_attempt_at IS NULL
      AND lease_token IS NULL AND lease_owner IS NULL
      AND claimed_at IS NULL AND lease_expires_at IS NULL
      AND sent_at IS NULL AND terminal_failed_at IS NULL
      AND suppressed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_triage_emergency_action_alerts_dispatch
  ON triage_emergency_action_alerts (status, next_attempt_at, created_at, id)
  WHERE status IN ('pending', 'failed', 'leased');

CREATE INDEX IF NOT EXISTS idx_triage_emergency_action_alerts_terminal_failure
  ON triage_emergency_action_alerts (terminal_failed_at DESC, id)
  WHERE status = 'terminal_failure';

CREATE OR REPLACE FUNCTION enforce_emergency_action_alert_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_action_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'emergency action alerts cannot be deleted';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending'
       OR NEW.sequence_number < 0
       OR NEW.severity <> 'emergency'
       OR NEW.escalation_level NOT BETWEEN 0 AND 3
    THEN
      RAISE EXCEPTION 'new emergency action alerts must start pending';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.emergency_action_id IS DISTINCT FROM NEW.emergency_action_id
     OR OLD.sequence_number IS DISTINCT FROM NEW.sequence_number
     OR OLD.alert_kind IS DISTINCT FROM NEW.alert_kind
     OR OLD.severity IS DISTINCT FROM NEW.severity
     OR OLD.escalation_level IS DISTINCT FROM NEW.escalation_level
     OR OLD.max_attempts IS DISTINCT FROM NEW.max_attempts
     OR OLD.created_at IS DISTINCT FROM NEW.created_at
  THEN
    RAISE EXCEPTION 'emergency action alert identity is immutable';
  END IF;

  IF OLD.status = 'sent' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'sent emergency alerts are immutable';
  END IF;
  IF OLD.status = 'terminal_failure' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'terminal emergency alert failures are immutable';
  END IF;
  IF OLD.status = 'suppressed' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'suppressed emergency alerts are immutable';
  END IF;

  IF OLD.status <> NEW.status AND NOT (
    (OLD.status IN ('pending', 'failed') AND NEW.status IN ('leased', 'suppressed'))
    OR (OLD.status = 'leased' AND NEW.status IN (
      'sent', 'failed', 'terminal_failure', 'suppressed'
    ))
  ) THEN
    RAISE EXCEPTION 'invalid emergency alert status transition';
  END IF;

  IF NEW.status = 'leased' AND OLD.status <> 'leased' THEN
    IF NEW.lease_token IS NULL
       OR NEW.lease_token IS NOT DISTINCT FROM OLD.lease_token
       OR NEW.lease_owner IS NULL
       OR NEW.claimed_at IS NULL
       OR NEW.lease_expires_at IS NULL
       OR NEW.lease_expires_at <= NEW.claimed_at
       OR NEW.attempt_count <> OLD.attempt_count + 1
       OR NEW.attempt_count > NEW.max_attempts
       OR NEW.next_attempt_at IS NOT NULL
       OR NEW.outcome_lease_token IS NOT NULL
    THEN
      RAISE EXCEPTION 'invalid emergency alert lease acquisition';
    END IF;
  ELSIF OLD.status = 'leased' AND NEW.status = 'leased' THEN
    IF OLD.lease_expires_at > v_now THEN
      IF (
         NEW.lease_token IS DISTINCT FROM OLD.lease_token
         OR NEW.lease_owner IS DISTINCT FROM OLD.lease_owner
         OR NEW.claimed_at IS DISTINCT FROM OLD.claimed_at
         OR NEW.lease_expires_at IS DISTINCT FROM OLD.lease_expires_at
         OR NEW.attempt_count IS DISTINCT FROM OLD.attempt_count
         OR NEW.next_attempt_at IS DISTINCT FROM OLD.next_attempt_at
         OR NEW.outcome_lease_token IS DISTINCT FROM OLD.outcome_lease_token
      ) THEN
        RAISE EXCEPTION 'active emergency alert lease cannot be replaced';
      END IF;
    ELSIF NEW.lease_token IS NULL
       OR NEW.lease_token IS NOT DISTINCT FROM OLD.lease_token
       OR NEW.lease_owner IS NULL
       OR NEW.claimed_at IS NULL
       OR NEW.lease_expires_at IS NULL
       OR NEW.lease_expires_at <= NEW.claimed_at
       OR NEW.attempt_count <> OLD.attempt_count + 1
       OR NEW.attempt_count > NEW.max_attempts
       OR NEW.next_attempt_at IS NOT NULL
       OR NEW.outcome_lease_token IS NOT NULL
    THEN
      RAISE EXCEPTION 'expired emergency alert lease reclaim is invalid';
    END IF;
  ELSIF OLD.status = 'leased'
        AND NEW.status IN ('sent', 'failed', 'terminal_failure')
  THEN
    IF OLD.lease_expires_at <= v_now THEN
      RAISE EXCEPTION 'emergency alert lease is expired or stale';
    END IF;
    IF NEW.outcome_lease_token IS DISTINCT FROM OLD.lease_token THEN
      RAISE EXCEPTION 'emergency alert outcome lease token is stale';
    END IF;
  END IF;

  IF NEW.status = 'sent' AND (
    NEW.sent_at IS NULL
    OR NEW.next_attempt_at IS NOT NULL
    OR NEW.lease_token IS NOT NULL
    OR NEW.lease_owner IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'sent emergency alert evidence is incomplete';
  END IF;

  IF NEW.status = 'failed' AND (
    NEW.attempt_count >= NEW.max_attempts
    OR NEW.next_attempt_at IS NULL
    OR NEW.last_error_code IS NULL
    OR NEW.last_error_detail IS NULL
    OR NEW.last_error_at IS NULL
    OR NEW.last_error_lease_token IS DISTINCT FROM OLD.lease_token
  ) THEN
    RAISE EXCEPTION 'retryable emergency alert failure evidence is incomplete';
  END IF;

  IF NEW.status = 'terminal_failure' AND (
    NEW.attempt_count <> NEW.max_attempts
    OR NEW.next_attempt_at IS NOT NULL
    OR NEW.terminal_failed_at IS NULL
    OR NEW.last_error_code IS NULL
    OR NEW.last_error_detail IS NULL
    OR NEW.last_error_at IS NULL
    OR NEW.last_error_lease_token IS DISTINCT FROM OLD.lease_token
  ) THEN
    RAISE EXCEPTION 'terminal emergency alert failure evidence is incomplete';
  END IF;

  IF NEW.status = 'suppressed' AND OLD.status <> 'suppressed' THEN
    SELECT action.status
      INTO v_action_status
      FROM triage_emergency_actions action
     WHERE action.id = NEW.emergency_action_id;
    IF v_action_status NOT IN ('handed_off', 'closed') THEN
      RAISE EXCEPTION 'emergency alert suppression requires verified resolution';
    END IF;
  END IF;

  NEW.updated_at := v_now;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS triage_emergency_action_alert_lifecycle_guard
  ON triage_emergency_action_alerts;
CREATE TRIGGER triage_emergency_action_alert_lifecycle_guard
BEFORE INSERT OR UPDATE OR DELETE ON triage_emergency_action_alerts
FOR EACH ROW EXECUTE FUNCTION enforce_emergency_action_alert_lifecycle();

CREATE OR REPLACE FUNCTION enqueue_initial_emergency_action_alert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO triage_emergency_action_alerts (
    emergency_action_id,
    sequence_number,
    alert_kind,
    severity,
    escalation_level,
    status,
    next_attempt_at
  ) VALUES (NEW.id, 0, 'initial', 'emergency', 0, 'pending', clock_timestamp())
  ON CONFLICT (emergency_action_id, sequence_number) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS triage_emergency_action_initial_alert
  ON triage_emergency_actions;
CREATE TRIGGER triage_emergency_action_initial_alert
AFTER INSERT ON triage_emergency_actions
FOR EACH ROW EXECUTE FUNCTION enqueue_initial_emergency_action_alert();

-- backfill active emergency actions created before this outbox existed.
INSERT INTO triage_emergency_action_alerts (
  emergency_action_id,
  sequence_number,
  alert_kind,
  severity,
  escalation_level,
  status,
  next_attempt_at
)
SELECT action.id, 0, 'initial', 'emergency', 0, 'pending', clock_timestamp()
  FROM triage_emergency_actions action
 WHERE action.status IN ('open', 'attempting_contact', 'failed')
ON CONFLICT (emergency_action_id, sequence_number) DO NOTHING;

CREATE OR REPLACE FUNCTION suppress_resolved_emergency_action_alerts()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('handed_off', 'closed')
     AND OLD.status IS DISTINCT FROM NEW.status
  THEN
    UPDATE triage_emergency_action_alerts
       SET status = 'suppressed',
           next_attempt_at = NULL,
           outcome_lease_token = COALESCE(lease_token, outcome_lease_token),
           lease_token = NULL,
           lease_owner = NULL,
           claimed_at = NULL,
           lease_expires_at = NULL,
           suppressed_at = clock_timestamp(),
           updated_at = clock_timestamp()
     WHERE emergency_action_id = NEW.id
       AND status IN ('pending', 'leased', 'failed');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS triage_emergency_action_alert_suppression
  ON triage_emergency_actions;
CREATE TRIGGER triage_emergency_action_alert_suppression
AFTER UPDATE OF status ON triage_emergency_actions
FOR EACH ROW EXECUTE FUNCTION suppress_resolved_emergency_action_alerts();
