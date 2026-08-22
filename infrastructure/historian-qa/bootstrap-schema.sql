-- SYNTHETIC QA BOOTSTRAP - SCHEMA ONLY, NO PRODUCTION ROW DATA.
-- Source: reviewed pg_dump --schema-only from ops_amplehtml on 2026-08-22.
-- Apply only to a new, isolated, synthetic-only QA database. QA normalization:
-- guard the RDS-created public schema and restore the uuid-ossp dependency
-- omitted by the schema-filtered pg_dump.

--
-- PostgreSQL database dump
--

\restrict IaJYE7KVgQK5fVuC4JyTz7zKVoQBLt9AsBEAFtAdl4717O9AeNLq2En3oLQOJLt

-- Dumped from database version 17.9
-- Dumped by pg_dump version 17.11 (Debian 17.11-1.pgdg13+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: enforce_emergency_action_alert_lifecycle(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_emergency_action_alert_lifecycle() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_action_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'emergency action alerts cannot be deleted';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending'
       OR NEW.sequence_number < 0
       OR NEW.severity <> 'emergency'
       OR NEW.escalation_level NOT BETWEEN 0 AND 3
    THEN
      RAISE EXCEPTION 'new emergency action alerts must start pending';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.emergency_action_id IS DISTINCT FROM NEW.emergency_action_id
     OR OLD.sequence_number IS DISTINCT FROM NEW.sequence_number
     OR OLD.alert_kind IS DISTINCT FROM NEW.alert_kind
     OR OLD.severity IS DISTINCT FROM NEW.severity
     OR OLD.escalation_level IS DISTINCT FROM NEW.escalation_level
     OR OLD.max_attempts IS DISTINCT FROM NEW.max_attempts
     OR OLD.created_at IS DISTINCT FROM NEW.created_at
  THEN
    RAISE EXCEPTION 'emergency action alert identity is immutable';
  END IF;

  IF OLD.status = 'sent' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'sent emergency alerts are immutable';
  END IF;
  IF OLD.status = 'terminal_failure' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'terminal emergency alert failures are immutable';
  END IF;
  IF OLD.status = 'suppressed' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'suppressed emergency alerts are immutable';
  END IF;

  IF OLD.status <> NEW.status AND NOT (
    (OLD.status IN ('pending', 'failed') AND NEW.status IN ('leased', 'suppressed'))
    OR (OLD.status = 'leased' AND NEW.status IN (
      'sent', 'failed', 'terminal_failure', 'suppressed'
    ))
  ) THEN
    RAISE EXCEPTION 'invalid emergency alert status transition';
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
      RAISE EXCEPTION 'invalid emergency alert lease acquisition';
    END IF;
  ELSIF OLD.status = 'leased' AND NEW.status = 'leased' THEN
    IF OLD.lease_expires_at > v_now THEN
      IF (
         NEW.lease_token IS DISTINCT FROM OLD.lease_token
         OR NEW.lease_owner IS DISTINCT FROM OLD.lease_owner
         OR NEW.claimed_at IS DISTINCT FROM OLD.claimed_at
         OR NEW.lease_expires_at IS DISTINCT FROM OLD.lease_expires_at
         OR NEW.attempt_count IS DISTINCT FROM OLD.attempt_count
         OR NEW.next_attempt_at IS DISTINCT FROM OLD.next_attempt_at
         OR NEW.outcome_lease_token IS DISTINCT FROM OLD.outcome_lease_token
      ) THEN
        RAISE EXCEPTION 'active emergency alert lease cannot be replaced';
      END IF;
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
      RAISE EXCEPTION 'expired emergency alert lease reclaim is invalid';
    END IF;
  ELSIF OLD.status = 'leased'
        AND NEW.status IN ('sent', 'failed', 'terminal_failure')
  THEN
    IF OLD.lease_expires_at <= v_now THEN
      RAISE EXCEPTION 'emergency alert lease is expired or stale';
    END IF;
    IF NEW.outcome_lease_token IS DISTINCT FROM OLD.lease_token THEN
      RAISE EXCEPTION 'emergency alert outcome lease token is stale';
    END IF;
  END IF;

  IF NEW.status = 'sent' AND (
    NEW.sent_at IS NULL
    OR NEW.next_attempt_at IS NOT NULL
    OR NEW.lease_token IS NOT NULL
    OR NEW.lease_owner IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'sent emergency alert evidence is incomplete';
  END IF;

  IF NEW.status = 'failed' AND (
    NEW.attempt_count >= NEW.max_attempts
    OR NEW.next_attempt_at IS NULL
    OR NEW.last_error_code IS NULL
    OR NEW.last_error_detail IS NULL
    OR NEW.last_error_at IS NULL
    OR NEW.last_error_lease_token IS DISTINCT FROM OLD.lease_token
  ) THEN
    RAISE EXCEPTION 'retryable emergency alert failure evidence is incomplete';
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
    RAISE EXCEPTION 'terminal emergency alert failure evidence is incomplete';
  END IF;

  IF NEW.status = 'suppressed' AND OLD.status <> 'suppressed' THEN
    SELECT action.status
      INTO v_action_status
      FROM triage_emergency_actions action
     WHERE action.id = NEW.emergency_action_id;
    IF v_action_status NOT IN ('handed_off', 'closed') THEN
      RAISE EXCEPTION 'emergency alert suppression requires verified resolution';
    END IF;
  END IF;

  NEW.updated_at := v_now;
  RETURN NEW;
END;
$$;


--
-- Name: enforce_emergency_action_transition(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_emergency_action_transition() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_workflow_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'emergency actions cannot be deleted';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'open' THEN
      RAISE EXCEPTION 'new emergency actions must start open';
    END IF;

    SELECT workflow_status
      INTO v_workflow_status
      FROM triage_sessions
     WHERE id = NEW.triage_session_id
     FOR UPDATE;

    IF v_workflow_status = 'closed' THEN
      RAISE EXCEPTION 'emergency actions cannot be opened for closed triage workflows';
    END IF;

    RETURN NEW;
  END IF;

  IF OLD.triage_session_id IS DISTINCT FROM NEW.triage_session_id
     OR OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key
  THEN
    RAISE EXCEPTION 'emergency action workflow linkage is immutable';
  END IF;

  IF OLD.status = 'closed' THEN
    RAISE EXCEPTION 'closed emergency actions are immutable';
  END IF;

  IF OLD.status <> NEW.status AND NOT (
    (OLD.status = 'open' AND NEW.status IN ('attempting_contact','handed_off','failed','closed'))
    OR (OLD.status = 'attempting_contact' AND NEW.status IN ('handed_off','failed','closed'))
    OR (OLD.status = 'handed_off' AND NEW.status IN ('failed','closed'))
    OR (OLD.status = 'failed' AND NEW.status IN ('attempting_contact','handed_off','closed'))
  ) THEN
    RAISE EXCEPTION 'illegal emergency action transition: % to %', OLD.status, NEW.status;
  END IF;

  IF NEW.status = 'closed'
     AND OLD.status <> 'closed'
     AND NOT EXISTS (
       SELECT 1
         FROM triage_sessions action_session
         JOIN clinical_access_memberships action_reviewer
           ON action_reviewer.user_id = NEW.reviewed_by
          AND action_reviewer.tenant_id = action_session.tenant_id
          AND action_reviewer.active = true
          AND action_reviewer.role IN ('clinician', 'admin')
        WHERE action_session.id = NEW.triage_session_id
     )
  THEN
    RAISE EXCEPTION 'emergency action closure reviewer is not authorized';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: enforce_emergency_alert_notification_delivery_lifecycle(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_emergency_alert_notification_delivery_lifecycle() RETURNS trigger
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


--
-- Name: enforce_long_packet_chunk_job_binding(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_long_packet_chunk_job_binding() RETURNS trigger
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


--
-- Name: enforce_long_packet_finalization_binding(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_long_packet_finalization_binding() RETURNS trigger
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


--
-- Name: enforce_long_packet_job_lifecycle(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_long_packet_job_lifecycle() RETURNS trigger
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


--
-- Name: enforce_long_packet_run_integrity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_long_packet_run_integrity() RETURNS trigger
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


--
-- Name: enforce_neurology_consult_triage_tenant(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_neurology_consult_triage_tenant() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_session_tenant text;
BEGIN
  IF NEW.triage_session_id IS NOT NULL THEN
    SELECT session.tenant_id
      INTO v_session_tenant
      FROM triage_sessions session
     WHERE session.id = NEW.triage_session_id
       FOR SHARE OF session;

    IF NOT FOUND OR v_session_tenant IS DISTINCT FROM NEW.tenant_id THEN
      RAISE EXCEPTION
        'consult and triage session tenant binding must match';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: enforce_triage_appointment_safety(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_triage_appointment_safety() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_care_pathway text;
  v_data_quality text;
  v_coverage_status text;
  v_review_requirement text;
  v_workflow_status text;
  v_scheduling_locked boolean;
  v_reviewed_at timestamptz;
  v_reviewed_by text;
  v_final_care_pathway text;
  v_final_triage_tier text;
  v_tenant_id text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.triage_session_id IS NOT NULL
     AND NEW.triage_session_id IS NULL
  THEN
    RAISE EXCEPTION 'triage safety linkage cannot be removed from an appointment';
  END IF;

  -- Cancellation must always remain possible after a safety state changes.
  IF NEW.status IN ('cancelled', 'canceled') THEN
    RETURN NEW;
  END IF;

  IF NEW.triage_session_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT care_pathway,
         data_quality,
         coverage_status,
         review_requirement,
         workflow_status,
         scheduling_locked,
         reviewed_at,
         reviewed_by,
         final_care_pathway,
         final_triage_tier,
         tenant_id
    INTO v_care_pathway,
         v_data_quality,
         v_coverage_status,
         v_review_requirement,
         v_workflow_status,
         v_scheduling_locked,
         v_reviewed_at,
         v_reviewed_by,
         v_final_care_pathway,
         v_final_triage_tier,
         v_tenant_id
    FROM triage_sessions
   WHERE id = NEW.triage_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'triage scheduling authorization not found';
  END IF;

  IF v_care_pathway NOT IN ('expedited_outpatient', 'routine_outpatient')
     OR v_data_quality <> 'sufficient'
     OR v_coverage_status <> 'complete'
     OR v_review_requirement <> 'none'
     OR v_workflow_status <> 'decision_ready'
     OR v_scheduling_locked
     OR v_reviewed_at IS NULL
     OR v_reviewed_by IS NULL
     OR v_final_care_pathway IS NULL
     OR v_final_care_pathway <> v_care_pathway
     OR v_final_care_pathway NOT IN ('expedited_outpatient', 'routine_outpatient')
     OR v_final_triage_tier IS NULL
     OR v_final_triage_tier IN ('emergent', 'insufficient_data')
     OR (
       v_final_care_pathway = 'expedited_outpatient'
       AND v_final_triage_tier NOT IN ('urgent', 'semi_urgent')
     )
     OR (
       v_final_care_pathway = 'routine_outpatient'
       AND v_final_triage_tier NOT IN ('routine_priority', 'routine', 'non_urgent')
     )
     OR NOT EXISTS (
       SELECT 1
         FROM clinical_access_memberships reviewer_membership
        WHERE reviewer_membership.user_id = v_reviewed_by
          AND reviewer_membership.tenant_id = v_tenant_id
          AND reviewer_membership.active = true
          AND reviewer_membership.role IN ('clinician', 'admin')
     )
     OR EXISTS (
       SELECT 1
         FROM triage_emergency_actions action
        WHERE action.triage_session_id = NEW.triage_session_id
          AND action.status <> 'closed'
     )
     OR EXISTS (
       SELECT 1
         FROM triage_clarification_questions q
        WHERE q.triage_session_id = NEW.triage_session_id
          AND q.criticality = 'critical'
          AND q.status NOT IN ('verified', 'closed')
     )
  THEN
    RAISE EXCEPTION 'triage session is not authorized for outpatient scheduling';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: enforce_triage_clarification_question_integrity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_triage_clarification_question_integrity() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_workflow_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'clarification questions cannot be deleted';
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.triage_session_id IS DISTINCT FROM NEW.triage_session_id
  THEN
    RAISE EXCEPTION 'clarification question workflow linkage is immutable';
  END IF;

  SELECT workflow_status
    INTO v_workflow_status
    FROM triage_sessions
   WHERE id = NEW.triage_session_id
   FOR UPDATE;

  IF v_workflow_status = 'closed' THEN
    RAISE EXCEPTION 'clarification questions cannot change after workflow closure';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: enforce_triage_extraction_plan_digest(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_triage_extraction_plan_digest() RETURNS trigger
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


--
-- Name: enforce_triage_extraction_provenance(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_triage_extraction_provenance() RETURNS trigger
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


--
-- Name: enforce_triage_session_consult_tenant(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_triage_session_consult_tenant() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     AND EXISTS (
       SELECT 1
         FROM neurology_consults consult
        WHERE consult.triage_session_id = NEW.id
          AND consult.tenant_id IS DISTINCT FROM NEW.tenant_id
     )
  THEN
    RAISE EXCEPTION
      'consult and triage session tenant binding must match';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: enforce_triage_session_ingress_integrity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_triage_session_ingress_integrity() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.source_extraction_id IS NOT NULL THEN
      RAISE EXCEPTION 'triage sessions linked to a source extraction cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF (
    (NEW.processing_claimed_at IS NULL) <>
    (NEW.processing_lease_expires_at IS NULL)
  ) OR (
    NEW.processing_claimed_at IS NOT NULL
    AND NEW.processing_lease_expires_at <= NEW.processing_claimed_at
  ) THEN
    RAISE EXCEPTION 'processing lease timestamps must be paired and ordered';
  END IF;

  IF NEW.processing_status IN ('complete', 'error')
     AND (
       NEW.processing_claimed_at IS NOT NULL
       OR NEW.processing_lease_expires_at IS NOT NULL
     )
  THEN
    RAISE EXCEPTION 'terminal processing state cannot retain an active lease';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.source_extraction_id IS NOT NULL
       AND NEW.source_extraction_id IS DISTINCT FROM OLD.source_extraction_id
    THEN
      RAISE EXCEPTION 'triage source extraction linkage is immutable once set';
    END IF;

    IF NEW.processing_attempt_count < OLD.processing_attempt_count THEN
      RAISE EXCEPTION 'processing attempt count cannot decrease';
    END IF;

    IF OLD.processing_claimed_at IS NOT NULL
       AND OLD.processing_lease_expires_at > clock_timestamp()
       AND (
         NEW.processing_claimed_at IS DISTINCT FROM OLD.processing_claimed_at
         OR NEW.processing_lease_expires_at IS DISTINCT FROM OLD.processing_lease_expires_at
       )
       AND NOT (
         NEW.processing_status IN ('complete', 'error')
         AND NEW.processing_claimed_at IS NULL
         AND NEW.processing_lease_expires_at IS NULL
       )
    THEN
      RAISE EXCEPTION 'an active processing lease cannot be replaced';
    END IF;

    IF NEW.processing_claimed_at IS NOT NULL
       AND (
         OLD.processing_claimed_at IS NULL
         OR NEW.processing_claimed_at IS DISTINCT FROM OLD.processing_claimed_at
         OR NEW.processing_lease_expires_at IS DISTINCT FROM OLD.processing_lease_expires_at
       )
       AND NEW.processing_attempt_count <> OLD.processing_attempt_count + 1
    THEN
      RAISE EXCEPTION 'a new processing lease must increment the attempt count';
    END IF;
  ELSIF NEW.processing_claimed_at IS NOT NULL
        AND NEW.processing_attempt_count <> 1
  THEN
    RAISE EXCEPTION 'a new processing lease must increment the attempt count';
  END IF;

  IF NEW.source_extraction_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM triage_extractions extraction
        WHERE extraction.id = NEW.source_extraction_id
          AND extraction.tenant_id = NEW.tenant_id
     )
  THEN
    RAISE EXCEPTION 'triage source extraction tenant binding is invalid';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: enforce_triage_workflow_transition(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_triage_workflow_transition() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.workflow_status <> 'pending_safety_screen'
       OR OLD.reviewed_at IS NOT NULL
       OR OLD.final_triage_tier IS NOT NULL
       OR OLD.final_care_pathway IS NOT NULL
       OR OLD.closure_code IS NOT NULL
       OR OLD.closed_at IS NOT NULL
    THEN
      RAISE EXCEPTION 'finalized triage workflows cannot be deleted';
    END IF;

    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.workflow_status = 'closed' THEN
      RAISE EXCEPTION 'new triage workflows cannot start closed';
    END IF;

    RETURN NEW;
  END IF;

  IF OLD.workflow_status = 'closed' THEN
    RAISE EXCEPTION 'closed triage workflows are immutable';
  END IF;

  IF OLD.workflow_status <> NEW.workflow_status AND NOT (
    (OLD.workflow_status = 'pending_safety_screen' AND NEW.workflow_status IN ('emergency_hold','clinician_review'))
    OR (OLD.workflow_status = 'clinician_review' AND NEW.workflow_status IN ('emergency_hold','provider_clarification','patient_clarification','decision_ready','action_pending','closed'))
    OR (OLD.workflow_status = 'provider_clarification' AND NEW.workflow_status IN ('emergency_hold','clinician_review'))
    OR (OLD.workflow_status = 'patient_clarification' AND NEW.workflow_status IN ('emergency_hold','clinician_review'))
    OR (OLD.workflow_status = 'decision_ready' AND NEW.workflow_status IN ('emergency_hold','clinician_review','action_pending','closed'))
    OR (OLD.workflow_status = 'action_pending' AND NEW.workflow_status IN ('emergency_hold','clinician_review','closed'))
    OR (OLD.workflow_status = 'emergency_hold' AND NEW.workflow_status IN ('action_pending','clinician_review','closed'))
  ) THEN
    RAISE EXCEPTION 'illegal triage workflow transition: % to %', OLD.workflow_status, NEW.workflow_status;
  END IF;

  IF NEW.workflow_status = 'closed' THEN
    IF NEW.closure_code IS NULL
       OR NEW.closed_at IS NULL
       OR NEW.reviewed_by IS NULL
       OR NEW.reviewed_at IS NULL
    THEN
      RAISE EXCEPTION 'triage closure requires clinician sign-off and closure evidence';
    END IF;

    IF NOT EXISTS (
      SELECT 1
        FROM clinical_access_memberships closure_reviewer
       WHERE closure_reviewer.user_id = NEW.reviewed_by
         AND closure_reviewer.tenant_id = NEW.tenant_id
         AND closure_reviewer.active = true
         AND closure_reviewer.role IN ('clinician','admin')
    ) THEN
      RAISE EXCEPTION 'triage closure reviewer is not authorized';
    END IF;

    IF EXISTS (
      SELECT 1
        FROM triage_clarification_questions q
       WHERE q.triage_session_id = NEW.id
         AND q.criticality = 'critical'
         AND q.status NOT IN ('verified','closed')
    ) THEN
      RAISE EXCEPTION 'critical clarification remains open';
    END IF;

    IF NEW.workflow_status = 'closed'
       AND EXISTS (
         SELECT 1
           FROM triage_emergency_actions a
          WHERE a.triage_session_id = NEW.id
            AND a.status <> 'closed'
       )
    THEN
      RAISE EXCEPTION 'emergency actions must be closed before triage closure';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: enqueue_emergency_alert_notification_delivery(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enqueue_emergency_alert_notification_delivery() RETURNS trigger
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


--
-- Name: enqueue_initial_emergency_action_alert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enqueue_initial_emergency_action_alert() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO triage_emergency_action_alerts (
    emergency_action_id,
    sequence_number,
    alert_kind,
    severity,
    escalation_level,
    status,
    next_attempt_at
  ) VALUES (NEW.id, 0, 'initial', 'emergency', 0, 'pending', clock_timestamp())
  ON CONFLICT (emergency_action_id, sequence_number) DO NOTHING;
  RETURN NEW;
END;
$$;


--
-- Name: reject_triage_workflow_event_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_triage_workflow_event_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'triage_workflow_events is append-only';
END;
$$;


--
-- Name: revoke_appointments_for_membership_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.revoke_appointments_for_membership_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE appointments a
     SET status = 'cancelled',
         scheduling_notes = concat_ws(
           E'\n',
           NULLIF(a.scheduling_notes, ''),
           'Automatically cancelled because clinician review authorization was revoked.'
         )
    FROM triage_sessions ts
   WHERE a.triage_session_id = ts.id
     AND ts.reviewed_by = OLD.user_id
     AND ts.tenant_id = OLD.tenant_id
     AND a.status NOT IN ('cancelled', 'canceled', 'completed')
     AND NOT EXISTS (
       SELECT 1
         FROM clinical_access_memberships current_membership
        WHERE current_membership.user_id = ts.reviewed_by
          AND current_membership.tenant_id = ts.tenant_id
          AND current_membership.active = true
          AND current_membership.role IN ('clinician', 'admin')
     );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: revoke_unsafe_triage_appointments(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.revoke_unsafe_triage_appointments() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_triage_session_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'triage_sessions' THEN
    v_triage_session_id := COALESCE(NEW.id, OLD.id);
  ELSE
    v_triage_session_id := COALESCE(NEW.triage_session_id, OLD.triage_session_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM triage_sessions ts
     WHERE ts.id = v_triage_session_id
       AND ts.care_pathway IN ('expedited_outpatient', 'routine_outpatient')
       AND ts.data_quality = 'sufficient'
       AND ts.coverage_status = 'complete'
       AND ts.review_requirement = 'none'
       AND ts.workflow_status = 'decision_ready'
       AND ts.scheduling_locked = false
       AND ts.reviewed_at IS NOT NULL
       AND ts.reviewed_by IS NOT NULL
       AND ts.final_care_pathway = ts.care_pathway
       AND ts.final_triage_tier IS NOT NULL
       AND ts.final_triage_tier NOT IN ('emergent', 'insufficient_data')
       AND (
         (ts.final_care_pathway = 'expedited_outpatient'
          AND ts.final_triage_tier IN ('urgent', 'semi_urgent'))
         OR
         (ts.final_care_pathway = 'routine_outpatient'
          AND ts.final_triage_tier IN ('routine_priority', 'routine', 'non_urgent'))
       )
       AND EXISTS (
         SELECT 1
           FROM clinical_access_memberships reviewer_membership
          WHERE reviewer_membership.user_id = ts.reviewed_by
            AND reviewer_membership.tenant_id = ts.tenant_id
            AND reviewer_membership.active = true
            AND reviewer_membership.role IN ('clinician', 'admin')
       )
       AND NOT EXISTS (
         SELECT 1
           FROM triage_emergency_actions action
          WHERE action.triage_session_id = ts.id
            AND action.status <> 'closed'
       )
       AND NOT EXISTS (
         SELECT 1
           FROM triage_clarification_questions q
          WHERE q.triage_session_id = ts.id
            AND q.criticality = 'critical'
            AND q.status NOT IN ('verified', 'closed')
       )
  ) THEN
    UPDATE appointments
       SET status = 'cancelled',
           scheduling_notes = concat_ws(
             E'\n',
             NULLIF(scheduling_notes, ''),
             'Automatically cancelled because triage safety authorization was revoked.'
           )
     WHERE triage_session_id = v_triage_session_id
       AND status NOT IN ('cancelled', 'canceled', 'completed');
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: suppress_resolved_emergency_action_alerts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.suppress_resolved_emergency_action_alerts() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.status IN ('handed_off', 'closed')
     AND OLD.status IS DISTINCT FROM NEW.status
  THEN
    UPDATE triage_emergency_action_alerts
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


--
-- Name: suppress_resolved_emergency_alert_notification_deliveries(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.suppress_resolved_emergency_alert_notification_deliveries() RETURNS trigger
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


--
-- Name: triage_jsonb_nonnegative_integer(jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.triage_jsonb_nonnegative_integer(p_document jsonb, p_key text) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    AS $_$
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
$_$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    key text NOT NULL,
    value text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: appointments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.appointments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    appointment_date date NOT NULL,
    appointment_time time without time zone NOT NULL,
    duration_minutes integer DEFAULT 30,
    appointment_type text NOT NULL,
    status text DEFAULT 'scheduled'::text,
    hospital_site text DEFAULT 'Main Campus'::text,
    reason_for_visit text,
    visit_id uuid,
    prior_visit_id uuid,
    scheduling_notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id text DEFAULT 'default'::text NOT NULL,
    provider_name text,
    triage_session_id uuid
);


--
-- Name: clara_test_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clara_test_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid,
    turn_index integer,
    consult_type text,
    urgency_level text,
    stat_level integer,
    confidence numeric(4,3),
    rationale text,
    red_flags jsonb DEFAULT '[]'::jsonb,
    gate0_fired boolean DEFAULT false NOT NULL,
    routing_target text,
    verdict text NOT NULL,
    reason text,
    corrected_consult_type text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT clara_test_feedback_verdict_check CHECK ((verdict = ANY (ARRAY['up'::text, 'down'::text])))
);


--
-- Name: clara_test_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clara_test_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    test_label text,
    turns jsonb DEFAULT '[]'::jsonb NOT NULL,
    consult_type text,
    confidence numeric(4,3),
    rationale text,
    stat_level integer,
    red_flags jsonb DEFAULT '[]'::jsonb,
    urgency_level text,
    needs_clarification boolean DEFAULT false,
    clarification_questions jsonb DEFAULT '[]'::jsonb,
    routing jsonb,
    gate0_fired boolean DEFAULT false NOT NULL,
    duration_seconds integer,
    turn_count integer,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: clinical_access_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinical_access_memberships (
    user_id text NOT NULL,
    tenant_id text NOT NULL,
    role text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    provisioned_by text NOT NULL,
    provisioned_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_by text,
    revoked_at timestamp with time zone,
    CONSTRAINT clinical_access_memberships_check CHECK ((active OR (revoked_at IS NOT NULL))),
    CONSTRAINT clinical_access_memberships_role_check CHECK ((role = ANY (ARRAY['clinician'::text, 'scheduler'::text, 'admin'::text, 'viewer'::text])))
);


--
-- Name: clinical_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinical_notes (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    visit_id uuid NOT NULL,
    hpi text,
    ros text,
    allergies text,
    physical_exam jsonb,
    assessment text,
    plan text,
    ai_summary text,
    is_signed boolean DEFAULT false,
    signed_at timestamp with time zone,
    raw_dictation jsonb DEFAULT '{}'::jsonb,
    tenant_id text DEFAULT 'default'::text NOT NULL,
    status text DEFAULT 'draft'::text,
    ros_details text,
    allergy_details text,
    history_available text,
    history_details text,
    exam_free_text text,
    vitals jsonb
);


--
-- Name: clinical_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinical_plans (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    synced_at timestamp with time zone DEFAULT now(),
    plan_key text NOT NULL,
    title text NOT NULL,
    version text DEFAULT '1.0'::text,
    icd10_codes text[] DEFAULT '{}'::text[] NOT NULL,
    scope text,
    notes text[] DEFAULT '{}'::text[],
    sections jsonb DEFAULT '{}'::jsonb NOT NULL,
    patient_instructions text[] DEFAULT '{}'::text[],
    referrals text[] DEFAULT '{}'::text[],
    differential jsonb DEFAULT '[]'::jsonb,
    evidence jsonb DEFAULT '[]'::jsonb,
    monitoring jsonb DEFAULT '[]'::jsonb,
    disposition jsonb DEFAULT '[]'::jsonb,
    source_url text,
    source_commit text
);


--
-- Name: clinical_scales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinical_scales (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    visit_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    scale_type text NOT NULL,
    score integer NOT NULL,
    interpretation text,
    answers jsonb,
    tenant_id text DEFAULT 'default'::text NOT NULL
);


--
-- Name: condition_scale_mapping; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.condition_scale_mapping (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    condition text NOT NULL,
    scale_id text NOT NULL,
    priority integer DEFAULT 1,
    is_required boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: consult_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consult_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    consult_id uuid NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    report_data jsonb NOT NULL,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    finalized_at timestamp with time zone,
    finalized_by text
);


--
-- Name: device_daily_readings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.device_daily_readings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    device_source_id uuid NOT NULL,
    reading_date date NOT NULL,
    reading_count integer DEFAULT 0,
    has_valid_data boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: dexcom_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dexcom_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    device_source_id uuid NOT NULL,
    event_type character varying(50) NOT NULL,
    event_subtype character varying(50),
    event_time timestamp with time zone NOT NULL,
    value double precision,
    unit character varying(20),
    source_device character varying(50) DEFAULT 'dexcom_cgm'::character varying,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: diagnoses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.diagnoses (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    visit_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    icd10_code text NOT NULL,
    description text NOT NULL,
    is_primary boolean DEFAULT false,
    tenant_id text DEFAULT 'default'::text NOT NULL
);


--
-- Name: dot_phrases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dot_phrases (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    user_id uuid NOT NULL,
    trigger_text text NOT NULL,
    expansion_text text NOT NULL,
    category text DEFAULT 'General'::text,
    description text,
    is_active boolean DEFAULT true,
    use_count integer DEFAULT 0,
    last_used timestamp with time zone,
    scope text DEFAULT 'global'::text,
    tenant_id text DEFAULT 'default'::text NOT NULL
);


--
-- Name: feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    text text NOT NULL,
    user_id uuid,
    user_email text,
    upvotes text[] DEFAULT '{}'::text[],
    downvotes text[] DEFAULT '{}'::text[],
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    status text DEFAULT 'pending'::text,
    admin_response text,
    admin_user_id uuid,
    admin_user_email text,
    status_updated_at timestamp with time zone
);


--
-- Name: feedback_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feedback_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    feedback_id uuid NOT NULL,
    user_id uuid,
    user_email text,
    text text NOT NULL,
    is_admin_comment boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: followup_billing_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.followup_billing_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid,
    patient_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    patient_name text NOT NULL,
    service_date date NOT NULL,
    billing_month text NOT NULL,
    program text DEFAULT 'ccm'::text NOT NULL,
    cpt_code text NOT NULL,
    cpt_rate numeric(8,2) DEFAULT 0 NOT NULL,
    prep_minutes integer DEFAULT 0 NOT NULL,
    call_minutes integer DEFAULT 0 NOT NULL,
    documentation_minutes integer DEFAULT 0 NOT NULL,
    coordination_minutes integer DEFAULT 0 NOT NULL,
    total_minutes integer DEFAULT 0 NOT NULL,
    meets_threshold boolean DEFAULT false NOT NULL,
    billing_status text DEFAULT 'not_reviewed'::text NOT NULL,
    reviewed_by text,
    reviewed_at timestamp with time zone,
    notes text,
    tcm_discharge_date date,
    tcm_contact_within_2_days boolean,
    tcm_f2f_scheduled boolean
);


--
-- Name: followup_escalations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.followup_escalations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    severity text NOT NULL,
    trigger_text text NOT NULL,
    trigger_category text,
    ai_assessment text,
    recommended_action text,
    acknowledged boolean DEFAULT false NOT NULL,
    acknowledged_by text,
    resolution_notes text
);


--
-- Name: followup_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.followup_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    patient_id uuid,
    patient_name text NOT NULL,
    visit_date date,
    provider_name text,
    follow_up_method text DEFAULT 'sms'::text NOT NULL,
    conversation_status text DEFAULT 'in_progress'::text NOT NULL,
    duration_seconds integer,
    transcript jsonb DEFAULT '[]'::jsonb NOT NULL,
    medications_discussed jsonb DEFAULT '[]'::jsonb NOT NULL,
    side_effects_reported jsonb DEFAULT '[]'::jsonb NOT NULL,
    new_symptoms_reported jsonb DEFAULT '[]'::jsonb NOT NULL,
    functional_status text,
    functional_details text,
    caregiver_name text,
    caregiver_relationship text,
    patient_questions jsonb DEFAULT '[]'::jsonb NOT NULL,
    escalation_flags jsonb DEFAULT '[]'::jsonb NOT NULL,
    escalation_level text DEFAULT 'none'::text NOT NULL,
    post_call_summary text,
    clinician_reviewed boolean DEFAULT false NOT NULL,
    ai_model_used text DEFAULT 'gpt-5.2'::text NOT NULL,
    language_used text DEFAULT 'en'::text,
    user_id uuid,
    tenant_id text DEFAULT 'default'::text NOT NULL
);


--
-- Name: glucose_readings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.glucose_readings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    device_source_id uuid NOT NULL,
    reading_time timestamp with time zone NOT NULL,
    value_mgdl integer NOT NULL,
    trend character varying(30),
    trend_rate double precision,
    source_device character varying(50) DEFAULT 'dexcom_cgm'::character varying,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: historian_evaluations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.historian_evaluations (
    id bigint NOT NULL,
    session_id text NOT NULL,
    evaluator text NOT NULL,
    model_id text NOT NULL,
    prompt_version text NOT NULL,
    rubric_version text,
    inference_params jsonb,
    result jsonb NOT NULL,
    cost_usd numeric(10,6),
    latency_ms integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: historian_evaluations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.historian_evaluations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: historian_evaluations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.historian_evaluations_id_seq OWNED BY public.historian_evaluations.id;


--
-- Name: historian_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.historian_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id text DEFAULT 'default'::text NOT NULL,
    session_type text DEFAULT 'new_patient'::text NOT NULL,
    patient_name text DEFAULT ''::text NOT NULL,
    referral_reason text,
    structured_output jsonb,
    narrative_summary text,
    transcript jsonb,
    red_flags jsonb,
    safety_escalated boolean DEFAULT false NOT NULL,
    duration_seconds integer DEFAULT 0,
    question_count integer DEFAULT 0,
    status text DEFAULT 'in_progress'::text NOT NULL,
    reviewed boolean DEFAULT false NOT NULL,
    imported_to_note boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    patient_id uuid,
    session_source text DEFAULT 'neurologic_historian'::text NOT NULL,
    interview_completion_status text,
    final_differential jsonb,
    CONSTRAINT chk_historian_sessions_interview_completion_status CHECK (((interview_completion_status IS NULL) OR (interview_completion_status = ANY (ARRAY['complete'::text, 'ended_early'::text]))))
);


--
-- Name: historian_transcript_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.historian_transcript_events (
    id bigint NOT NULL,
    session_id text NOT NULL,
    seq integer NOT NULL,
    role text NOT NULL,
    text text NOT NULL,
    ts_offset_s integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: historian_transcript_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.historian_transcript_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: historian_transcript_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.historian_transcript_events_id_seq OWNED BY public.historian_transcript_events.id;


--
-- Name: imaging_studies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.imaging_studies (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    patient_id uuid NOT NULL,
    study_type text NOT NULL,
    study_date date NOT NULL,
    description text NOT NULL,
    findings text,
    impression text,
    tenant_id text DEFAULT 'default'::text NOT NULL
);


--
-- Name: medication_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medication_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    visit_id uuid,
    tenant_id text DEFAULT 'default'::text NOT NULL,
    reviewed_by uuid,
    review_type text DEFAULT 'reconciliation'::text,
    changes_made jsonb DEFAULT '[]'::jsonb,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: neurology_consults; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.neurology_consults (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid,
    status text DEFAULT 'triage_pending'::text NOT NULL,
    triage_session_id uuid,
    triage_urgency text,
    triage_tier_display text,
    triage_summary text,
    triage_chief_complaint text,
    triage_red_flags text[],
    triage_subspecialty text,
    triage_completed_at timestamp with time zone,
    intake_session_id uuid,
    intake_status text,
    intake_summary text,
    intake_escalation_level text,
    intake_transcript_excerpt text,
    intake_completed_at timestamp with time zone,
    historian_session_id uuid,
    historian_summary text,
    historian_structured_output jsonb,
    historian_red_flags jsonb,
    historian_safety_escalated boolean DEFAULT false NOT NULL,
    historian_completed_at timestamp with time zone,
    referral_text text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    localizer_differential jsonb,
    localizer_questions jsonb,
    localizer_hypothesis text,
    localizer_kb_sources jsonb,
    localizer_last_run_at timestamp with time zone,
    localizer_run_count integer DEFAULT 0 NOT NULL,
    scale_results_summary jsonb,
    red_flag_count integer DEFAULT 0 NOT NULL,
    sdne_session_id text,
    sdne_session_flag text,
    sdne_domain_flags jsonb,
    sdne_detected_patterns jsonb,
    sdne_completed_at timestamp with time zone,
    interview_completion_status text,
    tenant_id text DEFAULT 'default'::text NOT NULL,
    CONSTRAINT chk_neurology_consults_interview_completion_status CHECK (((interview_completion_status IS NULL) OR (interview_completion_status = ANY (ARRAY['complete'::text, 'ended_early'::text])))),
    CONSTRAINT chk_neurology_consults_status CHECK ((status = ANY (ARRAY['triage_pending'::text, 'triage_complete'::text, 'intake_pending'::text, 'intake_in_progress'::text, 'intake_complete'::text, 'historian_pending'::text, 'historian_in_progress'::text, 'historian_complete'::text, 'complete'::text])))
);


--
-- Name: COLUMN neurology_consults.scale_results_summary; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.neurology_consults.scale_results_summary IS 'Denormalized summary of completed scales: [{ scale_id, abbreviation, score, severity_level, completed_at }]';


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id text DEFAULT 'default'::text NOT NULL,
    recipient_user_id uuid,
    source_type text NOT NULL,
    source_id uuid,
    patient_id uuid,
    priority text DEFAULT 'normal'::text NOT NULL,
    title text NOT NULL,
    body text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'unread'::text NOT NULL,
    snoozed_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: patient_allergies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_allergies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    tenant_id text DEFAULT 'default'::text NOT NULL,
    allergen text NOT NULL,
    allergen_type text DEFAULT 'drug'::text NOT NULL,
    reaction text,
    severity text DEFAULT 'unknown'::text,
    onset_date date,
    source text DEFAULT 'manual'::text,
    confirmed_by_user boolean DEFAULT false,
    is_active boolean DEFAULT true,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: patient_body_map_markers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_body_map_markers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    consult_id uuid,
    patient_id uuid,
    region text NOT NULL,
    symptom_type text NOT NULL,
    severity text NOT NULL,
    laterality text NOT NULL,
    onset text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: patient_device_measurements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_device_measurements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    consult_id uuid,
    patient_id uuid,
    measurement_type text NOT NULL,
    result jsonb NOT NULL,
    device_info jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: patient_intake_forms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_intake_forms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id text DEFAULT 'default'::text NOT NULL,
    patient_name text NOT NULL,
    date_of_birth date,
    email text,
    phone text,
    chief_complaint text,
    current_medications text,
    allergies text,
    medical_history text,
    family_history text,
    notes text,
    status text DEFAULT 'submitted'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    patient_id uuid,
    imported_to_note boolean DEFAULT false NOT NULL
);


--
-- Name: patient_medications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_medications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    tenant_id text DEFAULT 'default'::text NOT NULL,
    medication_name text NOT NULL,
    generic_name text,
    dosage text,
    frequency text,
    route text DEFAULT 'PO'::text,
    start_date date,
    end_date date,
    prescriber text,
    indication text,
    status text DEFAULT 'active'::text NOT NULL,
    discontinue_reason text,
    source text DEFAULT 'manual'::text,
    ai_confidence real,
    confirmed_by_user boolean DEFAULT false,
    notes text,
    is_active boolean,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: patient_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id text DEFAULT 'default'::text NOT NULL,
    patient_name text NOT NULL,
    subject text DEFAULT ''::text NOT NULL,
    body text NOT NULL,
    direction text DEFAULT 'inbound'::text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    patient_id uuid
);


--
-- Name: patients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patients (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    user_id uuid NOT NULL,
    mrn text NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    date_of_birth date NOT NULL,
    gender text NOT NULL,
    phone text,
    email text,
    address text,
    timezone text DEFAULT 'America/Los_Angeles'::text,
    referring_physician text,
    referral_reason text,
    tenant_id text DEFAULT 'default'::text NOT NULL
);


--
-- Name: red_flag_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.red_flag_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    consult_id uuid NOT NULL,
    flag_name text NOT NULL,
    severity text NOT NULL,
    detected_symptoms jsonb DEFAULT '[]'::jsonb NOT NULL,
    confidence numeric(4,3) NOT NULL,
    escalation_from_tier text NOT NULL,
    escalation_to_tier text NOT NULL,
    detected_at timestamp with time zone DEFAULT now() NOT NULL,
    acknowledged_at timestamp with time zone,
    CONSTRAINT red_flag_events_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
    CONSTRAINT red_flag_events_escalation_from_tier_check CHECK ((escalation_from_tier = ANY (ARRAY['immediate'::text, 'urgent'::text, 'same_day'::text, 'routine'::text]))),
    CONSTRAINT red_flag_events_escalation_to_tier_check CHECK ((escalation_to_tier = ANY (ARRAY['immediate'::text, 'urgent'::text, 'same_day'::text, 'routine'::text]))),
    CONSTRAINT red_flag_events_severity_check CHECK ((severity = ANY (ARRAY['critical'::text, 'high'::text, 'moderate'::text])))
);


--
-- Name: rpm_billing_periods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rpm_billing_periods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    days_with_data integer DEFAULT 0,
    eligible_for_99454 boolean DEFAULT false,
    review_minutes_logged integer DEFAULT 0,
    status character varying(20) DEFAULT 'active'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: saved_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id text DEFAULT 'default'::text NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    source_plan_key text,
    selected_items jsonb DEFAULT '{}'::jsonb NOT NULL,
    custom_items jsonb DEFAULT '{}'::jsonb NOT NULL,
    plan_overrides jsonb DEFAULT '{}'::jsonb,
    is_default boolean DEFAULT false,
    use_count integer DEFAULT 0,
    last_used timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: scale_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scale_definitions (
    id text NOT NULL,
    name text NOT NULL,
    abbreviation text NOT NULL,
    description text,
    category text NOT NULL,
    questions jsonb NOT NULL,
    scoring_method text DEFAULT 'sum'::text NOT NULL,
    scoring_ranges jsonb NOT NULL,
    alerts jsonb,
    time_to_complete integer,
    source text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: scale_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scale_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    patient_id uuid,
    visit_id uuid,
    scale_id text NOT NULL,
    responses jsonb NOT NULL,
    raw_score integer NOT NULL,
    interpretation text,
    severity_level text,
    grade text,
    triggered_alerts jsonb,
    notes text,
    completed_by uuid,
    completed_at timestamp with time zone,
    added_to_note boolean DEFAULT false,
    added_to_note_at timestamp with time zone,
    tenant_id text DEFAULT 'default'::text NOT NULL,
    historian_session_id uuid,
    consult_id uuid,
    scale_name text,
    scale_abbreviation text,
    raw_responses jsonb,
    total_score integer,
    subscale_scores jsonb,
    admin_mode text DEFAULT 'voice_administrable'::text,
    administered_at timestamp with time zone DEFAULT now(),
    scale_results_summary jsonb,
    status text DEFAULT 'complete'::text NOT NULL,
    current_index integer DEFAULT 0 NOT NULL,
    CONSTRAINT scale_results_status_check CHECK ((status = ANY (ARRAY['in_progress'::text, 'complete'::text])))
);


--
-- Name: TABLE scale_results; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.scale_results IS 'Completed clinical scale administrations from the Scale Auto-Administration Engine (Phase 3). Linked to historian_sessions for historian-only flows, or to neurology_consults for full pipeline flows.';


--
-- Name: COLUMN scale_results.triggered_alerts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.scale_results.triggered_alerts IS 'Array of { type, message, action? } objects from the scoring engine. Critical alerts (PHQ-9 Q9, NIHSS ≥ 21) must be surfaced immediately in the UI.';


--
-- Name: triage_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.triage_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    total_items integer NOT NULL,
    completed_items integer DEFAULT 0,
    status text DEFAULT 'processing'::text
);


--
-- Name: triage_clarification_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.triage_clarification_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    triage_session_id uuid NOT NULL,
    question_code text NOT NULL,
    question_text text NOT NULL,
    rationale text NOT NULL,
    target text NOT NULL,
    criticality text NOT NULL,
    acceptable_sources jsonb DEFAULT '[]'::jsonb NOT NULL,
    answer_schema jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    owner_user_id text,
    owner_team text,
    due_at timestamp with time zone,
    escalation_policy jsonb DEFAULT '{}'::jsonb NOT NULL,
    approved_by text,
    approved_at timestamp with time zone,
    delivered_at timestamp with time zone,
    delivery_status text,
    raw_answer text,
    normalized_answer jsonb,
    responder_kind text,
    responder_id text,
    answered_at timestamp with time zone,
    verified_by text,
    verified_at timestamp with time zone,
    closed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT triage_clarification_questions_check CHECK (((status <> 'approved'::text) OR ((approved_by IS NOT NULL) AND (approved_at IS NOT NULL)))),
    CONSTRAINT triage_clarification_questions_check1 CHECK (((status <> ALL (ARRAY['verified'::text, 'closed'::text])) OR ((verified_by IS NOT NULL) AND (verified_at IS NOT NULL)))),
    CONSTRAINT triage_clarification_questions_criticality_check CHECK ((criticality = ANY (ARRAY['critical'::text, 'non_critical'::text]))),
    CONSTRAINT triage_clarification_questions_delivery_status_check CHECK ((delivery_status = ANY (ARRAY['pending'::text, 'delivered'::text, 'failed'::text, 'not_applicable'::text]))),
    CONSTRAINT triage_clarification_questions_responder_kind_check CHECK ((responder_kind = ANY (ARRAY['patient'::text, 'caregiver'::text, 'provider'::text, 'clinician'::text, 'staff'::text]))),
    CONSTRAINT triage_clarification_questions_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'approved'::text, 'sent'::text, 'answered'::text, 'verified'::text, 'closed'::text, 'expired'::text, 'failed'::text, 'conflicting'::text]))),
    CONSTRAINT triage_clarification_questions_target_check CHECK ((target = ANY (ARRAY['patient'::text, 'provider'::text, 'human_reviewer'::text])))
);


--
-- Name: triage_emergency_action_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.triage_emergency_action_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    emergency_action_id uuid NOT NULL,
    sequence_number integer NOT NULL,
    alert_kind text NOT NULL,
    severity text DEFAULT 'emergency'::text NOT NULL,
    escalation_level smallint NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    max_attempts integer DEFAULT 5 NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    next_attempt_at timestamp with time zone,
    lease_token uuid,
    lease_owner text,
    claimed_at timestamp with time zone,
    lease_expires_at timestamp with time zone,
    outcome_lease_token uuid,
    sent_at timestamp with time zone,
    terminal_failed_at timestamp with time zone,
    suppressed_at timestamp with time zone,
    last_error_code text,
    last_error_detail text,
    last_error_at timestamp with time zone,
    last_error_lease_token uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT triage_emergency_action_alerts_alert_kind_check CHECK ((alert_kind = ANY (ARRAY['initial'::text, 'reminder'::text]))),
    CONSTRAINT triage_emergency_action_alerts_check CHECK (((attempt_count >= 0) AND (attempt_count <= max_attempts))),
    CONSTRAINT triage_emergency_action_alerts_check1 CHECK ((((status = 'pending'::text) AND (attempt_count = 0) AND (next_attempt_at IS NOT NULL) AND (lease_token IS NULL) AND (lease_owner IS NULL) AND (claimed_at IS NULL) AND (lease_expires_at IS NULL) AND (outcome_lease_token IS NULL) AND (sent_at IS NULL) AND (terminal_failed_at IS NULL) AND (suppressed_at IS NULL) AND (last_error_code IS NULL) AND (last_error_detail IS NULL) AND (last_error_at IS NULL) AND (last_error_lease_token IS NULL)) OR ((status = 'leased'::text) AND ((attempt_count >= 1) AND (attempt_count <= max_attempts)) AND (next_attempt_at IS NULL) AND (lease_token IS NOT NULL) AND (lease_owner IS NOT NULL) AND (claimed_at IS NOT NULL) AND (lease_expires_at IS NOT NULL) AND (lease_expires_at > claimed_at) AND (outcome_lease_token IS NULL) AND (sent_at IS NULL) AND (terminal_failed_at IS NULL) AND (suppressed_at IS NULL)) OR ((status = 'failed'::text) AND ((attempt_count >= 1) AND (attempt_count <= (max_attempts - 1))) AND (next_attempt_at IS NOT NULL) AND (lease_token IS NULL) AND (lease_owner IS NULL) AND (claimed_at IS NULL) AND (lease_expires_at IS NULL) AND (outcome_lease_token IS NOT NULL) AND (sent_at IS NULL) AND (terminal_failed_at IS NULL) AND (suppressed_at IS NULL) AND (last_error_code IS NOT NULL) AND (last_error_detail IS NOT NULL) AND (last_error_at IS NOT NULL) AND (last_error_lease_token IS NOT NULL)) OR ((status = 'sent'::text) AND ((attempt_count >= 1) AND (attempt_count <= max_attempts)) AND (next_attempt_at IS NULL) AND (lease_token IS NULL) AND (lease_owner IS NULL) AND (claimed_at IS NULL) AND (lease_expires_at IS NULL) AND (outcome_lease_token IS NOT NULL) AND (sent_at IS NOT NULL) AND (terminal_failed_at IS NULL) AND (suppressed_at IS NULL)) OR ((status = 'terminal_failure'::text) AND (attempt_count = max_attempts) AND (next_attempt_at IS NULL) AND (lease_token IS NULL) AND (lease_owner IS NULL) AND (claimed_at IS NULL) AND (lease_expires_at IS NULL) AND (outcome_lease_token IS NOT NULL) AND (sent_at IS NULL) AND (terminal_failed_at IS NOT NULL) AND (suppressed_at IS NULL) AND (last_error_code IS NOT NULL) AND (last_error_detail IS NOT NULL) AND (last_error_at IS NOT NULL) AND (last_error_lease_token IS NOT NULL)) OR ((status = 'suppressed'::text) AND (next_attempt_at IS NULL) AND (lease_token IS NULL) AND (lease_owner IS NULL) AND (claimed_at IS NULL) AND (lease_expires_at IS NULL) AND (sent_at IS NULL) AND (terminal_failed_at IS NULL) AND (suppressed_at IS NOT NULL)))),
    CONSTRAINT triage_emergency_action_alerts_escalation_level_check CHECK (((escalation_level >= 0) AND (escalation_level <= 3))),
    CONSTRAINT triage_emergency_action_alerts_last_error_code_check CHECK (((last_error_code IS NULL) OR ((length(last_error_code) >= 1) AND (length(last_error_code) <= 100)))),
    CONSTRAINT triage_emergency_action_alerts_last_error_detail_check CHECK (((last_error_detail IS NULL) OR ((length(last_error_detail) >= 1) AND (length(last_error_detail) <= 500)))),
    CONSTRAINT triage_emergency_action_alerts_lease_owner_check CHECK (((lease_owner IS NULL) OR ((length(lease_owner) >= 1) AND (length(lease_owner) <= 200)))),
    CONSTRAINT triage_emergency_action_alerts_max_attempts_check CHECK (((max_attempts >= 1) AND (max_attempts <= 10))),
    CONSTRAINT triage_emergency_action_alerts_sequence_number_check CHECK ((sequence_number >= 0)),
    CONSTRAINT triage_emergency_action_alerts_severity_check CHECK ((severity = 'emergency'::text)),
    CONSTRAINT triage_emergency_action_alerts_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'leased'::text, 'failed'::text, 'sent'::text, 'terminal_failure'::text, 'suppressed'::text])))
);


