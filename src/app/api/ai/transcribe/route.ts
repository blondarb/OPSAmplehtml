import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    // Check authentication
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse the form data to get the audio file
    const formData = await request.formData()
    const audioFile = formData.get('audio') as File

    if (!audioFile) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 })
    }

    // Get OpenAI API key - first try environment variable, then try Supabase
    let apiKey = process.env.OPENAI_API_KEY

    if (!apiKey) {
      // Try to get from Supabase app_settings
      const { data: setting } = await supabase.rpc('get_openai_key')
      apiKey = setting
    }

    if (!apiKey) {
      return NextResponse.json({
        error: 'OpenAI API key not configured. Please add your API key to the environment variables or Supabase settings.'
      }, { status: 500 })
    }

    const openai = new OpenAI({ apiKey })

    // Call Whisper API for transcription
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'en',
      response_format: 'text',
    })

    // Clean up the transcription with GPT to fix errors and improve readability
    const cleanupResponse = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `You are a medical transcription editor. Your job is to clean up dictated clinical notes while staying true to the original content.

Rules:
- Fix grammar, punctuation, and spelling errors
- Correct obvious transcription mistakes (e.g., "patient" misheard as "patients")
- Expand common medical abbreviations only if they were likely misheard
- Maintain the original medical terminology and clinical meaning
- Keep the same level of detail and information
- Do NOT add information that wasn't dictated
- Do NOT remove any clinical information
- Do NOT change medical terms unless they're clearly wrong
- Output ONLY the cleaned text, no explanations or comments`
        },
        {
          role: 'user',
          content: `Clean up this dictated clinical note:\n\n${transcription}`
        }
      ],
      max_tokens: 2000,
      temperature: 0.3, // Low temperature for more consistent output
    })

    const cleanedText = cleanupResponse.choices[0]?.message?.content || transcription

    return NextResponse.json({ text: cleanedText, rawText: transcription })

  } catch (error: any) {
    console.error('Transcription API Error:', error)

    if (error?.status === 401) {
      return NextResponse.json({
        error: 'Invalid OpenAI API key. Please check your configuration.'
      }, { status: 500 })
    }

    return NextResponse.json({
      error: error?.message || 'An error occurred while transcribing audio'
    }, { status: 500 })
  }
}
