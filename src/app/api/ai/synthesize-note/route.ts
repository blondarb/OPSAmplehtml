import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'

interface SynthesizeNoteRequest {
  noteType: 'new-consult' | 'follow-up'
  noteLength: 'concise' | 'standard' | 'detailed'
  manualData: {
    chiefComplaint?: string | string[]
    hpi?: string
    ros?: string
    rosDetails?: string
    physicalExam?: string
    assessment?: string
    plan?: string
    allergies?: string
    allergyDetails?: string
  }
  chartPrepData?: {
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
  visitAIData?: {
    hpiFromVisit?: string
    rosFromVisit?: string
    examFromVisit?: string
    assessmentFromVisit?: string
    planFromVisit?: string
  }
  scales?: Array<{
    scaleName: string
    abbreviation: string
    rawScore: number
    maxScore?: number
    interpretation: string
    severity: string
  }>
  diagnoses?: Array<{
    name: string
    icd10: string
    isPrimary?: boolean
  }>
  imagingStudies?: Array<{
    studyType: string
    date: string
    impression: string
    findings?: string
  }>
  recommendations?: Array<{
    category: string
    items: string[]
  }>
  patient?: {
    name: string
    age?: number
    gender?: string
  }
  userSettings?: {
    globalInstructions?: string
    sectionInstructions?: Record<string, string>
    documentationStyle?: string
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: SynthesizeNoteRequest = await request.json()
    const {
      noteType,
      noteLength,
      manualData,
      chartPrepData,
      visitAIData,
      scales,
      diagnoses,
      imagingStudies,
      recommendations,
      patient,
      userSettings,
    } = body

    // Get OpenAI API key
    let apiKey = process.env.OPENAI_API_KEY

    if (!apiKey) {
      const { data: settings } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'openai_api_key')
        .single()

      apiKey = settings?.value
    }

    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
    }

    const openai = new OpenAI({ apiKey })

    // Build comprehensive context for the AI
    const context = buildNoteContext({
      manualData,
      chartPrepData,
      visitAIData,
      scales,
      diagnoses,
      imagingStudies,
      recommendations,
      patient,
    })

    // Build the synthesis prompt based on note type and length
    const systemPrompt = buildSystemPrompt(noteType, noteLength, userSettings)
    const userPrompt = buildUserPrompt(context, noteType, noteLength)

    const response = await openai.chat.completions.create({
      model: 'gpt-5', // Best reasoning for complex note synthesis ($1.25/$10 per 1M tokens)
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      return NextResponse.json({ error: 'No response from AI' }, { status: 500 })
    }

    const synthesizedNote = JSON.parse(content)

    return NextResponse.json({
      success: true,
      synthesizedNote,
      noteType,
      noteLength,
    })

  } catch (error) {
    console.error('Error synthesizing note:', error)
    return NextResponse.json(
      { error: 'Failed to synthesize note' },
      { status: 500 }
    )
  }
}

