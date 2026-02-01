-- Add missing columns to clinical_notes table for full note persistence
ALTER TABLE clinical_notes
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft',
ADD COLUMN IF NOT EXISTS ros_details TEXT,
ADD COLUMN IF NOT EXISTS allergy_details TEXT,
ADD COLUMN IF NOT EXISTS history_available TEXT,
ADD COLUMN IF NOT EXISTS history_details TEXT,
ADD COLUMN IF NOT EXISTS exam_free_text TEXT,
ADD COLUMN IF NOT EXISTS vitals JSONB;
