-- Migration 050: durable provenance and fail-closed completion for triage
-- extraction, including page-aware long packets.
--
-- Existing extraction rows predate page/chunk safety processing. They retain
-- explicit legacy_unknown defaults and remain readable. A row that explicitly
-- declares ingestion_mode=long_packet cannot claim status=complete until its
-- full source, coverage, deterministic emergency scan, and model-reduction
-- evidence reconcile. Error rows may retain partial audit evidence.

ALTER TABLE triage_extractions
  ADD COLUMN IF NOT EXISTS ingestion_mode text NOT NULL DEFAULT 'legacy_unknown',
  ADD COLUMN IF NOT EXISTS source_pages jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS source_sha256 text,
  ADD COLUMN IF NOT EXISTS packet_plan jsonb,
  ADD COLUMN IF NOT EXISTS coverage_status text NOT NULL DEFAULT 'legacy_unknown',
  ADD COLUMN IF NOT EXISTS coverage_report jsonb,
  ADD COLUMN IF NOT EXISTS packet_emergency_result jsonb,
  ADD COLUMN IF NOT EXISTS model_map_result jsonb,
  ADD COLUMN IF NOT EXISTS model_reduce_result jsonb,
  ADD COLUMN IF NOT EXISTS safety_prompt_versions jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS safety_screened_at timestamptz;

ALTER TABLE triage_extractions
  DROP CONSTRAINT IF EXISTS triage_extractions_ingestion_mode_check,
  DROP CONSTRAINT IF EXISTS triage_extractions_extraction_coverage_status_check,
  DROP CONSTRAINT IF EXISTS triage_extractions_source_sha256_check,
  DROP CONSTRAINT IF EXISTS triage_extractions_source_pages_shape_check,
  DROP CONSTRAINT IF EXISTS triage_extractions_safety_prompt_versions_shape_check;

