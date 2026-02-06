import { NextResponse } from 'next/server'
import OpenAI, { toFile } from 'openai'
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

    // Validate file size (Whisper API max is 25MB)
    if (audioFile.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: 'Recording too long (max 25MB)' }, { status: 400 })
    }

    // Ensure we have a valid filename with correct extension for Whisper
    // Whisper accepts: flac, m4a, mp3, mp4, mpeg, mpga, oga, ogg, wav, webm
    let fileName = audioFile.name || 'recording.webm'
    const validExtensions = ['flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm']
    const currentExt = fileName.split('.').pop()?.toLowerCase()

    if (!currentExt || !validExtensions.includes(currentExt)) {
      // Try to infer from MIME type
      const mimeType = audioFile.type.toLowerCase()
      if (mimeType.includes('mp4') || mimeType.includes('m4a') || mimeType.includes('aac')) {
        fileName = 'recording.m4a'
      } else if (mimeType.includes('webm')) {
        fileName = 'recording.webm'
      } else if (mimeType.includes('ogg')) {
        fileName = 'recording.ogg'
      } else if (mimeType.includes('wav')) {
        fileName = 'recording.wav'
      } else if (mimeType.includes('mpeg') || mimeType.includes('mp3')) {
        fileName = 'recording.mp3'
      } else {
        // Default to m4a for Safari/iOS compatibility
        fileName = 'recording.m4a'
      }
      console.log('Remapped filename to:', fileName, 'from MIME:', mimeType)
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

    // Convert the File to a format OpenAI can handle
    const arrayBuffer = await audioFile.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Use OpenAI's toFile helper to create a proper file object
    // Use the corrected filename for better Whisper compatibility
    const openaiFile = await toFile(buffer, fileName, { type: audioFile.type })

    // Call Whisper API for transcription
    const transcription = await openai.audio.transcriptions.create({
      file: openaiFile,
      model: 'whisper-1',
      language: 'en',
      response_format: 'text',
    })

    console.log('Whisper transcription result:', transcription)

    // If transcription is empty or very short, return it directly without cleanup
    const rawTranscription = String(transcription).trim()
    if (!rawTranscription || rawTranscription.length < 5) {
      return NextResponse.json({
        text: rawTranscription || '(No speech detected)',
        rawText: rawTranscription
      })
    }

    // Clean up the transcription with GPT to fix errors and improve readability
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
        // Note: gpt-5-mini only supports default temperature (1)
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
