-- Migration 049: signed patient-access capability lifecycle
--
-- Stores only SHA-256 JTI hashes. Raw invite/session tokens and raw JTIs must
-- never be persisted. Existing patient-facing routes remain clinically locked
-- until they are explicitly integrated with the authorization helper.

CREATE TABLE IF NOT EXISTS patient_access_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jti_hash bytea NOT NULL UNIQUE CHECK (octet_length(jti_hash) = 32),
  parent_capability_id uuid REFERENCES patient_access_capabilities(id) ON DELETE RESTRICT,
  token_kind text NOT NULL CHECK (token_kind IN ('invite', 'session')),
  token_version smallint NOT NULL CHECK (token_version = 1),
  tenant_id text NOT NULL,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  consult_id uuid REFERENCES neurology_consults(id) ON DELETE RESTRICT,
  scopes text[] NOT NULL CHECK (
    cardinality(scopes) BETWEEN 1 AND 6
    AND scopes <@ ARRAY[
      'patient:historian:start',
      'patient:historian:renew',
      'patient:historian:save',
      'patient:historian:report',
      'patient:intake:submit',
      'patient:clarification:answer'
    ]::text[]
  ),
  issued_by text,
  issued_by_role text NOT NULL CHECK (issued_by_role IN ('clinician', 'admin', 'system')),
  issued_at timestamptz NOT NULL,
  starts_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  redemption_count integer NOT NULL DEFAULT 0 CHECK (redemption_count IN (0, 1)),
  revoked_at timestamptz,
  revoked_by text,
  revocation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, tenant_id),
  CHECK (expires_at > starts_at AND starts_at >= issued_at),
  CHECK (
    (token_kind = 'invite' AND parent_capability_id IS NULL)
    OR (token_kind = 'session' AND parent_capability_id IS NOT NULL)
  ),
  CHECK (
    (redeemed_at IS NULL AND redemption_count = 0)
    OR (token_kind = 'invite' AND redeemed_at IS NOT NULL AND redemption_count = 1)
  ),
  CHECK (
    (revoked_at IS NULL AND revoked_by IS NULL AND revocation_reason IS NULL)
    OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND length(trim(revocation_reason)) > 0)
  )
);

CREATE OR REPLACE FUNCTION enforce_patient_access_capability_integrity()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_distinct_scope_count integer;
  v_parent patient_access_capabilities%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'patient access capabilities cannot be deleted';
  END IF;

  IF TG_OP = 'UPDATE' AND (
    OLD.jti_hash IS DISTINCT FROM NEW.jti_hash
    OR OLD.parent_capability_id IS DISTINCT FROM NEW.parent_capability_id
    OR OLD.token_kind IS DISTINCT FROM NEW.token_kind
    OR OLD.token_version IS DISTINCT FROM NEW.token_version
    OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
    OR OLD.patient_id IS DISTINCT FROM NEW.patient_id
    OR OLD.consult_id IS DISTINCT FROM NEW.consult_id
    OR OLD.scopes IS DISTINCT FROM NEW.scopes
    OR OLD.issued_by IS DISTINCT FROM NEW.issued_by
    OR OLD.issued_by_role IS DISTINCT FROM NEW.issued_by_role
    OR OLD.issued_at IS DISTINCT FROM NEW.issued_at
    OR OLD.starts_at IS DISTINCT FROM NEW.starts_at
    OR OLD.expires_at IS DISTINCT FROM NEW.expires_at
    OR OLD.created_at IS DISTINCT FROM NEW.created_at
  ) THEN
    RAISE EXCEPTION 'capability claims and bindings are immutable';
  END IF;

  SELECT count(DISTINCT scope_value)
    INTO v_distinct_scope_count
    FROM unnest(NEW.scopes) AS scope_values(scope_value);
  IF v_distinct_scope_count <> cardinality(NEW.scopes) THEN
    RAISE EXCEPTION 'patient access capability scopes must be unique';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM patients p
     WHERE p.id = NEW.patient_id
       AND p.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'patient access patient binding is invalid';
  END IF;

  IF NEW.consult_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM neurology_consults c
     WHERE c.id = NEW.consult_id
       AND c.tenant_id = NEW.tenant_id
       AND c.patient_id = NEW.patient_id
  ) THEN
    RAISE EXCEPTION 'consult_patient_mismatch: patient access consult binding is invalid';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.redeemed_at IS NOT NULL OR NEW.redemption_count <> 0
       OR NEW.revoked_at IS NOT NULL OR NEW.revoked_by IS NOT NULL
       OR NEW.revocation_reason IS NOT NULL
    THEN
      RAISE EXCEPTION 'new patient access capabilities must start active and unredeemed';
    END IF;

    IF NEW.token_kind = 'invite' THEN
      IF NEW.issued_by IS NULL OR NEW.issued_by_role NOT IN ('clinician', 'admin')
         OR NOT EXISTS (
           SELECT 1
             FROM clinical_access_memberships membership
            WHERE membership.user_id = NEW.issued_by
              AND membership.tenant_id = NEW.tenant_id
              AND membership.active = true
              AND membership.role = NEW.issued_by_role
              AND membership.role IN ('clinician', 'admin')
         )
      THEN
        RAISE EXCEPTION 'patient access invitation issuer is not authorized';
      END IF;
    ELSE
      IF NEW.issued_by IS NOT NULL OR NEW.issued_by_role <> 'system' THEN
        RAISE EXCEPTION 'patient access sessions must be system-issued';
      END IF;

      SELECT *
        INTO v_parent
        FROM patient_access_capabilities parent_capability
       WHERE parent_capability.id = NEW.parent_capability_id
       FOR KEY SHARE;
      IF NOT FOUND
         OR v_parent.token_kind <> 'invite'
         OR v_parent.tenant_id <> NEW.tenant_id
         OR v_parent.patient_id <> NEW.patient_id
         OR v_parent.consult_id IS DISTINCT FROM NEW.consult_id
         OR v_parent.scopes IS DISTINCT FROM NEW.scopes
         OR v_parent.redeemed_at IS NULL
         OR v_parent.revoked_at IS NOT NULL
      THEN
        RAISE EXCEPTION 'patient access session parent binding is invalid';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  IF OLD.redeemed_at IS NOT NULL AND (
    NEW.redeemed_at IS DISTINCT FROM OLD.redeemed_at
    OR NEW.redemption_count IS DISTINCT FROM OLD.redemption_count
  ) THEN
    RAISE EXCEPTION 'redemption cannot be cleared or rewritten';
  END IF;
  IF OLD.redeemed_at IS NULL AND NEW.redeemed_at IS NOT NULL AND (
    NEW.token_kind <> 'invite'
    OR OLD.redemption_count <> 0
    OR NEW.redemption_count <> 1
  ) THEN
    RAISE EXCEPTION 'invalid one-time invitation redemption';
  END IF;
  IF OLD.redeemed_at IS NULL AND NEW.redeemed_at IS NULL
     AND NEW.redemption_count IS DISTINCT FROM OLD.redemption_count
  THEN
    RAISE EXCEPTION 'redemption count requires a redemption timestamp';
  END IF;

  IF OLD.revoked_at IS NOT NULL AND (
    NEW.revoked_at IS DISTINCT FROM OLD.revoked_at
    OR NEW.revoked_by IS DISTINCT FROM OLD.revoked_by
    OR NEW.revocation_reason IS DISTINCT FROM OLD.revocation_reason
  ) THEN
    RAISE EXCEPTION 'revocation cannot be cleared or rewritten';
  END IF;
  IF OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM clinical_access_memberships revoker
     WHERE revoker.user_id = NEW.revoked_by
       AND revoker.tenant_id = NEW.tenant_id
       AND revoker.active = true
       AND revoker.role IN ('clinician', 'admin')
  ) THEN
    RAISE EXCEPTION 'patient access revoker is not authorized';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS patient_access_capability_integrity_guard
  ON patient_access_capabilities;
