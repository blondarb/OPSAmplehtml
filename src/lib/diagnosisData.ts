// Neurology Diagnosis Data Structure
// 134 diagnoses across 15 categories with ICD-10 codes
// Based on neuro-plans clinical decision support templates

export interface Diagnosis {
  id: string
  name: string
  icd10: string
  category: string
  alternateIcd10?: { code: string; description: string }[] // For refinement options
  hasSmartPlan?: boolean // Whether a clinical decision support plan exists
}

export interface DiagnosisCategory {
  id: string
  name: string
  icon: string
  diagnoses: Diagnosis[]
}

// Map from Reason for Consult sub-options to diagnosis IDs
// This enables auto-population of differential diagnosis
export const CONSULT_TO_DIAGNOSIS_MAP: Record<string, string[]> = {
  // Headache category
  'Migraine': ['migraine-unspecified', 'migraine-with-aura', 'migraine-without-aura'],
  'Chronic migraine': ['chronic-migraine'],
  'Tension headache': ['tension-headache'],
  'New headache': ['headache-evaluation'],
  'Thunderclap headache': ['thunderclap-headache'],
  'Cluster headache': ['cluster-headache'],
  'Medication overuse headache': ['medication-overuse-headache'],
  'Post-traumatic headache': ['post-concussion-syndrome'],
  'New daily persistent headache': ['new-daily-persistent-headache'],
  'Facial pain/Trigeminal neuralgia': ['trigeminal-neuralgia'],

  // Movement category
  'Parkinson disease': ['parkinsons-new', 'parkinsons-management'],
  'Essential tremor': ['essential-tremor'],
  'Restless legs syndrome': ['restless-legs-syndrome'],
  'Dystonia': ['dystonia'],
  'Tics/Tourette syndrome': ['tics-tourette'],
  'Huntington disease': ['huntingtons-disease'],
  'Ataxia': ['ataxia-evaluation'],
  'Chorea': ['chorea-evaluation'],
  'Drug-induced movement disorder': ['drug-induced-parkinsonism', 'tardive-dyskinesia'],
  'Gait disorder': ['gait-disorder-evaluation'],

  // Seizure category
  'Epilepsy': ['epilepsy-management'],
  'New onset seizure': ['new-onset-seizure'],
  'Breakthrough seizures': ['breakthrough-seizure'],
  'Seizure medication adjustment': ['epilepsy-management'],
  'Spell vs seizure evaluation': ['pnes', 'syncope-evaluation'],
  'Syncope vs seizure': ['syncope-evaluation'],
  'Status epilepticus follow-up': ['status-epilepticus'],

  // Cognitive category
  'Memory loss': ['dementia-evaluation', 'mci'],
  'Dementia evaluation': ['dementia-evaluation'],
  'Mild cognitive impairment': ['mci'],
  'Alzheimer disease': ['alzheimers-disease'],
  'Frontotemporal dementia': ['frontotemporal-dementia'],
  'Lewy body dementia': ['lewy-body-dementia'],
  'Vascular dementia': ['vascular-dementia'],
  'Delirium/Encephalopathy': ['delirium-vs-dementia', 'autoimmune-encephalitis'],
  'Capacity evaluation': ['dementia-evaluation'],

  // Neuromuscular category
  'Peripheral neuropathy': ['peripheral-neuropathy'],
  'Carpal tunnel syndrome': ['carpal-tunnel'],
  'Radiculopathy': ['radiculopathy'],
  'Myasthenia gravis': ['myasthenia-new', 'myasthenia-exacerbation'],
  'ALS/Motor neuron disease': ['als'],
  'Myopathy': ['inflammatory-myopathy'],
  'Plexopathy': ['plexopathy'],
  'CIDP': ['cidp'],
  'Guillain-Barré syndrome': ['gbs'],
  'Small fiber neuropathy': ['small-fiber-neuropathy'],

  // MS & Neuroimmunology category
  'Multiple sclerosis': ['ms-new-diagnosis', 'ms-chronic-management'],
  'MS follow-up': ['ms-chronic-management'],
  'Suspected demyelination': ['ms-new-diagnosis', 'transverse-myelitis', 'optic-neuritis'],
  'Optic neuritis': ['optic-neuritis'],
  'Transverse myelitis': ['transverse-myelitis'],
  'NMOSD': ['nmo'],
  'MOGAD': ['mog-antibody-disease'],
  'Autoimmune encephalitis': ['autoimmune-encephalitis'],

  // Cerebrovascular category
  'Stroke follow-up': ['post-stroke-management'],
  'TIA evaluation': ['tia'],
  'Stroke prevention': ['post-stroke-management'],
  'Carotid stenosis': ['carotid-stenosis'],
  'Post-thrombolysis follow-up': ['acute-ischemic-stroke'],
  'Post-thrombectomy follow-up': ['acute-ischemic-stroke'],
  'ICH follow-up': ['ich'],
  'SAH follow-up': ['sah'],
  'Cerebral venous thrombosis': ['cvt'],

  // Sleep category
  'Insomnia': ['insomnia'],
  'Excessive daytime sleepiness': ['narcolepsy', 'sleep-apnea'],
  'Narcolepsy': ['narcolepsy'],
  'Sleep apnea evaluation': ['sleep-apnea'],
  'REM sleep behavior disorder': ['rem-sleep-behavior'],
  'Parasomnia': ['parasomnia'],

  // Other category
  'Dizziness/Vertigo': ['vertigo-evaluation'],
  'Numbness/Tingling': ['peripheral-neuropathy', 'small-fiber-neuropathy'],
  'Weakness': ['diffuse-weakness'],
  'Second opinion': [],
  'Back pain with neuro symptoms': ['radiculopathy', 'myelopathy-evaluation'],
  'Concussion/Post-concussion syndrome': ['post-concussion-syndrome', 'tbi'],
  'Bell palsy': ['bells-palsy'],
  'Abnormal imaging finding': [],
  'Syncope evaluation': ['syncope-evaluation'],
  'Tinnitus': ['tinnitus-evaluation'],
  'Other': [],
}

