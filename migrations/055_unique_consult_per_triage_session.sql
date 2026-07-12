-- Migration 055: make the system-created consult binding idempotent.
--
-- Triage completion creates or recovers its consult in the same transaction.
-- The global partial unique index is the database authority that prevents
-- retries or concurrent workers from creating more than one consult for one
-- session. A second tenant-scoped unique index remains the conflict target for
-- the atomic completion upsert. Tenant-match triggers reject cross-tenant
-- links and later tenant drift in either parent or child rows.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
     FROM neurology_consults
     WHERE triage_session_id IS NOT NULL
     GROUP BY triage_session_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'migration 055 preflight found duplicate triage-session consult bindings; reconcile duplicate consult bindings before retrying';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM neurology_consults consult
      LEFT JOIN triage_sessions session
        ON session.id = consult.triage_session_id
     WHERE consult.triage_session_id IS NOT NULL
       AND (
         session.id IS NULL
         OR consult.tenant_id IS DISTINCT FROM session.tenant_id
       )
  ) THEN
    RAISE EXCEPTION
      'migration 055 preflight found cross-tenant or missing triage-session consult bindings; reconcile cross-tenant consult bindings before retrying';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_neurology_consults_unique_triage_session_global
  ON neurology_consults (triage_session_id)
  WHERE triage_session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_neurology_consults_unique_tenant_triage_session
  ON neurology_consults (tenant_id, triage_session_id)
  WHERE triage_session_id IS NOT NULL;

CREATE OR REPLACE FUNCTION enforce_neurology_consult_triage_tenant()
RETURNS trigger
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

DROP TRIGGER IF EXISTS neurology_consult_triage_tenant_guard
  ON neurology_consults;
CREATE TRIGGER neurology_consult_triage_tenant_guard
BEFORE INSERT OR UPDATE OF triage_session_id, tenant_id
ON neurology_consults
FOR EACH ROW EXECUTE FUNCTION enforce_neurology_consult_triage_tenant();

CREATE OR REPLACE FUNCTION enforce_triage_session_consult_tenant()
RETURNS trigger
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

DROP TRIGGER IF EXISTS triage_session_consult_tenant_guard
  ON triage_sessions;
CREATE TRIGGER triage_session_consult_tenant_guard
BEFORE UPDATE OF tenant_id
ON triage_sessions
FOR EACH ROW EXECUTE FUNCTION enforce_triage_session_consult_tenant();
