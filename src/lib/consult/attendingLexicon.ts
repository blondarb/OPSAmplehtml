/** Attending-only diagnosis lexicon: omit plain symptoms, retain diagnosis phrases.
 * Keep evaluator assertion vocabulary separate so symptom questions remain allowed.
 */
export const ATTENDING_DIAGNOSIS_NAMES = [
  'dementia', "Alzheimer's", 'Alzheimer', 'Alzheimers', 'Lewy body', 'frontotemporal',
  "Parkinson's", 'Parkinson', 'Parkinsons', 'parkinsonism', 'essential tremor',
  'multiple sclerosis', 'neuromyelitis', 'stroke', 'transient ischemic attack',
  'cerebrovascular accident', 'aneurysm', 'subarachnoid', 'hemorrhage', 'haemorrhage',
  'tumor', 'tumour', 'glioma', 'glioblastoma', 'meningioma', 'metastasis', 'cancer',
  'meningitis', 'encephalitis', 'epilepsy', 'seizure disorder', 'psychogenic',
  'narcolepsy', 'myasthenia', 'Guillain-Barré', 'Guillain', 'motor neuron disease',
  'peripheral neuropathy', 'diabetic neuropathy', 'radiculopathy', 'myelopathy',
  "Bell's palsy", 'Bell’s palsy', 'Bells palsy', 'trigeminal neuralgia',
  'concussion', 'post-concussion', 'normal pressure hydrocephalus', 'hydrocephalus',
  "Huntington's", 'Huntington’s', 'Huntington', 'spinocerebellar ataxia',
  "Wilson's", 'Wilson’s', 'Wilson disease', 'functional neurological disorder',
  'conversion disorder', 'idiopathic intracranial hypertension', 'pseudotumor',
  'cluster headache', 'status epilepticus', 'delirium', 'encephalopathy',
  'Wernicke', 'vasculitis', 'moyamoya', 'carotid stenosis', 'carotid dissection', 'cavernoma',
]
export const ATTENDING_DIAGNOSIS_ACRONYMS = [
  'MS', 'TIA', 'ALS', 'TBI', 'CTE', 'NPH', 'GBS', 'CIDP', 'PD', 'AD',
  'NMO', 'PNES', 'FND', 'IIH', 'CADASIL', 'AVM', 'CVA',
]
