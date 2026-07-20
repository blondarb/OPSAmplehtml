#!/usr/bin/env tsx
/**
 * RETIRED — DO NOT RUN. Kept as a tombstone for provenance.
 *
 * This was a one-shot 2026-07-10 migration that swapped demoScenarios.ts
 * previewText fields (via a hardcoded REPAIR map) and forced Patterson to a
 * TIA framing, to match a "corrected validation_cases DB". It only ever
 * edited the metadata — it NEVER regenerated the served PDFs in
 * public/samples/triage/ — so the demo cards drifted away from the notes they
 * actually load and triage, leaving cards whose header, preview text, and
 * served PDF all described different patients.
 *
 * On 2026-07-19 the demo library was rebuilt so every card's note-derived
 * fields (previewText, patientName, age, sex, referringSpecialty,
 * briefDescription, clinicalHighlight, demoPoints, expectedTier) are
 * regenerated FROM the real served PDFs — the single source of truth, since
 * those are what extract and triage. Re-running this old migration would
 * re-scramble that corrected data (and its original abort-guard keyed on
 * "Patterson === TIA", which no longer holds, so the guard can no longer
 * protect the tree). It is therefore disabled.
 *
 * To refresh the demo cards after changing the PDFs, regenerate from the
 * PDFs, not from this script.
 */
console.error(
  'RETIRED: scripts/regenerate-demo-scenarios.ts is a disabled one-shot ' +
    '2026-07-10 migration. Running it would re-scramble the demo library. ' +
    'Regenerate demo cards from the served PDFs instead. Aborting.',
)
process.exit(1)
