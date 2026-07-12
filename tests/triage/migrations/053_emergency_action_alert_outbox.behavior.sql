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
  'alert-clinician', 'tenant-alert', 'clinician', true, 'test-bootstrap'
);

INSERT INTO triage_sessions (
  id, tenant_id, care_pathway, data_quality, coverage_status,
  review_requirement, workflow_status, scheduling_locked,
  reviewed_by, reviewed_at
) VALUES (
  '53000000-0000-4000-8000-000000000001',
  'tenant-alert', 'emergency_now', 'sufficient', 'complete',
  'emergency_action', 'emergency_hold', true,
  'alert-clinician', now()
);

INSERT INTO triage_emergency_actions (
  id, triage_session_id, status, owner_team, due_at,
  next_escalation_at, idempotency_key
) VALUES (
  '53000000-0000-4000-8000-000000000101',
  '53000000-0000-4000-8000-000000000001',
  'open', 'clinical-triage', now(), now(), 'alert-action-1'
);

SELECT assert_true(
  'a new emergency action transaction creates exactly one initial alert',
  (
    SELECT count(*) = 1
       AND min(sequence_number) = 0
       AND min(alert_kind) = 'initial'
       AND min(severity) = 'emergency'
       AND min(escalation_level) = 0
       AND min(status) = 'pending'
      FROM triage_emergency_action_alerts
     WHERE emergency_action_id = '53000000-0000-4000-8000-000000000101'
  )
);

SELECT assert_true(
  'the outbox schema contains no tenant patient or clinical-content columns',
  NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_name = 'triage_emergency_action_alerts'
       AND column_name IN (
         'tenant_id', 'patient_id', 'source_text', 'payload', 'message_text',
         'instruction_given', 'contact_channel'
       )
  )
);

UPDATE triage_emergency_actions
   SET owner_user_id = 'alert-clinician',
       updated_at = now()
 WHERE id = '53000000-0000-4000-8000-000000000101';

SELECT assert_true(
  'clinician ownership alone does not suppress the pending alert',
  (
    SELECT status = 'pending'
      FROM triage_emergency_action_alerts
     WHERE emergency_action_id = '53000000-0000-4000-8000-000000000101'
       AND sequence_number = 0
  )
);

SELECT expect_error(
  'the initial alert identity is deduplicated per action and sequence',
  $stmt$
    INSERT INTO triage_emergency_action_alerts (
      emergency_action_id, sequence_number, alert_kind, severity,
      escalation_level, status, next_attempt_at
    ) VALUES (
      '53000000-0000-4000-8000-000000000101', 0, 'initial',
      'emergency', 0, 'pending', now()
    )
  $stmt$,
  'duplicate key value'
);

UPDATE triage_emergency_action_alerts
   SET status = 'leased',
       attempt_count = attempt_count + 1,
       next_attempt_at = NULL,
       lease_token = '53000000-0000-4000-8000-000000000201',
       lease_owner = 'synthetic-publisher',
       claimed_at = clock_timestamp(),
       lease_expires_at = clock_timestamp() + interval '5 minutes'
 WHERE emergency_action_id = '53000000-0000-4000-8000-000000000101'
   AND sequence_number = 0;

SELECT expect_error(
  'an active publisher lease cannot be stolen',
  $stmt$
    UPDATE triage_emergency_action_alerts
       SET lease_token = '53000000-0000-4000-8000-000000000299'
     WHERE emergency_action_id = '53000000-0000-4000-8000-000000000101'
       AND sequence_number = 0
  $stmt$,
  'active emergency alert lease cannot be replaced'
);

UPDATE triage_emergency_action_alerts
   SET status = 'sent',
       outcome_lease_token = lease_token,
       lease_token = NULL,
       lease_owner = NULL,
       claimed_at = NULL,
       lease_expires_at = NULL,
       sent_at = clock_timestamp()
 WHERE emergency_action_id = '53000000-0000-4000-8000-000000000101'
   AND sequence_number = 0;

SELECT expect_error(
  'sent alerts are immutable',
  $stmt$
    UPDATE triage_emergency_action_alerts
       SET sent_at = clock_timestamp() + interval '1 minute'
     WHERE emergency_action_id = '53000000-0000-4000-8000-000000000101'
       AND sequence_number = 0
  $stmt$,
  'sent emergency alerts are immutable'
);

INSERT INTO triage_emergency_action_alerts (
  emergency_action_id, sequence_number, alert_kind, severity,
  escalation_level, status, max_attempts, next_attempt_at
) VALUES (
  '53000000-0000-4000-8000-000000000101', 1, 'reminder',
  'emergency', 1, 'pending', 1, now()
);

UPDATE triage_emergency_action_alerts
   SET status = 'leased',
       attempt_count = 1,
       next_attempt_at = NULL,
       lease_token = '53000000-0000-4000-8000-000000000202',
       lease_owner = 'synthetic-publisher',
       claimed_at = clock_timestamp(),
       lease_expires_at = clock_timestamp() + interval '5 minutes'
 WHERE emergency_action_id = '53000000-0000-4000-8000-000000000101'
   AND sequence_number = 1;

