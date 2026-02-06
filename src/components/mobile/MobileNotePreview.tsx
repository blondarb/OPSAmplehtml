'use client'

import { useState } from 'react'

interface MobileNotePreviewProps {
  isOpen: boolean
  onClose: () => void
  noteData: Record<string, string>
  patient: {
    id: string
    name: string
    age: number
    gender: string
    reason?: string
  }
  onSign: () => void
}

export default function MobileNotePreview({
  isOpen,
  onClose,
  noteData,
  patient,
  onSign,
}: MobileNotePreviewProps) {
  const [noteType, setNoteType] = useState<'new-consult' | 'follow-up'>('new-consult')
  const [noteLength, setNoteLength] = useState<'concise' | 'standard'>('standard')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedNote, setGeneratedNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  if (!isOpen) return null

  const generateNote = async () => {
    setIsGenerating(true)
    setError(null)

    try {
      const response = await fetch('/api/ai/synthesize-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          noteType,
          noteLength,
          manualData: {
            hpi: noteData.hpi || '',
            ros: noteData.ros || '',
            exam: noteData.exam || '',
            assessment: noteData.assessment || '',
            plan: noteData.plan || '',
          },
          patient: {
            name: patient.name,
            age: patient.age,
            gender: patient.gender,
            chiefComplaint: patient.reason,
          },
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to generate note')
      }

      const data = await response.json()
      setGeneratedNote(data.synthesizedNote || data.note || formatNoteManually())

      // Haptic feedback
      if ('vibrate' in navigator) navigator.vibrate([100, 50, 100])
    } catch (err) {
      console.error('Note generation error:', err)
      // Fallback to manual formatting
      setGeneratedNote(formatNoteManually())
    } finally {
      setIsGenerating(false)
    }
  }

  const formatNoteManually = () => {
    const lines = []

    lines.push(`NEUROLOGY ${noteType === 'new-consult' ? 'NEW CONSULT' : 'FOLLOW-UP'} NOTE`)
    lines.push('')
    lines.push(`Patient: ${patient.name}`)
    lines.push(`Age/Gender: ${patient.age}yo ${patient.gender}`)
    lines.push(`Chief Complaint: ${patient.reason || 'Not specified'}`)
    lines.push('')

    if (noteData.hpi) {
      lines.push('HISTORY OF PRESENT ILLNESS:')
      lines.push(noteData.hpi.replace(/--- Chart Prep ---[\s\S]*?--- End Chart Prep ---/g, '').trim())
      lines.push('')
    }

    if (noteData.ros) {
      lines.push('REVIEW OF SYSTEMS:')
      lines.push(noteData.ros)
      lines.push('')
    }

    if (noteData.exam) {
      lines.push('PHYSICAL EXAMINATION:')
      lines.push(noteData.exam)
      lines.push('')
    }

    if (noteData.assessment) {
      lines.push('ASSESSMENT:')
      lines.push(noteData.assessment.replace(/--- Chart Prep ---[\s\S]*?--- End Chart Prep ---/g, '').trim())
      lines.push('')
    }

    if (noteData.plan) {
      lines.push('PLAN:')
      lines.push(noteData.plan.replace(/--- Chart Prep ---[\s\S]*?--- End Chart Prep ---/g, '').trim())
      lines.push('')
    }

    return lines.join('\n')
  }

  const copyToClipboard = async () => {
    if (!generatedNote) return
    try {
      await navigator.clipboard.writeText(generatedNote)
      setCopied(true)
      if ('vibrate' in navigator) navigator.vibrate(30)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Copy failed:', err)
    }
  }

  const handleSign = () => {
    if ('vibrate' in navigator) navigator.vibrate([100, 50, 100])
    onSign()
    onClose()
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'var(--bg-white, #fff)',
      zIndex: 10000,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px',
        paddingTop: 'max(16px, env(safe-area-inset-top))',
        borderBottom: '1px solid var(--border, #e5e7eb)',
        background: 'linear-gradient(135deg, #EDE9FE 0%, #DDD6FE 100%)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          <span style={{ fontSize: '16px', fontWeight: 600, color: '#8B5CF6' }}>
            Preview Note
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            padding: '8px',
            cursor: 'pointer',
            color: 'var(--text-muted, #6b7280)',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Options */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border, #e5e7eb)',
        background: 'var(--bg-gray, #f9fafb)',
      }}>
        {/* Note Type */}
        <div style={{ marginBottom: '10px' }}>
          <div style={{
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--text-muted, #6b7280)',
            marginBottom: '6px',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            Note Type
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['new-consult', 'follow-up'] as const).map(type => (
              <button
                key={type}
                onClick={() => setNoteType(type)}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: noteType === type ? '2px solid #8B5CF6' : '1px solid var(--border, #e5e7eb)',
                  background: noteType === type ? '#8B5CF610' : 'var(--bg-white, #fff)',
                  color: noteType === type ? '#8B5CF6' : 'var(--text-primary, #111827)',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                {type === 'new-consult' ? 'New Consult' : 'Follow-up'}
              </button>
            ))}
          </div>
        </div>

        {/* Note Length */}
        <div>
          <div style={{
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--text-muted, #6b7280)',
            marginBottom: '6px',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            Length
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['concise', 'standard'] as const).map(length => (
              <button
                key={length}
                onClick={() => setNoteLength(length)}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: noteLength === length ? '2px solid #8B5CF6' : '1px solid var(--border, #e5e7eb)',
                  background: noteLength === length ? '#8B5CF610' : 'var(--bg-white, #fff)',
                  color: noteLength === length ? '#8B5CF6' : 'var(--text-primary, #111827)',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                {length.charAt(0).toUpperCase() + length.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Generate Button or Note Preview */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '16px',
        WebkitOverflowScrolling: 'touch',
      }}>
        {!generatedNote ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: '16px',
          }}>
            {error && (
              <div style={{
                color: '#EF4444',
                fontSize: '13px',
                textAlign: 'center',
                padding: '10px',
                background: '#FEF2F2',
                borderRadius: '8px',
                marginBottom: '8px',
              }}>
                {error}
              </div>
            )}

            <button
              onClick={generateNote}
              disabled={isGenerating}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '16px 32px',
                borderRadius: '12px',
                border: 'none',
                background: isGenerating
                  ? 'var(--text-muted, #9ca3af)'
                  : 'linear-gradient(135deg, #0D9488 0%, #14B8A6 100%)',
                color: 'white',
                fontSize: '16px',
                fontWeight: 600,
                cursor: isGenerating ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 12px rgba(13, 148, 136, 0.3)',
              }}
            >
              {isGenerating ? (
                <>
                  <div style={{
                    width: '20px',
                    height: '20px',
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: 'white',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }} />
                  Generating...
                </>
              ) : (
                <>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                  </svg>
                  Generate with AI
                </>
              )}
            </button>

            <div style={{
              fontSize: '13px',
              color: 'var(--text-muted, #6b7280)',
              textAlign: 'center',
            }}>
              AI will format your note sections into<br/>a complete clinical document
            </div>
          </div>
        ) : (
          <div style={{
            background: 'var(--bg-gray, #f9fafb)',
            borderRadius: '12px',
            padding: '16px',
            fontSize: '14px',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            fontFamily: 'ui-monospace, monospace',
            color: 'var(--text-primary, #111827)',
          }}>
            {generatedNote}
          </div>
        )}
      </div>

      {/* Footer Actions */}
      {generatedNote && (
        <div style={{
          display: 'flex',
          gap: '10px',
          padding: '12px 16px',
          paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
          borderTop: '1px solid var(--border, #e5e7eb)',
          background: 'var(--bg-white, #fff)',
        }}>
          <button
            onClick={copyToClipboard}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '12px',
              borderRadius: '10px',
              border: '1px solid var(--border, #e5e7eb)',
              background: 'var(--bg-white, #fff)',
              color: copied ? '#10B981' : 'var(--text-primary, #111827)',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {copied ? (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                Copy
              </>
            )}
          </button>

          <button
            onClick={handleSign}
            style={{
              flex: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '12px',
              borderRadius: '10px',
              border: 'none',
              background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
              color: 'white',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            Sign & Complete
          </button>
        </div>
      )}

      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
