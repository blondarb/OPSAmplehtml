-- Migration 048: neurology referral triage safety workflow
--
-- Adds orthogonal care/data/review/workflow state, closed-loop emergency
-- actions, clinician-approved clarification questions, append-only events,
-- and a database-level scheduling backstop. Legacy rows are deliberately
-- locked and undetermined until a clinician reconciles them.

ALTER TABLE triage_sessions
  ADD COLUMN IF NOT EXISTS tenant_id text NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS source_extraction_id uuid REFERENCES triage_extractions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS care_pathway text,
  ADD COLUMN IF NOT EXISTS data_quality text,
  ADD COLUMN IF NOT EXISTS coverage_status text,
  ADD COLUMN IF NOT EXISTS review_requirement text,
  ADD COLUMN IF NOT EXISTS workflow_status text,
  ADD COLUMN IF NOT EXISTS scheduling_locked boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS owner_user_id text,
  ADD COLUMN IF NOT EXISTS owner_team text,
  ADD COLUMN IF NOT EXISTS due_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_escalation_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS final_triage_tier text,
  ADD COLUMN IF NOT EXISTS final_care_pathway text,
  ADD COLUMN IF NOT EXISTS closure_code text,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS algorithm_version text,
  ADD COLUMN IF NOT EXISTS rule_version text,
  ADD COLUMN IF NOT EXISTS prompt_versions jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS safety_shadow_result jsonb;

UPDATE triage_sessions
SET care_pathway = COALESCE(care_pathway, 'undetermined'),
    data_quality = COALESCE(data_quality, 'partial'),
    coverage_status = COALESCE(coverage_status, 'legacy_unknown'),
    review_requirement = COALESCE(review_requirement, 'clinician_confirmation'),
    workflow_status = COALESCE(workflow_status, 'clinician_review'),
    scheduling_locked = true;

ALTER TABLE triage_sessions
  ALTER COLUMN care_pathway SET DEFAULT 'undetermined',
  ALTER COLUMN data_quality SET DEFAULT 'partial',
  ALTER COLUMN coverage_status SET DEFAULT 'legacy_unknown',
  ALTER COLUMN review_requirement SET DEFAULT 'clinician_confirmation',
  ALTER COLUMN workflow_status SET DEFAULT 'pending_safety_screen',
  ALTER COLUMN care_pathway SET NOT NULL,
  ALTER COLUMN data_quality SET NOT NULL,
  ALTER COLUMN coverage_status SET NOT NULL,
  ALTER COLUMN review_requirement SET NOT NULL,
  ALTER COLUMN workflow_status SET NOT NULL,
  DROP CONSTRAINT IF EXISTS triage_sessions_care_pathway_check,
  DROP CONSTRAINT IF EXISTS triage_sessions_data_quality_check,
  DROP CONSTRAINT IF EXISTS triage_sessions_coverage_status_check,
  DROP CONSTRAINT IF EXISTS triage_sessions_review_requirement_check,
  DROP CONSTRAINT IF EXISTS triage_sessions_workflow_status_check;

ALTER TABLE triage_sessions
  ADD CONSTRAINT triage_sessions_care_pathway_check CHECK
    (care_pathway IN ('emergency_now','same_day_clinician_review','expedited_outpatient','routine_outpatient','redirect','undetermined')),
  ADD CONSTRAINT triage_sessions_data_quality_check CHECK
    (data_quality IN ('sufficient','partial','insufficient','conflicting')),
  ADD CONSTRAINT triage_sessions_coverage_status_check CHECK
    (coverage_status IN ('complete','partial','failed','not_applicable','legacy_unknown')),
  ADD CONSTRAINT triage_sessions_review_requirement_check CHECK
    (review_requirement IN ('emergency_action','immediate_clinician_review','clinician_confirmation','none')),
  ADD CONSTRAINT triage_sessions_workflow_status_check CHECK
    (workflow_status IN ('pending_safety_screen','emergency_hold','clinician_review','provider_clarification','patient_clarification','decision_ready','action_pending','closed'));

ALTER TABLE neurology_consults
  ADD COLUMN IF NOT EXISTS tenant_id text NOT NULL DEFAULT 'default';

ALTER TABLE triage_extractions
  ADD COLUMN IF NOT EXISTS tenant_id text NOT NULL DEFAULT 'default';

ALTER TABLE followup_sessions
  ADD COLUMN IF NOT EXISTS tenant_id text NOT NULL DEFAULT 'default';

