'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import TopNav from './TopNav'
import LeftSidebar from './LeftSidebar'
import CenterPanel from './CenterPanel'
import AiDrawer from './AiDrawer'
import VoiceDrawer from './VoiceDrawer'
import DotPhrasesDrawer from './DotPhrasesDrawer'
import EnhancedNotePreviewModal from './EnhancedNotePreviewModal'
import SettingsDrawer from './SettingsDrawer'
import IdeasDrawer from './IdeasDrawer'
import OnboardingTour from './OnboardingTour'
import {
  type ChartPrepOutput,
  type VisitAIOutput,
  type ComprehensiveNoteData,
  type ScaleResult,
  type DiagnosisEntry,
  type ImagingStudyEntry,
  type RecommendationItem,
} from '@/lib/note-merge'
import type { User } from '@supabase/supabase-js'

interface ClinicalNoteProps {
  user: User
  patient: any
  currentVisit: any
  priorVisits: any[]
  imagingStudies: any[]
  scoreHistory: any[]
}

// Icon sidebar navigation
function IconSidebar({ activeIcon, setActiveIcon }: { activeIcon: string, setActiveIcon: (icon: string) => void }) {
  const icons = [
    { id: 'queue', icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
        <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
      </svg>
    )},
    { id: 'notes', icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
      </svg>
    )},
    { id: 'schedule', icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    )},
    { id: 'calendar', icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    )},
    { id: 'diagnostic', icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9.5 2A2.5 2.5 0 0112 4.5v15a2.5 2.5 0 01-4.96.44 2.5 2.5 0 01-2.96-3.08 3 3 0 01-.34-5.58 2.5 2.5 0 011.32-4.24 2.5 2.5 0 011.98-3A2.5 2.5 0 019.5 2z"/>
        <path d="M14.5 2A2.5 2.5 0 0012 4.5v15a2.5 2.5 0 004.96.44 2.5 2.5 0 002.96-3.08 3 3 0 00.34-5.58 2.5 2.5 0 00-1.32-4.24 2.5 2.5 0 00-1.98-3A2.5 2.5 0 0014.5 2z"/>
      </svg>
    )},
  ]

  return (
    <div className="desktop-only" style={{
      width: '56px',
      background: 'var(--bg-white)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      paddingTop: '12px',
      gap: '4px',
    }}>
      {icons.map(item => (
        <button
          key={item.id}
          onClick={() => setActiveIcon(item.id)}
          style={{
            width: '40px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '8px',
            border: 'none',
            background: activeIcon === item.id ? 'var(--bg-gray)' : 'transparent',
            cursor: 'pointer',
            color: activeIcon === item.id ? 'var(--primary)' : 'var(--text-muted)',
            transition: 'all 0.2s',
          }}
        >
          {item.icon}
        </button>
      ))}
    </div>
  )
}

