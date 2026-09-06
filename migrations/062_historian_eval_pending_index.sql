-- Migration 062: pending/queued historian evaluation dispatcher index.
-- Human applies this migration; it is not applied by the app or worker.
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_historian_sessions_eval_pending
ON historian_sessions (created_at)
WHERE final_differential->>'status' IN ('pending','queued');
