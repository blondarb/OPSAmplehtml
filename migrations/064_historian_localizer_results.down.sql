-- Down migration for 064_historian_localizer_results.sql
--
-- Drops the session-keyed Localizer results table.
--
-- Run: psql $RDS_URL -f migrations/064_historian_localizer_results.down.sql

DROP TABLE IF EXISTS historian_localizer_results;