--
-- Name: triage_emergency_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.triage_emergency_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    triage_session_id uuid NOT NULL,
    status text NOT NULL,
    owner_user_id text,
    owner_team text NOT NULL,
    due_at timestamp with time zone NOT NULL,
    next_escalation_at timestamp with time zone NOT NULL,
    contact_attempted_at timestamp with time zone,
    contact_channel text,
    instruction_given text,
    delivery_status text,
    understanding_status text,
    outcome text,
    closure_code text,
    closed_at timestamp with time zone,
    reviewed_by text,
    reviewed_at timestamp with time zone,
    idempotency_key text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT triage_emergency_actions_check CHECK (((status <> 'closed'::text) OR ((closure_code IS NOT NULL) AND (closed_at IS NOT NULL) AND (reviewed_by IS NOT NULL) AND (reviewed_at IS NOT NULL) AND (contact_attempted_at IS NOT NULL) AND (contact_channel IS NOT NULL) AND (instruction_given IS NOT NULL) AND (delivery_status = ANY (ARRAY['delivered'::text, 'not_applicable'::text])) AND (understanding_status = ANY (ARRAY['confirmed'::text, 'not_applicable'::text])) AND (outcome IS NOT NULL)))),
    CONSTRAINT triage_emergency_actions_delivery_status_check CHECK ((delivery_status = ANY (ARRAY['unknown'::text, 'delivered'::text, 'failed'::text, 'not_applicable'::text]))),
    CONSTRAINT triage_emergency_actions_status_check CHECK ((status = ANY (ARRAY['open'::text, 'attempting_contact'::text, 'handed_off'::text, 'closed'::text, 'failed'::text]))),
    CONSTRAINT triage_emergency_actions_understanding_status_check CHECK ((understanding_status = ANY (ARRAY['unknown'::text, 'confirmed'::text, 'not_confirmed'::text, 'not_applicable'::text])))
);


