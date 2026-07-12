CREATE OR REPLACE FUNCTION assert_true(p_label text, p_condition boolean)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_condition IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ASSERTION FAILED: %', p_label;
  END IF;
  RAISE NOTICE 'PASS: %', p_label;
END;
$$;

CREATE OR REPLACE FUNCTION expect_error(
  p_label text,
  p_statement text,
  p_expected_fragment text
)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_got_error boolean := false;
  v_error text;
BEGIN
  BEGIN
    EXECUTE p_statement;
  EXCEPTION WHEN OTHERS THEN
    v_got_error := true;
    v_error := SQLERRM;
  END;
  IF NOT v_got_error THEN
    RAISE EXCEPTION 'ASSERTION FAILED: % did not raise', p_label;
  END IF;
  IF position(p_expected_fragment in v_error) = 0 THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: % raised unexpected error: %', p_label, v_error;
  END IF;
  RAISE NOTICE 'PASS: % [%]', p_label, v_error;
END;
$$;

INSERT INTO clinical_access_memberships (
  user_id, tenant_id, role, active, provisioned_by
) VALUES (
  'delivery-clinician', 'tenant-delivery', 'clinician', true, 'test-bootstrap'
);

INSERT INTO triage_sessions (
  id, tenant_id, care_pathway, data_quality, coverage_status,
  review_requirement, workflow_status, scheduling_locked,
  reviewed_by, reviewed_at
) VALUES (
  '54000000-0000-4000-8000-000000000001',
  'tenant-delivery', 'emergency_now', 'sufficient', 'complete',
  'emergency_action', 'emergency_hold', true,
  'delivery-clinician', now()
);

INSERT INTO triage_emergency_actions (
  id, triage_session_id, status, owner_team, due_at,
  next_escalation_at, idempotency_key
) VALUES (
  '54000000-0000-4000-8000-000000000101',
  '54000000-0000-4000-8000-000000000001',
  'open', 'clinical-triage', now(), now(), 'delivery-action-1'
);

UPDATE triage_emergency_action_alerts
   SET status = 'leased',
       attempt_count = 1,
       next_attempt_at = NULL,
       lease_token = '54000000-0000-4000-8000-000000000201',
       lease_owner = 'synthetic-publisher',
       claimed_at = clock_timestamp(),
       lease_expires_at = clock_timestamp() + interval '5 minutes'
 WHERE emergency_action_id = '54000000-0000-4000-8000-000000000101'
   AND sequence_number = 0;

UPDATE triage_emergency_action_alerts
   SET status = 'sent',
       outcome_lease_token = lease_token,
       lease_token = NULL,
       lease_owner = NULL,
       claimed_at = NULL,
       lease_expires_at = NULL,
       sent_at = clock_timestamp()
 WHERE emergency_action_id = '54000000-0000-4000-8000-000000000101'
   AND sequence_number = 0;

SELECT assert_true(
  'publisher-confirmed sent state creates one pending critical-UI delivery',
  (
    SELECT count(*) = 1
       AND min(delivery.status) = 'pending'
       AND min(delivery.attempt_count) = 0
      FROM triage_emergency_alert_notification_deliveries delivery
      JOIN triage_emergency_action_alerts alert
        ON alert.id = delivery.emergency_alert_id
     WHERE alert.emergency_action_id = '54000000-0000-4000-8000-000000000101'
  )
);

SELECT assert_true(
  'the delivery ledger contains no tenant patient or clinical-content columns',
  NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_name = 'triage_emergency_alert_notification_deliveries'
       AND column_name IN (
         'tenant_id', 'patient_id', 'source_text', 'payload', 'message_text',
         'instruction_given', 'owner_team'
       )
  )
);

UPDATE triage_emergency_actions
   SET owner_user_id = 'delivery-clinician',
       updated_at = now()
 WHERE id = '54000000-0000-4000-8000-000000000101';

SELECT assert_true(
  'ownership claim alone does not suppress critical-UI delivery',
  (
    SELECT delivery.status = 'pending'
      FROM triage_emergency_alert_notification_deliveries delivery
     WHERE delivery.emergency_action_id = '54000000-0000-4000-8000-000000000101'
  )
);

UPDATE triage_emergency_alert_notification_deliveries
   SET status = 'leased',
       attempt_count = attempt_count + 1,
       next_attempt_at = NULL,
       lease_token = '54000000-0000-4000-8000-000000000301',
       lease_owner = 'critical-ui-worker',
       claimed_at = clock_timestamp(),
       lease_expires_at = clock_timestamp() + interval '5 minutes'
 WHERE emergency_action_id = '54000000-0000-4000-8000-000000000101';

