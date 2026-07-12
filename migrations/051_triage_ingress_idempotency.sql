-- Migration 051: idempotent early-ingress triage workflow creation.
--
-- A persisted extraction is a single clinical source event. It may create at
-- most one triage workflow, regardless of retries or concurrent workers. The
-- extraction UUID is globally unique, so source_extraction_id alone (rather
-- than tenant_id + source_extraction_id) is the correct uniqueness key. A
-- trigger separately enforces that the linked extraction and workflow share a
-- tenant and that an established source link cannot be changed or cleared.
--
-- Processing leases let a reused pending workflow be claimed atomically. A
-- terminal complete/error transition must clear the lease while preserving
-- the monotonically increasing attempt count.

-- Fail before DDL if historical duplicates or cross-tenant source links need
-- reconciliation. Letting CREATE UNIQUE INDEX fail without this diagnostic
-- would make an operational safety issue much harder to identify and repair.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM triage_sessions
     WHERE source_extraction_id IS NOT NULL
     GROUP BY source_extraction_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'migration 051 preflight found duplicate source extraction links; reconcile duplicate triage workflows before retrying';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM triage_sessions triage_session
      JOIN triage_extractions extraction
        ON extraction.id = triage_session.source_extraction_id
     WHERE extraction.tenant_id IS DISTINCT FROM triage_session.tenant_id
  ) THEN
    RAISE EXCEPTION
      'migration 051 preflight found invalid source extraction tenant bindings; reconcile linked workflows before retrying';
  END IF;
END;
$$;

ALTER TABLE triage_sessions
  ADD COLUMN IF NOT EXISTS processing_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS processing_lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS processing_attempt_count integer NOT NULL DEFAULT 0;

ALTER TABLE triage_sessions
  DROP CONSTRAINT IF EXISTS triage_sessions_processing_attempt_count_check,
  DROP CONSTRAINT IF EXISTS triage_sessions_processing_lease_pair_check,
  DROP CONSTRAINT IF EXISTS triage_sessions_terminal_processing_lease_check;

ALTER TABLE triage_sessions
  ADD CONSTRAINT triage_sessions_processing_attempt_count_check CHECK
    (processing_attempt_count >= 0),
  ADD CONSTRAINT triage_sessions_processing_lease_pair_check CHECK (
    (
      processing_claimed_at IS NULL
      AND processing_lease_expires_at IS NULL
    )
    OR (
      processing_claimed_at IS NOT NULL
      AND processing_lease_expires_at IS NOT NULL
      AND processing_lease_expires_at > processing_claimed_at
    )
  ),
  ADD CONSTRAINT triage_sessions_terminal_processing_lease_check CHECK (
    processing_status NOT IN ('complete', 'error')
    OR (
      processing_claimed_at IS NULL
      AND processing_lease_expires_at IS NULL
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_triage_sessions_unique_source_extraction
  ON triage_sessions (source_extraction_id)
  WHERE source_extraction_id IS NOT NULL;

CREATE OR REPLACE FUNCTION enforce_triage_session_ingress_integrity()
RETURNS trigger
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

DROP TRIGGER IF EXISTS triage_session_ingress_integrity_guard
  ON triage_sessions;
CREATE TRIGGER triage_session_ingress_integrity_guard
BEFORE INSERT OR UPDATE OR DELETE ON triage_sessions
FOR EACH ROW EXECUTE FUNCTION enforce_triage_session_ingress_integrity();
