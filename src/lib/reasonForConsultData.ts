// Reason for Consult - Two-tier category data structure
// Primary categories with contextual sub-options for neurology outpatient

export interface ConsultCategory {
  id: string
  label: string
  icon: string
  subOptions: {
    common: string[]    // Always visible when category is selected
    expanded: string[]  // Revealed by "Show all"
  }
}

export const CONSULT_CATEGORIES: ConsultCategory[] = [
  {
    id: 'headache',
    label: 'Headache',
    icon: '🧠',
    subOptions: {
      common: ['Migraine', 'Chronic migraine', 'Tension headache', 'New headache'],
      expanded: [
        'Thunderclap headache',
        'Cluster headache',
        'Medication overuse headache',
        'Post-traumatic headache',
        'New daily persistent headache',
        'Facial pain/Trigeminal neuralgia',
      ],
    },
  },
  {
    id: 'movement',
    label: 'Movement',
    icon: '🧍',
    subOptions: {
      common: ['Parkinson disease', 'Essential tremor', 'Restless legs syndrome'],
      expanded: [
        'Dystonia',
        'Tics/Tourette syndrome',
        'Huntington disease',
        'Ataxia',
        'Chorea',
        'Drug-induced movement disorder',
        'Gait disorder',
      ],
    },
  },
  {
    id: 'seizure',
    label: 'Seizure',
    icon: '⚡',
    subOptions: {
      common: ['Epilepsy', 'New onset seizure', 'Breakthrough seizures'],
      expanded: [
        'Seizure medication adjustment',
        'Drug-resistant epilepsy',
        'Seizure in pregnancy',
        'Spell vs seizure evaluation',
        'Syncope vs seizure',
        'Status epilepticus follow-up',
      ],
    },
  },
  {
    id: 'cognitive',
    label: 'Cognitive',
    icon: '🧩',
    subOptions: {
      common: ['Memory loss', 'Dementia evaluation', 'Mild cognitive impairment'],
      expanded: [
        'Alzheimer disease',
        'Frontotemporal dementia',
        'Lewy body dementia',
        'Vascular dementia',
        'Delirium/Encephalopathy',
        'Capacity evaluation',
      ],
    },
  },
  {
    id: 'neuromuscular',
    label: 'Neuromuscular',
    icon: '💪',
    subOptions: {
      common: ['Peripheral neuropathy', 'Carpal tunnel syndrome', 'Radiculopathy'],
      expanded: [
        'Myasthenia gravis',
        'ALS/Motor neuron disease',
        'Myopathy',
        'Plexopathy',
        'CIDP',
        'Guillain-Barré syndrome',
        'Small fiber neuropathy',
      ],
    },
  },
  {
    id: 'ms-neuroimmunology',
    label: 'MS / Neuroimmune',
    icon: '🧬',
    subOptions: {
      common: ['Multiple sclerosis', 'MS follow-up', 'Suspected demyelination'],
      expanded: [
        'Optic neuritis',
        'Transverse myelitis',
        'NMOSD',
        'MOGAD',
        'Autoimmune encephalitis',
      ],
    },
  },
  {
    id: 'cerebrovascular',
    label: 'Cerebrovascular',
    icon: '🫀',
    subOptions: {
      common: ['Stroke follow-up', 'TIA evaluation', 'Stroke prevention'],
      expanded: [
        'Carotid stenosis',
        'Moyamoya disease',
        'Post-thrombolysis follow-up',
        'Post-thrombectomy follow-up',
        'ICH follow-up',
        'SAH follow-up',
        'Cerebral venous thrombosis',
      ],
    },
  },
  {
    id: 'sleep',
    label: 'Sleep',
    icon: '😴',
    subOptions: {
      common: ['Insomnia', 'Excessive daytime sleepiness', 'Restless legs syndrome'],
      expanded: [
        'Narcolepsy',
        'Sleep apnea evaluation',
        'REM sleep behavior disorder',
        'Parasomnia',
      ],
    },
  },
  {
    id: 'other',
    label: 'Other',
    icon: '📦',
    subOptions: {
      common: ['Dizziness/Vertigo', 'Numbness/Tingling', 'Weakness', 'Second opinion'],
      expanded: [
        'Tremor evaluation',
        'Nystagmus',
        'Back pain with neuro symptoms',
        'Neck pain with neuro symptoms',
        'Concussion/Post-concussion syndrome',
        'Bell palsy',
        'Meningitis/Encephalitis',
        'CNS infection',
        'Brain tumor',
        'Spinal cord disorder',
        'Functional neurological disorder',
        'Autoimmune neurologic disorder',
        'Abnormal imaging finding',
        'Syncope evaluation',
        'Tinnitus',
        'Other',
      ],
    },
  },
]

// Helper to get category by ID
export function getCategoryById(id: string): ConsultCategory | undefined {
  return CONSULT_CATEGORIES.find(cat => cat.id === id)
}

// Helper to get all sub-options for a category
export function getAllSubOptions(categoryId: string): string[] {
  const category = getCategoryById(categoryId)
  if (!category) return []
  return [...category.subOptions.common, ...category.subOptions.expanded]
}

// Helper to find which category a sub-option belongs to
export function findCategoryForSubOption(subOption: string): ConsultCategory | undefined {
  return CONSULT_CATEGORIES.find(cat =>
    cat.subOptions.common.includes(subOption) ||
    cat.subOptions.expanded.includes(subOption)
  )
}

// Helper to derive primary categories from selected sub-options
// Used for backward compatibility with existing data
export function derivePrimaryCategoriesFromSubOptions(subOptions: string[]): string[] {
  const categoryIds = new Set<string>()
  for (const subOption of subOptions) {
    const category = findCategoryForSubOption(subOption)
    if (category) {
      categoryIds.add(category.id)
    }
  }
  return Array.from(categoryIds)
}
