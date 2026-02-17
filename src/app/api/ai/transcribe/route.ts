import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient as createDeepgramClient } from '@deepgram/sdk'
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

    // Log file details for debugging
    console.log('Received audio file:', {
      name: audioFile.name,
      type: audioFile.type,
      size: audioFile.size,
    })

    if (audioFile.size === 0) {
      return NextResponse.json({ error: 'Audio file is empty' }, { status: 400 })
    }

    // Validate file size (25MB limit)
    if (audioFile.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: 'Recording too long (max 25MB)' }, { status: 400 })
    }

    // Check for Deepgram API key
    const deepgramKey = process.env.DEEPGRAM_API_KEY
    if (!deepgramKey) {
      return NextResponse.json({
        error: 'Deepgram API key not configured. Please add DEEPGRAM_API_KEY to your environment variables.'
      }, { status: 500 })
    }

    // Convert audio file to buffer for Deepgram
    const arrayBuffer = await audioFile.arrayBuffer()
    const audioBuffer = Buffer.from(arrayBuffer)

    // Call Deepgram Nova for transcription
    const deepgram = createDeepgramClient(deepgramKey)
    const { result, error: dgError } = await deepgram.listen.prerecorded.transcribeFile(
      audioBuffer,
      {
        model: 'nova-3',
        smart_format: true,
        language: 'en',
        punctuate: true,
      }
    )

    if (dgError) {
      console.error('Deepgram transcription error:', dgError)
      return NextResponse.json({
        error: 'Transcription failed. Please try again.'
      }, { status: 500 })
    }

    const rawTranscription = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() || ''
    console.log('Deepgram transcription result:', rawTranscription.substring(0, 200))

    // If transcription is empty or very short, return it directly without cleanup
    if (!rawTranscription || rawTranscription.length < 5) {
      return NextResponse.json({
        text: rawTranscription || '(No speech detected)',
        rawText: rawTranscription
      })
    }

    // Get OpenAI API key for GPT cleanup step
    let openaiKey = process.env.OPENAI_API_KEY
    if (!openaiKey) {
      const { data: setting } = await supabase.rpc('get_openai_key')
      openaiKey = setting
    }

    // If no OpenAI key, return raw Deepgram transcription (still better than nothing)
    if (!openaiKey) {
      return NextResponse.json({ text: rawTranscription, rawText: rawTranscription })
    }

    // Clean up the transcription with GPT to fix errors and improve readability
    const openai = new OpenAI({ apiKey: openaiKey })
    try {
      const cleanupResponse = await openai.chat.completions.create({
        model: 'gpt-5-mini', // Cost-effective for text cleanup ($0.25/$2 per 1M tokens)
        messages: [
          {
            role: 'system',
            content: `You are a medical transcription editor. Clean up dictated clinical notes for accuracy and readability.

CRITICAL RULES:
- Output ONLY the cleaned text - no explanations, no comments, no meta-text
- Fix grammar, punctuation, and spelling errors
- Correct medical terminology and abbreviations
- HANDLE VERBAL CORRECTIONS: When the speaker corrects themselves (e.g., "right hand, no wait, left hand" or "two weeks, I mean three weeks"), apply the correction and remove the correction language. Keep only the corrected information.
- Remove filler words (um, uh, like, you know) and false starts
- Remove meta-commentary about the dictation itself
- Maintain clinical accuracy - when in doubt about a correction, keep both versions
- NEVER add information that wasn't dictated
- NEVER say things like "not enough information" or "please provide more"
- If the input is short, still clean it up and return it`
          },
          {
            role: 'user',
            content: rawTranscription
          }
        ],
        max_completion_tokens: 2000,
      })

      const cleanedText = cleanupResponse.choices[0]?.message?.content?.trim()

      // If cleanup result looks like an error message or refusal, use raw transcription
      if (!cleanedText ||
          cleanedText.toLowerCase().includes('not enough') ||
          cleanedText.toLowerCase().includes('please provide') ||
          cleanedText.toLowerCase().includes('cannot') ||
          cleanedText.toLowerCase().includes('i\'m sorry')) {
        return NextResponse.json({ text: rawTranscription, rawText: rawTranscription })
      }

      return NextResponse.json({ text: cleanedText, rawText: rawTranscription })
    } catch (cleanupError) {
      // If cleanup fails, return raw transcription
      console.error('Cleanup error:', cleanupError)
      return NextResponse.json({ text: rawTranscription, rawText: rawTranscription })
    }

  } catch (error: any) {
    console.error('Transcription API Error:', error)
    return NextResponse.json({
      error: error?.message || 'An error occurred while transcribing audio'
    }, { status: 500 })
  }
}
