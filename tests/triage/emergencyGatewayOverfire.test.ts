import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

import { parseUploadedFile } from '@/lib/triage/fileParser'
import { runEmergencyGateway } from '@/lib/triage/emergencyGateway'

/**
 * Over-fire regression guard for the deterministic emergency gateway.
 *
 * The gateway must lock a genuine neurologic emergency to `emergency_now`, but
 * it must NOT force that lock on subacute / resolved presentations whose acute
 * lexicon appears only in a non-acute context (a foot-drop over weeks, a
 * first seizure that has returned to baseline, psychogenic spells, a discharge
 * return-precaution). These four notes are the exact real served referral PDFs
 * that were over-firing before the note-level over-triage guards landed
 * (`applyOverTriageGuards` + the subacute/resolved-ictal/chronic-episodic
 * helpers in emergencyGateway.ts).
 *
 * The DEFER cases assert on the production PDF parser output (not a hand
 * excerpt) so a whitespace or ordering change in extraction can't quietly make
 * the guard stop matching. The FIRE cases are the non-regression floor: the
 * guards are additive suppressors and must never swallow a true emergency —
 * including the adjacent-but-emergent seizure cases (status, first seizure not
 * back to baseline) and an anticoagulated head-trauma bleed.
 */

const SAMPLES = resolve(process.cwd(), 'public/samples/triage')

// Real served referral PDFs that MUST route below emergency_now.
const DEFER_PDFS: ReadonlyArray<readonly [string, string]> = [
  ['Hargrove — subacute foot drop over weeks', 'outpatient/05_Hargrove_Linda.pdf'],
  ['Williams — resolved first seizure, back to baseline', 'outpatient/04_Williams_Deshawn.pdf'],
  ['Vasquez — chronic/episodic psychogenic spells', 'cross-specialty/02_Vasquez_Isabel.pdf'],
  ['Reyes — resolved first seizure discharged from ED', 'packets/reyes-carlos/01_ED_Note.pdf'],
] as const

async function gatewayTextFor(relativePath: string): Promise<string> {
  const bytes = await readFile(resolve(SAMPLES, relativePath))
  const filename = relativePath.split('/').pop() ?? 'referral.pdf'
  const parsed = await parseUploadedFile(
    new File([bytes], filename, { type: 'application/pdf' }),
  )
  return parsed.text
}

// Non-regression floor: these MUST stay locked to emergency_now.
const MUST_FIRE: ReadonlyArray<readonly [string, string]> = [
  [
    'acute ischemic stroke',
    'Patient presents today with sudden onset left-sided weakness and facial droop that began 2 hours ago. Last known well 90 minutes prior. Slurred speech.',
  ],
  [
    'subarachnoid hemorrhage / thunderclap',
    'Sudden severe thunderclap headache, worst of life, with neck stiffness and photophobia beginning abruptly one hour ago.',
  ],
  [
    'status epilepticus',
    'Patient in status epilepticus, still seizing on arrival, seizure lasting 20 minutes with no return to baseline.',
  ],
  [
    'first seizure NOT back to baseline',
    'First-ever generalized seizure today. Patient remains confused and postictal, not back to baseline, still not oriented 90 minutes later.',
  ],
  [
    'anticoagulated head trauma',
    'Elderly patient on apixaban fell and struck head this morning, now with worsening headache and new confusion.',
  ],
  [
    'cauda equina',
    'Acute urinary retention with saddle anesthesia and bilateral leg weakness starting today after severe back pain.',
  ],
  [
    'bacterial meningitis',
    'Fever, severe headache, neck stiffness, and photophobia with acute confusion since this morning.',
  ],
  [
    'acute cord compression',
    'Rapidly progressive bilateral leg weakness over the past 6 hours with a sensory level and new bowel incontinence.',
  ],
  [
    'prolonged single seizure (>5 min)',
    'Witnessed generalized tonic-clonic seizure lasting 8 minutes with no return to baseline.',
  ],
  [
    'found-down altered mental status',
    'Patient found down at home, unresponsive, GCS 8, not arousable to voice.',
  ],
] as const

describe('emergency gateway — over-fire guards (real served referral PDFs)', () => {
  const deferTextByLabel = new Map<string, string>()

  beforeAll(async () => {
    await Promise.all(
      DEFER_PDFS.map(async ([label, path]) => {
        deferTextByLabel.set(label, await gatewayTextFor(path))
      }),
    )
  })

  it.each(DEFER_PDFS)(
    'does not force emergency_now on a subacute/resolved presentation: %s',
    (label) => {
      const text = deferTextByLabel.get(label)
      expect(text, `fixture text for "${label}"`).toBeDefined()

      const result = runEmergencyGateway(text as string)

      expect(result.carePathway).not.toBe('emergency_now')
      expect(
        result.signals.some(
          (signal) =>
            signal.assertion === 'present' &&
            signal.action === 'emergency_now',
        ),
      ).toBe(false)
    },
  )
})

describe('emergency gateway — over-fire guards must never swallow a true emergency', () => {
  it.each(MUST_FIRE)('keeps emergency_now locked: %s', (_label, text) => {
    const result = runEmergencyGateway(text)

    expect(result.carePathway).toBe('emergency_now')
    expect(result.reviewRequirement).toBe('emergency_action')
    expect(
      result.signals.some(
        (signal) =>
          signal.assertion === 'present' && signal.action === 'emergency_now',
      ),
    ).toBe(true)
  })
})
