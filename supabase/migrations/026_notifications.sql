-- 026_notifications.sql
-- Unified notification system for the Clinical Cockpit.
-- Aggregates events from wearable alerts, patient messages, consult requests,
-- incomplete docs, lab results, refill requests, care gaps, and prep status.
-- ================================================================

CREATE TABLE IF NOT EXISTS notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT NOT NULL DEFAULT 'default',
  recipient_user_id UUID,  -- NULL = broadcast to all clinicians in tenant
  source_type     TEXT NOT NULL CHECK (source_type IN (
    'wearable_alert', 'patient_message', 'consult_request',
    'incomplete_doc', 'lab_result', 'refill_request',
    'care_gap', 'prep_status', 'system'
  )),
  source_id       UUID,  -- FK to the originating record
  patient_id      UUID,  -- optional link to patient for context
  priority        TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN (
    'critical', 'high', 'normal', 'low'
  )),
  title           TEXT NOT NULL,
  body            TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  status          TEXT NOT NULL DEFAULT 'unread' CHECK (status IN (
    'unread', 'read', 'actioned', 'dismissed', 'snoozed'
  )),
  snoozed_until   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Primary query: my unread notifications, newest first
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_status
  ON notifications (recipient_user_id, status, created_at DESC);

-- Urgency banner: count critical/high items
CREATE INDEX IF NOT EXISTS idx_notifications_priority
  ON notifications (tenant_id, priority, status)
  WHERE status IN ('unread', 'read');

-- Filter by source type
CREATE INDEX IF NOT EXISTS idx_notifications_source
  ON notifications (tenant_id, source_type, created_at DESC);

-- RLS (demo mode — allow all)
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to notifications" ON notifications
  FOR ALL USING (true) WITH CHECK (true);
