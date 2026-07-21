-- Migration 056: historian_transcript_events
--
-- Durable, append-only transcript event log for AI Historian voice
-- interviews (Historian Validation Suite, Task 1 — durable transcript
-- layer). Today the client only persists a transcript when the interview
-- ends normally (POST /save inserts the full array into
-- historian_sessions.transcript); a crashed tab, a dropped WebRTC/WS
-- transport, or a browser force-close before that final POST silently
-- loses the whole interview. This table lets the client flush small
-- batches of transcript entries continuously during the session (see
-- src/app/api/ai/historian/transcript-flush/route.ts and the flush wiring
-- in src/hooks/useRealtimeSession.ts), so the conversation survives even
-- if the session never reaches a clean end.
--
-- Deliberately NOT foreign-keyed to historian_sessions(id): the server now
-- mints the session UUID up front (see session/route.ts) and returns it to
-- the client before any historian_sessions row exists — that row is still
-- only written at /save. Flushing must work throughout the entire
-- interview, well before that row is created, so session_id here is a
-- plain TEXT key, not a FK. /save's integrity cross-check joins this table
-- to historian_sessions.id by value once that row exists.
--
-- Idempotency: the flush endpoint retries (client failures, and the
-- required page-unload keepalive fetch, can both legitimately resend a
-- batch that already landed) and relies on `ON CONFLICT (session_id, seq)
-- DO NOTHING` — see the UNIQUE constraint below.
--
-- Synthetic data only in this environment; production rows may contain
-- real patient-intake speech (never logged server-side — see
-- transcriptIntegrity.ts).
--
-- Run: psql $RDS_URL -f migrations/056_historian_transcript_events.sql
-- Rollback: migrations/056_historian_transcript_events.down.sql
--
-- NOT applied here — additive only, applied by a later rollout task.

CREATE TABLE IF NOT EXISTS historian_transcript_events (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  ts_offset_s INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_hte_session ON historian_transcript_events (session_id, seq);
