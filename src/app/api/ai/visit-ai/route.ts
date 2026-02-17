import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient as createDeepgramClient } from '@deepgram/sdk'
import { createClient } from '@/lib/supabase/server'

// Allow up to 120s for long audio transcription + GPT processing
export const maxDuration = 120

interface UserSettings {
  globalAiInstructions?: string
  documentationStyle?: 'concise' | 'detailed' | 'narrative'
  preferredTerminology?: 'formal' | 'standard' | 'simplified'
}

export async function POST(request: Request) {
  try {
    // Check authentication
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const audioFile = formData.get('audio') as File
    const patientData = formData.get('patient') as string
    const chartPrepData = formData.get('chartPrep') as string
    const userSettingsData = formData.get('userSettings') as string

    if (!audioFile) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 })
    }

    // File size check (25MB limit)
    const MAX_FILE_SIZE = 25 * 1024 * 1024
    if (audioFile.size > MAX_FILE_SIZE) {
      return NextResponse.json({
        error: `Audio file too large (${(audioFile.size / (1024 * 1024)).toFixed(1)}MB). Maximum is 25MB.`
      }, { status: 400 })
    }

    // Check for Deepgram API key
    const deepgramKey = process.env.DEEPGRAM_API_KEY
    if (!deepgramKey) {
      return NextResponse.json({
        error: 'Deepgram API key not configured. Please add DEEPGRAM_API_KEY to your environment variables.'
      }, { status: 500 })
    }

    // Get OpenAI API key for GPT clinical extraction
    let openaiKey = process.env.OPENAI_API_KEY
    if (!openaiKey) {
      const { data: setting } = await supabase.rpc('get_openai_key')
      openaiKey = setting
    }
    if (!openaiKey) {
      return NextResponse.json({
        error: 'OpenAI API key not configured'
      }, { status: 500 })
    }

    // Step 1: Transcribe the audio with Deepgram (speaker diarization enabled)
    const arrayBuffer = await audioFile.arrayBuffer()
    const audioBuffer = Buffer.from(arrayBuffer)

    const deepgram = createDeepgramClient(deepgramKey)
    const { result, error: dgError } = await deepgram.listen.prerecorded.transcribeFile(
      audioBuffer,
      {
        model: 'nova-3',
        smart_format: true,
        language: 'en',
        punctuate: true,
        diarize: true,       // Speaker diarization — identifies who is speaking
        utterances: true,    // Split into speaker turns
        paragraphs: true,    // Group into paragraphs
      }
    )

    if (dgError) {
      console.error('Deepgram transcription error:', dgError)
      return NextResponse.json({
        error: 'Transcription failed. Please try again.'
      }, { status: 500 })
    }

    // Get the plain transcript
    const plainTranscript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() || ''

    if (!plainTranscript || plainTranscript.length === 0) {
      return NextResponse.json({
        error: 'No speech detected in the recording'
      }, { status: 400 })
    }

    // Build diarized transcript from utterances (speaker-labeled)
    const utterances = result?.results?.utterances || []
    let diarizedTranscript = plainTranscript // fallback if no utterances

    if (utterances.length > 0) {
      diarizedTranscript = utterances
        .map((u: any) => `Speaker ${u.speaker}: ${u.transcript}`)
        .join('\n')
    }

    // Build segments from utterances for downstream consumers
    const segments = utterances.map((u: any) => ({
      text: u.transcript,
      start: u.start,
      end: u.end,
      speaker: u.speaker,
    }))

    console.log('Deepgram diarized transcript:', diarizedTranscript.substring(0, 300))
    console.log('Speakers detected:', new Set(utterances.map((u: any) => u.speaker)).size)

    // Parse patient, chart prep, and user settings data if provided
    let patient = null
    let chartPrep = null
    let userSettings: UserSettings | null = null
    try {
      if (patientData) patient = JSON.parse(patientData)
      if (chartPrepData) chartPrep = JSON.parse(chartPrepData)
      if (userSettingsData) userSettings = JSON.parse(userSettingsData)
    } catch (e) {
      // Ignore parse errors
    }

    // Build context for AI processing
    const patientContext = patient ? `
Patient Information:
- Name: ${patient.first_name} ${patient.last_name}
- Age: ${patient.date_of_birth ? new Date().getFullYear() - new Date(patient.date_of_birth).getFullYear() : 'Unknown'}
- Gender: ${patient.gender || 'Unknown'}
` : ''

    const chartPrepContext = chartPrep ? `
Pre-Visit Chart Prep Notes:
- Visit Purpose: ${chartPrep.visitPurpose || 'N/A'}
- Suggested Focus: ${chartPrep.suggestedFocus || 'N/A'}
- Current Treatment: ${chartPrep.currentTreatment || 'N/A'}
` : ''

    // Build user preferences section
    let userPreferences = ''
    if (userSettings) {
      const prefs: string[] = []

      if (userSettings.globalAiInstructions) {
        prefs.push(`User preferences: ${userSettings.globalAiInstructions}`)
      }

      if (userSettings.documentationStyle) {
        const styleGuide: Record<string, string> = {
          concise: 'Keep all sections brief and focused on essential information only.',
          detailed: 'Provide comprehensive coverage with thorough documentation in each section.',
          narrative: 'Write in a flowing, story-like prose format where appropriate.',
        }
        prefs.push(styleGuide[userSettings.documentationStyle])
      }

      if (userSettings.preferredTerminology) {
        const termGuide: Record<string, string> = {
          formal: 'Use formal, academic medical terminology.',
          standard: 'Use standard clinical terminology.',
          simplified: 'Use simplified, accessible medical language.',
        }
        prefs.push(termGuide[userSettings.preferredTerminology])
      }

      if (prefs.length > 0) {
        userPreferences = `\n\nUser Style Preferences:\n${prefs.join('\n')}`
      }
    }

    // Step 2: Process transcript with GPT to extract clinical content
    const openai = new OpenAI({ apiKey: openaiKey })

    const systemPrompt = `You are a clinical documentation assistant for a neurology practice.
Analyze the following transcript of a provider-patient visit and extract clinical content organized by note section.

${patientContext}
${chartPrepContext}

TRANSCRIPT (with speaker diarization):
${diarizedTranscript}

SPEAKER IDENTIFICATION:
The transcript includes speaker labels from automatic diarization. Typically:
- One speaker is the clinician (asks questions, gives medical advice, discusses diagnoses, performs examinations)
- Another speaker is the patient (describes symptoms, answers questions, reports concerns)
Use speaker context to better distinguish subjective complaints (patient-reported) from clinical observations (clinician-noted). If there are more than 2 speakers, additional speakers may be family members or other staff.

Based on this conversation, generate structured clinical note content.
Focus on extracting:
1. HPI - History of Present Illness from patient-reported symptoms and history
2. ROS - Review of Systems from any systematic inquiry
3. Physical Exam - Findings mentioned by the provider
4. Assessment - Clinical impressions and diagnoses discussed
5. Plan - Treatment recommendations, follow-up, medications discussed

IMPORTANT GUARDRAILS:
- Return ONLY valid JSON, no markdown formatting.
- Do NOT comment on, judge, or flag missing or undocumented findings. Only include what IS documented in the transcript.
- Do NOT say things like "no exam documented", "physical exam not performed", "ROS not discussed", or "missing data".
- If a section has no relevant content in the transcript, return an empty string — do not call out its absence.

{
  "hpiFromVisit": "Narrative paragraph of HPI based on patient-reported information. Use third-person medical style. Include onset, duration, severity, associated symptoms. 3-5 sentences.",
  "rosFromVisit": "Review of systems in bullet format if discussed. Example: • Constitutional: Denies fever, weight loss\\n• Neuro: Reports headaches, denies vision changes. Return empty string if no ROS discussed.",
  "examFromVisit": "Physical exam findings if any mentioned by provider. Return empty string if no exam discussed.",
  "assessmentFromVisit": "Clinical assessment based on discussion. List diagnoses or impressions. 1-3 sentences.",
  "planFromVisit": "Treatment plan in bullet format. Example: • Continue topiramate 100mg BID\\n• Follow-up in 3 months\\n• MRI brain ordered",
  "transcriptSummary": "2-3 sentence summary of what was discussed in the visit",
  "confidence": {
    "hpi": 0.85,
    "ros": 0.60,
    "exam": 0.40,
    "assessment": 0.75,
    "plan": 0.80
  }
}${userPreferences}`

    const completion = await openai.chat.completions.create({
      model: 'gpt-5.2', // Best reasoning for clinical extraction ($1.25/$10 per 1M tokens)
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Extract and organize the clinical content from this visit transcript.' }
      ],
      max_completion_tokens: 2500,
      temperature: 0.3,
      response_format: { type: 'json_object' },
    })

    const responseText = completion.choices[0]?.message?.content || ''

    // Parse the JSON response
    try {
      // Clean up the response - remove markdown code blocks if present
      let cleanedResponse = responseText.trim()
      if (cleanedResponse.startsWith('```json')) {
        cleanedResponse = cleanedResponse.slice(7)
      } else if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.slice(3)
      }
      if (cleanedResponse.endsWith('```')) {
        cleanedResponse = cleanedResponse.slice(0, -3)
      }
      cleanedResponse = cleanedResponse.trim()

      const visitAIOutput = JSON.parse(cleanedResponse)

      return NextResponse.json({
        success: true,
        visitAI: visitAIOutput,
        transcript: plainTranscript,
        segments: segments,
        duration: result?.metadata?.duration || null,
      })
    } catch (parseError) {
      // If JSON parsing fails, return what we have
      console.error('Failed to parse visit AI JSON:', parseError)
      return NextResponse.json({
        success: true,
        visitAI: null,
        transcript: plainTranscript,
        segments: segments,
        rawResponse: responseText,
        parseError: 'Failed to parse structured response',
      })
    }

  } catch (error: any) {
    console.error('Visit AI Error:', error)
    return NextResponse.json({
      error: error?.message || 'An error occurred processing the visit recording'
    }, { status: 500 })
  }
}
