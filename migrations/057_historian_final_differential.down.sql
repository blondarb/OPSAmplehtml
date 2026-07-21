-- Down migration for 057_historian_final_differential.sql
--
-- Drops the final_differential column from historian_sessions.
--
-- Run: psql $RDS_URL -f migrations/057_historian_final_differential.down.sql

ALTER TABLE historian_sessions DROP COLUMN IF EXISTS final_differential;
