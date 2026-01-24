/**
 * Note Merge Types
 * Defines the JSON structure for merging Chart Prep, Visit AI, and manual content
 */

export type ContentSource = 'manual' | 'chart-prep' | 'visit-ai' | 'merged'

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
  physicalExam?: string
  assessment?: string
  plan?: string
  [key: string]: string | string[] | undefined
}

export interface MergeOptions {
  /** How to handle conflicts when manual content exists */
  conflictResolution: 'keep-manual' | 'prefer-ai' | 'merge-append'
  /** Whether to show AI suggestions for fields with manual content */
  showAiSuggestions: boolean
}
