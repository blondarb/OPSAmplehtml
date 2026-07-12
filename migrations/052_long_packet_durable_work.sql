-- Migration 052: durable, versioned long-packet model work.
--
-- A run is idempotent for one extraction + complete configuration digest.
-- Different configurations intentionally create separate immutable runs for
-- reprocessing and shadow comparison. Chunk/finalization outcomes are leased
-- with opaque UUID tokens so stale workers cannot publish after a reclaim.
--
-- packet_plan_sha256 is computed by application code over its versioned,
-- canonical plan representation. PostgreSQL enforces format, immutability,
-- and agreement across extraction/run/jobs; it does not independently
-- reproduce application JSON canonicalization.

ALTER TABLE triage_extractions
  ADD COLUMN IF NOT EXISTS packet_plan_sha256 text;

ALTER TABLE triage_extractions
  DROP CONSTRAINT IF EXISTS triage_extractions_packet_plan_sha256_check;
ALTER TABLE triage_extractions
  ADD CONSTRAINT triage_extractions_packet_plan_sha256_check CHECK (
    packet_plan_sha256 IS NULL
    OR packet_plan_sha256 ~ '^[0-9a-f]{64}$'
  );

CREATE OR REPLACE FUNCTION enforce_triage_extraction_plan_digest()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.packet_plan_sha256 IS NOT NULL
     AND NEW.packet_plan_sha256 IS DISTINCT FROM OLD.packet_plan_sha256
  THEN
    RAISE EXCEPTION 'triage extraction plan digest is immutable once set';
  END IF;

  IF NEW.packet_plan_sha256 IS NOT NULL
     AND (
       NEW.ingestion_mode <> 'long_packet'
       OR jsonb_typeof(NEW.packet_plan) <> 'object'
     )
  THEN
    RAISE EXCEPTION 'triage extraction plan digest requires a long-packet plan';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS triage_extraction_plan_digest_guard
  ON triage_extractions;
CREATE TRIGGER triage_extraction_plan_digest_guard
BEFORE INSERT OR UPDATE OR DELETE ON triage_extractions
FOR EACH ROW EXECUTE FUNCTION enforce_triage_extraction_plan_digest();

