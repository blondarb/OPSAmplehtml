export interface ReferralNoteSample {
  id: string
  label: string
  text: string
}

/**
 * Synthetic referral notes for the note→historian entry point.
 *
 * Every sample must be obviously fictional and free of anything that reads as a
 * real identifier — tests/historian/referralNoteSamples.test.ts enforces both.
 */
export const REFERRAL_NOTE_SAMPLES: readonly ReferralNoteSample[] = [
  {
    id: 'proximal-weakness',
    label: 'Progressive weakness',
    text: `SYNTHETIC SAMPLE — NOT A REAL PATIENT
Referring provider: Family Medicine
Reason for referral: Progressive lower extremity weakness

Fifty-eight-year-old referred for four months of progressive difficulty rising from a
chair and climbing stairs. Reports tripping on level ground twice in the past month. No
sensory complaints. No bowel or bladder change. No back pain.

Exam: proximal weakness 4/5 hip flexors bilaterally, 4+/5 shoulder abduction. Reflexes
preserved. Gait mildly waddling.

Labs: CK 1,240. TSH normal. B12 normal. No prior EMG. Not on a statin.`,
  },
  {
    id: 'episodic-headache',
    label: 'Episodic headache',
    text: `SYNTHETIC SAMPLE — NOT A REAL PATIENT
Referring provider: Internal Medicine
Reason for referral: Recurrent headaches, increasing frequency

Thirty-four-year-old with two years of episodic headaches, now three to four per week.
Throbbing, unilateral, with nausea and light sensitivity. Typically builds over an hour.
No thunderclap onset. No fever, no neck stiffness, no focal deficit.

Has tried over-the-counter analgesics with partial relief. No preventive tried.
Neurologic exam normal.`,
  },
  {
    id: 'first-seizure',
    label: 'First unprovoked seizure',
    text: `SYNTHETIC SAMPLE — NOT A REAL PATIENT
Referring provider: Emergency Department follow-up
Reason for referral: First unprovoked seizure

Twenty-seven-year-old witnessed to have a generalized convulsion lasting roughly two
minutes, with post-event confusion for about twenty minutes and tongue-biting. No prior
seizures. No head injury, no fever, no alcohol or drug use reported.

CT head without contrast was normal. No EEG or MRI yet. Not on any medication.
Neurologic exam normal at discharge.`,
  },
] as const
