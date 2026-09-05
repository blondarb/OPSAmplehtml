-- Read-only aggregate inventory. Do not add referral_text, reasoning, names, or user IDs.
BEGIN READ ONLY;
SELECT c.study_name,count(*) AS cases,min(c.created_at) AS first_case_at,max(c.created_at) AS latest_case_at,
 (SELECT count(*) FROM validation_reviews r JOIN validation_cases v ON v.id=r.case_id WHERE v.study_name=c.study_name) AS review_count,
 (SELECT count(DISTINCT r.reviewer_id) FROM validation_reviews r JOIN validation_cases v ON v.id=r.case_id WHERE v.study_name=c.study_name) AS distinct_reviewers,
 (SELECT count(*) FROM validation_ai_runs r JOIN validation_cases v ON v.id=r.case_id WHERE v.study_name=c.study_name) AS run_count,
 (SELECT max(r.created_at) FROM validation_ai_runs r JOIN validation_cases v ON v.id=r.case_id WHERE v.study_name=c.study_name) AS latest_run_at
 FROM validation_cases c GROUP BY c.study_name ORDER BY c.study_name;
COMMIT;
