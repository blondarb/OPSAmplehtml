-- 028_consult_requests.sql
-- Structured consult requests between providers.
-- Supports curbside questions, formal consults, and specialty reviews.
-- ================================================================

CREATE TABLE IF NOT EXISTS consult_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT NOT NULL DEFAULT 'default',
  requester_id    UUID NOT NULL,
  requester_name  TEXT,  -- denormalized for display
  recipient_id    UUID NOT NULL,
  recipient_name  TEXT,  -- denormalized for display
  patient_id      UUID,
  patient_name    TEXT,  -- denormalized for display
  consult_type    TEXT NOT NULL CHECK (consult_type IN (
    'curbside', 'formal', 'eeg_review', 'imaging_review', 'medication_review'
  )),
  urgency         TEXT NOT NULL DEFAULT 'routine' CHECK (urgency IN (
    'routine', 'soon', 'urgent'
  )),
  question        TEXT NOT NULL,
  response        TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'in_review', 'answered', 'closed'
  )),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- My pending consults (as recipient)
CREATE INDEX IF NOT EXISTS idx_consult_requests_recipient
  ON consult_requests (recipient_id, status, created_at DESC);

-- My sent consults (as requester)
CREATE INDEX IF NOT EXISTS idx_consult_requests_requester
  ON consult_requests (requester_id, created_at DESC);

-- Patient-linked consults
CREATE INDEX IF NOT EXISTS idx_consult_requests_patient
  ON consult_requests (patient_id, created_at DESC)
  WHERE patient_id IS NOT NULL;

-- RLS (demo mode — allow all)
ALTER TABLE consult_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to consult_requests" ON consult_requests
  FOR ALL USING (true) WITH CHECK (true);
