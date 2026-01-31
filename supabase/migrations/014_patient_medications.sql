-- Migration 014: Patient Medications, Allergies, and Medication Reviews
-- Creates structured medication + allergy storage for clinical workflow

-- ============================================================
-- 1. patient_medications — patient-scoped, longitudinal
-- ============================================================
CREATE TABLE IF NOT EXISTS patient_medications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  medication_name TEXT NOT NULL,
  generic_name TEXT,
  dosage TEXT,
  frequency TEXT,
  route TEXT DEFAULT 'PO',
  start_date DATE,
  end_date DATE,
  prescriber TEXT,
  indication TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'discontinued', 'held', 'completed', 'failed')),
  discontinue_reason TEXT,
  source TEXT DEFAULT 'manual'
    CHECK (source IN ('manual', 'ai_historian', 'ai_scribe', 'import')),
  ai_confidence REAL,
  confirmed_by_user BOOLEAN DEFAULT FALSE,
  notes TEXT,
  is_active BOOLEAN GENERATED ALWAYS AS (status = 'active') STORED,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_patient_medications_patient_id ON patient_medications(patient_id);
CREATE INDEX idx_patient_medications_patient_active ON patient_medications(patient_id, is_active);
CREATE INDEX idx_patient_medications_tenant_id ON patient_medications(tenant_id);

-- Auto-update updated_at trigger (reuse existing function)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_patient_medications_updated_at
  BEFORE UPDATE ON patient_medications
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE patient_medications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read medications"
  ON patient_medications FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert medications"
  ON patient_medications FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update medications"
  ON patient_medications FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete medications"
  ON patient_medications FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================
-- 2. patient_allergies — patient-scoped
-- ============================================================
CREATE TABLE IF NOT EXISTS patient_allergies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  allergen TEXT NOT NULL,
  allergen_type TEXT NOT NULL DEFAULT 'drug'
    CHECK (allergen_type IN ('drug', 'food', 'environmental', 'other')),
  reaction TEXT,
  severity TEXT DEFAULT 'unknown'
    CHECK (severity IN ('mild', 'moderate', 'severe', 'life-threatening', 'unknown')),
  onset_date DATE,
  source TEXT DEFAULT 'manual'
    CHECK (source IN ('manual', 'ai_historian', 'ai_scribe', 'import')),
  confirmed_by_user BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_patient_allergies_patient_id ON patient_allergies(patient_id);
CREATE INDEX idx_patient_allergies_patient_active ON patient_allergies(patient_id, is_active);
CREATE INDEX idx_patient_allergies_tenant_id ON patient_allergies(tenant_id);

CREATE TRIGGER update_patient_allergies_updated_at
  BEFORE UPDATE ON patient_allergies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE patient_allergies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read allergies"
  ON patient_allergies FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert allergies"
  ON patient_allergies FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update allergies"
  ON patient_allergies FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete allergies"
  ON patient_allergies FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================
-- 3. medication_reviews — audit trail for reconciliation
-- ============================================================
CREATE TABLE IF NOT EXISTS medication_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  visit_id UUID REFERENCES visits(id),
  tenant_id TEXT NOT NULL DEFAULT 'default',
  reviewed_by UUID REFERENCES auth.users(id),
  review_type TEXT DEFAULT 'reconciliation'
    CHECK (review_type IN ('reconciliation', 'renewal', 'initial')),
  changes_made JSONB DEFAULT '[]',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_medication_reviews_patient_id ON medication_reviews(patient_id);
CREATE INDEX idx_medication_reviews_visit_id ON medication_reviews(visit_id);
CREATE INDEX idx_medication_reviews_tenant_id ON medication_reviews(tenant_id);

-- RLS
ALTER TABLE medication_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read medication reviews"
  ON medication_reviews FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert medication reviews"
  ON medication_reviews FOR INSERT
  TO authenticated
  WITH CHECK (true);