export default function ClinicalNote({
  user,
  patient,
  currentVisit,
  priorVisits,
  imagingStudies,
  scoreHistory,
}: ClinicalNoteProps) {
  const [darkMode, setDarkMode] = useState(false)
  const [activeIcon, setActiveIcon] = useState('queue')
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false)
  const [aiDrawerTab, setAiDrawerTab] = useState('ask-ai')
  const [voiceDrawerOpen, setVoiceDrawerOpen] = useState(false)
  const [voiceDrawerTab, setVoiceDrawerTab] = useState('chart-prep')
  const [dotPhrasesOpen, setDotPhrasesOpen] = useState(false)
  const [notePreviewOpen, setNotePreviewOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [ideasDrawerOpen, setIdeasDrawerOpen] = useState(false)
  const [ideasDrawerTab, setIdeasDrawerTab] = useState<'inspiration' | 'tour' | 'features' | 'workflows' | 'feedback'>('workflows')
  const [showTour, setShowTour] = useState(false)
  const [activeTextField, setActiveTextField] = useState<string | null>(null)
  const [selectedRecommendations, setSelectedRecommendations] = useState<RecommendationItem[]>([])

  // Additional data for comprehensive note generation
  const [completedScales, setCompletedScales] = useState<ScaleResult[]>([])
  const [selectedDiagnoses, setSelectedDiagnoses] = useState<DiagnosisEntry[]>([])
  const [imagingData, setImagingData] = useState<ImagingStudyEntry[]>([])
  const [examFindings, setExamFindings] = useState<Record<string, boolean>>({})
  const [examSectionNotes, setExamSectionNotes] = useState<Record<string, string>>({})

  // Generate a unique key for this visit's autosave data
  const autosaveKey = `sevaro-autosave-${currentVisit?.id || 'draft'}`

  // Initialize with visit data first (SSR-safe)
  // For testing: start with a clean/empty chart
  const [noteData, setNoteData] = useState({
    chiefComplaint: currentVisit?.chief_complaint || [],
    hpi: currentVisit?.clinical_notes?.hpi || '',
    ros: currentVisit?.clinical_notes?.ros || '',
    rosDetails: currentVisit?.clinical_notes?.ros_details || '',
    allergies: currentVisit?.clinical_notes?.allergies || '',
    allergyDetails: currentVisit?.clinical_notes?.allergy_details || '',
    historyAvailable: currentVisit?.clinical_notes?.history_available || '',
    historyDetails: currentVisit?.clinical_notes?.history_details || '',
    physicalExam: currentVisit?.clinical_notes?.physical_exam || '',
    assessment: currentVisit?.clinical_notes?.assessment || '',
    plan: currentVisit?.clinical_notes?.plan || '',
  })

  // Track whether autosave has been loaded (to prevent overwriting user changes)
  const [autosaveLoaded, setAutosaveLoaded] = useState(false)

  // Load autosaved data on mount (client-side only to avoid hydration mismatch)
  useEffect(() => {
    if (autosaveLoaded) return

    try {
      const saved = localStorage.getItem(autosaveKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        // Check if autosave is recent (within last 24 hours)
        if (parsed.timestamp && Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000 && parsed.data) {
          setNoteData(prev => ({
            ...prev,
            ...parsed.data,
          }))
        }
      }
    } catch (e) {
      // Invalid data, use defaults
      console.error('Failed to load autosave:', e)
    }
    setAutosaveLoaded(true)
  }, [autosaveKey, autosaveLoaded])

  // Autosave status
  const [autosaveStatus, setAutosaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')
  const autosaveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Autosave effect - debounced save to localStorage
  // Only start autosaving after initial load to avoid overwriting saved data
  useEffect(() => {
    // Don't start autosave until autosave data has been loaded
    if (!autosaveLoaded) return

    // Mark as unsaved when data changes
    setAutosaveStatus('unsaved')

    // Clear existing timeout
    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current)
    }

    // Set new timeout to save after 2 seconds of no changes
    autosaveTimeoutRef.current = setTimeout(() => {
      setAutosaveStatus('saving')
      try {
        localStorage.setItem(autosaveKey, JSON.stringify({
          data: noteData,
          timestamp: Date.now(),
        }))
        setAutosaveStatus('saved')
      } catch (e) {
        console.error('Autosave failed:', e)
        setAutosaveStatus('unsaved')
      }
    }, 2000)

    return () => {
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current)
      }
    }
  }, [noteData, autosaveKey, autosaveLoaded])

  // Save immediately on beforeunload
  useEffect(() => {
    const handleBeforeUnload = () => {
      try {
        localStorage.setItem(autosaveKey, JSON.stringify({
          data: noteData,
          timestamp: Date.now(),
        }))
      } catch (e) {
        // Silent fail on unload
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [noteData, autosaveKey])

  // Raw dictation storage - keyed by field name, stores array of dictations with timestamps
  const migrateRawDictation = (data: any): Record<string, Array<{ text: string; timestamp: string }>> => {
    if (!data) return {}
    const result: Record<string, Array<{ text: string; timestamp: string }>> = {}
    for (const [field, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        // Old format: convert string to array with single entry
        result[field] = [{ text: value, timestamp: new Date().toISOString() }]
      } else if (Array.isArray(value)) {
        // New format: use as-is
        result[field] = value as Array<{ text: string; timestamp: string }>
      }
    }
    return result
  }

  const [rawDictation, setRawDictation] = useState<Record<string, Array<{ text: string; timestamp: string }>>>(
    migrateRawDictation(currentVisit?.clinical_notes?.raw_dictation)
  )

  // AI output storage for Generate Note
  const [chartPrepOutput, setChartPrepOutput] = useState<ChartPrepOutput | null>(null)
  const [visitAIOutput, setVisitAIOutput] = useState<VisitAIOutput | null>(null)
  const [visitTranscript, setVisitTranscript] = useState<string>('')

  const updateRawDictation = (field: string, rawText: string) => {
    setRawDictation(prev => {
      const existingList = prev[field] || []
      const newEntry = {
        text: rawText,
        timestamp: new Date().toISOString(),
      }
      return { ...prev, [field]: [...existingList, newEntry] }
    })
  }

  // Callback when Chart Prep completes
  const handleChartPrepComplete = useCallback((output: ChartPrepOutput) => {
    setChartPrepOutput(output)
  }, [])

  // Callback when Visit AI completes
  const handleVisitAIComplete = useCallback((output: VisitAIOutput, transcript: string) => {
    setVisitAIOutput(output)
    setVisitTranscript(transcript)
  }, [])

  // Generate Note function - opens preview modal for review
  const generateNote = useCallback(() => {
    setNotePreviewOpen(true)
  }, [])

  // Handle saving note from preview modal
  const handleSaveFromPreview = useCallback((finalNote: Record<string, string>) => {
    // Update all note fields with the final content
    Object.entries(finalNote).forEach(([field, value]) => {
      if (field in noteData) {
        updateNote(field, value)
      }
    })
    setNotePreviewOpen(false)
  }, [noteData])

  // Handle signing note from preview modal
  const handleSignFromPreview = useCallback((finalNote: Record<string, string>) => {
    // Update all note fields with the final content
    Object.entries(finalNote).forEach(([field, value]) => {
      if (field in noteData) {
        updateNote(field, value)
      }
    })
    // Mark as signed
    // TODO: Update visit status to signed in database
    setNotePreviewOpen(false)
    // Could show a success toast here
  }, [noteData])

  // Track recommendations selected in SmartRecommendationsSection
  const handleRecommendationsSelected = useCallback((items: string[], category?: string) => {
    if (items.length > 0) {
      setSelectedRecommendations([{ category: category || 'Selected Recommendations', items }])
    } else {
      setSelectedRecommendations([])
    }
  }, [])

  // Handler for scale completion (called from SmartScalesSection/ExamScalesSection)
  const handleScaleComplete = useCallback((scaleId: string, result: any) => {
    setCompletedScales(prev => {
      const existing = prev.findIndex(s => s.scaleId === scaleId)
      const newResult: ScaleResult = {
        scaleId,
        scaleName: result.scaleName || scaleId,
        abbreviation: result.abbreviation || scaleId,
        rawScore: result.rawScore,
        maxScore: result.maxScore,
        interpretation: result.interpretation,
        severity: result.severity,
        completedAt: new Date().toISOString(),
      }
      if (existing >= 0) {
        const updated = [...prev]
        updated[existing] = newResult
        return updated
      }
      return [...prev, newResult]
    })
  }, [])

  // Handler for diagnosis selection (called from DifferentialDiagnosisSection)
  const handleDiagnosesChange = useCallback((diagnoses: DiagnosisEntry[]) => {
    setSelectedDiagnoses(diagnoses)
  }, [])

  // Handler for imaging data updates (called from ImagingResultsTab)
  const handleImagingChange = useCallback((studies: ImagingStudyEntry[]) => {
    setImagingData(studies)
  }, [])

  // Handler for exam findings updates (called from CenterPanel)
  const handleExamFindingsChange = useCallback((findings: Record<string, boolean>, notes: Record<string, string>) => {
    setExamFindings(findings)
    setExamSectionNotes(notes)
  }, [])

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    // Check for saved dark mode preference from user settings
    const savedSettings = localStorage.getItem('sevaro-user-settings')
    if (savedSettings) {
      try {
        const settings = JSON.parse(savedSettings)
        const preference = settings.darkModePreference || 'system'

        if (preference === 'system') {
          // Use system preference
          const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
          setDarkMode(systemPrefersDark)
          document.documentElement.setAttribute('data-theme', systemPrefersDark ? 'dark' : '')

          // Listen for system preference changes
          const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
          const handleChange = (e: MediaQueryListEvent) => {
            // Only respond if still on 'system' preference
            const currentSettings = localStorage.getItem('sevaro-user-settings')
            if (currentSettings) {
              const parsed = JSON.parse(currentSettings)
              if (parsed.darkModePreference === 'system') {
                setDarkMode(e.matches)
                document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : '')
              }
            }
          }
          mediaQuery.addEventListener('change', handleChange)
          return () => mediaQuery.removeEventListener('change', handleChange)
        } else {
          // Use explicit preference
          const isDark = preference === 'dark'
          setDarkMode(isDark)
          document.documentElement.setAttribute('data-theme', isDark ? 'dark' : '')
        }
      } catch (e) {
        console.error('Failed to parse settings:', e)
      }
    } else {
      // Default to system preference if no settings saved
      const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      setDarkMode(systemPrefersDark)
      document.documentElement.setAttribute('data-theme', systemPrefersDark ? 'dark' : '')
    }
  }, [])

  const handleSetDarkMode = (value: boolean) => {
    setDarkMode(value)
    document.documentElement.setAttribute('data-theme', value ? 'dark' : '')
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const openAiDrawer = (tab: string) => {
    // Route to appropriate drawer based on tab type
    if (tab === 'chart-prep' || tab === 'document') {
      setVoiceDrawerTab(tab)
      setVoiceDrawerOpen(true)
    } else {
      setAiDrawerTab(tab)
      setAiDrawerOpen(true)
    }
  }

  const openVoiceDrawer = (tab: string) => {
    setVoiceDrawerTab(tab)
    setVoiceDrawerOpen(true)
  }

  const updateNote = (field: string, value: any) => {
    setNoteData(prev => ({ ...prev, [field]: value }))
  }

  const handleInsertPhrase = (text: string) => {
    if (activeTextField) {
      const currentValue = noteData[activeTextField as keyof typeof noteData] || ''
      updateNote(activeTextField, currentValue + text)
    }
  }

  const openDotPhrases = (field?: string) => {
    if (field) setActiveTextField(field)
    setDotPhrasesOpen(true)
  }

  const saveNote = async () => {
    if (!currentVisit?.clinical_notes?.id) return

    const { error } = await supabase
      .from('clinical_notes')
      .update({
        hpi: noteData.hpi,
        ros: noteData.ros,
        allergies: noteData.allergies,
        assessment: noteData.assessment,
        plan: noteData.plan,
        raw_dictation: rawDictation,
      })
      .eq('id', currentVisit.clinical_notes.id)

    if (error) {
      console.error('Error saving note:', error)
    }
  }

  return (
    <div className="app-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <TopNav
        user={user}
        onSignOut={handleSignOut}
        openAiDrawer={openAiDrawer}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenIdeas={() => setIdeasDrawerOpen(true)}
        onToggleSidebar={() => setMobileSidebarOpen(!mobileSidebarOpen)}
        isSidebarOpen={mobileSidebarOpen}
      />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Icon Sidebar */}
        <IconSidebar activeIcon={activeIcon} setActiveIcon={setActiveIcon} />

        {/* Main Content Area */}
        <LeftSidebar
          patient={patient}
          priorVisits={priorVisits}
          scoreHistory={scoreHistory}
          isOpen={mobileSidebarOpen}
          onClose={() => setMobileSidebarOpen(false)}
        />

        <CenterPanel
          noteData={noteData}
          updateNote={updateNote}
          currentVisit={currentVisit}
          patient={patient}
          imagingStudies={imagingStudies}
          openAiDrawer={openAiDrawer}
          openVoiceDrawer={openVoiceDrawer}
          openDotPhrases={openDotPhrases}
          openFeedback={() => {
            setIdeasDrawerTab('feedback')
            setIdeasDrawerOpen(true)
          }}
          setActiveTextField={setActiveTextField}
          rawDictation={rawDictation}
          updateRawDictation={updateRawDictation}
          onGenerateNote={generateNote}
          hasAIContent={!!(chartPrepOutput || visitAIOutput)}
          onRecommendationsSelected={handleRecommendationsSelected}
          onScaleComplete={handleScaleComplete}
          onDiagnosesChange={handleDiagnosesChange}
          onImagingChange={handleImagingChange}
          onExamFindingsChange={handleExamFindingsChange}
        />
      </div>

      {aiDrawerOpen && (
        <AiDrawer
          isOpen={aiDrawerOpen}
          onClose={() => setAiDrawerOpen(false)}
          activeTab={aiDrawerTab}
          setActiveTab={setAiDrawerTab}
          patient={patient}
          noteData={noteData}
          updateNote={updateNote}
        />
      )}

      {voiceDrawerOpen && (
        <VoiceDrawer
          isOpen={voiceDrawerOpen}
          onClose={() => setVoiceDrawerOpen(false)}
          activeTab={voiceDrawerTab}
          setActiveTab={setVoiceDrawerTab}
          patient={patient}
          noteData={noteData}
          updateNote={updateNote}
          chartPrepOutput={chartPrepOutput}
          onChartPrepComplete={handleChartPrepComplete}
          onVisitAIComplete={handleVisitAIComplete}
        />
      )}

      {dotPhrasesOpen && (
        <DotPhrasesDrawer
          isOpen={dotPhrasesOpen}
          onClose={() => setDotPhrasesOpen(false)}
          onInsertPhrase={handleInsertPhrase}
          activeField={activeTextField}
        />
      )}

      <EnhancedNotePreviewModal
        isOpen={notePreviewOpen}
        onClose={() => setNotePreviewOpen(false)}
        noteData={{
          manualData: {
            chiefComplaint: noteData.chiefComplaint,
            hpi: noteData.hpi,
            ros: noteData.ros,
            rosDetails: noteData.rosDetails,
            allergies: noteData.allergies,
            allergyDetails: noteData.allergyDetails,
            historyAvailable: noteData.historyAvailable,
            historyDetails: noteData.historyDetails,
            physicalExam: noteData.physicalExam,
            assessment: noteData.assessment,
            plan: noteData.plan,
          },
          chartPrepData: chartPrepOutput,
          visitAIData: visitAIOutput,
          scales: completedScales,
          diagnoses: selectedDiagnoses,
          imagingStudies: imagingData,
          recommendations: selectedRecommendations,
          examFindings: examFindings,
          examSectionNotes: examSectionNotes,
          patient: patient ? {
            name: `${patient.first_name || ''} ${patient.last_name || ''}`.trim() || patient.name || 'Unknown',
            dob: patient.date_of_birth,
            mrn: patient.mrn,
            age: patient.age,
            gender: patient.gender,
          } : undefined,
          visit: currentVisit ? {
            date: currentVisit.visit_date ? new Date(currentVisit.visit_date).toLocaleDateString() : new Date().toLocaleDateString(),
            type: currentVisit.visit_type,
            provider: currentVisit.provider_name,
          } : undefined,
          priorVisits: priorVisits?.map(v => ({
            date: v.visit_date ? new Date(v.visit_date).toLocaleDateString() : '',
            summary: v.ai_summary,
            diagnoses: v.chief_complaints,
          })),
        }}
        onSave={handleSaveFromPreview}
        onSign={handleSignFromPreview}
      />

      <SettingsDrawer
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        darkMode={darkMode}
        setDarkMode={handleSetDarkMode}
        onStartTour={() => setShowTour(true)}
      />

      <IdeasDrawer
        isOpen={ideasDrawerOpen}
        onClose={() => setIdeasDrawerOpen(false)}
        initialTab={ideasDrawerTab}
        onStartTour={() => setShowTour(true)}
      />

      {/* Onboarding Tour for new users or when manually triggered */}
      <OnboardingTour
        forceShow={showTour}
        onComplete={() => setShowTour(false)}
      />

      {/* Autosave Status Indicator */}
      <div
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 14px',
          borderRadius: '20px',
          background: autosaveStatus === 'saved'
            ? 'var(--bg-white)'
            : autosaveStatus === 'saving'
              ? 'var(--bg-white)'
              : '#FEF3C7',
          border: `1px solid ${autosaveStatus === 'saved' ? 'var(--border)' : autosaveStatus === 'saving' ? 'var(--border)' : '#FCD34D'}`,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
          fontSize: '12px',
          color: autosaveStatus === 'saved'
            ? 'var(--text-muted)'
            : autosaveStatus === 'saving'
              ? 'var(--text-secondary)'
              : '#B45309',
          zIndex: 100,
          transition: 'all 0.3s ease',
        }}
      >
        {autosaveStatus === 'saved' && (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <span>Saved</span>
          </>
        )}
        {autosaveStatus === 'saving' && (
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
              <path d="M21 12a9 9 0 11-6.219-8.56"/>
            </svg>
            <span>Saving...</span>
          </>
        )}
        {autosaveStatus === 'unsaved' && (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            <span>Unsaved changes</span>
          </>
        )}
      </div>
    </div>
  )
}