SELECT expect_error(
  'an active critical-UI delivery lease cannot be stolen',
  $stmt$
    UPDATE triage_emergency_alert_notification_deliveries
       SET lease_token = '54000000-0000-4000-8000-000000000399'
     WHERE emergency_action_id = '54000000-0000-4000-8000-000000000101'
  $stmt$,
  'active emergency alert notification delivery lease cannot be replaced'
);

WITH inserted AS (
  INSERT INTO notifications (
    tenant_id, recipient_user_id, source_type, source_id, patient_id,
    priority, title, body, metadata
  )
  SELECT session.tenant_id,
         action.owner_user_id,
         'triage_result',
         alert.id::text,
         NULL,
         'critical',
         'Emergency neurology triage action requires immediate response',
         'Open the emergency action and document verified handoff or closure.',
         jsonb_build_object(
           'critical_ui', true,
           'action_label', 'Open emergency action',
           'emergency_alert_id', alert.id,
           'emergency_action_id', action.id,
           'triage_session_id', action.triage_session_id,
           'owner_team', action.owner_team,
           'escalation_level', alert.escalation_level
         )
    FROM triage_emergency_alert_notification_deliveries delivery
    JOIN triage_emergency_action_alerts alert
      ON alert.id = delivery.emergency_alert_id
    JOIN triage_emergency_actions action
      ON action.id = delivery.emergency_action_id
     AND action.id = alert.emergency_action_id
    JOIN triage_sessions session
      ON session.id = action.triage_session_id
   WHERE delivery.emergency_action_id = '54000000-0000-4000-8000-000000000101'
     AND delivery.status = 'leased'
     AND delivery.lease_token = '54000000-0000-4000-8000-000000000301'
     AND delivery.lease_expires_at > clock_timestamp()
     AND alert.status = 'sent'
     AND action.status IN ('open', 'attempting_contact', 'failed')
  RETURNING id::text
)
UPDATE triage_emergency_alert_notification_deliveries delivery
   SET status = 'delivered',
       outcome_lease_token = delivery.lease_token,
       lease_token = NULL,
       lease_owner = NULL,
       claimed_at = NULL,
       lease_expires_at = NULL,
       notification_id = inserted.id,
       delivered_at = clock_timestamp(),
       updated_at = clock_timestamp()
  FROM inserted
 WHERE delivery.emergency_action_id = '54000000-0000-4000-8000-000000000101';

SELECT assert_true(
  'critical UI notification is linked exactly once by alert ID without resolving the action',
  (
    SELECT count(*) = 1
       AND min(notification.priority) = 'critical'
       AND min(delivery.status) = 'delivered'
       AND min(action.status) = 'open'
      FROM triage_emergency_alert_notification_deliveries delivery
      JOIN notifications notification
        ON notification.id::text = delivery.notification_id
      JOIN triage_emergency_actions action
        ON action.id = delivery.emergency_action_id
     WHERE notification.source_id = delivery.emergency_alert_id::text
       AND delivery.emergency_action_id = '54000000-0000-4000-8000-000000000101'
  )
);

SELECT expect_error(
  'delivered critical-UI evidence is immutable',
  $stmt$
    UPDATE triage_emergency_alert_notification_deliveries
       SET delivered_at = clock_timestamp() + interval '1 minute'
     WHERE emergency_action_id = '54000000-0000-4000-8000-000000000101'
  $stmt$,
  'delivered emergency alert notification evidence is immutable'
);

INSERT INTO triage_emergency_actions (
  id, triage_session_id, status, owner_team, due_at,
  next_escalation_at, idempotency_key
) VALUES (
  '54000000-0000-4000-8000-000000000102',
  '54000000-0000-4000-8000-000000000001',
  'open', 'clinical-triage', now(), now(), 'delivery-action-2'
);

UPDATE triage_emergency_action_alerts
   SET status = 'leased',
       attempt_count = 1,
       next_attempt_at = NULL,
       lease_token = '54000000-0000-4000-8000-000000000202',
       lease_owner = 'synthetic-publisher',
       claimed_at = clock_timestamp(),
       lease_expires_at = clock_timestamp() + interval '5 minutes'
 WHERE emergency_action_id = '54000000-0000-4000-8000-000000000102';

UPDATE triage_emergency_action_alerts
   SET status = 'sent',
       outcome_lease_token = lease_token,
       lease_token = NULL,
       lease_owner = NULL,
       claimed_at = NULL,
       lease_expires_at = NULL,
       sent_at = clock_timestamp()
 WHERE emergency_action_id = '54000000-0000-4000-8000-000000000102';

