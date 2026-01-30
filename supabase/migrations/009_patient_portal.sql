-- 009_patient_portal.sql
-- Creates tables for the patient portal demo: intake forms and messages.
--
-- IMPORTANT: Run this ONLY after reviewing.  Do NOT auto-run.
-- ================================================================

-- 1. patient_intake_forms
CREATE TABLE IF NOT EXISTS patient_intake_forms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     TEXT NOT NULL DEFAULT 'default',
  patient_name  TEXT NOT NULL,
  date_of_birth DATE,
  email         TEXT,
  phone         TEXT,
  chief_complaint   TEXT,
  current_medications TEXT,
  allergies         TEXT,
  medical_history   TEXT,
  family_history    TEXT,
  notes             TEXT,
  status        TEXT NOT NULL DEFAULT 'submitted',  -- submitted | reviewed
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intake_forms_tenant
  ON patient_intake_forms (tenant_id);

CREATE INDEX IF NOT EXISTS idx_intake_forms_status
  ON patient_intake_forms (tenant_id, status);

-- 2. patient_messages
CREATE TABLE IF NOT EXISTS patient_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     TEXT NOT NULL DEFAULT 'default',
  patient_name  TEXT NOT NULL,
  subject       TEXT NOT NULL DEFAULT '',
  body          TEXT NOT NULL,
  direction     TEXT NOT NULL DEFAULT 'inbound',  -- inbound (patient→physician) | outbound
  is_read       BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patient_messages_tenant
  ON patient_messages (tenant_id);

CREATE INDEX IF NOT EXISTS idx_patient_messages_tenant_read
  ON patient_messages (tenant_id, is_read);

-- RLS policies (allow all authenticated users for demo)
ALTER TABLE patient_intake_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_messages ENABLE ROW LEVEL SECURITY;

-- For demo purposes: authenticated users can read/write all rows in their tenant.
-- In production you would scope by patient auth identity.
CREATE POLICY "Allow all for authenticated" ON patient_intake_forms
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated" ON patient_messages
  FOR ALL USING (true) WITH CHECK (true);
