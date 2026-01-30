-- 008_tenant_id.sql
-- Adds tenant_id column to all data tables for multi-tenant demo isolation.
-- Existing rows get DEFAULT 'default' so current behaviour is unchanged.
--
-- IMPORTANT: Run this ONLY after reviewing.  Do NOT auto-run.
-- ================================================================

-- 1. patients
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_patients_tenant
  ON patients (tenant_id);

-- 2. visits
ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_visits_tenant
  ON visits (tenant_id);

CREATE INDEX IF NOT EXISTS idx_visits_tenant_status
  ON visits (tenant_id, status);

-- 3. clinical_notes
ALTER TABLE clinical_notes
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_clinical_notes_tenant
  ON clinical_notes (tenant_id);

-- 4. scale_results
ALTER TABLE scale_results
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_scale_results_tenant
  ON scale_results (tenant_id);

-- 5. dot_phrases
ALTER TABLE dot_phrases
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_dot_phrases_tenant
  ON dot_phrases (tenant_id);

-- 6. imaging_studies
ALTER TABLE imaging_studies
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_imaging_studies_tenant
  ON imaging_studies (tenant_id);

-- 7. diagnoses
ALTER TABLE diagnoses
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_diagnoses_tenant
  ON diagnoses (tenant_id);

-- 8. clinical_scales (legacy table, still present)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'clinical_scales') THEN
    ALTER TABLE clinical_scales
      ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';
    CREATE INDEX IF NOT EXISTS idx_clinical_scales_tenant
      ON clinical_scales (tenant_id);
  END IF;
END
$$;

-- NOTE: clinical_plans and app_settings are global reference data.
-- They do NOT get tenant_id because they are shared across all tenants.
