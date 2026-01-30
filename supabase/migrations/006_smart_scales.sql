-- Smart Scales Migration
-- Adds tables for dynamic scale definitions, condition-to-scale mapping, and scale results

-- ============================================
-- SCALE DEFINITIONS TABLE
-- Stores the definition of each clinical scale including questions and scoring logic
-- ============================================
CREATE TABLE IF NOT EXISTS scale_definitions (
  id TEXT PRIMARY KEY,  -- e.g., 'midas', 'phq9', 'hit6'
  name TEXT NOT NULL,
  abbreviation TEXT NOT NULL,
  description TEXT,
  category TEXT CHECK (category IN ('headache', 'cognitive', 'mental_health', 'movement', 'sleep', 'functional', 'quality_of_life', 'other')) NOT NULL,
  questions JSONB NOT NULL,  -- Array of question objects with id, text, type, options, etc.
  scoring_method TEXT CHECK (scoring_method IN ('sum', 'weighted', 'custom', 'average')) NOT NULL DEFAULT 'sum',
  scoring_ranges JSONB NOT NULL,  -- Array of {min, max, grade, interpretation, severity, recommendations}
  alerts JSONB,  -- Array of {condition, type, message} for clinical alerts
  time_to_complete INTEGER,  -- Estimated minutes to complete
  source TEXT,  -- Citation or source of the scale
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CONDITION SCALE MAPPING TABLE
-- Maps conditions/diagnoses to relevant scales
-- ============================================
CREATE TABLE IF NOT EXISTS condition_scale_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condition TEXT NOT NULL,  -- Matches values in CHIEF_COMPLAINTS
  scale_id TEXT NOT NULL REFERENCES scale_definitions(id) ON DELETE CASCADE,
  priority INTEGER DEFAULT 1,  -- Lower number = higher priority/more relevant
  is_required BOOLEAN DEFAULT FALSE,  -- Whether scale is required for this condition
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(condition, scale_id)
);

-- ============================================
-- SCALE RESULTS TABLE
-- Stores completed scale assessments with responses and scores
-- ============================================
CREATE TABLE IF NOT EXISTS scale_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  visit_id UUID REFERENCES visits(id) ON DELETE SET NULL,  -- Optional: scale may be administered outside visit
  scale_id TEXT NOT NULL REFERENCES scale_definitions(id) ON DELETE CASCADE,
  responses JSONB NOT NULL,  -- {question_id: answer_value}
  raw_score INTEGER NOT NULL,
  interpretation TEXT,
  severity_level TEXT CHECK (severity_level IN ('minimal', 'mild', 'moderate', 'moderately_severe', 'severe')),
  grade TEXT,  -- e.g., "Grade III" for MIDAS
  triggered_alerts JSONB,  -- Array of alerts that were triggered
  notes TEXT,  -- Provider notes about this scale result
  completed_by UUID REFERENCES auth.users(id),  -- Who completed it (patient via tablet or provider)
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  added_to_note BOOLEAN DEFAULT FALSE,
  added_to_note_at TIMESTAMPTZ
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Scale definitions are read-only for all authenticated users
ALTER TABLE scale_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view scale definitions" ON scale_definitions
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Condition mapping is read-only for all authenticated users
ALTER TABLE condition_scale_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view condition mapping" ON condition_scale_mapping
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Scale results: Users can only access their own patients' results
ALTER TABLE scale_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own patient scale results" ON scale_results
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM patients WHERE patients.id = scale_results.patient_id AND patients.user_id = auth.uid())
  );

CREATE POLICY "Users can insert scale results for own patients" ON scale_results
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM patients WHERE patients.id = scale_results.patient_id AND patients.user_id = auth.uid())
  );

CREATE POLICY "Users can update own patient scale results" ON scale_results
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM patients WHERE patients.id = scale_results.patient_id AND patients.user_id = auth.uid())
  );

CREATE POLICY "Users can delete own patient scale results" ON scale_results
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM patients WHERE patients.id = scale_results.patient_id AND patients.user_id = auth.uid())
  );

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_condition_scale_mapping_condition ON condition_scale_mapping(condition);
CREATE INDEX IF NOT EXISTS idx_condition_scale_mapping_scale_id ON condition_scale_mapping(scale_id);
CREATE INDEX IF NOT EXISTS idx_scale_results_patient_id ON scale_results(patient_id);
CREATE INDEX IF NOT EXISTS idx_scale_results_visit_id ON scale_results(visit_id);
CREATE INDEX IF NOT EXISTS idx_scale_results_scale_id ON scale_results(scale_id);
CREATE INDEX IF NOT EXISTS idx_scale_results_completed_at ON scale_results(completed_at);

-- ============================================
-- TRIGGERS
-- ============================================
CREATE TRIGGER update_scale_definitions_updated_at
  BEFORE UPDATE ON scale_definitions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_scale_results_updated_at
  BEFORE UPDATE ON scale_results
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- FUNCTION: Get scales for a condition
-- ============================================
CREATE OR REPLACE FUNCTION get_scales_for_condition(p_condition TEXT)
RETURNS TABLE (
  scale_id TEXT,
  name TEXT,
  abbreviation TEXT,
  description TEXT,
  category TEXT,
  questions JSONB,
  scoring_method TEXT,
  scoring_ranges JSONB,
  alerts JSONB,
  priority INTEGER,
  is_required BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sd.id AS scale_id,
    sd.name,
    sd.abbreviation,
    sd.description,
    sd.category,
    sd.questions,
    sd.scoring_method,
    sd.scoring_ranges,
    sd.alerts,
    csm.priority,
    csm.is_required
  FROM scale_definitions sd
  JOIN condition_scale_mapping csm ON sd.id = csm.scale_id
  WHERE csm.condition = p_condition
  ORDER BY csm.priority ASC;
END;
$$;

-- ============================================
-- FUNCTION: Get patient scale history
-- ============================================
CREATE OR REPLACE FUNCTION get_patient_scale_history(
  p_patient_id UUID,
  p_scale_id TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  result_id UUID,
  scale_id TEXT,
  scale_name TEXT,
  raw_score INTEGER,
  interpretation TEXT,
  severity_level TEXT,
  completed_at TIMESTAMPTZ,
  visit_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verify the user has access to this patient
  IF NOT EXISTS (SELECT 1 FROM patients WHERE id = p_patient_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    sr.id AS result_id,
    sr.scale_id,
    sd.name AS scale_name,
    sr.raw_score,
    sr.interpretation,
    sr.severity_level,
    sr.completed_at,
    sr.visit_id
  FROM scale_results sr
  JOIN scale_definitions sd ON sr.scale_id = sd.id
  WHERE sr.patient_id = p_patient_id
    AND (p_scale_id IS NULL OR sr.scale_id = p_scale_id)
  ORDER BY sr.completed_at DESC
  LIMIT p_limit;
END;
$$;
