-- Down migration for 056_historian_transcript_events.sql
--
-- Drops the durable transcript-event log table and its index. The index is
-- dropped implicitly with the table, but named explicitly here for clarity
-- and symmetry with the up migration.
--
-- Run: psql $RDS_URL -f migrations/056_historian_transcript_events.down.sql

DROP INDEX IF EXISTS idx_hte_session;
DROP TABLE IF EXISTS historian_transcript_events;
