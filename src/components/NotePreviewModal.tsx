'use client'

import { useState, useEffect } from 'react'
import {
  mergeNoteContent,
  acceptAiSuggestion,
  rejectAiSuggestion,
  updateFieldContent,
  flattenMergedNote,
  getMergeStats,
} from '@/lib/note-merge'
import type { MergedClinicalNote, NoteFieldContent, ChartPrepOutput, VisitAIOutput, ManualNoteData } from '@/lib/note-merge/types'

interface RecommendationItem {
  category: string
  items: string[]
}

interface NotePreviewModalProps {
  isOpen: boolean
  onClose: () => void
  noteData: ManualNoteData
  chartPrepData?: ChartPrepOutput | null
  visitAIData?: VisitAIOutput | null
  selectedRecommendations?: RecommendationItem[]
  onSave: (finalNote: Record<string, string>) => void
  onSign: (finalNote: Record<string, string>) => void
  patientName?: string
  visitDate?: string
}

// Source badge colors
const SOURCE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  'manual': { bg: '#F3F4F6', text: '#374151', label: 'Manual' },
  'chart-prep': { bg: '#FEF3C7', text: '#D97706', label: 'Chart Prep AI' },
  'visit-ai': { bg: '#DBEAFE', text: '#2563EB', label: 'Visit AI' },
  'merged': { bg: '#D1FAE5', text: '#059669', label: 'Merged' },
  'recommendations': { bg: '#EDE9FE', text: '#7C3AED', label: 'Smart Recs' },
}

// Section display configuration
const SECTION_CONFIG: Record<string, { label: string; order: number; required?: boolean }> = {
  chiefComplaint: { label: 'Chief Complaint / Reason for Consult', order: 1, required: true },
  hpi: { label: 'History of Present Illness', order: 2, required: true },
  ros: { label: 'Review of Systems', order: 3 },
  physicalExam: { label: 'Physical Examination', order: 4, required: true },
  assessment: { label: 'Assessment', order: 5, required: true },
  plan: { label: 'Plan / Recommendations', order: 6, required: true },
}