CREATE TABLE IF NOT EXISTS triage_long_packet_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  extraction_id uuid NOT NULL REFERENCES triage_extractions(id) ON DELETE RESTRICT,
  tenant_id text NOT NULL,
  configuration_sha256 text NOT NULL CHECK
    (configuration_sha256 ~ '^[0-9a-f]{64}$'),
  run_purpose text NOT NULL CHECK
    (run_purpose IN ('primary','shadow','reprocess')),
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  plan_sha256 text NOT NULL CHECK (plan_sha256 ~ '^[0-9a-f]{64}$'),
  expected_chunk_count integer NOT NULL CHECK (expected_chunk_count > 0),
  planner_version text NOT NULL CHECK (length(trim(planner_version)) > 0),
  pipeline_version text NOT NULL CHECK (length(trim(pipeline_version)) > 0),
  mapper_model_id text NOT NULL CHECK (length(trim(mapper_model_id)) > 0),
  mapper_prompt_version text NOT NULL CHECK
    (length(trim(mapper_prompt_version)) > 0),
  safety_model_id text NOT NULL CHECK (length(trim(safety_model_id)) > 0),
  safety_prompt_version text NOT NULL CHECK
    (length(trim(safety_prompt_version)) > 0),
  reducer_model_id text NOT NULL CHECK (length(trim(reducer_model_id)) > 0),
  reducer_prompt_version text NOT NULL CHECK
    (length(trim(reducer_prompt_version)) > 0),
  status text NOT NULL DEFAULT 'pending' CHECK
    (status IN ('pending','running','complete','failed')),
  started_at timestamptz,
  completed_at timestamptz,
  last_error_code text CHECK (
    last_error_code IS NULL OR last_error_code ~ '^[a-z0-9_:-]{1,100}$'
  ),
  last_error_detail text CHECK (
    last_error_detail IS NULL OR length(last_error_detail) BETWEEN 1 AND 4000
  ),
  last_failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (extraction_id, configuration_sha256),
  UNIQUE (id, tenant_id),
  CHECK (
    (last_error_code IS NULL AND last_error_detail IS NULL AND last_failed_at IS NULL)
    OR (last_error_code IS NOT NULL AND last_error_detail IS NOT NULL AND last_failed_at IS NOT NULL)
  ),
  CHECK (
    (status = 'pending' AND started_at IS NULL AND completed_at IS NULL
      AND last_error_code IS NULL)
    OR (status = 'running' AND started_at IS NOT NULL AND completed_at IS NULL)
    OR (status = 'failed' AND started_at IS NOT NULL AND completed_at IS NULL
      AND last_error_code IS NOT NULL)
    OR (status = 'complete' AND started_at IS NOT NULL AND completed_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS triage_long_packet_chunk_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  tenant_id text NOT NULL,
  chunk_id text NOT NULL CHECK (length(trim(chunk_id)) BETWEEN 1 AND 500),
  branch text NOT NULL CHECK (branch IN ('mapper','safety')),
  configuration_sha256 text NOT NULL CHECK
    (configuration_sha256 ~ '^[0-9a-f]{64}$'),
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  plan_sha256 text NOT NULL CHECK (plan_sha256 ~ '^[0-9a-f]{64}$'),
  planner_version text NOT NULL CHECK (length(trim(planner_version)) > 0),
  pipeline_version text NOT NULL CHECK (length(trim(pipeline_version)) > 0),
  chunk_provenance_sha256 text NOT NULL CHECK
    (chunk_provenance_sha256 ~ '^[0-9a-f]{64}$'),
  model_id text NOT NULL CHECK (length(trim(model_id)) > 0),
  prompt_version text NOT NULL CHECK (length(trim(prompt_version)) > 0),
  status text NOT NULL DEFAULT 'pending' CHECK
    (status IN ('pending','leased','complete','failed')),
  max_attempts integer NOT NULL DEFAULT 3 CHECK
    (max_attempts BETWEEN 1 AND 20),
  attempt_count integer NOT NULL DEFAULT 0 CHECK
    (attempt_count BETWEEN 0 AND max_attempts),
  next_retry_at timestamptz,
  lease_token uuid,
  lease_owner text CHECK (
    lease_owner IS NULL OR length(trim(lease_owner)) BETWEEN 1 AND 200
  ),
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  outcome_lease_token uuid,
  result jsonb,
  result_sha256 text CHECK (
    result_sha256 IS NULL OR result_sha256 ~ '^[0-9a-f]{64}$'
  ),
  last_error_code text CHECK (
    last_error_code IS NULL OR last_error_code ~ '^[a-z0-9_:-]{1,100}$'
  ),
  last_error_detail text CHECK (
    last_error_detail IS NULL OR length(last_error_detail) BETWEEN 1 AND 4000
  ),
  last_error_at timestamptz,
  last_error_lease_token uuid,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (run_id, tenant_id)
    REFERENCES triage_long_packet_runs(id, tenant_id) ON DELETE RESTRICT,
  UNIQUE (run_id, chunk_id, branch),
  CHECK (
    (last_error_code IS NULL AND last_error_detail IS NULL
      AND last_error_at IS NULL AND last_error_lease_token IS NULL)
    OR (last_error_code IS NOT NULL AND last_error_detail IS NOT NULL
      AND last_error_at IS NOT NULL AND last_error_lease_token IS NOT NULL)
  ),
  CHECK (
    (status = 'pending'
      AND lease_token IS NULL AND lease_owner IS NULL
      AND claimed_at IS NULL AND lease_expires_at IS NULL
      AND outcome_lease_token IS NULL AND result IS NULL
      AND result_sha256 IS NULL AND finished_at IS NULL
      AND next_retry_at IS NULL)
    OR (status = 'leased'
      AND lease_token IS NOT NULL AND lease_owner IS NOT NULL
      AND claimed_at IS NOT NULL AND lease_expires_at > claimed_at
      AND outcome_lease_token IS NULL AND result IS NULL
      AND result_sha256 IS NULL AND finished_at IS NULL
      AND next_retry_at IS NULL AND attempt_count > 0)
    OR (status = 'complete'
      AND lease_token IS NULL AND lease_owner IS NULL
      AND claimed_at IS NULL AND lease_expires_at IS NULL
      AND outcome_lease_token IS NOT NULL
      AND jsonb_typeof(result) = 'object'
      AND result_sha256 IS NOT NULL AND finished_at IS NOT NULL
      AND next_retry_at IS NULL)
    OR (status = 'failed'
      AND lease_token IS NULL AND lease_owner IS NULL
      AND claimed_at IS NULL AND lease_expires_at IS NULL
      AND outcome_lease_token IS NOT NULL
      AND result IS NULL AND result_sha256 IS NULL
      AND last_error_code IS NOT NULL AND finished_at IS NOT NULL
      AND (next_retry_at IS NULL OR attempt_count < max_attempts))
  )
);

CREATE TABLE IF NOT EXISTS triage_long_packet_finalization_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL UNIQUE,
  tenant_id text NOT NULL,
  configuration_sha256 text NOT NULL CHECK
    (configuration_sha256 ~ '^[0-9a-f]{64}$'),
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  plan_sha256 text NOT NULL CHECK (plan_sha256 ~ '^[0-9a-f]{64}$'),
  planner_version text NOT NULL CHECK (length(trim(planner_version)) > 0),
  pipeline_version text NOT NULL CHECK (length(trim(pipeline_version)) > 0),
  expected_chunk_count integer NOT NULL CHECK (expected_chunk_count > 0),
  model_id text NOT NULL CHECK (length(trim(model_id)) > 0),
  prompt_version text NOT NULL CHECK (length(trim(prompt_version)) > 0),
  status text NOT NULL DEFAULT 'pending' CHECK
    (status IN ('pending','leased','complete','failed')),
  max_attempts integer NOT NULL DEFAULT 3 CHECK
    (max_attempts BETWEEN 1 AND 20),
  attempt_count integer NOT NULL DEFAULT 0 CHECK
    (attempt_count BETWEEN 0 AND max_attempts),
  next_retry_at timestamptz,
  lease_token uuid,
  lease_owner text CHECK (
    lease_owner IS NULL OR length(trim(lease_owner)) BETWEEN 1 AND 200
  ),
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  outcome_lease_token uuid,
  result jsonb,
  result_sha256 text CHECK (
    result_sha256 IS NULL OR result_sha256 ~ '^[0-9a-f]{64}$'
  ),
  last_error_code text CHECK (
    last_error_code IS NULL OR last_error_code ~ '^[a-z0-9_:-]{1,100}$'
  ),
  last_error_detail text CHECK (
    last_error_detail IS NULL OR length(last_error_detail) BETWEEN 1 AND 4000
  ),
  last_error_at timestamptz,
  last_error_lease_token uuid,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (run_id, tenant_id)
    REFERENCES triage_long_packet_runs(id, tenant_id) ON DELETE RESTRICT,
  CHECK (
    (last_error_code IS NULL AND last_error_detail IS NULL
      AND last_error_at IS NULL AND last_error_lease_token IS NULL)
    OR (last_error_code IS NOT NULL AND last_error_detail IS NOT NULL
      AND last_error_at IS NOT NULL AND last_error_lease_token IS NOT NULL)
  ),
  CHECK (
    (status = 'pending'
      AND lease_token IS NULL AND lease_owner IS NULL
      AND claimed_at IS NULL AND lease_expires_at IS NULL
      AND outcome_lease_token IS NULL AND result IS NULL
      AND result_sha256 IS NULL AND finished_at IS NULL
      AND next_retry_at IS NULL)
    OR (status = 'leased'
      AND lease_token IS NOT NULL AND lease_owner IS NOT NULL
      AND claimed_at IS NOT NULL AND lease_expires_at > claimed_at
      AND outcome_lease_token IS NULL AND result IS NULL
      AND result_sha256 IS NULL AND finished_at IS NULL
      AND next_retry_at IS NULL AND attempt_count > 0)
    OR (status = 'complete'
      AND lease_token IS NULL AND lease_owner IS NULL
      AND claimed_at IS NULL AND lease_expires_at IS NULL
      AND outcome_lease_token IS NOT NULL
      AND jsonb_typeof(result) = 'object'
      AND result_sha256 IS NOT NULL AND finished_at IS NOT NULL
      AND next_retry_at IS NULL)
    OR (status = 'failed'
      AND lease_token IS NULL AND lease_owner IS NULL
      AND claimed_at IS NULL AND lease_expires_at IS NULL
      AND outcome_lease_token IS NOT NULL
      AND result IS NULL AND result_sha256 IS NULL
      AND last_error_code IS NOT NULL AND finished_at IS NOT NULL
      AND (next_retry_at IS NULL OR attempt_count < max_attempts))
  )
);

