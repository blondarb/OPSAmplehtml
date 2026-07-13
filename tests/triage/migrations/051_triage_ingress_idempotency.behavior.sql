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
  v_error text;
BEGIN
  BEGIN
    EXECUTE p_statement;
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
  END;
  IF v_error IS NULL OR position(p_expected_fragment in v_error) = 0 THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: % unexpected result: %',
      p_label,
      coalesce(v_error, 'no error');
  END IF;
  RAISE NOTICE 'PASS: % [%]', p_label, v_error;
END;
$$;

INSERT INTO triage_extractions (id, tenant_id) VALUES
  ('05100000-0000-4000-8000-000000000001', 'tenant-a'),
  ('05100000-0000-4000-8000-000000000002', 'tenant-a'),
  ('05100000-0000-4000-8000-000000000003', 'tenant-b');

INSERT INTO triage_sessions (
  id, tenant_id, source_extraction_id, processing_status
) VALUES (
  '05110000-0000-4000-8000-000000000001',
  'tenant-a',
  '05100000-0000-4000-8000-000000000001',
  'pending'
);

SELECT expect_error(
  'a source extraction can create only one triage workflow',
  $stmt$
    INSERT INTO triage_sessions (
      id, tenant_id, source_extraction_id, processing_status
    ) VALUES (
      '05110000-0000-4000-8000-000000000002',
      'tenant-a',
      '05100000-0000-4000-8000-000000000001',
      'pending'
    )
  $stmt$,
  'idx_triage_sessions_unique_source_extraction'
);

SELECT expect_error(
  'an extraction cannot be linked across tenants',
  $stmt$
    INSERT INTO triage_sessions (
      id, tenant_id, source_extraction_id, processing_status
    ) VALUES (
      '05110000-0000-4000-8000-000000000003',
      'tenant-a',
      '05100000-0000-4000-8000-000000000003',
      'pending'
    )
  $stmt$,
  'triage source extraction tenant binding is invalid'
);

INSERT INTO triage_sessions (
  id, tenant_id, processing_status
) VALUES (
  '05110000-0000-4000-8000-000000000004',
  'tenant-a',
  'pending'
);

UPDATE triage_sessions
   SET source_extraction_id = '05100000-0000-4000-8000-000000000002'
 WHERE id = '05110000-0000-4000-8000-000000000004';

SELECT assert_true(
  'an unbound pending workflow may be bound once',
  (
    SELECT source_extraction_id = '05100000-0000-4000-8000-000000000002'
      FROM triage_sessions
     WHERE id = '05110000-0000-4000-8000-000000000004'
  )
);

SELECT expect_error(
  'a source extraction link cannot be cleared',
  $stmt$
    UPDATE triage_sessions
       SET source_extraction_id = NULL
     WHERE id = '05110000-0000-4000-8000-000000000004'
  $stmt$,
  'triage source extraction linkage is immutable once set'
);

SELECT expect_error(
  'a source extraction link cannot be rebound',
  $stmt$
    UPDATE triage_sessions
       SET source_extraction_id = '05100000-0000-4000-8000-000000000001'
     WHERE id = '05110000-0000-4000-8000-000000000004'
  $stmt$,
  'triage source extraction linkage is immutable once set'
);

SELECT expect_error(
  'a source-linked triage workflow cannot be deleted to free the idempotency key',
  $stmt$
    DELETE FROM triage_sessions
     WHERE id = '05110000-0000-4000-8000-000000000004'
  $stmt$,
  'triage sessions linked to a source extraction cannot be deleted'
);

SELECT expect_error(
  'a linked workflow tenant cannot move away from its source tenant',
  $stmt$
    UPDATE triage_sessions
       SET tenant_id = 'tenant-b'
     WHERE id = '05110000-0000-4000-8000-000000000004'
  $stmt$,
  'triage source extraction tenant binding is invalid'
);

INSERT INTO triage_sessions (
  id, tenant_id, processing_status
) VALUES (
  '05110000-0000-4000-8000-000000000005',
  'tenant-a',
  'pending'
);

UPDATE triage_sessions
   SET processing_claimed_at = now(),
       processing_lease_expires_at = now() + interval '5 minutes',
       processing_attempt_count = 1
 WHERE id = '05110000-0000-4000-8000-000000000005';

SELECT assert_true(
  'a pending row can atomically acquire its first processing lease',
  (
    SELECT processing_attempt_count = 1
       AND processing_claimed_at IS NOT NULL
       AND processing_lease_expires_at > processing_claimed_at
      FROM triage_sessions
     WHERE id = '05110000-0000-4000-8000-000000000005'
  )
);

SELECT expect_error(
  'an active lease cannot be stolen by another processing attempt',
  $stmt$
    UPDATE triage_sessions
       SET processing_claimed_at = now(),
           processing_lease_expires_at = now() + interval '10 minutes',
           processing_attempt_count = 2
     WHERE id = '05110000-0000-4000-8000-000000000005'
  $stmt$,
  'an active processing lease cannot be replaced'
);

SELECT expect_error(
  'a lease cannot be acquired without incrementing its attempt count',
  $stmt$
    INSERT INTO triage_sessions (
      id, tenant_id, processing_status, processing_claimed_at,
      processing_lease_expires_at, processing_attempt_count
    ) VALUES (
      '05110000-0000-4000-8000-000000000006',
      'tenant-a', 'pending', now(), now() + interval '5 minutes', 0
    )
  $stmt$,
  'a new processing lease must increment the attempt count'
);

SELECT expect_error(
  'a processing attempt count cannot be decremented',
  $stmt$
    UPDATE triage_sessions
       SET processing_attempt_count = 0
     WHERE id = '05110000-0000-4000-8000-000000000005'
  $stmt$,
  'processing attempt count cannot decrease'
);

SELECT expect_error(
  'completion must atomically clear its processing lease',
  $stmt$
    UPDATE triage_sessions
       SET processing_status = 'complete'
     WHERE id = '05110000-0000-4000-8000-000000000005'
  $stmt$,
  'terminal processing state cannot retain an active lease'
);

UPDATE triage_sessions
   SET processing_status = 'complete',
       processing_claimed_at = NULL,
       processing_lease_expires_at = NULL
 WHERE id = '05110000-0000-4000-8000-000000000005';

SELECT assert_true(
  'completion clears the lease but preserves attempt history',
  (
    SELECT processing_status = 'complete'
       AND processing_claimed_at IS NULL
       AND processing_lease_expires_at IS NULL
       AND processing_attempt_count = 1
      FROM triage_sessions
     WHERE id = '05110000-0000-4000-8000-000000000005'
  )
);

INSERT INTO triage_sessions (
  id, tenant_id, processing_status, processing_claimed_at,
  processing_lease_expires_at, processing_attempt_count
) VALUES (
  '05110000-0000-4000-8000-000000000007',
  'tenant-a',
  'pending',
  now() - interval '10 minutes',
  now() - interval '5 minutes',
  1
);

UPDATE triage_sessions
   SET processing_claimed_at = now(),
       processing_lease_expires_at = now() + interval '5 minutes',
       processing_attempt_count = 2
 WHERE id = '05110000-0000-4000-8000-000000000007';

SELECT assert_true(
  'an expired lease may be reclaimed with a new attempt',
  (
    SELECT processing_attempt_count = 2
       AND processing_lease_expires_at > now()
      FROM triage_sessions
     WHERE id = '05110000-0000-4000-8000-000000000007'
  )
);

SELECT 'PASS: migration 051 ingress idempotency behavior' AS result;
