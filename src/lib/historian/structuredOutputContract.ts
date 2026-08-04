import type { HistorianStructuredOutput } from '@/lib/historianTypes'

/**
 * The structured_output fields that the visit-note import
 * (POST /api/visits/[id]/import-historian) reads and writes into
 * clinical_notes. This is the producer↔consumer contract between the
 * historian (save_interview_output tool schema in historianPrompts.ts,
 * both the standard and referral_clarification variants) and the signed
 * note.
 *
 * Guarded from three directions:
 *  - `satisfies keyof HistorianStructuredOutput` — renaming/removing a
 *    field on the interface fails `npx tsc --noEmit` here (tests/ is
 *    excluded from tsc, which is why this list lives in src/).
 *  - tests/historian/structuredOutputContract.test.ts — fails if the
 *    import route starts consuming fields not listed here, or if either
 *    save-tool schema stops instructing the model to emit a listed field.
 *  - The import route null-guards every field, so drift is SILENT in
 *    production (fields just stop appearing in imported notes). That is
 *    why this contract is enforced at test time.
 *
 * If you change the historian output shape, update this list and the
 * import route together.
 */
export const NOTE_IMPORT_CONSUMED_FIELDS = [
  // HPI assembly
  'chief_complaint',
  'hpi',
  'onset',
  'location',
  'duration',
  'character',
  'severity',
  'aggravating_factors',
  'relieving_factors',
  'timing',
  'associated_symptoms',
  // Follow-up HPI fields
  'interval_changes',
  'treatment_response',
  'new_symptoms',
  'medication_changes',
  'side_effects',
  // History assembly
  'past_medical_history',
  'past_surgical_history',
  'family_history',
  'social_history',
  'functional_status',
  // Direct field merges
  'allergies',
  'review_of_systems',
  'current_medications',
] as const satisfies ReadonlyArray<keyof HistorianStructuredOutput>
