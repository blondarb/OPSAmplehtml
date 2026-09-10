-- Migration 066: historian_sim_score_jobs
--
-- Async scoring for the AI-to-AI simulator. The live sim run used to score in
-- four sequential client calls (differential -> summary -> thoroughness ->
-- finalize), each kept small so no single request crossed the ~30s Amplify SSR
-- gateway. As scoring grew, each stage crept toward that wall. This table backs
-- the durable 202+poll shape the repo already uses for triage (see
-- /api/triage): POST /api/ai/historian/sim/score/start inserts a 'pending' job
-- and returns 202 immediately, does the full scoring (differential + physician
-- summary + thoroughness + ground-truth + persist to historian_sim_runs) in the
-- background (runInBackground, bounded by the route's maxDuration), and the
-- client polls GET /api/ai/historian/sim/score/status until 'complete'/'error'.
-- The gateway only limits time-to-response, not Lambda lifetime, so the heavy
-- Bedrock work no longer has to fit under 30s.
--
-- The scored result itself lands in historian_sim_runs (migration 059) as
-- before; this table only tracks job lifecycle so the poll (a separate request)
-- can see progress and errors. Synthetic data only.
--
-- Additive only. NOT applied here — applied manually (psql) by a later rollout.
--
-- Run: psql $RDS_URL -f migrations/066_historian_sim_score_jobs.sql
-- Rollback: migrations/066_historian_sim_score_jobs.down.sql

CREATE TABLE IF NOT EXISTS historian_sim_score_jobs (
  id TEXT PRIMARY KEY,                       -- client-supplied/generated job id
  status TEXT NOT NULL DEFAULT 'pending',    -- 'pending' | 'complete' | 'error'
  persona TEXT NOT NULL,
  batch_id TEXT,
  batch_label TEXT,
  error TEXT,
  top1_hit BOOLEAN,
  top3_hit BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hssj_created ON historian_sim_score_jobs (created_at DESC);
