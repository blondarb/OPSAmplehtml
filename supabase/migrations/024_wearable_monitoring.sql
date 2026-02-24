-- 024_wearable_monitoring.sql
-- Card 6: Longitudinal Wearable Data & AI Monitoring
-- Creates tables for wearable patient data, daily summaries, anomalies, and alerts.
-- ================================================================

-- Wearable patients (demo patient records)
CREATE TABLE IF NOT EXISTS wearable_patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  name TEXT NOT NULL,
  age INTEGER NOT NULL,
  sex TEXT NOT NULL,
  primary_diagnosis TEXT NOT NULL,
  medications JSONB NOT NULL DEFAULT '[]'::jsonb,
  wearable_devices JSONB NOT NULL DEFAULT '[]'::jsonb,
  baseline_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  monitoring_start_date DATE NOT NULL DEFAULT CURRENT_DATE
);

-- Daily aggregated summaries
CREATE TABLE IF NOT EXISTS wearable_daily_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES wearable_patients(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  anomalies_detected JSONB NOT NULL DEFAULT '[]'::jsonb,
  ai_analysis TEXT,
  overall_status TEXT NOT NULL DEFAULT 'normal',
  UNIQUE(patient_id, date)
);

CREATE INDEX IF NOT EXISTS idx_wearable_daily_summaries_patient_date
  ON wearable_daily_summaries (patient_id, date DESC);

-- AI-detected anomalies
CREATE TABLE IF NOT EXISTS wearable_anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES wearable_patients(id) ON DELETE CASCADE,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  anomaly_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'informational',
  trigger_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_assessment TEXT,
  ai_reasoning TEXT,
  clinical_significance TEXT,
  recommended_action TEXT,
  patient_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_wearable_anomalies_patient
  ON wearable_anomalies (patient_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_wearable_anomalies_severity
  ON wearable_anomalies (severity);

-- Clinical alerts generated from anomalies
CREATE TABLE IF NOT EXISTS wearable_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anomaly_id UUID REFERENCES wearable_anomalies(id) ON DELETE SET NULL,
  patient_id UUID NOT NULL REFERENCES wearable_patients(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'informational',
  title TEXT NOT NULL,
  body TEXT,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  escalated_to_md BOOLEAN NOT NULL DEFAULT false,
  action_taken TEXT
);

CREATE INDEX IF NOT EXISTS idx_wearable_alerts_patient
  ON wearable_alerts (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wearable_alerts_severity
  ON wearable_alerts (severity, acknowledged);

-- RLS policies (demo mode — allow all)
ALTER TABLE wearable_patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE wearable_daily_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE wearable_anomalies ENABLE ROW LEVEL SECURITY;
ALTER TABLE wearable_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to wearable_patients" ON wearable_patients FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to wearable_daily_summaries" ON wearable_daily_summaries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to wearable_anomalies" ON wearable_anomalies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to wearable_alerts" ON wearable_alerts FOR ALL USING (true) WITH CHECK (true);
