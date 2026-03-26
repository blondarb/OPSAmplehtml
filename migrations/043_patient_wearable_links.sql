-- Migration 043: Patient Wearable Links
-- Links patients in ops_amplehtml to their wearable patient IDs in sevaro_monitor.
-- This enables cross-database unification without modifying sevaro_monitor.

CREATE TABLE IF NOT EXISTS patient_wearable_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL,  -- references patients(id) in ops_amplehtml
    wearable_patient_id TEXT NOT NULL,  -- ID in sevaro_monitor database
    source TEXT NOT NULL DEFAULT 'sevaro_monitor',
    linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    linked_by TEXT,
    UNIQUE(patient_id, wearable_patient_id)
);

CREATE INDEX IF NOT EXISTS idx_pwl_patient ON patient_wearable_links(patient_id);
