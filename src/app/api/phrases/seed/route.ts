import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getTenantServer } from '@/lib/tenant'

// Comprehensive neurology dot phrases library
const DEFAULT_PHRASES = [
  // =========================================
  // GENERAL / GLOBAL PHRASES
  // =========================================
  {
    trigger_text: '.wnl',
    expansion_text: 'Within normal limits',
    category: 'General',
    description: 'Quick normal finding',
    scope: 'global'
  },
  {
    trigger_text: '.nfnd',
    expansion_text: 'No focal neurological deficits',
    category: 'General',
    description: 'No focal deficits',
    scope: 'global'
  },
  {
    trigger_text: '.deny',
    expansion_text: 'Patient denies any recent changes in symptoms, new symptoms, or concerning features.',
    category: 'General',
    description: 'General denial statement',
    scope: 'global'
  },
  {
    trigger_text: '.educated',
    expansion_text: 'Patient educated on diagnosis, treatment options, and expected outcomes. Questions answered. Patient verbalized understanding and agrees with plan.',
    category: 'General',
    description: 'Patient education statement',
    scope: 'global'
  },
  {
    trigger_text: '.discussed',
    expansion_text: 'Discussed risks, benefits, and alternatives of treatment with patient. Patient verbalized understanding and consents to proceed.',
    category: 'General',
    description: 'Treatment discussion',
    scope: 'global'
  },
  {
    trigger_text: '.stable',
    expansion_text: 'Condition is stable. Continue current management.',
    category: 'General',
    description: 'Stable condition note',
    scope: 'global'
  },
  {
    trigger_text: '.improved',
    expansion_text: 'Symptoms have improved since last visit.',
    category: 'General',
    description: 'Improved status',
    scope: 'global'
  },
  {
    trigger_text: '.unchanged',
    expansion_text: 'Symptoms unchanged from previous visit.',
    category: 'General',
    description: 'Unchanged status',
    scope: 'global'
  },

  // =========================================
  // ALLERGIES
  // =========================================
  {
    trigger_text: '.nkda',
    expansion_text: 'No known drug allergies',
    category: 'Allergies',
    description: 'No known allergies',
    scope: 'allergies'
  },
  {
    trigger_text: '.nka',
    expansion_text: 'No known allergies',
    category: 'Allergies',
    description: 'No allergies',
    scope: 'allergies'
  },
  {
    trigger_text: '.pcnallergy',
    expansion_text: 'Penicillin - rash',
    category: 'Allergies',
    description: 'PCN allergy',
    scope: 'allergies'
  },
  {
    trigger_text: '.sulfa',
    expansion_text: 'Sulfonamides - rash/hives',
    category: 'Allergies',
    description: 'Sulfa allergy',
    scope: 'allergies'
  },

  // =========================================
  // PHYSICAL EXAM - NEUROLOGICAL
  // =========================================
  {
    trigger_text: '.neuroexam',
    expansion_text: `Mental Status: Alert and oriented x3, appropriate affect, normal attention and concentration. Speech fluent without dysarthria.
Cranial Nerves: II-XII intact. Pupils equal, round, reactive to light. Visual fields full to confrontation. Extraocular movements intact without nystagmus. Facial sensation and movement symmetric. Hearing grossly intact. Palate elevates symmetrically. Sternocleidomastoid and trapezius strength normal. Tongue midline without atrophy or fasciculations.
Motor: 5/5 strength in all extremities, normal bulk and tone. No pronator drift.
Sensory: Intact to light touch, pinprick, vibration, and proprioception in all extremities.
Reflexes: 2+ and symmetric throughout (biceps, triceps, brachioradialis, patellar, Achilles). Plantar responses flexor bilaterally.
Coordination: Normal finger-to-nose and heel-to-shin. No dysmetria or intention tremor. Rapid alternating movements intact.
Gait: Normal base and stride. Tandem gait intact. Romberg negative.`,
    category: 'Physical Exam',
    description: 'Complete normal neurological examination',
    scope: 'hpi'
  },
  {
    trigger_text: '.neurobrief',
    expansion_text: 'Mental status: Alert, oriented x3. CN II-XII intact. Motor 5/5 all extremities. Sensory intact. Reflexes 2+ symmetric. Coordination normal. Gait normal.',
    category: 'Physical Exam',
    description: 'Brief normal neuro exam',
    scope: 'hpi'
  },
  {
    trigger_text: '.mentalstatus',
    expansion_text: 'Alert and oriented to person, place, time, and situation. Attentive, follows commands. Speech fluent with normal rate, rhythm, and prosody. No paraphasic errors. Naming, repetition, and comprehension intact. Appropriate mood and affect.',
    category: 'Physical Exam',
    description: 'Mental status exam',
    scope: 'hpi'
  },
  {
    trigger_text: '.cranialnerves',
    expansion_text: 'CN II: Visual acuity intact, visual fields full to confrontation, pupils equal round reactive to light. CN III/IV/VI: Extraocular movements intact, no ptosis, no nystagmus. CN V: Facial sensation intact to light touch all divisions. CN VII: Face symmetric at rest and with activation. CN VIII: Hearing grossly intact bilaterally. CN IX/X: Palate elevates symmetrically, gag intact. CN XI: Sternocleidomastoid and trapezius strength 5/5. CN XII: Tongue midline, no atrophy or fasciculations.',
    category: 'Physical Exam',
    description: 'Cranial nerve examination',
    scope: 'hpi'
  },
  {
    trigger_text: '.motorexam',
    expansion_text: `Motor Examination:
Bulk: Normal throughout, no atrophy
Tone: Normal, no spasticity or rigidity
Strength (MRC scale):
  Deltoids: 5/5 bilateral | Biceps: 5/5 bilateral | Triceps: 5/5 bilateral
  Wrist extensors: 5/5 bilateral | Grip: 5/5 bilateral | Finger abductors: 5/5 bilateral
  Hip flexors: 5/5 bilateral | Knee extensors: 5/5 bilateral | Knee flexors: 5/5 bilateral
  Ankle dorsiflexors: 5/5 bilateral | Ankle plantarflexors: 5/5 bilateral
No pronator drift. No tremor or abnormal movements.`,
    category: 'Physical Exam',
    description: 'Detailed motor examination',
    scope: 'hpi'
  },
  {
    trigger_text: '.sensoryexam',
    expansion_text: 'Sensory: Intact to light touch, pinprick, temperature, vibration, and proprioception in all four extremities. No sensory level. Cortical sensory function (graphesthesia, stereognosis) intact.',
    category: 'Physical Exam',
    description: 'Sensory examination',
    scope: 'hpi'
  },
  {
    trigger_text: '.reflexes',
    expansion_text: 'Reflexes: Biceps 2+/2+, Triceps 2+/2+, Brachioradialis 2+/2+, Patellar 2+/2+, Achilles 2+/2+. Plantar responses flexor bilaterally. No clonus. Hoffman negative bilaterally.',
    category: 'Physical Exam',
    description: 'Reflex examination',
    scope: 'hpi'
  },
  {
    trigger_text: '.coordination',
    expansion_text: 'Coordination: Finger-to-nose testing intact bilaterally without dysmetria or intention tremor. Heel-to-shin testing normal. Rapid alternating movements intact. No rebound. Romberg negative.',
    category: 'Physical Exam',
    description: 'Coordination examination',
    scope: 'hpi'
  },
  {
    trigger_text: '.gait',
    expansion_text: 'Gait: Normal initiation, base, stride length, arm swing. Able to walk on heels and toes. Tandem gait intact. Romberg negative. No retropulsion.',
    category: 'Physical Exam',
    description: 'Gait examination',
    scope: 'hpi'
  },

  // =========================================
  // REVIEW OF SYSTEMS
  // =========================================
  {
    trigger_text: '.rosneg',
    expansion_text: `Constitutional: Denies fever, chills, weight loss, fatigue, night sweats.
HEENT: Denies vision changes, hearing loss, tinnitus, vertigo, dysphagia.
Cardiovascular: Denies chest pain, palpitations, orthopnea, edema.
Respiratory: Denies shortness of breath, cough, wheezing.
GI: Denies nausea, vomiting, abdominal pain, diarrhea, constipation.
GU: Denies urinary frequency, urgency, incontinence.
Musculoskeletal: Denies joint pain, swelling, stiffness.
Neurological: See HPI.
Psychiatric: Denies depression, anxiety, suicidal ideation.`,
    category: 'ROS',
    description: 'Comprehensive negative ROS',
    scope: 'ros'
  },
  {
    trigger_text: '.rosneuro',
    expansion_text: 'Neurological ROS: Denies headache, dizziness, vertigo, vision changes, numbness, tingling, weakness, tremor, gait difficulty, memory problems, speech difficulty, seizures, loss of consciousness.',
    category: 'ROS',
    description: 'Negative neuro ROS',
    scope: 'ros'
  },
  {
    trigger_text: '.rosbrief',
    expansion_text: 'All other systems reviewed and negative except as noted in HPI.',
    category: 'ROS',
    description: 'Brief negative ROS',
    scope: 'ros'
  },

  // =========================================
  // HEADACHE / MIGRAINE
  // =========================================
  {
    trigger_text: '.migraine',
    expansion_text: 'Chronic migraine without aura. Patient reports [X] headache days per month, [X] of which meet migraine criteria. Current preventive therapy: [medication]. Acute therapy: [medication]. Last MIDAS score: [X]. Last HIT-6 score: [X]. Response to current regimen: [adequate/inadequate].',
    category: 'Assessment',
    description: 'Migraine assessment template',
    scope: 'assessment'
  },
  {
    trigger_text: '.migraineha',
    expansion_text: 'Patient describes headaches as unilateral, pulsating/throbbing in quality, moderate-to-severe intensity, aggravated by routine physical activity. Associated with nausea, photophobia, and phonophobia. Typical duration [X] hours if untreated. Frequency: [X] days per month.',
    category: 'HPI',
    description: 'Migraine HPI template',
    scope: 'hpi'
  },
  {
    trigger_text: '.haplan',
    expansion_text: `Headache Management Plan:
1. Continue current preventive therapy: [medication] [dose]
2. Acute treatment: [triptan/NSAID] at headache onset, limit to 2 days/week to prevent medication overuse
3. Lifestyle modifications: Regular sleep schedule (7-8 hours), adequate hydration, regular meals, stress management
4. Headache diary to track frequency, triggers, and treatment response
5. Avoid known triggers: [list triggers]
6. Follow up in [X] weeks/months to assess response`,
    category: 'Plan',
    description: 'Headache management plan',
    scope: 'plan'
  },
  {
    trigger_text: '.haflags',
    expansion_text: 'Red flags assessed: No thunderclap onset, no fever, no meningismus, no focal neurological deficits, no papilledema, no significant change in headache pattern, no history of cancer or immunosuppression, no recent head trauma.',
    category: 'HPI',
    description: 'Headache red flags assessment',
    scope: 'hpi'
  },
  {
    trigger_text: '.moh',
    expansion_text: 'Medication overuse headache suspected. Patient using acute medications [X] days per week, exceeding recommended limits (>10 days/month for triptans/opioids, >15 days/month for simple analgesics). Discussed need to reduce acute medication use and establish preventive therapy.',
    category: 'Assessment',
    description: 'Medication overuse headache',
    scope: 'assessment'
  },
  {
    trigger_text: '.tensionha',
    expansion_text: 'Tension-type headache. Patient describes bilateral, pressing/tightening (non-pulsating) quality, mild-to-moderate intensity, not aggravated by routine physical activity. Denies nausea or vomiting. May have mild photophobia or phonophobia but not both. Duration 30 minutes to 7 days.',
    category: 'Assessment',
    description: 'Tension headache assessment',
    scope: 'assessment'
  },

  // =========================================
  // SEIZURE / EPILEPSY
  // =========================================
  {
    trigger_text: '.seizure',
    expansion_text: 'Epilepsy, [focal/generalized] [type]. Last seizure: [date]. Current AED: [medication] [dose]. Seizure frequency: [X] per [timeframe]. Compliance: [good/fair/poor]. Last AED level: [value] on [date]. Any recent missed doses: [yes/no]. Known triggers: [sleep deprivation, alcohol, stress, etc.].',
    category: 'Assessment',
    description: 'Seizure disorder assessment',
    scope: 'assessment'
  },
  {
    trigger_text: '.szplan',
    expansion_text: `Epilepsy Management Plan:
1. Continue [AED] [dose] [frequency]
2. Check [AED level/CBC/CMP/LFTs] [timing]
3. Seizure precautions: No driving until seizure-free for [state requirement], avoid heights/heavy machinery, no unsupervised swimming/bathing
4. Lifestyle: Regular sleep schedule, avoid alcohol excess, stress management
5. Women of childbearing potential: [folate supplementation/contraception discussion]
6. Emergency plan: Rescue medication [if applicable], when to call 911
7. Follow up in [X] months`,
    category: 'Plan',
    description: 'Epilepsy management plan',
    scope: 'plan'
  },
  {
    trigger_text: '.szdescribe',
    expansion_text: 'Patient/witness describes seizure as: [aura/warning], followed by [motor manifestations: tonic-clonic activity, focal jerking, automatisms], lasting approximately [X] minutes. Post-ictal period: [confusion, fatigue, headache, Todd paralysis] lasting [duration]. Tongue bite: [yes/no]. Incontinence: [yes/no].',
    category: 'HPI',
    description: 'Seizure description template',
    scope: 'hpi'
  },
  {
    trigger_text: '.firstsz',
    expansion_text: 'First unprovoked seizure. Workup includes: MRI brain with epilepsy protocol, routine EEG (if normal, consider extended/ambulatory EEG), basic labs (glucose, electrolytes, CBC, LFTs, toxicology screen). Discussed risk of recurrence (~40% at 2 years), driving restrictions, and treatment options.',
    category: 'Assessment',
    description: 'First seizure assessment',
    scope: 'assessment'
  },
  {
    trigger_text: '.szfree',
    expansion_text: 'Seizure-free for [X] months/years on current regimen. No breakthrough seizures. No side effects from medication. Continue current therapy. May discuss medication taper if seizure-free >2 years [if appropriate].',
    category: 'Assessment',
    description: 'Seizure-free status',
    scope: 'assessment'
  },

  // =========================================
  // MOVEMENT DISORDERS
  // =========================================
  {
    trigger_text: '.parkinson',
    expansion_text: `Parkinson disease, Hoehn & Yahr stage [I-V]. Duration: [X] years.
Cardinal features: [bradykinesia, rest tremor, rigidity, postural instability - specify which present]
Current medications: [levodopa/carbidopa dose and frequency, other PD meds]
Motor fluctuations: [wearing off, dyskinesias, on-off fluctuations]
Non-motor symptoms: [constipation, RBD, orthostatic hypotension, depression, cognitive changes]
Response to current regimen: [describe]`,
    category: 'Assessment',
    description: 'Parkinson disease assessment',
    scope: 'assessment'
  },
  {
    trigger_text: '.pdplan',
    expansion_text: `Parkinson Disease Management Plan:
1. Medications: [current regimen and any changes]
2. Physical therapy/occupational therapy referral for gait, balance, and ADL training
3. Speech therapy referral if speech/swallowing concerns
4. Address non-motor symptoms: [specific interventions]
5. Fall prevention: Home safety evaluation, assistive devices as needed
6. Depression/anxiety screening and treatment as indicated
7. Advance care planning discussion
8. Follow up in [X] months`,
    category: 'Plan',
    description: 'PD management plan',
    scope: 'plan'
  },
  {
    trigger_text: '.tremor',
    expansion_text: 'Essential tremor. Bilateral action tremor affecting [hands/head/voice], present for [X] years. Family history: [positive/negative]. Alcohol response: [improves/no effect]. Impact on ADLs: [describe]. Current treatment: [medication or none].',
    category: 'Assessment',
    description: 'Essential tremor assessment',
    scope: 'assessment'
  },
  {
    trigger_text: '.dystonia',
    expansion_text: 'Dystonia, [focal/segmental/generalized], affecting [body region]. Age of onset: [X] years. Pattern: [task-specific, sustained, intermittent]. Sensory trick present: [yes/no, describe]. Current treatment: [botulinum toxin, oral medications, none].',
    category: 'Assessment',
    description: 'Dystonia assessment',
    scope: 'assessment'
  },

  // =========================================
  // STROKE / CEREBROVASCULAR
  // =========================================
  {
    trigger_text: '.stroke',
    expansion_text: `Ischemic stroke, [territory/location], [date of onset].
Etiology: [large vessel atherosclerosis/cardioembolic/small vessel/cryptogenic/other]
NIHSS at presentation: [score]. Current NIHSS: [score].
mRS at baseline: [score]. Current mRS: [score].
Acute treatment received: [tPA, thrombectomy, neither]
Current deficits: [describe]
Secondary prevention: [antiplatelet/anticoagulation, statin, BP control, diabetes management, smoking cessation]`,
    category: 'Assessment',
    description: 'Stroke assessment template',
    scope: 'assessment'
  },
  {
    trigger_text: '.strokeplan',
    expansion_text: `Stroke Secondary Prevention Plan:
1. Antiplatelet/anticoagulation: [aspirin/clopidogrel/DOAC]
2. Statin: [high-intensity statin] with goal LDL <70 mg/dL
3. Blood pressure goal: <130/80 mmHg
4. Diabetes management: A1c goal <7%
5. Smoking cessation counseling and pharmacotherapy
6. Cardiac workup: [echo, Holter/event monitor if indicated]
7. Vascular imaging: [carotid ultrasound, CTA/MRA as needed]
8. Rehabilitation: PT/OT/Speech therapy
9. Depression screening
10. Return precautions: New weakness, numbness, speech difficulty, vision changes → ED immediately
11. Follow up in [X] weeks`,
    category: 'Plan',
    description: 'Stroke prevention plan',
    scope: 'plan'
  },
  {
    trigger_text: '.tia',
    expansion_text: 'TIA (transient ischemic attack). Symptoms: [focal weakness, numbness, speech difficulty, vision changes] lasting [duration]. Complete resolution by time of evaluation. ABCD2 score: [X]. Urgent workup includes: MRI brain with DWI, MRA head/neck or CTA, TTE with bubble study, Holter/cardiac monitoring, lipid panel, A1c.',
    category: 'Assessment',
    description: 'TIA assessment',
    scope: 'assessment'
  },

  // =========================================
  // MULTIPLE SCLEROSIS / NEUROIMMUNOLOGY
  // =========================================
  {
    trigger_text: '.ms',
    expansion_text: `Multiple sclerosis, [relapsing-remitting/secondary progressive/primary progressive].
Diagnosis: [date]. Disease duration: [X] years.
Last relapse: [date, symptoms]. Recent relapses (past 2 years): [number]
Current DMT: [medication], started [date]. Tolerance: [good/side effects]
EDSS: [score]. Recent MRI: [date, findings - new lesions, enhancement]
Symptoms: [fatigue, spasticity, bladder, cognitive, etc.]`,
    category: 'Assessment',
    description: 'MS assessment template',
    scope: 'assessment'
  },
  {
    trigger_text: '.msplan',
    expansion_text: `Multiple Sclerosis Management Plan:
1. Continue current DMT: [medication, dose, frequency]
2. Labs: [JCV antibody, CBC, LFTs, renal function per DMT monitoring]
3. MRI brain and spine: [timing] to monitor for disease activity
4. Symptom management:
   - Fatigue: [intervention]
   - Spasticity: [baclofen, tizanidine, PT]
   - Bladder: [medication, urology referral]
5. Vitamin D supplementation: [dose]
6. Relapse management: Patient to contact if new symptoms >24 hours
7. Vaccinations: Update per recommendations (avoid live vaccines on certain DMTs)
8. Follow up in [X] months`,
    category: 'Plan',
    description: 'MS management plan',
    scope: 'plan'
  },
  {
    trigger_text: '.msrelapse',
    expansion_text: 'Patient reports new symptoms consistent with MS relapse: [describe symptoms]. Onset: [date]. Duration: >24 hours. No fever or infection to explain symptoms. MRI shows [new T2 lesions/enhancement]. Recommend high-dose IV methylprednisolone 1g daily x 3-5 days.',
    category: 'Assessment',
    description: 'MS relapse assessment',
    scope: 'assessment'
  },

  // =========================================
  // COGNITIVE / DEMENTIA
  // =========================================
  {
    trigger_text: '.dementia',
    expansion_text: `Dementia, [Alzheimer type/vascular/mixed/Lewy body/frontotemporal].
Onset: [X] years ago. Progression: [gradual/stepwise]
MoCA score: [X]/30 (date). Previous: [X]/30 (date)
Domains affected: [memory, executive function, language, visuospatial, behavior]
ADLs: [independent/needs assistance with IADLs/needs assistance with basic ADLs]
Behavioral symptoms: [agitation, apathy, depression, psychosis]
Current medications: [cholinesterase inhibitor, memantine]
Caregiver: [relationship], caregiver burden assessment: [low/moderate/high]`,
    category: 'Assessment',
    description: 'Dementia assessment',
    scope: 'assessment'
  },
  {
    trigger_text: '.dementiaplan',
    expansion_text: `Dementia Management Plan:
1. Cognitive medication: [donepezil/rivastigmine/galantamine] [dose]; [memantine if moderate-severe]
2. Address reversible causes: Check B12, folate, TSH, RPR if not done
3. Safety evaluation: Driving assessment, home safety, wandering risk, financial vulnerability
4. Caregiver support: Education, respite resources, support groups (Alzheimer's Association)
5. Behavioral interventions: Structured routine, redirection, address triggers
6. Advance directives discussion, healthcare proxy
7. Community resources: Adult day programs, home health, Meals on Wheels
8. Follow up in [X] months with patient and caregiver`,
    category: 'Plan',
    description: 'Dementia management plan',
    scope: 'plan'
  },
  {
    trigger_text: '.mci',
    expansion_text: 'Mild cognitive impairment, [amnestic/non-amnestic], [single/multiple domain]. Patient reports [memory complaints, word-finding difficulty, etc.]. Objective evidence of cognitive decline (MoCA [X]/30) beyond expected for age. ADLs remain intact. No dementia criteria met. Risk of progression to dementia ~10-15% per year.',
    category: 'Assessment',
    description: 'MCI assessment',
    scope: 'assessment'
  },

  // =========================================
  // NEUROMUSCULAR
  // =========================================
  {
    trigger_text: '.neuropathy',
    expansion_text: `Peripheral neuropathy, [type: sensorimotor/sensory/motor], [pattern: length-dependent/non-length-dependent], [etiology: diabetic/idiopathic/inflammatory/hereditary].
Distribution: [stocking-glove, asymmetric, proximal]
Symptoms: [numbness, tingling, burning pain, weakness]
EMG/NCS: [date, findings]
Workup completed: [glucose/A1c, B12, TSH, SPEP/UPEP, etc.]
Current treatment: [medications for neuropathic pain, DMT if applicable]`,
    category: 'Assessment',
    description: 'Neuropathy assessment',
    scope: 'assessment'
  },
  {
    trigger_text: '.neuroplan',
    expansion_text: `Peripheral Neuropathy Management Plan:
1. Address underlying cause: [glucose control, B12 replacement, etc.]
2. Neuropathic pain management: [gabapentin/pregabalin/duloxetine/TCAs]
3. Foot care: Daily inspection, proper footwear, podiatry referral
4. Fall prevention: PT evaluation, assistive devices as needed
5. Avoid neurotoxic medications and excessive alcohol
6. EMG/NCS if not done or needs repeat
7. Consider additional workup: [nerve biopsy, genetic testing, LP] if indicated
8. Follow up in [X] months`,
    category: 'Plan',
    description: 'Neuropathy management plan',
    scope: 'plan'
  },
  {
    trigger_text: '.myasthenia',
    expansion_text: `Myasthenia gravis, [ocular/generalized], [AChR Ab positive/MuSK positive/seronegative].
MGFA class: [I-V]. Thymoma status: [present/absent/thymectomy done]
Current symptoms: [ptosis, diplopia, bulbar weakness, limb weakness, respiratory]
Current treatment: [pyridostigmine dose, immunotherapy]
Last crisis: [date or never]. Recent infections/stressors: [describe]`,
    category: 'Assessment',
    description: 'Myasthenia gravis assessment',
    scope: 'assessment'
  },
  {
    trigger_text: '.mgplan',
    expansion_text: `Myasthenia Gravis Management Plan:
1. Continue pyridostigmine [dose] [frequency]
2. Immunotherapy: [prednisone taper, azathioprine, mycophenolate, etc.]
3. Avoid MG-exacerbating medications (aminoglycosides, fluoroquinolones, beta-blockers, magnesium)
4. Thymectomy evaluation if not done and appropriate
5. Crisis precautions: Seek emergency care for respiratory distress, severe bulbar weakness
6. Vaccinations: Flu, pneumonia (avoid live vaccines on immunotherapy)
7. Labs: [per immunotherapy monitoring]
8. Follow up in [X] weeks/months`,
    category: 'Plan',
    description: 'MG management plan',
    scope: 'plan'
  },

  // =========================================
  // SLEEP
  // =========================================
  {
    trigger_text: '.sleepapnea',
    expansion_text: 'Obstructive sleep apnea. PSG: AHI [X]/hour [mild 5-15, moderate 15-30, severe >30]. Lowest O2 sat: [X]%. Current treatment: [CPAP/BiPAP] at [pressure] cmH2O. Compliance: [X] hours/night, [X]% nights used. Residual AHI on therapy: [X]. Symptoms: [still with EDS, improved, resolved]. ESS score: [X]/24.',
    category: 'Assessment',
    description: 'Sleep apnea assessment',
    scope: 'assessment'
  },
  {
    trigger_text: '.insomnia',
    expansion_text: 'Chronic insomnia disorder. Patient reports difficulty with [sleep initiation/sleep maintenance/early morning awakening] occurring [X] nights per week for [duration]. Sleep latency: [X] minutes. Total sleep time: [X] hours. Daytime impairment: [fatigue, concentration, mood]. Sleep hygiene assessment: [adequate/inadequate]. Prior treatments: [list].',
    category: 'Assessment',
    description: 'Insomnia assessment',
    scope: 'assessment'
  },
  {
    trigger_text: '.sleephygiene',
    expansion_text: `Sleep Hygiene Recommendations:
1. Maintain consistent sleep-wake schedule, even on weekends
2. Create a restful environment: Cool, dark, quiet bedroom
3. Limit screen time 1 hour before bed (blue light exposure)
4. Avoid caffeine after noon, limit alcohol
5. Regular exercise, but not within 3-4 hours of bedtime
6. Reserve bed for sleep and intimacy only (no TV, work, phone)
7. If unable to sleep after 20 minutes, leave bed and return when sleepy
8. Avoid daytime napping, or limit to <30 minutes before 3pm`,
    category: 'Plan',
    description: 'Sleep hygiene counseling',
    scope: 'plan'
  },
  {
    trigger_text: '.rls',
    expansion_text: 'Restless legs syndrome. Patient reports urge to move legs with uncomfortable sensations, worse at rest and in the evening/night, relieved by movement. Frequency: [X] nights/week. Impact on sleep: [describe]. Iron studies: Ferritin [X]. Current treatment: [medication or none].',
    category: 'Assessment',
    description: 'RLS assessment',
    scope: 'assessment'
  },

  // =========================================
  // FOLLOW-UP & ORDERS
  // =========================================
  {
    trigger_text: '.fu1wk',
    expansion_text: 'Follow up in 1 week or sooner if symptoms worsen.',
    category: 'Plan',
    description: 'One week follow-up',
    scope: 'plan'
  },
  {
    trigger_text: '.fu2wk',
    expansion_text: 'Follow up in 2 weeks or sooner if symptoms worsen.',
    category: 'Plan',
    description: 'Two week follow-up',
    scope: 'plan'
  },
  {
    trigger_text: '.fu1mo',
    expansion_text: 'Follow up in 1 month or sooner if symptoms worsen.',
    category: 'Plan',
    description: 'One month follow-up',
    scope: 'plan'
  },
  {
    trigger_text: '.fu3mo',
    expansion_text: 'Follow up in 3 months or sooner if symptoms worsen.',
    category: 'Plan',
    description: 'Three month follow-up',
    scope: 'plan'
  },
  {
    trigger_text: '.fu6mo',
    expansion_text: 'Follow up in 6 months or sooner if symptoms worsen.',
    category: 'Plan',
    description: 'Six month follow-up',
    scope: 'plan'
  },
  {
    trigger_text: '.fuprn',
    expansion_text: 'Follow up as needed. Patient to call or schedule appointment if symptoms worsen or new concerns arise.',
    category: 'Plan',
    description: 'PRN follow-up',
    scope: 'plan'
  },
  {
    trigger_text: '.labs',
    expansion_text: 'Labs ordered: CBC, CMP, [additional tests]. Results to be reviewed and patient notified.',
    category: 'Plan',
    description: 'Lab order template',
    scope: 'plan'
  },
  {
    trigger_text: '.mri',
    expansion_text: 'MRI brain [with/without contrast] ordered to evaluate [indication]. Results to be reviewed and discussed with patient.',
    category: 'Plan',
    description: 'MRI order template',
    scope: 'plan'
  },
  {
    trigger_text: '.mrispine',
    expansion_text: 'MRI [cervical/thoracic/lumbar] spine [with/without contrast] ordered to evaluate [indication]. Results to be reviewed and discussed with patient.',
    category: 'Plan',
    description: 'MRI spine order',
    scope: 'plan'
  },
  {
    trigger_text: '.eeg',
    expansion_text: 'EEG ordered to evaluate [seizure activity/encephalopathy/other]. [Routine/ambulatory/video] EEG requested. Results to be reviewed.',
    category: 'Plan',
    description: 'EEG order template',
    scope: 'plan'
  },
  {
    trigger_text: '.emg',
    expansion_text: 'EMG/nerve conduction study ordered to evaluate [radiculopathy/neuropathy/myopathy/other]. Results to be reviewed and discussed with patient.',
    category: 'Plan',
    description: 'EMG order template',
    scope: 'plan'
  },
  {
    trigger_text: '.ptref',
    expansion_text: 'Referral placed for physical therapy to address [gait training/balance/strengthening/vestibular rehabilitation/other].',
    category: 'Plan',
    description: 'PT referral',
    scope: 'plan'
  },
  {
    trigger_text: '.otref',
    expansion_text: 'Referral placed for occupational therapy to address [fine motor skills/ADL training/cognitive rehabilitation/other].',
    category: 'Plan',
    description: 'OT referral',
    scope: 'plan'
  },
  {
    trigger_text: '.stref',
    expansion_text: 'Referral placed for speech therapy to address [dysphagia/dysarthria/aphasia/cognitive-communication/other].',
    category: 'Plan',
    description: 'Speech therapy referral',
    scope: 'plan'
  },

  // =========================================
  // RETURN PRECAUTIONS
  // =========================================
  {
    trigger_text: '.returnha',
    expansion_text: 'Return precautions: Seek immediate medical attention for sudden severe "worst headache of life," fever with headache, confusion, weakness, numbness, vision changes, stiff neck, or seizure.',
    category: 'Plan',
    description: 'Headache return precautions',
    scope: 'plan'
  },
  {
    trigger_text: '.returnstroke',
    expansion_text: 'Stroke return precautions: Call 911 immediately for any new or worsening: Facial drooping, arm weakness, speech difficulty, sudden severe headache, vision changes, confusion, dizziness, or loss of balance. Remember BE-FAST: Balance, Eyes, Face, Arm, Speech, Time.',
    category: 'Plan',
    description: 'Stroke return precautions',
    scope: 'plan'
  },
  {
    trigger_text: '.returnsz',
    expansion_text: 'Seizure return precautions: Seek emergency care for seizure lasting >5 minutes, repeated seizures without recovery, seizure with injury, first seizure, breathing difficulty after seizure, or seizure in water.',
    category: 'Plan',
    description: 'Seizure return precautions',
    scope: 'plan'
  },
]

// POST /api/phrases/seed - Seed default phrases for current user
export async function POST() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenant = getTenantServer()

  // Check if user already has phrases
  const { data: existing } = await supabase
    .from('dot_phrases')
    .select('id')
    .eq('user_id', user.id)
    .eq('tenant_id', tenant)
    .limit(1)

  if (existing && existing.length > 0) {
    return NextResponse.json(
      { message: 'User already has phrases', seeded: false },
      { status: 200 }
    )
  }

  // Insert default phrases
  const phrasesToInsert = DEFAULT_PHRASES.map(phrase => ({
    ...phrase,
    user_id: user.id,
    tenant_id: tenant,
  }))

  const { data: phrases, error } = await supabase
    .from('dot_phrases')
    .insert(phrasesToInsert)
    .select()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    message: 'Default phrases seeded successfully',
    seeded: true,
    count: phrases?.length || 0
  }, { status: 201 })
}
