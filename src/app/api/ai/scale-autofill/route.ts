import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { ALL_SCALES } from '@/lib/scales/scale-definitions'
import { ScaleDefinition, ScaleQuestion } from '@/lib/scales/types'

interface ScaleAutofillRequest {
  scaleId: string
  clinicalText: string
  patientContext?: {
    age?: number
    sex?: string
    diagnoses?: string[]
    medications?: string[]
    medicalHistory?: string[]
    allergies?: string[]
    vitalSigns?: {
      bloodPressure?: string
      heartRate?: number
      weight?: number
      height?: number
    }
  }
}

interface AutofillResult {
  responses: Record<string, number | boolean | string>
  confidence: Record<string, 'high' | 'medium' | 'low'>
  reasoning: Record<string, string>
  missingInfo: string[]
  suggestedPrompts: string[]
}

function buildScalePrompt(scale: ScaleDefinition): string {
  const questionDescriptions = scale.questions.map(q => {
    let desc = `- ${q.id}: "${q.text}"`
    if (q.helpText) {
      desc += ` (Help: ${q.helpText})`
    }
    if (q.options) {
      desc += `\n  Options: ${q.options.map(o => `${o.value}="${o.label}"`).join(', ')}`
    }
    if (q.type === 'number') {
      desc += ` (Number, min: ${q.min ?? 0}, max: ${q.max ?? 100})`
    }
    if (q.type === 'boolean') {
      desc += ` (Yes/No)`
    }
    return desc
  }).join('\n')

  return `Scale: ${scale.name} (${scale.abbreviation})
Description: ${scale.description}

Questions to extract answers for:
${questionDescriptions}`
}

