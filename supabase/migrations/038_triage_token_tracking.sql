-- Add token usage tracking columns to triage_sessions
-- Enables cost monitoring and prompt optimization analysis

ALTER TABLE triage_sessions ADD COLUMN IF NOT EXISTS ai_input_tokens INTEGER;
ALTER TABLE triage_sessions ADD COLUMN IF NOT EXISTS ai_output_tokens INTEGER;
