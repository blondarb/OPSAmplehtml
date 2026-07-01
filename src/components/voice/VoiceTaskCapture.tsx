'use client'

/**
 * Guided voice-task capture for the acoustic speech-biomarker battery.
 *
 * Phase A scaffold (2026-06-30). Walks the patient through sustained /a/,
 * pa-ta-ka (DDK), and a reading passage; records each, ships PCM to
 * /api/ai/voice-biomarkers, and renders the result cards.
 *
 * Capture note: AGC / echo-cancel / noise-suppression are DISABLED so the raw
 * signal reaches the engine (these would distort loudness, shimmer, and pause
 * timing). Mic/device quality therefore matters — see the spec's QC caveat.
 *
 * See docs/plans/2026-06-30-acoustic-speech-biomarkers-spec.md.
 */

import { useCallback, useRef, useState } from 'react'
import { SpeechBiomarkerCard } from './SpeechBiomarkerCard'
import { analyzeTask } from '@/lib/voice/clientCapture'
import { VOICE_TASK_LABELS, VOICE_TASK_PROMPTS, type BiomarkerPanel, type VoiceTask } from '@/lib/voice/types'

const TASK_ORDER: VoiceTask[] = ['sustained_vowel', 'ddk', 'reading']

interface Props {
  patientId?: string
  visitId?: string
}

export function VoiceTaskCapture({ patientId, visitId }: Props) {
  const [stepIndex, setStepIndex] = useState(0)
  const [isRecording, setIsRecording] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [panels, setPanels] = useState<Partial<Record<VoiceTask, BiomarkerPanel>>>({})

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const mimeRef = useRef<string>('audio/webm')

  const currentTask = TASK_ORDER[stepIndex]
  const done = stepIndex >= TASK_ORDER.length

  const startRecording = useCallback(async (task: VoiceTask) => {
    setError(null)
    chunksRef.current = []
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })
      streamRef.current = stream

      let mime = ''
      for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']) {
        if (MediaRecorder.isTypeSupported(t)) { mime = t; break }
      }
      mimeRef.current = mime || 'audio/webm'
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      recorderRef.current = recorder

      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        streamRef.current?.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: mimeRef.current })
        if (blob.size === 0) { setError('No audio captured — check microphone permission.'); return }
        setIsAnalyzing(true)
        try {
          const panel = await analyzeTask(task, blob, { patientId, visitId })
          setPanels(prev => ({ ...prev, [task]: panel }))
          setStepIndex(i => i + 1)
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Analysis failed')
        } finally {
          setIsAnalyzing(false)
        }
      }
      recorder.start(200)
      setIsRecording(true)
    } catch (e) {
      const err = e as { name?: string }
      setError(
        err.name === 'NotAllowedError'
          ? 'Microphone permission denied.'
          : err.name === 'NotFoundError'
            ? 'No microphone found.'
            : 'Could not start recording.'
      )
    }
  }, [patientId, visitId])

  const stopRecording = useCallback(() => {
    setIsRecording(false)
    const r = recorderRef.current
    if (r && r.state !== 'inactive') {
      try { r.requestData() } catch { /* no-op */ }
      r.stop()
    }
  }, [])

  const reset = useCallback(() => {
    setStepIndex(0)
    setPanels({})
    setError(null)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: 0 }}>Speech Biomarker Screen</h2>
        <p style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>
          Three short voice tasks (~40s total). Screening signal for clinician review — not a diagnosis.
        </p>
      </div>

      {/* Progress */}
      <div style={{ display: 'flex', gap: 8 }}>
        {TASK_ORDER.map((t, i) => (
          <div
            key={t}
            style={{
              flex: 1,
              height: 6,
              borderRadius: 3,
              background: panels[t] ? '#16A34A' : i === stepIndex ? '#3B82F6' : '#E5E7EB',
            }}
            title={VOICE_TASK_LABELS[t]}
          />
        ))}
      </div>

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Active task prompt */}
      {!done && (
        <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: 16, background: '#F9FAFB' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#3B82F6', textTransform: 'uppercase', letterSpacing: 0.4 }}>
            Task {stepIndex + 1} of {TASK_ORDER.length} · {VOICE_TASK_LABELS[currentTask]}
          </div>
          <p style={{ fontSize: 15, color: '#111827', marginTop: 8 }}>{VOICE_TASK_PROMPTS[currentTask].instruction}</p>
          {VOICE_TASK_PROMPTS[currentTask].sampleText && (
            <p style={{ fontSize: 14, color: '#374151', fontStyle: 'italic', background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 8, padding: 10 }}>
              {VOICE_TASK_PROMPTS[currentTask].sampleText}
            </p>
          )}
          <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 12 }}>
            Aim for about {VOICE_TASK_PROMPTS[currentTask].targetSeconds}s.
          </div>

          {!isRecording ? (
            <button
              onClick={() => startRecording(currentTask)}
              disabled={isAnalyzing}
              style={btnStyle('#3B82F6', isAnalyzing)}
            >
              {isAnalyzing ? 'Analyzing…' : '● Start recording'}
            </button>
          ) : (
            <button onClick={stopRecording} style={btnStyle('#DC2626', false)}>
              ■ Stop &amp; analyze
            </button>
          )}
        </div>
      )}

      {done && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#15803D' }}>All tasks complete.</div>
          <button onClick={reset} style={{ ...btnStyle('#6B7280', false), padding: '8px 14px' }}>Start over</button>
        </div>
      )}

      {/* Result cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {TASK_ORDER.map(t => panels[t] && <SpeechBiomarkerCard key={t} panel={panels[t]!} />)}
      </div>
    </div>
  )
}

function btnStyle(color: string, disabled: boolean): React.CSSProperties {
  return {
    background: disabled ? '#9CA3AF' : color,
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 8,
    padding: '10px 18px',
    fontSize: 14,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
  }
}
