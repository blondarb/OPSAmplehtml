// Smart Recommendations Data - Outpatient Neurology Plans
// Based on https://blondarb.github.io/neuro-plans/clinical/

/**
 * Dose option for medications with multiple standard doses
 * Each option has display text and a full order sentence
 */
export interface DoseOption {
  text: string           // Display text, e.g., "2 mg SC"
  orderSentence: string  // Full order sentence, e.g., "Apomorphine SC 2 mg SC"
}

/**
 * Structured dosing information with multiple options
 * Allows dropdown selection with manual override capability
 */
export interface StructuredDosing {
  doseOptions?: DoseOption[]  // Array of standard dose choices
  route?: string              // Administration route (PO, IV, SC, etc.)
  instructions?: string       // Additional dosing instructions
  orderSentence?: string      // Default order sentence if no dropdown selection
}

export interface RecommendationItem {
  item: string
  rationale?: string
  dosing?: string | StructuredDosing  // Can be simple string or structured with doseOptions
  timing?: string
  target?: string
  indication?: string
  contraindications?: string
  monitoring?: string
  priority: 'STAT' | 'URGENT' | 'ROUTINE' | 'EXT' | '—' | '✓'
}

export interface RecommendationSubsection {
  [key: string]: RecommendationItem[]
}

export interface RecommendationSection {
  [key: string]: RecommendationSubsection
}

export interface DifferentialDiagnosis {
  diagnosis: string
  features: string
  tests: string
}

export interface EvidenceEntry {
  recommendation: string
  evidenceLevel: string
  source: string
}

export interface MonitoringEntry {
  item: string
  frequency: string
  action: string
}

export interface DispositionEntry {
  disposition: string
  criteria: string
}

export interface ClinicalPlan {
  id: string
  title: string
  icd10: string[]
  scope: string
  notes: string[]
  sections: RecommendationSection
  patientInstructions: string[]
  referrals: string[]
  differential?: DifferentialDiagnosis[]
  evidence?: EvidenceEntry[]
  monitoring?: MonitoringEntry[]
  disposition?: DispositionEntry[]
}

export interface PlansData {
  [key: string]: ClinicalPlan
}