CREATE TABLE IF NOT EXISTS clinical_access_memberships (
  user_id text NOT NULL,
  tenant_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('clinician','scheduler','admin','viewer')),
  active boolean NOT NULL DEFAULT true,
  provisioned_by text NOT NULL,
  provisioned_at timestamptz NOT NULL DEFAULT now(),
  revoked_by text,
  revoked_at timestamptz,
  PRIMARY KEY (user_id, tenant_id),
  CHECK (active OR revoked_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_clinical_access_memberships_tenant_role
  ON clinical_access_memberships (tenant_id, role)
  WHERE active = true;

CREATE TABLE IF NOT EXISTS triage_emergency_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  triage_session_id uuid NOT NULL REFERENCES triage_sessions(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('open','attempting_contact','handed_off','closed','failed')),
  owner_user_id text,
  owner_team text NOT NULL,
  due_at timestamptz NOT NULL,
  next_escalation_at timestamptz NOT NULL,
  contact_attempted_at timestamptz,
  contact_channel text,
  instruction_given text,
  delivery_status text CHECK (delivery_status IN ('unknown','delivered','failed','not_applicable')),
  understanding_status text CHECK (understanding_status IN ('unknown','confirmed','not_confirmed','not_applicable')),
  outcome text,
  closure_code text,
  closed_at timestamptz,
  reviewed_by text,
  reviewed_at timestamptz,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    status <> 'closed' OR (
      closure_code IS NOT NULL
      AND closed_at IS NOT NULL
      AND reviewed_by IS NOT NULL
      AND reviewed_at IS NOT NULL
      AND contact_attempted_at IS NOT NULL
      AND contact_channel IS NOT NULL
      AND instruction_given IS NOT NULL
      AND delivery_status IN ('delivered','not_applicable')
      AND understanding_status IN ('confirmed','not_applicable')
      AND outcome IS NOT NULL
    )
  )
);

CREATE OR REPLACE FUNCTION enforce_emergency_action_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
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

DROP TRIGGER IF EXISTS triage_emergency_action_transition_guard
  ON triage_emergency_actions;
CREATE TRIGGER triage_emergency_action_transition_guard
BEFORE INSERT OR UPDATE OR DELETE ON triage_emergency_actions
FOR EACH ROW EXECUTE FUNCTION enforce_emergency_action_transition();

CREATE TABLE IF NOT EXISTS triage_clarification_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  triage_session_id uuid NOT NULL REFERENCES triage_sessions(id) ON DELETE RESTRICT,
  question_code text NOT NULL,
  question_text text NOT NULL,
  rationale text NOT NULL,
  target text NOT NULL CHECK (target IN ('patient','provider','human_reviewer')),
  criticality text NOT NULL CHECK (criticality IN ('critical','non_critical')),
  acceptable_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  answer_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK
    (status IN ('draft','approved','sent','answered','verified','closed','expired','failed','conflicting')),
  owner_user_id text,
  owner_team text,
  due_at timestamptz,
  escalation_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  approved_by text,
  approved_at timestamptz,
  delivered_at timestamptz,
  delivery_status text CHECK (delivery_status IN ('pending','delivered','failed','not_applicable')),
  raw_answer text,
  normalized_answer jsonb,
  responder_kind text CHECK (responder_kind IN ('patient','caregiver','provider','clinician','staff')),
  responder_id text,
  answered_at timestamptz,
  verified_by text,
  verified_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (triage_session_id, question_code),
  CHECK (status <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  CHECK (status NOT IN ('verified','closed') OR (verified_by IS NOT NULL AND verified_at IS NOT NULL))
);

CREATE OR REPLACE FUNCTION enforce_triage_clarification_question_integrity()
RETURNS trigger LANGUAGE plpgsql AS $$
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

DROP TRIGGER IF EXISTS triage_clarification_questions_integrity_guard
  ON triage_clarification_questions;
CREATE TRIGGER triage_clarification_questions_integrity_guard
BEFORE INSERT OR UPDATE OR DELETE ON triage_clarification_questions
FOR EACH ROW EXECUTE FUNCTION enforce_triage_clarification_question_integrity();