ALTER TABLE triage_extractions
  ADD CONSTRAINT triage_extractions_ingestion_mode_check CHECK
    (ingestion_mode IN ('single_pass','long_packet','legacy_unknown')),
  ADD CONSTRAINT triage_extractions_extraction_coverage_status_check CHECK
    (coverage_status IN ('complete','failed','not_applicable','legacy_unknown')),
  ADD CONSTRAINT triage_extractions_source_sha256_check CHECK
    (source_sha256 IS NULL OR source_sha256 ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT triage_extractions_source_pages_shape_check CHECK
    (jsonb_typeof(source_pages) = 'array'),
  ADD CONSTRAINT triage_extractions_safety_prompt_versions_shape_check CHECK
    (jsonb_typeof(safety_prompt_versions) = 'object');

-- JSONB count fields are validated defensively before the trigger compares or
-- casts them. This prevents a malformed model/audit payload from escaping the
-- fail-closed path through a cast error or a numeric string.
CREATE OR REPLACE FUNCTION triage_jsonb_nonnegative_integer(
  p_document jsonb,
  p_key text
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_text text;
BEGIN
  IF jsonb_typeof(p_document) <> 'object'
     OR jsonb_typeof(p_document -> p_key) <> 'number'
  THEN
    RETURN false;
  END IF;

  v_text := p_document ->> p_key;
  IF v_text !~ '^(0|[1-9][0-9]*)$' THEN
    RETURN false;
  END IF;

  RETURN v_text::numeric <= 9007199254740991;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_triage_extraction_provenance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_page_count integer;
  v_chunk_count integer;
  v_source_character_count numeric;
  v_covered_character_count numeric;
  v_uncovered_character_count numeric;
  v_expected_chunk_count numeric;
  v_scanned_chunk_count numeric;
  v_evaluation_count integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'triage extractions cannot be deleted';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.id IS DISTINCT FROM NEW.id
       OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
       OR OLD.text_input IS DISTINCT FROM NEW.text_input
       OR OLD.source_filename IS DISTINCT FROM NEW.source_filename
       OR OLD.patient_age IS DISTINCT FROM NEW.patient_age
       OR OLD.patient_sex IS DISTINCT FROM NEW.patient_sex
       OR OLD.ingestion_mode IS DISTINCT FROM NEW.ingestion_mode
       OR OLD.created_at IS DISTINCT FROM NEW.created_at
    THEN
      RAISE EXCEPTION 'triage extraction source and bindings are immutable';
    END IF;

    IF OLD.source_pages IS DISTINCT FROM NEW.source_pages
       OR OLD.source_sha256 IS DISTINCT FROM NEW.source_sha256
       OR OLD.packet_plan IS DISTINCT FROM NEW.packet_plan
    THEN
      -- A worker may atomically initialize all three provenance artifacts on
      -- a still-pending legacy-shaped row. Once any provenance exists, none of
      -- it can be replaced, cleared, or partially rewritten.
      IF NOT (
        OLD.status = 'pending'
        AND OLD.source_pages = '[]'::jsonb
        AND OLD.source_sha256 IS NULL
        AND OLD.packet_plan IS NULL
        AND jsonb_array_length(NEW.source_pages) > 0
        AND NEW.source_sha256 IS NOT NULL
        AND NEW.packet_plan IS NOT NULL
      ) THEN
        RAISE EXCEPTION 'triage extraction provenance is immutable after initialization';
      END IF;
    END IF;

    IF OLD.coverage_status = 'complete'
       AND OLD.coverage_report ->> 'status' = 'complete'
       AND triage_jsonb_nonnegative_integer(
         OLD.coverage_report,
         'uncoveredCharacterCount'
       )
       AND (OLD.coverage_report ->> 'uncoveredCharacterCount')::numeric = 0
       AND (
         NEW.coverage_status IS DISTINCT FROM OLD.coverage_status
         OR NEW.coverage_report IS DISTINCT FROM OLD.coverage_report
       )
    THEN
      RAISE EXCEPTION 'complete extraction coverage cannot be downgraded or rewritten';
    END IF;

    IF OLD.packet_emergency_result ->> 'status' = 'completed'
       AND triage_jsonb_nonnegative_integer(
         OLD.packet_emergency_result,
         'expectedChunkCount'
       )
       AND triage_jsonb_nonnegative_integer(
         OLD.packet_emergency_result,
         'scannedChunkCount'
       )
       AND (OLD.packet_emergency_result ->> 'expectedChunkCount')::numeric =
         (OLD.packet_emergency_result ->> 'scannedChunkCount')::numeric
       AND jsonb_typeof(
         OLD.packet_emergency_result -> 'chunkEvaluations'
       ) = 'array'
       AND jsonb_array_length(
         OLD.packet_emergency_result -> 'chunkEvaluations'
       ) = (OLD.packet_emergency_result ->> 'expectedChunkCount')::numeric
       AND NEW.packet_emergency_result IS DISTINCT FROM OLD.packet_emergency_result
    THEN
      RAISE EXCEPTION 'completed emergency scan evidence cannot be downgraded or rewritten';
    END IF;

    IF OLD.status = 'complete' AND NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'completed triage extractions are immutable';
    END IF;
  END IF;

  IF NEW.ingestion_mode = 'long_packet' AND NEW.status = 'complete' THEN
    IF jsonb_typeof(NEW.source_pages) <> 'array'
       OR jsonb_array_length(NEW.source_pages) = 0
       OR EXISTS (
         SELECT 1
           FROM jsonb_array_elements(NEW.source_pages) AS source_page(page)
          WHERE jsonb_typeof(source_page.page) <> 'object'
             OR coalesce(length(trim(source_page.page ->> 'documentId')), 0) = 0
             OR NOT triage_jsonb_nonnegative_integer(source_page.page, 'pageNumber')
             OR (source_page.page ->> 'pageNumber')::numeric < 1
             OR coalesce(length(source_page.page ->> 'text'), 0) = 0
       )
       OR EXISTS (
         SELECT 1
           FROM jsonb_array_elements(NEW.source_pages) AS source_page(page)
          GROUP BY source_page.page ->> 'documentId', source_page.page ->> 'pageNumber'
         HAVING count(*) > 1
       )
    THEN
      RAISE EXCEPTION 'long-packet extraction requires source pages';
    END IF;
    v_page_count := jsonb_array_length(NEW.source_pages);

    IF NEW.source_sha256 IS NULL THEN
      RAISE EXCEPTION 'long-packet extraction requires a source digest';
    END IF;

    IF jsonb_typeof(NEW.packet_plan) <> 'object'
       OR coalesce(length(trim(NEW.packet_plan ->> 'version')), 0) = 0
       OR jsonb_typeof(NEW.packet_plan -> 'chunks') <> 'array'
       OR jsonb_array_length(NEW.packet_plan -> 'chunks') = 0
       OR jsonb_typeof(NEW.packet_plan -> 'coverage') <> 'object'
       OR EXISTS (
         SELECT 1
           FROM jsonb_array_elements(NEW.packet_plan -> 'chunks') AS packet_chunk(chunk)
          WHERE jsonb_typeof(packet_chunk.chunk) <> 'object'
             OR coalesce(length(trim(packet_chunk.chunk ->> 'id')), 0) = 0
       )
       OR EXISTS (
         SELECT 1
           FROM jsonb_array_elements(NEW.packet_plan -> 'chunks') AS packet_chunk(chunk)
          GROUP BY packet_chunk.chunk ->> 'id'
         HAVING count(*) > 1
       )
    THEN
      RAISE EXCEPTION 'long-packet extraction requires a packet plan';
    END IF;
    v_chunk_count := jsonb_array_length(NEW.packet_plan -> 'chunks');

    IF NEW.coverage_status <> 'complete'
       OR jsonb_typeof(NEW.coverage_report) <> 'object'
       OR NEW.coverage_report ->> 'status' <> 'complete'
       OR NOT triage_jsonb_nonnegative_integer(
         NEW.coverage_report,
         'sourceCharacterCount'
       )
       OR NOT triage_jsonb_nonnegative_integer(
         NEW.coverage_report,
         'coveredCharacterCount'
       )
       OR NOT triage_jsonb_nonnegative_integer(
         NEW.coverage_report,
         'uncoveredCharacterCount'
       )
       OR NOT triage_jsonb_nonnegative_integer(NEW.coverage_report, 'pageCount')
       OR NOT triage_jsonb_nonnegative_integer(NEW.coverage_report, 'chunkCount')
       OR NEW.packet_plan -> 'coverage' ->> 'status' <> 'complete'
       OR NOT triage_jsonb_nonnegative_integer(
         NEW.packet_plan -> 'coverage',
         'sourceCharacterCount'
       )
       OR NOT triage_jsonb_nonnegative_integer(
         NEW.packet_plan -> 'coverage',
         'coveredCharacterCount'
       )
       OR NOT triage_jsonb_nonnegative_integer(
         NEW.packet_plan -> 'coverage',
         'uncoveredCharacterCount'
       )
       OR NOT triage_jsonb_nonnegative_integer(
         NEW.packet_plan -> 'coverage',
         'pageCount'
       )
       OR NOT triage_jsonb_nonnegative_integer(
         NEW.packet_plan -> 'coverage',
         'chunkCount'
       )
    THEN
      RAISE EXCEPTION 'long-packet extraction cannot complete without zero uncovered characters';
    END IF;

    v_source_character_count :=
      (NEW.coverage_report ->> 'sourceCharacterCount')::numeric;
    v_covered_character_count :=
      (NEW.coverage_report ->> 'coveredCharacterCount')::numeric;
    v_uncovered_character_count :=
      (NEW.coverage_report ->> 'uncoveredCharacterCount')::numeric;

    IF v_source_character_count < 1
       OR v_covered_character_count <> v_source_character_count
       OR v_uncovered_character_count <> 0
       OR (NEW.coverage_report ->> 'pageCount')::numeric <> v_page_count
       OR (NEW.coverage_report ->> 'chunkCount')::numeric <> v_chunk_count
       OR (NEW.packet_plan -> 'coverage' ->> 'sourceCharacterCount')::numeric < 1
       OR (NEW.packet_plan -> 'coverage' ->> 'coveredCharacterCount')::numeric <>
         (NEW.packet_plan -> 'coverage' ->> 'sourceCharacterCount')::numeric
       OR (NEW.packet_plan -> 'coverage' ->> 'uncoveredCharacterCount')::numeric <> 0
       OR (NEW.packet_plan -> 'coverage' ->> 'pageCount')::numeric <> v_page_count
       OR (NEW.packet_plan -> 'coverage' ->> 'chunkCount')::numeric <> v_chunk_count
       OR (NEW.packet_plan -> 'coverage' ->> 'sourceCharacterCount')::numeric <>
         v_source_character_count
       OR (NEW.packet_plan -> 'coverage' ->> 'coveredCharacterCount')::numeric <>
         v_covered_character_count
    THEN
      RAISE EXCEPTION 'long-packet extraction cannot complete without zero uncovered characters';
    END IF;

    IF jsonb_typeof(NEW.packet_emergency_result) <> 'object'
       OR NEW.packet_emergency_result ->> 'status' <> 'completed'
       OR NOT triage_jsonb_nonnegative_integer(
         NEW.packet_emergency_result,
         'expectedChunkCount'
       )
       OR NOT triage_jsonb_nonnegative_integer(
         NEW.packet_emergency_result,
         'scannedChunkCount'
       )
       OR jsonb_typeof(
         NEW.packet_emergency_result -> 'chunkEvaluations'
       ) <> 'array'
    THEN
      RAISE EXCEPTION 'long-packet extraction cannot complete before every planned chunk is emergency screened';
    END IF;

    v_expected_chunk_count :=
      (NEW.packet_emergency_result ->> 'expectedChunkCount')::numeric;
    v_scanned_chunk_count :=
      (NEW.packet_emergency_result ->> 'scannedChunkCount')::numeric;
    v_evaluation_count := jsonb_array_length(
      NEW.packet_emergency_result -> 'chunkEvaluations'
    );

    IF v_expected_chunk_count <> v_chunk_count
       OR v_scanned_chunk_count <> v_expected_chunk_count
       OR v_evaluation_count <> v_expected_chunk_count
       OR EXISTS (
         SELECT 1
           FROM jsonb_array_elements(
             NEW.packet_emergency_result -> 'chunkEvaluations'
           ) AS emergency_evaluation(evaluation)
          WHERE jsonb_typeof(emergency_evaluation.evaluation) <> 'object'
             OR coalesce(
               length(trim(emergency_evaluation.evaluation ->> 'chunkId')),
               0
             ) = 0
       )
       OR EXISTS (
         SELECT 1
           FROM jsonb_array_elements(
             NEW.packet_emergency_result -> 'chunkEvaluations'
           ) AS emergency_evaluation(evaluation)
          GROUP BY emergency_evaluation.evaluation ->> 'chunkId'
         HAVING count(*) > 1
       )
       OR EXISTS (
         SELECT 1
           FROM jsonb_array_elements(NEW.packet_plan -> 'chunks') AS packet_chunk(chunk)
          WHERE NOT EXISTS (
            SELECT 1
              FROM jsonb_array_elements(
                NEW.packet_emergency_result -> 'chunkEvaluations'
              ) AS emergency_evaluation(evaluation)
             WHERE emergency_evaluation.evaluation ->> 'chunkId' =
               packet_chunk.chunk ->> 'id'
          )
       )
    THEN
      RAISE EXCEPTION 'long-packet extraction cannot complete before every planned chunk is emergency screened';
    END IF;

    IF jsonb_typeof(NEW.model_map_result) <> 'object'
       OR NEW.model_map_result ->> 'status' <> 'complete'
       OR NOT triage_jsonb_nonnegative_integer(
         NEW.model_map_result,
         'expectedChunkCount'
       )
       OR NOT triage_jsonb_nonnegative_integer(
         NEW.model_map_result,
         'completedChunkCount'
       )
       OR (NEW.model_map_result ->> 'expectedChunkCount')::numeric <> v_chunk_count
       OR (NEW.model_map_result ->> 'completedChunkCount')::numeric <> v_chunk_count
    THEN
      RAISE EXCEPTION 'long-packet extraction cannot complete before every planned chunk has model map evidence';
    END IF;

    IF jsonb_typeof(NEW.model_reduce_result) <> 'object'
       OR NEW.model_reduce_result ->> 'status' <> 'completed'
       OR NEW.model_reduce_result ->> 'coverageStatus' <> 'complete'
       OR jsonb_typeof(NEW.model_reduce_result -> 'mapperCoverage') <> 'object'
       OR NEW.model_reduce_result -> 'mapperCoverage' ->> 'status' <> 'complete'
       OR NOT triage_jsonb_nonnegative_integer(
         NEW.model_reduce_result -> 'mapperCoverage',
         'expectedChunkCount'
       )
       OR NOT triage_jsonb_nonnegative_integer(
         NEW.model_reduce_result -> 'mapperCoverage',
         'completedChunkCount'
       )
       OR (NEW.model_reduce_result -> 'mapperCoverage' ->> 'expectedChunkCount')::numeric <> v_chunk_count
       OR (NEW.model_reduce_result -> 'mapperCoverage' ->> 'completedChunkCount')::numeric <> v_chunk_count
       OR jsonb_typeof(NEW.model_reduce_result -> 'safetyCoverage') <> 'object'
       OR NEW.model_reduce_result -> 'safetyCoverage' ->> 'status' <> 'complete'
       OR NOT triage_jsonb_nonnegative_integer(
         NEW.model_reduce_result -> 'safetyCoverage',
         'expectedChunkCount'
       )
       OR NOT triage_jsonb_nonnegative_integer(
         NEW.model_reduce_result -> 'safetyCoverage',
         'completedChunkCount'
       )
       OR (NEW.model_reduce_result -> 'safetyCoverage' ->> 'expectedChunkCount')::numeric <> v_chunk_count
       OR (NEW.model_reduce_result -> 'safetyCoverage' ->> 'completedChunkCount')::numeric <> v_chunk_count
       OR jsonb_typeof(NEW.model_reduce_result -> 'mapperOutcomes') <> 'array'
       OR jsonb_array_length(NEW.model_reduce_result -> 'mapperOutcomes') <> v_chunk_count
       OR jsonb_typeof(NEW.model_reduce_result -> 'safetyOutcomes') <> 'array'
       OR jsonb_array_length(NEW.model_reduce_result -> 'safetyOutcomes') <> v_chunk_count
       OR EXISTS (
         SELECT 1
           FROM jsonb_array_elements(
             NEW.model_reduce_result -> 'mapperOutcomes'
           ) AS mapper_outcome(outcome)
          WHERE jsonb_typeof(mapper_outcome.outcome) <> 'object'
             OR mapper_outcome.outcome ->> 'branch' <> 'clinical_mapper'
             OR mapper_outcome.outcome ->> 'status' <> 'completed'
             OR jsonb_typeof(mapper_outcome.outcome -> 'result') <> 'object'
       )
       OR EXISTS (
         SELECT 1
           FROM jsonb_array_elements(
             NEW.model_reduce_result -> 'safetyOutcomes'
           ) AS safety_outcome(outcome)
          WHERE jsonb_typeof(safety_outcome.outcome) <> 'object'
             OR safety_outcome.outcome ->> 'branch' <> 'safety_extractor'
             OR safety_outcome.outcome ->> 'status' <> 'completed'
             OR jsonb_typeof(safety_outcome.outcome -> 'result') <> 'object'
       )
       OR EXISTS (
         SELECT 1
           FROM jsonb_array_elements(NEW.packet_plan -> 'chunks') AS packet_chunk(chunk)
          WHERE NOT EXISTS (
            SELECT 1
              FROM jsonb_array_elements(
                NEW.model_reduce_result -> 'mapperOutcomes'
              ) AS mapper_outcome(outcome)
             WHERE mapper_outcome.outcome ->> 'chunkId' = packet_chunk.chunk ->> 'id'
          )
             OR NOT EXISTS (
               SELECT 1
                 FROM jsonb_array_elements(
                   NEW.model_reduce_result -> 'safetyOutcomes'
                 ) AS safety_outcome(outcome)
                WHERE safety_outcome.outcome ->> 'chunkId' = packet_chunk.chunk ->> 'id'
             )
       )
       OR (
         SELECT count(DISTINCT mapper_outcome.outcome ->> 'chunkId')
           FROM jsonb_array_elements(
             NEW.model_reduce_result -> 'mapperOutcomes'
           ) AS mapper_outcome(outcome)
       ) <> v_chunk_count
       OR (
         SELECT count(DISTINCT safety_outcome.outcome ->> 'chunkId')
           FROM jsonb_array_elements(
             NEW.model_reduce_result -> 'safetyOutcomes'
           ) AS safety_outcome(outcome)
       ) <> v_chunk_count
    THEN
      RAISE EXCEPTION 'long-packet extraction cannot complete without a completed model reduction';
    END IF;

    IF NEW.safety_screened_at IS NULL
       OR jsonb_typeof(NEW.safety_prompt_versions) <> 'object'
       OR NEW.safety_prompt_versions = '{}'::jsonb
    THEN
      RAISE EXCEPTION 'long-packet extraction cannot complete without safety prompt-version evidence';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS triage_extraction_provenance_guard
  ON triage_extractions;
CREATE TRIGGER triage_extraction_provenance_guard
BEFORE INSERT OR UPDATE OR DELETE ON triage_extractions
FOR EACH ROW EXECUTE FUNCTION enforce_triage_extraction_provenance();

CREATE INDEX IF NOT EXISTS idx_triage_extractions_tenant_status_coverage_created
  ON triage_extractions (tenant_id, status, coverage_status, created_at DESC);
