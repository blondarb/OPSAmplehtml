-- Phase 2: Triage Enhancements — File Upload, Extraction, Batch, Fusion
-- Adds new columns to triage_sessions and creates triage_batches table

-- New columns on triage_sessions
ALTER TABLE triage_sessions ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'paste';
ALTER TABLE triage_sessions ADD COLUMN IF NOT EXISTS source_filename text;
ALTER TABLE triage_sessions ADD COLUMN IF NOT EXISTS extracted_summary text;
ALTER TABLE triage_sessions ADD COLUMN IF NOT EXISTS extraction_confidence text;
ALTER TABLE triage_sessions ADD COLUMN IF NOT EXISTS note_type_detected text;
ALTER TABLE triage_sessions ADD COLUMN IF NOT EXISTS batch_id uuid;
ALTER TABLE triage_sessions ADD COLUMN IF NOT EXISTS fusion_group_id uuid;

-- Batch processing table
CREATE TABLE IF NOT EXISTS triage_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now() NOT NULL,
  total_items integer NOT NULL,
  completed_items integer DEFAULT 0,
  status text DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'partial_failure'))
);

-- Index for batch lookups
CREATE INDEX IF NOT EXISTS idx_triage_sessions_batch_id ON triage_sessions (batch_id) WHERE batch_id IS NOT NULL;

-- Index for fusion group lookups
CREATE INDEX IF NOT EXISTS idx_triage_sessions_fusion_group_id ON triage_sessions (fusion_group_id) WHERE fusion_group_id IS NOT NULL;

-- FK from triage_sessions.batch_id to triage_batches.id
ALTER TABLE triage_sessions ADD CONSTRAINT fk_triage_sessions_batch_id
  FOREIGN KEY (batch_id) REFERENCES triage_batches (id) ON DELETE SET NULL;

-- Enable RLS on triage_batches (matching triage_sessions policy)
ALTER TABLE triage_batches ENABLE ROW LEVEL SECURITY;

-- Allow all operations for now (demo mode, no auth)
CREATE POLICY "Allow all access to triage_batches" ON triage_batches
  FOR ALL USING (true) WITH CHECK (true);
