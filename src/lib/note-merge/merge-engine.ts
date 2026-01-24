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
  ComprehensiveNoteData,
  NotePreferences,
  FormattedNote,
  FormattedNoteSection,
  ScaleResult,
  DiagnosisEntry,
  ImagingStudyEntry,
  LabResultEntry,
  RecommendationItem,
} from './types'

const DEFAULT_OPTIONS: MergeOptions = {
  conflictResolution: 'keep-manual',
  showAiSuggestions: true,
}

const DEFAULT_PREFERENCES: NotePreferences = {
  noteType: 'new-consult',
  noteLength: 'standard',
  includeScales: true,
  includeImaging: true,
  includeLabs: true,
  includeRecommendations: true,
  showSources: false,
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

// ==========================================
// Comprehensive Note Generation Functions
// ==========================================

/**
 * Format physical exam findings into readable text
 */
export function formatExamFindings(
  findings: Record<string, boolean>,
  sectionNotes?: Record<string, string>,
  noteLength: 'concise' | 'standard' | 'detailed' = 'standard'
): string {
  const sections: string[] = []

  // Mental Status
  const mentalStatus: string[] = []
  if (findings.locAwake) mentalStatus.push('Alert')
  if (findings.locDrowsy) mentalStatus.push('Drowsy')
  if (findings.locObtunded) mentalStatus.push('Obtunded')
  if (findings.locComatose) mentalStatus.push('Comatose')

  const orientation: string[] = []
  if (findings.orientName) orientation.push('person')
  if (findings.orientDate) orientation.push('date')
  if (findings.orientLocation) orientation.push('place')
  if (findings.orientSituation) orientation.push('situation')

  if (mentalStatus.length > 0 || orientation.length > 0) {
    let mental = mentalStatus.join(', ')
    if (orientation.length > 0) {
      mental += `${mental ? '. ' : ''}Oriented to ${orientation.join(', ')}`
    }
    if (findings.followingCommands) {
      mental += '. Following commands.'
    }
    if (sectionNotes?.mentalStatus) {
      mental += ` ${sectionNotes.mentalStatus}`
    }
    sections.push(`Mental Status: ${mental}`)
  }

  // Cranial Nerves
  const cranialNerves: string[] = []
  if (findings.visualFields) cranialNerves.push('visual fields full')
  if (findings.pupilsReactive) cranialNerves.push('pupils equal and reactive')
  if (findings.eomsFulll) cranialNerves.push('EOMs full')
  if (findings.facialSensation) cranialNerves.push('facial sensation intact')
  if (findings.faceSymmetric) cranialNerves.push('face symmetric')
  if (findings.hearingIntact) cranialNerves.push('hearing intact')
  if (findings.palateElevates) cranialNerves.push('palate elevates symmetrically')
  if (findings.tongueMidline) cranialNerves.push('tongue midline')

  if (cranialNerves.length > 0) {
    let cn = noteLength === 'concise' ? 'CN II-XII intact' : cranialNerves.join(', ')
    if (sectionNotes?.cranialNerves) {
      cn += `. ${sectionNotes.cranialNerves}`
    }
    sections.push(`Cranial Nerves: ${cn}`)
  }

  // Motor
  const motor: string[] = []
  if (findings.normalBulk) motor.push('normal bulk')
  if (findings.normalTone) motor.push('normal tone')
  if (findings.strength5) motor.push('5/5 strength throughout')
  if (findings.noPronatorDrift) motor.push('no pronator drift')

  if (motor.length > 0) {
    let m = noteLength === 'concise' ? 'Normal bulk, tone, and strength' : motor.join(', ')
    if (sectionNotes?.motor) {
      m += `. ${sectionNotes.motor}`
    }
    sections.push(`Motor: ${m}`)
  }

  // Sensation
  const sensation: string[] = []
  if (findings.lightTouch) sensation.push('light touch')
  if (findings.pinprick) sensation.push('pinprick')
  if (findings.vibration) sensation.push('vibration')
  if (findings.proprioception) sensation.push('proprioception')

  if (sensation.length > 0) {
    let s = noteLength === 'concise' ? 'Sensation intact' : `Intact to ${sensation.join(', ')}`
    if (sectionNotes?.sensation) {
      s += `. ${sectionNotes.sensation}`
    }
    sections.push(`Sensation: ${s}`)
  }

  // Coordination
  const coordination: string[] = []
  if (findings.fingerToNose) coordination.push('finger-to-nose')
  if (findings.heelToShin) coordination.push('heel-to-shin')
  if (findings.rapidAlternating) coordination.push('rapid alternating movements')

  if (coordination.length > 0) {
    let c = noteLength === 'concise' ? 'Coordination intact' : `Normal ${coordination.join(', ')}`
    if (sectionNotes?.coordination) {
      c += `. ${sectionNotes.coordination}`
    }
    sections.push(`Coordination: ${c}`)
  }

  // Gait
  const gait: string[] = []
  if (findings.gaitEvaluated) {
    if (findings.stationNormal) gait.push('station normal')
    if (findings.casualGait) gait.push('casual gait normal')
    if (findings.tandemGait) gait.push('tandem gait normal')
    if (findings.rombergNegative) gait.push('Romberg negative')

    if (gait.length > 0) {
      let g = gait.join(', ')
      if (sectionNotes?.gait) {
        g += `. ${sectionNotes.gait}`
      }
      sections.push(`Gait: ${g}`)
    } else if (sectionNotes?.gait) {
      sections.push(`Gait: ${sectionNotes.gait}`)
    }
  }

  return sections.join('\n')
}

/**
 * Format clinical scales into note text
 */
export function formatScales(
  scales: ScaleResult[],
  noteLength: 'concise' | 'standard' | 'detailed' = 'standard'
): string {
  if (!scales || scales.length === 0) return ''

  if (noteLength === 'concise') {
    return scales
      .map(s => `${s.abbreviation}: ${s.rawScore}${s.maxScore ? `/${s.maxScore}` : ''} (${s.severity})`)
      .join('; ')
  }

  return scales
    .map(s => {
      let line = `${s.scaleName} (${s.abbreviation}): ${s.rawScore}${s.maxScore ? `/${s.maxScore}` : ''}`
      line += ` - ${s.interpretation}`
      if (noteLength === 'detailed' && s.previousScore !== undefined) {
        const change = s.rawScore - s.previousScore
        const direction = change > 0 ? 'increased' : change < 0 ? 'decreased' : 'stable'
        line += ` (${direction} from ${s.previousScore})`
      }
      return line
    })
    .join('\n')
}

/**
 * Format diagnoses into assessment text
 */
export function formatDiagnoses(
  diagnoses: DiagnosisEntry[],
  noteLength: 'concise' | 'standard' | 'detailed' = 'standard'
): string {
  if (!diagnoses || diagnoses.length === 0) return ''

  return diagnoses
    .map((d, i) => {
      if (noteLength === 'concise') {
        return `${i + 1}. ${d.name} (${d.icd10})`
      }
      let line = `${i + 1}. ${d.name}`
      if (d.icd10) line += ` [${d.icd10}]`
      if (noteLength === 'detailed' && d.category) line += ` (${d.category})`
      return line
    })
    .join('\n')
}

/**
 * Format imaging studies into results text
 */
export function formatImagingStudies(
  studies: ImagingStudyEntry[],
  noteLength: 'concise' | 'standard' | 'detailed' = 'standard'
): string {
  if (!studies || studies.length === 0) return ''

  const documented = studies.filter(s => s.impression !== 'not-reviewed' && s.findings)

  if (documented.length === 0) return ''

  return documented
    .map(s => {
      let line = `${s.studyType} (${s.date}): ${s.impression.toUpperCase()}`
      if (noteLength !== 'concise' && s.findings) {
        line += `\n  ${s.findings}`
      }
      return line
    })
    .join('\n\n')
}

/**
 * Format lab results into text
 */
export function formatLabResults(
  labs: LabResultEntry[],
  noteLength: 'concise' | 'standard' | 'detailed' = 'standard'
): string {
  if (!labs || labs.length === 0) return ''

  return labs
    .map(l => {
      let line = l.testName
      if (l.value) line += `: ${l.value}`
      if (l.isAbnormal) line += ' *'
      if (noteLength === 'detailed' && l.date) line += ` (${l.date})`
      return line
    })
    .join(noteLength === 'concise' ? '; ' : '\n')
}

/**
 * Format recommendations into plan text
 */
export function formatRecommendations(
  recommendations: RecommendationItem[],
  noteLength: 'concise' | 'standard' | 'detailed' = 'standard'
): string {
  if (!recommendations || recommendations.length === 0) return ''

  if (noteLength === 'concise') {
    const allItems = recommendations.flatMap(r => r.items)
    return allItems.join('; ')
  }

  return recommendations
    .map(r => {
      const header = noteLength === 'detailed' && r.priority
        ? `[${r.priority.toUpperCase()}] ${r.category}`
        : r.category
      const items = r.items.map(item => `  • ${item}`).join('\n')
      return `${header}:\n${items}`
    })
    .join('\n\n')
}

/**
 * Generate a complete formatted clinical note from comprehensive data
 */
export function generateFormattedNote(
  data: ComprehensiveNoteData,
  preferences: Partial<NotePreferences> = {}
): FormattedNote {
  const prefs = { ...DEFAULT_PREFERENCES, ...preferences }
  const { noteType, noteLength } = prefs

  // Merge core clinical content
  const mergedNote = mergeNoteContent(
    data.manualData,
    data.chartPrepData || null,
    data.visitAIData || null
  )

  const sections: FormattedNoteSection[] = []
  let order = 0

  // Header
  const header = generateNoteHeader(data.patient, data.visit, noteType)

  // Chief Complaint / Reason for Consult
  sections.push({
    id: 'chiefComplaint',
    title: noteType === 'follow-up' ? 'Reason for Follow-up' : 'Chief Complaint / Reason for Consult',
    content: mergedNote.chiefComplaint.content || 'Not specified',
    source: mergedNote.chiefComplaint.source,
    isVerified: false,
    isEditable: true,
    order: order++,
  })

  // History of Present Illness
  sections.push({
    id: 'hpi',
    title: 'History of Present Illness',
    content: mergedNote.hpi.content || '',
    source: mergedNote.hpi.source,
    isVerified: false,
    isEditable: true,
    order: order++,
  })

  // For new consult, include more history sections
  if (noteType === 'new-consult') {
    // Allergies
    if (data.manualData.allergies) {
      let allergyContent = data.manualData.allergies
      if (data.manualData.allergyDetails) {
        allergyContent += `: ${data.manualData.allergyDetails}`
      }
      sections.push({
        id: 'allergies',
        title: 'Allergies',
        content: allergyContent,
        source: 'manual',
        isVerified: false,
        isEditable: true,
        order: order++,
      })
    }
  }

  // Review of Systems
  let rosContent = mergedNote.ros.content || ''
  if (data.manualData.rosDetails) {
    rosContent += rosContent ? `: ${data.manualData.rosDetails}` : data.manualData.rosDetails
  }
  sections.push({
    id: 'ros',
    title: 'Review of Systems',
    content: rosContent || 'Reviewed',
    source: mergedNote.ros.source,
    isVerified: false,
    isEditable: true,
    order: order++,
  })

  // Clinical Scales (if any and if enabled)
  if (prefs.includeScales && data.scales && data.scales.length > 0) {
    sections.push({
      id: 'scales',
      title: 'Clinical Scales',
      content: formatScales(data.scales, noteLength),
      source: 'scales',
      isVerified: false,
      isEditable: true,
      order: order++,
    })
  }

  // Physical Examination
  let examContent = mergedNote.physicalExam.content || ''
  if (data.examFindings && Object.keys(data.examFindings).length > 0) {
    const formattedExam = formatExamFindings(
      data.examFindings,
      data.examSectionNotes,
      noteLength
    )
    if (formattedExam) {
      examContent = examContent ? `${examContent}\n\n${formattedExam}` : formattedExam
    }
  }
  sections.push({
    id: 'physicalExam',
    title: 'Physical Examination',
    content: examContent || 'Deferred',
    source: data.examFindings ? 'manual' : mergedNote.physicalExam.source,
    isVerified: false,
    isEditable: true,
    order: order++,
  })

  // Imaging/Results (if enabled)
  if (prefs.includeImaging && data.imagingStudies && data.imagingStudies.length > 0) {
    const imagingContent = formatImagingStudies(data.imagingStudies, noteLength)
    if (imagingContent) {
      sections.push({
        id: 'imaging',
        title: 'Imaging Results',
        content: imagingContent,
        source: 'imaging',
        isVerified: false,
        isEditable: true,
        order: order++,
      })
    }
  }

  // Lab Results (if enabled)
  if (prefs.includeLabs && data.labResults && data.labResults.length > 0) {
    const labContent = formatLabResults(data.labResults, noteLength)
    if (labContent) {
      sections.push({
        id: 'labs',
        title: 'Laboratory Results',
        content: labContent,
        source: 'manual',
        isVerified: false,
        isEditable: true,
        order: order++,
      })
    }
  }

  // Assessment
  let assessmentContent = mergedNote.assessment.content || ''
  if (data.diagnoses && data.diagnoses.length > 0) {
    const diagContent = formatDiagnoses(data.diagnoses, noteLength)
    if (diagContent) {
      assessmentContent = assessmentContent
        ? `${assessmentContent}\n\nDifferential Diagnosis:\n${diagContent}`
        : `Differential Diagnosis:\n${diagContent}`
    }
  }
  sections.push({
    id: 'assessment',
    title: 'Assessment',
    content: assessmentContent || '',
    source: mergedNote.assessment.source,
    isVerified: false,
    isEditable: true,
    order: order++,
  })

  // Plan
  let planContent = mergedNote.plan.content || ''
  if (prefs.includeRecommendations && data.recommendations && data.recommendations.length > 0) {
    const recsContent = formatRecommendations(data.recommendations, noteLength)
    if (recsContent) {
      planContent = planContent
        ? `${planContent}\n\n${recsContent}`
        : recsContent
    }
  }
  sections.push({
    id: 'plan',
    title: 'Plan',
    content: planContent || '',
    source: data.recommendations?.length ? 'recommendations' : mergedNote.plan.source,
    isVerified: false,
    isEditable: true,
    order: order++,
  })

  // Footer
  const footer = generateNoteFooter(data.visit?.provider)

  // Generate full text
  const fullText = generateFullNoteText(header, sections, footer, prefs.showSources)

  return {
    header,
    sections,
    footer,
    fullText,
    wordCount: fullText.split(/\s+/).length,
    generatedAt: new Date().toISOString(),
  }
}

/**
 * Generate note header with patient and visit info
 */
function generateNoteHeader(
  patient?: { name: string; dob?: string; mrn?: string; age?: number; gender?: string },
  visit?: { date: string; type?: string; provider?: string; location?: string },
  noteType: 'new-consult' | 'follow-up' = 'new-consult'
): string {
  const lines: string[] = []

  const noteTitle = noteType === 'follow-up'
    ? 'NEUROLOGY FOLLOW-UP NOTE'
    : 'NEUROLOGY CONSULTATION NOTE'
  lines.push(noteTitle)
  lines.push('='.repeat(noteTitle.length))
  lines.push('')

  if (patient) {
    lines.push(`Patient: ${patient.name}`)
    if (patient.dob) lines.push(`DOB: ${patient.dob}`)
    if (patient.mrn) lines.push(`MRN: ${patient.mrn}`)
    if (patient.age !== undefined || patient.gender) {
      const demo = [patient.age ? `${patient.age} y/o` : '', patient.gender || ''].filter(Boolean).join(' ')
      if (demo) lines.push(`Demographics: ${demo}`)
    }
  }

  if (visit) {
    lines.push(`Date of Service: ${visit.date}`)
    if (visit.type) lines.push(`Visit Type: ${visit.type}`)
    if (visit.location) lines.push(`Location: ${visit.location}`)
    if (visit.provider) lines.push(`Provider: ${visit.provider}`)
  }

  lines.push('')
  return lines.join('\n')
}

/**
 * Generate note footer
 */
function generateNoteFooter(provider?: string): string {
  const lines: string[] = ['']
  lines.push('-'.repeat(40))

  if (provider) {
    lines.push(`Electronically signed by: ${provider}`)
  }
  lines.push(`Date: ${new Date().toLocaleDateString()}`)
  lines.push(`Time: ${new Date().toLocaleTimeString()}`)

  return lines.join('\n')
}

/**
 * Generate full text version of the note for copying to EHR
 */
function generateFullNoteText(
  header: string,
  sections: FormattedNoteSection[],
  footer: string,
  showSources: boolean
): string {
  const lines: string[] = [header]

  for (const section of sections.sort((a, b) => a.order - b.order)) {
    if (!section.content) continue

    lines.push(`${section.title.toUpperCase()}:`)
    lines.push(section.content)
    if (showSources && section.source !== 'manual') {
      lines.push(`[Source: ${section.source}]`)
    }
    lines.push('')
  }

  lines.push(footer)

  return lines.join('\n')
}

/**
 * Update a section in the formatted note
 */
export function updateFormattedNoteSection(
  note: FormattedNote,
  sectionId: string,
  newContent: string
): FormattedNote {
  const updatedSections = note.sections.map(section =>
    section.id === sectionId
      ? { ...section, content: newContent, source: 'manual' as ContentSource }
      : section
  )

  const fullText = generateFullNoteText(note.header, updatedSections, note.footer, false)

  return {
    ...note,
    sections: updatedSections,
    fullText,
    wordCount: fullText.split(/\s+/).length,
  }
}

/**
 * Mark a section as verified
 */
export function verifySectionInNote(
  note: FormattedNote,
  sectionId: string,
  verified: boolean
): FormattedNote {
  return {
    ...note,
    sections: note.sections.map(section =>
      section.id === sectionId
        ? { ...section, isVerified: verified }
        : section
    ),
  }
}

/**
 * Check if all required sections are verified
 */
export function areRequiredSectionsVerified(note: FormattedNote): boolean {
  const requiredSections = ['chiefComplaint', 'hpi', 'physicalExam', 'assessment', 'plan']
  return requiredSections.every(id =>
    note.sections.find(s => s.id === id)?.isVerified === true
  )
}
