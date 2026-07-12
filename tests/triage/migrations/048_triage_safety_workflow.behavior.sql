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
  'authorized-closer', 'tenant-action', 'clinician', true, 'test-bootstrap'
);

INSERT INTO triage_sessions (
  id, tenant_id, care_pathway, data_quality, coverage_status,
  review_requirement, workflow_status, scheduling_locked,
  reviewed_by, reviewed_at
) VALUES (
  '10000000-0000-0000-0000-000000000001',
  'tenant-action', 'emergency_now', 'sufficient', 'complete',
  'emergency_action', 'emergency_hold', true,
  'authorized-closer', now()
);

INSERT INTO triage_emergency_actions (
  id, triage_session_id, status, owner_team, due_at,
  next_escalation_at, idempotency_key
) VALUES (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'open', 'clinical-triage', now(), now(), 'unauthorized-closure-test'
);

SELECT expect_error(
  'emergency action closure requires an active clinician or admin reviewer',
  $stmt$
    UPDATE triage_emergency_actions
       SET status = 'closed',
           contact_attempted_at = now(),
           contact_channel = 'phone',
           instruction_given = 'Immediate emergency evaluation advised',
           delivery_status = 'delivered',
           understanding_status = 'confirmed',
           outcome = 'Emergency handoff confirmed',
           closure_code = 'handoff_complete',
           closed_at = now(),
           reviewed_by = 'not-a-member',
           reviewed_at = now()
     WHERE id = '20000000-0000-0000-0000-000000000001'
  $stmt$,
  'emergency action closure reviewer is not authorized'
);

SELECT expect_error(
  'new emergency actions cannot bypass the open state',
  $stmt$
    INSERT INTO triage_emergency_actions (
      id, triage_session_id, status, owner_team, due_at,
      next_escalation_at, contact_attempted_at, contact_channel,
      instruction_given, delivery_status, understanding_status,
      outcome, closure_code, closed_at, reviewed_by, reviewed_at,
      idempotency_key
    ) VALUES (
      '20000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000001',
      'closed', 'clinical-triage', now(), now(), now(), 'phone',
      'Immediate emergency evaluation advised', 'delivered', 'confirmed',
      'Emergency handoff confirmed', 'handoff_complete', now(),
      'authorized-closer', now(), 'direct-closed-action-test'
    )
  $stmt$,
  'new emergency actions must start open'
);

UPDATE triage_emergency_actions
   SET status = 'closed',
       contact_attempted_at = now(),
       contact_channel = 'phone',
       instruction_given = 'Immediate emergency evaluation advised',
       delivery_status = 'delivered',
       understanding_status = 'confirmed',
       outcome = 'Emergency handoff confirmed',
       closure_code = 'handoff_complete',
       closed_at = now(),
       reviewed_by = 'authorized-closer',
       reviewed_at = now()
 WHERE id = '20000000-0000-0000-0000-000000000001';

SELECT assert_true(
  'an active clinician can close an action with complete evidence',
  (
    SELECT status = 'closed'
      FROM triage_emergency_actions
     WHERE id = '20000000-0000-0000-0000-000000000001'
  )
);

SELECT expect_error(
  'closed emergency action evidence is immutable',
  $stmt$
    UPDATE triage_emergency_actions
       SET outcome = 'Rewritten after closure'
     WHERE id = '20000000-0000-0000-0000-000000000001'
  $stmt$,
  'closed emergency actions are immutable'
);

SELECT expect_error(
  'new triage workflows cannot bypass directly to closed',
  $stmt$
    INSERT INTO triage_sessions (
      id, tenant_id, care_pathway, data_quality, coverage_status,
      review_requirement, workflow_status, scheduling_locked,
      reviewed_by, reviewed_at, closure_code, closed_at
    ) VALUES (
      '10000000-0000-0000-0000-000000000002',
      'tenant-action', 'routine_outpatient', 'sufficient', 'complete',
      'none', 'closed', true,
      'authorized-closer', now(), 'completed', now()
    )
  $stmt$,
  'new triage workflows cannot start closed'
);

