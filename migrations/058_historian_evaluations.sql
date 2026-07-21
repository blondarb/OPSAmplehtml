-- Migration 058: historian_evaluations
--
-- Historian Validation Suite, Task 3 — durable store for AI Historian
-- post-session evaluator outputs. First consumer is the thoroughness judge
-- (src/lib/historian/eval/thoroughnessJudge.ts, evaluator='thoroughness'),
-- which scores whether a completed interview gathered clinically
-- appropriate data against a syndrome-specific vetted rubric. The
-- `evaluator` column is deliberately a free-form-but-enumerated TEXT (not
-- a Postgres ENUM) so later sprint tasks can add new evaluator kinds
-- ('independent_ddx' — Task 4's DeepSeek-R1 scorer; 'agreement' — Task 4's
-- cross-model agreement metric) without a migration.
--
-- One row per (session, evaluator, run) — a session may accumulate
-- multiple rows for the same evaluator over time (e.g. a re-run after a
-- prompt-version bump); idx_he_session supports "latest evaluation for
-- this session+evaluator" lookups via ORDER BY created_at DESC.
--
-- result JSONB shape for evaluator='thoroughness' (ThoroughnessEvaluation,
-- see src/lib/historian/eval/thoroughnessJudge.ts): per-dimension scores
-- for oldcarts/red_flags/pmh_meds_allergies/fh_sh/question_quality/closure,
-- missed_critical_questions, diagnosis_leak, fidelity (when reports were
-- provided), overall, confidence, unvetted, deterministic-layer findings,
-- and provenance. Every evaluator output carries its own provenance
-- (model_id, prompt_version, rubric_version, inference_params,
-- generated_at) duplicated into both the dedicated columns below (for
-- indexable/queryable access) and inside result (for a self-contained
-- audit record).
--
-- Populated asynchronously, fire-and-forget, from POST /save (behind
-- HISTORIAN_EVAL_AUTORUN — unset defaults to enabled), sequentially after
-- the Task 2 final-differential pass. Physician/QA-facing only — never a
-- patient-facing surface. No PHI/patient utterance text is ever logged to
-- the console for this pipeline; the clinical evidence (turn quotes,
-- rubric citations) legitimately lives in this table's `result` column,
-- which is an audit record, not a log line.
--
-- Additive only — no backfill, no NOT NULL beyond the original design, no
-- default beyond created_at.
--
-- Run: psql $RDS_URL -f migrations/058_historian_evaluations.sql
-- Rollback: migrations/058_historian_evaluations.down.sql
--
-- NOT applied here — additive only, applied by a later rollout task.

CREATE TABLE IF NOT EXISTS historian_evaluations (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  evaluator TEXT NOT NULL,          -- 'thoroughness' | 'independent_ddx' | 'agreement'
  model_id TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  rubric_version TEXT,
  inference_params JSONB,
  result JSONB NOT NULL,
  cost_usd NUMERIC(10,6),
  latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_he_session ON historian_evaluations (session_id, evaluator, created_at DESC);
