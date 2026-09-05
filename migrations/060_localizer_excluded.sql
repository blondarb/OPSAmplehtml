-- ============================================================================
-- Migration 060: localizer_excluded on neurology_consults
--
-- Adds a column to store the Localizer's EXCLUSION reasoning — conditions the
-- model considered and ruled out, each with the reason (Steve's original ask:
-- "differential WITH reasoning for why conditions were excluded, not just
-- what's likely"). Sits alongside localizer_differential (migration 033).
--
-- MUST be applied together with the localizer route change that writes it —
-- the persist does a single UPDATE, so a missing column would make the whole
-- localizer persistence no-op until this is applied.
--
-- Run against: AWS RDS PostgreSQL (ops_amplehtml database)
-- ============================================================================

ALTER TABLE neurology_consults
  -- Conditions considered and ruled out: [{ "diagnosis": "...", "reason": "..." }]
  ADD COLUMN IF NOT EXISTS localizer_excluded JSONB;
