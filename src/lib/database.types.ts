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