--
-- Name: triage_emergency_alert_notification_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.triage_emergency_alert_notification_deliveries (
    emergency_alert_id uuid NOT NULL,
    emergency_action_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    max_attempts integer DEFAULT 5 NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    next_attempt_at timestamp with time zone,
    lease_token uuid,
    lease_owner text,
    claimed_at timestamp with time zone,
    lease_expires_at timestamp with time zone,
    outcome_lease_token uuid,
    notification_id text,
    delivered_at timestamp with time zone,
    terminal_failed_at timestamp with time zone,
    suppressed_at timestamp with time zone,
    last_error_code text,
    last_error_detail text,
    last_error_at timestamp with time zone,
    last_error_lease_token uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT triage_emergency_alert_notification_del_last_error_detail_check CHECK (((last_error_detail IS NULL) OR ((length(last_error_detail) >= 1) AND (length(last_error_detail) <= 500)))),
    CONSTRAINT triage_emergency_alert_notification_deliv_last_error_code_check CHECK (((last_error_code IS NULL) OR ((length(last_error_code) >= 1) AND (length(last_error_code) <= 100)))),
    CONSTRAINT triage_emergency_alert_notification_deliv_notification_id_check CHECK (((notification_id IS NULL) OR ((length(notification_id) >= 1) AND (length(notification_id) <= 200)))),
    CONSTRAINT triage_emergency_alert_notification_deliveri_max_attempts_check CHECK (((max_attempts >= 1) AND (max_attempts <= 10))),
    CONSTRAINT triage_emergency_alert_notification_deliverie_lease_owner_check CHECK (((lease_owner IS NULL) OR ((length(lease_owner) >= 1) AND (length(lease_owner) <= 200)))),
    CONSTRAINT triage_emergency_alert_notification_deliveries_check CHECK (((attempt_count >= 0) AND (attempt_count <= max_attempts))),
    CONSTRAINT triage_emergency_alert_notification_deliveries_check1 CHECK ((((status = 'pending'::text) AND (attempt_count = 0) AND (next_attempt_at IS NOT NULL) AND (lease_token IS NULL) AND (lease_owner IS NULL) AND (claimed_at IS NULL) AND (lease_expires_at IS NULL) AND (outcome_lease_token IS NULL) AND (notification_id IS NULL) AND (delivered_at IS NULL) AND (terminal_failed_at IS NULL) AND (suppressed_at IS NULL) AND (last_error_code IS NULL) AND (last_error_detail IS NULL) AND (last_error_at IS NULL) AND (last_error_lease_token IS NULL)) OR ((status = 'leased'::text) AND ((attempt_count >= 1) AND (attempt_count <= max_attempts)) AND (next_attempt_at IS NULL) AND (lease_token IS NOT NULL) AND (lease_owner IS NOT NULL) AND (claimed_at IS NOT NULL) AND (lease_expires_at IS NOT NULL) AND (lease_expires_at > claimed_at) AND (outcome_lease_token IS NULL) AND (notification_id IS NULL) AND (delivered_at IS NULL) AND (terminal_failed_at IS NULL) AND (suppressed_at IS NULL)) OR ((status = 'failed'::text) AND ((attempt_count >= 1) AND (attempt_count <= (max_attempts - 1))) AND (next_attempt_at IS NOT NULL) AND (lease_token IS NULL) AND (lease_owner IS NULL) AND (claimed_at IS NULL) AND (lease_expires_at IS NULL) AND (outcome_lease_token IS NOT NULL) AND (notification_id IS NULL) AND (delivered_at IS NULL) AND (terminal_failed_at IS NULL) AND (suppressed_at IS NULL) AND (last_error_code IS NOT NULL) AND (last_error_detail IS NOT NULL) AND (last_error_at IS NOT NULL) AND (last_error_lease_token IS NOT NULL)) OR ((status = 'delivered'::text) AND ((attempt_count >= 1) AND (attempt_count <= max_attempts)) AND (next_attempt_at IS NULL) AND (lease_token IS NULL) AND (lease_owner IS NULL) AND (claimed_at IS NULL) AND (lease_expires_at IS NULL) AND (outcome_lease_token IS NOT NULL) AND (notification_id IS NOT NULL) AND (delivered_at IS NOT NULL) AND (terminal_failed_at IS NULL) AND (suppressed_at IS NULL)) OR ((status = 'terminal_failure'::text) AND (attempt_count = max_attempts) AND (next_attempt_at IS NULL) AND (lease_token IS NULL) AND (lease_owner IS NULL) AND (claimed_at IS NULL) AND (lease_expires_at IS NULL) AND (outcome_lease_token IS NOT NULL) AND (notification_id IS NULL) AND (delivered_at IS NULL) AND (terminal_failed_at IS NOT NULL) AND (suppressed_at IS NULL) AND (last_error_code IS NOT NULL) AND (last_error_detail IS NOT NULL) AND (last_error_at IS NOT NULL) AND (last_error_lease_token IS NOT NULL)) OR ((status = 'suppressed'::text) AND (next_attempt_at IS NULL) AND (lease_token IS NULL) AND (lease_owner IS NULL) AND (claimed_at IS NULL) AND (lease_expires_at IS NULL) AND (notification_id IS NULL) AND (delivered_at IS NULL) AND (terminal_failed_at IS NULL) AND (suppressed_at IS NOT NULL)))),
    CONSTRAINT triage_emergency_alert_notification_deliveries_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'leased'::text, 'failed'::text, 'delivered'::text, 'terminal_failure'::text, 'suppressed'::text])))
);