-- Shared lease/outcome state machine. Both durable job tables deliberately use
-- identical lifecycle column names so one trigger can enforce the same stale-
-- worker and retry contract.
CREATE OR REPLACE FUNCTION enforce_long_packet_job_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'long-packet durable jobs cannot be deleted';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending'
       OR NEW.attempt_count <> 0
       OR NEW.lease_token IS NOT NULL
       OR NEW.result IS NOT NULL
       OR NEW.outcome_lease_token IS NOT NULL
       OR NEW.last_error_code IS NOT NULL
    THEN
      RAISE EXCEPTION 'new long-packet jobs must start pristine and pending';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'complete' THEN
    RAISE EXCEPTION 'completed long-packet job outcomes are immutable';
  END IF;

  IF NEW.attempt_count < OLD.attempt_count THEN
    RAISE EXCEPTION 'long-packet job attempt count cannot decrease';
  END IF;

  IF OLD.status = NEW.status THEN
    IF OLD.status <> 'leased' THEN
      RAISE EXCEPTION 'invalid long-packet job status transition';
    END IF;
    IF OLD.lease_expires_at > v_now THEN
      RAISE EXCEPTION 'active long-packet job lease cannot be replaced';
    END IF;
    IF OLD.attempt_count >= OLD.max_attempts
       OR NEW.attempt_count <> OLD.attempt_count + 1
    THEN
      RAISE EXCEPTION 'long-packet job retry limit has been reached';
    END IF;
    IF NEW.lease_token IS NULL
       OR NEW.lease_token = OLD.lease_token
       OR coalesce(length(trim(NEW.lease_owner)), 0) = 0
       OR NEW.claimed_at IS NULL
       OR NEW.lease_expires_at <= NEW.claimed_at
       OR NEW.outcome_lease_token IS NOT NULL
       OR NEW.result IS NOT NULL
       OR NEW.result_sha256 IS NOT NULL
       OR NEW.finished_at IS NOT NULL
       OR NEW.next_retry_at IS NOT NULL
    THEN
      RAISE EXCEPTION 'invalid reclaimed long-packet job lease';
    END IF;
    IF NEW.last_error_code IS DISTINCT FROM OLD.last_error_code
       OR NEW.last_error_detail IS DISTINCT FROM OLD.last_error_detail
       OR NEW.last_error_at IS DISTINCT FROM OLD.last_error_at
       OR NEW.last_error_lease_token IS DISTINCT FROM OLD.last_error_lease_token
    THEN
      RAISE EXCEPTION 'long-packet job error evidence is immutable between attempts';
    END IF;
  ELSIF NEW.status = 'leased'
        AND OLD.status IN ('pending','failed')
  THEN
    IF OLD.attempt_count >= OLD.max_attempts
       OR NEW.attempt_count <> OLD.attempt_count + 1
    THEN
      RAISE EXCEPTION 'long-packet job retry limit has been reached';
    END IF;
    IF OLD.status = 'failed'
       AND OLD.next_retry_at IS NOT NULL
       AND OLD.next_retry_at > v_now
    THEN
      RAISE EXCEPTION 'long-packet job retry is not due';
    END IF;
    IF NEW.lease_token IS NULL
       OR coalesce(length(trim(NEW.lease_owner)), 0) = 0
       OR NEW.claimed_at IS NULL
       OR NEW.lease_expires_at <= NEW.claimed_at
       OR NEW.outcome_lease_token IS NOT NULL
       OR NEW.result IS NOT NULL
       OR NEW.result_sha256 IS NOT NULL
       OR NEW.finished_at IS NOT NULL
       OR NEW.next_retry_at IS NOT NULL
    THEN
      RAISE EXCEPTION 'invalid long-packet job lease claim';
    END IF;
    IF OLD.status = 'failed' AND (
      NEW.last_error_code IS DISTINCT FROM OLD.last_error_code
      OR NEW.last_error_detail IS DISTINCT FROM OLD.last_error_detail
      OR NEW.last_error_at IS DISTINCT FROM OLD.last_error_at
      OR NEW.last_error_lease_token IS DISTINCT FROM OLD.last_error_lease_token
    ) THEN
      RAISE EXCEPTION 'long-packet job error evidence is immutable between attempts';
    END IF;
  ELSIF OLD.status = 'leased'
        AND NEW.status IN ('complete','failed')
  THEN
    IF OLD.lease_expires_at <= v_now THEN
      RAISE EXCEPTION 'long-packet job lease is expired or stale';
    END IF;
    IF NEW.outcome_lease_token IS DISTINCT FROM OLD.lease_token THEN
      RAISE EXCEPTION 'long-packet job outcome lease token is stale';
    END IF;
    IF NEW.lease_token IS NOT NULL
       OR NEW.lease_owner IS NOT NULL
       OR NEW.claimed_at IS NOT NULL
       OR NEW.lease_expires_at IS NOT NULL
    THEN
      RAISE EXCEPTION 'long-packet job outcome must clear its lease';
    END IF;

    IF NEW.status = 'complete' THEN
      IF jsonb_typeof(NEW.result) <> 'object'
         OR NEW.result_sha256 IS NULL
         OR NEW.finished_at IS NULL
         OR NEW.next_retry_at IS NOT NULL
      THEN
        RAISE EXCEPTION 'completed long-packet job requires result evidence';
      END IF;
      IF OLD.last_error_code IS NOT NULL AND (
        NEW.last_error_code IS DISTINCT FROM OLD.last_error_code
        OR NEW.last_error_detail IS DISTINCT FROM OLD.last_error_detail
        OR NEW.last_error_at IS DISTINCT FROM OLD.last_error_at
        OR NEW.last_error_lease_token IS DISTINCT FROM OLD.last_error_lease_token
      ) THEN
        RAISE EXCEPTION 'long-packet job error evidence is immutable after retry';
      END IF;
    ELSE
      IF NEW.result IS NOT NULL
         OR NEW.result_sha256 IS NOT NULL
         OR NEW.finished_at IS NULL
         OR NEW.last_error_code IS NULL
         OR NEW.last_error_detail IS NULL
         OR NEW.last_error_at IS NULL
         OR NEW.last_error_lease_token IS DISTINCT FROM OLD.lease_token
         OR (
           NEW.attempt_count >= NEW.max_attempts
           AND NEW.next_retry_at IS NOT NULL
         )
      THEN
        RAISE EXCEPTION 'failed long-packet job requires bounded error evidence';
      END IF;
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid long-packet job status transition';
  END IF;

  NEW.updated_at := v_now;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_long_packet_chunk_job_binding()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_run record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND (
    OLD.id IS DISTINCT FROM NEW.id
    OR OLD.run_id IS DISTINCT FROM NEW.run_id
    OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
    OR OLD.chunk_id IS DISTINCT FROM NEW.chunk_id
    OR OLD.branch IS DISTINCT FROM NEW.branch
    OR OLD.configuration_sha256 IS DISTINCT FROM NEW.configuration_sha256
    OR OLD.source_sha256 IS DISTINCT FROM NEW.source_sha256
    OR OLD.plan_sha256 IS DISTINCT FROM NEW.plan_sha256
    OR OLD.planner_version IS DISTINCT FROM NEW.planner_version
    OR OLD.pipeline_version IS DISTINCT FROM NEW.pipeline_version
    OR OLD.chunk_provenance_sha256 IS DISTINCT FROM NEW.chunk_provenance_sha256
    OR OLD.model_id IS DISTINCT FROM NEW.model_id
    OR OLD.prompt_version IS DISTINCT FROM NEW.prompt_version
    OR OLD.max_attempts IS DISTINCT FROM NEW.max_attempts
    OR OLD.created_at IS DISTINCT FROM NEW.created_at
  ) THEN
    RAISE EXCEPTION 'long-packet chunk job provenance is immutable';
  END IF;

  SELECT run.*, extraction.packet_plan AS bound_packet_plan
    INTO v_run
    FROM triage_long_packet_runs run
    JOIN triage_extractions extraction
      ON extraction.id = run.extraction_id
   WHERE run.id = NEW.run_id
     AND run.tenant_id = NEW.tenant_id;

  IF NOT FOUND
     OR v_run.configuration_sha256 <> NEW.configuration_sha256
     OR v_run.source_sha256 <> NEW.source_sha256
     OR v_run.plan_sha256 <> NEW.plan_sha256
     OR v_run.planner_version <> NEW.planner_version
     OR v_run.pipeline_version <> NEW.pipeline_version
  THEN
    RAISE EXCEPTION 'long-packet chunk job run binding is invalid';
  END IF;

  IF TG_OP = 'INSERT' AND v_run.status <> 'pending' THEN
    RAISE EXCEPTION 'long-packet chunk jobs must be manifested before run start';
  ELSIF TG_OP = 'UPDATE'
        AND v_run.status <> 'running'
        AND NOT (
          v_run.status = 'failed'
          AND OLD.status = 'leased'
          AND NEW.status = 'failed'
        )
  THEN
    RAISE EXCEPTION 'long-packet chunk jobs require a running run';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM jsonb_array_elements(v_run.bound_packet_plan -> 'chunks') AS planned(chunk)
     WHERE planned.chunk ->> 'id' = NEW.chunk_id
       AND planned.chunk ->> 'provenanceSha256' = NEW.chunk_provenance_sha256
  ) THEN
    RAISE EXCEPTION 'long-packet chunk provenance is invalid';
  END IF;

  IF (
    NEW.branch = 'mapper'
    AND (
      NEW.model_id <> v_run.mapper_model_id
      OR NEW.prompt_version <> v_run.mapper_prompt_version
    )
  ) OR (
    NEW.branch = 'safety'
    AND (
      NEW.model_id <> v_run.safety_model_id
      OR NEW.prompt_version <> v_run.safety_prompt_version
    )
  ) THEN
    RAISE EXCEPTION 'long-packet chunk model and prompt provenance is invalid';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_long_packet_finalization_binding()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_run triage_long_packet_runs%ROWTYPE;
  v_mapper_complete integer;
  v_safety_complete integer;
  v_total integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND (
    OLD.id IS DISTINCT FROM NEW.id
    OR OLD.run_id IS DISTINCT FROM NEW.run_id
    OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
    OR OLD.configuration_sha256 IS DISTINCT FROM NEW.configuration_sha256
    OR OLD.source_sha256 IS DISTINCT FROM NEW.source_sha256
    OR OLD.plan_sha256 IS DISTINCT FROM NEW.plan_sha256
    OR OLD.planner_version IS DISTINCT FROM NEW.planner_version
    OR OLD.pipeline_version IS DISTINCT FROM NEW.pipeline_version
    OR OLD.expected_chunk_count IS DISTINCT FROM NEW.expected_chunk_count
    OR OLD.model_id IS DISTINCT FROM NEW.model_id
    OR OLD.prompt_version IS DISTINCT FROM NEW.prompt_version
    OR OLD.max_attempts IS DISTINCT FROM NEW.max_attempts
    OR OLD.created_at IS DISTINCT FROM NEW.created_at
  ) THEN
    RAISE EXCEPTION 'long-packet finalization job provenance is immutable';
  END IF;

  SELECT * INTO v_run
    FROM triage_long_packet_runs run
   WHERE run.id = NEW.run_id
     AND run.tenant_id = NEW.tenant_id;

  IF NOT FOUND
     OR v_run.configuration_sha256 <> NEW.configuration_sha256
     OR v_run.source_sha256 <> NEW.source_sha256
     OR v_run.plan_sha256 <> NEW.plan_sha256
     OR v_run.planner_version <> NEW.planner_version
     OR v_run.pipeline_version <> NEW.pipeline_version
     OR v_run.expected_chunk_count <> NEW.expected_chunk_count
     OR v_run.reducer_model_id <> NEW.model_id
     OR v_run.reducer_prompt_version <> NEW.prompt_version
  THEN
    RAISE EXCEPTION 'long-packet finalization run binding is invalid';
  END IF;

  IF TG_OP = 'INSERT' AND v_run.status <> 'pending' THEN
    RAISE EXCEPTION 'long-packet finalization must be manifested before run start';
  ELSIF TG_OP = 'UPDATE' AND v_run.status <> 'running' THEN
    RAISE EXCEPTION 'long-packet finalization requires a running run';
  END IF;

  IF NEW.status = 'leased'
     AND NEW.status IS DISTINCT FROM OLD.status
  THEN
    SELECT count(*) FILTER (
             WHERE branch = 'mapper' AND status = 'complete'
           ),
           count(*) FILTER (
             WHERE branch = 'safety' AND status = 'complete'
           ),
           count(*)
      INTO v_mapper_complete, v_safety_complete, v_total
      FROM triage_long_packet_chunk_jobs
     WHERE run_id = NEW.run_id;

    IF v_mapper_complete <> v_run.expected_chunk_count
       OR v_safety_complete <> v_run.expected_chunk_count
       OR v_total <> v_run.expected_chunk_count * 2
    THEN
      RAISE EXCEPTION 'long-packet finalization requires all mapper and safety chunk jobs complete';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_long_packet_run_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_extraction triage_extractions%ROWTYPE;
  v_mapper_count integer;
  v_safety_count integer;
  v_finalization_count integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'long-packet runs cannot be deleted';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'complete' THEN
    RAISE EXCEPTION 'completed long-packet runs are immutable';
  END IF;

  IF TG_OP = 'UPDATE' AND (
    OLD.id IS DISTINCT FROM NEW.id
    OR OLD.extraction_id IS DISTINCT FROM NEW.extraction_id
    OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
    OR OLD.configuration_sha256 IS DISTINCT FROM NEW.configuration_sha256
    OR OLD.run_purpose IS DISTINCT FROM NEW.run_purpose
    OR OLD.source_sha256 IS DISTINCT FROM NEW.source_sha256
    OR OLD.plan_sha256 IS DISTINCT FROM NEW.plan_sha256
    OR OLD.expected_chunk_count IS DISTINCT FROM NEW.expected_chunk_count
    OR OLD.planner_version IS DISTINCT FROM NEW.planner_version
    OR OLD.pipeline_version IS DISTINCT FROM NEW.pipeline_version
    OR OLD.mapper_model_id IS DISTINCT FROM NEW.mapper_model_id
    OR OLD.mapper_prompt_version IS DISTINCT FROM NEW.mapper_prompt_version
    OR OLD.safety_model_id IS DISTINCT FROM NEW.safety_model_id
    OR OLD.safety_prompt_version IS DISTINCT FROM NEW.safety_prompt_version
    OR OLD.reducer_model_id IS DISTINCT FROM NEW.reducer_model_id
    OR OLD.reducer_prompt_version IS DISTINCT FROM NEW.reducer_prompt_version
    OR OLD.created_at IS DISTINCT FROM NEW.created_at
  ) THEN
    RAISE EXCEPTION 'long-packet run provenance is immutable';
  END IF;

  SELECT * INTO v_extraction
    FROM triage_extractions extraction
   WHERE extraction.id = NEW.extraction_id
     AND extraction.tenant_id = NEW.tenant_id;

  IF NOT FOUND
     OR v_extraction.ingestion_mode <> 'long_packet'
     OR v_extraction.source_sha256 <> NEW.source_sha256
     OR v_extraction.packet_plan_sha256 <> NEW.plan_sha256
     OR v_extraction.packet_plan ->> 'version' <> NEW.planner_version
     OR jsonb_typeof(v_extraction.packet_plan -> 'chunks') <> 'array'
     OR jsonb_array_length(v_extraction.packet_plan -> 'chunks') <>
       NEW.expected_chunk_count
  THEN
    RAISE EXCEPTION 'long-packet run extraction binding is invalid';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending'
       OR NEW.started_at IS NOT NULL
       OR NEW.completed_at IS NOT NULL
       OR NEW.last_error_code IS NOT NULL
    THEN
      RAISE EXCEPTION 'new long-packet runs must start pristine and pending';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.status = 'pending' AND NEW.status = 'running')
    OR (OLD.status = 'running' AND NEW.status IN ('complete','failed'))
    OR (OLD.status = 'failed' AND NEW.status = 'running')
  ) THEN
    RAISE EXCEPTION 'invalid long-packet run status transition';
  END IF;

  IF NEW.status = 'running' THEN
    SELECT count(*) FILTER (WHERE branch = 'mapper'),
           count(*) FILTER (WHERE branch = 'safety')
      INTO v_mapper_count, v_safety_count
      FROM triage_long_packet_chunk_jobs
     WHERE run_id = NEW.id;
    SELECT count(*) INTO v_finalization_count
      FROM triage_long_packet_finalization_jobs
     WHERE run_id = NEW.id;

    IF v_mapper_count <> NEW.expected_chunk_count
       OR v_safety_count <> NEW.expected_chunk_count
       OR v_finalization_count <> 1
    THEN
      RAISE EXCEPTION 'long-packet run cannot start before its complete durable job manifest exists';
    END IF;
    IF NEW.started_at IS NULL
       OR (OLD.started_at IS NOT NULL AND NEW.started_at IS DISTINCT FROM OLD.started_at)
       OR NEW.completed_at IS NOT NULL
    THEN
      RAISE EXCEPTION 'running long-packet run timestamps are invalid';
    END IF;
  ELSIF NEW.status = 'failed' THEN
    IF NEW.started_at IS DISTINCT FROM OLD.started_at
       OR NEW.completed_at IS NOT NULL
       OR NEW.last_error_code IS NULL
       OR NEW.last_error_detail IS NULL
       OR NEW.last_failed_at IS NULL
    THEN
      RAISE EXCEPTION 'failed long-packet run requires error evidence';
    END IF;
  ELSE
    IF NEW.started_at IS DISTINCT FROM OLD.started_at
       OR NEW.completed_at IS NULL
       OR NOT EXISTS (
         SELECT 1
           FROM triage_long_packet_finalization_jobs finalization
          WHERE finalization.run_id = NEW.id
            AND finalization.status = 'complete'
       )
    THEN
      RAISE EXCEPTION 'long-packet run cannot complete before finalization is complete';
    END IF;
  END IF;

  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS triage_long_packet_run_integrity_guard
  ON triage_long_packet_runs;