function buildNoteContext(data: {
  manualData: SynthesizeNoteRequest['manualData']
  chartPrepData?: SynthesizeNoteRequest['chartPrepData']
  visitAIData?: SynthesizeNoteRequest['visitAIData']
  scales?: SynthesizeNoteRequest['scales']
  diagnoses?: SynthesizeNoteRequest['diagnoses']
  imagingStudies?: SynthesizeNoteRequest['imagingStudies']
  recommendations?: SynthesizeNoteRequest['recommendations']
  patient?: SynthesizeNoteRequest['patient']
}): string {
  const sections: string[] = []

  // Patient info
  if (data.patient) {
    const patientInfo = [data.patient.name]
    if (data.patient.age) patientInfo.push(`${data.patient.age} y/o`)
    if (data.patient.gender) patientInfo.push(data.patient.gender)
    sections.push(`PATIENT: ${patientInfo.join(', ')}`)
  }

  // Chief Complaint
  const cc = data.manualData?.chiefComplaint
  if (cc) {
    const ccText = Array.isArray(cc) ? cc.join(', ') : cc
    sections.push(`CHIEF COMPLAINT: ${ccText}`)
  }

  // HPI - combine sources
  const hpiSources: string[] = []
  if (data.manualData?.hpi) hpiSources.push(`Manual Entry:\n${data.manualData.hpi}`)
  if (data.chartPrepData?.suggestedHPI) hpiSources.push(`Chart Prep Summary:\n${data.chartPrepData.suggestedHPI}`)
  if (data.visitAIData?.hpiFromVisit) hpiSources.push(`Visit Transcription:\n${data.visitAIData.hpiFromVisit}`)
  if (hpiSources.length > 0) {
    sections.push(`HPI SOURCES:\n${hpiSources.join('\n\n')}`)
  }

  // Chart Prep Additional Context
  if (data.chartPrepData) {
    const cpSections: string[] = []
    if (data.chartPrepData.patientSummary) cpSections.push(`Patient Summary: ${data.chartPrepData.patientSummary}`)
    if (data.chartPrepData.relevantHistory) cpSections.push(`Relevant History: ${data.chartPrepData.relevantHistory}`)
    if (data.chartPrepData.currentMedications) cpSections.push(`Current Medications: ${data.chartPrepData.currentMedications}`)
    if (data.chartPrepData.imagingFindings) cpSections.push(`Prior Imaging: ${data.chartPrepData.imagingFindings}`)
    if (data.chartPrepData.scaleTrends) cpSections.push(`Scale Trends: ${data.chartPrepData.scaleTrends}`)
    if (data.chartPrepData.keyConsiderations) cpSections.push(`Key Considerations: ${data.chartPrepData.keyConsiderations}`)
    if (cpSections.length > 0) {
      sections.push(`PRE-VISIT CONTEXT:\n${cpSections.join('\n')}`)
    }
  }

  // ROS
  const rosSources: string[] = []
  if (data.manualData?.ros) rosSources.push(data.manualData.ros)
  if (data.manualData?.rosDetails) rosSources.push(data.manualData.rosDetails)
  if (data.visitAIData?.rosFromVisit) rosSources.push(`From visit: ${data.visitAIData.rosFromVisit}`)
  if (rosSources.length > 0) {
    sections.push(`REVIEW OF SYSTEMS:\n${rosSources.join('\n')}`)
  }

  // Allergies
  if (data.manualData?.allergies) {
    let allergyText = data.manualData.allergies
    if (data.manualData.allergyDetails) allergyText += `: ${data.manualData.allergyDetails}`
    sections.push(`ALLERGIES: ${allergyText}`)
  }

  // Clinical Scales
  if (data.scales && data.scales.length > 0) {
    const scaleLines = data.scales.map(s =>
      `${s.scaleName} (${s.abbreviation}): ${s.rawScore}${s.maxScore ? `/${s.maxScore}` : ''} - ${s.interpretation} (${s.severity})`
    )
    sections.push(`CLINICAL SCALES:\n${scaleLines.join('\n')}`)
  }

  // Physical Exam
  const examSources: string[] = []
  if (data.manualData?.physicalExam) examSources.push(`Manual:\n${data.manualData.physicalExam}`)
  if (data.visitAIData?.examFromVisit) examSources.push(`From visit:\n${data.visitAIData.examFromVisit}`)
  if (examSources.length > 0) {
    sections.push(`PHYSICAL EXAMINATION:\n${examSources.join('\n\n')}`)
  }

  // Imaging Studies
  if (data.imagingStudies && data.imagingStudies.length > 0) {
    const imagingLines = data.imagingStudies
      .filter(s => s.impression !== 'not-reviewed')
      .map(s => {
        let line = `${s.studyType} (${s.date}): ${s.impression.toUpperCase()}`
        if (s.findings) line += `\n  ${s.findings}`
        return line
      })
    if (imagingLines.length > 0) {
      sections.push(`IMAGING RESULTS:\n${imagingLines.join('\n')}`)
    }
  }

  // Diagnoses
  if (data.diagnoses && data.diagnoses.length > 0) {
    const diagLines = data.diagnoses.map((d, i) =>
      `${i + 1}. ${d.name} [${d.icd10}]${d.isPrimary ? ' (Primary)' : ''}`
    )
    sections.push(`DIFFERENTIAL DIAGNOSIS:\n${diagLines.join('\n')}`)
  }

  // Assessment - combine sources
  const assessmentSources: string[] = []
  if (data.manualData?.assessment) assessmentSources.push(`Manual:\n${data.manualData.assessment}`)
  if (data.chartPrepData?.suggestedAssessment) assessmentSources.push(`Chart Prep:\n${data.chartPrepData.suggestedAssessment}`)
  if (data.visitAIData?.assessmentFromVisit) assessmentSources.push(`From visit:\n${data.visitAIData.assessmentFromVisit}`)
  if (assessmentSources.length > 0) {
    sections.push(`ASSESSMENT SOURCES:\n${assessmentSources.join('\n\n')}`)
  }

  // Plan - combine sources
  const planSources: string[] = []
  if (data.manualData?.plan) planSources.push(`Manual:\n${data.manualData.plan}`)
  if (data.chartPrepData?.suggestedPlan) planSources.push(`Chart Prep:\n${data.chartPrepData.suggestedPlan}`)
  if (data.visitAIData?.planFromVisit) planSources.push(`From visit:\n${data.visitAIData.planFromVisit}`)
  if (planSources.length > 0) {
    sections.push(`PLAN SOURCES:\n${planSources.join('\n\n')}`)
  }

  // Recommendations
  if (data.recommendations && data.recommendations.length > 0) {
    const recLines = data.recommendations.map(r =>
      `${r.category}:\n${r.items.map(item => `  • ${item}`).join('\n')}`
    )
    sections.push(`SMART RECOMMENDATIONS:\n${recLines.join('\n\n')}`)
  }

  return sections.join('\n\n---\n\n')
}