--
-- Name: triage_extractions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.triage_extractions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    error_message text,
    text_input text NOT NULL,
    source_filename text,
    patient_age integer,
    patient_sex text,
    note_type_detected text,
    extraction_confidence text,
    extracted_summary text,
    key_findings jsonb,
    original_text_length integer,
    ai_model_used text,
    ai_input_tokens integer,
    ai_output_tokens integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    tenant_id text DEFAULT 'default'::text NOT NULL,
    ingestion_mode text DEFAULT 'legacy_unknown'::text NOT NULL,
    source_pages jsonb DEFAULT '[]'::jsonb NOT NULL,
    source_sha256 text,
    packet_plan jsonb,
    coverage_status text DEFAULT 'legacy_unknown'::text NOT NULL,
    coverage_report jsonb,
    packet_emergency_result jsonb,
    model_map_result jsonb,
    model_reduce_result jsonb,
    safety_prompt_versions jsonb DEFAULT '{}'::jsonb NOT NULL,
    safety_screened_at timestamp with time zone,
    packet_plan_sha256 text,
    CONSTRAINT triage_extractions_extraction_coverage_status_check CHECK ((coverage_status = ANY (ARRAY['complete'::text, 'failed'::text, 'not_applicable'::text, 'legacy_unknown'::text]))),
    CONSTRAINT triage_extractions_ingestion_mode_check CHECK ((ingestion_mode = ANY (ARRAY['single_pass'::text, 'long_packet'::text, 'legacy_unknown'::text]))),
    CONSTRAINT triage_extractions_packet_plan_sha256_check CHECK (((packet_plan_sha256 IS NULL) OR (packet_plan_sha256 ~ '^[0-9a-f]{64}$'::text))),
    CONSTRAINT triage_extractions_safety_prompt_versions_shape_check CHECK ((jsonb_typeof(safety_prompt_versions) = 'object'::text)),
    CONSTRAINT triage_extractions_source_pages_shape_check CHECK ((jsonb_typeof(source_pages) = 'array'::text)),
    CONSTRAINT triage_extractions_source_sha256_check CHECK (((source_sha256 IS NULL) OR (source_sha256 ~ '^[0-9a-f]{64}$'::text))),
    CONSTRAINT triage_extractions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'complete'::text, 'error'::text])))
);


