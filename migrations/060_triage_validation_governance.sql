-- SOURCE ONLY. Apply only after database-owner review. No grants or automatic
-- mapping of legacy studies: an unassigned study remains inaccessible.
BEGIN;
CREATE TABLE triage_validation_studies (
  study_name text PRIMARY KEY CHECK (study_name ~ '^[a-zA-Z0-9_-]{1,100}$'),
  tenant_id text NOT NULL,
  phase text NOT NULL DEFAULT 'draft' CHECK (phase IN ('draft','labeling','unblinded')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE triage_validation_memberships (
  study_name text NOT NULL REFERENCES triage_validation_studies(study_name),
  user_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('reviewer','admin')),
  active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (study_name, user_id)
);

-- Row locks serialize case/review writes with phase transitions. A TOCTOU
-- between the application gate and its insert cannot mutate a frozen study.
CREATE FUNCTION enforce_triage_validation_case_lock() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE study_phase text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.study_name IS DISTINCT FROM OLD.study_name THEN
    RAISE EXCEPTION 'Study identity is immutable' USING ERRCODE = '55000';
  END IF;
  SELECT phase INTO study_phase FROM triage_validation_studies
    WHERE study_name = CASE WHEN TG_OP = 'DELETE' THEN OLD.study_name ELSE NEW.study_name END
    FOR SHARE;
  IF study_phase IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Study cases are locked or unassigned' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER triage_validation_case_lock BEFORE INSERT OR UPDATE OR DELETE
  ON validation_cases FOR EACH ROW EXECUTE FUNCTION enforce_triage_validation_case_lock();

CREATE FUNCTION enforce_triage_validation_review_lock() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE study_phase text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Submitted reviews are immutable' USING ERRCODE = '55000';
  END IF;
  SELECT s.phase INTO study_phase FROM triage_validation_studies s
    JOIN validation_cases c ON c.study_name = s.study_name
    WHERE c.id = NEW.case_id AND c.active = true FOR SHARE OF s, c;
  IF study_phase IS DISTINCT FROM 'labeling' THEN
    RAISE EXCEPTION 'Study is not accepting labels' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER triage_validation_review_lock BEFORE INSERT OR UPDATE OR DELETE
  ON validation_reviews FOR EACH ROW EXECUTE FUNCTION enforce_triage_validation_review_lock();

CREATE FUNCTION enforce_triage_validation_phase() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.study_name IS DISTINCT FROM OLD.study_name OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'Study identity is immutable' USING ERRCODE = '55000';
  END IF;
  IF NEW.phase = OLD.phase THEN RETURN NEW; END IF;
  IF NOT ((OLD.phase = 'draft' AND NEW.phase = 'labeling') OR
          (OLD.phase = 'labeling' AND NEW.phase = 'unblinded')) THEN
    RAISE EXCEPTION 'Study phases cannot be reversed or skipped' USING ERRCODE = '55000';
  END IF;
  IF OLD.phase = 'draft' AND NOT EXISTS (
    SELECT 1 FROM validation_cases WHERE study_name = OLD.study_name AND active = true
  ) THEN
    RAISE EXCEPTION 'An empty study cannot open' USING ERRCODE = '55000';
  END IF;
  IF NEW.phase = 'unblinded' AND (
    (SELECT count(*) FROM triage_validation_memberships WHERE study_name = OLD.study_name
      AND active = true AND role = 'reviewer') < 2 OR
    EXISTS (
      SELECT 1 FROM validation_cases c CROSS JOIN triage_validation_memberships m
      WHERE c.study_name = OLD.study_name AND c.active = true
      AND m.study_name = OLD.study_name AND m.active = true AND m.role = 'reviewer'
      AND NOT EXISTS (SELECT 1 FROM validation_reviews r WHERE r.case_id = c.id AND r.reviewer_id::text = m.user_id)
    )
  ) THEN
    RAISE EXCEPTION 'Independent assigned reviews are incomplete' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER triage_validation_phase BEFORE UPDATE ON triage_validation_studies
  FOR EACH ROW EXECUTE FUNCTION enforce_triage_validation_phase();
COMMIT;
