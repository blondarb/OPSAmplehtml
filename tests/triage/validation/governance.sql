-- Synthetic-only fixture for an EMPTY disposable PostgreSQL database.
\set ON_ERROR_STOP on
CREATE TABLE validation_cases (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),study_name text NOT NULL,referral_text text NOT NULL,patient_age integer,patient_sex text,active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE validation_reviews(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),case_id uuid REFERENCES validation_cases(id),reviewer_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE validation_ai_runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),case_id uuid REFERENCES validation_cases(id),ai_triage_tier text,created_at timestamptz NOT NULL DEFAULT now());
INSERT INTO validation_cases(id,study_name,referral_text) VALUES('00000000-0000-0000-0000-000000000001','legacy','SYNTHETIC ORIGINAL');
INSERT INTO validation_reviews(case_id,reviewer_id) VALUES('00000000-0000-0000-0000-000000000001','old-identity');
INSERT INTO validation_ai_runs(case_id,ai_triage_tier) VALUES('00000000-0000-0000-0000-000000000001','routine');
CREATE TEMP TABLE original_evidence AS SELECT (SELECT jsonb_agg(to_jsonb(r)) FROM validation_reviews r) reviews,(SELECT jsonb_agg(to_jsonb(r)) FROM validation_ai_runs r) runs;
\ir ../../../migrations/061_triage_validation_governance.sql
CREATE FUNCTION expect_locked(command text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN BEGIN EXECUTE command; EXCEPTION WHEN SQLSTATE '55000' THEN RETURN; END; RAISE EXCEPTION 'Expected lock: %',command; END $$;
SELECT expect_locked($q$INSERT INTO triage_validation_studies(study_name,tenant_id) VALUES('legacy','tenant-a')$q$);
INSERT INTO triage_validation_studies(study_name,tenant_id,study_kind,phase,archive_manifest) VALUES('legacy','tenant-a','legacy_archive','archived','{"case_count":1,"review_count":1,"run_count":1,"reviewed_by":"synthetic-operator","reviewed_at":"2026-09-05","source_provenance":"legacy_unknown"}');
DO $$ BEGIN
 IF (SELECT jsonb_agg(to_jsonb(r)-'comfortable_with_wait'-'reviewer_kind'-'observed_source_sha256'-'label_context') FROM validation_reviews r) IS DISTINCT FROM (SELECT reviews FROM original_evidence) OR (SELECT jsonb_agg(to_jsonb(r)) FROM validation_ai_runs r) IS DISTINCT FROM (SELECT runs FROM original_evidence) THEN RAISE EXCEPTION 'Historical evidence changed'; END IF;
END $$;
SELECT expect_locked($q$UPDATE validation_cases SET referral_text='REPLACED' WHERE study_name='legacy'$q$);
SELECT expect_locked($q$DELETE FROM validation_reviews WHERE reviewer_id='old-identity'$q$);
SELECT expect_locked($q$DELETE FROM validation_ai_runs$q$);
SELECT expect_locked($q$UPDATE triage_validation_studies SET phase='labeling' WHERE study_name='legacy'$q$);
INSERT INTO triage_validation_studies(study_name,tenant_id) VALUES('study-a','tenant-a');
INSERT INTO triage_validation_memberships(study_name,user_id,role,reviewer_kind) VALUES('study-a','physician-a','reviewer','physician'),('study-a','physician-b','reviewer','physician'),('study-a','nurse','reviewer','triage_nurse');
INSERT INTO validation_cases(id,study_name,referral_text) VALUES('00000000-0000-0000-0000-000000000002','study-a','SYNTHETIC NEW');
CREATE TEMP TABLE before_demographics AS SELECT observed_source_sha256 hash FROM validation_cases WHERE study_name='study-a';
UPDATE validation_cases SET patient_age=40,patient_sex='F' WHERE study_name='study-a';
DO $$ BEGIN IF (SELECT observed_source_sha256 FROM validation_cases WHERE study_name='study-a')=(SELECT hash FROM before_demographics) THEN RAISE EXCEPTION 'Demographics not bound'; END IF; END $$;
UPDATE triage_validation_studies SET phase='labeling' WHERE study_name='study-a';
SELECT expect_locked($q$UPDATE validation_cases SET active=false WHERE study_name='study-a'$q$);
INSERT INTO validation_reviews(case_id,reviewer_id,comfortable_with_wait) VALUES('00000000-0000-0000-0000-000000000002','physician-a','yes'),('00000000-0000-0000-0000-000000000002','nurse','no');
SELECT expect_locked($q$UPDATE triage_validation_studies SET phase='unblinded' WHERE study_name='study-a'$q$);
INSERT INTO validation_reviews(case_id,reviewer_id,comfortable_with_wait) VALUES('00000000-0000-0000-0000-000000000002','physician-b','uncertain');
DO $$ BEGIN
 BEGIN INSERT INTO validation_reviews(case_id,reviewer_id,comfortable_with_wait) VALUES('00000000-0000-0000-0000-000000000002','physician-a','yes');
 EXCEPTION WHEN unique_violation THEN RETURN; END;
 RAISE EXCEPTION 'Duplicate independent label accepted';
END $$;
UPDATE triage_validation_studies SET phase='unblinded' WHERE study_name='study-a';
SELECT expect_locked($q$UPDATE validation_reviews SET comfortable_with_wait='yes' WHERE reviewer_id='nurse'$q$);
SELECT expect_locked($q$UPDATE triage_validation_studies SET phase='labeling' WHERE study_name='study-a'$q$);
INSERT INTO triage_validation_attempts(study_name,case_id,request_key,source_sha256,configuration_revision,scope,created_by) SELECT study_name,id,'00000000-0000-0000-0000-000000000003',observed_source_sha256,'revision','scorer_consistency','synthetic-admin' FROM validation_cases WHERE study_name='study-a';
SELECT expect_locked($q$INSERT INTO triage_validation_receipts(study_name,case_id,request_key,source_sha256,source_commit,configuration,configuration_revision,evaluation_scope,status,result,created_by) SELECT study_name,id,'00000000-0000-0000-0000-000000000003',observed_source_sha256,'synthetic-source','{}','WRONG','scorer_consistency','error','{}','synthetic-admin' FROM validation_cases WHERE study_name='study-a'$q$);
SELECT expect_locked($q$INSERT INTO triage_validation_amendments(review_id,study_name,requested_by,reason) SELECT id,'study-a','forged','synthetic' FROM validation_reviews WHERE reviewer_id='physician-a'$q$);
INSERT INTO triage_validation_receipts(study_name,case_id,request_key,source_sha256,source_commit,configuration,configuration_revision,evaluation_scope,status,result,created_by) SELECT study_name,id,'00000000-0000-0000-0000-000000000003',observed_source_sha256,'synthetic-source','{}','revision','scorer_consistency','error','{"error":"synthetic_failure"}','synthetic-admin' FROM validation_cases WHERE study_name='study-a';
SELECT expect_locked($q$DELETE FROM triage_validation_receipts$q$);
SELECT expect_locked($q$UPDATE triage_validation_attempts SET source_sha256='forged'$q$);
SELECT expect_locked($q$INSERT INTO triage_validation_attempts(study_name,case_id,request_key,source_sha256,configuration_revision,scope,created_by) SELECT study_name,id,gen_random_uuid(),observed_source_sha256,'rev','scorer_consistency','admin' FROM validation_cases WHERE study_name='legacy'$q$);
SELECT 'PASS: historical identities/timestamps/scores preserved, archives locked, nurse separate from physician gate, receipts immutable' AS result;
