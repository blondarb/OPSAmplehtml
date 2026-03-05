-- 036_enhanced_clinical_analysis.sql
-- Enhanced Clinical Analysis Pipeline: new tables + schema additions
-- Creates wearable_tapping_assessments, wearable_clinical_narratives
-- Adds enhanced AI analysis columns to fluency and tremor assessment tables

-- ============================================================
-- 1. Tapping assessments (new table — code references it but 035 only had tremor + fluency)
-- ============================================================
CREATE TABLE IF NOT EXISTS wearable_tapping_assessments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    patient_id UUID NOT NULL REFERENCES wearable_patients(id) ON DELETE CASCADE,
    assessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    composite_score DOUBLE PRECISION NOT NULL,
    asymmetry_index DOUBLE PRECISION NOT NULL DEFAULT 0,
    hands JSONB NOT NULL DEFAULT '[]',
    ai_refined BOOLEAN NOT NULL DEFAULT false,
    fatigue_curve_type TEXT,
    bradykinesia_severity TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tapping_assessments_patient
    ON wearable_tapping_assessments(patient_id, assessed_at DESC);

ALTER TABLE wearable_tapping_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to tapping assessments"
    ON wearable_tapping_assessments FOR ALL USING (true) WITH CHECK (true);

-- Idempotent fixup: if the table pre-existed without the enhanced columns, add them
ALTER TABLE wearable_tapping_assessments
    ADD COLUMN IF NOT EXISTS ai_refined BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS fatigue_curve_type TEXT,
    ADD COLUMN IF NOT EXISTS bradykinesia_severity TEXT;

ALTER TABLE wearable_tapping_assessments
    ALTER COLUMN asymmetry_index SET DEFAULT 0,
    ALTER COLUMN hands SET DEFAULT '[]'::jsonb;

-- ============================================================
-- 2. Clinical narratives (new table)
-- ============================================================
CREATE TABLE IF NOT EXISTS wearable_clinical_narratives (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    patient_id UUID NOT NULL REFERENCES wearable_patients(id) ON DELETE CASCADE,
    narrative_type TEXT NOT NULL CHECK (narrative_type IN ('tremor', 'tapping', 'fluency', 'longitudinal')),
    assessment_id UUID,
    structured_summary JSONB,
    clinical_narrative TEXT,
    model_versions JSONB DEFAULT '{"stage1": "gpt-5-mini", "stage2": "gpt-5.2"}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clinical_narratives_patient
    ON wearable_clinical_narratives(patient_id, narrative_type, created_at DESC);

ALTER TABLE wearable_clinical_narratives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to clinical narratives"
    ON wearable_clinical_narratives FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 3. Enhanced AI analysis columns on wearable_fluency_assessments
-- ============================================================
ALTER TABLE wearable_fluency_assessments
    ADD COLUMN IF NOT EXISTS semantic_clusters JSONB,
    ADD COLUMN IF NOT EXISTS switch_count INTEGER,
    ADD COLUMN IF NOT EXISTS perseveration_types JSONB,
    ADD COLUMN IF NOT EXISTS intrusion_types JSONB,
    ADD COLUMN IF NOT EXISTS temporal_slope DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS confidence_weighted_score DOUBLE PRECISION;

-- ============================================================
-- 4. Enhanced AI analysis columns on wearable_tremor_assessments
-- ============================================================
ALTER TABLE wearable_tremor_assessments
    ADD COLUMN IF NOT EXISTS ai_refined BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS dominant_pattern TEXT;
