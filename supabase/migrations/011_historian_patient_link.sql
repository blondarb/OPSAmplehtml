-- 011_historian_patient_link.sql
-- Links historian_sessions to patients via FK, adds referral columns to patients,
-- and creates SECURITY DEFINER RPC functions for the unauthenticated patient portal.
--
-- IMPORTANT: Run this ONLY after reviewing.  Do NOT auto-run.
-- ================================================================

-- 1. Add patient_id FK to historian_sessions
ALTER TABLE historian_sessions
  ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES patients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_historian_sessions_patient
  ON historian_sessions (patient_id);

-- 2. Add referral columns to patients (may already exist from a prior migration)
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS referral_reason TEXT;

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS referring_physician TEXT;

-- 3. get_patients_for_portal(tenant_id)
--    SECURITY DEFINER so the anon role can bypass RLS on the patients table.
CREATE OR REPLACE FUNCTION get_patients_for_portal(p_tenant_id TEXT DEFAULT 'default')
RETURNS TABLE (
  id UUID,
  first_name TEXT,
  last_name TEXT,
  date_of_birth DATE,
  gender TEXT,
  mrn TEXT,
  referral_reason TEXT,
  referring_physician TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
    SELECT
      p.id,
      p.first_name,
      p.last_name,
      p.date_of_birth,
      p.gender,
      p.mrn,
      p.referral_reason,
      p.referring_physician
    FROM patients p
    WHERE p.tenant_id = p_tenant_id
    ORDER BY p.last_name, p.first_name;
END;
$$;

-- 4. get_patient_context_for_portal(patient_id)
--    Returns patient name, referral reason, and last visit + note data.
CREATE OR REPLACE FUNCTION get_patient_context_for_portal(p_patient_id UUID)
RETURNS TABLE (
  patient_name TEXT,
  referral_reason TEXT,
  last_visit_date TIMESTAMPTZ,
  last_visit_type TEXT,
  last_note_hpi TEXT,
  last_note_assessment TEXT,
  last_note_plan TEXT,
  last_note_summary TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
    SELECT
      (pt.first_name || ' ' || pt.last_name)::TEXT AS patient_name,
      pt.referral_reason,
      v.visit_date AS last_visit_date,
      v.visit_type AS last_visit_type,
      cn.hpi AS last_note_hpi,
      cn.assessment AS last_note_assessment,
      cn.plan AS last_note_plan,
      cn.ai_summary AS last_note_summary
    FROM patients pt
    LEFT JOIN LATERAL (
      SELECT v2.id, v2.visit_date, v2.visit_type
      FROM visits v2
      WHERE v2.patient_id = pt.id
        AND v2.status = 'completed'
      ORDER BY v2.visit_date DESC
      LIMIT 1
    ) v ON TRUE
    LEFT JOIN clinical_notes cn ON cn.visit_id = v.id
    WHERE pt.id = p_patient_id;
END;
$$;

-- 5. portal_register_patient(...)
--    Inserts a new patient using the first physician's user_id in the tenant
--    (solves the NOT NULL user_id constraint without auth).
CREATE OR REPLACE FUNCTION portal_register_patient(
  p_first_name TEXT,
  p_last_name TEXT,
  p_referral_reason TEXT DEFAULT NULL,
  p_tenant_id TEXT DEFAULT 'default'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_new_patient_id UUID;
  v_mrn TEXT;
BEGIN
  -- Find the first physician's user_id in this tenant
  SELECT p.user_id INTO v_user_id
    FROM patients p
    WHERE p.tenant_id = p_tenant_id
    LIMIT 1;

  -- If no existing patients in this tenant, try the first user in auth.users
  IF v_user_id IS NULL THEN
    SELECT au.id INTO v_user_id
      FROM auth.users au
      LIMIT 1;
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No physician user found for tenant %', p_tenant_id;
  END IF;

  -- Generate a simple MRN
  v_mrn := 'PTL-' || LPAD(FLOOR(RANDOM() * 999999)::TEXT, 6, '0');

  INSERT INTO patients (user_id, mrn, first_name, last_name, date_of_birth, gender, referral_reason, tenant_id)
  VALUES (v_user_id, v_mrn, p_first_name, p_last_name, '1970-01-01', 'O', p_referral_reason, p_tenant_id)
  RETURNING id INTO v_new_patient_id;

  RETURN v_new_patient_id;
END;
$$;

-- 6. Grant execute to anon + authenticated roles
GRANT EXECUTE ON FUNCTION get_patients_for_portal(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_patient_context_for_portal(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION portal_register_patient(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

-- 7. Allow anon role to insert into historian_sessions (portal saves sessions without auth)
CREATE POLICY "Allow anon inserts" ON historian_sessions
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow anon selects" ON historian_sessions
  FOR SELECT TO anon USING (true);
