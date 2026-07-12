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

INSERT INTO triage_extractions (
  id, tenant_id, status, text_input, ingestion_mode, source_sha256,
  packet_plan, packet_plan_sha256, coverage_status
) VALUES (
  '05200000-0000-4000-8000-000000000001',
  'tenant-052',
  'pending',
  'Synthetic durable-work packet with two bounded chunks.',
  'long_packet',
  repeat('a', 64),
  jsonb_build_object(
    'version', 'planner-v1',
    'chunks', jsonb_build_array(
      jsonb_build_object(
        'id', 'chunk-1',
        'provenanceSha256', repeat('d', 64)
      ),
      jsonb_build_object(
        'id', 'chunk-2',
        'provenanceSha256', repeat('e', 64)
      )
    ),
    'coverage', jsonb_build_object(
      'status', 'complete',
      'sourceCharacterCount', 53,
      'coveredCharacterCount', 53,
      'uncoveredCharacterCount', 0,
      'pageCount', 1,
      'chunkCount', 2
    )
  ),
  repeat('b', 64),
  'complete'
);

INSERT INTO triage_long_packet_runs (
  id, extraction_id, tenant_id, configuration_sha256, run_purpose,
  source_sha256, plan_sha256, expected_chunk_count,
  planner_version, pipeline_version,
  mapper_model_id, mapper_prompt_version,
  safety_model_id, safety_prompt_version,
  reducer_model_id, reducer_prompt_version
) VALUES (
  '05210000-0000-4000-8000-000000000001',
  '05200000-0000-4000-8000-000000000001',
  'tenant-052',
  repeat('c', 64),
  'primary',
  repeat('a', 64),
  repeat('b', 64),
  2,
  'planner-v1',
  'pipeline-v1',
  'mapper-model-v1',
  'mapper-prompt-v1',
  'safety-model-v1',
  'safety-prompt-v1',
  'reducer-model-v1',
  'reducer-prompt-v1'
);

SELECT expect_error(
  'the same extraction and configuration cannot create duplicate runs',
  $stmt$
    INSERT INTO triage_long_packet_runs (
      extraction_id, tenant_id, configuration_sha256, run_purpose,
      source_sha256, plan_sha256, expected_chunk_count,
      planner_version, pipeline_version,
      mapper_model_id, mapper_prompt_version,
      safety_model_id, safety_prompt_version,
      reducer_model_id, reducer_prompt_version
    ) VALUES (
      '05200000-0000-4000-8000-000000000001', 'tenant-052',
      repeat('c', 64), 'shadow', repeat('a', 64), repeat('b', 64), 2,
      'planner-v1', 'pipeline-v1', 'mapper-model-v1', 'mapper-prompt-v1',
      'safety-model-v1', 'safety-prompt-v1',
      'reducer-model-v1', 'reducer-prompt-v1'
    )
  $stmt$,
  'triage_long_packet_runs_extraction_id_configuration_sha256_key'
);

SELECT expect_error(
  'a run cannot cross its extraction tenant',
  $stmt$
    INSERT INTO triage_long_packet_runs (
      extraction_id, tenant_id, configuration_sha256, run_purpose,
      source_sha256, plan_sha256, expected_chunk_count,
      planner_version, pipeline_version,
      mapper_model_id, mapper_prompt_version,
      safety_model_id, safety_prompt_version,
      reducer_model_id, reducer_prompt_version
    ) VALUES (
      '05200000-0000-4000-8000-000000000001', 'different-tenant',
      repeat('1', 64), 'shadow', repeat('a', 64), repeat('b', 64), 2,
      'planner-v1', 'pipeline-v1', 'mapper-model-v1', 'mapper-prompt-v1',
      'safety-model-v1', 'safety-prompt-v1',
      'reducer-model-v1', 'reducer-prompt-v1'
    )
  $stmt$,
  'long-packet run extraction binding is invalid'
);