export default function NotePreviewModal({
  isOpen,
  onClose,
  noteData,
  chartPrepData,
  visitAIData,
  selectedRecommendations,
  onSave,
  onSign,
  patientName = 'Patient',
  visitDate,
}: NotePreviewModalProps) {
  const [mergedNote, setMergedNote] = useState<MergedClinicalNote | null>(null)
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [verificationChecklist, setVerificationChecklist] = useState<Record<string, boolean>>({})
  const [showRecommendationsReview, setShowRecommendationsReview] = useState(true)
  const [recommendationChecks, setRecommendationChecks] = useState<Record<string, boolean>>({})

  // Initialize merged note when modal opens
  useEffect(() => {
    if (isOpen) {
      const merged = mergeNoteContent(noteData, chartPrepData || null, visitAIData || null)
      setMergedNote(merged)

      // Initialize verification checklist
      const checklist: Record<string, boolean> = {}
      Object.keys(SECTION_CONFIG).forEach(key => {
        checklist[key] = false
      })
      setVerificationChecklist(checklist)

      // Initialize recommendation checks
      if (selectedRecommendations) {
        const recChecks: Record<string, boolean> = {}
        selectedRecommendations.forEach((cat, catIndex) => {
          cat.items.forEach((_, itemIndex) => {
            recChecks[`${catIndex}-${itemIndex}`] = true // Default checked
          })
        })
        setRecommendationChecks(recChecks)
      }
    }
  }, [isOpen, noteData, chartPrepData, visitAIData, selectedRecommendations])

  if (!isOpen || !mergedNote) return null

  const stats = getMergeStats(mergedNote)

  const handleAcceptSuggestion = (fieldName: keyof MergedClinicalNote) => {
    setMergedNote(prev => prev ? acceptAiSuggestion(prev, fieldName) : null)
  }

  const handleRejectSuggestion = (fieldName: keyof MergedClinicalNote) => {
    setMergedNote(prev => prev ? rejectAiSuggestion(prev, fieldName) : null)
  }

  const handleEdit = (fieldName: string, content: string) => {
    setEditingField(fieldName)
    setEditValue(content)
  }

  const handleSaveEdit = () => {
    if (editingField && mergedNote) {
      setMergedNote(updateFieldContent(mergedNote, editingField as keyof MergedClinicalNote, editValue))
      setEditingField(null)
      setEditValue('')
    }
  }

  const handleCancelEdit = () => {
    setEditingField(null)
    setEditValue('')
  }

  const toggleVerification = (fieldName: string) => {
    setVerificationChecklist(prev => ({
      ...prev,
      [fieldName]: !prev[fieldName],
    }))
  }

  const toggleRecommendation = (key: string) => {
    setRecommendationChecks(prev => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const allRequiredVerified = Object.entries(SECTION_CONFIG)
    .filter(([_, config]) => config.required)
    .every(([key]) => verificationChecklist[key])

  const handleFinalSave = () => {
    if (!mergedNote) return

    // Include selected recommendations in plan
    let finalNote = flattenMergedNote(mergedNote)

    if (selectedRecommendations && selectedRecommendations.length > 0) {
      const selectedRecItems: string[] = []
      selectedRecommendations.forEach((cat, catIndex) => {
        cat.items.forEach((item, itemIndex) => {
          if (recommendationChecks[`${catIndex}-${itemIndex}`]) {
            selectedRecItems.push(item)
          }
        })
      })

      if (selectedRecItems.length > 0) {
        const existingPlan = finalNote.plan || ''
        const recSection = '\n\n--- Smart Recommendations ---\n' + selectedRecItems.join('\n')
        finalNote.plan = existingPlan + recSection
      }
    }

    onSave(finalNote)
  }

  const handleFinalSign = () => {
    if (!mergedNote || !allRequiredVerified) return

    let finalNote = flattenMergedNote(mergedNote)

    if (selectedRecommendations && selectedRecommendations.length > 0) {
      const selectedRecItems: string[] = []
      selectedRecommendations.forEach((cat, catIndex) => {
        cat.items.forEach((item, itemIndex) => {
          if (recommendationChecks[`${catIndex}-${itemIndex}`]) {
            selectedRecItems.push(item)
          }
        })
      })

      if (selectedRecItems.length > 0) {
        const existingPlan = finalNote.plan || ''
        const recSection = '\n\n--- Smart Recommendations ---\n' + selectedRecItems.join('\n')
        finalNote.plan = existingPlan + recSection
      }
    }

    onSign(finalNote)
  }

  const renderSourceBadge = (source: string) => {
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

  const renderField = (fieldName: string, field: NoteFieldContent) => {
    const config = SECTION_CONFIG[fieldName]
    if (!config) return null

    const isEditing = editingField === fieldName
    const hasAiSuggestion = field.aiSuggestion && field.aiSuggestionStatus === 'pending'

    return (
      <div key={fieldName} style={{
        marginBottom: '16px',
        padding: '16px',
        background: 'var(--bg-gray)',
        borderRadius: '8px',
        border: `1px solid ${verificationChecklist[fieldName] ? '#10B981' : 'var(--border)'}`,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Verification checkbox */}
            <button
              onClick={() => toggleVerification(fieldName)}
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '4px',
                border: `2px solid ${verificationChecklist[fieldName] ? '#10B981' : '#D1D5DB'}`,
                background: verificationChecklist[fieldName] ? '#10B981' : 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {verificationChecklist[fieldName] && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>

            <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>
              {config.label}
              {config.required && <span style={{ color: '#EF4444', marginLeft: '2px' }}>*</span>}
            </span>

            {renderSourceBadge(field.source)}
          </div>

          {/* Edit button */}
          {!isEditing && (
            <button
              onClick={() => handleEdit(fieldName, field.content)}
              style={{
                padding: '4px 8px',
                borderRadius: '4px',
                border: '1px solid var(--border)',
                background: 'white',
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
                  background: 'white',
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
            background: 'white',
            borderRadius: '6px',
            fontSize: '13px',
            lineHeight: 1.6,
            color: field.content ? 'var(--text-primary)' : 'var(--text-muted)',
            whiteSpace: 'pre-wrap',
            minHeight: '60px',
          }}>
            {field.content || '(No content)'}
          </div>
        )}

        {/* AI Suggestion */}
        {hasAiSuggestion && !isEditing && (
          <div style={{
            marginTop: '12px',
            padding: '12px',
            background: '#FEF3C7',
            borderRadius: '6px',
            border: '1px solid #FCD34D',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#D97706' }}>
                AI Suggestion ({field.aiSuggestionSource === 'visit-ai' ? 'Visit AI' : 'Chart Prep'})
              </span>
            </div>
            <div style={{
              fontSize: '13px',
              color: '#92400E',
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              marginBottom: '12px',
            }}>
              {field.aiSuggestion}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => handleAcceptSuggestion(fieldName as keyof MergedClinicalNote)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  background: '#059669',
                  color: 'white',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Accept
              </button>
              <button
                onClick={() => handleRejectSuggestion(fieldName as keyof MergedClinicalNote)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #FCD34D',
                  background: 'white',
                  color: '#D97706',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  const sortedFields = Object.entries(mergedNote)
    .filter(([key]) => SECTION_CONFIG[key])
    .sort(([a], [b]) => (SECTION_CONFIG[a]?.order || 99) - (SECTION_CONFIG[b]?.order || 99))

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
        maxWidth: '900px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px rgba(0, 0, 0, 0.25)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Note Preview & Review
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
              {patientName} • {visitDate || new Date().toLocaleDateString()}
            </p>
          </div>

          {/* Stats */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 600, color: '#0D9488' }}>{stats.manualFields}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Manual</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 600, color: '#D97706' }}>{stats.aiFilledFields}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>AI-Filled</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 600, color: '#7C3AED' }}>{stats.fieldsWithSuggestions}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Suggestions</div>
            </div>

            <button
              onClick={onClose}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: '8px',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px',
        }}>
          {/* Note Sections */}
          {sortedFields.map(([fieldName, field]) => renderField(fieldName, field))}

          {/* Recommendations Review Section */}
          {selectedRecommendations && selectedRecommendations.length > 0 && (
            <div style={{
              marginTop: '24px',
              padding: '16px',
              background: '#EDE9FE',
              borderRadius: '12px',
              border: '1px solid #C4B5FD',
            }}>
              <div
                onClick={() => setShowRecommendationsReview(!showRecommendationsReview)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2">
                    <path d="M9 11l3 3L22 4" />
                    <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                  </svg>
                  <span style={{ fontWeight: 600, fontSize: '14px', color: '#7C3AED' }}>
                    Smart Recommendations Review
                  </span>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    background: 'white',
                    color: '#7C3AED',
                  }}>
                    {Object.values(recommendationChecks).filter(Boolean).length} selected
                  </span>
                </div>
                <svg
                  width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2"
                  style={{ transform: showRecommendationsReview ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>

              {showRecommendationsReview && (
                <div style={{ marginTop: '16px' }}>
                  {selectedRecommendations.map((category, catIndex) => (
                    <div key={catIndex} style={{ marginBottom: '12px' }}>
                      <div style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#5B21B6',
                        marginBottom: '8px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}>
                        {category.category}
                      </div>
                      {category.items.map((item, itemIndex) => {
                        const key = `${catIndex}-${itemIndex}`
                        return (
                          <div
                            key={itemIndex}
                            onClick={() => toggleRecommendation(key)}
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: '10px',
                              padding: '8px 12px',
                              background: recommendationChecks[key] ? 'white' : 'rgba(255,255,255,0.5)',
                              borderRadius: '6px',
                              marginBottom: '4px',
                              cursor: 'pointer',
                              opacity: recommendationChecks[key] ? 1 : 0.6,
                            }}
                          >
                            <div style={{
                              width: '16px',
                              height: '16px',
                              borderRadius: '4px',
                              border: `2px solid ${recommendationChecks[key] ? '#7C3AED' : '#9CA3AF'}`,
                              background: recommendationChecks[key] ? '#7C3AED' : 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              marginTop: '2px',
                            }}>
                              {recommendationChecks[key] && (
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              )}
                            </div>
                            <span style={{
                              fontSize: '13px',
                              color: 'var(--text-primary)',
                              lineHeight: 1.4,
                              textDecoration: recommendationChecks[key] ? 'none' : 'line-through',
                            }}>
                              {item}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
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
          {/* Verification Progress */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '120px',
              height: '6px',
              borderRadius: '3px',
              background: '#E5E7EB',
              overflow: 'hidden',
            }}>
              <div style={{
                width: `${(Object.values(verificationChecklist).filter(Boolean).length / Object.keys(SECTION_CONFIG).length) * 100}%`,
                height: '100%',
                background: allRequiredVerified ? '#10B981' : '#0D9488',
                transition: 'width 0.3s ease',
              }} />
            </div>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {Object.values(verificationChecklist).filter(Boolean).length}/{Object.keys(SECTION_CONFIG).length} sections verified
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
                background: 'white',
                color: 'var(--text-secondary)',
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleFinalSave}
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
              onClick={handleFinalSign}
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
