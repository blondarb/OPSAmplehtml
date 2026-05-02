-- Async + polling pattern for triage and extraction.
--
-- Why: Amplify Hosting Compute buffers Next.js streaming responses despite
-- text/event-stream headers, so any request taking >30s hits CloudFront's
-- origin read timeout and returns 500. Streaming SSE doesn't actually
-- stream on this platform (verified empirically — see PR #110/#111).
--
-- Fix: POST returns 202 + id immediately; Bedrock work runs as a
-- fire-and-forget promise on the same Lambda; client polls a fast GET
-- endpoint until the row's status is terminal.
--
-- This migration adds the status machinery to triage_sessions and creates
-- a parallel triage_extractions table for the PDF/long-text extraction
-- pre-step (which previously was not persisted at all).

-- ── triage_sessions ─────────────────────────────────────────────────
-- The pre-existing `status` column drives the physician-override workflow
-- (values like 'pending_review'). We keep it untouched and add a
-- distinct `processing_status` column for the async pipeline state.
-- Existing rows are completed, synchronous results — default to 'complete'
-- so reads keep working. New POSTs explicitly insert 'pending'.

ALTER TABLE triage_sessions
  ADD COLUMN IF NOT EXISTS processing_status text NOT NULL DEFAULT 'complete',
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  -- Derived results that the original POST returned but didn't persist:
  ADD COLUMN IF NOT EXISTS consult_id uuid,
  ADD COLUMN IF NOT EXISTS scheduled_appointment_id uuid;

-- Backfill completed_at for existing rows (use created_at as best estimate).
UPDATE triage_sessions
   SET completed_at = created_at
 WHERE processing_status = 'complete' AND completed_at IS NULL;

ALTER TABLE triage_sessions
  DROP CONSTRAINT IF EXISTS triage_sessions_processing_status_check;
ALTER TABLE triage_sessions
  ADD CONSTRAINT triage_sessions_processing_status_check
    CHECK (processing_status IN ('pending', 'complete', 'error'));

CREATE INDEX IF NOT EXISTS idx_triage_sessions_processing_status
  ON triage_sessions (processing_status)
  WHERE processing_status = 'pending';


-- ── triage_extractions ──────────────────────────────────────────────
-- Holds the intermediate extraction step (Bedrock summarisation of a long
-- referral / PDF). Previously the extract result was returned to the client
-- and discarded; now we persist it because the client polls.

CREATE TABLE IF NOT EXISTS triage_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'complete', 'error')),
  error_message text,

  -- Input
  text_input text NOT NULL,
  source_filename text,
  patient_age integer,
  patient_sex text,

  -- Output (filled when status='complete')
  note_type_detected text,
  extraction_confidence text,
  extracted_summary text,
  key_findings jsonb,
  original_text_length integer,

  -- Telemetry
  ai_model_used text,
  ai_input_tokens integer,
  ai_output_tokens integer,

  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_triage_extractions_created_at
  ON triage_extractions (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_triage_extractions_status
  ON triage_extractions (status)
  WHERE status = 'pending';