export const DIAGNOSIS_CATEGORIES: DiagnosisCategory[] = [
  {
    id: 'seizure-epilepsy',
    name: 'Seizure & Epilepsy',
    icon: '⚡',
    diagnoses: [
      { id: 'new-onset-seizure', name: 'New Onset Seizure', icd10: 'R56.9', category: 'seizure-epilepsy', hasSmartPlan: true },
      { id: 'status-epilepticus', name: 'Status Epilepticus', icd10: 'G41.9', category: 'seizure-epilepsy', hasSmartPlan: true },
      { id: 'breakthrough-seizure', name: 'Breakthrough Seizure', icd10: 'G40.909', category: 'seizure-epilepsy', hasSmartPlan: true },
      { id: 'ncse', name: 'Non-Convulsive Status Epilepticus', icd10: 'G41.0', category: 'seizure-epilepsy' },
      { id: 'alcohol-withdrawal-seizure', name: 'Alcohol Withdrawal Seizure', icd10: 'G40.509', category: 'seizure-epilepsy' },
      { id: 'eclampsia-seizure', name: 'Eclampsia/Seizure in Pregnancy', icd10: 'O15.9', category: 'seizure-epilepsy' },
      { id: 'drug-resistant-epilepsy', name: 'Drug-Resistant Epilepsy', icd10: 'G40.919', category: 'seizure-epilepsy' },
      { id: 'epilepsy-management', name: 'Epilepsy - Chronic Management', icd10: 'G40.909', category: 'seizure-epilepsy' },
    ],
  },
  {
    id: 'stroke-cerebrovascular',
    name: 'Stroke & Cerebrovascular',
    icon: '🫀',
    diagnoses: [
      { id: 'acute-ischemic-stroke', name: 'Acute Ischemic Stroke', icd10: 'I63.9', category: 'stroke-cerebrovascular', hasSmartPlan: true },
      { id: 'ich', name: 'Intracerebral Hemorrhage', icd10: 'I61.9', category: 'stroke-cerebrovascular' },
      { id: 'sah', name: 'Subarachnoid Hemorrhage', icd10: 'I60.9', category: 'stroke-cerebrovascular' },
      { id: 'tia', name: 'Transient Ischemic Attack', icd10: 'G45.9', category: 'stroke-cerebrovascular' },
      { id: 'cvt', name: 'Cerebral Venous Thrombosis', icd10: 'I67.6', category: 'stroke-cerebrovascular' },
      { id: 'carotid-dissection', name: 'Carotid/Vertebral Artery Dissection', icd10: 'I77.71', category: 'stroke-cerebrovascular' },
      { id: 'pres', name: 'Posterior Reversible Encephalopathy', icd10: 'G93.49', category: 'stroke-cerebrovascular' },
      { id: 'rcvs', name: 'Reversible Cerebral Vasoconstriction', icd10: 'I67.841', category: 'stroke-cerebrovascular' },
      { id: 'cns-vasculitis', name: 'CNS Vasculitis', icd10: 'I67.7', category: 'stroke-cerebrovascular' },
      { id: 'moyamoya', name: 'Moyamoya Disease', icd10: 'I67.5', category: 'stroke-cerebrovascular' },
      { id: 'post-stroke-management', name: 'Post-Stroke Management', icd10: 'I69.30', category: 'stroke-cerebrovascular' },
      { id: 'carotid-stenosis', name: 'Carotid Stenosis', icd10: 'I65.29', category: 'stroke-cerebrovascular' },
    ],
  },
  {
    id: 'headache',
    name: 'Headache',
    icon: '🧠',
    diagnoses: [
      { id: 'headache-evaluation', name: 'Headache Evaluation', icd10: 'R51.9', category: 'headache' },
      { id: 'migraine-unspecified', name: 'Migraine, unspecified', icd10: 'G43.909', category: 'headache',
        alternateIcd10: [
          { code: 'G43.909', description: 'Migraine, unspecified, not intractable' },
          { code: 'G43.919', description: 'Migraine, unspecified, intractable' },
        ]
      },
      { id: 'migraine-with-aura', name: 'Migraine with aura', icd10: 'G43.109', category: 'headache' },
      { id: 'migraine-without-aura', name: 'Migraine without aura', icd10: 'G43.009', category: 'headache' },
      { id: 'chronic-migraine', name: 'Chronic Migraine', icd10: 'G43.709', category: 'headache' },
      { id: 'status-migrainosus', name: 'Status Migrainosus', icd10: 'G43.901', category: 'headache' },
      { id: 'cluster-headache', name: 'Cluster Headache', icd10: 'G44.009', category: 'headache' },
      { id: 'tension-headache', name: 'Tension-type Headache', icd10: 'G44.209', category: 'headache' },
      { id: 'medication-overuse-headache', name: 'Medication Overuse Headache', icd10: 'G44.41', category: 'headache' },
      { id: 'iih', name: 'Idiopathic Intracranial Hypertension', icd10: 'G93.2', category: 'headache' },
      { id: 'low-pressure-headache', name: 'Low Pressure Headache/SIH', icd10: 'G96.00', category: 'headache' },
      { id: 'trigeminal-neuralgia', name: 'Trigeminal Neuralgia', icd10: 'G50.0', category: 'headache' },
      { id: 'new-daily-persistent-headache', name: 'New Daily Persistent Headache', icd10: 'G44.52', category: 'headache' },
      { id: 'thunderclap-headache', name: 'Thunderclap Headache Evaluation', icd10: 'R51.9', category: 'headache' },
      { id: 'gca', name: 'Giant Cell Arteritis', icd10: 'M31.6', category: 'headache' },
    ],
  },
  {
    id: 'demyelinating',
    name: 'Demyelinating Diseases',
    icon: '🧬',
    diagnoses: [
      { id: 'ms-exacerbation', name: 'MS Exacerbation', icd10: 'G35', category: 'demyelinating' },
      { id: 'ms-new-diagnosis', name: 'MS - New Diagnosis', icd10: 'G35', category: 'demyelinating', hasSmartPlan: true },
      { id: 'ms-chronic-management', name: 'MS - Chronic Management', icd10: 'G35', category: 'demyelinating' },
      { id: 'nmo', name: 'Neuromyelitis Optica', icd10: 'G36.0', category: 'demyelinating' },
      { id: 'mog-antibody-disease', name: 'MOG Antibody Disease', icd10: 'G36.9', category: 'demyelinating' },
      { id: 'transverse-myelitis', name: 'Transverse Myelitis', icd10: 'G37.3', category: 'demyelinating' },
      { id: 'optic-neuritis', name: 'Optic Neuritis', icd10: 'H46.9', category: 'demyelinating' },
      { id: 'adem', name: 'Acute Disseminated Encephalomyelitis', icd10: 'G04.81', category: 'demyelinating' },
      { id: 'pml', name: 'Progressive Multifocal Leukoencephalopathy', icd10: 'A81.2', category: 'demyelinating' },
    ],
  },
  {
    id: 'neuromuscular',
    name: 'Neuromuscular Disorders',
    icon: '💪',
    diagnoses: [
      { id: 'diffuse-weakness', name: 'Diffuse Weakness', icd10: 'R53.1', category: 'neuromuscular' },
      { id: 'gbs', name: 'Guillain-Barré Syndrome', icd10: 'G61.0', category: 'neuromuscular' },
      { id: 'myasthenia-exacerbation', name: 'Myasthenia Gravis - Exacerbation/Crisis', icd10: 'G70.01', category: 'neuromuscular' },
      { id: 'myasthenia-new', name: 'Myasthenia Gravis - New Diagnosis', icd10: 'G70.00', category: 'neuromuscular' },
      { id: 'myasthenia-chronic', name: 'Myasthenia Gravis - Chronic Management', icd10: 'G70.00', category: 'neuromuscular' },
      { id: 'cidp', name: 'CIDP', icd10: 'G61.81', category: 'neuromuscular' },
      { id: 'als', name: 'Amyotrophic Lateral Sclerosis', icd10: 'G12.21', category: 'neuromuscular' },
      { id: 'lems', name: 'Lambert-Eaton Myasthenic Syndrome', icd10: 'G73.1', category: 'neuromuscular' },
      { id: 'inflammatory-myopathy', name: 'Inflammatory Myopathy', icd10: 'G72.41', category: 'neuromuscular' },
      { id: 'ibm', name: 'Inclusion Body Myositis', icd10: 'G72.41', category: 'neuromuscular' },
      { id: 'muscular-dystrophy', name: 'Muscular Dystrophy', icd10: 'G71.0', category: 'neuromuscular' },
      { id: 'myotonic-dystrophy', name: 'Myotonic Dystrophy', icd10: 'G71.11', category: 'neuromuscular' },
      { id: 'cim-cin', name: 'Critical Illness Myopathy/Neuropathy', icd10: 'G72.81', category: 'neuromuscular' },
      { id: 'botulism', name: 'Botulism', icd10: 'A05.1', category: 'neuromuscular' },
    ],
  },
  {
    id: 'neuropathy',
    name: 'Neuropathy',
    icon: '🔌',
    diagnoses: [
      { id: 'peripheral-neuropathy', name: 'Peripheral Neuropathy', icd10: 'G62.9', category: 'neuropathy', hasSmartPlan: true },
      { id: 'diabetic-neuropathy', name: 'Diabetic Neuropathy', icd10: 'E11.42', category: 'neuropathy' },
      { id: 'small-fiber-neuropathy', name: 'Small Fiber Neuropathy', icd10: 'G62.9', category: 'neuropathy' },
      { id: 'b12-deficiency-neuropathy', name: 'B12 Deficiency Neuropathy', icd10: 'E53.8', category: 'neuropathy' },
      { id: 'chemo-neuropathy', name: 'Chemotherapy-Induced Neuropathy', icd10: 'G62.0', category: 'neuropathy' },
      { id: 'carpal-tunnel', name: 'Carpal Tunnel Syndrome', icd10: 'G56.00', category: 'neuropathy' },
      { id: 'ulnar-neuropathy', name: 'Ulnar Neuropathy', icd10: 'G56.20', category: 'neuropathy' },
      { id: 'peroneal-neuropathy', name: 'Peroneal Neuropathy', icd10: 'G57.30', category: 'neuropathy' },
      { id: 'mmn', name: 'Multifocal Motor Neuropathy', icd10: 'G61.82', category: 'neuropathy' },
      { id: 'hereditary-neuropathy', name: 'Hereditary Neuropathy', icd10: 'G60.0', category: 'neuropathy' },
      { id: 'vasculitic-neuropathy', name: 'Vasculitic Neuropathy', icd10: 'G63', category: 'neuropathy' },
      { id: 'autonomic-neuropathy', name: 'Autonomic Neuropathy', icd10: 'G90.09', category: 'neuropathy' },
      { id: 'radiculopathy', name: 'Radiculopathy', icd10: 'M54.10', category: 'neuropathy' },
      { id: 'plexopathy', name: 'Plexopathy', icd10: 'G54.0', category: 'neuropathy' },
    ],
  },
  {
    id: 'movement-disorders',
    name: 'Movement Disorders',
    icon: '🧍',
    diagnoses: [
      { id: 'parkinsons-new', name: "Parkinson's Disease - New Diagnosis", icd10: 'G20', category: 'movement-disorders' },
      { id: 'parkinsons-management', name: "Parkinson's Disease - Management", icd10: 'G20', category: 'movement-disorders' },
      { id: 'parkinsons-fluctuations', name: "Parkinson's Disease - Motor Fluctuations", icd10: 'G20', category: 'movement-disorders' },
      { id: 'parkinsons-psychosis', name: "Parkinson's Disease - Psychosis", icd10: 'F06.0', category: 'movement-disorders' },
      { id: 'essential-tremor', name: 'Essential Tremor', icd10: 'G25.0', category: 'movement-disorders' },
      { id: 'dystonia', name: 'Dystonia', icd10: 'G24.9', category: 'movement-disorders' },
      { id: 'huntingtons-disease', name: "Huntington's Disease", icd10: 'G10', category: 'movement-disorders' },
      { id: 'tardive-dyskinesia', name: 'Tardive Dyskinesia', icd10: 'G24.01', category: 'movement-disorders' },
      { id: 'drug-induced-parkinsonism', name: 'Drug-Induced Parkinsonism', icd10: 'G21.11', category: 'movement-disorders' },
      { id: 'wilsons-disease', name: "Wilson's Disease", icd10: 'E83.01', category: 'movement-disorders' },
      { id: 'psp', name: 'Progressive Supranuclear Palsy', icd10: 'G23.1', category: 'movement-disorders' },
      { id: 'msa', name: 'Multiple System Atrophy', icd10: 'G90.3', category: 'movement-disorders' },
      { id: 'cbd', name: 'Corticobasal Degeneration', icd10: 'G31.85', category: 'movement-disorders' },
      { id: 'restless-legs-syndrome', name: 'Restless Legs Syndrome', icd10: 'G25.81', category: 'movement-disorders' },
      { id: 'tics-tourette', name: 'Tics/Tourette Syndrome', icd10: 'F95.2', category: 'movement-disorders' },
      { id: 'ataxia-evaluation', name: 'Ataxia Evaluation', icd10: 'R27.0', category: 'movement-disorders' },
      { id: 'chorea-evaluation', name: 'Chorea Evaluation', icd10: 'G25.5', category: 'movement-disorders' },
      { id: 'gait-disorder-evaluation', name: 'Gait Disorder Evaluation', icd10: 'R26.9', category: 'movement-disorders' },
    ],
  },
  {
    id: 'dementia-cognitive',
    name: 'Dementia & Cognitive Disorders',
    icon: '🧩',
    diagnoses: [
      { id: 'dementia-evaluation', name: 'Dementia Evaluation', icd10: 'R41.81', category: 'dementia-cognitive' },
      { id: 'alzheimers-disease', name: "Alzheimer's Disease", icd10: 'G30.9', category: 'dementia-cognitive' },
      { id: 'vascular-dementia', name: 'Vascular Dementia', icd10: 'F01.50', category: 'dementia-cognitive' },
      { id: 'lewy-body-dementia', name: 'Lewy Body Dementia', icd10: 'G31.83', category: 'dementia-cognitive' },
      { id: 'frontotemporal-dementia', name: 'Frontotemporal Dementia', icd10: 'G31.09', category: 'dementia-cognitive' },
      { id: 'rapidly-progressive-dementia', name: 'Rapidly Progressive Dementia', icd10: 'F03.90', category: 'dementia-cognitive' },
      { id: 'nph', name: 'Normal Pressure Hydrocephalus', icd10: 'G91.2', category: 'dementia-cognitive' },
      { id: 'cjd', name: 'Creutzfeldt-Jakob Disease', icd10: 'A81.00', category: 'dementia-cognitive' },
      { id: 'autoimmune-dementia', name: 'Autoimmune Dementia/Encephalopathy', icd10: 'G04.81', category: 'dementia-cognitive' },
      { id: 'mci', name: 'Mild Cognitive Impairment', icd10: 'G31.84', category: 'dementia-cognitive' },
      { id: 'delirium-vs-dementia', name: 'Delirium vs Dementia', icd10: 'R41.0', category: 'dementia-cognitive' },
      { id: 'wernicke-korsakoff', name: 'Wernicke-Korsakoff Syndrome', icd10: 'F10.96', category: 'dementia-cognitive' },
    ],
  },
  {
    id: 'cns-infections',
    name: 'CNS Infections',
    icon: '🦠',
    diagnoses: [
      { id: 'bacterial-meningitis', name: 'Bacterial Meningitis', icd10: 'G00.9', category: 'cns-infections' },
      { id: 'viral-meningitis', name: 'Viral Meningitis', icd10: 'A87.9', category: 'cns-infections' },
      { id: 'hsv-encephalitis', name: 'HSV Encephalitis', icd10: 'B00.4', category: 'cns-infections' },
      { id: 'autoimmune-encephalitis', name: 'Autoimmune Encephalitis', icd10: 'G04.81', category: 'cns-infections' },
      { id: 'fungal-meningitis', name: 'Fungal Meningitis', icd10: 'G02', category: 'cns-infections' },
      { id: 'tb-meningitis', name: 'TB Meningitis', icd10: 'A17.0', category: 'cns-infections' },
      { id: 'neurocysticercosis', name: 'Neurocysticercosis', icd10: 'B69.0', category: 'cns-infections' },
      { id: 'brain-abscess', name: 'Brain Abscess', icd10: 'G06.0', category: 'cns-infections' },
      { id: 'hiv-neurocognitive', name: 'HIV-Associated Neurocognitive Disorder', icd10: 'B20', category: 'cns-infections' },
      { id: 'neurosyphilis', name: 'Neurosyphilis', icd10: 'A52.3', category: 'cns-infections' },
      { id: 'lyme-neuro', name: 'Lyme Neuroborreliosis', icd10: 'A69.22', category: 'cns-infections' },
    ],
  },
  {
    id: 'neuro-oncology',
    name: 'Neuro-Oncology',
    icon: '🎗️',
    diagnoses: [
      { id: 'brain-metastases', name: 'Brain Metastases', icd10: 'C79.31', category: 'neuro-oncology' },
      { id: 'glioblastoma', name: 'Glioblastoma', icd10: 'C71.9', category: 'neuro-oncology' },
      { id: 'leptomeningeal', name: 'Leptomeningeal Carcinomatosis', icd10: 'C79.32', category: 'neuro-oncology' },
      { id: 'paraneoplastic', name: 'Paraneoplastic Neurological Syndrome', icd10: 'G13.0', category: 'neuro-oncology' },
      { id: 'spinal-cord-compression', name: 'Spinal Cord Compression', icd10: 'G95.20', category: 'neuro-oncology' },
      { id: 'meningioma', name: 'Meningioma', icd10: 'D32.9', category: 'neuro-oncology' },
      { id: 'cns-lymphoma', name: 'Primary CNS Lymphoma', icd10: 'C85.19', category: 'neuro-oncology' },
      { id: 'radiation-injury', name: 'Radiation-Induced Neurologic Injury', icd10: 'G93.89', category: 'neuro-oncology' },
    ],
  },
  {
    id: 'spinal-cord',
    name: 'Spinal Cord Disorders',
    icon: '🦴',
    diagnoses: [
      { id: 'myelopathy-evaluation', name: 'Acute Myelopathy Evaluation', icd10: 'G95.9', category: 'spinal-cord' },
      { id: 'cervical-myelopathy', name: 'Cervical Myelopathy', icd10: 'G99.2', category: 'spinal-cord' },
      { id: 'spinal-cord-infarction', name: 'Spinal Cord Infarction', icd10: 'G95.11', category: 'spinal-cord' },
      { id: 'syringomyelia', name: 'Syringomyelia', icd10: 'G95.0', category: 'spinal-cord' },
      { id: 'subacute-combined', name: 'Subacute Combined Degeneration', icd10: 'E53.8', category: 'spinal-cord' },
      { id: 'cauda-equina', name: 'Cauda Equina Syndrome', icd10: 'G83.4', category: 'spinal-cord' },
      { id: 'epidural-abscess', name: 'Epidural Abscess', icd10: 'G06.1', category: 'spinal-cord' },
    ],
  },
  {
    id: 'autoimmune-inflammatory',
    name: 'Autoimmune & Inflammatory',
    icon: '🔥',
    diagnoses: [
      { id: 'neurosarcoidosis', name: 'Neurosarcoidosis', icd10: 'D86.82', category: 'autoimmune-inflammatory' },
      { id: 'susac-syndrome', name: 'Susac Syndrome', icd10: 'H35.89', category: 'autoimmune-inflammatory' },
      { id: 'neuro-behcets', name: "Neuro-Behcet's", icd10: 'M35.2', category: 'autoimmune-inflammatory' },
      { id: 'stiff-person', name: 'Stiff Person Syndrome', icd10: 'G25.82', category: 'autoimmune-inflammatory' },
      { id: 'hashimotos-encephalopathy', name: "Hashimoto's Encephalopathy", icd10: 'E06.3', category: 'autoimmune-inflammatory' },
    ],
  },
  {
    id: 'functional-psychiatric',
    name: 'Functional & Psychiatric',
    icon: '🧘',
    diagnoses: [
      { id: 'fnd', name: 'Functional Neurological Disorder', icd10: 'F44.9', category: 'functional-psychiatric' },
      { id: 'pnes', name: 'Psychogenic Non-Epileptic Spells', icd10: 'F44.5', category: 'functional-psychiatric' },
      { id: 'functional-weakness', name: 'Functional Weakness', icd10: 'F44.4', category: 'functional-psychiatric' },
      { id: 'functional-movement', name: 'Functional Movement Disorder', icd10: 'F44.4', category: 'functional-psychiatric' },
    ],
  },
  {
    id: 'neurocritical-care',
    name: 'Neurocritical Care',
    icon: '🏥',
    diagnoses: [
      { id: 'elevated-icp', name: 'Elevated ICP Management', icd10: 'G93.2', category: 'neurocritical-care' },
      { id: 'brain-death', name: 'Brain Death Evaluation', icd10: 'G93.82', category: 'neurocritical-care' },
      { id: 'anoxic-brain-injury', name: 'Anoxic Brain Injury/Prognostication', icd10: 'G93.1', category: 'neurocritical-care' },
      { id: 'neuromuscular-respiratory', name: 'Neuromuscular Respiratory Failure', icd10: 'G71.9', category: 'neurocritical-care' },
      { id: 'hypertensive-encephalopathy', name: 'Hypertensive Encephalopathy', icd10: 'I67.4', category: 'neurocritical-care' },
    ],
  },
  {
    id: 'other-misc',
    name: 'Other / Miscellaneous',
    icon: '📦',
    diagnoses: [
      { id: 'syncope-evaluation', name: 'Syncope Evaluation', icd10: 'R55', category: 'other-misc' },
      { id: 'vertigo-evaluation', name: 'Vertigo/Dizziness Evaluation', icd10: 'R42', category: 'other-misc' },
      { id: 'bells-palsy', name: "Bell's Palsy", icd10: 'G51.0', category: 'other-misc' },
      { id: 'horner-syndrome', name: 'Horner Syndrome', icd10: 'G90.2', category: 'other-misc' },
      { id: 'nystagmus-evaluation', name: 'Nystagmus Evaluation', icd10: 'H55.00', category: 'other-misc' },
      { id: 'post-concussion-syndrome', name: 'Post-Concussion Syndrome', icd10: 'F07.81', category: 'other-misc' },
      { id: 'tbi', name: 'Traumatic Brain Injury', icd10: 'S06.9', category: 'other-misc' },
      { id: 'cte', name: 'Chronic Traumatic Encephalopathy', icd10: 'G31.89', category: 'other-misc' },
      { id: 'sleep-apnea', name: 'Sleep Apnea', icd10: 'G47.33', category: 'other-misc' },
      { id: 'narcolepsy', name: 'Narcolepsy', icd10: 'G47.419', category: 'other-misc' },
      { id: 'insomnia', name: 'Insomnia', icd10: 'G47.00', category: 'other-misc' },
      { id: 'rem-sleep-behavior', name: 'REM Sleep Behavior Disorder', icd10: 'G47.52', category: 'other-misc' },
      { id: 'parasomnia', name: 'Parasomnia', icd10: 'G47.50', category: 'other-misc' },
      { id: 'tinnitus-evaluation', name: 'Tinnitus Evaluation', icd10: 'H93.19', category: 'other-misc' },
    ],
  },
]

