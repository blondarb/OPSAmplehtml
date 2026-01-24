'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  generateFormattedNote,
  updateFormattedNoteSection,
  verifySectionInNote,
  areRequiredSectionsVerified,
} from '@/lib/note-merge'
import type {
  ComprehensiveNoteData,
  NotePreferences,
  FormattedNote,
  FormattedNoteSection,
  NoteType,
  NoteLength,
  ContentSource,
} from '@/lib/note-merge/types'

interface EnhancedNotePreviewModalProps {
  isOpen: boolean
  onClose: () => void
  noteData: ComprehensiveNoteData
  onSave: (finalNote: Record<string, string>) => void
  onSign: (finalNote: Record<string, string>) => void
}

// Source badge colors
const SOURCE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  'manual': { bg: '#F3F4F6', text: '#374151', label: 'Manual' },
  'chart-prep': { bg: '#FEF3C7', text: '#D97706', label: 'Chart Prep' },
  'visit-ai': { bg: '#DBEAFE', text: '#2563EB', label: 'Visit AI' },
  'merged': { bg: '#D1FAE5', text: '#059669', label: 'Merged' },
  'recommendations': { bg: '#EDE9FE', text: '#7C3AED', label: 'Smart Recs' },
  'scales': { bg: '#FEE2E2', text: '#DC2626', label: 'Scales' },
  'imaging': { bg: '#E0E7FF', text: '#4F46E5', label: 'Imaging' },
}

type ViewMode = 'review' | 'final'

