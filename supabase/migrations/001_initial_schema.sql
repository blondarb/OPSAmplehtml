-- Sevaro Clinical Note Database Schema
-- Run this in your Supabase SQL Editor

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- PATIENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS patients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mrn TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  date_of_birth DATE NOT NULL,
  gender TEXT CHECK (gender IN ('M', 'F', 'O')) NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  timezone TEXT DEFAULT 'America/Los_Angeles',
  UNIQUE(user_id, mrn)
);

-- ============================================
-- VISITS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS visits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  visit_date TIMESTAMPTZ NOT NULL,
  visit_type TEXT CHECK (visit_type IN ('new_patient', 'follow_up', 'urgent', 'telehealth')) NOT NULL,
  chief_complaint TEXT[] DEFAULT '{}',
  status TEXT CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')) DEFAULT 'scheduled'
);

-- ============================================
-- CLINICAL NOTES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS clinical_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  hpi TEXT,
  ros TEXT,
  allergies TEXT,
  physical_exam JSONB,
  assessment TEXT,
  plan TEXT,
  ai_summary TEXT,
  is_signed BOOLEAN DEFAULT FALSE,
  signed_at TIMESTAMPTZ,
  UNIQUE(visit_id)
);

-- ============================================
-- CLINICAL SCALES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS clinical_scales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  scale_type TEXT CHECK (scale_type IN ('MIDAS', 'HIT6', 'PHQ9', 'GAD7', 'MOCA', 'MINICOG')) NOT NULL,
  score INTEGER NOT NULL,
  interpretation TEXT,
  answers JSONB
);

-- ============================================
-- DIAGNOSES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS diagnoses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  icd10_code TEXT NOT NULL,
  description TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT FALSE
);

-- ============================================
-- IMAGING STUDIES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS imaging_studies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  study_type TEXT CHECK (study_type IN ('CT', 'MRI', 'XRAY', 'US', 'OTHER')) NOT NULL,
  study_date DATE NOT NULL,
  description TEXT NOT NULL,
  findings TEXT,
  impression TEXT
);

-- ============================================
-- APP SETTINGS (for storing OpenAI key securely)
-- ============================================
CREATE TABLE IF NOT EXISTS app_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_scales ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnoses ENABLE ROW LEVEL SECURITY;
ALTER TABLE imaging_studies ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Patients: Users can only see their own patients
CREATE POLICY "Users can view own patients" ON patients
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own patients" ON patients
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own patients" ON patients
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own patients" ON patients
  FOR DELETE USING (auth.uid() = user_id);

-- Visits: Users can only see their own visits
CREATE POLICY "Users can view own visits" ON visits
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own visits" ON visits
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own visits" ON visits
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own visits" ON visits
  FOR DELETE USING (auth.uid() = user_id);

-- Clinical Notes: Access through visits
CREATE POLICY "Users can view own clinical notes" ON clinical_notes
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM visits WHERE visits.id = clinical_notes.visit_id AND visits.user_id = auth.uid())
  );

CREATE POLICY "Users can insert own clinical notes" ON clinical_notes
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM visits WHERE visits.id = clinical_notes.visit_id AND visits.user_id = auth.uid())
  );

CREATE POLICY "Users can update own clinical notes" ON clinical_notes
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM visits WHERE visits.id = clinical_notes.visit_id AND visits.user_id = auth.uid())
  );

-- Clinical Scales: Access through visits
CREATE POLICY "Users can view own clinical scales" ON clinical_scales
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM visits WHERE visits.id = clinical_scales.visit_id AND visits.user_id = auth.uid())
  );

CREATE POLICY "Users can insert own clinical scales" ON clinical_scales
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM visits WHERE visits.id = clinical_scales.visit_id AND visits.user_id = auth.uid())
  );

CREATE POLICY "Users can update own clinical scales" ON clinical_scales
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM visits WHERE visits.id = clinical_scales.visit_id AND visits.user_id = auth.uid())
  );

-- Diagnoses: Access through visits
CREATE POLICY "Users can view own diagnoses" ON diagnoses
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM visits WHERE visits.id = diagnoses.visit_id AND visits.user_id = auth.uid())
  );

CREATE POLICY "Users can insert own diagnoses" ON diagnoses
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM visits WHERE visits.id = diagnoses.visit_id AND visits.user_id = auth.uid())
  );

CREATE POLICY "Users can update own diagnoses" ON diagnoses
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM visits WHERE visits.id = diagnoses.visit_id AND visits.user_id = auth.uid())
  );

-- Imaging Studies: Access through patients
CREATE POLICY "Users can view own imaging studies" ON imaging_studies
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM patients WHERE patients.id = imaging_studies.patient_id AND patients.user_id = auth.uid())
  );

CREATE POLICY "Users can insert own imaging studies" ON imaging_studies
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM patients WHERE patients.id = imaging_studies.patient_id AND patients.user_id = auth.uid())
  );

-- App Settings: NO user access - only service role can read/write
-- (No policies = no access for regular users)

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to get OpenAI key (only callable by authenticated users, returns from secure storage)
CREATE OR REPLACE FUNCTION get_openai_key()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  api_key TEXT;
BEGIN
  -- Only allow authenticated users
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get the key from app_settings (this bypasses RLS because of SECURITY DEFINER)
  SELECT value INTO api_key FROM app_settings WHERE key = 'openai_api_key';

  RETURN api_key;
END;
$$;

-- Function to update timestamps automatically
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_patients_updated_at
  BEFORE UPDATE ON patients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_visits_updated_at
  BEFORE UPDATE ON visits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_clinical_notes_updated_at
  BEFORE UPDATE ON clinical_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_app_settings_updated_at
  BEFORE UPDATE ON app_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_patients_user_id ON patients(user_id);
CREATE INDEX IF NOT EXISTS idx_visits_patient_id ON visits(patient_id);
CREATE INDEX IF NOT EXISTS idx_visits_user_id ON visits(user_id);
CREATE INDEX IF NOT EXISTS idx_visits_date ON visits(visit_date);
CREATE INDEX IF NOT EXISTS idx_clinical_notes_visit_id ON clinical_notes(visit_id);
CREATE INDEX IF NOT EXISTS idx_clinical_scales_patient_id ON clinical_scales(patient_id);
CREATE INDEX IF NOT EXISTS idx_clinical_scales_visit_id ON clinical_scales(visit_id);
CREATE INDEX IF NOT EXISTS idx_diagnoses_patient_id ON diagnoses(patient_id);
CREATE INDEX IF NOT EXISTS idx_imaging_studies_patient_id ON imaging_studies(patient_id);

-- ============================================
-- SEED DATA FOR DEMO
-- ============================================
-- Note: This will be inserted after a user signs up
-- The seed data function can be called to populate demo data
