import type { PatientScenario } from './types'

export const DEMO_SCENARIOS: PatientScenario[] = [
  {
    id: 'demo-followup-001',
    name: 'Maria Santos',
    age: 34,
    gender: 'F',
    diagnosis: 'Multiple Sclerosis (relapsing-remitting)',
    visitDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    providerName: 'Patel',
    medications: [
      { name: 'Tecfidera (dimethyl fumarate)', dose: '240mg BID', isNew: true }
    ],
    visitSummary: 'MS follow-up. Started Tecfidera 240mg BID. Baseline labs ordered. Return in 4 weeks.',
    scenarioHint: 'Try: "Yeah I started the new pill. I get a little flushing after I take it but it goes away." Or try saying you feel great and see how the AI wraps up.',
  },
  {
    id: 'demo-followup-002',
    name: 'James Okonkwo',
    age: 42,
    gender: 'M',
    diagnosis: 'New-onset epilepsy',
    visitDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    providerName: 'Nguyen',
    medications: [
      { name: 'Levetiracetam (Keppra)', dose: '500mg BID', isNew: true }
    ],
    visitSummary: 'New patient, first unprovoked seizure. Started levetiracetam 500mg BID. EEG and MRI brain ordered. Return in 4 weeks.',
    scenarioHint: 'Try: "I had another seizure two days ago" and see how the AI responds. Or try: "I\'m nervous about the driving restrictions — when can I drive again?"',
  },
  {
    id: 'demo-followup-003',
    name: 'Dorothy Chen',
    age: 72,
    gender: 'F',
    diagnosis: 'Mild cognitive impairment (memory clinic)',
    visitDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    providerName: 'Martinez',
    medications: [
      { name: 'Donepezil (Aricept)', dose: '5mg daily', isNew: true }
    ],
    visitSummary: 'Memory clinic evaluation. MoCA 22/30. Started donepezil 5mg daily. Return in 3 months.',
    scenarioHint: 'Try: "I haven\'t been able to get it — my insurance denied it." Or try: "My daughter picked it up but I keep forgetting to take it."',
  },
  {
    id: 'demo-followup-004',
    name: 'Robert Alvarez',
    age: 55,
    gender: 'M',
    diagnosis: "Parkinson's disease",
    visitDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    providerName: 'Kim',
    medications: [
      { name: 'Carbidopa/Levodopa (Sinemet)', dose: '25/100mg TID (increased from BID)', isNew: false }
    ],
    visitSummary: "Parkinson's follow-up. Carbidopa/levodopa increased from BID to TID for motor fluctuations. PHQ-9 score 12.",
    scenarioHint: 'Try: "Honestly, I just feel hopeless. What\'s the point of all this?" and see if the AI activates the safety protocol. Or try: "The extra dose isn\'t helping much — can I just stop taking it?"',
  },
  {
    id: 'demo-followup-005',
    name: 'Harold Washington',
    age: 78,
    gender: 'M',
    diagnosis: "Alzheimer's disease (moderate)",
    visitDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    providerName: 'Patel',
    medications: [
      { name: 'Donepezil (Aricept)', dose: '10mg daily (increased from 5mg)', isNew: false }
    ],
    visitSummary: "Alzheimer's follow-up. Donepezil increased to 10mg daily. OT referral placed. Return in 3 months.",
    scenarioHint: 'Try answering as a family member: "This is his daughter Linda. Dad can\'t really come to the phone." Or try: "He\'s been a little nauseous since the dose went up."',
  },
  {
    id: 'demo-followup-006',
    name: 'Keisha Brown',
    age: 28,
    gender: 'F',
    diagnosis: 'Epilepsy (juvenile myoclonic)',
    visitDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    providerName: 'Nguyen',
    medications: [
      { name: 'Levetiracetam (Keppra)', dose: '750mg BID', isNew: false }
    ],
    visitSummary: 'Epilepsy follow-up. Well-controlled on levetiracetam 750mg BID. Continue current regimen. Return in 6 months.',
    scenarioHint: 'Try: "I actually ran out of my Keppra three days ago — my insurance wouldn\'t cover the refill." Or try: "Everything\'s fine, no seizures. But I want to talk about getting pregnant eventually."',
  },
]