export default function EnhancedNotePreviewModal({
  isOpen,
  onClose,
  noteData,
  onSave,
  onSign,
}: EnhancedNotePreviewModalProps) {
  // Preferences state
  const [noteType, setNoteType] = useState<NoteType>('new-consult')
  const [noteLength, setNoteLength] = useState<NoteLength>('standard')
  const [includeScales, setIncludeScales] = useState(true)
  const [includeImaging, setIncludeImaging] = useState(true)
  const [includeLabs, setIncludeLabs] = useState(true)
  const [includeRecommendations, setIncludeRecommendations] = useState(true)

  // View mode - review sections vs final formatted note
  const [viewMode, setViewMode] = useState<ViewMode>('review')

  // Generated note state
  const [formattedNote, setFormattedNote] = useState<FormattedNote | null>(null)
  const [generationError, setGenerationError] = useState<string | null>(null)

  // Editing state
  const [editingSection, setEditingSection] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  // Copy state
  const [copySuccess, setCopySuccess] = useState(false)

  // Build preferences object
  const preferences: NotePreferences = useMemo(() => ({
    noteType,
    noteLength,
    includeScales,
    includeImaging,
    includeLabs,
    includeRecommendations,
    showSources: false,
  }), [noteType, noteLength, includeScales, includeImaging, includeLabs, includeRecommendations])

  // Generate note when modal opens or preferences change
  useEffect(() => {
    if (isOpen && noteData) {
      try {
        setGenerationError(null)
        // Ensure manualData exists with required structure
        const safeNoteData: ComprehensiveNoteData = {
          ...noteData,
          manualData: noteData.manualData || {
            chiefComplaint: '',
            hpi: '',
            ros: '',
            physicalExam: '',
            assessment: '',
            plan: '',
          },
        }
        const note = generateFormattedNote(safeNoteData, preferences)
        setFormattedNote(note)
        setViewMode('review')
        setEditingSection(null)
        setCopySuccess(false)
      } catch (error) {
        console.error('Error generating note:', error)
        setGenerationError(error instanceof Error ? error.message : 'Failed to generate note')
        setFormattedNote(null)
      }
    }
  }, [isOpen, noteData, preferences])

  if (!isOpen) return null

  // Show error state if generation failed
  if (generationError) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}>
        <div style={{
          background: 'var(--bg-white)',
          borderRadius: '16px',
          padding: '32px',
          maxWidth: '400px',
          textAlign: 'center',
        }}>
          <div style={{ color: '#EF4444', marginBottom: '16px' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <h3 style={{ margin: '0 0 8px', color: 'var(--text-primary)' }}>Error Generating Note</h3>
          <p style={{ margin: '0 0 24px', color: 'var(--text-secondary)', fontSize: '14px' }}>
            {generationError}
          </p>
          <button
            onClick={onClose}
            style={{
              padding: '10px 24px',
              borderRadius: '8px',
              border: 'none',
              background: '#0D9488',
              color: 'white',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  // Show loading state while generating
  if (!formattedNote) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}>
        <div style={{
          background: 'var(--bg-white)',
          borderRadius: '16px',
          padding: '32px',
          textAlign: 'center',
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '3px solid #E5E7EB',
            borderTopColor: '#0D9488',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px',
          }} />
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Generating note...</p>
        </div>
      </div>
    )
  }

  const allRequiredVerified = areRequiredSectionsVerified(formattedNote)

  const handleToggleVerify = (sectionId: string) => {
    setFormattedNote(prev => prev ? verifySectionInNote(prev, sectionId, !prev.sections.find(s => s.id === sectionId)?.isVerified) : null)
  }

  const handleStartEdit = (section: FormattedNoteSection) => {
    setEditingSection(section.id)
    setEditValue(section.content)
  }

  const handleSaveEdit = () => {
    if (editingSection && formattedNote) {
      setFormattedNote(updateFormattedNoteSection(formattedNote, editingSection, editValue))
      setEditingSection(null)
      setEditValue('')
    }
  }

  const handleCancelEdit = () => {
    setEditingSection(null)
    setEditValue('')
  }

  const handleCopyNote = () => {
    if (formattedNote) {
      navigator.clipboard.writeText(formattedNote.fullText).then(() => {
        setCopySuccess(true)
        setTimeout(() => setCopySuccess(false), 2000)
      })
    }
  }

  const handleSave = () => {
    if (!formattedNote) return
    const noteRecord: Record<string, string> = {}
    formattedNote.sections.forEach(section => {
      noteRecord[section.id] = section.content
    })
    onSave(noteRecord)
  }

  const handleSign = () => {
    if (!formattedNote || !allRequiredVerified) return
    const noteRecord: Record<string, string> = {}
    formattedNote.sections.forEach(section => {
      noteRecord[section.id] = section.content
    })
    onSign(noteRecord)
  }

  const verifiedCount = formattedNote.sections.filter(s => s.isVerified).length
  const totalSections = formattedNote.sections.length

  const renderSourceBadge = (source: ContentSource) => {
    const config = SOURCE_COLORS[source] || SOURCE_COLORS.manual
    return (
      <span style={{
        padding: '2px 8px',
        borderRadius: '4px',
        fontSize: '10px',
        fontWeight: 600,
        background: config.bg,
        color: config.text,
      }}>
        {config.label}
      </span>
    )
  }

  const renderSection = (section: FormattedNoteSection) => {
    const isEditing = editingSection === section.id
    const isRequired = ['chiefComplaint', 'hpi', 'physicalExam', 'assessment', 'plan'].includes(section.id)

    return (
      <div key={section.id} style={{
        marginBottom: '16px',
        padding: '16px',
        background: 'var(--bg-gray)',
        borderRadius: '8px',
        border: `1px solid ${section.isVerified ? '#10B981' : 'var(--border)'}`,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Verification checkbox */}
            <button
              onClick={() => handleToggleVerify(section.id)}
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '4px',
                border: `2px solid ${section.isVerified ? '#10B981' : 'var(--border)'}`,
                background: section.isVerified ? '#10B981' : 'var(--bg-white)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {section.isVerified && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>

            <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>
              {section.title}
              {isRequired && <span style={{ color: '#EF4444', marginLeft: '2px' }}>*</span>}
            </span>

            {renderSourceBadge(section.source)}
          </div>

          {/* Edit button */}
          {!isEditing && (
            <button
              onClick={() => handleStartEdit(section)}
              style={{
                padding: '4px 8px',
                borderRadius: '4px',
                border: '1px solid var(--border)',
                background: 'var(--bg-white)',
                cursor: 'pointer',
                fontSize: '12px',
                color: 'var(--text-secondary)',
              }}
            >
              Edit
            </button>
          )}
        </div>

        {/* Content */}
        {isEditing ? (
          <div>
            <textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              style={{
                width: '100%',
                minHeight: '120px',
                padding: '12px',
                borderRadius: '6px',
                border: '1px solid #0D9488',
                fontSize: '13px',
                lineHeight: 1.5,
                resize: 'vertical',
                fontFamily: 'inherit',
                background: 'var(--bg-white)',
                color: 'var(--text-primary)',
              }}
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button
                onClick={handleSaveEdit}
                style={{
                  padding: '6px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  background: '#0D9488',
                  color: 'white',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Save Changes
              </button>
              <button
                onClick={handleCancelEdit}
                style={{
                  padding: '6px 16px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-white)',
                  color: 'var(--text-secondary)',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div style={{
            padding: '12px',
            background: 'var(--bg-white)',
            borderRadius: '6px',
            fontSize: '13px',
            lineHeight: 1.6,
            color: section.content ? 'var(--text-primary)' : 'var(--text-muted)',
            whiteSpace: 'pre-wrap',
            minHeight: '40px',
          }}>
            {section.content || '(No content)'}
          </div>
        )}
      </div>
    )
  }

  const renderFinalNoteView = () => (
    <div style={{
      background: 'var(--bg-white)',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      padding: '24px',
      fontFamily: 'monospace',
      fontSize: '13px',
      lineHeight: 1.6,
      whiteSpace: 'pre-wrap',
      maxHeight: '100%',
      overflowY: 'auto',
      color: 'var(--text-primary)',
    }}>
      {formattedNote?.fullText || ''}
    </div>
  )

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px',
    }}>
      <div style={{
        background: 'var(--bg-white)',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '1000px',
        maxHeight: '95vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px rgba(0, 0, 0, 0.25)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Generate Clinical Note
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                {noteData.patient?.name || 'Patient'} • {noteData.visit?.date || new Date().toLocaleDateString()}
              </p>
            </div>

            <button
              onClick={onClose}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--bg-white)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Preferences Row */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '16px',
            padding: '16px',
            background: 'var(--bg-gray)',
            borderRadius: '8px',
          }}>
            {/* Note Type */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                Note Type
              </label>
              <div style={{ display: 'flex', gap: '4px' }}>
                {(['new-consult', 'follow-up'] as NoteType[]).map(type => (
                  <button
                    key={type}
                    onClick={() => setNoteType(type)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      border: noteType === type ? 'none' : '1px solid var(--border)',
                      background: noteType === type ? '#0D9488' : 'var(--bg-white)',
                      color: noteType === type ? 'white' : 'var(--text-secondary)',
                      fontSize: '12px',
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
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                Note Length
              </label>
              <div style={{ display: 'flex', gap: '4px' }}>
                {(['concise', 'standard', 'detailed'] as NoteLength[]).map(length => (
                  <button
                    key={length}
                    onClick={() => setNoteLength(length)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      border: noteLength === length ? 'none' : '1px solid var(--border)',
                      background: noteLength === length ? '#8B5CF6' : 'var(--bg-white)',
                      color: noteLength === length ? 'white' : 'var(--text-secondary)',
                      fontSize: '12px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                    }}
                  >
                    {length}
                  </button>
                ))}
              </div>
            </div>

            {/* Include Options */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                Include Sections
              </label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {[
                  { key: 'scales', label: 'Scales', value: includeScales, setter: setIncludeScales },
                  { key: 'imaging', label: 'Imaging', value: includeImaging, setter: setIncludeImaging },
                  { key: 'labs', label: 'Labs', value: includeLabs, setter: setIncludeLabs },
                  { key: 'recs', label: 'Recommendations', value: includeRecommendations, setter: setIncludeRecommendations },
                ].map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => opt.setter(!opt.value)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '16px',
                      border: '1px solid var(--border)',
                      background: opt.value ? 'var(--note-include-active-bg, #D1FAE5)' : 'var(--bg-white)',
                      color: opt.value ? 'var(--note-include-active-text, #059669)' : 'var(--text-muted)',
                      fontSize: '11px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    {opt.value && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* View Mode Toggle */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button
              onClick={() => setViewMode('review')}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: viewMode === 'review' ? 'none' : '1px solid var(--border)',
                background: viewMode === 'review' ? 'var(--bg-dark)' : 'transparent',
                color: viewMode === 'review' ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Review Sections
            </button>
            <button
              onClick={() => setViewMode('final')}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: viewMode === 'final' ? 'none' : '1px solid var(--border)',
                background: viewMode === 'final' ? 'var(--bg-dark)' : 'transparent',
                color: viewMode === 'final' ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Final Note Preview
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px',
        }}>
          {viewMode === 'review' ? (
            <>
              {formattedNote.sections
                .sort((a, b) => a.order - b.order)
                .map(section => renderSection(section))}
            </>
          ) : (
            renderFinalNoteView()
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-gray)',
        }}>
          {/* Stats */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* Verification Progress */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '120px',
                height: '6px',
                borderRadius: '3px',
                background: 'var(--border)',
                overflow: 'hidden',
              }}>
                <div style={{
                  width: `${(verifiedCount / totalSections) * 100}%`,
                  height: '100%',
                  background: allRequiredVerified ? '#10B981' : '#0D9488',
                  transition: 'width 0.3s ease',
                }} />
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {verifiedCount}/{totalSections} verified
              </span>
            </div>

            {/* Word count */}
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {formattedNote.wordCount} words
            </span>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={onClose}
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--bg-white)',
                color: 'var(--text-secondary)',
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>

            {/* Copy button */}
            <button
              onClick={handleCopyNote}
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: copySuccess ? 'var(--note-include-active-bg, #D1FAE5)' : 'var(--bg-white)',
                color: copySuccess ? 'var(--note-include-active-text, #059669)' : 'var(--text-primary)',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {copySuccess ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                  </svg>
                  Copy to EHR
                </>
              )}
            </button>

            <button
              onClick={handleSave}
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                border: 'none',
                background: '#6B7280',
                color: 'white',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Save as Draft
            </button>

            <button
              onClick={handleSign}
              disabled={!allRequiredVerified}
              style={{
                padding: '10px 24px',
                borderRadius: '8px',
                border: 'none',
                background: allRequiredVerified
                  ? 'linear-gradient(135deg, #10B981 0%, #059669 100%)'
                  : '#D1D5DB',
                color: 'white',
                fontSize: '14px',
                fontWeight: 600,
                cursor: allRequiredVerified ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
              </svg>
              Sign & Complete
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
