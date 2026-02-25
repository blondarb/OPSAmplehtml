-- 029_patient_messages_ai.sql
-- Extends patient_messages with AI draft response support.
-- ================================================================

ALTER TABLE patient_messages
  ADD COLUMN IF NOT EXISTS ai_draft TEXT,
  ADD COLUMN IF NOT EXISTS ai_assisted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS draft_status TEXT CHECK (draft_status IN (
    'pending', 'accepted', 'edited', 'discarded'
  )),
  ADD COLUMN IF NOT EXISTS patient_id UUID;  -- link to patients table
