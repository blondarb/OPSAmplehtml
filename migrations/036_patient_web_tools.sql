-- Phase 5: Patient Web Tools
-- Body map markers and device measurement results

-- Body map markers (patient-reported symptom locations)
CREATE TABLE IF NOT EXISTS patient_body_map_markers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consult_id UUID REFERENCES neurology_consults(id) ON DELETE SET NULL,
  patient_id UUID,
  region TEXT NOT NULL,           -- e.g. 'hand_left', 'lower_back'
  symptom_type TEXT NOT NULL,     -- 'pain', 'numbness', 'tingling', 'weakness', 'stiffness', 'spasm'
  severity TEXT NOT NULL,         -- 'mild', 'moderate', 'severe'
  laterality TEXT NOT NULL,       -- 'left', 'right', 'bilateral', 'midline'
  onset TEXT,                     -- free-text e.g. '2 weeks ago'
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_body_map_consult ON patient_body_map_markers(consult_id);
CREATE INDEX IF NOT EXISTS idx_body_map_patient ON patient_body_map_markers(patient_id);

-- Device measurements (finger tapping, tremor detection, postural sway)
CREATE TABLE IF NOT EXISTS patient_device_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consult_id UUID REFERENCES neurology_consults(id) ON DELETE SET NULL,
  patient_id UUID,
  measurement_type TEXT NOT NULL, -- 'finger_tapping', 'tremor_detection', 'postural_sway'
  result JSONB NOT NULL,          -- Full measurement result (type-specific)
  device_info JSONB DEFAULT '{}', -- user_agent, platform, screen dimensions
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_meas_consult ON patient_device_measurements(consult_id);
CREATE INDEX IF NOT EXISTS idx_device_meas_patient ON patient_device_measurements(patient_id);
CREATE INDEX IF NOT EXISTS idx_device_meas_type ON patient_device_measurements(measurement_type);
