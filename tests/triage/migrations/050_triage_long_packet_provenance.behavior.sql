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

SELECT assert_true(
  'legacy completed rows retain compatible defaults',
  (
    SELECT status = 'complete'
       AND ingestion_mode = 'legacy_unknown'
       AND coverage_status = 'legacy_unknown'
       AND source_pages = '[]'::jsonb
       AND source_sha256 IS NULL
      FROM triage_extractions
     WHERE id = '05000000-0000-4000-8000-000000000001'
  )
);

SELECT expect_error(
  'source digests must be lowercase fixed-length sha256',
  $stmt$
    INSERT INTO triage_extractions (
      id, tenant_id, status, text_input, ingestion_mode, source_sha256
    ) VALUES (
      '05000000-0000-4000-8000-000000000002', 'tenant-050', 'pending',
      'Synthetic stable referral.', 'single_pass', 'ABC123'
    )
  $stmt$,
  'triage_extractions_source_sha256_check'
);

INSERT INTO triage_extractions (
  id, tenant_id, status, text_input, source_filename, patient_age, patient_sex,
  ingestion_mode, source_pages, source_sha256, packet_plan,
  coverage_status, coverage_report, packet_emergency_result,
  model_map_result, model_reduce_result, safety_prompt_versions,
  safety_screened_at
) VALUES (
  '05000000-0000-4000-8000-000000000010',
  'tenant-050',
  'complete',
  'Synthetic page one. Synthetic page two.',
  'synthetic-referral.pdf',
  54,
  'female',
  'long_packet',
  '[
    {"documentId":"document-1","pageNumber":1,"text":"Synthetic page one."},
    {"documentId":"document-1","pageNumber":2,"text":"Synthetic page two."}
  ]'::jsonb,
  repeat('a', 64),
  '{
    "version":"neurology-long-packet-planner-v1",
    "chunks":[{"id":"chunk-1"},{"id":"chunk-2"}],
    "coverage":{"status":"complete","sourceCharacterCount":39,"coveredCharacterCount":39,"uncoveredCharacterCount":0,"pageCount":2,"chunkCount":2}
  }'::jsonb,
  'complete',
  '{
    "status":"complete",
    "sourceCharacterCount":39,
    "coveredCharacterCount":39,
    "uncoveredCharacterCount":0,
    "pageCount":2,
    "chunkCount":2
  }'::jsonb,
  '{
    "status":"completed",
    "expectedChunkCount":2,
    "scannedChunkCount":2,
    "chunkEvaluations":[{"chunkId":"chunk-1"},{"chunkId":"chunk-2"}]
  }'::jsonb,
  '{"status":"complete","expectedChunkCount":2,"completedChunkCount":2}'::jsonb,
  '{
    "version":"neurology-long-packet-model-pipeline-v1",
    "status":"completed",
    "coverageStatus":"complete",
    "mapperCoverage":{"status":"complete","expectedChunkCount":2,"completedChunkCount":2},
    "safetyCoverage":{"status":"complete","expectedChunkCount":2,"completedChunkCount":2},
    "mapperOutcomes":[
      {"branch":"clinical_mapper","chunkId":"chunk-1","status":"completed","result":{}},
      {"branch":"clinical_mapper","chunkId":"chunk-2","status":"completed","result":{}}
    ],
    "safetyOutcomes":[
      {"branch":"safety_extractor","chunkId":"chunk-1","status":"completed","result":{}},
      {"branch":"safety_extractor","chunkId":"chunk-2","status":"completed","result":{}}
    ]
  }'::jsonb,
  '{"planner":"v1","emergency_gateway":"v1","mapper":"v1","safety":"v1"}'::jsonb,
  now()
);

SELECT assert_true(
  'a fully reconciled long packet can complete',
  (
    SELECT status = 'complete'
       AND coverage_status = 'complete'
       AND packet_emergency_result->>'status' = 'completed'
      FROM triage_extractions
     WHERE id = '05000000-0000-4000-8000-000000000010'
  )
);