CREATE TRIGGER patient_access_capability_integrity_guard
BEFORE INSERT OR UPDATE OR DELETE ON patient_access_capabilities
FOR EACH ROW EXECUTE FUNCTION enforce_patient_access_capability_integrity();

CREATE TABLE IF NOT EXISTS patient_access_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capability_id uuid,
  session_capability_id uuid,
  jti_hash bytea NOT NULL CHECK (octet_length(jti_hash) = 32),
  tenant_id text NOT NULL,
  event_type text NOT NULL CHECK (
    event_type IN ('issued', 'redemption_succeeded', 'redemption_rejected', 'revoked')
  ),
  outcome text NOT NULL CHECK (outcome IN ('success', 'denied')),
  actor_kind text NOT NULL CHECK (actor_kind IN ('clinician', 'admin', 'patient', 'system')),
  actor_id text,
  reason_code text NOT NULL CHECK (reason_code ~ '^[a-z0-9_:-]{1,100}$'),
  correlation_id text NOT NULL CHECK (length(correlation_id) BETWEEN 1 AND 200),
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (capability_id, tenant_id)
    REFERENCES patient_access_capabilities(id, tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (session_capability_id, tenant_id)
    REFERENCES patient_access_capabilities(id, tenant_id) ON DELETE RESTRICT,
  CHECK (
    (event_type = 'redemption_succeeded' AND capability_id IS NOT NULL AND session_capability_id IS NOT NULL)
    OR (event_type = 'redemption_rejected' AND session_capability_id IS NULL)
    OR (event_type IN ('issued', 'revoked') AND capability_id IS NOT NULL AND session_capability_id IS NULL)
  )
);

CREATE OR REPLACE FUNCTION enforce_patient_access_audit_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION 'patient access audit events are append-only';
  END IF;

  IF NEW.capability_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM patient_access_capabilities capability
     WHERE capability.id = NEW.capability_id
       AND capability.tenant_id = NEW.tenant_id
       AND capability.jti_hash = NEW.jti_hash
  ) THEN
    RAISE EXCEPTION 'patient access audit capability hash binding is invalid';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS patient_access_audit_append_only_guard
  ON patient_access_audit_events;
CREATE TRIGGER patient_access_audit_append_only_guard
BEFORE INSERT OR UPDATE OR DELETE ON patient_access_audit_events
FOR EACH ROW EXECUTE FUNCTION enforce_patient_access_audit_append_only();

CREATE INDEX IF NOT EXISTS idx_patient_access_capabilities_tenant_patient_active
  ON patient_access_capabilities (tenant_id, patient_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_patient_access_capabilities_consult
  ON patient_access_capabilities (tenant_id, consult_id, expires_at)
  WHERE consult_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_patient_access_capabilities_expires
  ON patient_access_capabilities (expires_at);

CREATE INDEX IF NOT EXISTS idx_patient_access_capabilities_parent
  ON patient_access_capabilities (parent_capability_id)
  WHERE parent_capability_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_patient_access_audit_jti_time
  ON patient_access_audit_events (jti_hash, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_patient_access_audit_tenant_time
  ON patient_access_audit_events (tenant_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_patient_access_audit_capability_time
  ON patient_access_audit_events (capability_id, occurred_at DESC)
  WHERE capability_id IS NOT NULL;
