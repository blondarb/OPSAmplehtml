-- Async + polling pattern hardening (follow-up to 045).
--
-- The pending row inserted by POST /api/triage has only the input fields
-- populated; the AI result columns are filled in by the background
-- promise via UPDATE when Bedrock returns. The original schema marked
-- those result columns NOT NULL because every row was complete on insert.
--
-- Drop NOT NULL on the result columns so a 'pending' row can exist.
-- Existing rows are unaffected (DROP NOT NULL leaves data alone).
-- The processing_status column is the authoritative signal for whether
-- a row's result fields are populated.

ALTER TABLE triage_sessions
  ALTER COLUMN triage_tier DROP NOT NULL,
  ALTER COLUMN confidence DROP NOT NULL,
  ALTER COLUMN dimension_scores DROP NOT NULL,
  ALTER COLUMN ai_model_used DROP NOT NULL;