UPDATE triage_sessions
   SET workflow_status = 'closed',
       closure_code = 'emergency_handoff_complete',
       closed_at = now(),
       reviewed_by = 'authorized-closer',
       reviewed_at = now()
 WHERE id = '10000000-0000-0000-0000-000000000001';

SELECT assert_true(
  'workflow closes after its emergency action is validly closed',
  (
    SELECT workflow_status = 'closed'
      FROM triage_sessions
     WHERE id = '10000000-0000-0000-0000-000000000001'
  )
);

SELECT expect_error(
  'closed triage workflow evidence is immutable',
  $stmt$
    UPDATE triage_sessions
       SET closure_code = 'rewritten-after-closure'
     WHERE id = '10000000-0000-0000-0000-000000000001'
  $stmt$,
  'closed triage workflows are immutable'
);

INSERT INTO clinical_access_memberships (
  user_id, tenant_id, role, active, provisioned_by
) VALUES (
  'tenant-reviewer', 'tenant-original', 'clinician', true, 'test-bootstrap'
);

INSERT INTO triage_sessions (
  id, tenant_id, care_pathway, data_quality, coverage_status,
  review_requirement, workflow_status, scheduling_locked,
  reviewed_by, reviewed_at, final_care_pathway, final_triage_tier
) VALUES (
  '10000000-0000-0000-0000-000000000003',
  'tenant-original', 'routine_outpatient', 'sufficient', 'complete',
  'none', 'decision_ready', false,
  'tenant-reviewer', now(), 'routine_outpatient', 'routine'
);

INSERT INTO appointments (id, status, triage_session_id)
VALUES (
  '30000000-0000-0000-0000-000000000001',
  'scheduled',
  '10000000-0000-0000-0000-000000000003'
);

UPDATE triage_sessions
   SET tenant_id = 'tenant-without-reviewer-membership'
 WHERE id = '10000000-0000-0000-0000-000000000003';

SELECT assert_true(
  'appointment cancels when triage tenant identity invalidates reviewer authority',
  (
    SELECT status = 'cancelled'
      FROM appointments
     WHERE id = '30000000-0000-0000-0000-000000000001'
  )
);

INSERT INTO clinical_access_memberships (
  user_id, tenant_id, role, active, provisioned_by
) VALUES (
  'identity-reviewer', 'tenant-identity', 'admin', true, 'test-bootstrap'
);

INSERT INTO triage_sessions (
  id, tenant_id, care_pathway, data_quality, coverage_status,
  review_requirement, workflow_status, scheduling_locked,
  reviewed_by, reviewed_at, final_care_pathway, final_triage_tier
) VALUES (
  '10000000-0000-0000-0000-000000000004',
  'tenant-identity', 'routine_outpatient', 'sufficient', 'complete',
  'none', 'decision_ready', false,
  'identity-reviewer', now(), 'routine_outpatient', 'routine'
);

INSERT INTO appointments (id, status, triage_session_id)
VALUES (
  '30000000-0000-0000-0000-000000000002',
  'scheduled',
  '10000000-0000-0000-0000-000000000004'
);

UPDATE clinical_access_memberships
   SET user_id = 'moved-identity-reviewer'
 WHERE user_id = 'identity-reviewer'
   AND tenant_id = 'tenant-identity';

SELECT assert_true(
  'appointment cancels when membership identity moves away from reviewer',
  (
    SELECT status = 'cancelled'
      FROM appointments
     WHERE id = '30000000-0000-0000-0000-000000000002'
  )
);

INSERT INTO clinical_access_memberships (
  user_id, tenant_id, role, active, provisioned_by
) VALUES (
  'open-action-reviewer', 'tenant-open-action', 'clinician', true,
  'test-bootstrap'
);

