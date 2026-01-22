'use client'

import { useState, useRef, useCallback } from 'react'

interface UseVoiceRecorderResult {
  isRecording: boolean
  isTranscribing: boolean
  error: string | null
  transcribedText: string | null
  recordingDuration: number
  startRecording: () => Promise<void>
  stopRecording: () => void
  clearTranscription: () => void
}

export function useVoiceRecorder(): UseVoiceRecorderResult {
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [transcribedText, setTranscribedText] = useState<string | null>(null)
  const [recordingDuration, setRecordingDuration] = useState(0)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const clearTranscription = useCallback(() => {
    setTranscribedText(null)
    setError(null)
  }, [])

  const startRecording = useCallback(async () => {
    try {
      setError(null)
      setTranscribedText(null)
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
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType })

        if (audioBlob.size === 0) {
          setError('No audio recorded')
          setIsRecording(false)
          return
        }

        // Send to transcription API
        setIsTranscribing(true)
        try {
          const formData = new FormData()
          // Convert to a file with proper extension for OpenAI
          const extension = mimeType.includes('webm') ? 'webm' : 'm4a'
          const audioFile = new File([audioBlob], `recording.${extension}`, { type: mimeType })
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

      // Start recording
      mediaRecorder.start(1000) // Collect data every second
      setIsRecording(true)
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

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }, [])

  return {
    isRecording,
    isTranscribing,
    error,
    transcribedText,
    recordingDuration,
    startRecording,
    stopRecording,
    clearTranscription,
  }
}
