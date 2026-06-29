'use client'

/**
 * Neuro FAQ Voice — push-to-talk client surface.
 *
 * POC SKELETON — review before any non-internal use.
 *
 * Half-duplex flow (Decision D8): tap to talk -> AWS Transcribe Medical (via the
 * existing useStreamingDictation hook) -> /api/ai/faq/answer (gated Bedrock) ->
 * /api/ai/faq/tts (Polly) -> play. No OpenAI. Full-duplex barge-in is a fast-follow.
 *
 * Persistent on-screen safety chrome: POC banner, 911 badge, disclaimer.
 */

import { useCallback, useRef, useState } from 'react'
import { HelpCircle, Mic, Square, Phone } from 'lucide-react'
import FeatureSubHeader from '@/components/layout/FeatureSubHeader'
import { useStreamingDictation } from '@/hooks/useStreamingDictation'
import { SESSION_OPENING_DISCLAIMER } from '@/lib/faq/faqPrompts'

const ACCENT = '#8B5CF6'

interface Turn {
  role: 'user' | 'assistant'
  text: string
  kind?: 'emergency' | 'refuse' | 'answer'
}

export default function FaqVoiceView() {
  const { isRecording, streamingTranscript, transcribedText, startRecording, stopRecording, clearTranscription } =
    useStreamingDictation()
  const [turns, setTurns] = useState<Turn[]>([])
  const [thinking, setThinking] = useState(false)
  const [typed, setTyped] = useState('')
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const ask = useCallback(async (utterance: string) => {
    if (!utterance.trim()) return
    setTurns((t) => [...t, { role: 'user', text: utterance }])
    setThinking(true)
    try {
      const res = await fetch('/api/ai/faq/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ utterance }),
      })
      const data = await res.json()
      setTurns((t) => [...t, { role: 'assistant', text: data.text, kind: data.kind }])
      // Speak the answer (Polly). Non-fatal if TTS not yet installed.
      try {
        const tts = await fetch('/api/ai/faq/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: data.text }),
        })
        if (tts.ok) {
          const blob = await tts.blob()
          const url = URL.createObjectURL(blob)
          if (audioRef.current) {
            audioRef.current.src = url
            await audioRef.current.play().catch(() => {})
          }
        }
      } catch { /* TTS optional in skeleton */ }
    } catch (e) {
      setTurns((t) => [...t, { role: 'assistant', text: 'Sorry, something went wrong. Please call your clinic.', kind: 'refuse' }])
    } finally {
      setThinking(false)
    }
  }, [])

  const onStop = useCallback(() => {
    stopRecording()
    // useStreamingDictation resolves the final transcript shortly after stop.
    setTimeout(() => {
      const finalText = (transcribedText || streamingTranscript || '').trim()
      if (finalText) ask(finalText)
      clearTranscription()
    }, 600)
  }, [stopRecording, transcribedText, streamingTranscript, ask, clearTranscription])

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #0F172A 0%, #1E293B 100%)', color: 'white' }}>
      <FeatureSubHeader title="Neuro FAQ Voice" icon={HelpCircle} accentColor={ACCENT} badgeText="POC" />

      {/* POC + safety chrome (always visible) */}
      <div style={{ padding: '12px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.4)', borderRadius: 8, padding: 10, color: '#fde68a', fontSize: 13 }}>
          ⚠️ Proof of concept — <strong>not for clinical use.</strong> Answers are general information, not medical advice.
        </div>
        <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 8, padding: 10, color: '#fca5a5', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Phone size={16} /> <strong>Emergency? Call 911.</strong> This assistant cannot help with emergencies.
        </div>
      </div>

      {/* Transcript */}
      <div style={{ padding: '8px 24px 120px', maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ color: '#94a3b8', fontSize: 14 }}>{SESSION_OPENING_DISCLAIMER}</p>
        {turns.map((t, i) => (
          <div key={i} style={{ alignSelf: t.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%', background: t.role === 'user' ? 'rgba(139,92,246,0.2)' : t.kind === 'emergency' ? 'rgba(239,68,68,0.18)' : 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '10px 14px', fontSize: 15, overflowWrap: 'anywhere' }}>
            {t.text}
          </div>
        ))}
        {isRecording && streamingTranscript && (
          <div style={{ alignSelf: 'flex-end', maxWidth: '85%', color: '#cbd5e1', fontStyle: 'italic' }}>{streamingTranscript}…</div>
        )}
        {thinking && <div style={{ color: '#94a3b8' }}>…</div>}
      </div>

      {/* Control bar: type OR talk (text fallback works without a mic) */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: 16, display: 'flex', justifyContent: 'center', gap: 10, alignItems: 'center', background: 'linear-gradient(0deg, #0F172A 70%, transparent)' }}>
        <form
          onSubmit={(e) => { e.preventDefault(); const q = typed; setTyped(''); ask(q) }}
          style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%', maxWidth: 560 }}
        >
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Type a question, or tap the mic…"
            aria-label="Type a question"
            style={{ flex: 1, height: 48, borderRadius: 24, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: 'white', padding: '0 18px', fontSize: 15, outline: 'none' }}
          />
          <button
            type="submit"
            disabled={!typed.trim() || thinking}
            style={{ height: 48, padding: '0 18px', borderRadius: 24, border: 'none', cursor: typed.trim() ? 'pointer' : 'default', background: typed.trim() ? ACCENT : 'rgba(255,255,255,0.1)', color: 'white', fontSize: 15, fontWeight: 600 }}
          >
            Ask
          </button>
        </form>
        <button
          onClick={isRecording ? onStop : startRecording}
          style={{ width: 56, height: 56, flexShrink: 0, borderRadius: '50%', border: 'none', cursor: 'pointer', background: isRecording ? '#ef4444' : ACCENT, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}
          aria-label={isRecording ? 'Stop and ask' : 'Tap to talk'}
        >
          {isRecording ? <Square size={24} /> : <Mic size={24} />}
        </button>
      </div>

      <audio ref={audioRef} hidden />
    </div>
  )
}