--
-- Name: triage_long_packet_chunk_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.triage_long_packet_chunk_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    tenant_id text NOT NULL,
    chunk_id text NOT NULL,
    branch text NOT NULL,
    configuration_sha256 text NOT NULL,
    source_sha256 text NOT NULL,
    plan_sha256 text NOT NULL,
    planner_version text NOT NULL,
    pipeline_version text NOT NULL,
    chunk_provenance_sha256 text NOT NULL,
    model_id text NOT NULL,
    prompt_version text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    max_attempts integer DEFAULT 3 NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    next_retry_at timestamp with time zone,
    lease_token uuid,
    lease_owner text,
    claimed_at timestamp with time zone,
    lease_expires_at timestamp with time zone,
    outcome_lease_token uuid,
    result jsonb,
    result_sha256 text,
    last_error_code text,
    last_error_detail text,
    last_error_at timestamp with time zone,
    last_error_lease_token uuid,
    finished_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT triage_long_packet_chunk_jobs_branch_check CHECK ((branch = ANY (ARRAY['mapper'::text, 'safety'::text]))),
    CONSTRAINT triage_long_packet_chunk_jobs_check CHECK (((attempt_count >= 0) AND (attempt_count <= max_attempts))),
    CONSTRAINT triage_long_packet_chunk_jobs_check1 CHECK ((((last_error_code IS NULL) AND (last_error_detail IS NULL) AND (last_error_at IS NULL) AND (last_error_lease_token IS NULL)) OR ((last_error_code IS NOT NULL) AND (last_error_detail IS NOT NULL) AND (last_error_at IS NOT NULL) AND (last_error_lease_token IS NOT NULL)))),
    CONSTRAINT triage_long_packet_chunk_jobs_check2 CHECK ((((status = 'pending'::text) AND (lease_token IS NULL) AND (lease_owner IS NULL) AND (claimed_at IS NULL) AND (lease_expires_at IS NULL) AND (outcome_lease_token IS NULL) AND (result IS NULL) AND (result_sha256 IS NULL) AND (finished_at IS NULL) AND (next_retry_at IS NULL)) OR ((status = 'leased'::text) AND (lease_token IS NOT NULL) AND (lease_owner IS NOT NULL) AND (claimed_at IS NOT NULL) AND (lease_expires_at > claimed_at) AND (outcome_lease_token IS NULL) AND (result IS NULL) AND (result_sha256 IS NULL) AND (finished_at IS NULL) AND (next_retry_at IS NULL) AND (attempt_count > 0)) OR ((status = 'complete'::text) AND (lease_token IS NULL) AND (lease_owner IS NULL) AND (claimed_at IS NULL) AND (lease_expires_at IS NULL) AND (outcome_lease_token IS NOT NULL) AND (jsonb_typeof(result) = 'object'::text) AND (result_sha256 IS NOT NULL) AND (finished_at IS NOT NULL) AND (next_retry_at IS NULL)) OR ((status = 'failed'::text) AND (lease_token IS NULL) AND (lease_owner IS NULL) AND (claimed_at IS NULL) AND (lease_expires_at IS NULL) AND (outcome_lease_token IS NOT NULL) AND (result IS NULL) AND (result_sha256 IS NULL) AND (last_error_code IS NOT NULL) AND (finished_at IS NOT NULL) AND ((next_retry_at IS NULL) OR (attempt_count < max_attempts))))),
    CONSTRAINT triage_long_packet_chunk_jobs_chunk_id_check CHECK (((length(TRIM(BOTH FROM chunk_id)) >= 1) AND (length(TRIM(BOTH FROM chunk_id)) <= 500))),
    CONSTRAINT triage_long_packet_chunk_jobs_chunk_provenance_sha256_check CHECK ((chunk_provenance_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT triage_long_packet_chunk_jobs_configuration_sha256_check CHECK ((configuration_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT triage_long_packet_chunk_jobs_last_error_code_check CHECK (((last_error_code IS NULL) OR (last_error_code ~ '^[a-z0-9_:-]{1,100}$'::text))),
    CONSTRAINT triage_long_packet_chunk_jobs_last_error_detail_check CHECK (((last_error_detail IS NULL) OR ((length(last_error_detail) >= 1) AND (length(last_error_detail) <= 4000)))),
    CONSTRAINT triage_long_packet_chunk_jobs_lease_owner_check CHECK (((lease_owner IS NULL) OR ((length(TRIM(BOTH FROM lease_owner)) >= 1) AND (length(TRIM(BOTH FROM lease_owner)) <= 200)))),
    CONSTRAINT triage_long_packet_chunk_jobs_max_attempts_check CHECK (((max_attempts >= 1) AND (max_attempts <= 20))),
    CONSTRAINT triage_long_packet_chunk_jobs_model_id_check CHECK ((length(TRIM(BOTH FROM model_id)) > 0)),
    CONSTRAINT triage_long_packet_chunk_jobs_pipeline_version_check CHECK ((length(TRIM(BOTH FROM pipeline_version)) > 0)),
    CONSTRAINT triage_long_packet_chunk_jobs_plan_sha256_check CHECK ((plan_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT triage_long_packet_chunk_jobs_planner_version_check CHECK ((length(TRIM(BOTH FROM planner_version)) > 0)),
    CONSTRAINT triage_long_packet_chunk_jobs_prompt_version_check CHECK ((length(TRIM(BOTH FROM prompt_version)) > 0)),
    CONSTRAINT triage_long_packet_chunk_jobs_result_sha256_check CHECK (((result_sha256 IS NULL) OR (result_sha256 ~ '^[0-9a-f]{64}$'::text))),
    CONSTRAINT triage_long_packet_chunk_jobs_source_sha256_check CHECK ((source_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT triage_long_packet_chunk_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'leased'::text, 'complete'::text, 'failed'::text])))
);


--
-- Name: triage_long_packet_finalization_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.triage_long_packet_finalization_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    tenant_id text NOT NULL,
    configuration_sha256 text NOT NULL,
    source_sha256 text NOT NULL,
    plan_sha256 text NOT NULL,
    planner_version text NOT NULL,
    pipeline_version text NOT NULL,
    expected_chunk_count integer NOT NULL,
    model_id text NOT NULL,
    prompt_version text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    max_attempts integer DEFAULT 3 NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    next_retry_at timestamp with time zone,
    lease_token uuid,
    lease_owner text,
    claimed_at timestamp with time zone,
    lease_expires_at timestamp with time zone,
    outcome_lease_token uuid,
    result jsonb,
    result_sha256 text,
    last_error_code text,
    last_error_detail text,
    last_error_at timestamp with time zone,
    last_error_lease_token uuid,
    finished_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT triage_long_packet_finalization_jobs_check CHECK (((attempt_count >= 0) AND (attempt_count <= max_attempts))),
    CONSTRAINT triage_long_packet_finalization_jobs_check1 CHECK ((((last_error_code IS NULL) AND (last_error_detail IS NULL) AND (last_error_at IS NULL) AND (last_error_lease_token IS NULL)) OR ((last_error_code IS NOT NULL) AND (last_error_detail IS NOT NULL) AND (last_error_at IS NOT NULL) AND (last_error_lease_token IS NOT NULL)))),
    CONSTRAINT triage_long_packet_finalization_jobs_check2 CHECK ((((status = 'pending'::text) AND (lease_token IS NULL) AND (lease_owner IS NULL) AND (claimed_at IS NULL) AND (lease_expires_at IS NULL) AND (outcome_lease_token IS NULL) AND (result IS NULL) AND (result_sha256 IS NULL) AND (finished_at IS NULL) AND (next_retry_at IS NULL)) OR ((status = 'leased'::text) AND (lease_token IS NOT NULL) AND (lease_owner IS NOT NULL) AND (claimed_at IS NOT NULL) AND (lease_expires_at > claimed_at) AND (outcome_lease_token IS NULL) AND (result IS NULL) AND (result_sha256 IS NULL) AND (finished_at IS NULL) AND (next_retry_at IS NULL) AND (attempt_count > 0)) OR ((status = 'complete'::text) AND (lease_token IS NULL) AND (lease_owner IS NULL) AND (claimed_at IS NULL) AND (lease_expires_at IS NULL) AND (outcome_lease_token IS NOT NULL) AND (jsonb_typeof(result) = 'object'::text) AND (result_sha256 IS NOT NULL) AND (finished_at IS NOT NULL) AND (next_retry_at IS NULL)) OR ((status = 'failed'::text) AND (lease_token IS NULL) AND (lease_owner IS NULL) AND (claimed_at IS NULL) AND (lease_expires_at IS NULL) AND (outcome_lease_token IS NOT NULL) AND (result IS NULL) AND (result_sha256 IS NULL) AND (last_error_code IS NOT NULL) AND (finished_at IS NOT NULL) AND ((next_retry_at IS NULL) OR (attempt_count < max_attempts))))),
    CONSTRAINT triage_long_packet_finalization_jobs_configuration_sha256_check CHECK ((configuration_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT triage_long_packet_finalization_jobs_expected_chunk_count_check CHECK ((expected_chunk_count > 0)),
    CONSTRAINT triage_long_packet_finalization_jobs_last_error_code_check CHECK (((last_error_code IS NULL) OR (last_error_code ~ '^[a-z0-9_:-]{1,100}$'::text))),
    CONSTRAINT triage_long_packet_finalization_jobs_last_error_detail_check CHECK (((last_error_detail IS NULL) OR ((length(last_error_detail) >= 1) AND (length(last_error_detail) <= 4000)))),
    CONSTRAINT triage_long_packet_finalization_jobs_lease_owner_check CHECK (((lease_owner IS NULL) OR ((length(TRIM(BOTH FROM lease_owner)) >= 1) AND (length(TRIM(BOTH FROM lease_owner)) <= 200)))),
    CONSTRAINT triage_long_packet_finalization_jobs_max_attempts_check CHECK (((max_attempts >= 1) AND (max_attempts <= 20))),
    CONSTRAINT triage_long_packet_finalization_jobs_model_id_check CHECK ((length(TRIM(BOTH FROM model_id)) > 0)),
    CONSTRAINT triage_long_packet_finalization_jobs_pipeline_version_check CHECK ((length(TRIM(BOTH FROM pipeline_version)) > 0)),
    CONSTRAINT triage_long_packet_finalization_jobs_plan_sha256_check CHECK ((plan_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT triage_long_packet_finalization_jobs_planner_version_check CHECK ((length(TRIM(BOTH FROM planner_version)) > 0)),
    CONSTRAINT triage_long_packet_finalization_jobs_prompt_version_check CHECK ((length(TRIM(BOTH FROM prompt_version)) > 0)),
    CONSTRAINT triage_long_packet_finalization_jobs_result_sha256_check CHECK (((result_sha256 IS NULL) OR (result_sha256 ~ '^[0-9a-f]{64}$'::text))),
    CONSTRAINT triage_long_packet_finalization_jobs_source_sha256_check CHECK ((source_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT triage_long_packet_finalization_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'leased'::text, 'complete'::text, 'failed'::text])))
);


--
-- Name: triage_long_packet_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.triage_long_packet_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    extraction_id uuid NOT NULL,
    tenant_id text NOT NULL,
    configuration_sha256 text NOT NULL,
    run_purpose text NOT NULL,
    source_sha256 text NOT NULL,
    plan_sha256 text NOT NULL,
    expected_chunk_count integer NOT NULL,
    planner_version text NOT NULL,
    pipeline_version text NOT NULL,
    mapper_model_id text NOT NULL,
    mapper_prompt_version text NOT NULL,
    safety_model_id text NOT NULL,
    safety_prompt_version text NOT NULL,
    reducer_model_id text NOT NULL,
    reducer_prompt_version text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    last_error_code text,
    last_error_detail text,
    last_failed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT triage_long_packet_runs_check CHECK ((((last_error_code IS NULL) AND (last_error_detail IS NULL) AND (last_failed_at IS NULL)) OR ((last_error_code IS NOT NULL) AND (last_error_detail IS NOT NULL) AND (last_failed_at IS NOT NULL)))),
    CONSTRAINT triage_long_packet_runs_check1 CHECK ((((status = 'pending'::text) AND (started_at IS NULL) AND (completed_at IS NULL) AND (last_error_code IS NULL)) OR ((status = 'running'::text) AND (started_at IS NOT NULL) AND (completed_at IS NULL)) OR ((status = 'failed'::text) AND (started_at IS NOT NULL) AND (completed_at IS NULL) AND (last_error_code IS NOT NULL)) OR ((status = 'complete'::text) AND (started_at IS NOT NULL) AND (completed_at IS NOT NULL)))),
    CONSTRAINT triage_long_packet_runs_configuration_sha256_check CHECK ((configuration_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT triage_long_packet_runs_expected_chunk_count_check CHECK ((expected_chunk_count > 0)),
    CONSTRAINT triage_long_packet_runs_last_error_code_check CHECK (((last_error_code IS NULL) OR (last_error_code ~ '^[a-z0-9_:-]{1,100}$'::text))),
    CONSTRAINT triage_long_packet_runs_last_error_detail_check CHECK (((last_error_detail IS NULL) OR ((length(last_error_detail) >= 1) AND (length(last_error_detail) <= 4000)))),
    CONSTRAINT triage_long_packet_runs_mapper_model_id_check CHECK ((length(TRIM(BOTH FROM mapper_model_id)) > 0)),
    CONSTRAINT triage_long_packet_runs_mapper_prompt_version_check CHECK ((length(TRIM(BOTH FROM mapper_prompt_version)) > 0)),
    CONSTRAINT triage_long_packet_runs_pipeline_version_check CHECK ((length(TRIM(BOTH FROM pipeline_version)) > 0)),
    CONSTRAINT triage_long_packet_runs_plan_sha256_check CHECK ((plan_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT triage_long_packet_runs_planner_version_check CHECK ((length(TRIM(BOTH FROM planner_version)) > 0)),
    CONSTRAINT triage_long_packet_runs_reducer_model_id_check CHECK ((length(TRIM(BOTH FROM reducer_model_id)) > 0)),
    CONSTRAINT triage_long_packet_runs_reducer_prompt_version_check CHECK ((length(TRIM(BOTH FROM reducer_prompt_version)) > 0)),
    CONSTRAINT triage_long_packet_runs_run_purpose_check CHECK ((run_purpose = ANY (ARRAY['primary'::text, 'shadow'::text, 'reprocess'::text]))),
    CONSTRAINT triage_long_packet_runs_safety_model_id_check CHECK ((length(TRIM(BOTH FROM safety_model_id)) > 0)),
    CONSTRAINT triage_long_packet_runs_safety_prompt_version_check CHECK ((length(TRIM(BOTH FROM safety_prompt_version)) > 0)),
    CONSTRAINT triage_long_packet_runs_source_sha256_check CHECK ((source_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT triage_long_packet_runs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'complete'::text, 'failed'::text])))
);


--
-- Name: triage_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.triage_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    referral_text text NOT NULL,
    patient_age integer,
    patient_sex text,
    referring_provider_type text,
    triage_tier text,
    confidence text,
    dimension_scores jsonb,
    weighted_score numeric(4,2),
    clinical_reasons jsonb DEFAULT '[]'::jsonb NOT NULL,
    red_flags jsonb DEFAULT '[]'::jsonb NOT NULL,
    suggested_workup jsonb DEFAULT '[]'::jsonb NOT NULL,
    failed_therapies jsonb DEFAULT '[]'::jsonb NOT NULL,
    missing_information jsonb,
    subspecialty_recommendation text,
    subspecialty_rationale text,
    ai_model_used text,
    ai_raw_response jsonb,
    physician_override_tier text,
    physician_override_reason text,
    flagged_for_review boolean DEFAULT false NOT NULL,
    status text DEFAULT 'pending_review'::text NOT NULL,
    patient_id uuid,
    source_type text DEFAULT 'paste'::text,
    source_filename text,
    extracted_summary text,
    extraction_confidence text,
    note_type_detected text,
    batch_id uuid,
    fusion_group_id uuid,
    ai_input_tokens integer,
    ai_output_tokens integer,
    processing_status text DEFAULT 'complete'::text NOT NULL,
    error_message text,
    completed_at timestamp with time zone,
    consult_id uuid,
    scheduled_appointment_id uuid,
    tenant_id text DEFAULT 'default'::text NOT NULL,
    source_extraction_id uuid,
    care_pathway text DEFAULT 'undetermined'::text NOT NULL,
    data_quality text DEFAULT 'partial'::text NOT NULL,
    coverage_status text DEFAULT 'legacy_unknown'::text NOT NULL,
    review_requirement text DEFAULT 'clinician_confirmation'::text NOT NULL,
    workflow_status text DEFAULT 'pending_safety_screen'::text NOT NULL,
    scheduling_locked boolean DEFAULT true NOT NULL,
    owner_user_id text,
    owner_team text,
    due_at timestamp with time zone,
    next_escalation_at timestamp with time zone,
    reviewed_by text,
    reviewed_at timestamp with time zone,
    final_triage_tier text,
    final_care_pathway text,
    closure_code text,
    closed_at timestamp with time zone,
    algorithm_version text,
    rule_version text,
    prompt_versions jsonb DEFAULT '{}'::jsonb NOT NULL,
    safety_shadow_result jsonb,
    processing_claimed_at timestamp with time zone,
    processing_lease_expires_at timestamp with time zone,
    processing_attempt_count integer DEFAULT 0 NOT NULL,
    CONSTRAINT triage_sessions_care_pathway_check CHECK ((care_pathway = ANY (ARRAY['emergency_now'::text, 'same_day_clinician_review'::text, 'expedited_outpatient'::text, 'routine_outpatient'::text, 'redirect'::text, 'undetermined'::text]))),
    CONSTRAINT triage_sessions_coverage_status_check CHECK ((coverage_status = ANY (ARRAY['complete'::text, 'partial'::text, 'failed'::text, 'not_applicable'::text, 'legacy_unknown'::text]))),
    CONSTRAINT triage_sessions_data_quality_check CHECK ((data_quality = ANY (ARRAY['sufficient'::text, 'partial'::text, 'insufficient'::text, 'conflicting'::text]))),
    CONSTRAINT triage_sessions_processing_attempt_count_check CHECK ((processing_attempt_count >= 0)),
    CONSTRAINT triage_sessions_processing_lease_pair_check CHECK ((((processing_claimed_at IS NULL) AND (processing_lease_expires_at IS NULL)) OR ((processing_claimed_at IS NOT NULL) AND (processing_lease_expires_at IS NOT NULL) AND (processing_lease_expires_at > processing_claimed_at)))),
    CONSTRAINT triage_sessions_processing_status_check CHECK ((processing_status = ANY (ARRAY['pending'::text, 'complete'::text, 'error'::text]))),
    CONSTRAINT triage_sessions_review_requirement_check CHECK ((review_requirement = ANY (ARRAY['emergency_action'::text, 'immediate_clinician_review'::text, 'clinician_confirmation'::text, 'none'::text]))),
    CONSTRAINT triage_sessions_terminal_processing_lease_check CHECK (((processing_status <> ALL (ARRAY['complete'::text, 'error'::text])) OR ((processing_claimed_at IS NULL) AND (processing_lease_expires_at IS NULL)))),
    CONSTRAINT triage_sessions_workflow_status_check CHECK ((workflow_status = ANY (ARRAY['pending_safety_screen'::text, 'emergency_hold'::text, 'clinician_review'::text, 'provider_clarification'::text, 'patient_clarification'::text, 'decision_ready'::text, 'action_pending'::text, 'closed'::text])))
);


--
-- Name: triage_workflow_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.triage_workflow_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    triage_session_id uuid NOT NULL,
    emergency_action_id uuid,
    clarification_question_id uuid,
    event_type text NOT NULL,
    actor_kind text NOT NULL,
    actor_id text,
    actor_role text,
    previous_state text,
    new_state text,
    reason text NOT NULL,
    model_profile text,
    prompt_version text,
    rule_version text,
    correlation_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT triage_workflow_events_actor_kind_check CHECK ((actor_kind = ANY (ARRAY['system'::text, 'model'::text, 'clinician'::text, 'staff'::text, 'patient'::text, 'provider'::text])))
);


--
-- Name: user_activity_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_activity_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    action text NOT NULL,
    target text,
    metadata jsonb DEFAULT '{}'::jsonb,
    "timestamp" timestamp with time zone DEFAULT now()
);


--
-- Name: user_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_profiles (
    id uuid NOT NULL,
    display_name text,
    role text DEFAULT 'demo'::text,
    organization text,
    specialty text,
    created_at timestamp with time zone DEFAULT now(),
    last_login timestamp with time zone DEFAULT now()
);


--
-- Name: validation_ai_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.validation_ai_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid NOT NULL,
    run_number integer NOT NULL,
    temperature numeric(3,2) DEFAULT 0.2 NOT NULL,
    ai_triage_tier text,
    ai_weighted_score numeric(4,2),
    ai_dimension_scores jsonb,
    ai_subspecialty text,
    ai_redirect_to_non_neuro boolean DEFAULT false,
    ai_redirect_specialty text,
    ai_confidence text,
    ai_session_id uuid,
    ai_raw_response jsonb,
    duration_ms integer,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    model text DEFAULT 'unknown'::text NOT NULL
);


--
-- Name: validation_cases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.validation_cases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_number integer NOT NULL,
    title text NOT NULL,
    referral_text text NOT NULL,
    patient_age integer,
    patient_sex text,
    ai_triage_tier text,
    ai_weighted_score numeric(4,2),
    ai_dimension_scores jsonb,
    ai_subspecialty text,
    ai_redirect_to_non_neuro boolean DEFAULT false,
    ai_redirect_specialty text,
    ai_confidence text,
    ai_session_id uuid,
    study_name text DEFAULT 'default'::text NOT NULL,
    is_calibration boolean DEFAULT false NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    scenario_id text
);