INSERT INTO triage_sessions (
  id, tenant_id, care_pathway, data_quality, coverage_status,
  review_requirement, workflow_status, scheduling_locked,
  reviewed_by, reviewed_at, final_care_pathway, final_triage_tier
) VALUES (
  '10000000-0000-0000-0000-000000000005',
  'tenant-open-action', 'expedited_outpatient', 'sufficient', 'complete',
  'none', 'decision_ready', false,
  'open-action-reviewer', now(), 'expedited_outpatient', 'urgent'
);

INSERT INTO triage_emergency_actions (
  id, triage_session_id, status, owner_team, due_at,
  next_escalation_at, idempotency_key
) VALUES (
  '20000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000005',
  'open', 'clinical-triage', now(), now(), 'scheduling-open-action-test'
);

SELECT expect_error(
  'open emergency action blocks appointment activation',
  $stmt$
    INSERT INTO appointments (id, status, triage_session_id)
    VALUES (
      '30000000-0000-0000-0000-000000000003',
      'scheduled',
      '10000000-0000-0000-0000-000000000005'
    )
  $stmt$,
  'triage session is not authorized for outpatient scheduling'
);

INSERT INTO clinical_access_memberships (
  user_id, tenant_id, role, active, provisioned_by
) VALUES (
  'action-cancel-reviewer', 'tenant-action-cancel', 'clinician', true,
  'test-bootstrap'
);

INSERT INTO triage_sessions (
  id, tenant_id, care_pathway, data_quality, coverage_status,
  review_requirement, workflow_status, scheduling_locked,
  reviewed_by, reviewed_at, final_care_pathway, final_triage_tier
) VALUES (
  '10000000-0000-0000-0000-000000000006',
  'tenant-action-cancel', 'routine_outpatient', 'sufficient', 'complete',
  'none', 'decision_ready', false,
  'action-cancel-reviewer', now(), 'routine_outpatient', 'routine'
);

INSERT INTO appointments (id, status, triage_session_id)
VALUES (
  '30000000-0000-0000-0000-000000000004',
  'scheduled',
  '10000000-0000-0000-0000-000000000006'
);

INSERT INTO triage_emergency_actions (
  id, triage_session_id, status, owner_team, due_at,
  next_escalation_at, idempotency_key
) VALUES (
  '20000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000006',
  'open', 'clinical-triage', now(), now(), 'action-cancels-appointment-test'
);

SELECT assert_true(
  'opening an emergency action cancels an existing appointment',
  (
    SELECT status = 'cancelled'
      FROM appointments
     WHERE id = '30000000-0000-0000-0000-000000000004'
  )
);

SELECT expect_error(
  'emergency actions cannot be deleted to remove a safety blocker',
  $stmt$
    DELETE FROM triage_emergency_actions
     WHERE id = '20000000-0000-0000-0000-000000000003'
  $stmt$,
  'emergency actions cannot be deleted'
);

INSERT INTO triage_clarification_questions (
  id, triage_session_id, question_code, question_text, rationale,
  target, criticality
) VALUES (
  '40000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000005',
  'critical-onset', 'When did the new deficit begin?',
  'Time-critical onset remains unresolved', 'provider', 'critical'
);

SELECT expect_error(
  'clarification questions cannot be deleted to remove a safety blocker',
  $stmt$
    DELETE FROM triage_clarification_questions
     WHERE id = '40000000-0000-0000-0000-000000000001'
  $stmt$,
  'clarification questions cannot be deleted'
);

INSERT INTO triage_sessions (
  id, tenant_id, care_pathway, data_quality, coverage_status,
  review_requirement, workflow_status, scheduling_locked
) VALUES (
  '10000000-0000-0000-0000-000000000007',
  'tenant-action', 'routine_outpatient', 'sufficient', 'complete',
  'none', 'clinician_review', true
);

UPDATE triage_sessions
   SET workflow_status = 'closed',
       closure_code = 'no_referral_needed',
       closed_at = now(),
       reviewed_by = 'authorized-closer',
       reviewed_at = now()
 WHERE id = '10000000-0000-0000-0000-000000000007';

