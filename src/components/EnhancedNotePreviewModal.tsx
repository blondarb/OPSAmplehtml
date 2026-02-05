'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder'
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

// Note review suggestion type
interface NoteReviewSuggestion {
  type: 'consistency' | 'completeness' | 'quality'
  message: string
  sectionId: string
  severity: 'warning' | 'info'
}

// Get user settings from localStorage with proper field mapping for the API
function getUserSettings() {
  if (typeof window === 'undefined') return null
  try {
    const saved = localStorage.getItem('sevaro-user-settings')
    if (!saved) return null

    const settings = JSON.parse(saved)

    // Return the settings structure expected by the API
    return {
      // Note-type specific instructions
      newConsultInstructions: settings.newConsultInstructions,
      followUpInstructions: settings.followUpInstructions,
      // Section-specific instructions - map from sectionAiInstructions to sectionInstructions
      sectionInstructions: settings.sectionAiInstructions ? {
        hpi: settings.sectionAiInstructions.hpi,
        ros: settings.sectionAiInstructions.ros,
        assessment: settings.sectionAiInstructions.assessment,
        plan: settings.sectionAiInstructions.plan,
        physicalExam: settings.sectionAiInstructions.physicalExam,
      } : undefined,
      // Note layout preferences
      noteLayout: settings.noteLayout,
      // Documentation style
      documentationStyle: settings.documentationStyle,
      preferredTerminology: settings.preferredTerminology,
      // Legacy support
      globalInstructions: settings.globalAiInstructions,
    }
  } catch {
    return null
  }
}

interface EnhancedNotePreviewModalProps {
  isOpen: boolean
  onClose: () => void
  noteData: ComprehensiveNoteData
  onSave: (finalNote: Record<string, string>) => void
  onSign: (finalNote: Record<string, string>) => void
}

