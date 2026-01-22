-- Add raw_dictation column to clinical_notes table
-- This stores the original, unprocessed dictation text for each field
-- Format: JSON object with field names as keys
-- Example: { "hpi": "original dictation...", "assessment": "original dictation..." }

ALTER TABLE clinical_notes
ADD COLUMN IF NOT EXISTS raw_dictation jsonb DEFAULT '{}';

-- Add comment for documentation
COMMENT ON COLUMN clinical_notes.raw_dictation IS 'Stores original dictation text before AI cleanup, keyed by field name (hpi, assessment, plan, ros, allergies)';
