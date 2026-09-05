-- SOURCE ONLY; never applied by app startup. No tenant/user grants or legacy mappings.
-- 060 is the separately merged Localizer migration. This replaces our unapplied 060 draft.
BEGIN;
CREATE TABLE triage_validation_studies (
  study_name text PRIMARY KEY CHECK (study_name ~ '^[a-zA-Z0-9_-]{1,100}$'),
  tenant_id text NOT NULL,
  study_kind text NOT NULL DEFAULT 'independent' CHECK (study_kind IN ('independent','legacy_archive')),
  phase text NOT NULL DEFAULT 'draft' CHECK (phase IN ('draft','labeling','unblinded','archived')),
  archive_manifest jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((study_kind = 'legacy_archive' AND phase = 'archived' AND archive_manifest IS NOT NULL)
    OR (study_kind = 'independent' AND phase <> 'archived' AND archive_manifest IS NULL))
);
CREATE TABLE triage_validation_memberships (
  study_name text NOT NULL REFERENCES triage_validation_studies(study_name),
  user_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('reviewer','admin','adjudicator','archive_reader')),
  reviewer_kind text NOT NULL DEFAULT 'unknown' CHECK (reviewer_kind IN ('physician','triage_nurse','operational','unknown')),
  active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (study_name, user_id)
);
-- Observation hashes describe the text present NOW, never claim historical source identity.
ALTER TABLE validation_cases ADD COLUMN observed_source_sha256 text;
ALTER TABLE validation_cases ADD COLUMN source_provenance text NOT NULL DEFAULT 'legacy_unknown'
  CHECK (source_provenance IN ('legacy_unknown','frozen_new_study'));
UPDATE validation_cases SET observed_source_sha256 = encode(sha256(convert_to(jsonb_build_array(referral_text,patient_age,patient_sex)::text,'UTF8')),'hex');
ALTER TABLE validation_reviews ADD COLUMN comfortable_with_wait text CHECK (comfortable_with_wait IN ('yes','no','uncertain'));
ALTER TABLE validation_reviews ADD COLUMN reviewer_kind text NOT NULL DEFAULT 'unknown';
ALTER TABLE validation_reviews ADD COLUMN observed_source_sha256 text;
ALTER TABLE validation_reviews ADD COLUMN label_context text NOT NULL DEFAULT 'legacy_unknown';
-- The hosted legacy table has no case/reviewer unique constraint. Preserve any
-- historical duplicates, but enforce one original for each NEW independent label.
CREATE UNIQUE INDEX triage_independent_review_once ON validation_reviews(case_id,reviewer_id)
 WHERE label_context='independent_blinded';

CREATE FUNCTION validate_triage_study_registration() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cases_n integer; reviews_n integer; runs_n integer;
BEGIN
  SELECT count(*) INTO cases_n FROM validation_cases WHERE study_name=NEW.study_name;
  IF NEW.study_kind='independent' THEN
    IF NEW.phase <> 'draft' OR cases_n > 0 THEN
      RAISE EXCEPTION 'Independent study must be a new empty draft' USING ERRCODE='55000';
    END IF;
  ELSE
    SELECT count(*) INTO reviews_n FROM validation_reviews r JOIN validation_cases c ON c.id=r.case_id WHERE c.study_name=NEW.study_name;
    SELECT count(*) INTO runs_n FROM validation_ai_runs r JOIN validation_cases c ON c.id=r.case_id WHERE c.study_name=NEW.study_name;
    IF cases_n=0 OR NULLIF(NEW.archive_manifest->>'reviewed_by','') IS NULL OR
      NULLIF(NEW.archive_manifest->>'reviewed_at','') IS NULL OR
      NEW.archive_manifest->>'source_provenance' IS DISTINCT FROM 'legacy_unknown' OR
      (NEW.archive_manifest->>'case_count')::integer IS DISTINCT FROM cases_n OR
      (NEW.archive_manifest->>'review_count')::integer IS DISTINCT FROM reviews_n OR
      (NEW.archive_manifest->>'run_count')::integer IS DISTINCT FROM runs_n THEN
      RAISE EXCEPTION 'Archive requires reviewed matching aggregate inventory; provenance remains unknown' USING ERRCODE='55000';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER triage_study_registration BEFORE INSERT ON triage_validation_studies FOR EACH ROW EXECUTE FUNCTION validate_triage_study_registration();