SELECT expect_error(
  'run expected chunk count must match the immutable plan',
  $stmt$
    INSERT INTO triage_long_packet_runs (
      extraction_id, tenant_id, configuration_sha256, run_purpose,
      source_sha256, plan_sha256, expected_chunk_count,
      planner_version, pipeline_version,
      mapper_model_id, mapper_prompt_version,
      safety_model_id, safety_prompt_version,
      reducer_model_id, reducer_prompt_version
    ) VALUES (
      '05200000-0000-4000-8000-000000000001', 'tenant-052',
      repeat('2', 64), 'shadow', repeat('a', 64), repeat('b', 64), 1,
      'planner-v1', 'pipeline-v1', 'mapper-model-v1', 'mapper-prompt-v1',
      'safety-model-v1', 'safety-prompt-v1',
      'reducer-model-v1', 'reducer-prompt-v1'
    )
  $stmt$,
  'long-packet run extraction binding is invalid'
);

SELECT expect_error(
  'run provenance cannot be rewritten',
  $stmt$
    UPDATE triage_long_packet_runs
       SET mapper_model_id = 'rewritten-model'
     WHERE id = '05210000-0000-4000-8000-000000000001'
  $stmt$,
  'long-packet run provenance is immutable'
);

SELECT expect_error(
  'a run cannot start before all durable jobs and finalization exist',
  $stmt$
    UPDATE triage_long_packet_runs
       SET status = 'running', started_at = now()
     WHERE id = '05210000-0000-4000-8000-000000000001'
  $stmt$,
  'complete durable job manifest exists'
);

SELECT expect_error(
  'chunk provenance must match its immutable packet plan',
  $stmt$
    INSERT INTO triage_long_packet_chunk_jobs (
      run_id, tenant_id, chunk_id, branch, configuration_sha256,
      source_sha256, plan_sha256, planner_version, pipeline_version,
      chunk_provenance_sha256, model_id, prompt_version
    ) VALUES (
      '05210000-0000-4000-8000-000000000001', 'tenant-052',
      'chunk-1', 'mapper', repeat('c', 64), repeat('a', 64), repeat('b', 64),
      'planner-v1', 'pipeline-v1', repeat('9', 64),
      'mapper-model-v1', 'mapper-prompt-v1'
    )
  $stmt$,
  'long-packet chunk provenance is invalid'
);

INSERT INTO triage_long_packet_chunk_jobs (
  id, run_id, tenant_id, chunk_id, branch, configuration_sha256,
  source_sha256, plan_sha256, planner_version, pipeline_version,
  chunk_provenance_sha256, model_id, prompt_version, max_attempts
) VALUES
  (
    '05220000-0000-4000-8000-000000000001',
    '05210000-0000-4000-8000-000000000001', 'tenant-052',
    'chunk-1', 'mapper', repeat('c', 64), repeat('a', 64), repeat('b', 64),
    'planner-v1', 'pipeline-v1', repeat('d', 64),
    'mapper-model-v1', 'mapper-prompt-v1', 3
  ),
  (
    '05220000-0000-4000-8000-000000000002',
    '05210000-0000-4000-8000-000000000001', 'tenant-052',
    'chunk-2', 'mapper', repeat('c', 64), repeat('a', 64), repeat('b', 64),
    'planner-v1', 'pipeline-v1', repeat('e', 64),
    'mapper-model-v1', 'mapper-prompt-v1', 3
  ),
  (
    '05220000-0000-4000-8000-000000000003',
    '05210000-0000-4000-8000-000000000001', 'tenant-052',
    'chunk-1', 'safety', repeat('c', 64), repeat('a', 64), repeat('b', 64),
    'planner-v1', 'pipeline-v1', repeat('d', 64),
    'safety-model-v1', 'safety-prompt-v1', 3
  ),
  (
    '05220000-0000-4000-8000-000000000004',
    '05210000-0000-4000-8000-000000000001', 'tenant-052',
    'chunk-2', 'safety', repeat('c', 64), repeat('a', 64), repeat('b', 64),
    'planner-v1', 'pipeline-v1', repeat('e', 64),
    'safety-model-v1', 'safety-prompt-v1', 3
  );

SELECT expect_error(
  'chunk work identity is idempotent within a run',
  $stmt$
    INSERT INTO triage_long_packet_chunk_jobs (
      run_id, tenant_id, chunk_id, branch, configuration_sha256,
      source_sha256, plan_sha256, planner_version, pipeline_version,
      chunk_provenance_sha256, model_id, prompt_version
    ) VALUES (
      '05210000-0000-4000-8000-000000000001', 'tenant-052',
      'chunk-1', 'mapper', repeat('c', 64), repeat('a', 64), repeat('b', 64),
      'planner-v1', 'pipeline-v1', repeat('d', 64),
      'mapper-model-v1', 'mapper-prompt-v1'
    )
  $stmt$,
  'triage_long_packet_chunk_jobs_run_id_chunk_id_branch_key'
);

