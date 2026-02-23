export interface CptCodeDef {
  code: string
  program: 'tcm' | 'ccm'
  name: string
  description: string
  rate: number
  minMinutes: number
  whoProvides: string
  isAddOn: boolean
  addOnTo?: string
}

// 2025 CMS national average rates
export const CPT_CODES: Record<string, CptCodeDef> = {
  '99496': {
    code: '99496',
    program: 'tcm',
    name: 'TCM High Complexity',
    description: 'Face-to-face within 7 days of discharge',
    rate: 272.68,
    minMinutes: 0,
    whoProvides: 'Physician/QHP',
    isAddOn: false,
  },
  '99495': {
    code: '99495',
    program: 'tcm',
    name: 'TCM Moderate Complexity',
    description: 'Face-to-face within 14 days of discharge',
    rate: 201.20,
    minMinutes: 0,
    whoProvides: 'Physician/QHP',
    isAddOn: false,
  },
  '99490': {
    code: '99490',
    program: 'ccm',
    name: 'CCM Non-Complex (first 20 min)',
    description: 'First 20 minutes of clinical staff CCM per month',
    rate: 37.07,
    minMinutes: 20,
    whoProvides: 'Clinical staff',
    isAddOn: false,
  },
  '99439': {
    code: '99439',
    program: 'ccm',
    name: 'CCM Non-Complex (add-on 20 min)',
    description: 'Each additional 20 minutes (max 2x/month)',
    rate: 31.00,
    minMinutes: 20,
    whoProvides: 'Clinical staff',
    isAddOn: true,
    addOnTo: '99490',
  },
  '99491': {
    code: '99491',
    program: 'ccm',
    name: 'CCM by Physician/QHP (first 30 min)',
    description: 'First 30 minutes personally provided by physician',
    rate: 82.16,
    minMinutes: 30,
    whoProvides: 'Physician/QHP',
    isAddOn: false,
  },
  '99437': {
    code: '99437',
    program: 'ccm',
    name: 'CCM by Physician/QHP (add-on 30 min)',
    description: 'Each additional 30 minutes by physician (max 2x/month)',
    rate: 57.58,
    minMinutes: 30,
    whoProvides: 'Physician/QHP',
    isAddOn: true,
    addOnTo: '99491',
  },
  '99487': {
    code: '99487',
    program: 'ccm',
    name: 'CCM Complex (first 60 min)',
    description: 'First 60 minutes, moderate-to-high complexity MDM',
    rate: 87.00,
    minMinutes: 60,
    whoProvides: 'Clinical staff',
    isAddOn: false,
  },
}

export function suggestCptCode(program: 'tcm' | 'ccm', totalMinutes: number): string {
  if (program === 'tcm') return '99496'
  if (totalMinutes >= 60) return '99487'
  if (totalMinutes >= 30) return '99491'
  return '99490'
}

export function getThreshold(cptCode: string): number {
  return CPT_CODES[cptCode]?.minMinutes ?? 0
}
