-- Rollback for migration 063: historian_review_feedback
DROP INDEX IF EXISTS idx_hrf_session;
DROP TABLE IF EXISTS historian_review_feedback;