INSERT INTO triage_long_packet_finalization_jobs (
  id, run_id, tenant_id, configuration_sha256, source_sha256, plan_sha256,
  planner_version, pipeline_version, expected_chunk_count,
  model_id, prompt_version, max_attempts
) VALUES (
  '05230000-0000-4000-8000-000000000001',
  '05210000-0000-4000-8000-000000000001',
  'tenant-052', repeat('c', 64), repeat('a', 64), repeat('b', 64),
  'planner-v1', 'pipeline-v1', 2,
  'reducer-model-v1', 'reducer-prompt-v1', 3
);

SELECT expect_error(
  'one run cannot have two finalization jobs',
  $stmt$
    INSERT INTO triage_long_packet_finalization_jobs (
      run_id, tenant_id, configuration_sha256, source_sha256, plan_sha256,
      planner_version, pipeline_version, expected_chunk_count,
      model_id, prompt_version
    ) VALUES (
      '05210000-0000-4000-8000-000000000001',
      'tenant-052', repeat('c', 64), repeat('a', 64), repeat('b', 64),
      'planner-v1', 'pipeline-v1', 2,
      'reducer-model-v1', 'reducer-prompt-v1'
    )
  $stmt$,
  'triage_long_packet_finalization_jobs_run_id_key'
);

UPDATE triage_long_packet_runs
   SET status = 'running', started_at = now()
 WHERE id = '05210000-0000-4000-8000-000000000001';

SELECT expect_error(
  'finalization cannot lease before every branch and chunk is complete',
  $stmt$
    UPDATE triage_long_packet_finalization_jobs
       SET status = 'leased',
           lease_token = '05240000-0000-4000-8000-000000000001',
           lease_owner = 'worker-finalize',
           claimed_at = now(),
           lease_expires_at = now() + interval '5 minutes',
           attempt_count = 1
     WHERE id = '05230000-0000-4000-8000-000000000001'
  $stmt$,
  'all mapper and safety chunk jobs complete'
);

UPDATE triage_long_packet_chunk_jobs
   SET status = 'leased',
       lease_token = '05240000-0000-4000-8000-000000000011',
       lease_owner = 'worker-a',
       claimed_at = now(),
       lease_expires_at = now() + interval '5 minutes',
       attempt_count = 1
 WHERE id = '05220000-0000-4000-8000-000000000001';

SELECT expect_error(
  'an active chunk lease cannot be stolen',
  $stmt$
    UPDATE triage_long_packet_chunk_jobs
       SET lease_token = '05240000-0000-4000-8000-000000000012',
           lease_owner = 'worker-b',
           claimed_at = now(),
           lease_expires_at = now() + interval '10 minutes',
           attempt_count = 2
     WHERE id = '05220000-0000-4000-8000-000000000001'
  $stmt$,
  'active long-packet job lease cannot be replaced'
);

SELECT expect_error(
  'a stale token cannot publish a completed chunk result',
  $stmt$
    UPDATE triage_long_packet_chunk_jobs
       SET status = 'complete',
           lease_token = NULL, lease_owner = NULL,
           claimed_at = NULL, lease_expires_at = NULL,
           outcome_lease_token = '05240000-0000-4000-8000-000000000099',
           result = '{"status":"completed","synthetic":true}'::jsonb,
           result_sha256 = repeat('f', 64),
           finished_at = now()
     WHERE id = '05220000-0000-4000-8000-000000000001'
  $stmt$,
  'outcome lease token is stale'
);

UPDATE triage_long_packet_chunk_jobs
   SET status = 'complete',
       lease_token = NULL, lease_owner = NULL,
       claimed_at = NULL, lease_expires_at = NULL,
       outcome_lease_token = '05240000-0000-4000-8000-000000000011',
       result = '{"status":"completed","synthetic":true}'::jsonb,
       result_sha256 = repeat('f', 64),
       finished_at = now()
 WHERE id = '05220000-0000-4000-8000-000000000001';

SELECT expect_error(
  'a completed chunk result cannot be rewritten',
  $stmt$
    UPDATE triage_long_packet_chunk_jobs
       SET result = '{"status":"completed","rewritten":true}'::jsonb
     WHERE id = '05220000-0000-4000-8000-000000000001'
  $stmt$,
  'completed long-packet job outcomes are immutable'
);

