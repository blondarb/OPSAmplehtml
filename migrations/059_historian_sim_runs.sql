-- ============================================================================
-- Migration 059: historian_sim_runs
--
-- Storage for AI Historian SIMULATOR runs — synthetic patient personas driven
-- against Henry, scored against the persona's hidden ground-truth diagnosis.
-- Feeds the /rnd/historian/simulator dashboard.
--
-- This is the persistence sink the batch eval harness (src/lib/historian/eval/
-- cli.ts, --fixtures mode) never had: fixture/persona runs were only written
-- to disk report files, so the cloud dashboard had no data source. The import
-- endpoint (POST /api/ai/historian/sim/import) ingests a HistorianEvalReport
-- into one row per persona case here.
--
-- One row = one persona case in one batch. Blobs are JSONB so the schema does
-- not have to track every evaluator's evolving result shape.
--
-- Synthetic data only (role-played personas, no real patients). If real
-- patient data ever flows through the simulator, add tenant scoping + auth
-- before exposing this table.
--
-- Run against: AWS RDS PostgreSQL (ops_amplehtml database)
-- ============================================================================

CREATE TABLE IF NOT EXISTS historian_sim_runs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Groups every persona case produced by a single batch run.
  batch_id           UUID NOT NULL,
  -- Optional human label for the batch (e.g. a git sha or a run note).
  batch_label        TEXT,

  -- Persona identity + case framing.
  persona_id         TEXT NOT NULL,          -- e.g. "migraine-chronic"
  persona_label      TEXT,                   -- e.g. "Chronic Migraine with Medication Overuse"
  syndrome           TEXT,
  chief_complaint    TEXT,
  turn_count         INTEGER NOT NULL DEFAULT 0,

  -- Full synthetic conversation (HistorianTranscriptEntry[]). No PHI — the
  -- "patient" is a role-played persona.
  transcript         JSONB,

  -- Henry's scored differential (FinalDifferential: likelihood_pct, rationale,
  -- supporting/contradicting quotes) + the physician-style summary.
  final_differential JSONB,

  -- Blind second-opinion differential (independentDdx) + cross-model agreement.
  independent_ddx    JSONB,
  agreement          JSONB,

  -- Interview thoroughness evaluation (dimension scores, overall, confidence,
  -- missed critical questions).
  thoroughness       JSONB,

  -- Ground truth: the persona's expected diagnoses + whether Henry's / the
  -- independent differential caught them (top1Hit / top3Hit).
  ground_truth       JSONB,

  -- Summed evaluator cost for this case (USD), and the models used.
  cost_usd           NUMERIC(12, 6),
  models             JSONB,

  -- Marks a case the harness deliberately skipped (degenerate transcript).
  insufficient       BOOLEAN NOT NULL DEFAULT FALSE,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_historian_sim_runs_batch
  ON historian_sim_runs(batch_id);

CREATE INDEX IF NOT EXISTS idx_historian_sim_runs_created
  ON historian_sim_runs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_historian_sim_runs_persona
  ON historian_sim_runs(persona_id);