--
-- Name: validation_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.validation_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid NOT NULL,
    reviewer_id uuid NOT NULL,
    triage_tier text NOT NULL,
    subspecialty text,
    redirect_to_non_neuro boolean DEFAULT false NOT NULL,
    redirect_specialty text,
    confidence text,
    key_factors text[] DEFAULT '{}'::text[],
    reasoning text,
    started_at timestamp with time zone,
    completed_at timestamp with time zone DEFAULT now() NOT NULL,
    duration_seconds integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: visits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visits (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    patient_id uuid NOT NULL,
    user_id uuid NOT NULL,
    visit_date timestamp with time zone NOT NULL,
    visit_type text NOT NULL,
    chief_complaint text[] DEFAULT '{}'::text[],
    status text DEFAULT 'scheduled'::text,
    tenant_id text DEFAULT 'default'::text NOT NULL
);


--
-- Name: vitals_readings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vitals_readings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    device_source_id uuid NOT NULL,
    reading_time timestamp with time zone NOT NULL,
    reading_type character varying(50) NOT NULL,
    value_json jsonb NOT NULL,
    source_device character varying(50) DEFAULT 'withings'::character varying,
    attrib integer,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: wearable_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wearable_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    anomaly_id uuid,
    patient_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    alert_type text NOT NULL,
    severity text DEFAULT 'informational'::text NOT NULL,
    title text NOT NULL,
    body text,
    acknowledged boolean DEFAULT false NOT NULL,
    escalated_to_md boolean DEFAULT false NOT NULL,
    action_taken text
);


--
-- Name: wearable_anomalies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wearable_anomalies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    detected_at timestamp with time zone DEFAULT now() NOT NULL,
    anomaly_type text NOT NULL,
    severity text DEFAULT 'informational'::text NOT NULL,
    trigger_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    ai_assessment text,
    ai_reasoning text,
    clinical_significance text,
    recommended_action text,
    patient_message text,
    source_device text DEFAULT 'apple_watch'::text NOT NULL
);


--
-- Name: wearable_clinical_narratives; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wearable_clinical_narratives (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    narrative_type text NOT NULL,
    assessment_id uuid,
    structured_summary jsonb,
    clinical_narrative text,
    model_versions jsonb DEFAULT '{"stage1": "gpt-5-mini", "stage2": "gpt-5.2"}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: wearable_critical_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wearable_critical_events (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    patient_id uuid NOT NULL,
    detected_at timestamp with time zone NOT NULL,
    anomaly_type text NOT NULL,
    severity text NOT NULL,
    trigger_data jsonb,
    clinical_significance text,
    created_at timestamp with time zone DEFAULT now(),
    source_device text DEFAULT 'apple_watch'::text NOT NULL
);


--
-- Name: wearable_daily_summaries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wearable_daily_summaries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    date date NOT NULL,
    metrics jsonb DEFAULT '{}'::jsonb NOT NULL,
    anomalies_detected jsonb DEFAULT '[]'::jsonb NOT NULL,
    ai_analysis text,
    overall_status text DEFAULT 'normal'::text NOT NULL,
    source_device text DEFAULT 'apple_watch'::text NOT NULL
);


--
-- Name: wearable_device_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wearable_device_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    device_type text NOT NULL,
    device_name text,
    connection_status text DEFAULT 'active'::text NOT NULL,
    auth_data jsonb,
    last_sync_at timestamp with time zone,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: wearable_fluency_assessments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wearable_fluency_assessments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    assessed_at timestamp with time zone DEFAULT now() NOT NULL,
    category text NOT NULL,
    total_words integer DEFAULT 0 NOT NULL,
    quartile_words integer[] DEFAULT '{0,0,0,0}'::integer[] NOT NULL,
    repetitions integer DEFAULT 0 NOT NULL,
    errors integer DEFAULT 0 NOT NULL,
    clustering_score double precision,
    transcript text,
    word_list text[] DEFAULT '{}'::text[],
    composite_score double precision DEFAULT 0 NOT NULL,
    ai_refined boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    semantic_clusters jsonb,
    switch_count integer,
    perseveration_types jsonb,
    intrusion_types jsonb,
    temporal_slope double precision,
    confidence_weighted_score double precision,
    source_device text DEFAULT 'apple_watch'::text NOT NULL
);


--
-- Name: wearable_gait_assessments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wearable_gait_assessments (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    patient_id uuid NOT NULL,
    assessed_at timestamp with time zone NOT NULL,
    composite_score double precision NOT NULL,
    asymmetry_index double precision NOT NULL,
    overall_cadence double precision NOT NULL,
    hands jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    source_device text DEFAULT 'apple_watch'::text NOT NULL
);


--
-- Name: wearable_hourly_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wearable_hourly_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    hour_timestamp timestamp with time zone NOT NULL,
    avg_hr double precision,
    hrv_sdnn double precision,
    spo2_avg double precision,
    steps integer,
    active_calories double precision,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    source_device text DEFAULT 'apple_watch'::text NOT NULL
);


--
-- Name: wearable_patients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wearable_patients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    name text NOT NULL,
    age integer NOT NULL,
    sex text NOT NULL,
    primary_diagnosis text NOT NULL,
    medications jsonb DEFAULT '[]'::jsonb NOT NULL,
    wearable_devices jsonb DEFAULT '[]'::jsonb NOT NULL,
    baseline_metrics jsonb DEFAULT '{}'::jsonb NOT NULL,
    monitoring_start_date date DEFAULT CURRENT_DATE NOT NULL
);


--
-- Name: wearable_spiral_assessments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wearable_spiral_assessments (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    patient_id uuid NOT NULL,
    assessed_at timestamp with time zone NOT NULL,
    composite_score double precision NOT NULL,
    classification text NOT NULL,
    classification_confidence double precision NOT NULL,
    asymmetry_index double precision NOT NULL,
    hands jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    source_device text DEFAULT 'apple_watch'::text NOT NULL
);


--
-- Name: wearable_tapping_assessments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wearable_tapping_assessments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    assessed_at timestamp with time zone DEFAULT now() NOT NULL,
    composite_score double precision NOT NULL,
    asymmetry_index double precision DEFAULT 0 NOT NULL,
    hands jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    ai_refined boolean DEFAULT false NOT NULL,
    fatigue_curve_type text,
    bradykinesia_severity text,
    source_device text DEFAULT 'apple_watch'::text NOT NULL
);


--
-- Name: wearable_tremor_assessments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wearable_tremor_assessments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    assessed_at timestamp with time zone DEFAULT now() NOT NULL,
    composite_score double precision NOT NULL,
    composite_intensity double precision NOT NULL,
    tasks jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    ai_refined boolean DEFAULT false,
    dominant_pattern text,
    source_device text DEFAULT 'apple_watch'::text NOT NULL
);


--
-- Name: historian_evaluations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historian_evaluations ALTER COLUMN id SET DEFAULT nextval('public.historian_evaluations_id_seq'::regclass);


--
-- Name: historian_transcript_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historian_transcript_events ALTER COLUMN id SET DEFAULT nextval('public.historian_transcript_events_id_seq'::regclass);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (id);


--
-- Name: appointments appointments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_pkey PRIMARY KEY (id);


--
-- Name: clara_test_feedback clara_test_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clara_test_feedback
    ADD CONSTRAINT clara_test_feedback_pkey PRIMARY KEY (id);


--
-- Name: clara_test_sessions clara_test_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clara_test_sessions
    ADD CONSTRAINT clara_test_sessions_pkey PRIMARY KEY (id);


--
-- Name: clinical_access_memberships clinical_access_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_access_memberships
    ADD CONSTRAINT clinical_access_memberships_pkey PRIMARY KEY (user_id, tenant_id);


--
-- Name: clinical_notes clinical_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_notes
    ADD CONSTRAINT clinical_notes_pkey PRIMARY KEY (id);


--
-- Name: clinical_plans clinical_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_plans
    ADD CONSTRAINT clinical_plans_pkey PRIMARY KEY (id);


--
-- Name: clinical_scales clinical_scales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_scales
    ADD CONSTRAINT clinical_scales_pkey PRIMARY KEY (id);


--
-- Name: condition_scale_mapping condition_scale_mapping_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.condition_scale_mapping
    ADD CONSTRAINT condition_scale_mapping_pkey PRIMARY KEY (id);


--
-- Name: consult_reports consult_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consult_reports
    ADD CONSTRAINT consult_reports_pkey PRIMARY KEY (id);


--
-- Name: device_daily_readings device_daily_readings_patient_id_device_source_id_reading_d_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_daily_readings
    ADD CONSTRAINT device_daily_readings_patient_id_device_source_id_reading_d_key UNIQUE (patient_id, device_source_id, reading_date);


--
-- Name: device_daily_readings device_daily_readings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_daily_readings
    ADD CONSTRAINT device_daily_readings_pkey PRIMARY KEY (id);


--
-- Name: dexcom_events dexcom_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dexcom_events
    ADD CONSTRAINT dexcom_events_pkey PRIMARY KEY (id);


--
-- Name: diagnoses diagnoses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diagnoses
    ADD CONSTRAINT diagnoses_pkey PRIMARY KEY (id);


--
-- Name: dot_phrases dot_phrases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dot_phrases
    ADD CONSTRAINT dot_phrases_pkey PRIMARY KEY (id);


--
-- Name: feedback_comments feedback_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback_comments
    ADD CONSTRAINT feedback_comments_pkey PRIMARY KEY (id);


--
-- Name: feedback feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_pkey PRIMARY KEY (id);


--
-- Name: followup_billing_entries followup_billing_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followup_billing_entries
    ADD CONSTRAINT followup_billing_entries_pkey PRIMARY KEY (id);


--
-- Name: followup_escalations followup_escalations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followup_escalations
    ADD CONSTRAINT followup_escalations_pkey PRIMARY KEY (id);


--
-- Name: followup_sessions followup_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followup_sessions
    ADD CONSTRAINT followup_sessions_pkey PRIMARY KEY (id);


--
-- Name: glucose_readings glucose_readings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.glucose_readings
    ADD CONSTRAINT glucose_readings_pkey PRIMARY KEY (id);


--
-- Name: historian_evaluations historian_evaluations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historian_evaluations
    ADD CONSTRAINT historian_evaluations_pkey PRIMARY KEY (id);


--
-- Name: historian_sessions historian_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historian_sessions
    ADD CONSTRAINT historian_sessions_pkey PRIMARY KEY (id);


--
-- Name: historian_transcript_events historian_transcript_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historian_transcript_events
    ADD CONSTRAINT historian_transcript_events_pkey PRIMARY KEY (id);


--
-- Name: historian_transcript_events historian_transcript_events_session_id_seq_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historian_transcript_events
    ADD CONSTRAINT historian_transcript_events_session_id_seq_key UNIQUE (session_id, seq);


--
-- Name: imaging_studies imaging_studies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.imaging_studies
    ADD CONSTRAINT imaging_studies_pkey PRIMARY KEY (id);


--
-- Name: medication_reviews medication_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medication_reviews
    ADD CONSTRAINT medication_reviews_pkey PRIMARY KEY (id);


--
-- Name: neurology_consults neurology_consults_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.neurology_consults
    ADD CONSTRAINT neurology_consults_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: patient_allergies patient_allergies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_allergies
    ADD CONSTRAINT patient_allergies_pkey PRIMARY KEY (id);


--
-- Name: patient_body_map_markers patient_body_map_markers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_body_map_markers
    ADD CONSTRAINT patient_body_map_markers_pkey PRIMARY KEY (id);


--
-- Name: patient_device_measurements patient_device_measurements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_device_measurements
    ADD CONSTRAINT patient_device_measurements_pkey PRIMARY KEY (id);


--
-- Name: patient_intake_forms patient_intake_forms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_intake_forms
    ADD CONSTRAINT patient_intake_forms_pkey PRIMARY KEY (id);


--
-- Name: patient_medications patient_medications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_medications
    ADD CONSTRAINT patient_medications_pkey PRIMARY KEY (id);


--
-- Name: patient_messages patient_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_messages
    ADD CONSTRAINT patient_messages_pkey PRIMARY KEY (id);


--
-- Name: patients patients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patients
    ADD CONSTRAINT patients_pkey PRIMARY KEY (id);


--
-- Name: red_flag_events red_flag_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.red_flag_events
    ADD CONSTRAINT red_flag_events_pkey PRIMARY KEY (id);


--
-- Name: rpm_billing_periods rpm_billing_periods_patient_id_period_start_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rpm_billing_periods
    ADD CONSTRAINT rpm_billing_periods_patient_id_period_start_key UNIQUE (patient_id, period_start);


--
-- Name: rpm_billing_periods rpm_billing_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rpm_billing_periods
    ADD CONSTRAINT rpm_billing_periods_pkey PRIMARY KEY (id);


--
-- Name: saved_plans saved_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_plans
    ADD CONSTRAINT saved_plans_pkey PRIMARY KEY (id);


--
-- Name: scale_definitions scale_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scale_definitions
    ADD CONSTRAINT scale_definitions_pkey PRIMARY KEY (id);


--
-- Name: scale_results scale_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scale_results
    ADD CONSTRAINT scale_results_pkey PRIMARY KEY (id);


--
-- Name: triage_batches triage_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.triage_batches
    ADD CONSTRAINT triage_batches_pkey PRIMARY KEY (id);


--
-- Name: triage_clarification_questions triage_clarification_question_triage_session_id_question_co_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.triage_clarification_questions
    ADD CONSTRAINT triage_clarification_question_triage_session_id_question_co_key UNIQUE (triage_session_id, question_code);


--
-- Name: triage_clarification_questions triage_clarification_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.triage_clarification_questions
    ADD CONSTRAINT triage_clarification_questions_pkey PRIMARY KEY (id);


--
-- Name: triage_emergency_action_alerts triage_emergency_action_alert_emergency_action_id_sequence__key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.triage_emergency_action_alerts
    ADD CONSTRAINT triage_emergency_action_alert_emergency_action_id_sequence__key UNIQUE (emergency_action_id, sequence_number);


--
-- Name: triage_emergency_action_alerts triage_emergency_action_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.triage_emergency_action_alerts
    ADD CONSTRAINT triage_emergency_action_alerts_pkey PRIMARY KEY (id);


--
-- Name: triage_emergency_actions triage_emergency_actions_handoff_evidence_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.triage_emergency_actions
    ADD CONSTRAINT triage_emergency_actions_handoff_evidence_check CHECK (((status <> 'handed_off'::text) OR ((contact_attempted_at IS NOT NULL) AND (contact_channel IS NOT NULL) AND (instruction_given IS NOT NULL) AND (delivery_status = ANY (ARRAY['delivered'::text, 'not_applicable'::text])) AND (understanding_status = ANY (ARRAY['confirmed'::text, 'not_applicable'::text])) AND (outcome IS NOT NULL) AND (((delivery_status = 'delivered'::text) AND (understanding_status = 'confirmed'::text)) OR ((contact_channel = 'emergency_services'::text) AND (delivery_status = 'not_applicable'::text) AND (understanding_status = 'not_applicable'::text)))))) NOT VALID;


--
-- Name: triage_emergency_actions triage_emergency_actions_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.triage_emergency_actions
    ADD CONSTRAINT triage_emergency_actions_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: triage_emergency_actions triage_emergency_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.triage_emergency_actions
    ADD CONSTRAINT triage_emergency_actions_pkey PRIMARY KEY (id);


--
-- Name: triage_emergency_alert_notification_deliveries triage_emergency_alert_notifi_emergency_alert_id_emergency__key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.triage_emergency_alert_notification_deliveries
    ADD CONSTRAINT triage_emergency_alert_notifi_emergency_alert_id_emergency__key UNIQUE (emergency_alert_id, emergency_action_id);


--
-- Name: triage_emergency_alert_notification_deliveries triage_emergency_alert_notification_deliver_notification_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.triage_emergency_alert_notification_deliveries
    ADD CONSTRAINT triage_emergency_alert_notification_deliver_notification_id_key UNIQUE (notification_id);


--
-- Name: triage_emergency_alert_notification_deliveries triage_emergency_alert_notification_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.triage_emergency_alert_notification_deliveries
    ADD CONSTRAINT triage_emergency_alert_notification_deliveries_pkey PRIMARY KEY (emergency_alert_id);


