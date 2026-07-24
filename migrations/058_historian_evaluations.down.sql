-- Down migration for 058_historian_evaluations.sql
--
-- Drops the historian_evaluations table (and its index, implicitly, via
-- CASCADE-free DROP TABLE which removes owned indexes automatically).
--
-- Run: psql $RDS_URL -f migrations/058_historian_evaluations.down.sql

DROP TABLE IF EXISTS historian_evaluations;