function buildSystemPrompt(
  noteType: 'new-consult' | 'follow-up',
  noteLength: 'concise' | 'standard' | 'detailed',
  userSettings?: SynthesizeNoteRequest['userSettings']
): string {
  const lengthGuidance = {
    concise: 'Be brief and focused. Use short sentences. Only include essential information.',
    standard: 'Provide complete documentation with appropriate detail. Balance thoroughness with readability.',
    detailed: 'Be comprehensive. Include all relevant details, nuances, and clinical reasoning.',
  }

  const noteTypeGuidance = noteType === 'new-consult'
    ? `This is a NEW CONSULTATION note. Include:
- Comprehensive history and background
- Detailed reason for referral/consultation
- Full review of systems
- Complete physical examination
- Thorough differential diagnosis with reasoning
- Comprehensive initial workup and treatment plan`
    : `This is a FOLLOW-UP note. Focus on:
- Interval history since last visit
- Response to previous treatments
- Any new symptoms or concerns
- Pertinent exam findings (changes from baseline)
- Assessment of progress
- Plan adjustments and next steps`

  let prompt = `You are a neurology clinical documentation specialist. Your task is to synthesize multiple information sources into a cohesive, professional clinical note.

NOTE TYPE: ${noteType === 'new-consult' ? 'New Consultation' : 'Follow-up Visit'}
${noteTypeGuidance}

DOCUMENTATION LENGTH: ${noteLength.toUpperCase()}
${lengthGuidance[noteLength]}

DOCUMENTATION STYLE:
- Use professional medical language appropriate for clinical documentation
- Write in third person (e.g., "Patient reports..." not "You report...")
- Be factual and objective
- Avoid redundancy - synthesize overlapping information from different sources
- Prioritize clinically relevant information
- Use standard medical abbreviations appropriately
- Structure content logically within each section`

  if (userSettings?.globalInstructions) {
    prompt += `\n\nADDITIONAL PROVIDER INSTRUCTIONS:\n${userSettings.globalInstructions}`
  }

  if (userSettings?.documentationStyle) {
    prompt += `\n\nPREFERRED STYLE: ${userSettings.documentationStyle}`
  }

  prompt += `\n\nOUTPUT FORMAT:
Return a JSON object with synthesized content for each section. Each section should be a single, coherent narrative - NOT a list of sources.

{
  "chiefComplaint": "synthesized chief complaint",
  "hpi": "synthesized history of present illness narrative",
  "ros": "synthesized review of systems",
  "allergies": "allergy information",
  "physicalExam": "synthesized physical examination findings",
  "scales": "clinical scales summary (if any)",
  "imaging": "imaging results summary (if any)",
  "assessment": "synthesized clinical assessment with differential diagnosis",
  "plan": "synthesized comprehensive treatment plan"
}

IMPORTANT:
- Synthesize and merge information intelligently - do not just concatenate
- Resolve any contradictions by preferring more recent/specific information (visit > chart prep > manual)
- Remove duplicate information
- Create flowing, readable prose appropriate for a medical record
- If a section has no relevant information, return an empty string for that field`

  return prompt
}

function buildUserPrompt(
  context: string,
  noteType: 'new-consult' | 'follow-up',
  noteLength: 'concise' | 'standard' | 'detailed'
): string {
  return `Please synthesize the following clinical information into a cohesive ${noteType === 'new-consult' ? 'new consultation' : 'follow-up'} note. Create ${noteLength} documentation.

SOURCE INFORMATION:
${context}

Remember to:
1. Merge overlapping information from different sources into coherent narratives
2. Maintain clinical accuracy and professional language
3. Structure each section appropriately for the note type
4. Return the synthesized note as a JSON object with section keys`
}
