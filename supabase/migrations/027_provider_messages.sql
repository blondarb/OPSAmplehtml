-- 027_provider_messages.sql
-- Secure in-app messaging between providers (physicians, nurses, staff).
-- Supports patient-linked threads and general clinic channels.
-- ================================================================

-- Conversation threads
CREATE TABLE IF NOT EXISTS provider_threads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT NOT NULL DEFAULT 'default',
  thread_type     TEXT NOT NULL DEFAULT 'general' CHECK (thread_type IN (
    'patient_linked', 'general'
  )),
  patient_id      UUID,  -- set when thread_type = 'patient_linked'
  subject         TEXT NOT NULL DEFAULT '',
  participants    UUID[] NOT NULL DEFAULT '{}',
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_threads_tenant
  ON provider_threads (tenant_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_provider_threads_patient
  ON provider_threads (patient_id)
  WHERE patient_id IS NOT NULL;

-- Individual messages within threads
CREATE TABLE IF NOT EXISTS provider_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   TEXT NOT NULL DEFAULT 'default',
  thread_id   UUID NOT NULL REFERENCES provider_threads(id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL,
  sender_name TEXT,  -- denormalized for display
  body        TEXT NOT NULL,
  is_read     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_messages_thread
  ON provider_messages (thread_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_provider_messages_unread
  ON provider_messages (tenant_id, is_read)
  WHERE is_read = false;

-- RLS (demo mode — allow all)
ALTER TABLE provider_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to provider_threads" ON provider_threads
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to provider_messages" ON provider_messages
  FOR ALL USING (true) WITH CHECK (true);
