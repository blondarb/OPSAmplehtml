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
import OnboardingTour, { resetOnboardingTour } from './OnboardingTour'
import PatientAppointments, { type Appointment } from './PatientAppointments'
import ScheduleFollowupModal from './ScheduleFollowupModal'
import ScheduleNewPatientModal from './ScheduleNewPatientModal'
import {
  type ChartPrepOutput,
  type VisitAIOutput,
  type ComprehensiveNoteData,
  type ScaleResult,
  type DiagnosisEntry,
  type ImagingStudyEntry,
  type RecommendationItem,
} from '@/lib/note-merge'
import type { PatientMedication, PatientAllergy } from '@/lib/medicationTypes'
import type { User } from '@supabase/supabase-js'

interface ClinicalNoteProps {
  user: User
  patient: any
  currentVisit: any
  priorVisits: any[]
  imagingStudies: any[]
  scoreHistory: any[]
  patientMessages?: any[]
  historianSessions?: any[]
}

// Icon sidebar navigation
function IconSidebar({ activeIcon, setActiveIcon, viewMode, onViewModeChange }: {
  activeIcon: string,
  setActiveIcon: (icon: string) => void,
  viewMode: 'appointments' | 'chart',
  onViewModeChange: (mode: 'appointments' | 'chart') => void
}) {
  const icons = [
    { id: 'home', tooltip: 'Appointments', icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    )},
    { id: 'calendar', tooltip: 'Calendar', icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    )},
    { id: 'users', tooltip: 'Patients', icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 00-3-3.87"/>
        <path d="M16 3.13a4 4 0 010 7.75"/>
      </svg>
    )},
    { id: 'clock', tooltip: 'Schedule', icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    )},
    { id: 'branch', tooltip: 'Workflows', icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="6" y1="3" x2="6" y2="15"/>
        <circle cx="18" cy="6" r="3"/>
        <circle cx="6" cy="18" r="3"/>
        <path d="M18 9a9 9 0 01-9 9"/>
      </svg>
    )},
    { id: 'notes', tooltip: 'Notes', active: viewMode === 'chart', icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
      </svg>
    )},
    { id: 'document', tooltip: 'Documents', icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/>
        <polyline points="13 2 13 9 20 9"/>
      </svg>
    )},
    { id: 'phone', tooltip: 'Calls', icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/>
      </svg>
    )},
    { id: 'settings', tooltip: 'Settings', icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
      </svg>
    )},
    { id: 'help', tooltip: 'Help', icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/>
        <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    )},
  ]

  const handleIconClick = (iconId: string) => {
    setActiveIcon(iconId)
    // Home icon always shows appointments list
    if (iconId === 'home') {
      onViewModeChange('appointments')
    }
    // Notes icon shows current chart (if a patient is selected)
    if (iconId === 'notes') {
      onViewModeChange('chart')
    }
  }

  // Determine which icon is actually active based on viewMode
  const getIsActive = (iconId: string) => {
    if (viewMode === 'appointments' && iconId === 'home') return true
    if (viewMode === 'chart' && iconId === 'notes') return true
    return activeIcon === iconId && iconId !== 'home' && iconId !== 'notes'
  }

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
          onClick={() => handleIconClick(item.id)}
          title={item.tooltip}
          style={{
            width: '40px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '8px',
            border: 'none',
            background: getIsActive(item.id) ? 'var(--bg-gray)' : 'transparent',
            cursor: 'pointer',
            color: getIsActive(item.id) ? 'var(--primary)' : 'var(--text-muted)',
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
  patient: initialPatient,
  currentVisit: initialVisit,
  priorVisits: initialPriorVisits,
  imagingStudies: initialImagingStudies,
  scoreHistory: initialScoreHistory,
  patientMessages = [],
  historianSessions = [],
}: ClinicalNoteProps) {
  const [darkMode, setDarkMode] = useState(false)
  const [activeIcon, setActiveIcon] = useState('home')
  const [viewMode, setViewMode] = useState<'appointments' | 'chart'>('appointments') // Start with appointments view
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  // Dynamic patient/visit data - can be loaded from appointment selection
  const [patient, setPatient] = useState(initialPatient)
  const [currentVisit, setCurrentVisit] = useState(initialVisit)
  const [priorVisits, setPriorVisits] = useState(initialPriorVisits || [])
  const [imagingStudies, setImagingStudies] = useState(initialImagingStudies || [])
  const [scoreHistory, setScoreHistory] = useState(initialScoreHistory || [])
  const [patientHistorianSessions, setPatientHistorianSessions] = useState(historianSessions || [])
  const [loadingPatient, setLoadingPatient] = useState(false)
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
  const [followupModalOpen, setFollowupModalOpen] = useState(false)
  const [resetModalOpen, setResetModalOpen] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [scheduleNewPatientOpen, setScheduleNewPatientOpen] = useState(false)
  const [demoHint, setDemoHint] = useState<string | null>(null)
  const [appointmentsRefreshKey, setAppointmentsRefreshKey] = useState(0)

  // Structured medication and allergy data
  const [medications, setMedications] = useState<PatientMedication[]>([])
  const [allergies, setAllergies] = useState<PatientAllergy[]>([])

  // Additional data for comprehensive note generation
  const [completedScales, setCompletedScales] = useState<ScaleResult[]>([])
  const [selectedDiagnoses, setSelectedDiagnoses] = useState<DiagnosisEntry[]>([])
  const [imagingData, setImagingData] = useState<ImagingStudyEntry[]>([])
  const [examFindings, setExamFindings] = useState<Record<string, boolean>>({})
  const [examSectionNotes, setExamSectionNotes] = useState<Record<string, string>>({})

  // Track patient switching to prevent autosave race conditions
  const isSwitchingPatientRef = useRef(false)

  // Generate a unique key for this visit's autosave data
  // CRITICAL: Include patient ID to prevent cross-patient data contamination
  const autosaveKey = `sevaro-autosave-${patient?.id || 'unknown'}-${currentVisit?.id || 'draft'}`

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
    examFreeText: currentVisit?.clinical_notes?.exam_free_text || '',
    assessment: currentVisit?.clinical_notes?.assessment || '',
    plan: currentVisit?.clinical_notes?.plan || '',
    vitals: currentVisit?.clinical_notes?.vitals || { bp: '', hr: '', temp: '', weight: '', bmi: '' },
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
        // AND validate that patient ID matches to prevent cross-patient contamination
        const isRecent = parsed.timestamp && Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000
        const patientMatches = !parsed.patientId || parsed.patientId === patient?.id

        if (isRecent && parsed.data && patientMatches) {
          setNoteData(prev => ({
            ...prev,
            ...parsed.data,
          }))
        } else if (!patientMatches) {
          // Clear mismatched autosave data
          console.warn('Autosave patient mismatch - clearing stale data')
          localStorage.removeItem(autosaveKey)
        }
      }
    } catch (e) {
      // Invalid data, use defaults
      console.error('Failed to load autosave:', e)
    }
    setAutosaveLoaded(true)
  }, [autosaveKey, autosaveLoaded, patient?.id])

  // Autosave status
  const [autosaveStatus, setAutosaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')
  const autosaveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Autosave effect - debounced save to localStorage
  // Only start autosaving after initial load to avoid overwriting saved data
  useEffect(() => {
    // Don't start autosave until autosave data has been loaded
    if (!autosaveLoaded) return

    // Don't autosave if we don't have a valid patient (prevents saving during patient switch)
    if (!patient?.id) return

    // Don't autosave if we're in the middle of switching patients
    if (isSwitchingPatientRef.current) {
      console.log('Skipping autosave - patient switch in progress')
      return
    }

    // Mark as unsaved when data changes
    setAutosaveStatus('unsaved')

    // Clear existing timeout
    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current)
    }

    // Capture current patient ID to validate in the timeout callback
    const currentPatientId = patient.id

    // Set new timeout to save after 2 seconds of no changes
    autosaveTimeoutRef.current = setTimeout(() => {
      // Double-check we're not switching patients
      if (isSwitchingPatientRef.current) {
        console.log('Skipping autosave - patient switch in progress (timeout)')
        return
      }

      // Double-check patient ID hasn't changed during the delay
      // This prevents saving old patient data to new patient's autosave key
      if (patient?.id !== currentPatientId) {
        console.log('Patient changed during autosave delay, skipping save')
        return
      }

      setAutosaveStatus('saving')
      try {
        localStorage.setItem(autosaveKey, JSON.stringify({
          data: noteData,
          timestamp: Date.now(),
          patientId: patient?.id, // Store patient ID for validation
          visitId: currentVisit?.id,
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
  }, [noteData, autosaveKey, autosaveLoaded, patient?.id])

  // Save immediately on beforeunload
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Don't save if no valid patient (prevents saving during transition)
      if (!patient?.id) return

      // Don't save if switching patients
      if (isSwitchingPatientRef.current) return

      try {
        localStorage.setItem(autosaveKey, JSON.stringify({
          data: noteData,
          timestamp: Date.now(),
          patientId: patient?.id,
          visitId: currentVisit?.id,
        }))
      } catch (e) {
        // Silent fail on unload
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [noteData, autosaveKey, patient?.id, currentVisit?.id])

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

  // Handle selecting a patient from appointments list
  const handleSelectPatient = async (appointment: Appointment) => {
    if (!appointment.patient) return

    // Mark that we're switching patients - prevents autosave during transition
    isSwitchingPatientRef.current = true

    // CRITICAL: Cancel any pending autosave timeout FIRST
    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current)
      autosaveTimeoutRef.current = null
    }

    // SAVE the current patient's data before switching (if we have a patient)
    if (patient?.id && noteData) {
      const oldAutosaveKey = `sevaro-autosave-${patient.id}-${currentVisit?.id || 'draft'}`
      try {
        localStorage.setItem(oldAutosaveKey, JSON.stringify({
          data: noteData,
          timestamp: Date.now(),
          patientId: patient.id,
          visitId: currentVisit?.id,
        }))
        console.log('Saved autosave for previous patient:', patient.id)
      } catch (e) {
        console.error('Failed to save old patient autosave:', e)
      }
    }

    // Reset noteData to empty while loading (prevents flash of old data)
    setNoteData({
      chiefComplaint: [],
      hpi: '',
      ros: '',
      rosDetails: '',
      allergies: '',
      allergyDetails: '',
      historyAvailable: '',
      historyDetails: '',
      physicalExam: '',
      examFreeText: '',
      assessment: '',
      plan: '',
      vitals: { bp: '', hr: '', temp: '', weight: '', bmi: '' },
    })

    // Allow autosave loading for the new patient
    setAutosaveLoaded(false)

    setSelectedAppointment(appointment)
    setLoadingPatient(true)

    try {
      // Fetch full patient data with history
      const patientRes = await fetch(`/api/patients/${appointment.patient.id}`)
      if (!patientRes.ok) throw new Error('Failed to fetch patient')
      const patientData = await patientRes.json()

      // Set patient data (API returns { patient: {...}, medications: [...], ... })
      const pt = patientData.patient
      setPatient({
        id: pt.id,
        mrn: pt.mrn,
        first_name: pt.firstName,
        last_name: pt.lastName,
        date_of_birth: pt.dateOfBirth,
        gender: pt.gender,
        phone: pt.phone,
        email: pt.email,
        address: pt.address,
        referring_physician: pt.referringPhysician,
        referral_reason: pt.referralReason,
        primary_care_physician: pt.primaryCarePhysician,
        insurance_provider: pt.insuranceProvider,
        insurance_id: pt.insuranceId,
        medications: patientData.medications || [],
        allergies: patientData.allergies || [],
      })

      // Set prior visits (completed visits with AI summaries)
      const completedVisits = (patientData.visits || [])
        .filter((v: any) => v.status === 'completed')
        .map((v: any) => ({
          id: v.id,
          visit_date: v.visitDate,
          visit_type: v.visitType,
          chief_complaint: v.chiefComplaint,
          status: v.status,
          provider: v.providerName,
          clinical_notes: v.clinicalNote ? {
            ai_summary: v.clinicalNote.aiSummary,
            hpi: v.clinicalNote.hpi,
            assessment: v.clinicalNote.assessment,
            plan: v.clinicalNote.plan,
          } : null,
        }))
      setPriorVisits(completedVisits)

      // Set imaging studies
      setImagingStudies(patientData.imagingStudies || [])

      // Set score history
      setScoreHistory(patientData.scoreHistory || [])

      // Fetch historian sessions scoped to this patient
      try {
        const histRes = await fetch(`/api/ai/historian/save?patient_id=${appointment.patient.id}`)
        if (histRes.ok) {
          const histData = await histRes.json()
          setPatientHistorianSessions(histData.sessions || [])
        } else {
          setPatientHistorianSessions([])
        }
      } catch {
        setPatientHistorianSessions([])
      }

      // Create or get visit for this appointment
      let visit = null
      if (appointment.visitId) {
        // Visit already exists, fetch it
        const visitRes = await fetch(`/api/visits/${appointment.visitId}`)
        if (visitRes.ok) {
          const visitData = await visitRes.json()
          visit = visitData.visit
        }
      }

      if (!visit) {
        // Create a new visit for this appointment
        const visitRes = await fetch('/api/visits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            patientId: appointment.patient.id,
            appointmentId: appointment.id,
            visitType: appointment.appointmentType,
            chiefComplaint: appointment.reasonForVisit ? [appointment.reasonForVisit] : [],
          }),
        })

        if (visitRes.ok) {
          const visitData = await visitRes.json()
          visit = visitData.visit
        }
      }

      if (visit) {
        setCurrentVisit({
          id: visit.id,
          patient_id: visit.patientId || visit.patient_id,
          visit_date: visit.visitDate || visit.visit_date,
          visit_type: visit.visitType || visit.visit_type,
          chief_complaint: visit.chiefComplaint || visit.chief_complaint || [],
          status: visit.status,
          clinical_notes: visit.clinicalNote || visit.clinical_notes?.[0] ? {
            id: (visit.clinicalNote || visit.clinical_notes?.[0])?.id,
            hpi: (visit.clinicalNote || visit.clinical_notes?.[0])?.hpi || '',
            ros: (visit.clinicalNote || visit.clinical_notes?.[0])?.ros || '',
            allergies: (visit.clinicalNote || visit.clinical_notes?.[0])?.allergies || '',
            physical_exam: (visit.clinicalNote || visit.clinical_notes?.[0])?.physicalExam || (visit.clinicalNote || visit.clinical_notes?.[0])?.physical_exam || '',
            assessment: (visit.clinicalNote || visit.clinical_notes?.[0])?.assessment || '',
            plan: (visit.clinicalNote || visit.clinical_notes?.[0])?.plan || '',
            status: (visit.clinicalNote || visit.clinical_notes?.[0])?.status || 'draft',
            ai_summary: (visit.clinicalNote || visit.clinical_notes?.[0])?.aiSummary || (visit.clinicalNote || visit.clinical_notes?.[0])?.ai_summary || '',
          } : null,
        })

        // Reset note data for new visit
        const clinicalNote = visit.clinicalNote || visit.clinical_notes?.[0]
        setNoteData({
          chiefComplaint: visit.chiefComplaint || visit.chief_complaint || [],
          hpi: clinicalNote?.hpi || '',
          ros: clinicalNote?.ros || '',
          rosDetails: clinicalNote?.rosDetails || clinicalNote?.ros_details || '',
          allergies: clinicalNote?.allergies || '',
          allergyDetails: clinicalNote?.allergyDetails || clinicalNote?.allergy_details || '',
          historyAvailable: clinicalNote?.historyAvailable || clinicalNote?.history_available || '',
          historyDetails: clinicalNote?.historyDetails || clinicalNote?.history_details || '',
          physicalExam: clinicalNote?.physicalExam || clinicalNote?.physical_exam || '',
          examFreeText: clinicalNote?.examFreeText || clinicalNote?.exam_free_text || '',
          assessment: clinicalNote?.assessment || '',
          plan: clinicalNote?.plan || '',
          vitals: clinicalNote?.vitals || { bp: '', hr: '', temp: '', weight: '', bmi: '' },
        })

        // Reset AI output states
        setChartPrepOutput(null)
        setVisitAIOutput(null)
        setVisitTranscript('')
        setRawDictation({})
        setCompletedScales([])
        setSelectedDiagnoses([])
        setImagingData([])
        setExamFindings({})
        setExamSectionNotes({})
        setSelectedRecommendations([])

        // Medications/allergies will be re-fetched via the useEffect on patient.id change

        // Now check for localStorage autosave for THIS patient and merge it
        // This preserves any chart prep work done before seeing the patient
        const newAutosaveKey = `sevaro-autosave-${appointment.patient.id}-${visit.id}`
        try {
          const saved = localStorage.getItem(newAutosaveKey)
          if (saved) {
            const parsed = JSON.parse(saved)
            const isRecent = parsed.timestamp && Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000
            const patientMatches = parsed.patientId === appointment.patient.id

            if (isRecent && parsed.data && patientMatches) {
              console.log('Loading saved autosave data for patient:', appointment.patient.id)
              setNoteData(prev => ({
                ...prev,
                ...parsed.data,
              }))
            }
          }
        } catch (e) {
          console.error('Failed to load autosave for new patient:', e)
        }

        // Mark autosave as loaded - we've handled it manually
        setAutosaveLoaded(true)
      }

      setViewMode('chart')
      setActiveIcon('notes')
    } catch (error) {
      console.error('Error loading patient data:', error)
      // Still switch to chart view, but show error state
      setViewMode('chart')
      setActiveIcon('notes')
    } finally {
      setLoadingPatient(false)
      // Mark patient switch as complete
      isSwitchingPatientRef.current = false
    }
  }

  // Handle going back to appointments list
  const handleBackToAppointments = () => {
    setViewMode('appointments')
    setActiveIcon('home')
  }

  // Handle demo reset - opens confirmation modal
  const handleResetDemo = () => {
    setResetModalOpen(true)
  }

  const executeResetDemo = async () => {
    setResetting(true)
    try {
      const response = await fetch('/api/demo/reset', { method: 'POST' })
      if (!response.ok) {
        const data = await response.json()
        console.error('Reset failed:', data.error)
        setResetting(false)
        setResetModalOpen(false)
        return
      }
      // Reset the onboarding tour so it replays
      resetOnboardingTour()
      // Go back to appointments view and reload the page
      window.location.href = '/dashboard'
    } catch (err) {
      console.error('Error resetting demo:', err)
      setResetting(false)
      setResetModalOpen(false)
    }
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

  const handleImportHistorian = (session: any) => {
    if (!session?.structured_output) return
    const so = session.structured_output
    setNoteData(prev => ({
      ...prev,
      hpi: so.hpi || prev.hpi,
      allergies: so.allergies || prev.allergies,
      assessment: so.chief_complaint ? `${so.chief_complaint}\n${prev.assessment || ''}`.trim() : prev.assessment,
    }))
  }

  // Fetch medications and allergies when patient changes
  useEffect(() => {
    if (!patient?.id) return
    const fetchMedsAndAllergies = async () => {
      try {
        const [medsRes, allergiesRes] = await Promise.all([
          fetch(`/api/medications?patient_id=${patient.id}`),
          fetch(`/api/allergies?patient_id=${patient.id}`),
        ])
        if (medsRes.ok) {
          const medsData = await medsRes.json()
          setMedications(medsData.medications || [])
        }
        if (allergiesRes.ok) {
          const allergiesData = await allergiesRes.json()
          setAllergies(allergiesData.allergies || [])
        }
      } catch (e) {
        console.error('Failed to fetch medications/allergies:', e)
      }
    }
    fetchMedsAndAllergies()
  }, [patient?.id])

  // Medication handlers
  const handleAddMedication = useCallback(async (input: any) => {
    try {
      const res = await fetch('/api/medications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, patient_id: patient?.id }),
      })
      if (res.ok) {
        const { medication } = await res.json()
        setMedications(prev => [medication, ...prev])
        return medication
      }
    } catch (e) {
      console.error('Failed to add medication:', e)
    }
    return null
  }, [patient?.id])

  const handleUpdateMedication = useCallback(async (id: string, updates: any) => {
    try {
      const res = await fetch(`/api/medications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (res.ok) {
        const { medication } = await res.json()
        setMedications(prev => prev.map(m => m.id === id ? medication : m))
        return medication
      }
    } catch (e) {
      console.error('Failed to update medication:', e)
    }
    return null
  }, [])

  const handleDiscontinueMedication = useCallback(async (id: string, reason?: string) => {
    return handleUpdateMedication(id, {
      status: 'discontinued',
      discontinue_reason: reason || undefined,
    })
  }, [handleUpdateMedication])

  const handleDeleteMedication = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/medications/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setMedications(prev => prev.filter(m => m.id !== id))
      }
    } catch (e) {
      console.error('Failed to delete medication:', e)
    }
  }, [])

  // Allergy handlers
  const handleAddAllergy = useCallback(async (input: any) => {
    try {
      const res = await fetch('/api/allergies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, patient_id: patient?.id }),
      })
      if (res.ok) {
        const { allergy } = await res.json()
        setAllergies(prev => [allergy, ...prev])
        return allergy
      }
    } catch (e) {
      console.error('Failed to add allergy:', e)
    }
    return null
  }, [patient?.id])

  const handleUpdateAllergy = useCallback(async (id: string, updates: any) => {
    try {
      const res = await fetch(`/api/allergies/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (res.ok) {
        const { allergy } = await res.json()
        setAllergies(prev => prev.map(a => a.id === id ? allergy : a))
        return allergy
      }
    } catch (e) {
      console.error('Failed to update allergy:', e)
    }
    return null
  }, [])

  const handleRemoveAllergy = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/allergies/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setAllergies(prev => prev.filter(a => a.id !== id))
      }
    } catch (e) {
      console.error('Failed to remove allergy:', e)
    }
  }, [])

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

  // Pend (save note as draft) handler
  const handlePend = useCallback(async () => {
    if (!currentVisit?.id) {
      console.error('No current visit to save')
      return
    }

    try {
      const clinicalNoteId = currentVisit?.clinical_notes?.id

      // Save via API
      const response = await fetch(`/api/visits/${currentVisit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chiefComplaint: noteData.chiefComplaint,
          clinicalNote: {
            id: clinicalNoteId,
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
            rawDictation: rawDictation,
            status: 'draft',
          },
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to save note')
      }

      // Clear autosave since we saved to server
      localStorage.removeItem(autosaveKey)
    } catch (error) {
      console.error('Error saving note:', error)
      throw error
    }
  }, [currentVisit, noteData, rawDictation, autosaveKey])

  // Sign & Complete handler
  const handleSignComplete = useCallback(async () => {
    if (!currentVisit?.id) {
      console.error('No current visit to sign')
      return
    }

    try {
      // First save the note
      await handlePend()

      // Then sign via the sign endpoint
      const response = await fetch(`/api/visits/${currentVisit.id}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!response.ok) {
        throw new Error('Failed to sign note')
      }

      const data = await response.json()

      // Update local state to reflect signed status
      setCurrentVisit((prev: any) => ({
        ...prev,
        status: 'completed',
        clinical_notes: prev?.clinical_notes ? {
          ...prev.clinical_notes,
          status: 'signed',
          ai_summary: data.aiSummary,
        } : null,
      }))

      // Open the follow-up scheduling modal
      setFollowupModalOpen(true)
    } catch (error) {
      console.error('Error signing note:', error)
      throw error
    }
  }, [currentVisit, handlePend])

  // Schedule follow-up appointment handler
  const handleScheduleFollowup = useCallback(async (appointmentData: {
    patientId: string
    appointmentDate: string
    appointmentTime: string
    appointmentType: string
    durationMinutes: number
    hospitalSite: string
    reasonForVisit?: string
    schedulingNotes?: string
  }) => {
    const response = await fetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...appointmentData,
        priorVisitId: currentVisit?.id, // Link to the visit we just completed
      }),
    })

    if (!response.ok) {
      throw new Error('Failed to schedule follow-up')
    }

    // Close modal and go back to appointments
    setFollowupModalOpen(false)
    setAppointmentsRefreshKey(k => k + 1)

    // Show demo hint to guide user to navigate to the next day
    const followUpDate = new Date(appointmentData.appointmentDate + 'T00:00:00')
    const formattedDate = followUpDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    })
    setDemoHint(
      `Follow-up scheduled for ${formattedDate}. Use the ">" arrow next to the date to navigate forward and see how AI summaries from today's visit appear in the Prior Visits sidebar. You can continue this flow indefinitely — each visit builds on the last.`
    )
    handleBackToAppointments()
  }, [currentVisit])

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
        onResetDemo={handleResetDemo}
      />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Icon Sidebar */}
        <IconSidebar
          activeIcon={activeIcon}
          setActiveIcon={setActiveIcon}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />

        {/* Main Content Area - Switch between Appointments and Chart view */}
        {viewMode === 'appointments' ? (
          <PatientAppointments
            onSelectPatient={handleSelectPatient}
            onScheduleNew={() => setScheduleNewPatientOpen(true)}
            demoHint={demoHint}
            onDismissHint={() => setDemoHint(null)}
            refreshKey={appointmentsRefreshKey}
          />
        ) : loadingPatient ? (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: '16px',
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              border: '3px solid var(--border)',
              borderTop: '3px solid var(--primary)',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Loading patient chart...</p>
          </div>
        ) : (
          <>
            <LeftSidebar
              patient={patient}
              priorVisits={priorVisits}
              scoreHistory={scoreHistory}
              patientMessages={patientMessages}
              historianSessions={patientHistorianSessions}
              onImportHistorian={handleImportHistorian}
              isOpen={mobileSidebarOpen}
              onClose={() => setMobileSidebarOpen(false)}
              medications={medications}
              allergies={allergies}
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
              onPend={handlePend}
              onSignComplete={handleSignComplete}
              medications={medications}
              allergies={allergies}
              onAddMedication={handleAddMedication}
              onUpdateMedication={handleUpdateMedication}
              onDiscontinueMedication={handleDiscontinueMedication}
              onDeleteMedication={handleDeleteMedication}
              onAddAllergy={handleAddAllergy}
              onUpdateAllergy={handleUpdateAllergy}
              onRemoveAllergy={handleRemoveAllergy}
              priorVisits={priorVisits}
              scoreHistory={scoreHistory}
            />
          </>
        )}
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
          selectedDiagnoses={selectedDiagnoses}
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

      {/* Reset Demo Confirmation Modal */}
      {resetModalOpen && (
        <>
          <div
            onClick={() => !resetting && setResetModalOpen(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.5)',
              zIndex: 10000,
            }}
          />
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'var(--bg-white)',
            borderRadius: '16px',
            padding: '28px',
            width: '420px',
            maxWidth: '95vw',
            zIndex: 10001,
            boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
            textAlign: 'center',
          }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: '#FEF3C7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2">
                <path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
              </svg>
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Reset Demo?
            </h3>
            <p style={{ margin: '0 0 24px', fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              This will clear all visits, notes, and return appointments to their original &quot;Scheduled&quot; state. The onboarding tour will replay for the next viewer.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => setResetModalOpen(false)}
                disabled={resetting}
                style={{
                  padding: '10px 24px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-white)',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                }}
              >
                Cancel
              </button>
              <button
                onClick={executeResetDemo}
                disabled={resetting}
                style={{
                  padding: '10px 24px',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#F59E0B',
                  color: 'white',
                  cursor: resetting ? 'wait' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                {resetting ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                      <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="32"/>
                    </svg>
                    Resetting...
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
                    </svg>
                    Reset Demo
                  </>
                )}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Schedule Follow-up Modal - opens after signing a note */}
      <ScheduleFollowupModal
        isOpen={followupModalOpen}
        onClose={() => {
          setFollowupModalOpen(false)
          handleBackToAppointments()
        }}
        patient={{
          id: patient?.id || '',
          firstName: patient?.first_name || '',
          lastName: patient?.last_name || '',
        }}
        onSchedule={handleScheduleFollowup}
      />

      {/* Schedule New Patient Modal */}
      <ScheduleNewPatientModal
        isOpen={scheduleNewPatientOpen}
        onClose={() => setScheduleNewPatientOpen(false)}
        onSuccess={() => setAppointmentsRefreshKey(k => k + 1)}
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