CREATE TABLE IF NOT EXISTS triage_workflow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  triage_session_id uuid NOT NULL REFERENCES triage_sessions(id) ON DELETE RESTRICT,
  emergency_action_id uuid REFERENCES triage_emergency_actions(id) ON DELETE RESTRICT,
  clarification_question_id uuid REFERENCES triage_clarification_questions(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  actor_kind text NOT NULL CHECK (actor_kind IN ('system','model','clinician','staff','patient','provider')),
  actor_id text,
  actor_role text,
  previous_state text,
  new_state text,
  reason text NOT NULL,
  model_profile text,
  prompt_version text,
  rule_version text,
  correlation_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION enforce_triage_workflow_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
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

DROP TRIGGER IF EXISTS triage_workflow_transition_guard ON triage_sessions;
CREATE TRIGGER triage_workflow_transition_guard
BEFORE INSERT OR UPDATE OR DELETE ON triage_sessions
FOR EACH ROW EXECUTE FUNCTION enforce_triage_workflow_transition();

CREATE OR REPLACE FUNCTION reject_triage_workflow_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'triage_workflow_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS triage_workflow_events_append_only ON triage_workflow_events;
CREATE TRIGGER triage_workflow_events_append_only
BEFORE UPDATE OR DELETE ON triage_workflow_events
FOR EACH ROW EXECUTE FUNCTION reject_triage_workflow_event_mutation();

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS triage_session_id uuid REFERENCES triage_sessions(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION enforce_triage_appointment_safety()
RETURNS trigger LANGUAGE plpgsql AS $$
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

DROP TRIGGER IF EXISTS appointments_triage_safety_gate ON appointments;
CREATE TRIGGER appointments_triage_safety_gate
BEFORE INSERT OR UPDATE OF triage_session_id, status ON appointments
FOR EACH ROW EXECUTE FUNCTION enforce_triage_appointment_safety();

CREATE OR REPLACE FUNCTION revoke_unsafe_triage_appointments()
RETURNS trigger LANGUAGE plpgsql AS $$
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

DROP TRIGGER IF EXISTS triage_safety_revoke_appointments ON triage_sessions;
CREATE TRIGGER triage_safety_revoke_appointments
AFTER UPDATE OF tenant_id, care_pathway, data_quality, coverage_status,
  review_requirement, workflow_status, scheduling_locked,
  reviewed_by, reviewed_at, final_care_pathway, final_triage_tier
ON triage_sessions
FOR EACH ROW EXECUTE FUNCTION revoke_unsafe_triage_appointments();

DROP TRIGGER IF EXISTS clarification_safety_revoke_appointments
  ON triage_clarification_questions;
CREATE TRIGGER clarification_safety_revoke_appointments
AFTER INSERT OR UPDATE OR DELETE ON triage_clarification_questions
FOR EACH ROW EXECUTE FUNCTION revoke_unsafe_triage_appointments();

DROP TRIGGER IF EXISTS emergency_action_safety_revoke_appointments
  ON triage_emergency_actions;
CREATE TRIGGER emergency_action_safety_revoke_appointments
AFTER INSERT OR UPDATE OR DELETE ON triage_emergency_actions
FOR EACH ROW EXECUTE FUNCTION revoke_unsafe_triage_appointments();

CREATE OR REPLACE FUNCTION revoke_appointments_for_membership_change()
RETURNS trigger LANGUAGE plpgsql AS $$
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

DROP TRIGGER IF EXISTS membership_safety_revoke_appointments
  ON clinical_access_memberships;
CREATE TRIGGER membership_safety_revoke_appointments
AFTER UPDATE OF user_id, tenant_id, active, role OR DELETE
ON clinical_access_memberships
FOR EACH ROW EXECUTE FUNCTION revoke_appointments_for_membership_change();

CREATE INDEX IF NOT EXISTS idx_triage_sessions_open_safety_holds
  ON triage_sessions (workflow_status, due_at)
  WHERE workflow_status <> 'closed';

CREATE INDEX IF NOT EXISTS idx_triage_emergency_actions_open
  ON triage_emergency_actions (triage_session_id, status, due_at)
  WHERE status <> 'closed';

CREATE INDEX IF NOT EXISTS idx_triage_clarification_questions_open
  ON triage_clarification_questions (triage_session_id, target, criticality, status, due_at)
  WHERE status NOT IN ('verified', 'closed');

CREATE INDEX IF NOT EXISTS idx_triage_workflow_events_session_time
  ON triage_workflow_events (triage_session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_appointments_triage_session
  ON appointments (triage_session_id)
  WHERE triage_session_id IS NOT NULL;