--
-- Name: triage_extractions triage_extractions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.triage_extractions
    ADD CONSTRAINT triage_extractions_pkey PRIMARY KEY (id);


--
-- Name: triage_long_packet_chunk_jobs triage_long_packet_chunk_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.triage_long_packet_chunk_jobs
    ADD CONSTRAINT triage_long_packet_chunk_jobs_pkey PRIMARY KEY (id);


--
-- Name: triage_long_packet_chunk_jobs triage_long_packet_chunk_jobs_run_id_chunk_id_branch_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.triage_long_packet_chunk_jobs
    ADD CONSTRAINT triage_long_packet_chunk_jobs_run_id_chunk_id_branch_key UNIQUE (run_id, chunk_id, branch);


--
-- Name: triage_long_packet_finalization_jobs triage_long_packet_finalization_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.triage_long_packet_finalization_jobs
    ADD CONSTRAINT triage_long_packet_finalization_jobs_pkey PRIMARY KEY (id);


--
-- Name: triage_long_packet_finalization_jobs triage_long_packet_finalization_jobs_run_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.triage_long_packet_finalization_jobs
    ADD CONSTRAINT triage_long_packet_finalization_jobs_run_id_key UNIQUE (run_id);


--
-- Name: triage_long_packet_runs triage_long_packet_runs_extraction_id_configuration_sha256_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.triage_long_packet_runs
    ADD CONSTRAINT triage_long_packet_runs_extraction_id_configuration_sha256_key UNIQUE (extraction_id, configuration_sha256);


--
-- Name: triage_long_packet_runs triage_long_packet_runs_id_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.triage_long_packet_runs
    ADD CONSTRAINT triage_long_packet_runs_id_tenant_id_key UNIQUE (id, tenant_id);


--
-- Name: triage_long_packet_runs triage_long_packet_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.triage_long_packet_runs
    ADD CONSTRAINT triage_long_packet_runs_pkey PRIMARY KEY (id);


--
-- Name: triage_sessions triage_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.triage_sessions
    ADD CONSTRAINT triage_sessions_pkey PRIMARY KEY (id);


--
-- Name: triage_workflow_events triage_workflow_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.triage_workflow_events
    ADD CONSTRAINT triage_workflow_events_pkey PRIMARY KEY (id);


--
-- Name: user_activity_log user_activity_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_activity_log
    ADD CONSTRAINT user_activity_log_pkey PRIMARY KEY (id);


--
-- Name: user_profiles user_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (id);


--
-- Name: validation_ai_runs validation_ai_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.validation_ai_runs
    ADD CONSTRAINT validation_ai_runs_pkey PRIMARY KEY (id);


--
-- Name: validation_cases validation_cases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.validation_cases
    ADD CONSTRAINT validation_cases_pkey PRIMARY KEY (id);


--
-- Name: validation_reviews validation_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.validation_reviews
    ADD CONSTRAINT validation_reviews_pkey PRIMARY KEY (id);


--
-- Name: visits visits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT visits_pkey PRIMARY KEY (id);


--
-- Name: vitals_readings vitals_readings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vitals_readings
    ADD CONSTRAINT vitals_readings_pkey PRIMARY KEY (id);


--
-- Name: wearable_alerts wearable_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wearable_alerts
    ADD CONSTRAINT wearable_alerts_pkey PRIMARY KEY (id);


--
-- Name: wearable_anomalies wearable_anomalies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wearable_anomalies
    ADD CONSTRAINT wearable_anomalies_pkey PRIMARY KEY (id);


--
-- Name: wearable_clinical_narratives wearable_clinical_narratives_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wearable_clinical_narratives
    ADD CONSTRAINT wearable_clinical_narratives_pkey PRIMARY KEY (id);


--
-- Name: wearable_critical_events wearable_critical_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wearable_critical_events
    ADD CONSTRAINT wearable_critical_events_pkey PRIMARY KEY (id);


--
-- Name: wearable_daily_summaries wearable_daily_summaries_patient_date_device_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wearable_daily_summaries
    ADD CONSTRAINT wearable_daily_summaries_patient_date_device_key UNIQUE (patient_id, date, source_device);


--
-- Name: wearable_daily_summaries wearable_daily_summaries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wearable_daily_summaries
    ADD CONSTRAINT wearable_daily_summaries_pkey PRIMARY KEY (id);


--
-- Name: wearable_device_sources wearable_device_sources_patient_id_device_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wearable_device_sources
    ADD CONSTRAINT wearable_device_sources_patient_id_device_type_key UNIQUE (patient_id, device_type);


--
-- Name: wearable_device_sources wearable_device_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wearable_device_sources
    ADD CONSTRAINT wearable_device_sources_pkey PRIMARY KEY (id);


--
-- Name: wearable_fluency_assessments wearable_fluency_assessments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wearable_fluency_assessments
    ADD CONSTRAINT wearable_fluency_assessments_pkey PRIMARY KEY (id);


--
-- Name: wearable_gait_assessments wearable_gait_assessments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wearable_gait_assessments
    ADD CONSTRAINT wearable_gait_assessments_pkey PRIMARY KEY (id);


--
-- Name: wearable_hourly_snapshots wearable_hourly_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wearable_hourly_snapshots
    ADD CONSTRAINT wearable_hourly_snapshots_pkey PRIMARY KEY (id);


--
-- Name: wearable_patients wearable_patients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wearable_patients
    ADD CONSTRAINT wearable_patients_pkey PRIMARY KEY (id);


--
-- Name: wearable_spiral_assessments wearable_spiral_assessments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wearable_spiral_assessments
    ADD CONSTRAINT wearable_spiral_assessments_pkey PRIMARY KEY (id);


--
-- Name: wearable_tapping_assessments wearable_tapping_assessments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wearable_tapping_assessments
    ADD CONSTRAINT wearable_tapping_assessments_pkey PRIMARY KEY (id);


--
-- Name: wearable_tremor_assessments wearable_tremor_assessments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wearable_tremor_assessments
    ADD CONSTRAINT wearable_tremor_assessments_pkey PRIMARY KEY (id);


--
-- Name: idx_appointments_triage_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointments_triage_session ON public.appointments USING btree (triage_session_id) WHERE (triage_session_id IS NOT NULL);


--
-- Name: idx_billing_periods_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_periods_patient ON public.rpm_billing_periods USING btree (patient_id, period_start DESC);


--
-- Name: idx_billing_periods_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_periods_status ON public.rpm_billing_periods USING btree (status);


--
-- Name: idx_body_map_consult; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_body_map_consult ON public.patient_body_map_markers USING btree (consult_id);


--
-- Name: idx_body_map_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_body_map_patient ON public.patient_body_map_markers USING btree (patient_id);


--
-- Name: idx_clara_test_feedback_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clara_test_feedback_created_at ON public.clara_test_feedback USING btree (created_at DESC);


--
-- Name: idx_clara_test_feedback_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clara_test_feedback_session_id ON public.clara_test_feedback USING btree (session_id);


--
-- Name: idx_clara_test_feedback_verdict; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clara_test_feedback_verdict ON public.clara_test_feedback USING btree (verdict);


--
-- Name: idx_clara_test_sessions_consult_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clara_test_sessions_consult_type ON public.clara_test_sessions USING btree (consult_type);


--
-- Name: idx_clara_test_sessions_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clara_test_sessions_created_at ON public.clara_test_sessions USING btree (created_at DESC);


--
-- Name: idx_clinical_access_memberships_tenant_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clinical_access_memberships_tenant_role ON public.clinical_access_memberships USING btree (tenant_id, role) WHERE (active = true);


--
-- Name: idx_consults_sdne_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consults_sdne_session ON public.neurology_consults USING btree (sdne_session_id) WHERE (sdne_session_id IS NOT NULL);


--
-- Name: idx_daily_readings_device; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_readings_device ON public.device_daily_readings USING btree (device_source_id, reading_date DESC);


--
-- Name: idx_daily_readings_patient_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_readings_patient_date ON public.device_daily_readings USING btree (patient_id, reading_date DESC);


--
-- Name: idx_device_meas_consult; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_device_meas_consult ON public.patient_device_measurements USING btree (consult_id);


--
-- Name: idx_device_meas_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_device_meas_patient ON public.patient_device_measurements USING btree (patient_id);


--
-- Name: idx_device_meas_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_device_meas_type ON public.patient_device_measurements USING btree (measurement_type);


--
-- Name: idx_device_sources_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_device_sources_patient ON public.wearable_device_sources USING btree (patient_id);


--
-- Name: idx_device_sources_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_device_sources_status ON public.wearable_device_sources USING btree (connection_status);


--
-- Name: idx_dexcom_events_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dexcom_events_patient ON public.dexcom_events USING btree (patient_id, event_time DESC);


--
-- Name: idx_events_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_patient ON public.wearable_critical_events USING btree (patient_id, detected_at);


--
-- Name: idx_gait_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gait_patient ON public.wearable_gait_assessments USING btree (patient_id, assessed_at);


--
-- Name: idx_glucose_device; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_glucose_device ON public.glucose_readings USING btree (device_source_id, reading_time DESC);


--
-- Name: idx_glucose_patient_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_glucose_patient_time ON public.glucose_readings USING btree (patient_id, reading_time DESC);


--
-- Name: idx_he_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_he_session ON public.historian_evaluations USING btree (session_id, evaluator, created_at DESC);


--
-- Name: idx_hte_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hte_session ON public.historian_transcript_events USING btree (session_id, seq);


--
-- Name: idx_long_packet_chunk_jobs_claimable; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_long_packet_chunk_jobs_claimable ON public.triage_long_packet_chunk_jobs USING btree (tenant_id, status, next_retry_at, lease_expires_at, created_at);


--
-- Name: idx_long_packet_chunk_jobs_run_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_long_packet_chunk_jobs_run_status ON public.triage_long_packet_chunk_jobs USING btree (run_id, branch, status);


--
-- Name: idx_long_packet_finalization_jobs_claimable; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_long_packet_finalization_jobs_claimable ON public.triage_long_packet_finalization_jobs USING btree (tenant_id, status, next_retry_at, lease_expires_at, created_at);


--
-- Name: idx_long_packet_runs_extraction_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_long_packet_runs_extraction_status ON public.triage_long_packet_runs USING btree (tenant_id, extraction_id, status, created_at DESC);


--
-- Name: idx_neurology_consults_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_neurology_consults_created_at ON public.neurology_consults USING btree (created_at DESC);


--
-- Name: idx_neurology_consults_localizer_last_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_neurology_consults_localizer_last_run ON public.neurology_consults USING btree (localizer_last_run_at DESC) WHERE (localizer_last_run_at IS NOT NULL);


--
-- Name: idx_neurology_consults_patient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_neurology_consults_patient_id ON public.neurology_consults USING btree (patient_id) WHERE (patient_id IS NOT NULL);


--
-- Name: idx_neurology_consults_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_neurology_consults_status ON public.neurology_consults USING btree (status);


--
-- Name: idx_neurology_consults_triage_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_neurology_consults_triage_session ON public.neurology_consults USING btree (triage_session_id) WHERE (triage_session_id IS NOT NULL);


--
-- Name: idx_neurology_consults_unique_tenant_triage_session; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_neurology_consults_unique_tenant_triage_session ON public.neurology_consults USING btree (tenant_id, triage_session_id) WHERE (triage_session_id IS NOT NULL);


--
-- Name: idx_neurology_consults_unique_triage_session_global; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_neurology_consults_unique_triage_session_global ON public.neurology_consults USING btree (triage_session_id) WHERE (triage_session_id IS NOT NULL);


--
-- Name: idx_red_flag_events_consult_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_red_flag_events_consult_id ON public.red_flag_events USING btree (consult_id);


--
-- Name: idx_red_flag_events_severity_ack; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_red_flag_events_severity_ack ON public.red_flag_events USING btree (severity, acknowledged_at) WHERE (acknowledged_at IS NULL);


--
-- Name: idx_reports_consult; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_consult ON public.consult_reports USING btree (consult_id);


--
-- Name: idx_reports_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_status ON public.consult_reports USING btree (status);


--
-- Name: idx_scale_results_consult_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scale_results_consult_id ON public.scale_results USING btree (consult_id) WHERE (consult_id IS NOT NULL);


--
-- Name: idx_scale_results_historian_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scale_results_historian_session ON public.scale_results USING btree (historian_session_id) WHERE (historian_session_id IS NOT NULL);


--
-- Name: idx_scale_results_in_progress; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scale_results_in_progress ON public.scale_results USING btree (historian_session_id, scale_id) WHERE (status = 'in_progress'::text);


--
-- Name: idx_scale_results_scale_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scale_results_scale_id ON public.scale_results USING btree (scale_id);


--
-- Name: idx_scale_results_triggered_alerts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scale_results_triggered_alerts ON public.scale_results USING gin (triggered_alerts) WHERE (triggered_alerts IS NOT NULL);


--
-- Name: idx_spiral_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_spiral_patient ON public.wearable_spiral_assessments USING btree (patient_id, assessed_at);


--
-- Name: idx_triage_clarification_questions_open; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_triage_clarification_questions_open ON public.triage_clarification_questions USING btree (triage_session_id, target, criticality, status, due_at) WHERE (status <> ALL (ARRAY['verified'::text, 'closed'::text]));


--
-- Name: idx_triage_emergency_action_alerts_dispatch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_triage_emergency_action_alerts_dispatch ON public.triage_emergency_action_alerts USING btree (status, next_attempt_at, created_at, id) WHERE (status = ANY (ARRAY['pending'::text, 'failed'::text, 'leased'::text]));


--
-- Name: idx_triage_emergency_action_alerts_terminal_failure; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_triage_emergency_action_alerts_terminal_failure ON public.triage_emergency_action_alerts USING btree (terminal_failed_at DESC, id) WHERE (status = 'terminal_failure'::text);


--
-- Name: idx_triage_emergency_actions_open; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_triage_emergency_actions_open ON public.triage_emergency_actions USING btree (triage_session_id, status, due_at) WHERE (status <> 'closed'::text);


--
-- Name: idx_triage_emergency_alert_notification_delivery_terminal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_triage_emergency_alert_notification_delivery_terminal ON public.triage_emergency_alert_notification_deliveries USING btree (terminal_failed_at DESC, emergency_alert_id) WHERE (status = 'terminal_failure'::text);


--
-- Name: idx_triage_emergency_alert_notification_delivery_work; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_triage_emergency_alert_notification_delivery_work ON public.triage_emergency_alert_notification_deliveries USING btree (status, next_attempt_at, lease_expires_at, created_at) WHERE (status = ANY (ARRAY['pending'::text, 'leased'::text, 'failed'::text]));


--
-- Name: idx_triage_extractions_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_triage_extractions_created_at ON public.triage_extractions USING btree (created_at DESC);


--
-- Name: idx_triage_extractions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_triage_extractions_status ON public.triage_extractions USING btree (status) WHERE (status = 'pending'::text);


--
-- Name: idx_triage_extractions_tenant_status_coverage_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_triage_extractions_tenant_status_coverage_created ON public.triage_extractions USING btree (tenant_id, status, coverage_status, created_at DESC);


--
-- Name: idx_triage_sessions_open_safety_holds; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_triage_sessions_open_safety_holds ON public.triage_sessions USING btree (workflow_status, due_at) WHERE (workflow_status <> 'closed'::text);


--
-- Name: idx_triage_sessions_processing_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_triage_sessions_processing_status ON public.triage_sessions USING btree (processing_status) WHERE (processing_status = 'pending'::text);


--
-- Name: idx_triage_sessions_unique_source_extraction; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_triage_sessions_unique_source_extraction ON public.triage_sessions USING btree (source_extraction_id) WHERE (source_extraction_id IS NOT NULL);


--
-- Name: idx_triage_workflow_events_session_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_triage_workflow_events_session_time ON public.triage_workflow_events USING btree (triage_session_id, created_at);


--
-- Name: idx_vitals_device; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vitals_device ON public.vitals_readings USING btree (device_source_id, reading_time DESC);


--
-- Name: idx_vitals_patient_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vitals_patient_type ON public.vitals_readings USING btree (patient_id, reading_type, reading_time DESC);


--
-- Name: validation_ai_runs_case_run_model; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX validation_ai_runs_case_run_model ON public.validation_ai_runs USING btree (case_id, run_number, model);


--
-- Name: validation_cases_study_scenario_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX validation_cases_study_scenario_uidx ON public.validation_cases USING btree (study_name, scenario_id);


--
-- Name: appointments appointments_triage_safety_gate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER appointments_triage_safety_gate BEFORE INSERT OR UPDATE OF triage_session_id, status ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.enforce_triage_appointment_safety();