function buildExtractionPrompt(scale: ScaleDefinition, clinicalText: string, patientContext?: ScaleAutofillRequest['patientContext']): string {
  const scalePrompt = buildScalePrompt(scale)

  // Build comprehensive patient context section
  let contextSection = ''
  if (patientContext) {
    const contextParts: string[] = []

    // Demographics - critical for scales like CHA2DS2-VASc that use age/sex
    if (patientContext.age !== undefined) {
      contextParts.push(`Age: ${patientContext.age} years`)
      // Add age-related flags for common scale thresholds
      if (patientContext.age >= 75) contextParts.push('  → Age ≥75 years (relevant for stroke risk scales)')
      else if (patientContext.age >= 65) contextParts.push('  → Age 65-74 years (relevant for stroke risk scales)')
    }
    if (patientContext.sex) {
      contextParts.push(`Sex: ${patientContext.sex}`)
    }

    // Vital signs - important for scales like CHA2DS2-VASc (hypertension)
    if (patientContext.vitalSigns) {
      const vitals: string[] = []
      if (patientContext.vitalSigns.bloodPressure) {
        vitals.push(`Blood Pressure: ${patientContext.vitalSigns.bloodPressure}`)
        // Parse BP to flag hypertension
        const bpMatch = patientContext.vitalSigns.bloodPressure.match(/(\d+)\s*\/\s*(\d+)/)
        if (bpMatch) {
          const systolic = parseInt(bpMatch[1])
          const diastolic = parseInt(bpMatch[2])
          if (systolic >= 140 || diastolic >= 90) {
            vitals.push('  → BP ≥140/90 (meets hypertension criteria)')
          }
        }
      }
      if (patientContext.vitalSigns.heartRate) vitals.push(`Heart Rate: ${patientContext.vitalSigns.heartRate} bpm`)
      if (patientContext.vitalSigns.weight) vitals.push(`Weight: ${patientContext.vitalSigns.weight} kg`)
      if (patientContext.vitalSigns.height) vitals.push(`Height: ${patientContext.vitalSigns.height} cm`)
      if (vitals.length > 0) contextParts.push(`Vital Signs:\n${vitals.join('\n')}`)
    }

    // Active diagnoses - critical for risk stratification scales
    if (patientContext.diagnoses?.length) {
      contextParts.push(`Current Diagnoses: ${patientContext.diagnoses.join(', ')}`)
      // Flag relevant conditions for common scales
      const dx = patientContext.diagnoses.map(d => d.toLowerCase())
      const flags: string[] = []
      if (dx.some(d => d.includes('heart failure') || d.includes('chf') || d.includes('cardiomyopathy'))) {
        flags.push('  → CHF/LV dysfunction present (relevant for stroke risk)')
      }
      if (dx.some(d => d.includes('hypertension') || d.includes('htn'))) {
        flags.push('  → Hypertension present (relevant for stroke risk)')
      }
      if (dx.some(d => d.includes('diabetes') || d.includes('dm') || d.includes('a1c'))) {
        flags.push('  → Diabetes mellitus present (relevant for stroke risk)')
      }
      if (dx.some(d => d.includes('stroke') || d.includes('tia') || d.includes('cva') || d.includes('embolism'))) {
        flags.push('  → Prior stroke/TIA/thromboembolism (relevant for stroke risk)')
      }
      if (dx.some(d => d.includes('peripheral') || d.includes('pad') || d.includes('mi') || d.includes('myocardial') || d.includes('coronary'))) {
        flags.push('  → Vascular disease present (relevant for stroke risk)')
      }
      if (dx.some(d => d.includes('atrial fibrillation') || d.includes('afib') || d.includes('a-fib'))) {
        flags.push('  → Atrial fibrillation present')
      }
      if (flags.length > 0) contextParts.push(flags.join('\n'))
    }

    // Medical history
    if (patientContext.medicalHistory?.length) {
      contextParts.push(`Medical History: ${patientContext.medicalHistory.join(', ')}`)
    }

    // Medications - can indicate conditions (e.g., antihypertensives = hypertension)
    if (patientContext.medications?.length) {
      contextParts.push(`Current Medications: ${patientContext.medications.join(', ')}`)
      // Flag medication-implied conditions
      const meds = patientContext.medications.map(m => m.toLowerCase())
      const medFlags: string[] = []
      if (meds.some(m => m.includes('metformin') || m.includes('insulin') || m.includes('glipizide') || m.includes('glyburide') || m.includes('januvia') || m.includes('jardiance') || m.includes('ozempic'))) {
        medFlags.push('  → Diabetes medications detected (implies diabetes)')
      }
      if (meds.some(m => m.includes('lisinopril') || m.includes('losartan') || m.includes('amlodipine') || m.includes('metoprolol') || m.includes('hydrochlorothiazide') || m.includes('hctz'))) {
        medFlags.push('  → Antihypertensive medications detected (may indicate hypertension)')
      }
      if (meds.some(m => m.includes('warfarin') || m.includes('eliquis') || m.includes('xarelto') || m.includes('pradaxa') || m.includes('apixaban') || m.includes('rivaroxaban'))) {
        medFlags.push('  → Anticoagulation detected')
      }
      if (meds.some(m => m.includes('sinemet') || m.includes('carbidopa') || m.includes('levodopa') || m.includes('ropinirole') || m.includes('pramipexole'))) {
        medFlags.push('  → Parkinson\'s medications detected')
      }
      if (medFlags.length > 0) contextParts.push(medFlags.join('\n'))
    }

    // Allergies
    if (patientContext.allergies?.length) {
      contextParts.push(`Allergies: ${patientContext.allergies.join(', ')}`)
    }

    if (contextParts.length > 0) {
      contextSection = `\n=== PATIENT DATA (USE THIS FOR SCALE COMPLETION) ===\n${contextParts.join('\n\n')}\n=== END PATIENT DATA ===\n`
    }
  }

  return `You are a clinical documentation AI assistant helping to extract structured data from clinical notes for clinical assessment scales.

${scalePrompt}
${contextSection}
Clinical Text to Analyze:
"""
${clinicalText}
"""

TASK: Extract answers to the scale questions from ALL available data sources above (patient demographics, vital signs, diagnoses, medications, AND clinical text). For each question:
1. FIRST check if the answer can be derived from patient demographics (age, sex) or existing diagnoses/medications
2. Then look for explicit mentions in the clinical text
3. Map the description to the closest matching option value
4. Assign a confidence level based on how explicit the information is
5. Provide brief reasoning citing the data source (e.g., "Patient age is 72 from demographics", "Hypertension from diagnosis list")
6. List any information that is NOT available from any source

CRITICAL RULES FOR USING PATIENT DATA:
- Age questions: Use the patient's age from demographics directly
- Sex questions: Use the patient's sex from demographics directly
- Condition questions (CHF, diabetes, hypertension, etc.): Check the diagnoses list AND medications that imply conditions
- Blood pressure questions: Use vital signs if available
- Prior stroke/TIA: Check diagnoses list for stroke, TIA, CVA, or embolic events

IMPORTANT RULES:
- USE ALL AVAILABLE DATA - demographics, vitals, diagnoses, medications, AND clinical notes
- For demographic-based questions (age, sex), use patient data with HIGH confidence
- For condition-based questions, diagnoses list = HIGH confidence, medication-implied = MEDIUM confidence
- If information is ambiguous in clinical text but clear in patient data, use patient data
- If information is completely absent from all sources, mark as missing
- For exam findings, respect what the examiner documented
- For patient-reported symptoms, map to the closest frequency/severity option

Respond with a JSON object in this exact format:
{
  "responses": {
    "question_id": value,
    ...
  },
  "confidence": {
    "question_id": "high" | "medium" | "low",
    ...
  },
  "reasoning": {
    "question_id": "Brief explanation citing data source (demographics/vitals/diagnoses/medications/clinical text)",
    ...
  },
  "missingInfo": ["List of questions that could not be answered from ANY source"],
  "suggestedPrompts": ["Questions to ask the clinician/patient to fill in missing data"]
}

Include question IDs where you found relevant information from ANY source. Do not include questions with no data from any source.`
}

