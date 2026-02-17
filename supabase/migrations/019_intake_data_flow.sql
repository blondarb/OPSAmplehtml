-- 019_intake_data_flow.sql
-- Links patient intake forms and messages to patient records,
-- adds session source tracking, and imported-to-note flag.
--
-- IMPORTANT: Run this ONLY after reviewing.  Do NOT auto-run.
-- ================================================================

-- 1. Add patient_id FK to patient_intake_forms
ALTER TABLE patient_intake_forms
  ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES patients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_intake_forms_patient
  ON patient_intake_forms (patient_id);

-- 2. Add imported_to_note flag to patient_intake_forms
ALTER TABLE patient_intake_forms
  ADD COLUMN IF NOT EXISTS imported_to_note BOOLEAN NOT NULL DEFAULT false;

-- 3. Add patient_id FK to patient_messages
ALTER TABLE patient_messages
  ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES patients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_patient_messages_patient
  ON patient_messages (patient_id);

-- 4. Add session_source to historian_sessions
--    Distinguishes full neurologic historian sessions from voice intake sessions.
ALTER TABLE historian_sessions
  ADD COLUMN IF NOT EXISTS session_source TEXT NOT NULL DEFAULT 'neurologic_historian';

-- Valid values: 'neurologic_historian' | 'voice_intake'
COMMENT ON COLUMN historian_sessions.session_source IS
  'Source of the session: neurologic_historian (full interview) or voice_intake (patient intake form)';

-- 5. Allow anon role to insert into patient_intake_forms and patient_messages
--    (portal operates without auth for demo purposes)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow anon inserts on intake' AND tablename = 'patient_intake_forms') THEN
    CREATE POLICY "Allow anon inserts on intake" ON patient_intake_forms FOR INSERT TO anon WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow anon selects on intake' AND tablename = 'patient_intake_forms') THEN
    CREATE POLICY "Allow anon selects on intake" ON patient_intake_forms FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow anon inserts on messages' AND tablename = 'patient_messages') THEN
    CREATE POLICY "Allow anon inserts on messages" ON patient_messages FOR INSERT TO anon WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow anon selects on messages' AND tablename = 'patient_messages') THEN
    CREATE POLICY "Allow anon selects on messages" ON patient_messages FOR SELECT TO anon USING (true);
  END IF;
END $$;
