-- Synthetic-only integration fixture. Run against an EMPTY disposable database.
\set ON_ERROR_STOP on
CREATE TABLE validation_cases (id text PRIMARY KEY, study_name text NOT NULL, active boolean NOT NULL DEFAULT true);
CREATE TABLE validation_reviews (id serial PRIMARY KEY, case_id text REFERENCES validation_cases(id), reviewer_id text NOT NULL, UNIQUE(case_id, reviewer_id));
\ir ../../../migrations/060_triage_validation_governance.sql
CREATE FUNCTION expect_locked(command text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE command;
  EXCEPTION WHEN SQLSTATE '55000' THEN RETURN;
  END;
  RAISE EXCEPTION 'Expected locked operation: %', command;
END $$;
INSERT INTO triage_validation_studies VALUES ('study-a','tenant-a','draft',now());
INSERT INTO triage_validation_memberships VALUES ('study-a','reviewer-a','reviewer',true),('study-a','reviewer-b','reviewer',true);
SELECT expect_locked($cmd$INSERT INTO validation_cases VALUES ('legacy-case','unassigned',true)$cmd$);
SELECT expect_locked($cmd$UPDATE triage_validation_studies SET phase='labeling' WHERE study_name='study-a'$cmd$);
INSERT INTO validation_cases VALUES ('case-a','study-a',true);
SELECT expect_locked($cmd$UPDATE triage_validation_studies SET phase='unblinded' WHERE study_name='study-a'$cmd$);
UPDATE triage_validation_studies SET phase='labeling' WHERE study_name='study-a';
SELECT expect_locked($cmd$UPDATE validation_cases SET active=false WHERE id='case-a'$cmd$);
SELECT expect_locked($cmd$DELETE FROM validation_cases WHERE id='case-a'$cmd$);
SELECT expect_locked($cmd$INSERT INTO validation_cases VALUES ('case-b','study-a',true)$cmd$);
SELECT expect_locked($cmd$UPDATE triage_validation_studies SET tenant_id='other' WHERE study_name='study-a'$cmd$);
SELECT expect_locked($cmd$UPDATE triage_validation_studies SET phase='draft' WHERE study_name='study-a'$cmd$);
INSERT INTO validation_reviews(case_id,reviewer_id) VALUES ('case-a','reviewer-a');
SELECT expect_locked($cmd$UPDATE triage_validation_studies SET phase='unblinded' WHERE study_name='study-a'$cmd$);
INSERT INTO validation_reviews(case_id,reviewer_id) VALUES ('case-a','reviewer-b');
SELECT expect_locked($cmd$UPDATE validation_reviews SET reviewer_id='forged' WHERE reviewer_id='reviewer-a'$cmd$);
SELECT expect_locked($cmd$DELETE FROM validation_reviews WHERE reviewer_id='reviewer-a'$cmd$);
UPDATE triage_validation_studies SET phase='unblinded' WHERE study_name='study-a';
SELECT expect_locked($cmd$INSERT INTO validation_reviews(case_id,reviewer_id) VALUES ('case-a','late-rater')$cmd$);
SELECT expect_locked($cmd$UPDATE triage_validation_studies SET phase='labeling' WHERE study_name='study-a'$cmd$);
SELECT 'PASS: governance phase transitions, blinding prerequisites, case and submitted-label immutability' AS result;
