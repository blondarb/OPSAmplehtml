-- Migration 017: Tenant-shared RLS policies
-- Fix: Allow all authenticated users in same practice to see shared clinical data.
-- Previously, patients/visits/notes were locked to the creating user's user_id,
-- which meant Provider B could not see patients created by Provider A.
--
-- This matches the pattern already used by appointments (016), patient_medications
-- and patient_allergies (014), and historian_sessions (010).
--
-- Tables NOT changed (intentionally per-user):
--   dot_phrases, saved_plans, app_settings
--
-- Production note: For multi-practice deployment, replace USING (true) with
--   USING (tenant_id = get_user_tenant()) using a proper tenant lookup function.

-- ============================================================
-- PATIENTS — shared across practice
-- ============================================================
DROP POLICY IF EXISTS "Users can view own patients" ON patients;
DROP POLICY IF EXISTS "Users can insert own patients" ON patients;
DROP POLICY IF EXISTS "Users can update own patients" ON patients;
DROP POLICY IF EXISTS "Users can delete own patients" ON patients;

CREATE POLICY "Authenticated users can view patients" ON patients
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert patients" ON patients
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update patients" ON patients
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete patients" ON patients
  FOR DELETE TO authenticated USING (true);

-- ============================================================
-- VISITS — shared across practice
-- ============================================================
DROP POLICY IF EXISTS "Users can view own visits" ON visits;
DROP POLICY IF EXISTS "Users can insert own visits" ON visits;
DROP POLICY IF EXISTS "Users can update own visits" ON visits;
DROP POLICY IF EXISTS "Users can delete own visits" ON visits;

CREATE POLICY "Authenticated users can view visits" ON visits
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert visits" ON visits
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update visits" ON visits
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete visits" ON visits
  FOR DELETE TO authenticated USING (true);

-- ============================================================
-- CLINICAL_NOTES — shared across practice
-- ============================================================
DROP POLICY IF EXISTS "Users can view own clinical notes" ON clinical_notes;
DROP POLICY IF EXISTS "Users can insert own clinical notes" ON clinical_notes;
DROP POLICY IF EXISTS "Users can update own clinical notes" ON clinical_notes;

CREATE POLICY "Authenticated users can view clinical notes" ON clinical_notes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert clinical notes" ON clinical_notes
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update clinical notes" ON clinical_notes
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- DIAGNOSES — shared across practice
-- ============================================================
DROP POLICY IF EXISTS "Users can view own diagnoses" ON diagnoses;
DROP POLICY IF EXISTS "Users can insert own diagnoses" ON diagnoses;
DROP POLICY IF EXISTS "Users can update own diagnoses" ON diagnoses;

CREATE POLICY "Authenticated users can view diagnoses" ON diagnoses
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert diagnoses" ON diagnoses
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update diagnoses" ON diagnoses
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- IMAGING_STUDIES — shared across practice
-- ============================================================
DROP POLICY IF EXISTS "Users can view own imaging studies" ON imaging_studies;
DROP POLICY IF EXISTS "Users can insert own imaging studies" ON imaging_studies;
DROP POLICY IF EXISTS "Users can update own imaging studies" ON imaging_studies;

CREATE POLICY "Authenticated users can view imaging studies" ON imaging_studies
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert imaging studies" ON imaging_studies
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update imaging studies" ON imaging_studies
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- CLINICAL_SCALES (legacy table, may not exist)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'clinical_scales') THEN
    DROP POLICY IF EXISTS "Users can view own clinical scales" ON clinical_scales;
    DROP POLICY IF EXISTS "Users can insert own clinical scales" ON clinical_scales;
    DROP POLICY IF EXISTS "Users can update own clinical scales" ON clinical_scales;

    CREATE POLICY "Authenticated users can view clinical scales" ON clinical_scales
      FOR SELECT TO authenticated USING (true);
    CREATE POLICY "Authenticated users can insert clinical scales" ON clinical_scales
      FOR INSERT TO authenticated WITH CHECK (true);
    CREATE POLICY "Authenticated users can update clinical scales" ON clinical_scales
      FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================
-- SCALE_RESULTS — shared across practice
-- ============================================================
DROP POLICY IF EXISTS "Users can view own patient scale results" ON scale_results;
DROP POLICY IF EXISTS "Users can insert scale results for own patients" ON scale_results;
DROP POLICY IF EXISTS "Users can update own patient scale results" ON scale_results;
DROP POLICY IF EXISTS "Users can delete own patient scale results" ON scale_results;

CREATE POLICY "Authenticated users can view scale results" ON scale_results
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert scale results" ON scale_results
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update scale results" ON scale_results
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete scale results" ON scale_results
  FOR DELETE TO authenticated USING (true);

-- ============================================================
-- APPOINTMENTS — add provider_name column for future scheduling
-- ============================================================
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS provider_name TEXT;
