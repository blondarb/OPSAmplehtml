-- 035_wearable_assessments.sql
-- Add assessment tables for tremor and fluency assessments
-- These tables store guided assessment results from the SevaroMonitor iOS app

-- Tremor assessments (was created manually, now codified)
CREATE TABLE IF NOT EXISTS wearable_tremor_assessments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    patient_id UUID NOT NULL REFERENCES wearable_patients(id) ON DELETE CASCADE,
    assessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    composite_score DOUBLE PRECISION NOT NULL,
    composite_intensity DOUBLE PRECISION NOT NULL,
    tasks JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tremor_assessments_patient
    ON wearable_tremor_assessments(patient_id, assessed_at DESC);

-- Fluency assessments
CREATE TABLE IF NOT EXISTS wearable_fluency_assessments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    patient_id UUID NOT NULL REFERENCES wearable_patients(id) ON DELETE CASCADE,
    assessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    category TEXT NOT NULL CHECK (category IN ('animals', 'fruits', 'tools', 'clothing')),
    total_words INTEGER NOT NULL,
    quartile_words JSONB NOT NULL DEFAULT '[0,0,0,0]',
    repetitions INTEGER NOT NULL DEFAULT 0,
    errors INTEGER NOT NULL DEFAULT 0,
    clustering_score DOUBLE PRECISION,
    transcript TEXT,
    word_list JSONB NOT NULL DEFAULT '[]',
    composite_score DOUBLE PRECISION NOT NULL,
    ai_refined BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fluency_assessments_patient
    ON wearable_fluency_assessments(patient_id, assessed_at DESC);

-- RLS policies (permissive for demo — matches existing wearable table patterns)
ALTER TABLE wearable_tremor_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE wearable_fluency_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to tremor assessments"
    ON wearable_tremor_assessments FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access to fluency assessments"
    ON wearable_fluency_assessments FOR ALL USING (true) WITH CHECK (true);