export async function POST(request: Request) {
  try {
    // Check authentication
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { scaleId, clinicalText, patientContext }: ScaleAutofillRequest = await request.json()

    if (!scaleId) {
      return NextResponse.json({ error: 'Scale ID is required' }, { status: 400 })
    }

    if (!clinicalText || clinicalText.trim().length === 0) {
      return NextResponse.json({ error: 'Clinical text is required' }, { status: 400 })
    }

    const scale = ALL_SCALES[scaleId]
    if (!scale) {
      return NextResponse.json({ error: `Scale "${scaleId}" not found` }, { status: 400 })
    }

    // Get OpenAI API key
    let apiKey = process.env.OPENAI_API_KEY

    if (!apiKey) {
      const { data: setting } = await supabase.rpc('get_openai_key')
      apiKey = setting
    }

    if (!apiKey) {
      return NextResponse.json({
        error: 'OpenAI API key not configured. Please add your API key to the environment variables or Supabase settings.'
      }, { status: 500 })
    }

    const openai = new OpenAI({ apiKey })

    const prompt = buildExtractionPrompt(scale, clinicalText, patientContext)

    const completion = await openai.chat.completions.create({
      model: 'gpt-5.2', // Best reasoning for structured extraction ($1.25/$10 per 1M tokens)
      messages: [
        { role: 'system', content: 'You are a clinical documentation expert specializing in neurology. Extract structured data from clinical notes AND patient demographics/history accurately. Use all available patient data (age, sex, diagnoses, medications, vitals) to complete scale questions. Never hallucinate information not present in any data source.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 2500,
      temperature: 0.1, // Very low temperature for maximum consistency
      response_format: { type: 'json_object' }
    })

    const responseText = completion.choices[0]?.message?.content || '{}'

    let result: AutofillResult
    try {
      result = JSON.parse(responseText)
    } catch {
      return NextResponse.json({
        error: 'Failed to parse AI response',
        rawResponse: responseText
      }, { status: 500 })
    }

    // Validate extracted responses against scale question types
    const validatedResponses: Record<string, number | boolean | string> = {}
    const validationWarnings: string[] = []

    for (const [questionId, value] of Object.entries(result.responses || {})) {
      const question = scale.questions.find(q => q.id === questionId)
      if (!question) {
        validationWarnings.push(`Unknown question ID: ${questionId}`)
        continue
      }

      // Validate value is appropriate for question type
      if (question.type === 'boolean') {
        validatedResponses[questionId] = Boolean(value)
      } else if (question.type === 'number') {
        const numVal = Number(value)
        if (!isNaN(numVal)) {
          // Clamp to min/max if specified
          const min = question.min ?? 0
          const max = question.max ?? 999
          validatedResponses[questionId] = Math.min(Math.max(numVal, min), max)
        }
      } else if (question.type === 'select' || question.type === 'radio') {
        // Ensure value is one of the valid options
        if (question.options) {
          const validValues = question.options.map(o => o.value)
          if (validValues.includes(value as number)) {
            validatedResponses[questionId] = value as number
          } else {
            validationWarnings.push(`Invalid option for ${questionId}: ${value}`)
          }
        }
      }
    }

    return NextResponse.json({
      scaleId,
      scaleName: scale.name,
      responses: validatedResponses,
      confidence: result.confidence || {},
      reasoning: result.reasoning || {},
      missingInfo: result.missingInfo || [],
      suggestedPrompts: result.suggestedPrompts || [],
      validationWarnings,
      questionsCount: scale.questions.length,
      answeredCount: Object.keys(validatedResponses).length,
    })

  } catch (error: any) {
    console.error('Scale Autofill API Error:', error)

    if (error?.status === 401) {
      return NextResponse.json({
        error: 'Invalid OpenAI API key. Please check your configuration.'
      }, { status: 500 })
    }

    return NextResponse.json({
      error: error?.message || 'An error occurred while processing your request'
    }, { status: 500 })
  }
}