// Helper: Get all diagnoses as flat list
export function getAllDiagnoses(): Diagnosis[] {
  return DIAGNOSIS_CATEGORIES.flatMap(cat => cat.diagnoses)
}

// Helper: Get diagnosis by ID
export function getDiagnosisById(id: string): Diagnosis | undefined {
  return getAllDiagnoses().find(d => d.id === id)
}

// Helper: Get diagnoses for a Reason for Consult selection
export function getDiagnosesForConsultReason(consultReason: string): Diagnosis[] {
  const diagnosisIds = CONSULT_TO_DIAGNOSIS_MAP[consultReason] || []
  return diagnosisIds
    .map(id => getDiagnosisById(id))
    .filter((d): d is Diagnosis => d !== undefined)
}

// Helper: Search diagnoses by name or ICD-10
export function searchDiagnoses(query: string): Diagnosis[] {
  const lowerQuery = query.toLowerCase()
  return getAllDiagnoses().filter(d =>
    d.name.toLowerCase().includes(lowerQuery) ||
    d.icd10.toLowerCase().includes(lowerQuery)
  )
}

// Helper: Get category by ID
export function getCategoryById(id: string): DiagnosisCategory | undefined {
  return DIAGNOSIS_CATEGORIES.find(cat => cat.id === id)
}
