-- Migration 054: durable emergency-alert delivery into the critical UI.
--
-- The FIFO message remains an opaque alert/action reference. This ledger is
-- keyed one-to-one by alert ID and stores only delivery lifecycle evidence;
-- tenant/team routing and notification content are resolved from authoritative
-- database rows while a delivery lease is active.

CREATE TABLE IF NOT EXISTS triage_emergency_alert_notification_deliveries (
  emergency_alert_id uuid PRIMARY KEY
    REFERENCES triage_emergency_action_alerts(id) ON DELETE RESTRICT,
  emergency_action_id uuid NOT NULL
    REFERENCES triage_emergency_actions(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending' CHECK
    (status IN ('pending', 'leased', 'failed', 'delivered', 'terminal_failure', 'suppressed')),
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
  notification_id text,
  delivered_at timestamptz,
  terminal_failed_at timestamptz,
  suppressed_at timestamptz,
  last_error_code text,
  last_error_detail text,
  last_error_at timestamptz,
  last_error_lease_token uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notification_id),
  UNIQUE (emergency_alert_id, emergency_action_id),
  CHECK (lease_owner IS NULL OR length(lease_owner) BETWEEN 1 AND 200),
  CHECK (notification_id IS NULL OR length(notification_id) BETWEEN 1 AND 200),
  CHECK (last_error_code IS NULL OR length(last_error_code) BETWEEN 1 AND 100),
  CHECK (last_error_detail IS NULL OR length(last_error_detail) BETWEEN 1 AND 500),
  CHECK (
    (status = 'pending'
      AND attempt_count = 0
      AND next_attempt_at IS NOT NULL
      AND lease_token IS NULL AND lease_owner IS NULL
      AND claimed_at IS NULL AND lease_expires_at IS NULL
      AND outcome_lease_token IS NULL
      AND notification_id IS NULL AND delivered_at IS NULL
      AND terminal_failed_at IS NULL AND suppressed_at IS NULL
      AND last_error_code IS NULL AND last_error_detail IS NULL
      AND last_error_at IS NULL AND last_error_lease_token IS NULL)
    OR (status = 'leased'
      AND attempt_count BETWEEN 1 AND max_attempts
      AND next_attempt_at IS NULL
      AND lease_token IS NOT NULL AND lease_owner IS NOT NULL
      AND claimed_at IS NOT NULL AND lease_expires_at IS NOT NULL
      AND lease_expires_at > claimed_at
      AND outcome_lease_token IS NULL
      AND notification_id IS NULL AND delivered_at IS NULL
      AND terminal_failed_at IS NULL AND suppressed_at IS NULL)
    OR (status = 'failed'
      AND attempt_count BETWEEN 1 AND max_attempts - 1
      AND next_attempt_at IS NOT NULL
      AND lease_token IS NULL AND lease_owner IS NULL
      AND claimed_at IS NULL AND lease_expires_at IS NULL
      AND outcome_lease_token IS NOT NULL
      AND notification_id IS NULL AND delivered_at IS NULL
      AND terminal_failed_at IS NULL AND suppressed_at IS NULL
      AND last_error_code IS NOT NULL AND last_error_detail IS NOT NULL
      AND last_error_at IS NOT NULL AND last_error_lease_token IS NOT NULL)
    OR (status = 'delivered'
      AND attempt_count BETWEEN 1 AND max_attempts
      AND next_attempt_at IS NULL
      AND lease_token IS NULL AND lease_owner IS NULL
      AND claimed_at IS NULL AND lease_expires_at IS NULL
      AND outcome_lease_token IS NOT NULL
      AND notification_id IS NOT NULL AND delivered_at IS NOT NULL
      AND terminal_failed_at IS NULL AND suppressed_at IS NULL)
    OR (status = 'terminal_failure'
      AND attempt_count = max_attempts
      AND next_attempt_at IS NULL
      AND lease_token IS NULL AND lease_owner IS NULL
      AND claimed_at IS NULL AND lease_expires_at IS NULL
      AND outcome_lease_token IS NOT NULL
      AND notification_id IS NULL AND delivered_at IS NULL
      AND terminal_failed_at IS NOT NULL AND suppressed_at IS NULL
      AND last_error_code IS NOT NULL AND last_error_detail IS NOT NULL
      AND last_error_at IS NOT NULL AND last_error_lease_token IS NOT NULL)
    OR (status = 'suppressed'
      AND next_attempt_at IS NULL
      AND lease_token IS NULL AND lease_owner IS NULL
      AND claimed_at IS NULL AND lease_expires_at IS NULL
      AND notification_id IS NULL AND delivered_at IS NULL
      AND terminal_failed_at IS NULL AND suppressed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_triage_emergency_alert_notification_delivery_work
  ON triage_emergency_alert_notification_deliveries
    (status, next_attempt_at, lease_expires_at, created_at)
  WHERE status IN ('pending', 'leased', 'failed');

CREATE INDEX IF NOT EXISTS idx_triage_emergency_alert_notification_delivery_terminal
  ON triage_emergency_alert_notification_deliveries
    (terminal_failed_at DESC, emergency_alert_id)
  WHERE status = 'terminal_failure';

CREATE OR REPLACE FUNCTION enforce_emergency_alert_notification_delivery_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_action_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'emergency alert notification deliveries cannot be deleted';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending'
       OR NEW.attempt_count <> 0
       OR NEW.next_attempt_at IS NULL
    THEN
      RAISE EXCEPTION 'new emergency alert notification deliveries must start pending';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.emergency_alert_id IS DISTINCT FROM NEW.emergency_alert_id
     OR OLD.emergency_action_id IS DISTINCT FROM NEW.emergency_action_id
     OR OLD.max_attempts IS DISTINCT FROM NEW.max_attempts
     OR OLD.created_at IS DISTINCT FROM NEW.created_at
  THEN
    RAISE EXCEPTION 'emergency alert notification delivery identity is immutable';
  END IF;

  IF OLD.status = 'delivered' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'delivered emergency alert notification evidence is immutable';
  END IF;
  IF OLD.status = 'terminal_failure' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'terminal emergency alert notification failures are immutable';
  END IF;
  IF OLD.status = 'suppressed' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'suppressed emergency alert notification deliveries are immutable';
  END IF;

  IF OLD.status <> NEW.status AND NOT (
    (OLD.status IN ('pending', 'failed') AND NEW.status IN ('leased', 'suppressed'))
    OR (OLD.status = 'leased' AND NEW.status IN (
      'delivered', 'failed', 'terminal_failure', 'suppressed'
    ))
  ) THEN
    RAISE EXCEPTION 'invalid emergency alert notification delivery transition';
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
      RAISE EXCEPTION 'invalid emergency alert notification delivery lease';
    END IF;
  ELSIF OLD.status = 'leased' AND NEW.status = 'leased' THEN
    IF OLD.lease_expires_at > v_now THEN
      RAISE EXCEPTION 'active emergency alert notification delivery lease cannot be replaced';
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
      RAISE EXCEPTION 'expired emergency alert notification delivery reclaim is invalid';
    END IF;
  ELSIF OLD.status = 'leased'
        AND NEW.status IN ('delivered', 'failed', 'terminal_failure')
  THEN
    IF NEW.outcome_lease_token IS DISTINCT FROM OLD.lease_token THEN
      RAISE EXCEPTION 'emergency alert notification outcome lease token is stale';
    END IF;
    IF OLD.lease_expires_at <= v_now
       AND NOT (
         NEW.status = 'terminal_failure'
         AND OLD.attempt_count = OLD.max_attempts
         AND NEW.last_error_code = 'delivery_lease_expired'
       )
    THEN
      RAISE EXCEPTION 'emergency alert notification delivery lease is expired';
    END IF;
  END IF;

  IF NEW.status = 'delivered' AND (
    NEW.notification_id IS NULL
    OR NEW.delivered_at IS NULL
    OR NEW.outcome_lease_token IS DISTINCT FROM OLD.lease_token
  ) THEN
    RAISE EXCEPTION 'delivered emergency alert notification evidence is incomplete';
  END IF;

  IF NEW.status = 'failed' AND (
    NEW.attempt_count >= NEW.max_attempts
    OR NEW.next_attempt_at IS NULL
    OR NEW.last_error_code IS NULL
    OR NEW.last_error_detail IS NULL
    OR NEW.last_error_at IS NULL
    OR NEW.last_error_lease_token IS DISTINCT FROM OLD.lease_token
  ) THEN
    RAISE EXCEPTION 'retryable emergency alert notification failure evidence is incomplete';
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
    RAISE EXCEPTION 'terminal emergency alert notification failure evidence is incomplete';
  END IF;

  IF NEW.status = 'suppressed' AND OLD.status <> 'suppressed' THEN
    SELECT action.status
      INTO v_action_status
      FROM triage_emergency_actions action
     WHERE action.id = NEW.emergency_action_id;
    IF v_action_status NOT IN ('handed_off', 'closed') THEN
      RAISE EXCEPTION 'emergency alert notification suppression requires verified resolution';
    END IF;
  END IF;

  NEW.updated_at := v_now;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS triage_emergency_alert_notification_delivery_guard
  ON triage_emergency_alert_notification_deliveries;
CREATE TRIGGER triage_emergency_alert_notification_delivery_guard
BEFORE INSERT OR UPDATE OR DELETE
ON triage_emergency_alert_notification_deliveries
FOR EACH ROW
EXECUTE FUNCTION enforce_emergency_alert_notification_delivery_lifecycle();

CREATE OR REPLACE FUNCTION enqueue_emergency_alert_notification_delivery()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'sent' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO triage_emergency_alert_notification_deliveries (
      emergency_alert_id,
      emergency_action_id,
      status,
      next_attempt_at
    ) VALUES (
      NEW.id,
      NEW.emergency_action_id,
      'pending',
      clock_timestamp()
    )
    ON CONFLICT (emergency_alert_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS triage_emergency_alert_enqueue_notification_delivery
  ON triage_emergency_action_alerts;
CREATE TRIGGER triage_emergency_alert_enqueue_notification_delivery
AFTER UPDATE OF status ON triage_emergency_action_alerts
FOR EACH ROW
EXECUTE FUNCTION enqueue_emergency_alert_notification_delivery();

-- Backfill publisher-confirmed alerts if the delivery ledger is introduced
-- after publisher activity. Queue replay remains safe because alert ID is the
-- delivery primary key and the UI notification transaction locks this row.
INSERT INTO triage_emergency_alert_notification_deliveries (
  emergency_alert_id,
  emergency_action_id,
  status,
  next_attempt_at
)
SELECT alert.id, alert.emergency_action_id, 'pending', clock_timestamp()
  FROM triage_emergency_action_alerts alert
 WHERE alert.status = 'sent'
ON CONFLICT (emergency_alert_id) DO NOTHING;

CREATE OR REPLACE FUNCTION suppress_resolved_emergency_alert_notification_deliveries()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('handed_off', 'closed')
     AND OLD.status IS DISTINCT FROM NEW.status
  THEN
    UPDATE triage_emergency_alert_notification_deliveries
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

DROP TRIGGER IF EXISTS triage_emergency_action_notification_delivery_suppression
  ON triage_emergency_actions;
CREATE TRIGGER triage_emergency_action_notification_delivery_suppression
AFTER UPDATE OF status ON triage_emergency_actions
FOR EACH ROW
EXECUTE FUNCTION suppress_resolved_emergency_alert_notification_deliveries();