UPDATE triage_emergency_actions
   SET status = 'handed_off',
       contact_attempted_at = now(),
       contact_channel = 'emergency_services',
       instruction_given = 'Immediate emergency evaluation requested.',
       delivery_status = 'not_applicable',
       understanding_status = 'not_applicable',
       outcome = 'Emergency services handoff confirmed.',
       updated_at = now()
 WHERE id = '54000000-0000-4000-8000-000000000102';

SELECT assert_true(
  'verified handoff suppresses pending critical-UI delivery',
  (
    SELECT delivery.status = 'suppressed'
       AND delivery.suppressed_at IS NOT NULL
      FROM triage_emergency_alert_notification_deliveries delivery
     WHERE delivery.emergency_action_id = '54000000-0000-4000-8000-000000000102'
  )
);

INSERT INTO triage_emergency_actions (
  id, triage_session_id, status, owner_team, due_at,
  next_escalation_at, idempotency_key
) VALUES (
  '54000000-0000-4000-8000-000000000103',
  '54000000-0000-4000-8000-000000000001',
  'open', 'clinical-triage', now(), now(), 'delivery-action-3'
);

INSERT INTO triage_emergency_alert_notification_deliveries (
  emergency_alert_id, emergency_action_id, status, max_attempts, next_attempt_at
)
SELECT alert.id, alert.emergency_action_id, 'pending', 1, clock_timestamp()
  FROM triage_emergency_action_alerts alert
 WHERE alert.emergency_action_id = '54000000-0000-4000-8000-000000000103';

UPDATE triage_emergency_action_alerts
   SET status = 'leased',
       attempt_count = 1,
       next_attempt_at = NULL,
       lease_token = '54000000-0000-4000-8000-000000000203',
       lease_owner = 'synthetic-publisher',
       claimed_at = clock_timestamp(),
       lease_expires_at = clock_timestamp() + interval '5 minutes'
 WHERE emergency_action_id = '54000000-0000-4000-8000-000000000103';

UPDATE triage_emergency_action_alerts
   SET status = 'sent',
       outcome_lease_token = lease_token,
       lease_token = NULL,
       lease_owner = NULL,
       claimed_at = NULL,
       lease_expires_at = NULL,
       sent_at = clock_timestamp()
 WHERE emergency_action_id = '54000000-0000-4000-8000-000000000103';

UPDATE triage_emergency_alert_notification_deliveries
   SET status = 'leased',
       attempt_count = 1,
       next_attempt_at = NULL,
       lease_token = '54000000-0000-4000-8000-000000000303',
       lease_owner = 'critical-ui-worker',
       claimed_at = clock_timestamp(),
       lease_expires_at = clock_timestamp() + interval '5 minutes'
 WHERE emergency_action_id = '54000000-0000-4000-8000-000000000103';

UPDATE triage_emergency_alert_notification_deliveries
   SET status = 'terminal_failure',
       next_attempt_at = NULL,
       outcome_lease_token = lease_token,
       lease_token = NULL,
       lease_owner = NULL,
       claimed_at = NULL,
       lease_expires_at = NULL,
       terminal_failed_at = clock_timestamp(),
       last_error_code = 'critical_ui_unavailable',
       last_error_detail = 'Critical UI notification persistence was unavailable.',
       last_error_at = clock_timestamp(),
       last_error_lease_token = '54000000-0000-4000-8000-000000000303'
 WHERE emergency_action_id = '54000000-0000-4000-8000-000000000103';

SELECT assert_true(
  'terminal critical-UI failure remains visible and reminders remain active',
  (
    SELECT delivery.status = 'terminal_failure'
       AND action.status = 'open'
       AND action.next_escalation_at IS NOT NULL
      FROM triage_emergency_alert_notification_deliveries delivery
      JOIN triage_emergency_actions action
        ON action.id = delivery.emergency_action_id
     WHERE delivery.emergency_action_id = '54000000-0000-4000-8000-000000000103'
  )
);

SELECT expect_error(
  'terminal critical-UI failure evidence is immutable',
  $stmt$
    UPDATE triage_emergency_alert_notification_deliveries
       SET last_error_detail = 'rewritten'
     WHERE emergency_action_id = '54000000-0000-4000-8000-000000000103'
  $stmt$,
  'terminal emergency alert notification failures are immutable'
);

SELECT expect_error(
  'critical-UI delivery audit rows cannot be deleted',
  $stmt$
    DELETE FROM triage_emergency_alert_notification_deliveries
     WHERE emergency_action_id = '54000000-0000-4000-8000-000000000101'
  $stmt$,
  'emergency alert notification deliveries cannot be deleted'
);

SELECT 'PASS: migration 054 emergency alert critical-UI delivery behavior' AS result;
