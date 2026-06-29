/**
 * Neuro FAQ Voice — text-to-speech route (Amazon Polly).
 *
 * POC SKELETON. Requires `npm install @aws-sdk/client-polly` (see src/lib/faq/polly.ts).
 * Returns mp3 audio bytes for the given text.
 *
 * Input:  { text: string }
 * Output: audio/mpeg body
 */

import { NextResponse } from 'next/server'
import { synthesizeSpeech } from '@/lib/faq/polly'

export async function POST(request: Request) {
  try {
    const { text } = await request.json()
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'text required' }, { status: 400 })
    }
    const audio = await synthesizeSpeech(text)
    return new NextResponse(Buffer.from(audio), {
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
    })
  } catch (error: any) {
    console.error('[faq/tts] error:', error)
    return NextResponse.json(
      { error: error?.message || 'TTS failed' },
      { status: 500 },
    )
  }
}
