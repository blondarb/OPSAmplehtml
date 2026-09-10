-- Rollback for migration 066: historian_sim_score_jobs
DROP INDEX IF EXISTS idx_hssj_created;
DROP TABLE IF EXISTS historian_sim_score_jobs;