UPDATE triage_emergency_action_alerts
   SET status = 'terminal_failure',
       outcome_lease_token = lease_token,
       lease_token = NULL,
       lease_owner = NULL,
       claimed_at = NULL,
       lease_expires_at = NULL,
       terminal_failed_at = clock_timestamp(),
       last_error_code = 'publisher_unavailable',
       last_error_detail = 'The alert publisher was unavailable.',
       last_error_at = clock_timestamp(),
       last_error_lease_token = '53000000-0000-4000-8000-000000000202'
 WHERE emergency_action_id = '53000000-0000-4000-8000-000000000101'
   AND sequence_number = 1;

SELECT assert_true(
  'terminal publisher failure remains visible and does not resolve the action',
  (
    SELECT alert.status = 'terminal_failure' AND action.status = 'open'
      FROM triage_emergency_action_alerts alert
      JOIN triage_emergency_actions action
        ON action.id = alert.emergency_action_id
     WHERE alert.emergency_action_id = '53000000-0000-4000-8000-000000000101'
       AND alert.sequence_number = 1
  )
);

SELECT expect_error(
  'terminal publisher failure evidence is immutable',
  $stmt$
    UPDATE triage_emergency_action_alerts
       SET last_error_detail = 'rewritten'
     WHERE emergency_action_id = '53000000-0000-4000-8000-000000000101'
       AND sequence_number = 1
  $stmt$,
  'terminal emergency alert failures are immutable'
);

INSERT INTO triage_emergency_actions (
  id, triage_session_id, status, owner_team, due_at,
  next_escalation_at, idempotency_key
) VALUES (
  '53000000-0000-4000-8000-000000000102',
  '53000000-0000-4000-8000-000000000001',
  'open', 'clinical-triage', now(), now(), 'alert-action-2'
);

UPDATE triage_emergency_actions
   SET status = 'handed_off',
       contact_attempted_at = now(),
       contact_channel = 'emergency_services',
       instruction_given = 'Immediate emergency evaluation requested.',
       delivery_status = 'not_applicable',
       understanding_status = 'not_applicable',
       outcome = 'Emergency services handoff confirmed.',
       updated_at = now()
 WHERE id = '53000000-0000-4000-8000-000000000102';

SELECT assert_true(
  'verified handoff suppresses an unsent alert',
  (
    SELECT status = 'suppressed' AND suppressed_at IS NOT NULL
      FROM triage_emergency_action_alerts
     WHERE emergency_action_id = '53000000-0000-4000-8000-000000000102'
       AND sequence_number = 0
  )
);

SELECT expect_error(
  'handoff without complete evidence cannot silence alerts',
  $stmt$
    INSERT INTO triage_emergency_actions (
      id, triage_session_id, status, owner_team, due_at,
      next_escalation_at, idempotency_key
    ) VALUES (
      '53000000-0000-4000-8000-000000000103',
      '53000000-0000-4000-8000-000000000001',
      'open', 'clinical-triage', now(), now(), 'alert-action-3'
    );
    UPDATE triage_emergency_actions
       SET status = 'handed_off'
     WHERE id = '53000000-0000-4000-8000-000000000103'
  $stmt$,
  'triage_emergency_actions_handoff_evidence_check'
);

SELECT expect_error(
  'alert audit rows cannot be deleted',
  $stmt$
    DELETE FROM triage_emergency_action_alerts
     WHERE emergency_action_id = '53000000-0000-4000-8000-000000000101'
       AND sequence_number = 0
  $stmt$,
  'emergency action alerts cannot be deleted'
);

INSERT INTO triage_emergency_actions (
  id, triage_session_id, status, owner_team, due_at,
  next_escalation_at, idempotency_key
) VALUES (
  '53000000-0000-4000-8000-000000000104',
  '53000000-0000-4000-8000-000000000001',
  'open', 'clinical-triage', now(), now(), 'alert-action-4'
);

UPDATE triage_emergency_action_alerts
   SET status = 'leased',
       attempt_count = 1,
       next_attempt_at = NULL,
       lease_token = '53000000-0000-4000-8000-000000000204',
       lease_owner = 'expired-publisher',
       claimed_at = clock_timestamp() - interval '2 minutes',
       lease_expires_at = clock_timestamp() - interval '1 minute'
 WHERE emergency_action_id = '53000000-0000-4000-8000-000000000104'
   AND sequence_number = 0;

SELECT expect_error(
  'an expired alert lease cannot be reclaimed without a new bounded attempt',
  $stmt$
    UPDATE triage_emergency_action_alerts
       SET lease_token = '53000000-0000-4000-8000-000000000205',
           lease_owner = 'new-publisher',
           claimed_at = clock_timestamp(),
           lease_expires_at = clock_timestamp() + interval '5 minutes'
     WHERE emergency_action_id = '53000000-0000-4000-8000-000000000104'
       AND sequence_number = 0
  $stmt$,
  'expired emergency alert lease reclaim is invalid'
);

SELECT 'PASS: migration 053 emergency-action alert outbox behavior' AS result;