SELECT expect_error(
  'closed triage workflows cannot be deleted',
  $stmt$
    DELETE FROM triage_sessions
     WHERE id = '10000000-0000-0000-0000-000000000007'
  $stmt$,
  'finalized triage workflows cannot be deleted'
);

SELECT expect_error(
  'emergency actions cannot be opened against a closed workflow',
  $stmt$
    INSERT INTO triage_emergency_actions (
      id, triage_session_id, status, owner_team, due_at,
      next_escalation_at, idempotency_key
    ) VALUES (
      '20000000-0000-0000-0000-000000000005',
      '10000000-0000-0000-0000-000000000001',
      'open', 'clinical-triage', now(), now(),
      'closed-workflow-action-test'
    )
  $stmt$,
  'emergency actions cannot be opened for closed triage workflows'
);

SELECT expect_error(
  'clarification questions cannot be opened against a closed workflow',
  $stmt$
    INSERT INTO triage_clarification_questions (
      id, triage_session_id, question_code, question_text, rationale,
      target, criticality
    ) VALUES (
      '40000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000001',
      'closed-workflow-question', 'Was onset sudden?',
      'Attempted late clarification', 'provider', 'critical'
    )
  $stmt$,
  'clarification questions cannot change after workflow closure'
);

SELECT expect_error(
  'emergency actions cannot be moved to a different workflow',
  $stmt$
    UPDATE triage_emergency_actions
       SET triage_session_id = '10000000-0000-0000-0000-000000000006'
     WHERE id = '20000000-0000-0000-0000-000000000003'
  $stmt$,
  'emergency action workflow linkage is immutable'
);

-- The exact final-tier/care-path mapping is exhaustive, not compensatory.
INSERT INTO clinical_access_memberships (
  user_id, tenant_id, role, active, provisioned_by
) VALUES (
  'mapping-reviewer', 'tenant-mapping', 'clinician', true, 'test-bootstrap'
);

CREATE TEMP TABLE tier_mapping_cases (
  label text NOT NULL,
  care_pathway text NOT NULL,
  final_tier text NOT NULL,
  should_schedule boolean NOT NULL
);

INSERT INTO tier_mapping_cases VALUES
  ('urgent is expedited', 'expedited_outpatient', 'urgent', true),
  ('semi-urgent is expedited', 'expedited_outpatient', 'semi_urgent', true),
  ('routine-priority is routine', 'routine_outpatient', 'routine_priority', true),
  ('routine is routine', 'routine_outpatient', 'routine', true),
  ('non-urgent is routine', 'routine_outpatient', 'non_urgent', true),
  ('routine cannot be expedited', 'expedited_outpatient', 'routine', false),
  ('urgent cannot be routine', 'routine_outpatient', 'urgent', false),
  ('emergent cannot schedule outpatient', 'expedited_outpatient', 'emergent', false),
  ('insufficient data cannot schedule outpatient', 'routine_outpatient', 'insufficient_data', false),
  ('unknown tiers fail closed', 'routine_outpatient', 'unknown_tier', false);

DO $$
DECLARE
  case_row record;
  session_id uuid;
  appointment_id uuid;
  activation_succeeded boolean;
BEGIN
  FOR case_row IN SELECT * FROM tier_mapping_cases LOOP
    session_id := gen_random_uuid();
    appointment_id := gen_random_uuid();

    INSERT INTO triage_sessions (
      id, tenant_id, care_pathway, data_quality, coverage_status,
      review_requirement, workflow_status, scheduling_locked,
      reviewed_by, reviewed_at, final_care_pathway, final_triage_tier
    ) VALUES (
      session_id, 'tenant-mapping', case_row.care_pathway,
      'sufficient', 'complete', 'none', 'decision_ready', false,
      'mapping-reviewer', now(), case_row.care_pathway, case_row.final_tier
    );

    activation_succeeded := true;
    BEGIN
      INSERT INTO appointments (id, status, triage_session_id)
      VALUES (appointment_id, 'scheduled', session_id);
    EXCEPTION WHEN OTHERS THEN
      IF position(
        'triage session is not authorized for outpatient scheduling' in SQLERRM
      ) = 0 THEN
        RAISE;
      END IF;
      activation_succeeded := false;
    END;

    IF activation_succeeded IS DISTINCT FROM case_row.should_schedule THEN
      RAISE EXCEPTION 'ASSERTION FAILED: tier mapping case %', case_row.label;
    END IF;

    RAISE NOTICE 'PASS: tier mapping case %', case_row.label;
  END LOOP;
