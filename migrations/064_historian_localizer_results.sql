-- Migration 064: historian_localizer_results
--
-- Session-keyed store for the Background Localizer's latest output
-- (differential / excluded / follow-up questions / hypothesis /
-- kb_sources), independent of neurology_consults linkage.
--
-- persistLocalizerResults() (src/app/api/ai/historian/localizer/route.ts,
-- near line 250) has historically only written localizer_* columns onto
-- neurology_consults, joined by historian_session_id. Standalone sessions
-- started from /patient/historian have no consult row at localizer-run
-- time (the consult may never exist, or may only be linked later), so
-- that write silently no-ops and the R&D runs dashboard
-- (src/app/api/ai/historian/runs/route.ts) never sees live-localizer
-- signal for them. This table stores the latest localizer output per
-- session_id unconditionally, so it is available regardless of whether
-- (or when) a consult gets linked.
--
-- session_id is a plain TEXT primary key, not a FK to historian_sessions
-- — same rationale as historian_transcript_events (migration 056): the
-- server mints the session UUID up front (session/route.ts) and the
-- localizer can run against it well before the historian_sessions row is
-- created at /save. One row per session; each localizer run upserts in
-- place and bumps run_count.
--
-- Synthetic data only in this environment; production rows may contain
-- clinical differential/reasoning text derived from patient-intake
-- speech (never logged server-side).
--
-- Run: psql $RDS_URL -f migrations/064_historian_localizer_results.sql
-- Rollback: migrations/064_historian_localizer_results.down.sql
--
-- NOT applied here — additive only, applied by a later rollout task. The
-- persist path and the runs-route join both fail open (Postgres 42P01)
-- until this migration is applied.

CREATE TABLE IF NOT EXISTS historian_localizer_results (
  session_id TEXT PRIMARY KEY,
  differential JSONB NOT NULL DEFAULT '[]',
  excluded JSONB NOT NULL DEFAULT '[]',
  questions JSONB NOT NULL DEFAULT '[]',
  hypothesis TEXT,
  kb_sources JSONB NOT NULL DEFAULT '[]',
  run_count INTEGER NOT NULL DEFAULT 0,
  last_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
