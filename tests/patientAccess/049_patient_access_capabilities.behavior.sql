CREATE OR REPLACE FUNCTION expect_error(
  p_label text,
  p_statement text,
  p_expected_fragment text
)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_error text;
BEGIN
  BEGIN
    EXECUTE p_statement;
  EXCEPTION WHEN OTHERS THEN
    v_error = SQLERRM;
  END;
  IF v_error IS NULL OR position(p_expected_fragment in v_error) = 0 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: % unexpected result: %', p_label, coalesce(v_error, 'no error');
  END IF;
  RAISE NOTICE 'PASS: %', p_label;
END;
$$;

INSERT INTO patients (id, tenant_id) VALUES
  ('11111111-1111-4111-8111-111111111111', 'tenant-1'),
  ('22222222-2222-4222-8222-222222222222', 'tenant-1');
INSERT INTO neurology_consults (id, tenant_id, patient_id) VALUES
  ('33333333-3333-4333-8333-333333333333', 'tenant-1', '11111111-1111-4111-8111-111111111111'),
  ('44444444-4444-4444-8444-444444444444', 'tenant-1', '22222222-2222-4222-8222-222222222222');
INSERT INTO clinical_access_memberships (user_id, tenant_id, role, active) VALUES
  ('clinician-1', 'tenant-1', 'clinician', true),
  ('admin-1', 'tenant-1', 'admin', true),
  ('scheduler-1', 'tenant-1', 'scheduler', true);

SELECT expect_error(
  'an unauthorized issuer cannot create an invitation',
  $stmt$
    INSERT INTO patient_access_capabilities (
      jti_hash, token_kind, token_version, tenant_id, patient_id, scopes,
      issued_by, issued_by_role, issued_at, starts_at, expires_at
    ) VALUES (
      decode(repeat('10', 32), 'hex'), 'invite', 1, 'tenant-1',
      '11111111-1111-4111-8111-111111111111', ARRAY['patient:historian:start'],
      'scheduler-1', 'clinician', now(), now(), now() + interval '1 hour'
    )
  $stmt$,
  'issuer is not authorized'
);

SELECT expect_error(
  'a consult cannot be rebound to another patient',
  $stmt$
    INSERT INTO patient_access_capabilities (
      jti_hash, token_kind, token_version, tenant_id, patient_id, consult_id,
      scopes, issued_by, issued_by_role, issued_at, starts_at, expires_at
    ) VALUES (
      decode(repeat('11', 32), 'hex'), 'invite', 1, 'tenant-1',
      '11111111-1111-4111-8111-111111111111',
      '44444444-4444-4444-8444-444444444444',
      ARRAY['patient:historian:start'], 'clinician-1', 'clinician',
      now(), now(), now() + interval '1 hour'
    )
  $stmt$,
  'consult_patient_mismatch'
);

INSERT INTO patient_access_capabilities (
  id, jti_hash, token_kind, token_version, tenant_id, patient_id, consult_id,
  scopes, issued_by, issued_by_role, issued_at, starts_at, expires_at
) VALUES (
  '55555555-5555-4555-8555-555555555555', decode(repeat('12', 32), 'hex'),
  'invite', 1, 'tenant-1', '11111111-1111-4111-8111-111111111111',
  '33333333-3333-4333-8333-333333333333', ARRAY['patient:historian:start'],
  'clinician-1', 'clinician', now(), now(), now() + interval '1 hour'
);

SELECT expect_error(
  'a session cannot be created before its invite is redeemed',
  $stmt$
    INSERT INTO patient_access_capabilities (
      jti_hash, parent_capability_id, token_kind, token_version, tenant_id,
      patient_id, consult_id, scopes, issued_by_role, issued_at, starts_at, expires_at
    ) VALUES (
      decode(repeat('13', 32), 'hex'), '55555555-5555-4555-8555-555555555555',
      'session', 1, 'tenant-1', '11111111-1111-4111-8111-111111111111',
      '33333333-3333-4333-8333-333333333333', ARRAY['patient:historian:start'],
      'system', now(), now(), now() + interval '15 minutes'
    )
  $stmt$,
  'session parent binding is invalid'
);

UPDATE patient_access_capabilities
   SET redeemed_at = now(), redemption_count = 1, updated_at = now()
 WHERE id = '55555555-5555-4555-8555-555555555555';

INSERT INTO patient_access_capabilities (
  id, jti_hash, parent_capability_id, token_kind, token_version, tenant_id,
  patient_id, consult_id, scopes, issued_by_role, issued_at, starts_at, expires_at
) VALUES (
  '66666666-6666-4666-8666-666666666666', decode(repeat('14', 32), 'hex'),
  '55555555-5555-4555-8555-555555555555', 'session', 1, 'tenant-1',
  '11111111-1111-4111-8111-111111111111',
  '33333333-3333-4333-8333-333333333333', ARRAY['patient:historian:start'],
  'system', now(), now(), now() + interval '15 minutes'
);

SELECT expect_error(
  'a redeemed invitation cannot be replayed or rewritten',
  $stmt$
    UPDATE patient_access_capabilities
       SET redeemed_at = now() + interval '1 minute'
     WHERE id = '55555555-5555-4555-8555-555555555555'
  $stmt$,
  'redemption cannot be cleared or rewritten'
);

SELECT expect_error(
  'an unauthorized identity cannot revoke a capability',
  $stmt$
    UPDATE patient_access_capabilities
       SET revoked_at = now(), revoked_by = 'scheduler-1', revocation_reason = 'test'
     WHERE id = '66666666-6666-4666-8666-666666666666'
  $stmt$,
  'revoker is not authorized'
);

UPDATE patient_access_capabilities
   SET revoked_at = now(), revoked_by = 'admin-1', revocation_reason = 'test'
 WHERE id = '66666666-6666-4666-8666-666666666666';

SELECT expect_error(
  'revocation evidence cannot be cleared',
  $stmt$
    UPDATE patient_access_capabilities
       SET revoked_at = NULL, revoked_by = NULL, revocation_reason = NULL
     WHERE id = '66666666-6666-4666-8666-666666666666'
  $stmt$,
  'revocation cannot be cleared or rewritten'
);

INSERT INTO patient_access_audit_events (
  capability_id, jti_hash, tenant_id, event_type, outcome, actor_kind,
  actor_id, reason_code, correlation_id, occurred_at
) VALUES (
  '55555555-5555-4555-8555-555555555555', decode(repeat('12', 32), 'hex'),
  'tenant-1', 'issued', 'success', 'clinician', 'clinician-1',
  'invite_issued', 'test-issue', now()
);

SELECT expect_error(
  'audit evidence is append-only',
  $stmt$
    DELETE FROM patient_access_audit_events WHERE correlation_id = 'test-issue'
  $stmt$,
  'audit events are append-only'
);

SELECT 'PASS: migration 049 patient-access behavior' AS result;
