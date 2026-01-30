-- Migration 013: Clinical Plans (reference data) + Saved Plans (user-owned)
-- Creates both tables for the Smart Recommendations save/load feature

-- ============================================================
-- 1. clinical_plans — shared reference data (no tenant_id)
-- ============================================================
CREATE TABLE IF NOT EXISTS clinical_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_key TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  icd10_codes TEXT[] DEFAULT '{}',
  scope TEXT,
  notes TEXT[] DEFAULT '{}',
  sections JSONB NOT NULL DEFAULT '{}',
  patient_instructions TEXT[] DEFAULT '{}',
  referrals TEXT[] DEFAULT '{}',
  differential JSONB,
  evidence JSONB,
  monitoring JSONB,
  disposition JSONB,
  source TEXT DEFAULT 'neuro-plans',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: authenticated users can SELECT; no tenant_id (reference data)
ALTER TABLE clinical_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read clinical plans"
  ON clinical_plans FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- 2. saved_plans — user-owned, persisted across sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS saved_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL DEFAULT 'default',
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  source_plan_key TEXT,
  selected_items JSONB NOT NULL DEFAULT '{}',
  custom_items JSONB NOT NULL DEFAULT '{}',
  plan_overrides JSONB DEFAULT '{}',
  is_default BOOLEAN DEFAULT FALSE,
  use_count INTEGER DEFAULT 0,
  last_used TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_saved_plans_user_id ON saved_plans(user_id);
CREATE INDEX idx_saved_plans_tenant_id ON saved_plans(tenant_id);
CREATE INDEX idx_saved_plans_source_plan_key ON saved_plans(source_plan_key);

-- Auto-update updated_at trigger (reuse existing function if available)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_saved_plans_updated_at
  BEFORE UPDATE ON saved_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_clinical_plans_updated_at
  BEFORE UPDATE ON clinical_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS: standard user-owned pattern
ALTER TABLE saved_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own saved plans"
  ON saved_plans FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own saved plans"
  ON saved_plans FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own saved plans"
  ON saved_plans FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own saved plans"
  ON saved_plans FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
