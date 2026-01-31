// Status and type enums
export type MedicationStatus = 'active' | 'discontinued' | 'held' | 'completed' | 'failed'
export type AllergenType = 'drug' | 'food' | 'environmental' | 'other'
export type AllergySeverity = 'mild' | 'moderate' | 'severe' | 'life-threatening' | 'unknown'
export type MedicationSource = 'manual' | 'ai_historian' | 'ai_scribe' | 'import'

// Core interfaces
export interface PatientMedication {
  id: string
  patient_id: string
  tenant_id: string
  medication_name: string
  generic_name: string | null
  dosage: string | null
  frequency: string | null
  route: string
  start_date: string | null
  end_date: string | null
  prescriber: string | null
  indication: string | null
  status: MedicationStatus
  discontinue_reason: string | null
  source: MedicationSource
  ai_confidence: number | null
  confirmed_by_user: boolean
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface PatientAllergy {
  id: string
  patient_id: string
  tenant_id: string
  allergen: string
  allergen_type: AllergenType
  reaction: string | null
  severity: AllergySeverity
  onset_date: string | null
  source: MedicationSource
  confirmed_by_user: boolean
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface MedicationReview {
  id: string
  patient_id: string
  visit_id: string | null
  tenant_id: string
  reviewed_by: string | null
  review_type: 'reconciliation' | 'renewal' | 'initial'
  changes_made: any[]
  notes: string | null
  created_at: string
}

// Input types for create/update
export interface MedicationCreateInput {
  patient_id: string
  medication_name: string
  generic_name?: string
  dosage?: string
  frequency?: string
  route?: string
  start_date?: string
  prescriber?: string
  indication?: string
  notes?: string
  source?: MedicationSource
}

export interface MedicationUpdateInput {
  medication_name?: string
  generic_name?: string
  dosage?: string
  frequency?: string
  route?: string
  start_date?: string
  end_date?: string
  prescriber?: string
  indication?: string
  status?: MedicationStatus
  discontinue_reason?: string
  notes?: string
  confirmed_by_user?: boolean
}

export interface AllergyCreateInput {
  patient_id: string
  allergen: string
  allergen_type?: AllergenType
  reaction?: string
  severity?: AllergySeverity
  onset_date?: string
  notes?: string
  source?: MedicationSource
}

export interface AllergyUpdateInput {
  allergen?: string
  allergen_type?: AllergenType
  reaction?: string
  severity?: AllergySeverity
  is_active?: boolean
  notes?: string
  confirmed_by_user?: boolean
}

// Formulary item for typeahead
export interface FormularyItem {
  name: string
  generic_name: string
  category: string
  common_dosages: string[]
  routes: string[]
  common_frequencies: string[]
  monitoring?: string
  interactions_note?: string
}