END;
$$;

INSERT INTO triage_sessions (
  id, tenant_id, care_pathway, data_quality, coverage_status,
  review_requirement, workflow_status, scheduling_locked,
  reviewed_by, reviewed_at, final_care_pathway, final_triage_tier
) VALUES (
  '10000000-0000-0000-0000-000000000008',
  'tenant-mapping', 'routine_outpatient', 'sufficient', 'complete',
  'none', 'decision_ready', false,
  'mapping-reviewer', now(), 'expedited_outpatient', 'routine'
);
SELECT expect_error(
  'current and final care pathways must match exactly',
  $stmt$
    INSERT INTO appointments (id, status, triage_session_id)
    VALUES (
      '30000000-0000-0000-0000-000000000005',
      'scheduled',
      '10000000-0000-0000-0000-000000000008'
    )
  $stmt$,
  'triage session is not authorized for outpatient scheduling'
);

-- Every independent safety axis fails closed even when all others are ready.
CREATE TEMP TABLE unsafe_axis_cases (
  label text NOT NULL,
  data_quality text NOT NULL,
  coverage_status text NOT NULL,
  review_requirement text NOT NULL,
  workflow_status text NOT NULL,
  scheduling_locked boolean NOT NULL,
  reviewer_id text,
  has_reviewed_at boolean NOT NULL,
  final_care_pathway text,
  final_tier text
);

INSERT INTO unsafe_axis_cases VALUES
  ('data quality', 'partial', 'complete', 'none', 'decision_ready', false, 'mapping-reviewer', true, 'routine_outpatient', 'routine'),
  ('coverage', 'sufficient', 'partial', 'none', 'decision_ready', false, 'mapping-reviewer', true, 'routine_outpatient', 'routine'),
  ('review requirement', 'sufficient', 'complete', 'clinician_confirmation', 'decision_ready', false, 'mapping-reviewer', true, 'routine_outpatient', 'routine'),
  ('workflow readiness', 'sufficient', 'complete', 'none', 'clinician_review', false, 'mapping-reviewer', true, 'routine_outpatient', 'routine'),
  ('scheduling lock', 'sufficient', 'complete', 'none', 'decision_ready', true, 'mapping-reviewer', true, 'routine_outpatient', 'routine'),
  ('reviewer identity', 'sufficient', 'complete', 'none', 'decision_ready', false, NULL, true, 'routine_outpatient', 'routine'),
  ('review timestamp', 'sufficient', 'complete', 'none', 'decision_ready', false, 'mapping-reviewer', false, 'routine_outpatient', 'routine'),
  ('final pathway', 'sufficient', 'complete', 'none', 'decision_ready', false, 'mapping-reviewer', true, NULL, 'routine'),
  ('final tier', 'sufficient', 'complete', 'none', 'decision_ready', false, 'mapping-reviewer', true, 'routine_outpatient', NULL);

DO $$
DECLARE
  case_row record;
  session_id uuid;