// Source badge colors
const SOURCE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  'manual': { bg: 'var(--source-manual-bg, #F3F4F6)', text: 'var(--source-manual-text, #374151)', label: 'Manual' },
  'chart-prep': { bg: 'var(--source-chartprep-bg, #FEF3C7)', text: 'var(--source-chartprep-text, #D97706)', label: 'Chart Prep' },
  'visit-ai': { bg: 'var(--source-visitai-bg, #DBEAFE)', text: 'var(--source-visitai-text, #2563EB)', label: 'Visit AI' },
  'merged': { bg: 'var(--source-merged-bg, #D1FAE5)', text: 'var(--source-merged-text, #059669)', label: 'Merged' },
  'ai-synthesized': { bg: 'var(--source-ai-bg, #F0FDFA)', text: 'var(--source-ai-text, #0D9488)', label: 'AI Synthesized' },
  'recommendations': { bg: 'var(--source-recs-bg, #EDE9FE)', text: 'var(--source-recs-text, #7C3AED)', label: 'Smart Recs' },
  'scales': { bg: 'var(--source-scales-bg, #FEE2E2)', text: 'var(--source-scales-text, #DC2626)', label: 'Scales' },
  'imaging': { bg: 'var(--source-imaging-bg, #E0E7FF)', text: 'var(--source-imaging-text, #4F46E5)', label: 'Imaging' },
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

  // AI synthesis state
  const [isSynthesizing, setIsSynthesizing] = useState(false)
  const [hasSynthesized, setHasSynthesized] = useState(false)
  const [synthesisJustCompleted, setSynthesisJustCompleted] = useState(false)

  // Editing state
  const [editingSection, setEditingSection] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const editTextareaRef = useRef<HTMLTextAreaElement>(null)

  // Voice recorder for dictation in edit mode
  const {
    isRecording: isDictating,
    isTranscribing: isDictationTranscribing,
    transcribedText: dictationText,
    error: dictationError,
    startRecording: startDictation,
    stopRecording: stopDictation,
    clearTranscription: clearDictation,
  } = useVoiceRecorder()

  // Append transcribed text to edit value when dictation completes
  useEffect(() => {
    if (dictationText && editingSection) {
      setEditValue(prev => {
        // If there's existing text, add a space before appending
        if (prev.trim()) {
          return prev + ' ' + dictationText
        }
        return dictationText
      })
      clearDictation()
    }
  }, [dictationText, editingSection, clearDictation])

  // Copy state
  const [copySuccess, setCopySuccess] = useState(false)

  // Note review (Suggested Improvements) state
  const [suggestions, setSuggestions] = useState<NoteReviewSuggestion[]>([])
  const [isReviewing, setIsReviewing] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [suggestionsCollapsed, setSuggestionsCollapsed] = useState(false)
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<number>>(new Set())
  const [highlightedSection, setHighlightedSection] = useState<string | null>(null)
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Ask AI About This Note state
  const [askQuestion, setAskQuestion] = useState('')
  const [isAskingAI, setIsAskingAI] = useState(false)
  const [askHistory, setAskHistory] = useState<Array<{ question: string; answer: string }>>([])
  const askEndRef = useRef<HTMLDivElement>(null)

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

  // AI Synthesis function - calls API to intelligently merge all content
  const synthesizeWithAI = useCallback(async () => {
    if (!noteData || isSynthesizing) return

    setIsSynthesizing(true)
    setGenerationError(null)

    try {
      const userSettings = getUserSettings()

      const response = await fetch('/api/ai/synthesize-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          noteType,
          noteLength,
          manualData: noteData.manualData,
          chartPrepData: noteData.chartPrepData,
          visitAIData: noteData.visitAIData,
          scales: noteData.scales,
          diagnoses: noteData.diagnoses,
          imagingStudies: includeImaging ? noteData.imagingStudies : undefined,
          recommendations: includeRecommendations ? noteData.recommendations : undefined,
          patient: noteData.patient,
          userSettings,
        }),
      })

      const data = await response.json()

      if (data.error) {
        setGenerationError(data.error)
        return
      }

      if (data.synthesizedNote) {
        // Update the formatted note with AI-synthesized content
        setFormattedNote(prev => {
          if (!prev) return prev

          const updatedSections = prev.sections.map(section => {
            const synthesizedContent = data.synthesizedNote[section.id]
            // Ensure synthesizedContent is a string before calling trim()
            if (synthesizedContent && typeof synthesizedContent === 'string' && synthesizedContent.trim()) {
              return {
                ...section,
                content: synthesizedContent,
                source: 'ai-synthesized' as ContentSource,
              }
            }
            return section
          })

          // Regenerate full text
          const fullText = updatedSections
            .sort((a, b) => a.order - b.order)
            .filter(s => s.content)
            .map(s => `${s.title.toUpperCase()}:\n${s.content}`)
            .join('\n\n')

          return {
            ...prev,
            sections: updatedSections,
            fullText: `${prev.header}\n${fullText}\n${prev.footer}`,
            wordCount: fullText.split(/\s+/).length,
          }
        })

        setHasSynthesized(true)
        // Auto-trigger note review after synthesis
        setSynthesisJustCompleted(true)
      }
    } catch (error) {
      console.error('Error synthesizing note:', error)
      setGenerationError('Failed to synthesize note with AI')
    } finally {
      setIsSynthesizing(false)
    }
  }, [noteData, noteType, noteLength, includeImaging, includeRecommendations, isSynthesizing])

  // Review note with AI for suggestions
  const reviewNote = useCallback(async () => {
    if (!formattedNote || isReviewing) return

    setIsReviewing(true)
    setReviewError(null)
    setDismissedSuggestions(new Set())

    try {
      const sections = formattedNote.sections
        .filter(s => s.content)
        .map(s => ({ id: s.id, title: s.title, content: s.content }))

      const diagnoses = noteData.diagnoses?.map((d: { name?: string }) => d.name).filter(Boolean) || []

      const response = await fetch('/api/ai/note-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sections, noteType, diagnoses }),
      })

      const data = await response.json()

      if (data.error) {
        setReviewError(data.error)
        return
      }

      setSuggestions(data.suggestions || [])
      setSuggestionsCollapsed(false)
    } catch (error) {
      console.error('Error reviewing note:', error)
      setReviewError('Failed to review note')
    } finally {
      setIsReviewing(false)
    }
  }, [formattedNote, noteType, noteData, isReviewing])

  // Ask AI about this note
  const askAboutNote = useCallback(async (question?: string) => {
    const q = question || askQuestion.trim()
    if (!q || isAskingAI || !formattedNote) return

    setIsAskingAI(true)
    setAskQuestion('')

    try {
      const fullNoteText = formattedNote.sections
        .sort((a, b) => a.order - b.order)
        .filter(s => s.content)
        .map(s => `${s.title.toUpperCase()}:\n${s.content}`)
        .join('\n\n')

      const userSettings = getUserSettings()

      const response = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          context: {
            patient: noteData.patient?.name || 'Current patient',
            chiefComplaint: noteData.manualData?.chiefComplaint || '',
            hpi: noteData.manualData?.hpi || '',
            fullNoteText,
          },
          userSettings,
        }),
      })

      const data = await response.json()

      setAskHistory(prev => [...prev, {
        question: q,
        answer: data.response || data.error || 'No response',
      }])

      // Scroll to bottom of conversation
      setTimeout(() => askEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    } catch (error) {
      console.error('Error asking AI:', error)
      setAskHistory(prev => [...prev, {
        question: q,
        answer: 'Failed to get AI response. Please try again.',
      }])
    } finally {
      setIsAskingAI(false)
    }
  }, [askQuestion, isAskingAI, formattedNote, noteData])

  // Auto-run review after synthesis completes
  useEffect(() => {
    if (synthesisJustCompleted) {
      setSynthesisJustCompleted(false)
      reviewNote()
    }
  }, [synthesisJustCompleted, reviewNote])

  // Clear section highlight after delay
  useEffect(() => {
    if (highlightedSection) {
      const timer = setTimeout(() => setHighlightedSection(null), 2000)
      return () => clearTimeout(timer)
    }
  }, [highlightedSection])

  // Generate note when modal opens or preferences change
  useEffect(() => {
    if (isOpen && noteData) {
      try {
        setGenerationError(null)
        setHasSynthesized(false)
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
        // Reset note review and ask AI state
        setSuggestions([])
        setIsReviewing(false)
        setReviewError(null)
        setSuggestionsCollapsed(false)
        setDismissedSuggestions(new Set())
        setHighlightedSection(null)
        setAskQuestion('')
        setIsAskingAI(false)
        setAskHistory([])
        setSynthesisJustCompleted(false)
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
      // Stop any ongoing dictation
      if (isDictating) {
        stopDictation()
      }
      clearDictation()
      setFormattedNote(updateFormattedNoteSection(formattedNote, editingSection, editValue))
      setEditingSection(null)
      setEditValue('')
    }
  }

  const handleCancelEdit = () => {
    // Stop any ongoing dictation
    if (isDictating) {
      stopDictation()
    }
    clearDictation()
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

  const handleScrollToSection = (sectionId: string) => {
    const el = sectionRefs.current[sectionId]
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setHighlightedSection(sectionId)
    }
  }

  const handleDismissSuggestion = (index: number) => {
    setDismissedSuggestions(prev => new Set(prev).add(index))
  }

  const visibleSuggestions = suggestions.filter((_, i) => !dismissedSuggestions.has(i))

  const renderSuggestionsPanel = () => {
    const hasRun = suggestions.length > 0 || reviewError || isReviewing
    const isEmpty = !isReviewing && !reviewError && suggestions.length === 0 && hasRun

    return (
      <div style={{
        marginTop: '16px',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <button
          onClick={() => setSuggestionsCollapsed(!suggestionsCollapsed)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            background: 'var(--bg-gray)',
            border: 'none',
            cursor: 'pointer',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Sparkle icon */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#0D9488">
              <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" />
            </svg>
            <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
              Note Review
            </span>
            {visibleSuggestions.length > 0 && (
              <span style={{
                background: '#F59E0B',
                color: 'white',
                borderRadius: '10px',
                padding: '1px 8px',
                fontSize: '11px',
                fontWeight: 600,
              }}>
                {visibleSuggestions.length}
              </span>
            )}
            {isEmpty && (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {!isReviewing && (
              <span
                onClick={(e) => {
                  e.stopPropagation()
                  reviewNote()
                }}
                style={{
                  padding: '4px 12px',
                  borderRadius: '6px',
                  background: '#0D9488',
                  color: 'white',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Check Note
              </span>
            )}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--text-muted)"
              strokeWidth="2"
              style={{ transform: suggestionsCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </button>

        {/* Body */}
        {!suggestionsCollapsed && (
          <div style={{ padding: '12px 16px' }}>
            {isReviewing && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', color: 'var(--text-secondary)', fontSize: '13px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                  <path d="M21 12a9 9 0 11-6.219-8.56" />
                </svg>
                Analyzing note for suggestions...
              </div>
            )}

            {reviewError && (
              <div style={{ padding: '8px 12px', borderRadius: '6px', background: '#FEE2E2', color: '#DC2626', fontSize: '13px' }}>
                {reviewError}
              </div>
            )}

            {isEmpty && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', color: '#10B981', fontSize: '13px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                No issues found — note looks good.
              </div>
            )}

            {!hasRun && !isReviewing && (
              <div style={{ padding: '8px 0', color: 'var(--text-muted)', fontSize: '13px', fontStyle: 'italic' }}>
                Click &quot;Check Note&quot; to get AI-powered documentation suggestions.
              </div>
            )}

            {visibleSuggestions.map((suggestion, idx) => {
              const originalIdx = suggestions.indexOf(suggestion)
              const borderColor = suggestion.severity === 'warning' ? '#F59E0B' : '#0D9488'
              const typeBg = suggestion.type === 'consistency' ? '#FEF3C7' : suggestion.type === 'completeness' ? '#DBEAFE' : '#F0FDF4'
              const typeColor = suggestion.type === 'consistency' ? '#D97706' : suggestion.type === 'completeness' ? '#2563EB' : '#15803D'
              const sectionName = formattedNote?.sections.find(s => s.id === suggestion.sectionId)?.title

              return (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '10px 12px',
                    marginBottom: '8px',
                    borderLeft: `3px solid ${borderColor}`,
                    borderRadius: '0 6px 6px 0',
                    background: 'var(--bg-white)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{
                        padding: '1px 6px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: 600,
                        background: typeBg,
                        color: typeColor,
                        textTransform: 'capitalize',
                      }}>
                        {suggestion.type}
                      </span>
                      {sectionName && (
                        <button
                          onClick={() => handleScrollToSection(suggestion.sectionId)}
                          style={{
                            border: 'none',
                            background: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            fontSize: '11px',
                            color: '#0D9488',
                            fontWeight: 500,
                            textDecoration: 'underline',
                          }}
                        >
                          Go to {sectionName}
                        </button>
                      )}
                    </div>
                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.4 }}>
                      {suggestion.message}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDismissSuggestion(originalIdx)}
                    style={{
                      border: 'none',
                      background: 'none',
                      cursor: 'pointer',
                      padding: '2px',
                      color: 'var(--text-muted)',
                      flexShrink: 0,
                    }}
                    title="Dismiss"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  const SUGGESTED_QUESTIONS = [
    'Is the assessment consistent with the HPI?',
    'What billing codes does this note support?',
    'Does the plan address all diagnoses?',
    'Summarize this note in 2 sentences',
  ]

  const renderAskConversation = () => {
    if (askHistory.length === 0) return null

    return (
      <div style={{ marginTop: '16px' }}>
        {askHistory.map((entry, idx) => (
          <div key={idx} style={{ marginBottom: '12px' }}>
            {/* Question bubble - right aligned */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
              <div style={{
                maxWidth: '80%',
                padding: '8px 12px',
                borderRadius: '12px 12px 2px 12px',
                background: '#0D9488',
                color: 'white',
                fontSize: '13px',
                lineHeight: 1.4,
              }}>
                {entry.question}
              </div>
            </div>
            {/* Answer bubble - left aligned */}
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{
                maxWidth: '80%',
                padding: '8px 12px',
                borderRadius: '12px 12px 12px 2px',
                background: 'var(--bg-gray)',
                borderLeft: '3px solid #0D9488',
                fontSize: '13px',
                lineHeight: 1.5,
                color: 'var(--text-primary)',
                whiteSpace: 'pre-wrap',
              }}>
                {entry.answer}
              </div>
            </div>
          </div>
        ))}
        <div ref={askEndRef} />
      </div>
    )
  }

  const renderAskInputBar = () => (
    <div style={{
      padding: '12px 24px',
      borderTop: '1px solid var(--border)',
      background: 'var(--bg-white)',
    }}>
      {/* Suggested question pills (only shown when no history) */}
      {askHistory.length === 0 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
          {SUGGESTED_QUESTIONS.map((q, idx) => (
            <button
              key={idx}
              onClick={() => askAboutNote(q)}
              disabled={isAskingAI}
              style={{
                padding: '4px 10px',
                borderRadius: '16px',
                border: '1px solid var(--border)',
                background: 'var(--bg-gray)',
                color: 'var(--text-secondary)',
                fontSize: '11px',
                cursor: isAskingAI ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
                opacity: isAskingAI ? 0.5 : 1,
              }}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input row */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="#0D9488" style={{ flexShrink: 0 }}>
          <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" />
        </svg>
        <input
          type="text"
          value={askQuestion}
          onChange={(e) => setAskQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); askAboutNote() } }}
          placeholder="Ask about this note..."
          disabled={isAskingAI}
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            fontSize: '13px',
            background: 'var(--bg-white)',
            color: 'var(--text-primary)',
            outline: 'none',
          }}
        />
        <button
          onClick={() => askAboutNote()}
          disabled={!askQuestion.trim() || isAskingAI}
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            border: 'none',
            background: askQuestion.trim() && !isAskingAI ? '#0D9488' : 'var(--bg-gray)',
            cursor: askQuestion.trim() && !isAskingAI ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {isAskingAI ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
              <path d="M21 12a9 9 0 11-6.219-8.56" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={askQuestion.trim() ? 'white' : 'var(--text-muted)'} strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )

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
      <div
        key={section.id}
        ref={(el) => { sectionRefs.current[section.id] = el }}
        style={{
          marginBottom: '16px',
          padding: '16px',
          background: 'var(--bg-gray)',
          borderRadius: '8px',
          border: `1px solid ${highlightedSection === section.id ? '#0D9488' : section.isVerified ? '#10B981' : 'var(--border)'}`,
          transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
          boxShadow: highlightedSection === section.id ? '0 0 0 2px rgba(13, 148, 136, 0.3)' : 'none',
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
            {/* Textarea with dictation button */}
            <div style={{ position: 'relative' }}>
              <textarea
                ref={editTextareaRef}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                disabled={isDictating || isDictationTranscribing}
                style={{
                  width: '100%',
                  minHeight: '120px',
                  padding: '12px',
                  paddingRight: '48px',
                  borderRadius: '6px',
                  border: `1px solid ${isDictating ? '#EF4444' : '#0D9488'}`,
                  fontSize: '13px',
                  lineHeight: 1.5,
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  background: 'var(--bg-white)',
                  color: 'var(--text-primary)',
                  opacity: isDictating || isDictationTranscribing ? 0.7 : 1,
                }}
              />
              {/* Dictation button */}
              <button
                onClick={() => {
                  if (isDictating) {
                    stopDictation()
                  } else {
                    startDictation()
                  }
                }}
                disabled={isDictationTranscribing}
                title={isDictating ? 'Stop dictation' : isDictationTranscribing ? 'Transcribing...' : 'Start dictation'}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '8px',
                  width: '32px',
                  height: '32px',
                  borderRadius: '6px',
                  border: 'none',
                  background: isDictating ? '#EF4444' : isDictationTranscribing ? '#F3F4F6' : '#FEE2E2',
                  cursor: isDictationTranscribing ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                }}
              >
                {isDictationTranscribing ? (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#6B7280"
                    strokeWidth="2"
                    style={{ animation: 'spin 1s linear infinite' }}
                  >
                    <path d="M21 12a9 9 0 11-6.219-8.56" />
                  </svg>
                ) : isDictating ? (
                  // Stop icon (square)
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#FFFFFF">
                    <rect x="4" y="4" width="16" height="16" rx="2" />
                  </svg>
                ) : (
                  // Mic icon
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2">
                    <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                    <path d="M19 10v2a7 7 0 01-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                )}
              </button>
            </div>

            {/* Recording/transcribing status */}
            {(isDictating || isDictationTranscribing) && (
              <div style={{
                marginTop: '8px',
                padding: '8px 12px',
                borderRadius: '6px',
                background: isDictating ? '#FEE2E2' : '#F3F4F6',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '12px',
                color: isDictating ? '#DC2626' : '#6B7280',
              }}>
                {isDictating ? (
                  <>
                    <span style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: '#EF4444',
                      animation: 'pulse 1s ease-in-out infinite',
                    }} />
                    Recording... Click the mic button to stop.
                  </>
                ) : (
                  <>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      style={{ animation: 'spin 1s linear infinite' }}
                    >
                      <path d="M21 12a9 9 0 11-6.219-8.56" />
                    </svg>
                    Transcribing audio...
                  </>
                )}
              </div>
            )}

            {/* Dictation error */}
            {dictationError && (
              <div style={{
                marginTop: '8px',
                padding: '8px 12px',
                borderRadius: '6px',
                background: '#FEE2E2',
                color: '#DC2626',
                fontSize: '12px',
              }}>
                {dictationError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button
                onClick={handleSaveEdit}
                disabled={isDictating || isDictationTranscribing}
                style={{
                  padding: '6px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  background: '#0D9488',
                  color: 'white',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: isDictating || isDictationTranscribing ? 'not-allowed' : 'pointer',
                  opacity: isDictating || isDictationTranscribing ? 0.6 : 1,
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

          {/* View Mode Toggle and AI Synthesize */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
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

            {/* AI Synthesize Button */}
            <button
              onClick={synthesizeWithAI}
              disabled={isSynthesizing}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                background: hasSynthesized
                  ? 'linear-gradient(135deg, #10B981 0%, #059669 100%)'
                  : 'linear-gradient(135deg, #0D9488 0%, #0F766E 100%)',
                color: 'white',
                fontSize: '13px',
                fontWeight: 600,
                cursor: isSynthesizing ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                opacity: isSynthesizing ? 0.7 : 1,
                boxShadow: '0 2px 8px rgba(13, 148, 136, 0.3)',
              }}
            >
              {isSynthesizing ? (
                <>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{ animation: 'spin 1s linear infinite' }}
                  >
                    <path d="M21 12a9 9 0 11-6.219-8.56" />
                  </svg>
                  Synthesizing...
                </>
              ) : hasSynthesized ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  AI Synthesized
                </>
              ) : (
                <>
                  {/* AI Sparkle Icon */}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" />
                  </svg>
                  AI Synthesize All
                </>
              )}
            </button>
          </div>

          {/* Info text about AI synthesis */}
          {!hasSynthesized && (
            <p style={{
              marginTop: '8px',
              fontSize: '12px',
              color: 'var(--text-muted)',
              fontStyle: 'italic',
            }}>
              Click "AI Synthesize All" to intelligently combine Chart Prep, Visit AI, and manual entries into a cohesive note.
            </p>
          )}
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

              {/* Suggestions Panel */}
              {renderSuggestionsPanel()}
            </>
          ) : (
            renderFinalNoteView()
          )}

          {/* Ask AI Conversation History */}
          {renderAskConversation()}
        </div>

        {/* Ask AI Input Bar */}
        {renderAskInputBar()}

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