CREATE TRIGGER triage_long_packet_run_integrity_guard
BEFORE INSERT OR UPDATE OR DELETE ON triage_long_packet_runs
FOR EACH ROW EXECUTE FUNCTION enforce_long_packet_run_integrity();

DROP TRIGGER IF EXISTS triage_long_packet_chunk_binding_guard
  ON triage_long_packet_chunk_jobs;
CREATE TRIGGER triage_long_packet_chunk_binding_guard
BEFORE INSERT OR UPDATE OR DELETE ON triage_long_packet_chunk_jobs
FOR EACH ROW EXECUTE FUNCTION enforce_long_packet_chunk_job_binding();

DROP TRIGGER IF EXISTS triage_long_packet_chunk_lifecycle_guard
  ON triage_long_packet_chunk_jobs;
CREATE TRIGGER triage_long_packet_chunk_lifecycle_guard
BEFORE INSERT OR UPDATE OR DELETE ON triage_long_packet_chunk_jobs
FOR EACH ROW EXECUTE FUNCTION enforce_long_packet_job_lifecycle();

DROP TRIGGER IF EXISTS triage_long_packet_finalization_binding_guard
  ON triage_long_packet_finalization_jobs;
CREATE TRIGGER triage_long_packet_finalization_binding_guard
BEFORE INSERT OR UPDATE OR DELETE ON triage_long_packet_finalization_jobs
FOR EACH ROW EXECUTE FUNCTION enforce_long_packet_finalization_binding();

DROP TRIGGER IF EXISTS triage_long_packet_finalization_lifecycle_guard
  ON triage_long_packet_finalization_jobs;
CREATE TRIGGER triage_long_packet_finalization_lifecycle_guard
BEFORE INSERT OR UPDATE OR DELETE ON triage_long_packet_finalization_jobs
FOR EACH ROW EXECUTE FUNCTION enforce_long_packet_job_lifecycle();

CREATE INDEX IF NOT EXISTS idx_long_packet_runs_extraction_status
  ON triage_long_packet_runs (tenant_id, extraction_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_long_packet_chunk_jobs_claimable
  ON triage_long_packet_chunk_jobs
    (tenant_id, status, next_retry_at, lease_expires_at, created_at);

CREATE INDEX IF NOT EXISTS idx_long_packet_chunk_jobs_run_status
  ON triage_long_packet_chunk_jobs (run_id, branch, status);

CREATE INDEX IF NOT EXISTS idx_long_packet_finalization_jobs_claimable
  ON triage_long_packet_finalization_jobs
    (tenant_id, status, next_retry_at, lease_expires_at, created_at);