CREATE FUNCTION enforce_triage_validation_case_lock() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE study_phase text;
BEGIN
  IF TG_OP='UPDATE' AND NEW.study_name IS DISTINCT FROM OLD.study_name THEN RAISE EXCEPTION 'Study identity is immutable' USING ERRCODE='55000'; END IF;
  SELECT phase INTO study_phase FROM triage_validation_studies
    WHERE study_name=CASE WHEN TG_OP='DELETE' THEN OLD.study_name ELSE NEW.study_name END FOR SHARE;
  IF study_phase IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'Study cases are locked or unassigned' USING ERRCODE='55000'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  NEW.observed_source_sha256 := encode(sha256(convert_to(jsonb_build_array(NEW.referral_text,NEW.patient_age,NEW.patient_sex)::text,'UTF8')),'hex');
  NEW.source_provenance := 'frozen_new_study';
  RETURN NEW;
END $$;
CREATE TRIGGER triage_validation_case_lock BEFORE INSERT OR UPDATE OR DELETE ON validation_cases FOR EACH ROW EXECUTE FUNCTION enforce_triage_validation_case_lock();

CREATE FUNCTION enforce_triage_validation_review_lock() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE study_phase text; member_kind text; source_hash text;
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Submitted reviews are immutable' USING ERRCODE='55000'; END IF;
  SELECT s.phase,c.observed_source_sha256,m.reviewer_kind INTO study_phase,source_hash,member_kind
    FROM triage_validation_studies s JOIN validation_cases c ON c.study_name=s.study_name
    JOIN triage_validation_memberships m ON m.study_name=s.study_name AND m.user_id=NEW.reviewer_id::text AND m.active AND m.role='reviewer'
    WHERE c.id=NEW.case_id AND c.active FOR SHARE OF s,c,m;
  IF study_phase IS DISTINCT FROM 'labeling' OR member_kind NOT IN ('physician','triage_nurse','operational') OR member_kind IS NULL OR NEW.comfortable_with_wait IS NULL THEN
    RAISE EXCEPTION 'Study is not accepting this independent label' USING ERRCODE='55000';
  END IF;
  NEW.reviewer_kind := member_kind;
  NEW.observed_source_sha256 := source_hash;
  NEW.label_context := 'independent_blinded';
  RETURN NEW;
END $$;
CREATE TRIGGER triage_validation_review_lock BEFORE INSERT OR UPDATE OR DELETE ON validation_reviews FOR EACH ROW EXECUTE FUNCTION enforce_triage_validation_review_lock();

CREATE FUNCTION enforce_triage_validation_phase() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.study_name IS DISTINCT FROM OLD.study_name OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.study_kind IS DISTINCT FROM OLD.study_kind OR NEW.archive_manifest IS DISTINCT FROM OLD.archive_manifest THEN
    RAISE EXCEPTION 'Study provenance is immutable' USING ERRCODE='55000'; END IF;
  IF NEW.phase=OLD.phase THEN RETURN NEW; END IF;
  IF NOT ((OLD.phase='draft' AND NEW.phase='labeling') OR (OLD.phase='labeling' AND NEW.phase='unblinded')) THEN RAISE EXCEPTION 'Study phases cannot be reversed or skipped' USING ERRCODE='55000'; END IF;
  IF OLD.phase='draft' AND NOT EXISTS (SELECT 1 FROM validation_cases WHERE study_name=OLD.study_name AND active) THEN RAISE EXCEPTION 'Empty study cannot open' USING ERRCODE='55000'; END IF;
  IF NEW.phase='unblinded' AND (
    (SELECT count(*) FROM triage_validation_memberships WHERE study_name=OLD.study_name AND active AND role='reviewer' AND reviewer_kind='physician') < 2 OR
    EXISTS (SELECT 1 FROM validation_cases c CROSS JOIN triage_validation_memberships m
      WHERE c.study_name=OLD.study_name AND c.active AND m.study_name=OLD.study_name AND m.active AND m.role='reviewer' AND m.reviewer_kind='physician'
      AND NOT EXISTS (SELECT 1 FROM validation_reviews r WHERE r.case_id=c.id AND r.reviewer_id::text=m.user_id AND r.label_context='independent_blinded' AND r.reviewer_kind='physician' AND r.observed_source_sha256=c.observed_source_sha256))
  ) THEN RAISE EXCEPTION 'Independent physician reviews incomplete' USING ERRCODE='55000'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER triage_validation_phase BEFORE UPDATE ON triage_validation_studies FOR EACH ROW EXECUTE FUNCTION enforce_triage_validation_phase();

