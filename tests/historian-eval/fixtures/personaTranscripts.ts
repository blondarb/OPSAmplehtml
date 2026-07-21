/**
 * Re-export shim — Historian Validation Suite Task 5.
 *
 * The real implementation moved to src/lib/historian/eval/personaFixtures.ts
 * so the npm run historian:eval batch harness (src/lib/historian/eval/
 * cli.ts) can use it too — src/ code must not reach into tests/ for a
 * dependency (see that module's doc comment for the full rationale). This
 * file is kept as a pure re-export so every existing
 * `from './fixtures/personaTranscripts'` import across
 * tests/historian-eval/*.test.ts keeps working unchanged.
 */
export * from '@/lib/historian/eval/personaFixtures'
