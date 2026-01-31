/**
 * Note Merge Types
 * Defines the JSON structure for merging Chart Prep, Visit AI, and manual content
 */

export type ContentSource = 'manual' | 'chart-prep' | 'visit-ai' | 'merged' | 'recommendations' | 'scales' | 'imaging'

export type NoteType = 'new-consult' | 'follow-up'
export type NoteLength = 'concise' | 'standard' | 'detailed'

export interface NoteFieldContent {
  /** The current content to display/use */
  content: string
  /** Where the content originated from */
  source: ContentSource
  /** AI-generated suggestion (shown if source is 'manual' and AI has an alternative) */
  aiSuggestion?: string
  /** Source of the AI suggestion */
  aiSuggestionSource?: 'chart-prep' | 'visit-ai'
  /** Whether the user has explicitly accepted/rejected the AI suggestion */
  aiSuggestionStatus?: 'pending' | 'accepted' | 'rejected'
  /** Timestamp of last modification */
  lastModified: string
}

export interface MergedClinicalNote {
  /** Chief complaint / reason for consult */
  chiefComplaint: NoteFieldContent
  /** History of presenting illness */
  hpi: NoteFieldContent
  /** Review of systems */
  ros: NoteFieldContent
  /** Physical examination findings */
  physicalExam: NoteFieldContent
  /** Assessment / clinical impression */
  assessment: NoteFieldContent
  /** Plan / recommendations */
  plan: NoteFieldContent
  /** Additional fields can be added */
  [key: string]: NoteFieldContent
}

export interface ChartPrepOutput {
  patientSummary?: string
  suggestedHPI?: string
  relevantHistory?: string
  currentMedications?: string
  imagingFindings?: string
  scaleTrends?: string
  keyConsiderations?: string
  suggestedAssessment?: string
  suggestedPlan?: string
}

export interface VisitAIOutput {
  hpiFromVisit?: string
  rosFromVisit?: string
  examFromVisit?: string
  assessmentFromVisit?: string
  planFromVisit?: string
  /** Speaker-tagged transcript segments */
  transcriptSegments?: Array<{
    speaker: 'provider' | 'patient' | 'unknown'
    text: string
    timestamp: string
  }>
}

export interface ManualNoteData {
  chiefComplaint?: string | string[]
  hpi?: string
  ros?: string
  rosDetails?: string
  physicalExam?: string
  assessment?: string
  plan?: string
  allergies?: string
  allergyDetails?: string
  historyAvailable?: string
  historyDetails?: string
  vitals?: { bp?: string; hr?: string; temp?: string; weight?: string; bmi?: string }
  [key: string]: string | string[] | { bp?: string; hr?: string; temp?: string; weight?: string; bmi?: string } | undefined
}

export interface MergeOptions {
  /** How to handle conflicts when manual content exists */
  conflictResolution: 'keep-manual' | 'prefer-ai' | 'merge-append'
  /** Whether to show AI suggestions for fields with manual content */
  showAiSuggestions: boolean
}

// ==========================================
// Extended Types for Comprehensive Note Generation
// ==========================================

/** Scale result for inclusion in note */
export interface ScaleResult {
  scaleId: string
  scaleName: string
  abbreviation: string
  rawScore: number
  maxScore?: number
  interpretation: string
  severity: string
  completedAt: string
  previousScore?: number
  trend?: 'improving' | 'stable' | 'worsening'
}

/** Diagnosis for differential section */
export interface DiagnosisEntry {
  id: string
  name: string
  icd10: string
  isPrimary?: boolean
  category?: string
}

/** Imaging study for results section */
export interface ImagingStudyEntry {
  id: string
  studyType: string
  date: string
  impression: 'normal' | 'abnormal' | 'pending' | 'not-reviewed'
  findings?: string
  pacsLink?: string
}

/** Lab result for results section */
export interface LabResultEntry {
  testName: string
  value?: string
  date?: string
  isAbnormal?: boolean
}

/** Recommendation item from smart recommendations */
export interface RecommendationItem {
  category: string
  items: string[]
  priority?: 'stat' | 'urgent' | 'routine' | 'extended'
}

/** Patient demographics for note header */
export interface PatientInfo {
  name: string
  dob?: string
  mrn?: string
  age?: number
  gender?: string
}

/** Visit info for note header */
export interface VisitInfo {
  date: string
  type?: string
  provider?: string
  location?: string
}

/** Comprehensive data for generating a complete note */
export interface ComprehensiveNoteData {
  // Core clinical content
  manualData: ManualNoteData
  chartPrepData?: ChartPrepOutput | null
  visitAIData?: VisitAIOutput | null

  // Additional structured data
  scales?: ScaleResult[]
  diagnoses?: DiagnosisEntry[]
  imagingStudies?: ImagingStudyEntry[]
  labResults?: LabResultEntry[]
  recommendations?: RecommendationItem[]

  // Physical exam structured data
  examFindings?: Record<string, boolean>
  examSectionNotes?: Record<string, string>

  // Patient/Visit context
  patient?: PatientInfo
  visit?: VisitInfo

  // Prior visits for context (follow-up notes)
  priorVisits?: Array<{
    date: string
    summary?: string
    diagnoses?: string[]
  }>
}

/** Note generation preferences */
export interface NotePreferences {
  noteType: NoteType
  noteLength: NoteLength
  includeScales: boolean
  includeImaging: boolean
  includeLabs: boolean
  includeRecommendations: boolean
  showSources: boolean
}

/** Formatted section for final note display */
export interface FormattedNoteSection {
  id: string
  title: string
  content: string
  source: ContentSource
  isVerified: boolean
  isEditable: boolean
  order: number
}

/** Complete formatted note ready for EHR */
export interface FormattedNote {
  header: string
  sections: FormattedNoteSection[]
  footer: string
  fullText: string
  wordCount: number
  generatedAt: string
}
