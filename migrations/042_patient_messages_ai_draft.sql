-- Migration 042: Add AI draft response columns to patient_messages
--
-- Enables the draft-response route to persist AI-generated drafts
-- and track their approval status before sending to patients.

ALTER TABLE patient_messages
  ADD COLUMN IF NOT EXISTS ai_draft TEXT,
  ADD COLUMN IF NOT EXISTS draft_status TEXT DEFAULT NULL
    CHECK (draft_status IN ('pending', 'approved', 'rejected', 'sent'));

-- Index for querying pending drafts (physician review queue)
CREATE INDEX IF NOT EXISTS idx_patient_messages_draft_status
  ON patient_messages (draft_status)
  WHERE draft_status IS NOT NULL;

COMMENT ON COLUMN patient_messages.ai_draft IS 'AI-generated draft response text from Bedrock';
COMMENT ON COLUMN patient_messages.draft_status IS 'Draft lifecycle: pending -> approved/rejected -> sent';
