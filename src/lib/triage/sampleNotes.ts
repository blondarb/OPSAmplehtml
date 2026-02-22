import { SampleNote } from './types'

export const SAMPLE_NOTES: SampleNote[] = [
  {
    id: 'emergent-stroke',
    title: 'Emergent — Active Stroke Symptoms',
    tierHint: 'Emergent',
    text: '68yo M, right-sided weakness and slurred speech started 2 hours ago. Wife calling to get neurology appointment. No ED visit yet.',
  },
  {
    id: 'emergent-thunderclap-no-ed',
    title: 'Emergent — Thunderclap Headache (Not Yet Evaluated)',
    tierHint: 'Emergent',
    text: '55yo F presents with sudden onset severe headache, "worst of her life," started today. Has not been to the ER. Requesting neurology referral.',
  },
  {
    id: 'urgent-new-seizure',
    title: 'Urgent — New-Onset Seizure',
    tierHint: 'Urgent',
    text: '42yo M, no PMH, presented to ED with witnessed generalized tonic-clonic seizure. CT head negative. No prior seizure history. Started on levetiracetam 500mg BID. Needs outpatient neurology follow-up.',
  },
  {
    id: 'urgent-thunderclap-ed-eval',
    title: 'Urgent — Thunderclap Headache (ED-Evaluated)',
    tierHint: 'Urgent',
    text: '55yo F presents with sudden onset severe headache, "worst of her life," 3 days ago. CT/CTA negative in ED. LP not performed. Ongoing headache.',
  },
  {
    id: 'semi-urgent-ms-relapse',
    title: 'Semi-Urgent — MS Relapse',
    tierHint: 'Semi-urgent',
    text: '34yo F with known RRMS on Tecfidera. New left arm numbness and tingling x5 days, worsening. Last MRI 6 months ago was stable.',
  },
  {
    id: 'routine-priority-memory',
    title: 'Routine-Priority — Memory Loss Workup',
    tierHint: 'Routine-priority',
    text: '72yo M, wife reports progressive memory decline over 12 months. Forgetting appointments, repeating questions. MMSE in PCP office 22/30.',
  },
  {
    id: 'routine-chronic-migraine',
    title: 'Routine — Chronic Migraine (Failed Therapies)',
    tierHint: 'Routine',
    text: '28yo F with migraine since age 16. Currently on sumatriptan PRN. Having 10-12 headache days/month. Tried topiramate (stopped for cognitive side effects), amitriptyline (no benefit), propranolol (bradycardia). Interested in CGRP options.',
  },
  {
    id: 'non-urgent-neuropathy',
    title: 'Non-Urgent — Stable Neuropathy',
    tierHint: 'Non-urgent',
    text: '65yo M with DM2, known diabetic neuropathy. Stable symptoms. On gabapentin 300mg TID. PCP requesting neurology to co-manage. A1c 7.2, stable.',
  },
  {
    id: 'urgent-suspected-gbs',
    title: 'Urgent — Suspected GBS',
    tierHint: 'Urgent',
    text: '48yo F, progressive bilateral leg weakness over 5 days, now has difficulty walking. Had URI 2 weeks ago. Reflexes absent at ankles bilaterally.',
  },
  {
    id: 'semi-urgent-new-tremor',
    title: 'Semi-Urgent — New Tremor',
    tierHint: 'Semi-urgent',
    text: '61yo M with 6-month history of right hand resting tremor. Wife notes he walks more slowly. No falls.',
  },
  {
    id: 'insufficient-vague',
    title: 'Insufficient Data — Vague Referral',
    tierHint: 'Insufficient Data',
    text: 'Eval for headache.',
  },
]
