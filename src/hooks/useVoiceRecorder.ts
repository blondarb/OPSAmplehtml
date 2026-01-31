'use client'

import { useState, useRef, useCallback } from 'react'

interface UseVoiceRecorderOptions {
  // If provided, this callback receives the audio blob instead of auto-transcribing
  onRecordingComplete?: (audioBlob: Blob) => void
}

interface UseVoiceRecorderResult {
  isRecording: boolean
  isPaused: boolean
  isTranscribing: boolean
  error: string | null
  transcribedText: string | null
  rawText: string | null
  recordingDuration: number
  lastAudioBlob: Blob | null
  startRecording: () => Promise<void>
  pauseRecording: () => void
  resumeRecording: () => void
  stopRecording: () => void
  restartRecording: () => void
  clearTranscription: () => void
}

export function useVoiceRecorder(options?: UseVoiceRecorderOptions): UseVoiceRecorderResult {
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [transcribedText, setTranscribedText] = useState<string | null>(null)
  const [rawText, setRawText] = useState<string | null>(null)
  const [recordingDuration, setRecordingDuration] = useState(0)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const mimeTypeRef = useRef<string>('')
  const lastAudioBlobRef = useRef<Blob | null>(null)

  const clearTranscription = useCallback(() => {
    setTranscribedText(null)
    setRawText(null)
    setError(null)
  }, [])

  const startRecording = useCallback(async () => {
    try {
      setError(null)
      setTranscribedText(null)
      setRawText(null)
      audioChunksRef.current = []

      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Determine supported mime type
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4'
      mimeTypeRef.current = mimeType

      const mediaRecorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = mediaRecorder

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        // Stop all tracks
        streamRef.current?.getTracks().forEach(track => track.stop())

        // Clear timer
        if (timerRef.current) {
          clearInterval(timerRef.current)
          timerRef.current = null
        }

        // Create audio blob
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeTypeRef.current })

        console.log('Recording stopped. Audio chunks:', audioChunksRef.current.length, 'Total size:', audioBlob.size, 'bytes')

        // Store blob for retry capability
        lastAudioBlobRef.current = audioBlob

        if (audioBlob.size === 0) {
          setError('No audio recorded')
          setIsRecording(false)
          return
        }

        // Warn if recording is very short (less than 5KB usually means < 1 second of audio)
        if (audioBlob.size < 5000) {
          console.warn('Warning: Audio file is very small, may not contain enough speech')
        }

        // If a callback is provided, use it instead of auto-transcribing
        if (options?.onRecordingComplete) {
          options.onRecordingComplete(audioBlob)
          return
        }

        // Default behavior: Send to transcription API
        setIsTranscribing(true)
        try {
          const formData = new FormData()
          // Convert to a file with proper extension for OpenAI
          // Safari uses audio/mp4 or audio/x-m4a; Chrome/Firefox use audio/webm
          const mime = mimeTypeRef.current.toLowerCase()
          const extension = mime.includes('webm') ? 'webm'
            : mime.includes('mp4') || mime.includes('m4a') ? 'm4a'
            : mime.includes('ogg') ? 'ogg'
            : 'webm'
          const audioFile = new File([audioBlob], `recording.${extension}`, { type: mimeTypeRef.current })
          formData.append('audio', audioFile)

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
        } catch (err) {
          setError('Failed to transcribe audio. Please try again.')
        }
        setIsTranscribing(false)
      }

      mediaRecorder.onerror = () => {
        setError('Recording error occurred')
        setIsRecording(false)
      }

      // Start recording - collect data every 250ms for better capture of short recordings
      mediaRecorder.start(250)
      setIsRecording(true)
      setIsPaused(false)
      setRecordingDuration(0)

      // Start duration timer
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1)
      }, 1000)

    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setError('Microphone permission denied. Please allow microphone access.')
      } else if (err.name === 'NotFoundError') {
        setError('No microphone found. Please connect a microphone.')
      } else {
        setError('Failed to start recording. Please try again.')
      }
      setIsRecording(false)
    }
  }, [])

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause()
      setIsPaused(true)
      // Pause the timer
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [])

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume()
      setIsPaused(false)
      // Resume the timer
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1)
      }, 1000)
    }
  }, [])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      // Request any remaining data before stopping
      mediaRecorderRef.current.requestData()
      // Small delay to ensure data is collected
      setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop()
        }
        setIsRecording(false)
        setIsPaused(false)
      }, 100)
    }
  }, [])

  const restartRecording = useCallback(() => {
    // Stop current recording without transcribing
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      // Clear the onstop handler temporarily to prevent transcription
      const originalOnStop = mediaRecorderRef.current.onstop
      mediaRecorderRef.current.onstop = () => {
        streamRef.current?.getTracks().forEach(track => track.stop())
        if (timerRef.current) {
          clearInterval(timerRef.current)
          timerRef.current = null
        }
        setIsRecording(false)
        setIsPaused(false)
        // Restore and start new recording
        startRecording()
      }
      mediaRecorderRef.current.stop()
    } else {
      // Just start fresh
      audioChunksRef.current = []
      startRecording()
    }
  }, [startRecording])

  return {
    isRecording,
    isPaused,
    isTranscribing,
    error,
    transcribedText,
    rawText,
    recordingDuration,
    lastAudioBlob: lastAudioBlobRef.current,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    restartRecording,
    clearTranscription,
  }
}
