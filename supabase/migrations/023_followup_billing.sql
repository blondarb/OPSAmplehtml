-- 023: Follow-Up Billing Entries
-- Tracks TCM/CCM billing data for post-visit follow-up sessions

CREATE TABLE IF NOT EXISTS followup_billing_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES followup_sessions(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Patient & service info
  patient_name TEXT NOT NULL,
  service_date DATE NOT NULL,
  billing_month TEXT NOT NULL, -- 'YYYY-MM' for monthly grouping

  -- Billing program
  program TEXT NOT NULL DEFAULT 'ccm' CHECK (program IN ('tcm', 'ccm')),
  cpt_code TEXT NOT NULL,
  cpt_rate NUMERIC(8,2) NOT NULL DEFAULT 0,

  -- Phased time tracking (minutes)
  prep_minutes INTEGER NOT NULL DEFAULT 0,
  call_minutes INTEGER NOT NULL DEFAULT 0,
  documentation_minutes INTEGER NOT NULL DEFAULT 0,
  coordination_minutes INTEGER NOT NULL DEFAULT 0,
  total_minutes INTEGER NOT NULL DEFAULT 0,
  meets_threshold BOOLEAN NOT NULL DEFAULT false,

  -- Billing workflow
  billing_status TEXT NOT NULL DEFAULT 'not_reviewed'
    CHECK (billing_status IN ('not_reviewed', 'pending_review', 'ready_to_bill', 'billed')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  notes TEXT,

  -- TCM-specific compliance fields
  tcm_discharge_date DATE,
  tcm_contact_within_2_days BOOLEAN,
  tcm_f2f_scheduled BOOLEAN
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_billing_session_id ON followup_billing_entries(session_id);
CREATE INDEX IF NOT EXISTS idx_billing_patient_id ON followup_billing_entries(patient_id);
CREATE INDEX IF NOT EXISTS idx_billing_month ON followup_billing_entries(billing_month);
CREATE INDEX IF NOT EXISTS idx_billing_status ON followup_billing_entries(billing_status);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_billing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_billing_updated_at
  BEFORE UPDATE ON followup_billing_entries
  FOR EACH ROW EXECUTE FUNCTION update_billing_updated_at();
