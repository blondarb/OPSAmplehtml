/**
 * One-tap preset scenarios for the Clara browser voice test (/rnd/clara).
 *
 * Each scenario is a short synthetic physician-caller script for a human
 * tester to read aloud to Clara — these do NOT bypass the classifier or
 * Gate 0; Clara still hears live speech through the normal Nova Sonic voice
 * loop and every finalized turn still goes through the real
 * /api/ai/clara/classify pipeline. This list exists purely so a cold demo
 * (e.g. a group Steve sends a link to) needs zero improvisation — tap a
 * chip, read the line.
 *
 * Scope: this line is inpatient/facility teleneurology consult intake
 * (calling IN a neuro consult), NOT outpatient scheduling or refills — the
 * 7 scenarios below map to Clara's consult taxonomy (EMERGENT, NON_EMERGENT,
 * ROUNDING, EEG_READ, CERIBELL_EEG). Keep scripts realistic,
 * physician-to-physician, synthetic only. No PHI.
 */

export interface ClaraPresetScenario {
  id: string
  label: string
  /** Short caller framing + the exact opening line to read aloud, shown once the chip is tapped. */
  script: string
}

export const CLARA_PRESET_SCENARIOS: ClaraPresetScenario[] = [
  {
    id: 'stroke-alert',
    label: 'Stroke alert',
    script:
      "You're an ED physician. Say: \"ED calling, stroke alert — 68-year-old, sudden left-sided weakness and slurred speech, last known well about 40 minutes ago.\"",
  },
  {
    id: 'status-epilepticus',
    label: 'Status epilepticus',
    script:
      "You're an ED physician. Say: \"I've got a patient in status — seizing more than 5 minutes, not coming out of it between events.\"",
  },
  {
    id: 'non-emergent-consult',
    label: 'Non-emergent consult',
    script:
      "You're a hospitalist. Say: \"Calling in a non-emergent consult — 55-year-old with a week of worsening headache and some blurry vision, stable right now.\"",
  },
  {
    id: 'new-consult',
    label: 'New consult',
    script:
      "You're a hospitalist. Say: \"I'd like to call in a new neuro consult on a floor patient with new confusion since this morning.\"",
  },
  {
    id: 'rounding',
    label: 'Rounding',
    script:
      "You're a hospitalist. Say: \"Calling to have one of our patients added to the rounding list — stable, just needs the neurologist to round on them.\"",
  },
  {
    id: 'eeg-read',
    label: 'EEG read',
    script:
      "You're a hospitalist. Say: \"Calling in an EEG — need a routine EEG read on an inpatient.\"",
  },
  {
    id: 'ceribell-eeg',
    label: 'Ceribell / rapid EEG',
    script:
      "You're an ICU nurse. Say: \"Ceribell on a patient showing high seizure burden — need it read.\"",
  },
  {
    id: 'ct-return-known',
    label: 'CT-return (known patient)',
    script:
      "You're an ED physician. Say: \"CT return — you all already saw this patient earlier, the head CT is back and it's negative, no new deficits.\" (Clara should ask if the patient was seen before, then route back to the neurologist who saw them.)",
  },
  {
    id: 'outpatient-request',
    label: 'Outpatient request',
    script:
      "You're a clinic nurse. Say: \"I'm trying to set up an outpatient neurology follow-up for a patient — can you schedule that?\" (Clara should decline — no outpatient coverage — and point to the primary care provider.)",
  },
  {
    id: 'non-emergent-not-covered',
    label: 'Non-emergent · facility not covered',
    script:
      "You're a hospitalist at a facility that only contracts Sevaro for EMERGENCIES. Say: \"We're at a hospital that only uses Sevaro for emergencies — but I've got a non-emergent consult, a stable patient with a few days of mild dizziness.\" (Clara should recognize it's non-emergent, explain we don't cover non-emergent for this facility, and offer the MD1 escape hatch.)",
  },
]
