'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import MobileVoiceRecorder from '@/components/mobile/MobileVoiceRecorder'

export default function MobileVoicePage() {
  const router = useRouter()
  const [transcriptions, setTranscriptions] = useState<Array<{
    text: string
    rawText: string
    timestamp: Date
  }>>([])

  const handleTranscription = (text: string, rawText: string) => {
    setTranscriptions(prev => [...prev, {
      text,
      rawText,
      timestamp: new Date(),
    }])
  }

  const handleClose = () => {
    router.back()
  }

  if (transcriptions.length > 0) {
    return (
      <div style={{
        minHeight: '100dvh',
        background: 'var(--bg-main)',
        padding: '20px',
        paddingTop: 'max(20px, env(safe-area-inset-top))',
        paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '24px',
        }}>
          <button
            onClick={() => router.push('/mobile')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              background: 'var(--bg-white)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: 500,
              color: 'var(--text-primary)',
              cursor: 'pointer',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back to Patients
          </button>

          <button
            onClick={() => setTranscriptions([])}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
              border: 'none',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: 500,
              color: 'white',
              cursor: 'pointer',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            </svg>
            New Recording
          </button>
        </div>

        <h2 style={{
          fontSize: '20px',
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: '16px',
        }}>
          Transcriptions
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {transcriptions.map((t, i) => (
            <div
              key={i}
              style={{
                background: 'var(--bg-white)',
                borderRadius: '16px',
                padding: '16px',
                border: '1px solid var(--border)',
              }}
            >
              <div style={{
                fontSize: '12px',
                color: 'var(--text-muted)',
                marginBottom: '8px',
              }}>
                {t.timestamp.toLocaleTimeString()}
              </div>
              <div style={{
                fontSize: '15px',
                lineHeight: 1.6,
                color: 'var(--text-primary)',
              }}>
                {t.text}
              </div>
              {t.rawText !== t.text && (
                <details style={{ marginTop: '12px' }}>
                  <summary style={{
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                  }}>
                    Show original
                  </summary>
                  <div style={{
                    fontSize: '13px',
                    color: 'var(--text-secondary)',
                    marginTop: '8px',
                    padding: '8px',
                    background: 'var(--bg-gray)',
                    borderRadius: '8px',
                  }}>
                    {t.rawText}
                  </div>
                </details>
              )}
            </div>
          ))}
        </div>

        <div style={{
          marginTop: '24px',
          display: 'flex',
          gap: '12px',
        }}>
          <button
            onClick={() => {
              const allText = transcriptions.map(t => t.text).join('\n\n')
              navigator.clipboard.writeText(allText)
              if ('vibrate' in navigator) navigator.vibrate(50)
            }}
            style={{
              flex: 1,
              padding: '14px',
              borderRadius: '12px',
              border: '1px solid var(--border)',
              background: 'var(--bg-white)',
              fontSize: '15px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              cursor: 'pointer',
            }}
          >
            Copy All
          </button>
          <button
            onClick={() => {
              // Would save to a note or share
              if ('vibrate' in navigator) navigator.vibrate([50, 50, 50])
            }}
            style={{
              flex: 1,
              padding: '14px',
              borderRadius: '12px',
              border: 'none',
              background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
              fontSize: '15px',
              fontWeight: 600,
              color: 'white',
              cursor: 'pointer',
            }}
          >
            Add to Note
          </button>
        </div>
      </div>
    )
  }

  return (
    <MobileVoiceRecorder
      onTranscription={handleTranscription}
      onClose={handleClose}
      fieldLabel="Quick Note"
    />
  )
}