BEGIN
  FOR case_row IN SELECT * FROM unsafe_axis_cases LOOP
    session_id := gen_random_uuid();

    INSERT INTO triage_sessions (
      id, tenant_id, care_pathway, data_quality, coverage_status,
      review_requirement, workflow_status, scheduling_locked,
      reviewed_by, reviewed_at, final_care_pathway, final_triage_tier
    ) VALUES (
      session_id, 'tenant-mapping', 'routine_outpatient',
      case_row.data_quality, case_row.coverage_status,
      case_row.review_requirement, case_row.workflow_status,
      case_row.scheduling_locked, case_row.reviewer_id,
      CASE WHEN case_row.has_reviewed_at THEN now() ELSE NULL END,
      case_row.final_care_pathway, case_row.final_tier
    );

    BEGIN
      INSERT INTO appointments (id, status, triage_session_id)
      VALUES (gen_random_uuid(), 'scheduled', session_id);
      RAISE EXCEPTION 'ASSERTION FAILED: unsafe axis % scheduled', case_row.label;
    EXCEPTION WHEN OTHERS THEN
      IF position(
        'triage session is not authorized for outpatient scheduling' in SQLERRM
      ) = 0 THEN
        RAISE;
      END IF;
    END;

    RAISE NOTICE 'PASS: unsafe scheduling axis %', case_row.label;
  END LOOP;
END;
$$;

-- An open action prevents direct closure and cannot be bypassed through a
-- second legal workflow hop.
INSERT INTO triage_sessions (
  id, tenant_id, care_pathway, data_quality, coverage_status,
  review_requirement, workflow_status, scheduling_locked
) VALUES (
  '10000000-0000-0000-0000-000000000009',
  'tenant-action', 'emergency_now', 'sufficient', 'complete',
  'emergency_action', 'emergency_hold', true
);
INSERT INTO triage_emergency_actions (
  id, triage_session_id, status, owner_team, due_at,
  next_escalation_at, idempotency_key
) VALUES (
  '20000000-0000-0000-0000-000000000006',
  '10000000-0000-0000-0000-000000000009',
  'open', 'clinical-triage', now(), now(), 'two-hop-closure-test'
);
SELECT expect_error(
  'direct workflow closure cannot bypass an open action',
  $stmt$
    UPDATE triage_sessions
       SET workflow_status = 'closed', closure_code = 'resolved',
           closed_at = now(), reviewed_by = 'authorized-closer',
           reviewed_at = now()
     WHERE id = '10000000-0000-0000-0000-000000000009'
  $stmt$,
  'emergency actions must be closed before triage closure'
);
UPDATE triage_sessions
   SET workflow_status = 'clinician_review'
 WHERE id = '10000000-0000-0000-0000-000000000009';
SELECT expect_error(
  'two-hop workflow closure cannot bypass an open action',
  $stmt$
    UPDATE triage_sessions
       SET workflow_status = 'closed', closure_code = 'resolved',
           closed_at = now(), reviewed_by = 'authorized-closer',
           reviewed_at = now()
     WHERE id = '10000000-0000-0000-0000-000000000009'
  $stmt$,
  'emergency actions must be closed before triage closure'
);

-- Safety revocation cancels active appointments but preserves completed care.
INSERT INTO triage_sessions (
  id, tenant_id, care_pathway, data_quality, coverage_status,
  review_requirement, workflow_status, scheduling_locked,
  reviewed_by, reviewed_at, final_care_pathway, final_triage_tier
) VALUES (
  '10000000-0000-0000-0000-000000000010',
  'tenant-mapping', 'routine_outpatient', 'sufficient', 'complete',
  'none', 'decision_ready', false,
  'mapping-reviewer', now(), 'routine_outpatient', 'routine'
);
INSERT INTO appointments (id, status, triage_session_id)
VALUES
  ('30000000-0000-0000-0000-000000000006', 'scheduled', '10000000-0000-0000-0000-000000000010'),
  ('30000000-0000-0000-0000-000000000007', 'completed', '10000000-0000-0000-0000-000000000010');
UPDATE triage_sessions
   SET data_quality = 'insufficient'
 WHERE id = '10000000-0000-0000-0000-000000000010';
SELECT assert_true(
  'unsafe triage change cancels an active appointment',
  (
    SELECT status = 'cancelled'
      FROM appointments
     WHERE id = '30000000-0000-0000-0000-000000000006'
  )
);
SELECT assert_true(
  'unsafe triage change preserves a completed appointment',
  (
    SELECT status = 'completed'
      FROM appointments
     WHERE id = '30000000-0000-0000-0000-000000000007'
  )
);