INSERT INTO triage_extractions (
  id, tenant_id, status, text_input, ingestion_mode, source_pages,
  source_sha256, packet_plan, coverage_status, coverage_report,
  packet_emergency_result, model_reduce_result, safety_prompt_versions,
  safety_screened_at
) VALUES (
  '05000000-0000-4000-8000-000000000011',
  'tenant-050',
  'pending',
  'Synthetic page one. The final page is not covered.',
  'long_packet',
  '[{"documentId":"document-1","pageNumber":1,"text":"Synthetic page one."},{"documentId":"document-1","pageNumber":2,"text":"The final page is not covered."}]'::jsonb,
  repeat('b', 64),
  '{
    "version":"neurology-long-packet-planner-v1",
    "chunks":[{"id":"chunk-1"}],
    "coverage":{"status":"failed","uncoveredCharacterCount":14}
  }'::jsonb,
  'complete',
  '{
    "status":"failed",
    "sourceCharacterCount":49,
    "coveredCharacterCount":35,
    "uncoveredCharacterCount":14,
    "pageCount":2,
    "chunkCount":1
  }'::jsonb,
  '{
    "status":"completed","expectedChunkCount":1,"scannedChunkCount":1,
    "chunkEvaluations":[{"chunkId":"chunk-1"}]
  }'::jsonb,
  '{
    "status":"completed","coverageStatus":"complete",
    "mapperCoverage":{"status":"complete","expectedChunkCount":1,"completedChunkCount":1},
    "safetyCoverage":{"status":"complete","expectedChunkCount":1,"completedChunkCount":1}
  }'::jsonb,
  '{"planner":"v1","emergency_gateway":"v1","mapper":"v1","safety":"v1"}'::jsonb,
  now()
);

SELECT expect_error(
  'an uncovered final page cannot be hidden by a complete row status',
  $stmt$
    UPDATE triage_extractions
       SET status = 'complete', completed_at = now()
     WHERE id = '05000000-0000-4000-8000-000000000011'
  $stmt$,
  'zero uncovered characters'
);

INSERT INTO triage_extractions (
  id, tenant_id, status, text_input, ingestion_mode, source_pages,
  source_sha256, packet_plan, coverage_status, coverage_report,
  packet_emergency_result, model_reduce_result, safety_prompt_versions,
  safety_screened_at
) VALUES (
  '05000000-0000-4000-8000-000000000012',
  'tenant-050',
  'pending',
  'Synthetic two-chunk referral.',
  'long_packet',
  '[{"documentId":"document-1","pageNumber":1,"text":"Synthetic two-chunk referral."}]'::jsonb,
  repeat('c', 64),
  '{
    "version":"neurology-long-packet-planner-v1",
    "chunks":[{"id":"chunk-1"},{"id":"chunk-2"}],
    "coverage":{"status":"complete","sourceCharacterCount":29,"coveredCharacterCount":29,"uncoveredCharacterCount":0,"pageCount":1,"chunkCount":2}
  }'::jsonb,
  'complete',
  '{
    "status":"complete","sourceCharacterCount":29,"coveredCharacterCount":29,
    "uncoveredCharacterCount":0,"pageCount":1,"chunkCount":2
  }'::jsonb,
  '{
    "status":"completed","expectedChunkCount":2,"scannedChunkCount":1,
    "chunkEvaluations":[{"chunkId":"chunk-1"}]
  }'::jsonb,
  '{
    "status":"completed","coverageStatus":"complete",
    "mapperCoverage":{"status":"complete","expectedChunkCount":2,"completedChunkCount":2},
    "safetyCoverage":{"status":"complete","expectedChunkCount":2,"completedChunkCount":2}
  }'::jsonb,
  '{"planner":"v1","emergency_gateway":"v1","mapper":"v1","safety":"v1"}'::jsonb,
  now()
);

SELECT expect_error(
  'a missing final emergency chunk scan cannot complete',
  $stmt$
    UPDATE triage_extractions
       SET status = 'complete', completed_at = now()
     WHERE id = '05000000-0000-4000-8000-000000000012'
  $stmt$,
  'every planned chunk is emergency screened'
);

UPDATE triage_extractions
   SET packet_emergency_result = '{
     "status":"completed","expectedChunkCount":2,"scannedChunkCount":2,
     "chunkEvaluations":[{"chunkId":"chunk-1"},{"chunkId":"chunk-2"}]
   }'::jsonb
 WHERE id = '05000000-0000-4000-8000-000000000012';

SELECT assert_true(
  'an invalid completed-scan claim may be corrected before row completion',
  (
    SELECT packet_emergency_result->>'scannedChunkCount' = '2'
      FROM triage_extractions
     WHERE id = '05000000-0000-4000-8000-000000000012'
  )
);

SELECT expect_error(
  'a completed source page cannot be rewritten',
  $stmt$
    UPDATE triage_extractions
       SET source_pages = '[{"documentId":"rewritten","pageNumber":1}]'::jsonb
     WHERE id = '05000000-0000-4000-8000-000000000010'
  $stmt$,
  'provenance is immutable'
);

SELECT expect_error(
  'a completed extraction cannot be reverted to pending',
  $stmt$
    UPDATE triage_extractions
       SET status = 'pending'
     WHERE id = '05000000-0000-4000-8000-000000000010'
  $stmt$,
  'completed triage extractions are immutable'
);