// Demo outpatient plans based on the clinical plan builder
export const OUTPATIENT_PLANS: PlansData = {
  'New Onset Seizure': {
    id: 'new-onset-seizure',
    title: 'New Onset Seizure',
    icd10: ['R56.9', 'G40.909'],
    scope: 'Evaluation and initial management of first unprovoked seizure in outpatient setting',
    notes: [
      'MRI brain with epilepsy protocol is essential for all new onset seizures',
      'EEG should be obtained within 24-48 hours if possible',
      'ASM initiation depends on seizure recurrence risk assessment',
    ],
    sections: {
      'Laboratory Workup': {
        'Essential Labs': [
          { item: 'CBC with differential', priority: 'ROUTINE', rationale: 'Baseline and infection workup' },
          { item: 'CMP (BMP + LFTs)', priority: 'ROUTINE', rationale: 'Metabolic causes, ASM monitoring baseline' },
          { item: 'Magnesium', priority: 'ROUTINE', rationale: 'Electrolyte abnormalities can lower seizure threshold' },
          { item: 'Calcium (ionized if available)', priority: 'ROUTINE', rationale: 'Hypocalcemia can cause seizures' },
          { item: 'TSH', priority: 'ROUTINE', rationale: 'Thyroid dysfunction evaluation' },
          { item: 'B12 level', priority: 'ROUTINE', rationale: 'Neurological complications of deficiency' },
          { item: 'Folate level', priority: 'ROUTINE', rationale: 'Important if starting certain ASMs' },
        ],
        'Toxicology': [
          { item: 'Urine drug screen', priority: 'ROUTINE', rationale: 'Substance-induced seizure evaluation' },
          { item: 'Blood alcohol level (if recent)', priority: 'ROUTINE', rationale: 'Alcohol withdrawal seizures' },
        ],
        'Extended Workup': [
          { item: 'HIV screening', priority: 'ROUTINE', rationale: 'If risk factors present' },
          { item: 'RPR/VDRL', priority: 'ROUTINE', rationale: 'Neurosyphilis screening' },
          { item: 'Autoimmune panel (serum)', priority: 'EXT', rationale: 'If autoimmune etiology suspected' },
          { item: 'Paraneoplastic panel', priority: 'EXT', rationale: 'If malignancy or autoimmune suspected' },
        ],
      },
      'Imaging & Studies': {
        'Essential Imaging': [
          { item: 'MRI brain with/without contrast (epilepsy protocol)', priority: 'ROUTINE', timing: 'Within 2 weeks', target: 'Structural lesion, hippocampal sclerosis, cortical dysplasia' },
          { item: 'EEG (routine)', priority: 'ROUTINE', timing: 'Within 24-48 hours ideally', target: 'Epileptiform activity, focal slowing' },
        ],
        'Additional Studies': [
          { item: 'MRA/MRV brain', priority: 'ROUTINE', indication: 'If vascular etiology suspected' },
          { item: 'Echocardiogram', priority: 'ROUTINE', indication: 'If syncope in differential, cardioembolic source' },
          { item: 'ECG', priority: 'ROUTINE', rationale: 'Cardiac arrhythmia, QTc baseline before certain ASMs' },
        ],
        'Specialized': [
          { item: 'Video EEG monitoring', priority: 'EXT', indication: 'Recurrent events, spell characterization' },
          { item: 'PET-CT brain', priority: 'EXT', indication: 'Surgical evaluation, MRI-negative epilepsy' },
        ],
      },
      'Treatment': {
        'First-Line ASMs': [
          {
            item: 'Levetiracetam (Keppra)',
            priority: 'ROUTINE',
            dosing: 'Start 500 mg BID, may increase by 500 mg/dose weekly; max 3000 mg/day',
            rationale: 'Broad spectrum, minimal drug interactions, no titration needed',
            monitoring: 'Mood changes, behavioral side effects'
          },
          {
            item: 'Lamotrigine (Lamictal)',
            priority: 'ROUTINE',
            dosing: 'Start 25 mg daily × 2 weeks; then 50 mg daily × 2 weeks; then 100 mg daily; target 200-400 mg/day',
            rationale: 'Preferred for women of childbearing potential, mood stabilizing',
            contraindications: 'Slow titration required - risk of SJS with rapid escalation',
            monitoring: 'Rash (discontinue if severe)'
          },
          {
            item: 'Lacosamide (Vimpat)',
            priority: 'ROUTINE',
            dosing: 'Start 100 mg PO BID; increase by 100 mg/day weekly; target 200-400 mg BID',
            rationale: 'Well tolerated, twice daily dosing',
            monitoring: 'ECG for PR prolongation',
            contraindications: 'AV block, cardiac conduction abnormalities'
          },
          {
            item: 'Oxcarbazepine (Trileptal)',
            priority: 'ROUTINE',
            dosing: 'Start 300 mg PO BID; increase by 300-600 mg/day every week; target 1200-2400 mg/day',
            rationale: 'Good for focal seizures',
            monitoring: 'Sodium levels (hyponatremia risk)'
          },
        ],
        'Second-Line Options': [
          {
            item: 'Valproate/Divalproex (Depakote)',
            priority: 'ROUTINE',
            dosing: 'Start 250-500 mg BID; target 1000-2000 mg/day',
            rationale: 'Broad spectrum, good for generalized epilepsies',
            contraindications: 'Pregnancy (teratogenic), liver disease',
            monitoring: 'LFTs, ammonia, CBC, weight'
          },
          {
            item: 'Topiramate (Topamax)',
            priority: 'ROUTINE',
            dosing: 'Start 25 mg daily; increase by 25-50 mg/week; target 200-400 mg/day',
            rationale: 'Weight neutral/loss, migraine prophylaxis',
            monitoring: 'Cognitive effects, kidney stones, metabolic acidosis'
          },
          {
            item: 'Zonisamide (Zonegran)',
            priority: 'ROUTINE',
            dosing: 'Start 100 mg daily; increase by 100 mg every 2 weeks; target 300-400 mg/day',
            rationale: 'Once daily dosing, weight neutral',
            monitoring: 'Kidney stones, heat intolerance'
          },
        ],
      },
      'Referrals & Follow-up': {
        'Essential': [
          { item: 'Neurology follow-up', priority: 'ROUTINE', timing: '1-2 weeks' },
          { item: 'Epilepsy specialist referral', priority: 'ROUTINE', indication: 'Refractory seizures, surgical candidacy' },
        ],
        'Additional': [
          { item: 'Neuropsychology referral', priority: 'ROUTINE', indication: 'Cognitive concerns, surgical evaluation' },
          { item: 'Women\'s health/OB-GYN', priority: 'ROUTINE', indication: 'Women of childbearing age on ASMs' },
          { item: 'Genetic counseling', priority: 'EXT', indication: 'Suspected genetic epilepsy syndrome' },
        ],
      },
    },
    patientInstructions: [
      'Take medication exactly as prescribed - do NOT stop abruptly (risk of breakthrough seizures)',
      'Avoid common triggers: sleep deprivation, excessive alcohol, illicit drugs',
      'Maintain a seizure diary - record date, time, duration, description, triggers',
      'Do NOT drive until cleared by neurology (state laws vary)',
      'Avoid operating heavy machinery, swimming alone, bathing unattended',
      'Wear medical identification bracelet/necklace',
      'Educate family/friends on seizure first aid',
      'Report any new or worsening symptoms promptly',
    ],
    referrals: ['Neurology', 'Epilepsy specialist', 'Neuropsychology'],
    differential: [
      {
        diagnosis: 'Syncope (Convulsive Syncope)',
        features: 'Brief episodes (<15 sec), triggered by positional changes or straining, quick recovery without prolonged confusion, warning signs like lightheadedness',
        tests: 'ECG, orthostatic vitals, tilt-table testing, echocardiogram',
      },
      {
        diagnosis: 'Psychogenic Non-Epileptic Spells (PNES)',
        features: 'Variable presentation, prolonged duration, preserved awareness despite bilateral movements, eye closure, pelvic thrusting, no post-ictal confusion',
        tests: 'Video EEG during event (normal EEG), prolactin level (not elevated)',
      },
      {
        diagnosis: 'Transient Ischemic Attack (TIA)',
        features: 'Negative symptoms (weakness, numbness) rather than positive symptoms, no loss of consciousness, no convulsive movements',
        tests: 'MRI brain with DWI, CTA/MRA head and neck',
      },
      {
        diagnosis: 'Migraine with Aura',
        features: 'Gradual symptom spread over minutes, visual/sensory symptoms precede headache, positive visual phenomena',
        tests: 'Clinical diagnosis, MRI brain if atypical features',
      },
      {
        diagnosis: 'Hypoglycemia',
        features: 'Associated with diabetes/insulin use, confusion, diaphoresis, tremor, rapid improvement with glucose',
        tests: 'Point-of-care glucose, HbA1c',
      },
      {
        diagnosis: 'Cardiac Arrhythmia',
        features: 'Palpitations, sudden onset/offset, associated with exertion or position change',
        tests: 'ECG, Holter monitor, event monitor, echocardiogram',
      },
    ],
    evidence: [
      {
        recommendation: 'MRI is superior to CT for detecting epileptogenic lesions',
        evidenceLevel: 'Class I, Level A',
        source: 'AAN Practice Guidelines 2007',
      },
      {
        recommendation: 'EEG should be performed in all patients with first unprovoked seizure',
        evidenceLevel: 'Class I, Level A',
        source: 'AAN Practice Guidelines 2015',
      },
      {
        recommendation: 'Immediate ASM therapy reduces seizure recurrence risk but does not affect long-term prognosis',
        evidenceLevel: 'Class I, Level A',
        source: 'FIRST and MESS Trials',
      },
      {
        recommendation: 'Levetiracetam, lamotrigine, and zonisamide have similar efficacy as initial monotherapy',
        evidenceLevel: 'Class I, Level A',
        source: 'SANAD II Trial, Lancet 2021',
      },
      {
        recommendation: 'Risk of recurrence after first unprovoked seizure is 21-45% at 2 years',
        evidenceLevel: 'Class I, Level A',
        source: 'Multiple meta-analyses',
      },
    ],
  },

  'Status Epilepticus': {
    id: 'status-epilepticus',
    title: 'Status Epilepticus',
    icd10: ['G41.0', 'G41.1', 'G41.2', 'G41.8', 'G41.9'],
    scope: 'Outpatient follow-up and prevention after status epilepticus episode',
    notes: [
      'Post-SE outpatient management focuses on optimization and recurrence prevention',
      'Close follow-up is essential after SE episode',
      'Medication adherence and trigger avoidance are critical',
    ],
    sections: {
      'Laboratory Workup': {
        'Routine Monitoring': [
          { item: 'ASM drug levels', priority: 'ROUTINE', rationale: 'Ensure therapeutic levels, assess compliance' },
          { item: 'CBC with differential', priority: 'ROUTINE', rationale: 'Monitor for ASM-related hematologic effects' },
          { item: 'CMP', priority: 'ROUTINE', rationale: 'Electrolytes, renal/hepatic function for ASM monitoring' },
          { item: 'Magnesium', priority: 'ROUTINE', rationale: 'Low magnesium lowers seizure threshold' },
        ],
        'If Autoimmune Suspected': [
          { item: 'Autoimmune encephalitis panel', priority: 'EXT', rationale: 'NMDA-R, LGI1, CASPR2, GAD65 antibodies' },
          { item: 'CSF analysis review', priority: 'EXT', rationale: 'If LP performed during hospitalization' },
        ],
      },
      'Imaging & Studies': {
        'Follow-up Imaging': [
          { item: 'MRI brain follow-up', priority: 'ROUTINE', timing: '3-6 months post-SE', target: 'Assess for new lesions, hippocampal changes' },
          { item: 'EEG (routine or ambulatory)', priority: 'ROUTINE', timing: '4-6 weeks post-discharge', target: 'Assess background, epileptiform activity' },
        ],
        'If Refractory': [
          { item: 'Video EEG monitoring', priority: 'EXT', indication: 'Spell characterization, surgical evaluation' },
          { item: 'PET scan', priority: 'EXT', indication: 'Surgical planning for refractory cases' },
        ],
      },
      'Treatment': {
        'ASM Optimization': [
          {
            item: 'Continue/optimize current ASM regimen',
            priority: 'ROUTINE',
            rationale: 'Ensure adequate dosing based on levels',
            monitoring: 'Drug levels, side effects'
          },
          {
            item: 'Consider add-on ASM',
            priority: 'ROUTINE',
            indication: 'If breakthrough seizures despite therapeutic levels',
            rationale: 'Dual therapy for refractory cases'
          },
          {
            item: 'Clobazam (Onfi)',
            priority: 'ROUTINE',
            dosing: '5-10 mg BID, max 40 mg/day',
            rationale: 'Effective add-on, especially in Lennox-Gastaut',
            monitoring: 'Sedation, tolerance'
          },
          {
            item: 'Brivaracetam (Briviact)',
            priority: 'ROUTINE',
            dosing: '25-100 mg BID',
            rationale: 'Alternative to levetiracetam with fewer behavioral effects'
          },
        ],
        'Rescue Medications': [
          {
            item: 'Diazepam rectal gel (Diastat)',
            priority: 'ROUTINE',
            dosing: '0.2-0.5 mg/kg PR, may repeat x1 in 4-12 hours',
            rationale: 'Home rescue for prolonged seizures',
            indication: 'Seizure lasting >5 minutes'
          },
          {
            item: 'Midazolam nasal spray (Nayzilam)',
            priority: 'ROUTINE',
            dosing: '5 mg intranasal, may repeat x1 after 10 min',
            rationale: 'Alternative rescue, easier administration'
          },
          {
            item: 'Diazepam nasal spray (Valtoco)',
            priority: 'ROUTINE',
            dosing: '5-20 mg intranasal based on weight/age',
            rationale: 'Nasal rescue option'
          },
        ],
      },
      'Referrals & Follow-up': {
        'Essential': [
          { item: 'Neurology/Epilepsy follow-up', priority: 'ROUTINE', timing: '2-4 weeks post-discharge' },
          { item: 'Comprehensive epilepsy center evaluation', priority: 'ROUTINE', indication: 'Refractory SE, surgical candidacy' },
        ],
        'Supportive': [
          { item: 'Neuropsychology evaluation', priority: 'ROUTINE', indication: 'Cognitive concerns post-SE' },
          { item: 'Physical/Occupational therapy', priority: 'ROUTINE', indication: 'Functional deficits' },
          { item: 'Social work referral', priority: 'ROUTINE', indication: 'Medication access, support resources' },
        ],
      },
    },
    patientInstructions: [
      'STRICT medication adherence - missed doses significantly increase SE recurrence risk',
      'Keep rescue medication readily available at all times',
      'Educate caregivers on rescue medication administration',
      'Seizure action plan: Call 911 if seizure >5 min or repeated seizures',
      'Avoid all seizure triggers: sleep deprivation, alcohol, missed medications',
      'Regular sleep schedule is critical',
      'Follow up with neurology as scheduled - do not miss appointments',
      'Wear medical alert identification',
    ],
    referrals: ['Epilepsy specialist', 'Comprehensive epilepsy center', 'Neuropsychology'],
    differential: [
      {
        diagnosis: 'Psychogenic Non-Epileptic Status',
        features: 'Preserved awareness, asynchronous movements, eye closure, pelvic thrusting, prolonged duration with minimal post-ictal period',
        tests: 'Video EEG (normal cEEG during event)',
      },
      {
        diagnosis: 'Movement Disorders',
        features: 'Dystonia, chorea, tremor - typically without impaired consciousness',
        tests: 'Clinical observation, video documentation',
      },
      {
        diagnosis: 'Toxic-Metabolic Encephalopathy',
        features: 'Gradual onset, fluctuating level of consciousness, no discrete ictal events',
        tests: 'CMP, ammonia, drug levels, toxicology screen',
      },
    ],
    evidence: [
      {
        recommendation: 'Benzodiazepines are first-line treatment for status epilepticus',
        evidenceLevel: 'Class I, Level A',
        source: 'NCS Guidelines 2012, AES Guidelines 2016',
      },
      {
        recommendation: 'Lorazepam is the preferred IV benzodiazepine',
        evidenceLevel: 'Class I, Level A',
        source: 'Alldredge et al. NEJM 2001',
      },
      {
        recommendation: 'IM midazolam is non-inferior to IV lorazepam',
        evidenceLevel: 'Class I, Level A',
        source: 'RAMPART Trial (Silbergleit et al. NEJM 2012)',
      },
      {
        recommendation: 'Second-line agents (LEV, VPA, fPHT) have equivalent efficacy',
        evidenceLevel: 'Class I, Level A',
        source: 'ESETT Trial (Kapur et al. NEJM 2019)',
      },
      {
        recommendation: 'Levetiracetam 60 mg/kg dosing in SE',
        evidenceLevel: 'Class I, Level A',
        source: 'ESETT Trial',
      },
      {
        recommendation: 'Continuous EEG monitoring in refractory SE',
        evidenceLevel: 'Class I, Level B',
        source: 'NCS Guidelines 2012',
      },
      {
        recommendation: 'Ketamine in refractory/super-refractory SE',
        evidenceLevel: 'Class IIb, Level B',
        source: 'Multiple case series, 2024 systematic reviews',
      },
    ],
    monitoring: [
      {
        item: 'Continuous EEG',
        frequency: 'Continuous during acute SE',
        action: 'Adjust ASMs/anesthetics based on seizure activity',
      },
      {
        item: 'ASM drug levels',
        frequency: 'Daily during hospitalization, then at follow-up',
        action: 'Dose adjustment for therapeutic range',
      },
      {
        item: 'Vital signs and neurological checks',
        frequency: 'Q1-4 hours based on acuity',
        action: 'Escalate care if deterioration',
      },
    ],
  },

  'Multiple Sclerosis - New Diagnosis': {
    id: 'ms-new-diagnosis',
    title: 'Multiple Sclerosis - New Diagnosis',
    icd10: ['G35'],
    scope: 'Initial evaluation and management of newly diagnosed multiple sclerosis',
    notes: [
      'Early initiation of disease-modifying therapy (DMT) is recommended',
      'Higher efficacy therapies may be preferred for active disease',
      'Comprehensive baseline evaluation is essential before starting DMT',
    ],
    sections: {
      'Laboratory Workup': {
        'Baseline Labs (Pre-DMT)': [
          { item: 'CBC with differential', priority: 'ROUTINE', rationale: 'Baseline for DMT monitoring' },
          { item: 'CMP', priority: 'ROUTINE', rationale: 'Renal/hepatic function baseline' },
          { item: 'LFTs', priority: 'ROUTINE', rationale: 'Many DMTs require hepatic monitoring' },
          { item: 'TSH', priority: 'ROUTINE', rationale: 'Thyroid dysfunction can mimic MS symptoms' },
          { item: 'Vitamin D, 25-OH', priority: 'ROUTINE', rationale: 'Deficiency common in MS, supplementation recommended' },
          { item: 'B12 level', priority: 'ROUTINE', rationale: 'B12 deficiency can cause similar symptoms' },
        ],
        'Infectious Disease Screening': [
          { item: 'JC virus antibody index', priority: 'ROUTINE', rationale: 'PML risk stratification for natalizumab' },
          { item: 'Hepatitis B surface antigen, core antibody', priority: 'ROUTINE', rationale: 'Reactivation risk with some DMTs' },
          { item: 'Hepatitis C antibody', priority: 'ROUTINE', rationale: 'Baseline screening' },
          { item: 'HIV 1/2 antibody', priority: 'ROUTINE', rationale: 'Immunosuppression considerations' },
          { item: 'Varicella zoster IgG', priority: 'ROUTINE', rationale: 'Vaccination if seronegative before certain DMTs' },
          { item: 'Quantiferon-TB Gold', priority: 'ROUTINE', rationale: 'TB screening before immunosuppression' },
        ],
        'Additional Testing': [
          { item: 'ANA, anti-dsDNA', priority: 'ROUTINE', rationale: 'Rule out lupus/connective tissue disease' },
          { item: 'NMO-IgG (aquaporin-4 antibody)', priority: 'ROUTINE', rationale: 'Distinguish NMOSD from MS' },
          { item: 'MOG antibody', priority: 'ROUTINE', rationale: 'MOGAD differential diagnosis' },
          { item: 'Pregnancy test', priority: 'ROUTINE', indication: 'Women of childbearing potential before DMT' },
        ],
      },
      'Imaging & Studies': {
        'Baseline MRI': [
          { item: 'MRI brain with/without contrast', priority: 'ROUTINE', timing: 'At diagnosis', target: 'Lesion burden, enhancement pattern' },
          { item: 'MRI cervical spine with/without contrast', priority: 'ROUTINE', timing: 'At diagnosis', target: 'Spinal cord lesions' },
          { item: 'MRI thoracic spine with/without contrast', priority: 'ROUTINE', indication: 'If symptoms suggest thoracic involvement' },
        ],
        'Other Studies': [
          { item: 'OCT (optical coherence tomography)', priority: 'ROUTINE', rationale: 'Baseline retinal nerve fiber layer thickness' },
          { item: 'Visual evoked potentials', priority: 'ROUTINE', indication: 'If optic neuritis history or visual symptoms' },
        ],
      },
      'Treatment': {
        'Platform/Moderate Efficacy DMTs': [
          {
            item: 'Dimethyl fumarate (Tecfidera)',
            priority: 'ROUTINE',
            dosing: '120 mg BID × 7 days, then 240 mg BID',
            rationale: 'Oral, moderate efficacy',
            monitoring: 'CBC q6 months, LFTs',
            contraindications: 'GI side effects common initially'
          },
          {
            item: 'Teriflunomide (Aubagio)',
            priority: 'ROUTINE',
            dosing: '7 or 14 mg daily',
            rationale: 'Oral, once daily',
            monitoring: 'LFTs monthly × 6 months, then periodically',
            contraindications: 'Pregnancy (teratogenic), liver disease'
          },
          {
            item: 'Glatiramer acetate (Copaxone)',
            priority: 'ROUTINE',
            dosing: '20 mg SC daily or 40 mg SC 3x/week',
            rationale: 'Injectable, pregnancy-compatible',
            monitoring: 'Injection site reactions'
          },
        ],
        'Higher Efficacy DMTs': [
          {
            item: 'Ocrelizumab (Ocrevus)',
            priority: 'ROUTINE',
            dosing: '300 mg IV × 2 doses 2 weeks apart, then 600 mg IV q6 months',
            rationale: 'High efficacy, convenient dosing',
            monitoring: 'Infusion reactions, infections, Hep B monitoring'
          },
          {
            item: 'Natalizumab (Tysabri)',
            priority: 'ROUTINE',
            dosing: '300 mg IV q4 weeks',
            rationale: 'High efficacy for active disease',
            monitoring: 'JCV antibody index q6 months',
            contraindications: 'PML risk if JCV positive'
          },
          {
            item: 'Ofatumumab (Kesimpta)',
            priority: 'ROUTINE',
            dosing: '20 mg SC weekly × 3, then monthly',
            rationale: 'High efficacy, self-administered',
            monitoring: 'Infections, Hep B monitoring'
          },
        ],
        'Symptomatic Management': [
          { item: 'Vitamin D3 supplementation', priority: 'ROUTINE', dosing: '2000-5000 IU daily', rationale: 'Target level >40 ng/mL' },
          { item: 'Fatigue management', priority: 'ROUTINE', rationale: 'Amantadine 100 mg BID or modafinil' },
          { item: 'Spasticity management', priority: 'ROUTINE', rationale: 'Baclofen, tizanidine as needed' },
        ],
      },
      'Referrals & Follow-up': {
        'Essential': [
          { item: 'MS specialist/Neurologist follow-up', priority: 'ROUTINE', timing: '4-6 weeks after DMT initiation' },
          { item: 'MS nurse coordinator', priority: 'ROUTINE', rationale: 'Patient education, DMT support' },
        ],
        'Additional': [
          { item: 'Neuro-ophthalmology', priority: 'ROUTINE', indication: 'Visual symptoms, optic neuritis' },
          { item: 'Physical therapy', priority: 'ROUTINE', indication: 'Gait/balance issues, weakness' },
          { item: 'Occupational therapy', priority: 'ROUTINE', indication: 'Fine motor difficulties, fatigue management' },
          { item: 'Urology', priority: 'ROUTINE', indication: 'Bladder dysfunction' },
          { item: 'Psychiatry/Psychology', priority: 'ROUTINE', indication: 'Depression, anxiety, cognitive concerns' },
        ],
      },
    },
    patientInstructions: [
      'MS is a chronic condition but highly treatable - early treatment is key',
      'Take DMT exactly as prescribed - adherence is crucial for preventing relapses',
      'Report new or worsening symptoms promptly - may indicate relapse',
      'Maintain regular follow-up and MRI surveillance',
      'Healthy lifestyle: regular exercise, adequate sleep, stress management',
      'Avoid smoking - associated with worse MS outcomes',
      'Discuss pregnancy planning with your neurologist before conception',
      'Stay up-to-date on vaccinations (live vaccines may be contraindicated with some DMTs)',
    ],
    referrals: ['MS specialist', 'Neuro-ophthalmology', 'Physical therapy', 'Occupational therapy'],
  },

  'Peripheral Neuropathy - New Diagnosis/Evaluation': {
    id: 'peripheral-neuropathy',
    title: 'Peripheral Neuropathy - New Diagnosis/Evaluation',
    icd10: ['G62.9', 'G60.9', 'G62.0', 'G63'],
    scope: 'Evaluation and management of newly diagnosed peripheral neuropathy',
    notes: [
      'Identify treatable causes: diabetes, B12 deficiency, thyroid, etc.',
      'Electrodiagnostic studies help characterize neuropathy type',
      'Symptomatic treatment for neuropathic pain is important for quality of life',
    ],
    sections: {
      'Laboratory Workup': {
        'Essential Labs': [
          { item: 'Fasting glucose / HbA1c', priority: 'ROUTINE', rationale: 'Diabetes is most common cause' },
          { item: 'CBC with differential', priority: 'ROUTINE', rationale: 'Hematologic disorders, B12 deficiency' },
          { item: 'CMP', priority: 'ROUTINE', rationale: 'Renal dysfunction, electrolytes' },
          { item: 'TSH', priority: 'ROUTINE', rationale: 'Hypothyroidism can cause neuropathy' },
          { item: 'Vitamin B12 level', priority: 'ROUTINE', rationale: 'Deficiency causes sensory neuropathy' },
          { item: 'Methylmalonic acid (MMA)', priority: 'ROUTINE', rationale: 'Functional B12 deficiency even if B12 normal' },
          { item: 'Folate level', priority: 'ROUTINE', rationale: 'Deficiency can contribute' },
          { item: 'Vitamin B6 level', priority: 'ROUTINE', rationale: 'Both deficiency and toxicity cause neuropathy' },
        ],
        'Extended Workup': [
          { item: 'SPEP/UPEP with immunofixation', priority: 'ROUTINE', rationale: 'Monoclonal gammopathy (MGUS, myeloma)' },
          { item: 'Hepatitis B and C serologies', priority: 'ROUTINE', rationale: 'Associated with neuropathy' },
          { item: 'HIV antibody', priority: 'ROUTINE', rationale: 'HIV-associated neuropathy' },
          { item: 'ESR, CRP', priority: 'ROUTINE', rationale: 'Inflammatory/vasculitic neuropathy' },
          { item: 'ANA', priority: 'ROUTINE', rationale: 'Connective tissue disease screening' },
          { item: 'Vitamin E level', priority: 'EXT', rationale: 'Deficiency can cause neuropathy' },
          { item: 'Copper level', priority: 'EXT', rationale: 'Deficiency (often from zinc excess)' },
        ],
        'If Specific Etiology Suspected': [
          { item: 'Anti-GM1, anti-MAG antibodies', priority: 'EXT', indication: 'Motor predominant, CIDP suspected' },
          { item: 'Ganglioside antibody panel', priority: 'EXT', indication: 'GBS/CIDP evaluation' },
          { item: 'Genetic testing for hereditary neuropathy', priority: 'EXT', indication: 'Family history, early onset, CMT suspected' },
          { item: 'Heavy metal screen', priority: 'EXT', indication: 'Occupational exposure suspected' },
          { item: 'Paraneoplastic panel', priority: 'EXT', indication: 'Subacute onset, malignancy suspected' },
        ],
      },
      'Imaging & Studies': {
        'Electrodiagnostic Studies': [
          { item: 'EMG/Nerve conduction studies', priority: 'ROUTINE', timing: 'Within 2-4 weeks', target: 'Characterize neuropathy type: axonal vs demyelinating, sensory vs motor vs mixed' },
        ],
        'Imaging': [
          { item: 'MRI spine', priority: 'ROUTINE', indication: 'If radiculopathy suspected, myelopathy concern' },
          { item: 'MRI brachial/lumbosacral plexus', priority: 'EXT', indication: 'Plexopathy, infiltrative process' },
        ],
        'Additional Testing': [
          { item: 'Skin biopsy (epidermal nerve fiber density)', priority: 'EXT', indication: 'Small fiber neuropathy suspected, normal NCS' },
          { item: 'Nerve biopsy', priority: 'EXT', indication: 'Vasculitic neuropathy, amyloid, specific diagnosis needed' },
          { item: 'Lumbar puncture', priority: 'EXT', indication: 'CIDP suspected, inflammatory neuropathy' },
        ],
      },
      'Treatment': {
        'Treat Underlying Cause': [
          { item: 'Optimize glycemic control', priority: 'ROUTINE', indication: 'Diabetic neuropathy', target: 'HbA1c <7%' },
          { item: 'B12 supplementation', priority: 'ROUTINE', dosing: '1000 mcg IM weekly × 4, then monthly; or 1000-2000 mcg PO daily', indication: 'B12 deficiency' },
          { item: 'Thyroid replacement', priority: 'ROUTINE', indication: 'Hypothyroidism' },
        ],
        'Neuropathic Pain Management - First Line': [
          {
            item: 'Gabapentin (Neurontin)',
            priority: 'ROUTINE',
            dosing: 'Start 100-300 mg TID; titrate to 300-1200 mg TID; max 3600 mg/day',
            rationale: 'First-line for neuropathic pain',
            monitoring: 'Sedation, dizziness, peripheral edema'
          },
          {
            item: 'Pregabalin (Lyrica)',
            priority: 'ROUTINE',
            dosing: 'Start 75 mg BID; titrate to 150-300 mg BID; max 600 mg/day',
            rationale: 'Similar to gabapentin, BID dosing',
            monitoring: 'Sedation, weight gain, edema'
          },
          {
            item: 'Duloxetine (Cymbalta)',
            priority: 'ROUTINE',
            dosing: 'Start 30 mg daily × 1 week, then 60 mg daily; max 120 mg/day',
            rationale: 'SNRI, also helps depression/anxiety',
            monitoring: 'Nausea, discontinuation syndrome',
            contraindications: 'Liver disease, uncontrolled glaucoma'
          },
        ],
        'Second Line Options': [
          {
            item: 'Amitriptyline',
            priority: 'ROUTINE',
            dosing: 'Start 10-25 mg at bedtime; titrate to 50-150 mg',
            rationale: 'TCA, helps with sleep',
            monitoring: 'Anticholinergic effects, ECG if cardiac history',
            contraindications: 'Cardiac conduction abnormalities, glaucoma, urinary retention'
          },
          {
            item: 'Nortriptyline',
            priority: 'ROUTINE',
            dosing: 'Start 10-25 mg at bedtime; titrate to 50-150 mg',
            rationale: 'TCA with fewer anticholinergic effects than amitriptyline'
          },
          {
            item: 'Venlafaxine XR',
            priority: 'ROUTINE',
            dosing: 'Start 37.5-75 mg daily; titrate to 150-225 mg daily',
            rationale: 'SNRI alternative to duloxetine'
          },
        ],
        'Topical Therapies': [
          { item: 'Lidocaine 5% patch', priority: 'ROUTINE', dosing: 'Apply to painful area 12 hours on/12 hours off', rationale: 'Focal neuropathic pain' },
          { item: 'Capsaicin 8% patch', priority: 'EXT', dosing: 'Applied in clinic setting', indication: 'Refractory focal pain' },
        ],
      },
      'Referrals & Follow-up': {
        'Essential': [
          { item: 'Neurology follow-up', priority: 'ROUTINE', timing: '4-6 weeks after workup' },
          { item: 'Podiatry', priority: 'ROUTINE', indication: 'Diabetic neuropathy - foot care education' },
        ],
        'Additional': [
          { item: 'Endocrinology', priority: 'ROUTINE', indication: 'Diabetes management optimization' },
          { item: 'Pain management', priority: 'ROUTINE', indication: 'Refractory neuropathic pain' },
          { item: 'Physical therapy', priority: 'ROUTINE', indication: 'Balance issues, gait instability, weakness' },
          { item: 'Hematology/Oncology', priority: 'EXT', indication: 'Monoclonal gammopathy identified' },
        ],
      },
    },
    patientInstructions: [
      'Good foot care is essential - inspect feet daily for cuts, blisters, sores',
      'Wear well-fitting, protective footwear',
      'Control blood sugar if diabetic - this can prevent progression',
      'Avoid alcohol which can worsen neuropathy',
      'Report worsening weakness or rapid progression promptly',
      'Balance exercises to prevent falls',
      'Keep medications consistent - pain medications take time to work',
      'B12 supplementation if deficient - improvement may take months',
    ],
    referrals: ['Neurology', 'Podiatry', 'Pain management', 'Physical therapy'],
  },

  'Acute Ischemic Stroke': {
    id: 'acute-ischemic-stroke',
    title: 'Acute Ischemic Stroke - Outpatient Follow-up',
    icd10: ['I63.9', 'I63.50', 'I63.30'],
    scope: 'Outpatient secondary prevention and rehabilitation after acute ischemic stroke',
    notes: [
      'Secondary prevention is critical - stroke recurrence risk is highest early',
      'Risk factor modification is cornerstone of management',
      'Rehabilitation services improve functional outcomes',
    ],
    sections: {
      'Laboratory Workup': {
        'Routine Monitoring': [
          { item: 'Lipid panel (fasting)', priority: 'ROUTINE', timing: '6-8 weeks after statin initiation', target: 'LDL <70 mg/dL' },
          { item: 'HbA1c', priority: 'ROUTINE', timing: 'Every 3 months if diabetic', target: '<7%' },
          { item: 'CMP', priority: 'ROUTINE', rationale: 'Renal function for medication dosing' },
          { item: 'CBC', priority: 'ROUTINE', rationale: 'Baseline, antiplatelet therapy monitoring' },
          { item: 'PT/INR', priority: 'ROUTINE', indication: 'If on warfarin - weekly until stable, then monthly' },
        ],
        'If Etiology Undetermined': [
          { item: 'Hypercoagulable workup', priority: 'EXT', indication: 'Young stroke, cryptogenic, VTE history', rationale: 'Protein C/S, antithrombin, Factor V Leiden, prothrombin mutation, antiphospholipid antibodies' },
          { item: 'Hemoglobin electrophoresis', priority: 'EXT', indication: 'African American patients, young stroke' },
        ],
      },
      'Imaging & Studies': {
        'Cardiac Evaluation': [
          { item: 'Echocardiogram (TTE or TEE)', priority: 'ROUTINE', indication: 'If not done during hospitalization', target: 'PFO, thrombus, valvular disease' },
          { item: 'Cardiac monitoring (Holter or event monitor)', priority: 'ROUTINE', timing: '30 days if cryptogenic', target: 'Occult atrial fibrillation' },
          { item: 'Implantable loop recorder', priority: 'EXT', indication: 'Cryptogenic stroke, high suspicion for AFib' },
        ],
        'Vascular Imaging': [
          { item: 'Carotid duplex ultrasound', priority: 'ROUTINE', timing: 'If not done, or follow-up for known stenosis' },
          { item: 'CTA or MRA head/neck', priority: 'ROUTINE', indication: 'Evaluate for stenosis, dissection' },
        ],
        'Follow-up Brain Imaging': [
          { item: 'MRI brain follow-up', priority: 'ROUTINE', timing: '3-6 months', indication: 'Document final infarct, assess for new lesions' },
        ],
      },
      'Treatment': {
        'Antiplatelet Therapy': [
          {
            item: 'Aspirin',
            priority: 'ROUTINE',
            dosing: '81-325 mg daily (81 mg preferred long-term)',
            rationale: 'First-line secondary prevention',
            contraindications: 'GI bleeding, true aspirin allergy'
          },
          {
            item: 'Clopidogrel (Plavix)',
            priority: 'ROUTINE',
            dosing: '75 mg daily',
            rationale: 'Alternative to aspirin, or add to aspirin short-term (DAPT)',
            indication: 'Aspirin intolerance, or DAPT for 21-90 days post-minor stroke/TIA'
          },
          {
            item: 'Aspirin + Clopidogrel (DAPT)',
            priority: 'ROUTINE',
            dosing: 'Aspirin 81 mg + Clopidogrel 75 mg daily × 21-90 days',
            indication: 'Minor stroke (NIHSS ≤3) or high-risk TIA',
            rationale: 'POINT and CHANCE trials showed benefit'
          },
        ],
        'Anticoagulation (if AFib/cardioembolic)': [
          {
            item: 'Apixaban (Eliquis)',
            priority: 'ROUTINE',
            dosing: '5 mg BID (2.5 mg BID if criteria met)',
            rationale: 'Preferred DOAC for AFib-related stroke',
            monitoring: 'Renal function'
          },
          {
            item: 'Rivaroxaban (Xarelto)',
            priority: 'ROUTINE',
            dosing: '20 mg daily with evening meal (15 mg if CrCl 15-50)',
            rationale: 'Once-daily DOAC option'
          },
          {
            item: 'Warfarin',
            priority: 'ROUTINE',
            dosing: 'Target INR 2-3',
            indication: 'Mechanical heart valve, severe renal impairment',
            monitoring: 'INR weekly until stable, then monthly'
          },
        ],
        'Risk Factor Management': [
          {
            item: 'High-intensity statin',
            priority: 'ROUTINE',
            dosing: 'Atorvastatin 40-80 mg or Rosuvastatin 20-40 mg daily',
            target: 'LDL <70 mg/dL',
            rationale: 'Reduces stroke recurrence regardless of baseline LDL'
          },
          {
            item: 'Blood pressure management',
            priority: 'ROUTINE',
            target: '<130/80 mmHg (individualized)',
            rationale: 'Most important modifiable risk factor'
          },
          {
            item: 'Diabetes management',
            priority: 'ROUTINE',
            target: 'HbA1c <7%',
            indication: 'Diabetic patients'
          },
        ],
        'Neuroprotection': [
          { item: 'Smoking cessation', priority: 'ROUTINE', rationale: 'Doubles stroke risk - cessation critical' },
          { item: 'Limit alcohol', priority: 'ROUTINE', rationale: 'Moderate consumption only (if any)' },
        ],
      },
      'Referrals & Follow-up': {
        'Essential': [
          { item: 'Neurology/Stroke follow-up', priority: 'ROUTINE', timing: '2-4 weeks post-discharge' },
          { item: 'Primary care follow-up', priority: 'ROUTINE', timing: '1-2 weeks', rationale: 'BP, diabetes, medication management' },
        ],
        'Rehabilitation': [
          { item: 'Physical therapy', priority: 'ROUTINE', indication: 'Motor deficits, gait impairment, balance' },
          { item: 'Occupational therapy', priority: 'ROUTINE', indication: 'ADL limitations, fine motor, cognitive' },
          { item: 'Speech therapy', priority: 'ROUTINE', indication: 'Aphasia, dysarthria, dysphagia' },
        ],
        'Specialized': [
          { item: 'Cardiology', priority: 'ROUTINE', indication: 'AFib management, PFO closure evaluation' },
          { item: 'Vascular surgery', priority: 'ROUTINE', indication: 'Carotid stenosis >50% symptomatic' },
          { item: 'Neuropsychology', priority: 'ROUTINE', indication: 'Cognitive deficits, return-to-work evaluation' },
          { item: 'Driving evaluation', priority: 'ROUTINE', indication: 'Before resuming driving' },
        ],
      },
    },
    patientInstructions: [
      'Take all medications exactly as prescribed - these prevent another stroke',
      'Know stroke warning signs (FAST): Face drooping, Arm weakness, Speech difficulty, Time to call 911',
      'Seek immediate medical attention for any new stroke symptoms',
      'Control blood pressure - check regularly, take medications daily',
      'If diabetic, monitor blood sugar and maintain good control',
      'STOP SMOKING - this is critical for stroke prevention',
      'Limit alcohol consumption',
      'Heart-healthy diet: low sodium, increase fruits/vegetables, limit saturated fats',
      'Regular exercise as tolerated and approved by your doctor',
      'Do NOT drive until cleared by your neurologist',
      'Attend all rehabilitation therapy sessions',
      'Depression is common after stroke - report mood changes',
    ],
    referrals: ['Neurology/Stroke', 'Cardiology', 'Physical therapy', 'Occupational therapy', 'Speech therapy'],
  },
}

// Helper functions
export function getPlanById(id: string): ClinicalPlan | undefined {
  return Object.values(OUTPATIENT_PLANS).find(plan => plan.id === id)
}

export function getPlanByTitle(title: string): ClinicalPlan | undefined {
  return OUTPATIENT_PLANS[title]
}

export function getAllPlanTitles(): string[] {
  return Object.keys(OUTPATIENT_PLANS)
}

export function searchPlans(query: string): ClinicalPlan[] {
  const lowerQuery = query.toLowerCase()
  return Object.values(OUTPATIENT_PLANS).filter(plan =>
    plan.title.toLowerCase().includes(lowerQuery) ||
    plan.icd10.some(code => code.toLowerCase().includes(lowerQuery)) ||
    plan.scope.toLowerCase().includes(lowerQuery)
  )
}
