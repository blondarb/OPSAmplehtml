'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { TranscribeStreamManager } from '@/lib/transcribe-streaming'

interface UseStreamingDictationResult {
  isRecording: boolean
  isPaused: boolean
  isTranscribing: boolean
  error: string | null
  transcribedText: string | null
  rawText: string | null
  recordingDuration: number
  /** Live transcript that updates in real-time while recording */
  streamingTranscript: string
  /** Whether streaming mode is active (vs batch fallback) */
  isStreaming: boolean
  startRecording: () => Promise<void>
  stopRecording: () => void
  clearTranscription: () => void
}

/**
 * Real-time dictation hook using AWS Transcribe Medical Streaming.
 *
 * Replaces useVoiceRecorder for inline dictation with live transcript display.
 * Text appears in real-time as the user speaks, using AWS Transcribe with
 * NEUROLOGY specialty for optimal medical vocabulary recognition.
 *
 * Falls back to the existing batch transcription if streaming fails to connect.
 */
export function useStreamingDictation(): UseStreamingDictationResult {
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused] = useState(false) // Streaming doesn't support pause
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [transcribedText, setTranscribedText] = useState<string | null>(null)
  const [rawText, setRawText] = useState<string | null>(null)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [streamingTranscript, setStreamingTranscript] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)

  const managerRef = useRef<TranscribeStreamManager | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const fallbackRecorderRef = useRef<MediaRecorder | null>(null)
  const fallbackChunksRef = useRef<Blob[]>([])
  const fallbackStreamRef = useRef<MediaStream | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      managerRef.current?.stop()
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const clearTranscription = useCallback(() => {
    setTranscribedText(null)
    setRawText(null)
    setError(null)
    setStreamingTranscript('')
  }, [])

  const startRecording = useCallback(async () => {
    setError(null)
    setTranscribedText(null)
    setRawText(null)
    setStreamingTranscript('')
    setRecordingDuration(0)

    // Start duration timer
    timerRef.current = setInterval(() => {
      setRecordingDuration((prev) => prev + 1)
    }, 1000)

    // Try streaming first
    try {
      const manager = new TranscribeStreamManager({
        onInterimTranscript: (text) => {
          setStreamingTranscript(text)
        },
        onFinalTranscript: (text) => {
          setStreamingTranscript(text)
        },
        onError: (err) => {
          console.warn('Streaming transcription error:', err)
          // Don't set error state — the text accumulated so far is still useful
        },
        onStateChange: (state) => {
          if (state === 'streaming') {
            setIsStreaming(true)
          } else if (state === 'closed' || state === 'error') {
            setIsStreaming(false)
          }
        },
      })

      managerRef.current = manager
      await manager.start()
      setIsRecording(true)
    } catch (streamError: any) {
      console.warn('Streaming failed, falling back to batch:', streamError.message)
      // Fall back to batch recording
      await startBatchFallback()
    }
  }, [])

  const startBatchFallback = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      fallbackStreamRef.current = stream
      fallbackChunksRef.current = []

      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
      ]
      let mimeType = ''
      for (const type of mimeTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          mimeType = type
          break
        }
      }

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      fallbackRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) fallbackChunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(fallbackChunksRef.current, {
          type: mimeType || 'audio/webm',
        })

        if (blob.size === 0) {
          setError('No audio recorded')
          setIsRecording(false)
          return
        }

        // Send to batch transcription
        setIsTranscribing(true)
        try {
          const formData = new FormData()
          const ext = mimeType.includes('mp4') ? 'm4a' : 'webm'
          formData.append('audio', new File([blob], `recording.${ext}`, { type: mimeType }))

          const response = await fetch('/api/ai/transcribe', {
            method: 'POST',
            body: formData,
          })
          const data = await response.json()

          if (data.error) {
            setError(data.error)
          } else {
            setTranscribedText(data.text)
            setRawText(data.rawText || data.text)
          }
        } catch {
          setError('Failed to transcribe audio')
        }
        setIsTranscribing(false)
      }

      recorder.start(250)
      setIsRecording(true)
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setError('Microphone permission denied')
      } else {
        setError('Failed to start recording')
      }
    }
  }, [])

  const stopRecording = useCallback(() => {
    // Stop timer
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    // If streaming mode, stop the manager and deliver final transcript
    if (managerRef.current) {
      const manager = managerRef.current
      manager.stop()

      // Get the accumulated transcript and deliver it
      const finalText = manager.getAccumulatedTranscript()
      if (finalText) {
        setTranscribedText(finalText)
        setRawText(finalText)
      }
      managerRef.current = null
    }

    // If batch fallback, stop the recorder (triggers onstop handler)
    if (fallbackRecorderRef.current && fallbackRecorderRef.current.state !== 'inactive') {
      fallbackRecorderRef.current.requestData()
      setTimeout(() => {
        if (fallbackRecorderRef.current && fallbackRecorderRef.current.state !== 'inactive') {
          fallbackRecorderRef.current.stop()
        }
      }, 100)
    }

    setIsRecording(false)
    setIsStreaming(false)
  }, [])

  return {
    isRecording,
    isPaused,
    isTranscribing,
    error,
    transcribedText,
    rawText,
    recordingDuration,
    streamingTranscript,
    isStreaming,
    startRecording,
    stopRecording,
    clearTranscription,
  }
}