INSERT INTO triage_extractions (
  id, tenant_id, status, text_input, ingestion_mode, source_pages,
  source_sha256, packet_plan, coverage_status, coverage_report,
  packet_emergency_result
) VALUES (
  '05000000-0000-4000-8000-000000000013',
  'tenant-050',
  'pending',
  'Synthetic pending evidence.',
  'long_packet',
  '[{"documentId":"document-1","pageNumber":1,"text":"Synthetic pending evidence."}]'::jsonb,
  repeat('d', 64),
  '{"version":"v1","chunks":[{"id":"chunk-1"}],"coverage":{"status":"complete","sourceCharacterCount":27,"coveredCharacterCount":27,"uncoveredCharacterCount":0,"pageCount":1,"chunkCount":1}}'::jsonb,
  'complete',
  '{"status":"complete","sourceCharacterCount":27,"coveredCharacterCount":27,"uncoveredCharacterCount":0,"pageCount":1,"chunkCount":1}'::jsonb,
  '{"status":"completed","expectedChunkCount":1,"scannedChunkCount":1,"chunkEvaluations":[{"chunkId":"chunk-1"}]}'::jsonb
);

SELECT expect_error(
  'complete coverage evidence cannot be downgraded while work remains pending',
  $stmt$
    UPDATE triage_extractions
       SET coverage_status = 'failed'
     WHERE id = '05000000-0000-4000-8000-000000000013'
  $stmt$,
  'complete extraction coverage cannot be downgraded or rewritten'
);

SELECT expect_error(
  'completed emergency evidence cannot be replaced by a failed scan',
  $stmt$
    UPDATE triage_extractions
       SET packet_emergency_result = '{"status":"failed","expectedChunkCount":1,"scannedChunkCount":0}'::jsonb
     WHERE id = '05000000-0000-4000-8000-000000000013'
  $stmt$,
  'completed emergency scan evidence cannot be downgraded or rewritten'
);

SELECT expect_error(
  'a partial independent safety-model branch cannot be hidden by model reduction',
  $stmt$
    UPDATE triage_extractions
       SET status = 'complete',
           model_map_result = '{"status":"complete","expectedChunkCount":1,"completedChunkCount":1}'::jsonb,
           model_reduce_result = '{
             "status":"completed","coverageStatus":"complete",
             "mapperCoverage":{"status":"complete","expectedChunkCount":1,"completedChunkCount":1},
             "safetyCoverage":{"status":"partial","expectedChunkCount":1,"completedChunkCount":0}
           }'::jsonb,
           safety_prompt_versions = '{"planner":"v1","emergency_gateway":"v1","mapper":"v1","safety":"v1"}'::jsonb,
           safety_screened_at = now()
     WHERE id = '05000000-0000-4000-8000-000000000013'
  $stmt$,
  'completed model reduction'
);

SELECT expect_error(
  'tenant and source bindings cannot be changed',
  $stmt$
    UPDATE triage_extractions
       SET tenant_id = 'different-tenant'
     WHERE id = '05000000-0000-4000-8000-000000000013'
  $stmt$,
  'source and bindings are immutable'
);

SELECT expect_error(
  'extraction audit evidence cannot be deleted',
  $stmt$
    DELETE FROM triage_extractions
     WHERE id = '05000000-0000-4000-8000-000000000013'
  $stmt$,
  'triage extractions cannot be deleted'
);

INSERT INTO triage_extractions (
  id, tenant_id, status, error_message, text_input, ingestion_mode,
  source_pages, source_sha256, packet_plan, coverage_status, coverage_report
) VALUES (
  '05000000-0000-4000-8000-000000000014',
  'tenant-050',
  'error',
  'Synthetic parser failure.',
  'Synthetic partial audit source.',
  'long_packet',
  '[{"documentId":"document-1","pageNumber":1}]'::jsonb,
  repeat('e', 64),
  '{"version":"v1","chunks":[],"coverage":{"status":"failed","uncoveredCharacterCount":12}}'::jsonb,
  'failed',
  '{"status":"failed","uncoveredCharacterCount":12}'::jsonb
);

SELECT assert_true(
  'error rows retain partial audit evidence without claiming completion',
  (
    SELECT status = 'error'
       AND coverage_status = 'failed'
       AND packet_emergency_result IS NULL
       AND model_reduce_result IS NULL
      FROM triage_extractions
     WHERE id = '05000000-0000-4000-8000-000000000014'
  )
);

SELECT 'PASS: migration 050 long-packet provenance behavior' AS result;