-- Membership active-state revocation is also fail-closed.
INSERT INTO clinical_access_memberships (
  user_id, tenant_id, role, active, provisioned_by
) VALUES (
  'revoked-reviewer', 'tenant-revoked', 'clinician', true, 'test-bootstrap'
);
INSERT INTO triage_sessions (
  id, tenant_id, care_pathway, data_quality, coverage_status,
  review_requirement, workflow_status, scheduling_locked,
  reviewed_by, reviewed_at, final_care_pathway, final_triage_tier
) VALUES (
  '10000000-0000-0000-0000-000000000011',
  'tenant-revoked', 'routine_outpatient', 'sufficient', 'complete',
  'none', 'decision_ready', false,
  'revoked-reviewer', now(), 'routine_outpatient', 'routine'
);
INSERT INTO appointments (id, status, triage_session_id)
VALUES (
  '30000000-0000-0000-0000-000000000008',
  'scheduled', '10000000-0000-0000-0000-000000000011'
);
UPDATE clinical_access_memberships
   SET active = false, revoked_by = 'security-admin', revoked_at = now()
 WHERE user_id = 'revoked-reviewer' AND tenant_id = 'tenant-revoked';
SELECT assert_true(
  'appointment cancels when reviewer membership becomes inactive',
  (
    SELECT status = 'cancelled'
      FROM appointments
     WHERE id = '30000000-0000-0000-0000-000000000008'
  )
);

-- Cancellation itself must remain possible regardless of triage safety state.
INSERT INTO appointments (id, status, triage_session_id)
VALUES (
  '30000000-0000-0000-0000-000000000009',
  'cancelled', '10000000-0000-0000-0000-000000000005'
);
SELECT assert_true(
  'cancellation remains possible while an emergency action is open',
  (
    SELECT status = 'cancelled'
      FROM appointments
     WHERE id = '30000000-0000-0000-0000-000000000009'
  )
);

-- Unreviewed pending rows remain deletable for failed-ingestion cleanup.
INSERT INTO triage_sessions (id)
VALUES ('10000000-0000-0000-0000-000000000012');
DELETE FROM triage_sessions
 WHERE id = '10000000-0000-0000-0000-000000000012';
SELECT assert_true(
  'unreviewed pending workflow cleanup remains possible',
  NOT EXISTS (
    SELECT 1
      FROM triage_sessions
     WHERE id = '10000000-0000-0000-0000-000000000012'
  )
);

-- A verified clarification is frozen once the parent workflow closes.
INSERT INTO triage_sessions (
  id, tenant_id, care_pathway, data_quality, coverage_status,
  review_requirement, workflow_status, scheduling_locked
) VALUES (
  '10000000-0000-0000-0000-000000000013',
  'tenant-action', 'routine_outpatient', 'sufficient', 'complete',
  'none', 'clinician_review', true
);
INSERT INTO triage_clarification_questions (
  id, triage_session_id, question_code, question_text, rationale,
  target, criticality, status, raw_answer, verified_by, verified_at
) VALUES (
  '40000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000013',
  'verified-onset', 'When did symptoms begin?', 'Onset verified',
  'provider', 'critical', 'verified', 'Yesterday',
  'authorized-closer', now()
);
UPDATE triage_sessions
   SET workflow_status = 'closed', closure_code = 'review_complete',
       closed_at = now(), reviewed_by = 'authorized-closer', reviewed_at = now()
 WHERE id = '10000000-0000-0000-0000-000000000013';
SELECT expect_error(
  'clarification evidence is immutable after workflow closure',
  $stmt$
    UPDATE triage_clarification_questions
       SET raw_answer = 'Rewritten after closure'
     WHERE id = '40000000-0000-0000-0000-000000000003'
  $stmt$,
  'clarification questions cannot change after workflow closure'
);

SELECT 'BEHAVIOR_TESTS_COMPLETE' AS result;
