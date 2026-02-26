-- 032_wearable_realtime_events.sql
-- Phase 4: Real-time wearable event infrastructure
-- Creates hourly snapshots table, auto-alert trigger on anomalies,
-- and notification bridging for the unified cockpit.
-- ================================================================

-- ── Hourly Snapshots Table ──
-- Stores intra-day metric snapshots from Sevaro Monitor iOS app.
-- Enables physicians to see medication timing effects, overnight dips, etc.

CREATE TABLE IF NOT EXISTS wearable_hourly_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID NOT NULL REFERENCES wearable_patients(id) ON DELETE CASCADE,
  hour_timestamp  TIMESTAMPTZ NOT NULL,
  avg_hr          DOUBLE PRECISION,
  hrv_sdnn        DOUBLE PRECISION,
  spo2_avg        DOUBLE PRECISION,
  steps           INTEGER,
  active_calories DOUBLE PRECISION,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(patient_id, hour_timestamp)
);

CREATE INDEX IF NOT EXISTS idx_wearable_hourly_patient_time
  ON wearable_hourly_snapshots (patient_id, hour_timestamp DESC);

-- RLS (demo mode — allow all)
ALTER TABLE wearable_hourly_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to wearable_hourly_snapshots"
  ON wearable_hourly_snapshots FOR ALL USING (true) WITH CHECK (true);


-- ── Alert Routing Function ──
-- Maps anomaly_type + severity to alert_type for clinical routing.

CREATE OR REPLACE FUNCTION wearable_alert_type_for_anomaly(
  p_anomaly_type TEXT,
  p_severity TEXT
) RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  -- Device-detected critical events (from iOS app)
  IF p_anomaly_type IN ('fall_event', 'irregular_heart_rhythm') THEN
    RETURN 'urgent_escalation';
  END IF;

  IF p_anomaly_type IN ('high_heart_rate', 'low_heart_rate') THEN
    RETURN 'clinician_notification';
  END IF;

  IF p_anomaly_type = 'gait_instability' THEN
    RETURN 'log_only';
  END IF;

  -- AI-detected anomalies
  IF p_anomaly_type = 'seizure_like' THEN
    RETURN 'urgent_escalation';
  END IF;

  IF p_anomaly_type IN ('sustained_decline', 'hrv_depression', 'medication_pattern') THEN
    RETURN 'clinician_notification';
  END IF;

  -- Default: route by severity
  IF p_severity = 'urgent' THEN
    RETURN 'urgent_escalation';
  ELSIF p_severity = 'attention' THEN
    RETURN 'clinician_notification';
  ELSE
    RETURN 'log_only';
  END IF;
END;
$$;


-- ── Notification Priority Function ──
-- Maps anomaly severity to notification priority.

CREATE OR REPLACE FUNCTION wearable_notification_priority(
  p_alert_type TEXT,
  p_severity TEXT
) RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p_alert_type = 'urgent_escalation' OR p_severity = 'urgent' THEN
    RETURN 'critical';
  ELSIF p_alert_type = 'clinician_notification' OR p_severity = 'attention' THEN
    RETURN 'high';
  ELSE
    RETURN 'normal';
  END IF;
END;
$$;


-- ── Auto-Alert Trigger ──
-- On every wearable_anomalies INSERT:
--   1. Creates a wearable_alerts row with appropriate routing
--   2. Creates a notifications row (unless alert_type = 'log_only')

CREATE OR REPLACE FUNCTION fn_wearable_anomaly_to_alert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_alert_type TEXT;
  v_priority TEXT;
  v_title TEXT;
  v_body TEXT;
  v_alert_id UUID;
  v_patient_name TEXT;
BEGIN
  -- Determine routing
  v_alert_type := wearable_alert_type_for_anomaly(NEW.anomaly_type, NEW.severity);
  v_priority := wearable_notification_priority(v_alert_type, NEW.severity);

  -- Look up patient name for readable titles
  SELECT name INTO v_patient_name
    FROM wearable_patients WHERE id = NEW.patient_id;

  -- Build human-readable title
  v_title := COALESCE(v_patient_name, 'Patient') || ': ' ||
    REPLACE(INITCAP(REPLACE(NEW.anomaly_type, '_', ' ')), '_', ' ');

  -- Build body from clinical_significance or trigger_data
  v_body := COALESCE(
    NEW.clinical_significance,
    NEW.ai_assessment,
    'Anomaly detected — review wearable data.'
  );

  -- 1. Insert wearable_alerts row
  INSERT INTO wearable_alerts (
    anomaly_id, patient_id, alert_type, severity, title, body
  ) VALUES (
    NEW.id, NEW.patient_id, v_alert_type, NEW.severity, v_title, v_body
  )
  RETURNING id INTO v_alert_id;

  -- 2. Create unified notification (skip for log_only — no active notification needed)
  IF v_alert_type <> 'log_only' THEN
    INSERT INTO notifications (
      tenant_id,
      recipient_user_id,
      source_type,
      source_id,
      patient_id,
      priority,
      title,
      body,
      metadata
    ) VALUES (
      'default',
      NULL,  -- broadcast to all clinicians
      'wearable_alert',
      v_alert_id,
      NEW.patient_id,
      v_priority,
      v_title,
      v_body,
      jsonb_build_object(
        'anomaly_id', NEW.id,
        'anomaly_type', NEW.anomaly_type,
        'alert_type', v_alert_type,
        'severity', NEW.severity,
        'trigger_data', NEW.trigger_data
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger to wearable_anomalies
DROP TRIGGER IF EXISTS trg_wearable_anomaly_to_alert ON wearable_anomalies;
CREATE TRIGGER trg_wearable_anomaly_to_alert
  AFTER INSERT ON wearable_anomalies
  FOR EACH ROW
  EXECUTE FUNCTION fn_wearable_anomaly_to_alert();