UPDATE triage_long_packet_chunk_jobs
   SET status = 'leased',
       lease_token = '05240000-0000-4000-8000-000000000021',
       lease_owner = 'worker-retry-1',
       claimed_at = now(),
       lease_expires_at = now() + interval '5 minutes',
       attempt_count = 1
 WHERE id = '05220000-0000-4000-8000-000000000002';

UPDATE triage_long_packet_chunk_jobs
   SET status = 'failed',
       lease_token = NULL, lease_owner = NULL,
       claimed_at = NULL, lease_expires_at = NULL,
       outcome_lease_token = '05240000-0000-4000-8000-000000000021',
       last_error_code = 'model_timeout',
       last_error_detail = 'Synthetic timeout for retry behavior.',
       last_error_at = now(),
       last_error_lease_token = '05240000-0000-4000-8000-000000000021',
       next_retry_at = now() - interval '1 second',
       finished_at = now()
 WHERE id = '05220000-0000-4000-8000-000000000002';

UPDATE triage_long_packet_chunk_jobs
   SET status = 'leased',
       lease_token = '05240000-0000-4000-8000-000000000022',
       lease_owner = 'worker-retry-2',
       claimed_at = now(),
       lease_expires_at = now() + interval '5 minutes',
       attempt_count = 2,
       next_retry_at = NULL,
       outcome_lease_token = NULL,
       finished_at = NULL
 WHERE id = '05220000-0000-4000-8000-000000000002';

UPDATE triage_long_packet_chunk_jobs
   SET status = 'complete',
       lease_token = NULL, lease_owner = NULL,
       claimed_at = NULL, lease_expires_at = NULL,
       outcome_lease_token = '05240000-0000-4000-8000-000000000022',
       result = '{"status":"completed","retry":2}'::jsonb,
       result_sha256 = repeat('8', 64),
       finished_at = now()
 WHERE id = '05220000-0000-4000-8000-000000000002';

CREATE OR REPLACE FUNCTION complete_synthetic_chunk_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_result_sha text
)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE triage_long_packet_chunk_jobs
     SET status = 'leased',
         lease_token = p_lease_token,
         lease_owner = 'synthetic-worker',
         claimed_at = now(),
         lease_expires_at = now() + interval '5 minutes',
         attempt_count = attempt_count + 1
   WHERE id = p_job_id;

  UPDATE triage_long_packet_chunk_jobs
     SET status = 'complete',
         lease_token = NULL, lease_owner = NULL,
         claimed_at = NULL, lease_expires_at = NULL,
         outcome_lease_token = p_lease_token,
         result = '{"status":"completed","synthetic":true}'::jsonb,
         result_sha256 = p_result_sha,
         finished_at = now()
   WHERE id = p_job_id;
END;
$$;

SELECT complete_synthetic_chunk_job(
  '05220000-0000-4000-8000-000000000003',
  '05240000-0000-4000-8000-000000000031',
  repeat('6', 64)
);

UPDATE triage_long_packet_chunk_jobs
   SET status = 'leased',
       lease_token = '05240000-0000-4000-8000-000000000041',
       lease_owner = 'expired-worker',
       claimed_at = now() - interval '10 minutes',
       lease_expires_at = now() - interval '5 minutes',
       attempt_count = 1
 WHERE id = '05220000-0000-4000-8000-000000000004';

UPDATE triage_long_packet_chunk_jobs
   SET status = 'leased',
       lease_token = '05240000-0000-4000-8000-000000000042',
       lease_owner = 'reclaim-worker',
       claimed_at = now(),
       lease_expires_at = now() + interval '5 minutes',
       attempt_count = 2
 WHERE id = '05220000-0000-4000-8000-000000000004';

SELECT assert_true(
  'an expired job lease is reclaimed with a new token and bounded attempt',
  (
    SELECT status = 'leased'
       AND lease_token = '05240000-0000-4000-8000-000000000042'
       AND attempt_count = 2
      FROM triage_long_packet_chunk_jobs
     WHERE id = '05220000-0000-4000-8000-000000000004'
  )
);

