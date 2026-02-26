-- 031_followup_schema_fix_and_phone_sessions.sql
-- Fixes column mismatches in followup_sessions/followup_escalations
-- and adds followup_phone_sessions for Twilio SMS demo.
-- ================================================================

-- 1. Add missing columns to followup_sessions
ALTER TABLE followup_sessions ADD COLUMN IF NOT EXISTS patient_age INTEGER;
ALTER TABLE followup_sessions ADD COLUMN IF NOT EXISTS patient_gender TEXT;
ALTER TABLE followup_sessions ADD COLUMN IF NOT EXISTS diagnosis TEXT;
ALTER TABLE followup_sessions ADD COLUMN IF NOT EXISTS visit_summary TEXT;
ALTER TABLE followup_sessions ADD COLUMN IF NOT EXISTS medications JSONB DEFAULT '[]'::jsonb;
ALTER TABLE followup_sessions ADD COLUMN IF NOT EXISTS medication_status JSONB DEFAULT '[]'::jsonb;
ALTER TABLE followup_sessions ADD COLUMN IF NOT EXISTS caregiver_info JSONB;
ALTER TABLE followup_sessions ADD COLUMN IF NOT EXISTS current_module TEXT DEFAULT 'greeting';
ALTER TABLE followup_sessions ADD COLUMN IF NOT EXISTS conversation_complete BOOLEAN DEFAULT false;

-- 2. Add 'status' column (code writes 'status', migration 022 defined 'conversation_status')
ALTER TABLE followup_sessions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'in_progress';

-- 3. Fix followup_escalations: add 'tier' and 'category' columns
ALTER TABLE followup_escalations ADD COLUMN IF NOT EXISTS tier TEXT;
ALTER TABLE followup_escalations ADD COLUMN IF NOT EXISTS category TEXT;

-- 4. New table: followup_phone_sessions (maps phone numbers to sessions for Twilio)
CREATE TABLE IF NOT EXISTS followup_phone_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number TEXT NOT NULL,
  session_id UUID REFERENCES followup_sessions(id),
  scenario_id TEXT NOT NULL,
  twilio_number TEXT NOT NULL,
  channel TEXT DEFAULT 'sms',
  sms_history JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '24 hours'),
  opted_out BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_phone_sessions_phone ON followup_phone_sessions(phone_number);
CREATE INDEX IF NOT EXISTS idx_phone_sessions_session ON followup_phone_sessions(session_id);

-- 5. Enable realtime for followup_sessions (needed for dashboard live updates)
ALTER PUBLICATION supabase_realtime ADD TABLE followup_sessions;
