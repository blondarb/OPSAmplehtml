export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      patients: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          mrn: string
          first_name: string
          last_name: string
          date_of_birth: string
          gender: 'M' | 'F' | 'O'
          phone: string | null
          email: string | null
          address: string | null
          timezone: string
          user_id: string
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string
          mrn: string
          first_name: string
          last_name: string
          date_of_birth: string
          gender: 'M' | 'F' | 'O'
          phone?: string | null
          email?: string | null
          address?: string | null
          timezone?: string
          user_id: string
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string
          mrn?: string
          first_name?: string
          last_name?: string
          date_of_birth?: string
          gender?: 'M' | 'F' | 'O'
          phone?: string | null
          email?: string | null
          address?: string | null
          timezone?: string
          user_id?: string
        }
      }
      visits: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          patient_id: string
          user_id: string
          visit_date: string
          visit_type: 'new_patient' | 'follow_up' | 'urgent' | 'telehealth'
          chief_complaint: string[]
          status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string
          patient_id: string
          user_id: string
          visit_date: string
          visit_type: 'new_patient' | 'follow_up' | 'urgent' | 'telehealth'
          chief_complaint?: string[]
          status?: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string
          patient_id?: string
          user_id?: string
          visit_date?: string
          visit_type?: 'new_patient' | 'follow_up' | 'urgent' | 'telehealth'
          chief_complaint?: string[]
          status?: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
        }
      }
      clinical_notes: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          visit_id: string
          hpi: string | null
          ros: string | null
          allergies: string | null
          physical_exam: Json | null
          assessment: string | null
          plan: string | null
          ai_summary: string | null
          is_signed: boolean
          signed_at: string | null
          raw_dictation: Json | null
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string
          visit_id: string
          hpi?: string | null
          ros?: string | null
          allergies?: string | null
          physical_exam?: Json | null
          assessment?: string | null
          plan?: string | null
          ai_summary?: string | null
          is_signed?: boolean
          signed_at?: string | null
          raw_dictation?: Json | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string
          visit_id?: string
          hpi?: string | null
          ros?: string | null
          allergies?: string | null
          physical_exam?: Json | null
          assessment?: string | null
          plan?: string | null
          ai_summary?: string | null
          is_signed?: boolean
          signed_at?: string | null
          raw_dictation?: Json | null
        }
      }
      clinical_scales: {
        Row: {
          id: string
          created_at: string
          visit_id: string
          patient_id: string
          scale_type: 'MIDAS' | 'HIT6' | 'PHQ9' | 'GAD7' | 'MOCA' | 'MINICOG'
          score: number
          interpretation: string | null
          answers: Json | null
        }
        Insert: {
          id?: string
          created_at?: string
          visit_id: string
          patient_id: string
          scale_type: 'MIDAS' | 'HIT6' | 'PHQ9' | 'GAD7' | 'MOCA' | 'MINICOG'
          score: number
          interpretation?: string | null
          answers?: Json | null
        }
        Update: {
          id?: string
          created_at?: string
          visit_id?: string
          patient_id?: string
          scale_type?: 'MIDAS' | 'HIT6' | 'PHQ9' | 'GAD7' | 'MOCA' | 'MINICOG'
          score?: number
          interpretation?: string | null
          answers?: Json | null
        }
      }
      diagnoses: {
        Row: {
          id: string
          created_at: string
          visit_id: string
          patient_id: string
          icd10_code: string
          description: string
          is_primary: boolean
        }
        Insert: {
          id?: string
          created_at?: string
          visit_id: string
          patient_id: string
          icd10_code: string
          description: string
          is_primary?: boolean
        }
        Update: {
          id?: string
          created_at?: string
          visit_id?: string
          patient_id?: string
          icd10_code?: string
          description?: string
          is_primary?: boolean
        }
      }
      imaging_studies: {
        Row: {
          id: string
          created_at: string
          patient_id: string
          study_type: 'CT' | 'MRI' | 'XRAY' | 'US' | 'OTHER'
          study_date: string
          description: string
          findings: string | null
          impression: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          patient_id: string
          study_type: 'CT' | 'MRI' | 'XRAY' | 'US' | 'OTHER'
          study_date: string
          description: string
          findings?: string | null
          impression?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          patient_id?: string
          study_type?: 'CT' | 'MRI' | 'XRAY' | 'US' | 'OTHER'
          study_date?: string
          description?: string
          findings?: string | null
          impression?: string | null
        }
      }
      app_settings: {
        Row: {
          id: string
          key: string
          value: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          key: string
          value: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          key?: string
          value?: string
          created_at?: string
          updated_at?: string
        }
      }
      clinical_plans: {
        Row: {
          id: string
          plan_key: string
          title: string
          icd10_codes: string[]
          scope: string | null
          notes: string[]
          sections: Json
          patient_instructions: string[]
          referrals: string[]
          differential: Json | null
          evidence: Json | null
          monitoring: Json | null
          disposition: Json | null
          source: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          plan_key: string
          title: string
          icd10_codes?: string[]
          scope?: string | null
          notes?: string[]
          sections?: Json
          patient_instructions?: string[]
          referrals?: string[]
          differential?: Json | null
          evidence?: Json | null
          monitoring?: Json | null
          disposition?: Json | null
          source?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          plan_key?: string
          title?: string
          icd10_codes?: string[]
          scope?: string | null
          notes?: string[]
          sections?: Json
          patient_instructions?: string[]
          referrals?: string[]
          differential?: Json | null
          evidence?: Json | null
          monitoring?: Json | null
          disposition?: Json | null
          source?: string
          created_at?: string
          updated_at?: string
        }
      }
      saved_plans: {
        Row: {
          id: string
          tenant_id: string
          user_id: string
          name: string
          description: string | null
          source_plan_key: string | null
          selected_items: Json
          custom_items: Json
          plan_overrides: Json
          is_default: boolean
          use_count: number
          last_used: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id?: string
          user_id: string
          name: string
          description?: string | null
          source_plan_key?: string | null
          selected_items?: Json
          custom_items?: Json
          plan_overrides?: Json
          is_default?: boolean
          use_count?: number
          last_used?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          user_id?: string
          name?: string
          description?: string | null
          source_plan_key?: string | null
          selected_items?: Json
          custom_items?: Json
          plan_overrides?: Json
          is_default?: boolean
          use_count?: number
          last_used?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      patient_medications: {
        Row: {
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
          status: 'active' | 'discontinued' | 'held' | 'completed' | 'failed'
          discontinue_reason: string | null
          source: 'manual' | 'ai_historian' | 'ai_scribe' | 'import'
          ai_confidence: number | null
          confirmed_by_user: boolean
          notes: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          patient_id: string
          tenant_id?: string
          medication_name: string
          generic_name?: string | null
          dosage?: string | null
          frequency?: string | null
          route?: string
          start_date?: string | null
          end_date?: string | null
          prescriber?: string | null
          indication?: string | null
          status?: 'active' | 'discontinued' | 'held' | 'completed' | 'failed'
          discontinue_reason?: string | null
          source?: 'manual' | 'ai_historian' | 'ai_scribe' | 'import'
          ai_confidence?: number | null
          confirmed_by_user?: boolean
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          patient_id?: string
          tenant_id?: string
          medication_name?: string
          generic_name?: string | null
          dosage?: string | null
          frequency?: string | null
          route?: string
          start_date?: string | null
          end_date?: string | null
          prescriber?: string | null
          indication?: string | null
          status?: 'active' | 'discontinued' | 'held' | 'completed' | 'failed'
          discontinue_reason?: string | null
          source?: 'manual' | 'ai_historian' | 'ai_scribe' | 'import'
          ai_confidence?: number | null
          confirmed_by_user?: boolean
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      patient_allergies: {
        Row: {
          id: string
          patient_id: string
          tenant_id: string
          allergen: string
          allergen_type: 'drug' | 'food' | 'environmental' | 'other'
          reaction: string | null
          severity: 'mild' | 'moderate' | 'severe' | 'life-threatening' | 'unknown'
          onset_date: string | null
          source: 'manual' | 'ai_historian' | 'ai_scribe' | 'import'
          confirmed_by_user: boolean
          is_active: boolean
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          patient_id: string
          tenant_id?: string
          allergen: string
          allergen_type?: 'drug' | 'food' | 'environmental' | 'other'
          reaction?: string | null
          severity?: 'mild' | 'moderate' | 'severe' | 'life-threatening' | 'unknown'
          onset_date?: string | null
          source?: 'manual' | 'ai_historian' | 'ai_scribe' | 'import'
          confirmed_by_user?: boolean
          is_active?: boolean
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          patient_id?: string
          tenant_id?: string
          allergen?: string
          allergen_type?: 'drug' | 'food' | 'environmental' | 'other'
          reaction?: string | null
          severity?: 'mild' | 'moderate' | 'severe' | 'life-threatening' | 'unknown'
          onset_date?: string | null
          source?: 'manual' | 'ai_historian' | 'ai_scribe' | 'import'
          confirmed_by_user?: boolean
          is_active?: boolean
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      medication_reviews: {
        Row: {
          id: string
          patient_id: string
          visit_id: string | null
          tenant_id: string
          reviewed_by: string | null
          review_type: 'reconciliation' | 'renewal' | 'initial'
          changes_made: Json
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          patient_id: string
          visit_id?: string | null
          tenant_id?: string
          reviewed_by?: string | null
          review_type?: 'reconciliation' | 'renewal' | 'initial'
          changes_made?: Json
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          patient_id?: string
          visit_id?: string | null
          tenant_id?: string
          reviewed_by?: string | null
          review_type?: 'reconciliation' | 'renewal' | 'initial'
          changes_made?: Json
          notes?: string | null
          created_at?: string
        }
      }
      dot_phrases: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          user_id: string
          trigger_text: string
          expansion_text: string
          category: string | null
          description: string | null
          is_active: boolean
          use_count: number
          last_used: string | null
          scope: 'global' | 'hpi' | 'assessment' | 'plan' | 'ros' | 'allergies'
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string
          user_id: string
          trigger_text: string
          expansion_text: string
          category?: string | null
          description?: string | null
          is_active?: boolean
          use_count?: number
          last_used?: string | null
          scope?: 'global' | 'hpi' | 'assessment' | 'plan' | 'ros' | 'allergies'
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string
          user_id?: string
          trigger_text?: string
          expansion_text?: string
          category?: string | null
          description?: string | null
          is_active?: boolean
          use_count?: number
          last_used?: string | null
          scope?: 'global' | 'hpi' | 'assessment' | 'plan' | 'ros' | 'allergies'
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_openai_key: {
        Args: Record<string, never>
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}