UPDATE triage_long_packet_chunk_jobs
   SET status = 'complete',
       lease_token = NULL, lease_owner = NULL,
       claimed_at = NULL, lease_expires_at = NULL,
       outcome_lease_token = '05240000-0000-4000-8000-000000000042',
       result = '{"status":"completed","reclaimed":true}'::jsonb,
       result_sha256 = repeat('7', 64),
       finished_at = now()
 WHERE id = '05220000-0000-4000-8000-000000000004';

UPDATE triage_long_packet_finalization_jobs
   SET status = 'leased',
       lease_token = '05240000-0000-4000-8000-000000000051',
       lease_owner = 'worker-finalize',
       claimed_at = now(),
       lease_expires_at = now() + interval '5 minutes',
       attempt_count = 1
 WHERE id = '05230000-0000-4000-8000-000000000001';

SELECT expect_error(
  'a stale token cannot publish finalization',
  $stmt$
    UPDATE triage_long_packet_finalization_jobs
       SET status = 'complete',
           lease_token = NULL, lease_owner = NULL,
           claimed_at = NULL, lease_expires_at = NULL,
           outcome_lease_token = '05240000-0000-4000-8000-000000000099',
           result = '{"status":"completed","coverageStatus":"complete"}'::jsonb,
           result_sha256 = repeat('5', 64),
           finished_at = now()
     WHERE id = '05230000-0000-4000-8000-000000000001'
  $stmt$,
  'outcome lease token is stale'
);

UPDATE triage_long_packet_finalization_jobs
   SET status = 'complete',
       lease_token = NULL, lease_owner = NULL,
       claimed_at = NULL, lease_expires_at = NULL,
       outcome_lease_token = '05240000-0000-4000-8000-000000000051',
       result = '{"status":"completed","coverageStatus":"complete"}'::jsonb,
       result_sha256 = repeat('5', 64),
       finished_at = now()
 WHERE id = '05230000-0000-4000-8000-000000000001';

UPDATE triage_long_packet_runs
   SET status = 'complete', completed_at = now()
 WHERE id = '05210000-0000-4000-8000-000000000001';

SELECT assert_true(
  'a run completes only after every durable outcome and finalization complete',
  (
    SELECT run.status = 'complete'
       AND finalization.status = 'complete'
       AND (
         SELECT count(*)
           FROM triage_long_packet_chunk_jobs chunk_job
          WHERE chunk_job.run_id = run.id
            AND chunk_job.status = 'complete'
       ) = 4
      FROM triage_long_packet_runs run
      JOIN triage_long_packet_finalization_jobs finalization
        ON finalization.run_id = run.id
     WHERE run.id = '05210000-0000-4000-8000-000000000001'
  )
);

SELECT expect_error(
  'a completed run cannot be rewritten',
  $stmt$
    UPDATE triage_long_packet_runs
       SET run_purpose = 'shadow'
     WHERE id = '05210000-0000-4000-8000-000000000001'
  $stmt$,
  'completed long-packet runs are immutable'
);

SELECT expect_error(
  'a completed finalization outcome cannot be deleted',
  $stmt$
    DELETE FROM triage_long_packet_finalization_jobs
     WHERE id = '05230000-0000-4000-8000-000000000001'
  $stmt$,
  'long-packet durable jobs cannot be deleted'
);

INSERT INTO triage_long_packet_runs (
  extraction_id, tenant_id, configuration_sha256, run_purpose,
  source_sha256, plan_sha256, expected_chunk_count,
  planner_version, pipeline_version,
  mapper_model_id, mapper_prompt_version,
  safety_model_id, safety_prompt_version,
  reducer_model_id, reducer_prompt_version
) VALUES (
  '05200000-0000-4000-8000-000000000001', 'tenant-052',
  repeat('4', 64), 'shadow', repeat('a', 64), repeat('b', 64), 2,
  'planner-v1', 'pipeline-v2-shadow',
  'mapper-model-v2', 'mapper-prompt-v2',
  'safety-model-v2', 'safety-prompt-v2',
  'reducer-model-v2', 'reducer-prompt-v2'
);

SELECT assert_true(
  'a new configuration creates a separate immutable comparison run',
  (
    SELECT count(*) = 2
      FROM triage_long_packet_runs
     WHERE extraction_id = '05200000-0000-4000-8000-000000000001'
  )
);

SELECT 'PASS: migration 052 durable long-packet work behavior' AS result;
