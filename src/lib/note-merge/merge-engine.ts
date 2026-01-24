/**
 * Note Merge Engine
 * Combines Chart Prep, Visit AI, and manual content into a unified clinical note
 */

import {
  NoteFieldContent,
  MergedClinicalNote,
  ChartPrepOutput,
  VisitAIOutput,
  ManualNoteData,
  MergeOptions,
  ContentSource,
} from './types'

const DEFAULT_OPTIONS: MergeOptions = {
  conflictResolution: 'keep-manual',
  showAiSuggestions: true,
}

/**
 * Creates an empty field content structure
 */
function createEmptyField(): NoteFieldContent {
  return {
    content: '',
    source: 'manual',
    lastModified: new Date().toISOString(),
  }
}

/**
 * Creates a field with content from a specific source
 */
function createField(
  content: string,
  source: ContentSource,
  aiSuggestion?: string,
  aiSuggestionSource?: 'chart-prep' | 'visit-ai'
): NoteFieldContent {
  return {
    content,
    source,
    aiSuggestion,
    aiSuggestionSource,
    aiSuggestionStatus: aiSuggestion ? 'pending' : undefined,
    lastModified: new Date().toISOString(),
  }
}

/**
 * Checks if a field has meaningful content
 */
function hasContent(value: string | string[] | undefined): boolean {
  if (!value) return false
  if (Array.isArray(value)) return value.length > 0
  return value.trim().length > 0
}

/**
 * Normalizes content to string (handles arrays like chiefComplaint)
 */
function normalizeContent(value: string | string[] | undefined): string {
  if (!value) return ''
  if (Array.isArray(value)) return value.join(', ')
  return value.trim()
}

/**
 * Merges a single field from multiple sources
 * Priority: Manual content is preserved, AI content becomes suggestion
 */
function mergeField(
  manualContent: string | string[] | undefined,
  chartPrepContent: string | undefined,
  visitAIContent: string | undefined,
  options: MergeOptions
): NoteFieldContent {
  const manual = normalizeContent(manualContent)
  const chartPrep = chartPrepContent?.trim() || ''
  const visitAI = visitAIContent?.trim() || ''

  // Determine the best AI suggestion (prefer Visit AI as it's more recent/specific)
  const aiContent = visitAI || chartPrep
  const aiSource: 'chart-prep' | 'visit-ai' | undefined = visitAI
    ? 'visit-ai'
    : chartPrep
    ? 'chart-prep'
    : undefined

  // If manual content exists, keep it and offer AI as suggestion
  if (hasContent(manualContent)) {
    if (options.showAiSuggestions && aiContent && aiContent !== manual) {
      return createField(manual, 'manual', aiContent, aiSource)
    }
    return createField(manual, 'manual')
  }

  // No manual content - use AI content if available
  if (aiContent) {
    return createField(aiContent, aiSource === 'visit-ai' ? 'visit-ai' : 'chart-prep')
  }

  // Nothing available
  return createEmptyField()
}

/**
 * Main merge function: combines all sources into a unified note structure
 */
export function mergeNoteContent(
  manualData: ManualNoteData,
  chartPrepData: ChartPrepOutput | null,
  visitAIData: VisitAIOutput | null,
  options: Partial<MergeOptions> = {}
): MergedClinicalNote {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const chartPrep = chartPrepData || {}
  const visitAI = visitAIData || {}

  return {
    chiefComplaint: mergeField(
      manualData.chiefComplaint,
      undefined, // Chart prep doesn't typically suggest chief complaint
      undefined,
      opts
    ),
    hpi: mergeField(
      manualData.hpi,
      chartPrep.suggestedHPI,
      visitAI.hpiFromVisit,
      opts
    ),
    ros: mergeField(
      manualData.ros,
      undefined,
      visitAI.rosFromVisit,
      opts
    ),
    physicalExam: mergeField(
      manualData.physicalExam,
      undefined,
      visitAI.examFromVisit,
      opts
    ),
    assessment: mergeField(
      manualData.assessment,
      chartPrep.suggestedAssessment,
      visitAI.assessmentFromVisit,
      opts
    ),
    plan: mergeField(
      manualData.plan,
      chartPrep.suggestedPlan,
      visitAI.planFromVisit,
      opts
    ),
  }
}

/**
 * Accepts an AI suggestion for a specific field
 * Returns updated merged note with the suggestion applied
 */
export function acceptAiSuggestion(
  mergedNote: MergedClinicalNote,
  fieldName: keyof MergedClinicalNote
): MergedClinicalNote {
  const field = mergedNote[fieldName]
  if (!field.aiSuggestion) return mergedNote

  const updatedField: NoteFieldContent = {
    ...field,
    content: field.aiSuggestion,
    source: field.aiSuggestionSource || 'merged' as ContentSource,
    aiSuggestion: field.content,
    aiSuggestionSource: undefined,
    aiSuggestionStatus: 'accepted',
    lastModified: new Date().toISOString(),
  }

  return {
    ...mergedNote,
    [fieldName]: updatedField,
  }
}

/**
 * Rejects an AI suggestion for a specific field
 * Keeps manual content and marks suggestion as rejected
 */
export function rejectAiSuggestion(
  mergedNote: MergedClinicalNote,
  fieldName: keyof MergedClinicalNote
): MergedClinicalNote {
  const field = mergedNote[fieldName]
  if (!field.aiSuggestion) return mergedNote

  const updatedField: NoteFieldContent = {
    ...field,
    aiSuggestionStatus: 'rejected',
    lastModified: new Date().toISOString(),
  }

  return {
    ...mergedNote,
    [fieldName]: updatedField,
  }
}

/**
 * Updates a field with new manual content
 */
export function updateFieldContent(
  mergedNote: MergedClinicalNote,
  fieldName: keyof MergedClinicalNote,
  newContent: string
): MergedClinicalNote {
  const field = mergedNote[fieldName]

  const updatedField: NoteFieldContent = {
    ...field,
    content: newContent,
    source: 'manual',
    lastModified: new Date().toISOString(),
  }

  return {
    ...mergedNote,
    [fieldName]: updatedField,
  }
}

/**
 * Converts merged note back to simple key-value format for saving
 */
export function flattenMergedNote(
  mergedNote: MergedClinicalNote
): Record<string, string> {
  const result: Record<string, string> = {}

  for (const [key, field] of Object.entries(mergedNote)) {
    result[key] = field.content
  }

  return result
}

/**
 * Gets summary of merge results for UI display
 */
export function getMergeStats(mergedNote: MergedClinicalNote): {
  totalFields: number
  manualFields: number
  aiFilledFields: number
  fieldsWithSuggestions: number
} {
  const fields = Object.values(mergedNote)

  return {
    totalFields: fields.length,
    manualFields: fields.filter(f => f.source === 'manual' && f.content).length,
    aiFilledFields: fields.filter(f =>
      (f.source === 'chart-prep' || f.source === 'visit-ai') && f.content
    ).length,
    fieldsWithSuggestions: fields.filter(f =>
      f.aiSuggestion && f.aiSuggestionStatus === 'pending'
    ).length,
  }
}