CREATE FUNCTION reject_validation_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Append-only evidence' USING ERRCODE='55000'; END $$;
CREATE TABLE triage_validation_amendments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), review_id uuid NOT NULL REFERENCES validation_reviews(id),
  study_name text NOT NULL REFERENCES triage_validation_studies(study_name), requested_by text NOT NULL,
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 2000), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION validate_triage_amendment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM validation_reviews r JOIN validation_cases c ON c.id=r.case_id
 JOIN triage_validation_studies s ON s.study_name=c.study_name
 JOIN triage_validation_memberships m ON m.study_name=s.study_name AND m.user_id=NEW.requested_by AND m.active AND m.role='reviewer'
 WHERE r.id=NEW.review_id AND r.reviewer_id::text=NEW.requested_by AND c.study_name=NEW.study_name AND s.phase IN ('labeling','unblinded') AND r.label_context='independent_blinded') THEN
 RAISE EXCEPTION 'Amendment must match own independent review and study' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER triage_amendment_binding BEFORE INSERT ON triage_validation_amendments FOR EACH ROW EXECUTE FUNCTION validate_triage_amendment();
CREATE TRIGGER triage_validation_amendment_immutable BEFORE UPDATE OR DELETE ON triage_validation_amendments FOR EACH ROW EXECUTE FUNCTION reject_validation_mutation();
CREATE TABLE triage_validation_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), study_name text NOT NULL REFERENCES triage_validation_studies(study_name),
 case_id uuid NOT NULL REFERENCES validation_cases(id), request_key uuid NOT NULL,
 source_sha256 text NOT NULL, configuration_revision text NOT NULL, scope text NOT NULL,
 created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(study_name,request_key)
);
CREATE TRIGGER triage_attempt_immutable BEFORE UPDATE OR DELETE ON triage_validation_attempts FOR EACH ROW EXECUTE FUNCTION reject_validation_mutation();
CREATE TABLE triage_validation_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), study_name text NOT NULL REFERENCES triage_validation_studies(study_name),
  case_id uuid NOT NULL REFERENCES validation_cases(id), request_key uuid NOT NULL,
  source_sha256 text NOT NULL, source_commit text NOT NULL, configuration jsonb NOT NULL, configuration_revision text NOT NULL,
  input_variant text NOT NULL DEFAULT 'original' CHECK (input_variant='original'),
  evaluation_scope text NOT NULL CHECK (evaluation_scope IN ('scorer_consistency','clinical_ensemble','intake_transport')),
  status text NOT NULL CHECK (status IN ('complete','held','error')),
  result jsonb NOT NULL, created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(study_name,request_key),
  FOREIGN KEY(study_name,request_key) REFERENCES triage_validation_attempts(study_name,request_key)
);
CREATE FUNCTION validate_triage_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_hash text; study_phase text;
BEGIN
 SELECT c.observed_source_sha256,s.phase INTO source_hash,study_phase FROM validation_cases c JOIN triage_validation_studies s ON s.study_name=c.study_name WHERE c.id=NEW.case_id AND c.study_name=NEW.study_name FOR SHARE OF c,s;
 IF study_phase NOT IN ('labeling','unblinded') OR study_phase IS NULL OR source_hash IS DISTINCT FROM NEW.source_sha256 THEN RAISE EXCEPTION 'Receipt source/study mismatch' USING ERRCODE='55000'; END IF;
 IF TG_TABLE_NAME='triage_validation_receipts' THEN
 IF NOT EXISTS (SELECT 1 FROM triage_validation_attempts a WHERE a.study_name=NEW.study_name AND a.request_key=NEW.request_key AND a.case_id=NEW.case_id AND a.source_sha256=NEW.source_sha256 AND a.configuration_revision=NEW.configuration_revision AND a.scope=NEW.evaluation_scope AND a.created_by=NEW.created_by) THEN RAISE EXCEPTION 'Receipt does not match its attempt' USING ERRCODE='55000'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER triage_attempt_binding BEFORE INSERT ON triage_validation_attempts FOR EACH ROW EXECUTE FUNCTION validate_triage_receipt();
CREATE TRIGGER triage_receipt_binding BEFORE INSERT ON triage_validation_receipts FOR EACH ROW EXECUTE FUNCTION validate_triage_receipt();
CREATE TRIGGER triage_receipt_immutable BEFORE UPDATE OR DELETE ON triage_validation_receipts FOR EACH ROW EXECUTE FUNCTION reject_validation_mutation();
-- Preserve old per-run rows. Existing direct tools can no longer overwrite/archive studies.
CREATE FUNCTION protect_legacy_validation_runs() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Legacy runs are retained read-only; append a versioned receipt' USING ERRCODE='55000'; END $$;
CREATE TRIGGER legacy_validation_runs_readonly BEFORE INSERT OR UPDATE OR DELETE ON validation_ai_runs FOR EACH ROW EXECUTE FUNCTION protect_legacy_validation_runs();
COMMIT;
