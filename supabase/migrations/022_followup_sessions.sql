-- 022_followup_sessions.sql
-- Post-Visit Follow-Up Agent: stores follow-up sessions, escalation events,
-- and seeds 6 demo patient scenarios for the follow-up demo.
-- ================================================================

CREATE TABLE IF NOT EXISTS followup_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Patient context
  patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
  patient_name TEXT NOT NULL,
  visit_date DATE,
  provider_name TEXT,

  -- Session metadata
  follow_up_method TEXT NOT NULL DEFAULT 'sms',
  conversation_status TEXT NOT NULL DEFAULT 'in_progress',
  duration_seconds INTEGER,

  -- Conversation data
  transcript JSONB NOT NULL DEFAULT '[]'::jsonb,
  medications_discussed JSONB NOT NULL DEFAULT '[]'::jsonb,
  side_effects_reported JSONB NOT NULL DEFAULT '[]'::jsonb,
  new_symptoms_reported JSONB NOT NULL DEFAULT '[]'::jsonb,
  functional_status TEXT,
  functional_details TEXT,

  -- Caregiver
  caregiver_name TEXT,
  caregiver_relationship TEXT,

  -- Questions & escalation
  patient_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  escalation_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  escalation_level TEXT NOT NULL DEFAULT 'none',

  -- Summary
  post_call_summary TEXT,
  clinician_reviewed BOOLEAN NOT NULL DEFAULT false,

  -- Audit
  ai_model_used TEXT NOT NULL DEFAULT 'gpt-5.2',
  language_used TEXT DEFAULT 'en',
  user_id UUID
);

CREATE INDEX IF NOT EXISTS idx_followup_sessions_created_at ON followup_sessions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_followup_sessions_escalation ON followup_sessions (escalation_level);
CREATE INDEX IF NOT EXISTS idx_followup_sessions_status ON followup_sessions (conversation_status);
CREATE INDEX IF NOT EXISTS idx_followup_sessions_patient_id ON followup_sessions (patient_id);

CREATE TABLE IF NOT EXISTS followup_escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES followup_sessions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  severity TEXT NOT NULL,
  trigger_text TEXT NOT NULL,
  trigger_category TEXT,
  ai_assessment TEXT,
  recommended_action TEXT,

  acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_by TEXT,
  resolution_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_followup_escalations_session ON followup_escalations (session_id);
CREATE INDEX IF NOT EXISTS idx_followup_escalations_severity ON followup_escalations (severity);

-- Seed 6 demo patients for follow-up scenarios
-- Uses ON CONFLICT to be idempotent
INSERT INTO patients (mrn, first_name, last_name, date_of_birth, gender, phone, email, user_id)
VALUES
  ('FUDEMO-001', 'Maria', 'Santos', '1992-03-15', 'F', '555-0101', 'maria.santos@demo.test', '00000000-0000-0000-0000-000000000000'),
  ('FUDEMO-002', 'James', 'Okonkwo', '1984-07-22', 'M', '555-0102', 'james.okonkwo@demo.test', '00000000-0000-0000-0000-000000000000'),
  ('FUDEMO-003', 'Dorothy', 'Chen', '1954-11-08', 'F', '555-0103', 'dorothy.chen@demo.test', '00000000-0000-0000-0000-000000000000'),
  ('FUDEMO-004', 'Robert', 'Alvarez', '1971-01-30', 'M', '555-0104', 'robert.alvarez@demo.test', '00000000-0000-0000-0000-000000000000'),
  ('FUDEMO-005', 'Harold', 'Washington', '1948-06-12', 'M', '555-0105', 'harold.washington@demo.test', '00000000-0000-0000-0000-000000000000'),
  ('FUDEMO-006', 'Keisha', 'Brown', '1998-09-25', 'F', '555-0106', 'keisha.brown@demo.test', '00000000-0000-0000-0000-000000000000')
ON CONFLICT (mrn) DO NOTHING;