--
-- Name: triage_clarification_questions clarification_safety_revoke_appointments; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clarification_safety_revoke_appointments AFTER INSERT OR DELETE OR UPDATE ON public.triage_clarification_questions FOR EACH ROW EXECUTE FUNCTION public.revoke_unsafe_triage_appointments();


--
-- Name: triage_emergency_actions emergency_action_safety_revoke_appointments; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER emergency_action_safety_revoke_appointments AFTER INSERT OR DELETE OR UPDATE ON public.triage_emergency_actions FOR EACH ROW EXECUTE FUNCTION public.revoke_unsafe_triage_appointments();


--
-- Name: clinical_access_memberships membership_safety_revoke_appointments; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER membership_safety_revoke_appointments AFTER DELETE OR UPDATE OF user_id, tenant_id, active, role ON public.clinical_access_memberships FOR EACH ROW EXECUTE FUNCTION public.revoke_appointments_for_membership_change();


--
-- Name: neurology_consults neurology_consult_triage_tenant_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER neurology_consult_triage_tenant_guard BEFORE INSERT OR UPDATE OF triage_session_id, tenant_id ON public.neurology_consults FOR EACH ROW EXECUTE FUNCTION public.enforce_neurology_consult_triage_tenant();


--
-- Name: neurology_consults trg_neurology_consults_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_neurology_consults_updated_at BEFORE UPDATE ON public.neurology_consults FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: triage_clarification_questions triage_clarification_questions_integrity_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER triage_clarification_questions_integrity_guard BEFORE INSERT OR DELETE OR UPDATE ON public.triage_clarification_questions FOR EACH ROW EXECUTE FUNCTION public.enforce_triage_clarification_question_integrity();


--
-- Name: triage_emergency_action_alerts triage_emergency_action_alert_lifecycle_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER triage_emergency_action_alert_lifecycle_guard BEFORE INSERT OR DELETE OR UPDATE ON public.triage_emergency_action_alerts FOR EACH ROW EXECUTE FUNCTION public.enforce_emergency_action_alert_lifecycle();


--
-- Name: triage_emergency_actions triage_emergency_action_alert_suppression; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER triage_emergency_action_alert_suppression AFTER UPDATE OF status ON public.triage_emergency_actions FOR EACH ROW EXECUTE FUNCTION public.suppress_resolved_emergency_action_alerts();


--
-- Name: triage_emergency_actions triage_emergency_action_initial_alert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER triage_emergency_action_initial_alert AFTER INSERT ON public.triage_emergency_actions FOR EACH ROW EXECUTE FUNCTION public.enqueue_initial_emergency_action_alert();


--
-- Name: triage_emergency_actions triage_emergency_action_notification_delivery_suppression; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER triage_emergency_action_notification_delivery_suppression AFTER UPDATE OF status ON public.triage_emergency_actions FOR EACH ROW EXECUTE FUNCTION public.suppress_resolved_emergency_alert_notification_deliveries();


--
-- Name: triage_emergency_actions triage_emergency_action_transition_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER triage_emergency_action_transition_guard BEFORE INSERT OR DELETE OR UPDATE ON public.triage_emergency_actions FOR EACH ROW EXECUTE FUNCTION public.enforce_emergency_action_transition();


--
-- Name: triage_emergency_action_alerts triage_emergency_alert_enqueue_notification_delivery; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER triage_emergency_alert_enqueue_notification_delivery AFTER UPDATE OF status ON public.triage_emergency_action_alerts FOR EACH ROW EXECUTE FUNCTION public.enqueue_emergency_alert_notification_delivery();


--
-- Name: triage_emergency_alert_notification_deliveries triage_emergency_alert_notification_delivery_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER triage_emergency_alert_notification_delivery_guard BEFORE INSERT OR DELETE OR UPDATE ON public.triage_emergency_alert_notification_deliveries FOR EACH ROW EXECUTE FUNCTION public.enforce_emergency_alert_notification_delivery_lifecycle();


--
-- Name: triage_extractions triage_extraction_plan_digest_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER triage_extraction_plan_digest_guard BEFORE INSERT OR DELETE OR UPDATE ON public.triage_extractions FOR EACH ROW EXECUTE FUNCTION public.enforce_triage_extraction_plan_digest();


--
-- Name: triage_extractions triage_extraction_provenance_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER triage_extraction_provenance_guard BEFORE INSERT OR DELETE OR UPDATE ON public.triage_extractions FOR EACH ROW EXECUTE FUNCTION public.enforce_triage_extraction_provenance();


--
-- Name: triage_long_packet_chunk_jobs triage_long_packet_chunk_binding_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER triage_long_packet_chunk_binding_guard BEFORE INSERT OR DELETE OR UPDATE ON public.triage_long_packet_chunk_jobs FOR EACH ROW EXECUTE FUNCTION public.enforce_long_packet_chunk_job_binding();


--
-- Name: triage_long_packet_chunk_jobs triage_long_packet_chunk_lifecycle_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER triage_long_packet_chunk_lifecycle_guard BEFORE INSERT OR DELETE OR UPDATE ON public.triage_long_packet_chunk_jobs FOR EACH ROW EXECUTE FUNCTION public.enforce_long_packet_job_lifecycle();


--
-- Name: triage_long_packet_finalization_jobs triage_long_packet_finalization_binding_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER triage_long_packet_finalization_binding_guard BEFORE INSERT OR DELETE OR UPDATE ON public.triage_long_packet_finalization_jobs FOR EACH ROW EXECUTE FUNCTION public.enforce_long_packet_finalization_binding();


--
-- Name: triage_long_packet_finalization_jobs triage_long_packet_finalization_lifecycle_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER triage_long_packet_finalization_lifecycle_guard BEFORE INSERT OR DELETE OR UPDATE ON public.triage_long_packet_finalization_jobs FOR EACH ROW EXECUTE FUNCTION public.enforce_long_packet_job_lifecycle();


--
-- Name: triage_long_packet_runs triage_long_packet_run_integrity_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER triage_long_packet_run_integrity_guard BEFORE INSERT OR DELETE OR UPDATE ON public.triage_long_packet_runs FOR EACH ROW EXECUTE FUNCTION public.enforce_long_packet_run_integrity();


--
-- Name: triage_sessions triage_safety_revoke_appointments; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER triage_safety_revoke_appointments AFTER UPDATE OF tenant_id, care_pathway, data_quality, coverage_status, review_requirement, workflow_status, scheduling_locked, reviewed_by, reviewed_at, final_care_pathway, final_triage_tier ON public.triage_sessions FOR EACH ROW EXECUTE FUNCTION public.revoke_unsafe_triage_appointments();


--
-- Name: triage_sessions triage_session_consult_tenant_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER triage_session_consult_tenant_guard BEFORE UPDATE OF tenant_id ON public.triage_sessions FOR EACH ROW EXECUTE FUNCTION public.enforce_triage_session_consult_tenant();


--
-- Name: triage_sessions triage_session_ingress_integrity_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER triage_session_ingress_integrity_guard BEFORE INSERT OR DELETE OR UPDATE ON public.triage_sessions FOR EACH ROW EXECUTE FUNCTION public.enforce_triage_session_ingress_integrity();


--
-- Name: triage_workflow_events triage_workflow_events_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER triage_workflow_events_append_only BEFORE DELETE OR UPDATE ON public.triage_workflow_events FOR EACH ROW EXECUTE FUNCTION public.reject_triage_workflow_event_mutation();


--
-- Name: triage_sessions triage_workflow_transition_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER triage_workflow_transition_guard BEFORE INSERT OR DELETE OR UPDATE ON public.triage_sessions FOR EACH ROW EXECUTE FUNCTION public.enforce_triage_workflow_transition();


--
-- Name: appointments appointments_triage_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_triage_session_id_fkey FOREIGN KEY (triage_session_id) REFERENCES public.triage_sessions(id) ON DELETE RESTRICT;


--
-- Name: clara_test_feedback clara_test_feedback_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clara_test_feedback
    ADD CONSTRAINT clara_test_feedback_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.clara_test_sessions(id) ON DELETE SET NULL;


--
-- Name: consult_reports consult_reports_consult_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consult_reports
    ADD CONSTRAINT consult_reports_consult_id_fkey FOREIGN KEY (consult_id) REFERENCES public.neurology_consults(id) ON DELETE CASCADE;


--
-- Name: device_daily_readings device_daily_readings_device_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_daily_readings
    ADD CONSTRAINT device_daily_readings_device_source_id_fkey FOREIGN KEY (device_source_id) REFERENCES public.wearable_device_sources(id);


--
-- Name: device_daily_readings device_daily_readings_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_daily_readings
    ADD CONSTRAINT device_daily_readings_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.wearable_patients(id);


--
-- Name: dexcom_events dexcom_events_device_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dexcom_events
    ADD CONSTRAINT dexcom_events_device_source_id_fkey FOREIGN KEY (device_source_id) REFERENCES public.wearable_device_sources(id);


--
-- Name: dexcom_events dexcom_events_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dexcom_events
    ADD CONSTRAINT dexcom_events_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.wearable_patients(id);


--
-- Name: glucose_readings glucose_readings_device_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.glucose_readings
    ADD CONSTRAINT glucose_readings_device_source_id_fkey FOREIGN KEY (device_source_id) REFERENCES public.wearable_device_sources(id);


--
-- Name: glucose_readings glucose_readings_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.glucose_readings
    ADD CONSTRAINT glucose_readings_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.wearable_patients(id);


--
-- Name: neurology_consults neurology_consults_historian_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.neurology_consults
    ADD CONSTRAINT neurology_consults_historian_session_id_fkey FOREIGN KEY (historian_session_id) REFERENCES public.historian_sessions(id) ON DELETE SET NULL;


--
-- Name: neurology_consults neurology_consults_intake_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.neurology_consults
    ADD CONSTRAINT neurology_consults_intake_session_id_fkey FOREIGN KEY (intake_session_id) REFERENCES public.followup_sessions(id) ON DELETE SET NULL;


--
-- Name: neurology_consults neurology_consults_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.neurology_consults
    ADD CONSTRAINT neurology_consults_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE SET NULL;


--
-- Name: neurology_consults neurology_consults_triage_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.neurology_consults
    ADD CONSTRAINT neurology_consults_triage_session_id_fkey FOREIGN KEY (triage_session_id) REFERENCES public.triage_sessions(id) ON DELETE SET NULL;


--
-- Name: patient_body_map_markers patient_body_map_markers_consult_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_body_map_markers
    ADD CONSTRAINT patient_body_map_markers_consult_id_fkey FOREIGN KEY (consult_id) REFERENCES public.neurology_consults(id) ON DELETE SET NULL;


--
-- Name: patient_device_measurements patient_device_measurements_consult_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_device_measurements
    ADD CONSTRAINT patient_device_measurements_consult_id_fkey FOREIGN KEY (consult_id) REFERENCES public.neurology_consults(id) ON DELETE SET NULL;


--
-- Name: rpm_billing_periods rpm_billing_periods_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rpm_billing_periods
    ADD CONSTRAINT rpm_billing_periods_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.wearable_patients(id);


--
-- Name: scale_results scale_results_historian_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scale_results
    ADD CONSTRAINT scale_results_historian_session_id_fkey FOREIGN KEY (historian_session_id) REFERENCES public.historian_sessions(id) ON DELETE CASCADE;


--
-- Name: triage_clarification_questions triage_clarification_questions_triage_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.triage_clarification_questions
    ADD CONSTRAINT triage_clarification_questions_triage_session_id_fkey FOREIGN KEY (triage_session_id) REFERENCES public.triage_sessions(id) ON DELETE RESTRICT;


--
-- Name: triage_emergency_action_alerts triage_emergency_action_alerts_emergency_action_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.triage_emergency_action_alerts
    ADD CONSTRAINT triage_emergency_action_alerts_emergency_action_id_fkey FOREIGN KEY (emergency_action_id) REFERENCES public.triage_emergency_actions(id) ON DELETE RESTRICT;


--
-- Name: triage_emergency_actions triage_emergency_actions_triage_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.triage_emergency_actions
    ADD CONSTRAINT triage_emergency_actions_triage_session_id_fkey FOREIGN KEY (triage_session_id) REFERENCES public.triage_sessions(id) ON DELETE RESTRICT;


--
-- Name: triage_emergency_alert_notification_deliveries triage_emergency_alert_notification_de_emergency_action_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.triage_emergency_alert_notification_deliveries
    ADD CONSTRAINT triage_emergency_alert_notification_de_emergency_action_id_fkey FOREIGN KEY (emergency_action_id) REFERENCES public.triage_emergency_actions(id) ON DELETE RESTRICT;


--
-- Name: triage_emergency_alert_notification_deliveries triage_emergency_alert_notification_del_emergency_alert_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.triage_emergency_alert_notification_deliveries
    ADD CONSTRAINT triage_emergency_alert_notification_del_emergency_alert_id_fkey FOREIGN KEY (emergency_alert_id) REFERENCES public.triage_emergency_action_alerts(id) ON DELETE RESTRICT;


--
-- Name: triage_long_packet_chunk_jobs triage_long_packet_chunk_jobs_run_id_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.triage_long_packet_chunk_jobs
    ADD CONSTRAINT triage_long_packet_chunk_jobs_run_id_tenant_id_fkey FOREIGN KEY (run_id, tenant_id) REFERENCES public.triage_long_packet_runs(id, tenant_id) ON DELETE RESTRICT;


--
-- Name: triage_long_packet_finalization_jobs triage_long_packet_finalization_jobs_run_id_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.triage_long_packet_finalization_jobs
    ADD CONSTRAINT triage_long_packet_finalization_jobs_run_id_tenant_id_fkey FOREIGN KEY (run_id, tenant_id) REFERENCES public.triage_long_packet_runs(id, tenant_id) ON DELETE RESTRICT;


--
-- Name: triage_long_packet_runs triage_long_packet_runs_extraction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.triage_long_packet_runs
    ADD CONSTRAINT triage_long_packet_runs_extraction_id_fkey FOREIGN KEY (extraction_id) REFERENCES public.triage_extractions(id) ON DELETE RESTRICT;


--
-- Name: triage_sessions triage_sessions_source_extraction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.triage_sessions
    ADD CONSTRAINT triage_sessions_source_extraction_id_fkey FOREIGN KEY (source_extraction_id) REFERENCES public.triage_extractions(id) ON DELETE RESTRICT;


--
-- Name: triage_workflow_events triage_workflow_events_clarification_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.triage_workflow_events
    ADD CONSTRAINT triage_workflow_events_clarification_question_id_fkey FOREIGN KEY (clarification_question_id) REFERENCES public.triage_clarification_questions(id) ON DELETE RESTRICT;


--
-- Name: triage_workflow_events triage_workflow_events_emergency_action_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.triage_workflow_events
    ADD CONSTRAINT triage_workflow_events_emergency_action_id_fkey FOREIGN KEY (emergency_action_id) REFERENCES public.triage_emergency_actions(id) ON DELETE RESTRICT;


--
-- Name: triage_workflow_events triage_workflow_events_triage_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.triage_workflow_events
    ADD CONSTRAINT triage_workflow_events_triage_session_id_fkey FOREIGN KEY (triage_session_id) REFERENCES public.triage_sessions(id) ON DELETE RESTRICT;


--
-- Name: vitals_readings vitals_readings_device_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vitals_readings
    ADD CONSTRAINT vitals_readings_device_source_id_fkey FOREIGN KEY (device_source_id) REFERENCES public.wearable_device_sources(id);


--
-- Name: vitals_readings vitals_readings_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vitals_readings
    ADD CONSTRAINT vitals_readings_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.wearable_patients(id);


--
-- Name: wearable_critical_events wearable_critical_events_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wearable_critical_events
    ADD CONSTRAINT wearable_critical_events_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.wearable_patients(id);


--
-- Name: wearable_device_sources wearable_device_sources_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wearable_device_sources
    ADD CONSTRAINT wearable_device_sources_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.wearable_patients(id);


--
-- Name: wearable_gait_assessments wearable_gait_assessments_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wearable_gait_assessments
    ADD CONSTRAINT wearable_gait_assessments_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.wearable_patients(id);


--
-- Name: wearable_spiral_assessments wearable_spiral_assessments_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wearable_spiral_assessments
    ADD CONSTRAINT wearable_spiral_assessments_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.wearable_patients(id);


--
-- PostgreSQL database dump complete
--

\unrestrict IaJYE7KVgQK5fVuC4JyTz7zKVoQBLt9AsBEAFtAdl4717O9AeNLq2En3oLQOJLt
