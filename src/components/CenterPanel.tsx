'use client'

import { useState, useEffect, useCallback } from 'react'
import NoteTextField from './NoteTextField'
import SmartScalesSection from './SmartScalesSection'
import ExamScalesSection from './ExamScalesSection'
import ReasonForConsultSection from './ReasonForConsultSection'
import DifferentialDiagnosisSection from './DifferentialDiagnosisSection'
import ImagingResultsTab from './ImagingResultsTab'
import SmartRecommendationsSection from './SmartRecommendationsSection'
import type { Diagnosis } from '@/lib/diagnosisData'

// Default tab configuration
const DEFAULT_TABS = [
  { id: 'history', label: 'History' },
  { id: 'imaging', label: 'Imaging/results' },
  { id: 'exam', label: 'Physical exams' },
  { id: 'recommendation', label: 'Recommendation' },
]

interface CenterPanelProps {
  noteData: any
  updateNote: (field: string, value: any) => void
  currentVisit: any
  patient?: any
  imagingStudies: any[]
  openAiDrawer: (tab: string) => void
  openVoiceDrawer?: (tab: string) => void
  openDotPhrases?: (field: string) => void
  openFeedback?: () => void
  setActiveTextField?: (field: string | null) => void
  rawDictation?: Record<string, Array<{ text: string; timestamp: string }>>
  updateRawDictation?: (field: string, rawText: string) => void
  onGenerateNote?: () => void
  hasAIContent?: boolean
  onRecommendationsSelected?: (items: string[], category?: string) => void
  onScaleComplete?: (scaleId: string, result: any) => void
  onDiagnosesChange?: (diagnoses: Diagnosis[]) => void
  onImagingChange?: (studies: any[]) => void
  onExamFindingsChange?: (findings: Record<string, boolean>, notes: Record<string, string>) => void
}

const ALLERGY_OPTIONS = ['NKDA', 'Reviewed in EMR', 'Unknown', 'Other']
const ROS_OPTIONS = ['Reviewed', 'Unable to obtain due to:', 'Other']
const HISTORY_OPTIONS = ['Yes', 'No, due to patient mentation', 'NA due to phone consult']

export default function CenterPanel({
  noteData,
  updateNote,
  currentVisit,
  patient,
  imagingStudies,
  openAiDrawer,
  openVoiceDrawer,
  openDotPhrases,
  openFeedback,
  setActiveTextField,
  rawDictation,
  updateRawDictation,
  onGenerateNote,
  hasAIContent,
  onRecommendationsSelected,
  onScaleComplete,
  onDiagnosesChange,
  onImagingChange,
  onExamFindingsChange,
}: CenterPanelProps) {
  const [activeTab, setActiveTab] = useState('history')
  const [localActiveField, setLocalActiveField] = useState<string | null>(null)

  // Tab customization state
  const [tabs, setTabs] = useState(DEFAULT_TABS)
  const [isVerticalView, setIsVerticalView] = useState(false)

  // Load saved tab order and view preference from localStorage
  useEffect(() => {
    const loadTabOrder = () => {
      const savedOrder = localStorage.getItem('sevaro-tab-order')
      if (savedOrder) {
        try {
          const order = JSON.parse(savedOrder)
          const reorderedTabs = order
            .map((id: string) => DEFAULT_TABS.find(t => t.id === id))
            .filter(Boolean)
          // Add any missing tabs at the end
          DEFAULT_TABS.forEach(tab => {
            if (!reorderedTabs.find((t: typeof tab) => t.id === tab.id)) {
              reorderedTabs.push(tab)
            }
          })
          setTabs(reorderedTabs)
        } catch (e) {
          console.log('Could not load tab order')
        }
      }
    }

    loadTabOrder()

    const savedVerticalView = localStorage.getItem('sevaro-vertical-view')
    if (savedVerticalView === 'true') {
      setIsVerticalView(true)
    }

    // Listen for storage changes (when settings are saved)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'sevaro-tab-order') {
        loadTabOrder()
      }
    }
    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  // Toggle vertical view
  const toggleVerticalView = useCallback(() => {
    setIsVerticalView(prev => {
      const newValue = !prev
      localStorage.setItem('sevaro-vertical-view', String(newValue))
      return newValue
    })
  }, [])

  // Patient context for AI actions
  const patientContext = {
    patient: patient?.name || 'Unknown Patient',
    chiefComplaint: Array.isArray(noteData.chiefComplaint)
      ? noteData.chiefComplaint.join(', ')
      : noteData.chiefComplaint || '',
  }

  // Toolbar action states
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [copySuccess, setCopySuccess] = useState(false)
  const [pendStatus, setPendStatus] = useState<'idle' | 'pending' | 'saved'>('idle')
  const [showSignModal, setShowSignModal] = useState(false)

  // Physical Exam accordion state
  const [openExamAccordions, setOpenExamAccordions] = useState<Record<string, boolean>>({
    generalAppearance: true,
    mentalStatus: true,
    cranialNerves: true,
    motor: true,
    sensation: true,
    coordination: true,
    gait: false,
  })

  // Free text notes for each exam section
  const [examSectionNotes, setExamSectionNotes] = useState<Record<string, string>>({
    generalAppearance: '',
    mentalStatus: '',
    cranialNerves: '',
    motor: '',
    sensation: '',
    coordination: '',
    gait: '',
  })

  const updateExamSectionNote = (section: string, value: string) => {
    setExamSectionNotes(prev => ({ ...prev, [section]: value }))
  }

  // Exam checkbox state
  const [examFindings, setExamFindings] = useState<Record<string, boolean>>({
    // Mental Status
    locAwake: true,
    locDrowsy: false,
    locObtunded: false,
    locComatose: false,
    orientName: true,
    orientDate: true,
    orientLocation: true,
    orientSituation: true,
    followingCommands: true,
    // Cranial Nerves
    visualFields: true,
    pupilsReactive: true,
    eomsFulll: true,
    facialSensation: true,
    faceSymmetric: true,
    hearingIntact: true,
    palateElevates: true,
    tongueMidline: true,
    // Motor
    normalBulk: true,
    normalTone: true,
    strength5: true,
    noPronatorDrift: true,
    // Sensation
    lightTouch: true,
    pinprick: true,
    vibration: true,
    proprioception: true,
    // Coordination
    fingerToNose: true,
    heelToShin: true,
    rapidAlternating: true,
    // Gait
    gaitEvaluated: true,
    stationNormal: false,
    casualGait: false,
    tandemGait: false,
    rombergNegative: false,
  })

  // Predefined exam templates
  const EXAM_TEMPLATES: Record<string, { name: string; findings: Partial<Record<string, boolean>>; accordions: Partial<Record<string, boolean>> }> = {
    general: {
      name: 'General Neuro',
      findings: {
        locAwake: true, orientName: true, orientDate: true, orientLocation: true, orientSituation: true,
        followingCommands: true, visualFields: true, pupilsReactive: true, eomsFulll: true,
        facialSensation: true, faceSymmetric: true, hearingIntact: true, palateElevates: true, tongueMidline: true,
        normalBulk: true, normalTone: true, strength5: true, noPronatorDrift: true,
        lightTouch: true, pinprick: true, vibration: true, proprioception: true,
        fingerToNose: true, heelToShin: true, rapidAlternating: true,
      },
      accordions: { generalAppearance: true, mentalStatus: true, cranialNerves: true, motor: true, sensation: true, coordination: true, gait: false },
    },
    headache: {
      name: 'Headache Exam',
      findings: {
        locAwake: true, orientName: true, orientDate: true, orientLocation: true, orientSituation: true,
        followingCommands: true, visualFields: true, pupilsReactive: true, eomsFulll: true,
        facialSensation: true, faceSymmetric: true, tongueMidline: true,
        normalTone: true, strength5: true, noPronatorDrift: true,
        fingerToNose: true,
      },
      accordions: { generalAppearance: true, mentalStatus: true, cranialNerves: true, motor: true, sensation: false, coordination: true, gait: false },
    },
    stroke: {
      name: 'Stroke Exam',
      findings: {
        locAwake: true, orientName: true, orientDate: true, orientLocation: true, orientSituation: true,
        followingCommands: true, visualFields: true, pupilsReactive: true, eomsFulll: true,
        facialSensation: true, faceSymmetric: true, hearingIntact: true, palateElevates: true, tongueMidline: true,
        normalBulk: true, normalTone: true, strength5: true, noPronatorDrift: true,
        lightTouch: true, pinprick: true, vibration: true, proprioception: true,
        fingerToNose: true, heelToShin: true, rapidAlternating: true,
        gaitEvaluated: true, stationNormal: true, casualGait: true,
      },
      accordions: { generalAppearance: true, mentalStatus: true, cranialNerves: true, motor: true, sensation: true, coordination: true, gait: true },
    },
    cognitive: {
      name: 'Cognitive Exam',
      findings: {
        locAwake: true, orientName: true, orientDate: true, orientLocation: true, orientSituation: true,
        followingCommands: true, visualFields: true, pupilsReactive: true,
        faceSymmetric: true, normalTone: true, strength5: true,
      },
      accordions: { generalAppearance: true, mentalStatus: true, cranialNerves: true, motor: true, sensation: false, coordination: false, gait: false },
    },
    movement: {
      name: 'Movement Disorder',
      findings: {
        locAwake: true, orientName: true, orientDate: true, orientLocation: true, orientSituation: true,
        followingCommands: true, faceSymmetric: true,
        normalBulk: true, normalTone: true, strength5: true, noPronatorDrift: true,
        fingerToNose: true, heelToShin: true, rapidAlternating: true,
        gaitEvaluated: true, stationNormal: true, casualGait: true,
      },
      accordions: { generalAppearance: true, mentalStatus: true, cranialNerves: false, motor: true, sensation: false, coordination: true, gait: true },
    },
  }

  const [selectedTemplate, setSelectedTemplate] = useState<string>('general')
  const [showTemplateMenu, setShowTemplateMenu] = useState(false)
  const [customTemplates, setCustomTemplates] = useState<Record<string, { name: string; findings: Record<string, boolean>; accordions: Record<string, boolean> }>>({})

  const applyTemplate = (templateId: string) => {
    const template = EXAM_TEMPLATES[templateId] || customTemplates[templateId]
    if (template) {
      setExamFindings(prev => {
        const newFindings = { ...prev }
        // Reset all to false first
        Object.keys(newFindings).forEach(key => newFindings[key] = false)
        // Apply template findings
        Object.entries(template.findings).forEach(([key, value]) => {
          if (key in newFindings) newFindings[key] = value as boolean
        })
        return newFindings
      })
      setOpenExamAccordions(prev => {
        const newAccordions = { ...prev }
        Object.entries(template.accordions).forEach(([key, value]) => {
          if (key in newAccordions) newAccordions[key] = value as boolean
        })
        return newAccordions
      })
      setSelectedTemplate(templateId)
      setShowTemplateMenu(false)
    }
  }

  const saveCurrentAsTemplate = () => {
    const name = prompt('Enter a name for this template:')
    if (name) {
      const templateId = `custom_${Date.now()}`
      setCustomTemplates(prev => ({
        ...prev,
        [templateId]: {
          name,
          findings: { ...examFindings },
          accordions: { ...openExamAccordions },
        },
      }))
    }
  }

  const toggleExamAccordion = (key: string) => {
    setOpenExamAccordions(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const toggleExamFinding = (key: string) => {
    setExamFindings(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const setExamFinding = (key: string, value: boolean) => {
    setExamFindings(prev => ({ ...prev, [key]: value }))
  }

  // Notify parent of exam findings changes for note generation
  useEffect(() => {
    if (onExamFindingsChange) {
      onExamFindingsChange(examFindings, examSectionNotes)
    }
  }, [examFindings, examSectionNotes, onExamFindingsChange])

  const handleSetActiveField = (field: string | null) => {
    setLocalActiveField(field)
    if (setActiveTextField) setActiveTextField(field)
  }

  // Copy note to clipboard
  const handleCopyNote = () => {
    const noteText = `
PATIENT: ${patient?.first_name || ''} ${patient?.last_name || ''}
DATE: ${new Date().toLocaleDateString()}

CHIEF COMPLAINT: ${noteData.chiefComplaint?.join(', ') || 'Not specified'}

HISTORY OF PRESENTING ILLNESS:
${noteData.hpi || 'Not documented'}

REVIEW OF SYSTEMS: ${noteData.ros || 'Not documented'}
${noteData.rosDetails ? `Details: ${noteData.rosDetails}` : ''}

ALLERGIES: ${noteData.allergies || 'Not documented'}
${noteData.allergyDetails ? `Details: ${noteData.allergyDetails}` : ''}

ASSESSMENT:
${noteData.assessment || 'Not documented'}

PLAN:
${noteData.plan || 'Not documented'}
`.trim()

    navigator.clipboard.writeText(noteText).then(() => {
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    })
  }

  // Pend (save as draft)
  const handlePend = () => {
    setPendStatus('pending')
    // Simulate saving
    setTimeout(() => {
      setPendStatus('saved')
      setTimeout(() => setPendStatus('idle'), 2000)
    }, 1000)
  }

  return (
    <main className="center-panel">
      {/* Tab Navigation with Action Bar */}
      <div className="tab-nav-wrapper">
        {/* Tabs */}
        <div className="tab-nav">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => !isVerticalView && setActiveTab(tab.id)}
              className={`tab-btn ${activeTab === tab.id && !isVerticalView ? 'active' : ''}`}
              style={{
                cursor: isVerticalView ? 'default' : 'pointer',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* View Toggle Button */}
        <button
          onClick={toggleVerticalView}
          title={isVerticalView ? 'Switch to tab view' : 'Switch to scroll view'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            background: isVerticalView ? 'var(--primary)' : 'var(--bg-gray)',
            border: `1px solid ${isVerticalView ? 'var(--primary)' : 'var(--border)'}`,
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 500,
            color: isVerticalView ? 'white' : 'var(--text-secondary)',
            cursor: 'pointer',
            transition: 'all 0.2s',
            marginRight: '8px',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {isVerticalView ? (
              // Tab view icon
              <>
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <line x1="3" y1="9" x2="21" y2="9"/>
              </>
            ) : (
              // Scroll view icon
              <>
                <line x1="3" y1="6" x2="21" y2="6"/>
                <line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="3" y1="18" x2="21" y2="18"/>
              </>
            )}
          </svg>
          {isVerticalView ? 'Tab View' : 'Scroll View'}
        </button>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
          {/* More Options */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              style={{
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '6px',
                border: 'none',
                background: showMoreMenu ? 'var(--bg-gray)' : 'transparent',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><circle cx="5" cy="12" r="2"/>
              </svg>
            </button>
            {showMoreMenu && (
              <div style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '4px',
                background: 'var(--bg-white)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                zIndex: 100,
                minWidth: '160px',
                overflow: 'hidden',
              }}>
                <button
                  onClick={() => { handleCopyNote(); setShowMoreMenu(false); }}
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontSize: '13px',
                    textAlign: 'left',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                  </svg>
                  Copy Note
                </button>
                <button
                  onClick={() => { window.print(); setShowMoreMenu(false); }}
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontSize: '13px',
                    textAlign: 'left',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
                  </svg>
                  Print Note
                </button>
                <button
                  onClick={() => { openDotPhrases?.('hpi'); setShowMoreMenu(false); }}
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontSize: '13px',
                    textAlign: 'left',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                  </svg>
                  Dot Phrases
                </button>
              </div>
            )}
          </div>

          {/* Thumbs Up - Feedback */}
          <button
            onClick={() => openFeedback?.()}
            title="Send feedback"
            style={{
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '6px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              transition: 'all 0.2s',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/>
            </svg>
          </button>

          {/* Microphone - opens Voice Drawer */}
          <button
            onClick={() => openVoiceDrawer?.('document')}
            style={{
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '6px',
              border: 'none',
              background: '#FEE2E2',
              cursor: 'pointer',
              color: '#EF4444',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          </button>

          {/* AI Star */}
          <button
            onClick={() => openAiDrawer('ask-ai')}
            style={{
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '6px',
              border: 'none',
              background: '#F59E0B',
              cursor: 'pointer',
              color: 'white',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 1L13.5 9.5L22 12L13.5 14.5L12 23L10.5 14.5L2 12L10.5 9.5L12 1Z"/>
            </svg>
          </button>

          {/* Copy */}
          <button
            onClick={handleCopyNote}
            title={copySuccess ? 'Copied!' : 'Copy note to clipboard'}
            style={{
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '6px',
              border: 'none',
              background: copySuccess ? '#D1FAE5' : 'transparent',
              cursor: 'pointer',
              color: copySuccess ? '#059669' : 'var(--text-secondary)',
              transition: 'all 0.2s',
            }}
          >
            {copySuccess ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
              </svg>
            )}
          </button>

          {/* Divider */}
          <div style={{ width: '1px', height: '24px', background: 'var(--border)', margin: '0 4px' }}/>

          {/* Generate Note Button */}
          <button
            onClick={() => {
              if (onGenerateNote) {
                onGenerateNote()
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '8px',
              border: 'none',
              background: 'linear-gradient(135deg, #8B5CF6 0%, #A78BFA 100%)',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500,
              color: 'white',
              position: 'relative',
            }}
            title="Generate clinical note from entered data"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 1L13.5 9.5L22 12L13.5 14.5L12 23L10.5 14.5L2 12L10.5 9.5L12 1Z"/>
            </svg>
            Generate Note
            {hasAIContent && (
              <span style={{
                position: 'absolute',
                top: '-4px',
                right: '-4px',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: '#22C55E',
                border: '2px solid white',
              }} />
            )}
          </button>

          {/* Pend Button */}
          <button
            onClick={handlePend}
            disabled={pendStatus === 'pending'}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: pendStatus === 'saved' ? '#D1FAE5' : 'var(--bg-white)',
              cursor: pendStatus === 'pending' ? 'wait' : 'pointer',
              fontSize: '13px',
              fontWeight: 500,
              color: pendStatus === 'saved' ? '#059669' : 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s',
            }}
          >
            {pendStatus === 'pending' && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="32"/>
              </svg>
            )}
            {pendStatus === 'saved' && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            )}
            {pendStatus === 'idle' ? 'Pend' : pendStatus === 'pending' ? 'Saving...' : 'Saved'}
          </button>

          {/* Sign & Complete Button */}
          <button
            onClick={() => setShowSignModal(true)}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--primary)',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500,
              color: 'white',
            }}
          >
            Sign & complete
          </button>
        </div>
      </div>

      {/* Sign & Complete Modal */}
      {showSignModal && (
        <>
          <div
            onClick={() => setShowSignModal(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.5)',
              zIndex: 1000,
            }}
          />
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'var(--bg-white)',
            borderRadius: '16px',
            padding: '24px',
            width: '480px',
            maxWidth: '90vw',
            zIndex: 1001,
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>Sign & Complete Note</h3>
              <button
                onClick={() => setShowSignModal(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: 'var(--bg-gray)', borderRadius: '8px', marginBottom: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600 }}>
                  {patient?.first_name?.[0] || 'P'}{patient?.last_name?.[0] || ''}
                </div>
                <div>
                  <div style={{ fontWeight: 500 }}>{patient?.first_name || 'Patient'} {patient?.last_name || ''}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>DOB: {patient?.date_of_birth || 'N/A'}</div>
                </div>
              </div>

              <div style={{ padding: '16px', border: '1px solid var(--border)', borderRadius: '8px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Verification Checklist</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    { label: 'Chief complaint documented', check: !!noteData.chiefComplaint?.length },
                    { label: 'HPI completed (min. 25 words)', check: (noteData.hpi?.split(' ').length || 0) >= 25 },
                    { label: 'Review of systems documented', check: !!noteData.ros },
                    { label: 'Allergies documented', check: !!noteData.allergies },
                    { label: 'Assessment completed', check: !!noteData.assessment },
                  ].map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        background: item.check ? '#D1FAE5' : '#FEE2E2',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        {item.check ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="3">
                            <path d="M18 6L6 18M6 6l12 12"/>
                          </svg>
                        )}
                      </div>
                      <span style={{ fontSize: '13px', color: item.check ? 'var(--text-primary)' : 'var(--text-muted)' }}>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowSignModal(false)}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-white)',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  // In a real app, this would submit to the backend
                  alert('Note signed and completed!')
                  setShowSignModal(false)
                }}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'var(--primary)',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
                Sign & Complete
              </button>
            </div>
          </div>
        </>
      )}

      {/* Tab Content */}
      <div className={`tab-content ${isVerticalView ? 'vertical-view' : ''}`} style={{ position: 'relative' }}>
        {/* History Tab */}
        {(activeTab === 'history' || isVerticalView) && (
          <>
            {isVerticalView && (
              <div className="vertical-section-header" style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '20px',
                paddingBottom: '12px',
                borderBottom: '1px solid var(--border)',
              }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: 'var(--primary)',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 600,
                  fontSize: '14px',
                }}>
                  {tabs.findIndex(t => t.id === 'history') + 1}
                </div>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  History
                </h2>
              </div>
            )}
            {/* Reason for Consult - Two-tier selection */}
            <ReasonForConsultSection
              selectedSubOptions={noteData.chiefComplaint || []}
              onSubOptionsChange={(subOptions) => updateNote('chiefComplaint', subOptions)}
              otherDetails={noteData.consultOtherDetails || ''}
              onOtherDetailsChange={(details) => updateNote('consultOtherDetails', details)}
            />

            {/* History of Presenting Illness */}
            <div style={{ position: 'relative', marginBottom: '16px' }}>
              <span style={{
                position: 'absolute',
                right: '-12px',
                top: '0',
                background: '#EF4444',
                color: 'white',
                fontSize: '11px',
                fontWeight: 500,
                padding: '4px 8px',
                borderRadius: '0 4px 4px 0',
                zIndex: 1,
              }}>Required</span>
              <div style={{
                background: 'var(--bg-white)',
                borderRadius: '12px',
                padding: '20px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}>
                <div style={{ marginBottom: '16px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>History of presenting illness</span>
                  <span style={{ color: '#3B82F6', marginLeft: '8px', fontSize: '13px' }}>(Min. 25 words)*</span>
                </div>
                <NoteTextField
                  value={noteData.hpi}
                  onChange={(value) => updateNote('hpi', value)}
                  fieldName="hpi"
                  placeholder="Describe symptoms and history..."
                  minHeight="120px"
                  showDictate={true}
                  showAiAction={true}
                  onOpenAiDrawer={() => openAiDrawer('ask-ai')}
                  onOpenFullPhrasesDrawer={() => openDotPhrases && openDotPhrases('hpi')}
                  setActiveTextField={handleSetActiveField}
                  rawDictation={rawDictation?.hpi}
                  onRawDictationChange={updateRawDictation ? (rawText) => updateRawDictation('hpi', rawText) : undefined}
                  patientContext={patientContext}
                />
              </div>
            </div>

            {/* Review of System */}
            <div style={{ position: 'relative', marginBottom: '16px' }}>
              <span style={{
                position: 'absolute',
                right: '-12px',
                top: '0',
                background: '#EF4444',
                color: 'white',
                fontSize: '11px',
                fontWeight: 500,
                padding: '4px 8px',
                borderRadius: '0 4px 4px 0',
                zIndex: 1,
              }}>Required</span>
              <div style={{
                background: 'var(--bg-white)',
                borderRadius: '12px',
                padding: '20px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}>
                <div style={{ marginBottom: '16px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Review of system</span>
                  <span style={{ color: '#EF4444', marginLeft: '2px' }}>*</span>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: noteData.ros === 'Unable to obtain due to:' || noteData.ros === 'Other' ? '12px' : '0' }}>
                  {ROS_OPTIONS.map(option => (
                    <button
                      key={option}
                      onClick={() => updateNote('ros', option)}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '20px',
                        fontSize: '13px',
                        cursor: 'pointer',
                        border: '1px solid',
                        borderColor: noteData.ros === option ? 'var(--primary)' : 'var(--border)',
                        background: noteData.ros === option ? 'var(--primary)' : 'var(--bg-white)',
                        color: noteData.ros === option ? 'white' : 'var(--text-secondary)',
                      }}
                    >
                      {option}
                    </button>
                  ))}
                </div>
                {/* Show details field when "Unable to obtain" or "Other" is selected */}
                {(noteData.ros === 'Unable to obtain due to:' || noteData.ros === 'Other') && (
                  <div style={{ position: 'relative' }}>
                    <textarea
                      value={noteData.rosDetails || ''}
                      onChange={(e) => updateNote('rosDetails', e.target.value)}
                      onFocus={() => handleSetActiveField('rosDetails')}
                      placeholder={noteData.ros === 'Unable to obtain due to:' ? 'Specify reason...' : 'Enter ROS details...'}
                      style={{
                        width: '100%',
                        minHeight: '60px',
                        padding: '10px 12px',
                        paddingRight: '90px',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        fontSize: '14px',
                        resize: 'vertical',
                        fontFamily: 'inherit',
                      }}
                    />
                    <div style={{ position: 'absolute', top: '8px', right: '8px', display: 'flex', gap: '4px' }}>
                      <button onClick={() => openVoiceDrawer?.('document')} title="Dictate" style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', border: 'none', background: '#FEE2E2', color: '#EF4444', cursor: 'pointer' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/></svg>
                      </button>
                      <button onClick={() => openDotPhrases?.('rosDetails')} title="Dot Phrases" style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', border: 'none', background: '#EDE9FE', color: '#8B5CF6', cursor: 'pointer' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                      </button>
                      <button onClick={() => openAiDrawer('ask-ai')} title="AI Assist" style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', border: 'none', background: '#FEF3C7', color: '#F59E0B', cursor: 'pointer' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L13.5 9.5L22 12L13.5 14.5L12 23L10.5 14.5L2 12L10.5 9.5L12 1Z"/></svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Allergies */}
            <div style={{ position: 'relative', marginBottom: '16px' }}>
              <span style={{
                position: 'absolute',
                right: '-12px',
                top: '0',
                background: '#EF4444',
                color: 'white',
                fontSize: '11px',
                fontWeight: 500,
                padding: '4px 8px',
                borderRadius: '0 4px 4px 0',
                zIndex: 1,
              }}>Required</span>
              <div style={{
                background: 'var(--bg-white)',
                borderRadius: '12px',
                padding: '20px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}>
                <div style={{ marginBottom: '16px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Allergies</span>
                  <span style={{ color: '#EF4444', marginLeft: '2px' }}>*</span>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: noteData.allergies === 'Other' ? '12px' : '0' }}>
                  {ALLERGY_OPTIONS.map(option => (
                    <button
                      key={option}
                      onClick={() => updateNote('allergies', option)}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '20px',
                        fontSize: '13px',
                        cursor: 'pointer',
                        border: '1px solid',
                        borderColor: noteData.allergies === option ? 'var(--primary)' : 'var(--border)',
                        background: noteData.allergies === option ? 'var(--primary)' : 'var(--bg-white)',
                        color: noteData.allergies === option ? 'white' : 'var(--text-secondary)',
                      }}
                    >
                      {option}
                    </button>
                  ))}
                </div>
                {/* Show details field when "Other" is selected */}
                {noteData.allergies === 'Other' && (
                  <div style={{ position: 'relative' }}>
                    <textarea
                      value={noteData.allergyDetails || ''}
                      onChange={(e) => updateNote('allergyDetails', e.target.value)}
                      onFocus={() => handleSetActiveField('allergyDetails')}
                      placeholder="List allergies and reactions..."
                      style={{
                        width: '100%',
                        minHeight: '60px',
                        padding: '10px 12px',
                        paddingRight: '90px',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        fontSize: '14px',
                        resize: 'vertical',
                        fontFamily: 'inherit',
                      }}
                    />
                    <div style={{ position: 'absolute', top: '8px', right: '8px', display: 'flex', gap: '4px' }}>
                      <button onClick={() => openVoiceDrawer?.('document')} title="Dictate" style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', border: 'none', background: '#FEE2E2', color: '#EF4444', cursor: 'pointer' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/></svg>
                      </button>
                      <button onClick={() => openDotPhrases?.('allergyDetails')} title="Dot Phrases" style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', border: 'none', background: '#EDE9FE', color: '#8B5CF6', cursor: 'pointer' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                      </button>
                      <button onClick={() => openAiDrawer('ask-ai')} title="AI Assist" style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', border: 'none', background: '#FEF3C7', color: '#F59E0B', cursor: 'pointer' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L13.5 9.5L22 12L13.5 14.5L12 23L10.5 14.5L2 12L10.5 9.5L12 1Z"/></svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Medical History Available */}
            <div style={{ position: 'relative', marginBottom: '16px' }}>
              <span style={{
                position: 'absolute',
                right: '-12px',
                top: '0',
                background: '#EF4444',
                color: 'white',
                fontSize: '11px',
                fontWeight: 500,
                padding: '4px 8px',
                borderRadius: '0 4px 4px 0',
                zIndex: 1,
              }}>Required</span>
              <div style={{
                background: 'var(--bg-white)',
                borderRadius: '12px',
                padding: '20px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}>
                <div style={{ marginBottom: '16px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Is medical, surgical, family and social history available?</span>
                  <span style={{ color: '#EF4444', marginLeft: '2px' }}>*</span>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: noteData.historyAvailable === 'Yes' ? '12px' : '0' }}>
                  {HISTORY_OPTIONS.map(option => (
                    <button
                      key={option}
                      onClick={() => updateNote('historyAvailable', option)}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '20px',
                        fontSize: '13px',
                        cursor: 'pointer',
                        border: '1px solid',
                        borderColor: noteData.historyAvailable === option ? 'var(--primary)' : 'var(--border)',
                        background: noteData.historyAvailable === option ? 'var(--primary)' : 'var(--bg-white)',
                        color: noteData.historyAvailable === option ? 'white' : 'var(--text-secondary)',
                      }}
                    >
                      {option}
                    </button>
                  ))}
                </div>
                {/* Show history details field when "Yes" is selected */}
                {noteData.historyAvailable === 'Yes' && (
                  <div style={{ position: 'relative' }}>
                    <textarea
                      value={noteData.historyDetails || ''}
                      onChange={(e) => updateNote('historyDetails', e.target.value)}
                      onFocus={() => handleSetActiveField('historyDetails')}
                      placeholder="Pertinent medical, surgical, family, and social history..."
                      style={{
                        width: '100%',
                        minHeight: '80px',
                        padding: '10px 12px',
                        paddingRight: '90px',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        fontSize: '14px',
                        resize: 'vertical',
                        fontFamily: 'inherit',
                      }}
                    />
                    <div style={{ position: 'absolute', top: '8px', right: '8px', display: 'flex', gap: '4px' }}>
                      <button onClick={() => openVoiceDrawer?.('document')} title="Dictate" style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', border: 'none', background: '#FEE2E2', color: '#EF4444', cursor: 'pointer' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/></svg>
                      </button>
                      <button onClick={() => openDotPhrases?.('historyDetails')} title="Dot Phrases" style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', border: 'none', background: '#EDE9FE', color: '#8B5CF6', cursor: 'pointer' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                      </button>
                      <button onClick={() => openAiDrawer('ask-ai')} title="AI Assist" style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', border: 'none', background: '#FEF3C7', color: '#F59E0B', cursor: 'pointer' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L13.5 9.5L22 12L13.5 14.5L12 23L10.5 14.5L2 12L10.5 9.5L12 1Z"/></svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Smart Clinical Scales Section - shows scales based on selected diagnosis */}
            <SmartScalesSection
              selectedConditions={noteData.chiefComplaint || []}
              patientId={patient?.id}
              visitId={currentVisit?.id}
              onAddToNote={(field, text) => {
                const currentValue = noteData[field] || ''
                updateNote(field, currentValue ? `${currentValue}\n${text}` : text)
              }}
              onScaleComplete={onScaleComplete}
            />
            {isVerticalView && (
              <div style={{ marginTop: '32px', marginBottom: '32px', borderTop: '2px solid var(--border)', paddingTop: '32px' }}>
                <div className="vertical-section-header" style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '20px',
                  paddingBottom: '12px',
                  borderBottom: '1px solid var(--border)',
                }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'var(--primary)',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 600,
                    fontSize: '14px',
                  }}>
                    {tabs.findIndex(t => t.id === 'imaging') + 1}
                  </div>
                  <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Imaging/results
                  </h2>
                </div>
                <ImagingResultsTab
                  noteData={noteData}
                  updateNote={updateNote}
                  openVoiceDrawer={openVoiceDrawer}
                  openAiDrawer={openAiDrawer}
                  openDotPhrases={openDotPhrases}
                  setActiveTextField={handleSetActiveField}
                />
              </div>
            )}
          </>
        )}

        {/* Imaging Tab - only when not in vertical view */}
        {activeTab === 'imaging' && !isVerticalView && (
          <ImagingResultsTab
            noteData={noteData}
            updateNote={updateNote}
            openVoiceDrawer={openVoiceDrawer}
            openAiDrawer={openAiDrawer}
            openDotPhrases={openDotPhrases}
            setActiveTextField={handleSetActiveField}
          />
        )}

        {/* Exam Tab */}
        {(activeTab === 'exam' || isVerticalView) && (
          <>
            {isVerticalView && (
              <div style={{ marginTop: '32px', marginBottom: '20px', borderTop: '2px solid var(--border)', paddingTop: '32px' }}>
                <div className="vertical-section-header" style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '20px',
                  paddingBottom: '12px',
                  borderBottom: '1px solid var(--border)',
                }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'var(--primary)',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 600,
                    fontSize: '14px',
                  }}>
                    {tabs.findIndex(t => t.id === 'exam') + 1}
                  </div>
                  <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Physical exams
                  </h2>
                </div>
              </div>
            )}
          <div>
            {/* Exam Summary - Dictation/AI */}
            <div style={{
              background: 'var(--bg-white)',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Exam Summary</span>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>Dictate or use AI to summarize findings</span>
                </div>
              </div>
              <NoteTextField
                value={noteData.examSummary || ''}
                onChange={(value) => updateNote('examSummary', value)}
                fieldName="examSummary"
                placeholder="Dictate your exam findings here, or click the checkboxes below and use AI to generate a summary..."
                minHeight="100px"
                showDictate={true}
                showAiAction={true}
                onOpenAiDrawer={() => openAiDrawer('ask-ai')}
                onOpenFullPhrasesDrawer={() => openDotPhrases && openDotPhrases('examSummary')}
                setActiveTextField={handleSetActiveField}
                patientContext={patientContext}
              />
            </div>

            {/* Exam Scales Section (NIHSS, Modified Ashworth, etc.) */}
            <ExamScalesSection
              selectedConditions={noteData.chiefComplaint || []}
              patientId={patient?.id}
              visitId={currentVisit?.id}
              onAddToNote={(field, text) => {
                const currentValue = noteData.examSummary || ''
                updateNote('examSummary', currentValue ? `${currentValue}\n${text}` : text)
              }}
              onScaleComplete={onScaleComplete}
            />

            {/* Neurological Examination Section */}
            <div style={{
              background: 'var(--bg-white)',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Neurological Examination</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {/* Template selector */}
                  <div style={{ position: 'relative' }}>
                    <button
                      onClick={() => setShowTemplateMenu(!showTemplateMenu)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 10px',
                        fontSize: '11px',
                        fontWeight: 500,
                        color: '#F59E0B',
                        background: 'transparent',
                        border: '1px solid #F59E0B',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 1L13.5 9.5L22 12L13.5 14.5L12 23L10.5 14.5L2 12L10.5 9.5L12 1Z"/>
                      </svg>
                      {EXAM_TEMPLATES[selectedTemplate]?.name || customTemplates[selectedTemplate]?.name || 'Template'}
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </button>
                    {showTemplateMenu && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        marginTop: '4px',
                        background: 'var(--bg-white)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                        zIndex: 100,
                        minWidth: '180px',
                        overflow: 'hidden',
                      }}>
                        <div style={{ padding: '8px 12px', fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>
                          Exam Templates
                        </div>
                        {Object.entries(EXAM_TEMPLATES).map(([id, template]) => (
                          <button
                            key={id}
                            onClick={() => applyTemplate(id)}
                            style={{
                              width: '100%',
                              padding: '10px 12px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              border: 'none',
                              background: selectedTemplate === id ? 'var(--bg-dark)' : 'transparent',
                              cursor: 'pointer',
                              fontSize: '12px',
                              color: 'var(--text-primary)',
                              textAlign: 'left',
                            }}
                          >
                            {selectedTemplate === id && (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2">
                                <polyline points="20 6 9 17 4 12"/>
                              </svg>
                            )}
                            <span style={{ marginLeft: selectedTemplate === id ? 0 : '20px' }}>{template.name}</span>
                          </button>
                        ))}
                        {Object.keys(customTemplates).length > 0 && (
                          <>
                            <div style={{ padding: '8px 12px', fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
                              Custom
                            </div>
                            {Object.entries(customTemplates).map(([id, template]) => (
                              <button
                                key={id}
                                onClick={() => applyTemplate(id)}
                                style={{
                                  width: '100%',
                                  padding: '10px 12px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  border: 'none',
                                  background: selectedTemplate === id ? 'var(--bg-dark)' : 'transparent',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  color: 'var(--text-primary)',
                                  textAlign: 'left',
                                }}
                              >
                                {selectedTemplate === id && (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2">
                                    <polyline points="20 6 9 17 4 12"/>
                                  </svg>
                                )}
                                <span style={{ marginLeft: selectedTemplate === id ? 0 : '20px' }}>{template.name}</span>
                              </button>
                            ))}
                          </>
                        )}
                        <div style={{ borderTop: '1px solid var(--border)' }}>
                          <button
                            onClick={() => { saveCurrentAsTemplate(); setShowTemplateMenu(false); }}
                            style={{
                              width: '100%',
                              padding: '10px 12px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              border: 'none',
                              background: 'transparent',
                              cursor: 'pointer',
                              fontSize: '12px',
                              color: 'var(--primary)',
                              textAlign: 'left',
                            }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M12 5v14M5 12h14"/>
                            </svg>
                            Save Current as Template
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* General Appearance Accordion */}
              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  marginBottom: '8px',
                  overflow: 'hidden',
                }}
              >
                <div
                  onClick={() => toggleExamAccordion('generalAppearance')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    background: openExamAccordions.generalAppearance ? 'var(--bg-dark)' : 'transparent',
                    cursor: 'pointer',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: 'var(--primary)',
                    }} />
                    <span style={{ fontSize: '14px', fontWeight: 500 }}>General Appearance</span>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    style={{ transform: openExamAccordions.generalAppearance ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </div>
                {openExamAccordions.generalAppearance && (
                  <div onClick={(e) => e.stopPropagation()} style={{ padding: '16px', borderTop: '1px solid var(--border)' }}>
                    <select style={{ width: '100%', padding: '10px', border: '1px solid var(--border)', borderRadius: '6px', marginBottom: '12px' }}>
                      <option>In no apparent distress</option>
                      <option>Appears uncomfortable</option>
                      <option>Appears ill</option>
                      <option>Appears anxious</option>
                    </select>
                    {/* Free text notes */}
                    <div style={{ position: 'relative' }}>
                      <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Additional notes</label>
                      <textarea
                        value={examSectionNotes.generalAppearance}
                        onChange={(e) => updateExamSectionNote('generalAppearance', e.target.value)}
                        placeholder="Add observations..."
                        style={{
                          width: '100%',
                          minHeight: '60px',
                          padding: '10px 12px',
                          paddingRight: '90px',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          fontSize: '13px',
                          resize: 'vertical',
                          fontFamily: 'inherit',
                        }}
                      />
                      <div style={{ position: 'absolute', bottom: '8px', right: '8px', display: 'flex', gap: '4px' }}>
                        <button onClick={() => openVoiceDrawer?.('document')} title="Dictate" style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', border: 'none', background: '#FEE2E2', color: '#EF4444', cursor: 'pointer' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/></svg>
                        </button>
                        <button onClick={() => openAiDrawer('ask-ai')} title="AI Assist" style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', border: 'none', background: '#FEF3C7', color: '#F59E0B', cursor: 'pointer' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L13.5 9.5L22 12L13.5 14.5L12 23L10.5 14.5L2 12L10.5 9.5L12 1Z"/></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Mental Status Accordion */}
              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  marginBottom: '8px',
                  overflow: 'hidden',
                }}
              >
                <div
                  onClick={() => toggleExamAccordion('mentalStatus')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    background: openExamAccordions.mentalStatus ? 'var(--bg-dark)' : 'transparent',
                    cursor: 'pointer',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: 'var(--primary)',
                    }} />
                    <span style={{ fontSize: '14px', fontWeight: 500 }}>Mental Status</span>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    style={{ transform: openExamAccordions.mentalStatus ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </div>
                {openExamAccordions.mentalStatus && (
                  <div onClick={(e) => e.stopPropagation()} style={{ padding: '16px', borderTop: '1px solid var(--border)' }}>
                    <div style={{ marginBottom: '16px' }}>
                      <h5 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>Level of Consciousness</h5>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                        {[
                          { key: 'locAwake', label: 'Awake, Alert' },
                          { key: 'locDrowsy', label: 'Drowsy' },
                          { key: 'locObtunded', label: 'Obtunded' },
                          { key: 'locComatose', label: 'Comatose' },
                        ].map(item => (
                          <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                            <input
                              type="radio"
                              name="loc"
                              checked={examFindings[item.key]}
                              onChange={() => {
                                setExamFinding('locAwake', item.key === 'locAwake')
                                setExamFinding('locDrowsy', item.key === 'locDrowsy')
                                setExamFinding('locObtunded', item.key === 'locObtunded')
                                setExamFinding('locComatose', item.key === 'locComatose')
                              }}
                              style={{ accentColor: 'var(--primary)' }}
                            />
                            <span style={{ fontSize: '13px' }}>{item.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div style={{ marginBottom: '16px' }}>
                      <h5 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>Orientation</h5>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                        {[
                          { key: 'orientName', label: 'Name' },
                          { key: 'orientDate', label: 'Date' },
                          { key: 'orientLocation', label: 'Location' },
                          { key: 'orientSituation', label: 'Situation' },
                        ].map(item => (
                          <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={examFindings[item.key]}
                              onChange={() => toggleExamFinding(item.key)}
                              style={{ accentColor: 'var(--primary)' }}
                            />
                            <span style={{ fontSize: '13px' }}>{item.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '16px' }}>
                      <input
                        type="checkbox"
                        checked={examFindings.followingCommands}
                        onChange={() => toggleExamFinding('followingCommands')}
                        style={{ accentColor: 'var(--primary)' }}
                      />
                      <span style={{ fontSize: '13px' }}>Following commands</span>
                    </label>
                    {/* Free text notes */}
                    <div style={{ position: 'relative' }}>
                      <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Additional notes</label>
                      <textarea
                        value={examSectionNotes.mentalStatus}
                        onChange={(e) => updateExamSectionNote('mentalStatus', e.target.value)}
                        placeholder="Add observations..."
                        style={{
                          width: '100%',
                          minHeight: '60px',
                          padding: '10px 12px',
                          paddingRight: '90px',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          fontSize: '13px',
                          resize: 'vertical',
                          fontFamily: 'inherit',
                        }}
                      />
                      <div style={{ position: 'absolute', bottom: '8px', right: '8px', display: 'flex', gap: '4px' }}>
                        <button onClick={() => openVoiceDrawer?.('document')} title="Dictate" style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', border: 'none', background: '#FEE2E2', color: '#EF4444', cursor: 'pointer' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/></svg>
                        </button>
                        <button onClick={() => openAiDrawer('ask-ai')} title="AI Assist" style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', border: 'none', background: '#FEF3C7', color: '#F59E0B', cursor: 'pointer' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L13.5 9.5L22 12L13.5 14.5L12 23L10.5 14.5L2 12L10.5 9.5L12 1Z"/></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Cranial Nerves Accordion */}
              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  marginBottom: '8px',
                  overflow: 'hidden',
                }}
              >
                <div
                  onClick={() => toggleExamAccordion('cranialNerves')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    background: openExamAccordions.cranialNerves ? 'var(--bg-dark)' : 'transparent',
                    cursor: 'pointer',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: 'var(--primary)',
                    }} />
                    <span style={{ fontSize: '14px', fontWeight: 500 }}>Cranial Nerves</span>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    style={{ transform: openExamAccordions.cranialNerves ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </div>
                {openExamAccordions.cranialNerves && (
                  <div onClick={(e) => e.stopPropagation()} style={{ padding: '16px', borderTop: '1px solid var(--border)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '16px' }}>
                      {[
                        { key: 'visualFields', label: 'Visual fields full to confrontation' },
                        { key: 'pupilsReactive', label: 'Pupils equal and reactive' },
                        { key: 'eomsFulll', label: 'EOMs full, no nystagmus' },
                        { key: 'facialSensation', label: 'Facial sensation intact' },
                        { key: 'faceSymmetric', label: 'Face symmetric' },
                        { key: 'hearingIntact', label: 'Hearing grossly intact' },
                        { key: 'palateElevates', label: 'Palate elevates symmetrically' },
                        { key: 'tongueMidline', label: 'Tongue midline' },
                      ].map(item => (
                        <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={examFindings[item.key]}
                            onChange={() => toggleExamFinding(item.key)}
                            style={{ accentColor: 'var(--primary)' }}
                          />
                          <span style={{ fontSize: '13px' }}>{item.label}</span>
                        </label>
                      ))}
                    </div>
                    {/* Free text notes */}
                    <div style={{ position: 'relative' }}>
                      <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Additional notes</label>
                      <textarea
                        value={examSectionNotes.cranialNerves}
                        onChange={(e) => updateExamSectionNote('cranialNerves', e.target.value)}
                        placeholder="Add observations..."
                        style={{
                          width: '100%',
                          minHeight: '60px',
                          padding: '10px 12px',
                          paddingRight: '90px',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          fontSize: '13px',
                          resize: 'vertical',
                          fontFamily: 'inherit',
                        }}
                      />
                      <div style={{ position: 'absolute', bottom: '8px', right: '8px', display: 'flex', gap: '4px' }}>
                        <button onClick={() => openVoiceDrawer?.('document')} title="Dictate" style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', border: 'none', background: '#FEE2E2', color: '#EF4444', cursor: 'pointer' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/></svg>
                        </button>
                        <button onClick={() => openAiDrawer('ask-ai')} title="AI Assist" style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', border: 'none', background: '#FEF3C7', color: '#F59E0B', cursor: 'pointer' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L13.5 9.5L22 12L13.5 14.5L12 23L10.5 14.5L2 12L10.5 9.5L12 1Z"/></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Motor Accordion */}
              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  marginBottom: '8px',
                  overflow: 'hidden',
                }}
              >
                <div
                  onClick={() => toggleExamAccordion('motor')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    background: openExamAccordions.motor ? 'var(--bg-dark)' : 'transparent',
                    cursor: 'pointer',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: 'var(--primary)',
                    }} />
                    <span style={{ fontSize: '14px', fontWeight: 500 }}>Motor</span>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    style={{ transform: openExamAccordions.motor ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </div>
                {openExamAccordions.motor && (
                  <div onClick={(e) => e.stopPropagation()} style={{ padding: '16px', borderTop: '1px solid var(--border)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '16px' }}>
                      {[
                        { key: 'normalBulk', label: 'Normal bulk' },
                        { key: 'normalTone', label: 'Normal tone' },
                        { key: 'strength5', label: 'Strength 5/5 all extremities' },
                        { key: 'noPronatorDrift', label: 'No pronator drift' },
                      ].map(item => (
                        <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={examFindings[item.key]}
                            onChange={() => toggleExamFinding(item.key)}
                            style={{ accentColor: 'var(--primary)' }}
                          />
                          <span style={{ fontSize: '13px' }}>{item.label}</span>
                        </label>
                      ))}
                    </div>
                    {/* Free text notes */}
                    <div style={{ position: 'relative' }}>
                      <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Additional notes</label>
                      <textarea
                        value={examSectionNotes.motor}
                        onChange={(e) => updateExamSectionNote('motor', e.target.value)}
                        placeholder="Add observations (e.g., specific weakness patterns, tone abnormalities)..."
                        style={{
                          width: '100%',
                          minHeight: '60px',
                          padding: '10px 12px',
                          paddingRight: '90px',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          fontSize: '13px',
                          resize: 'vertical',
                          fontFamily: 'inherit',
                        }}
                      />
                      <div style={{ position: 'absolute', bottom: '8px', right: '8px', display: 'flex', gap: '4px' }}>
                        <button onClick={() => openVoiceDrawer?.('document')} title="Dictate" style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', border: 'none', background: '#FEE2E2', color: '#EF4444', cursor: 'pointer' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/></svg>
                        </button>
                        <button onClick={() => openAiDrawer('ask-ai')} title="AI Assist" style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', border: 'none', background: '#FEF3C7', color: '#F59E0B', cursor: 'pointer' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L13.5 9.5L22 12L13.5 14.5L12 23L10.5 14.5L2 12L10.5 9.5L12 1Z"/></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Sensation Accordion */}
              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  marginBottom: '8px',
                  overflow: 'hidden',
                }}
              >
                <div
                  onClick={() => toggleExamAccordion('sensation')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    background: openExamAccordions.sensation ? 'var(--bg-dark)' : 'transparent',
                    cursor: 'pointer',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: 'var(--primary)',
                    }} />
                    <span style={{ fontSize: '14px', fontWeight: 500 }}>Sensation</span>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    style={{ transform: openExamAccordions.sensation ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </div>
                {openExamAccordions.sensation && (
                  <div onClick={(e) => e.stopPropagation()} style={{ padding: '16px', borderTop: '1px solid var(--border)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '16px' }}>
                      {[
                        { key: 'lightTouch', label: 'Light touch intact' },
                        { key: 'pinprick', label: 'Pinprick intact' },
                        { key: 'vibration', label: 'Vibration intact' },
                        { key: 'proprioception', label: 'Proprioception intact' },
                      ].map(item => (
                        <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={examFindings[item.key]}
                            onChange={() => toggleExamFinding(item.key)}
                            style={{ accentColor: 'var(--primary)' }}
                          />
                          <span style={{ fontSize: '13px' }}>{item.label}</span>
                        </label>
                      ))}
                    </div>
                    {/* Free text notes */}
                    <div style={{ position: 'relative' }}>
                      <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Additional notes</label>
                      <textarea
                        value={examSectionNotes.sensation}
                        onChange={(e) => updateExamSectionNote('sensation', e.target.value)}
                        placeholder="Add observations (e.g., sensory level, distribution of deficits)..."
                        style={{
                          width: '100%',
                          minHeight: '60px',
                          padding: '10px 12px',
                          paddingRight: '90px',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          fontSize: '13px',
                          resize: 'vertical',
                          fontFamily: 'inherit',
                        }}
                      />
                      <div style={{ position: 'absolute', bottom: '8px', right: '8px', display: 'flex', gap: '4px' }}>
                        <button onClick={() => openVoiceDrawer?.('document')} title="Dictate" style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', border: 'none', background: '#FEE2E2', color: '#EF4444', cursor: 'pointer' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/></svg>
                        </button>
                        <button onClick={() => openAiDrawer('ask-ai')} title="AI Assist" style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', border: 'none', background: '#FEF3C7', color: '#F59E0B', cursor: 'pointer' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L13.5 9.5L22 12L13.5 14.5L12 23L10.5 14.5L2 12L10.5 9.5L12 1Z"/></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Coordination Accordion */}
              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  marginBottom: '8px',
                  overflow: 'hidden',
                }}
              >
                <div
                  onClick={() => toggleExamAccordion('coordination')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    background: openExamAccordions.coordination ? 'var(--bg-dark)' : 'transparent',
                    cursor: 'pointer',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: 'var(--primary)',
                    }} />
                    <span style={{ fontSize: '14px', fontWeight: 500 }}>Coordination</span>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    style={{ transform: openExamAccordions.coordination ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </div>
                {openExamAccordions.coordination && (
                  <div onClick={(e) => e.stopPropagation()} style={{ padding: '16px', borderTop: '1px solid var(--border)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '16px' }}>
                      {[
                        { key: 'fingerToNose', label: 'Finger-to-nose intact' },
                        { key: 'heelToShin', label: 'Heel-to-shin intact' },
                        { key: 'rapidAlternating', label: 'Rapid alternating movements intact' },
                      ].map(item => (
                        <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={examFindings[item.key]}
                            onChange={() => toggleExamFinding(item.key)}
                            style={{ accentColor: 'var(--primary)' }}
                          />
                          <span style={{ fontSize: '13px' }}>{item.label}</span>
                        </label>
                      ))}
                    </div>
                    {/* Free text notes */}
                    <div style={{ position: 'relative' }}>
                      <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Additional notes</label>
                      <textarea
                        value={examSectionNotes.coordination}
                        onChange={(e) => updateExamSectionNote('coordination', e.target.value)}
                        placeholder="Add observations (e.g., dysmetria, intention tremor)..."
                        style={{
                          width: '100%',
                          minHeight: '60px',
                          padding: '10px 12px',
                          paddingRight: '90px',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          fontSize: '13px',
                          resize: 'vertical',
                          fontFamily: 'inherit',
                        }}
                      />
                      <div style={{ position: 'absolute', bottom: '8px', right: '8px', display: 'flex', gap: '4px' }}>
                        <button onClick={() => openVoiceDrawer?.('document')} title="Dictate" style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', border: 'none', background: '#FEE2E2', color: '#EF4444', cursor: 'pointer' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/></svg>
                        </button>
                        <button onClick={() => openAiDrawer('ask-ai')} title="AI Assist" style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', border: 'none', background: '#FEF3C7', color: '#F59E0B', cursor: 'pointer' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L13.5 9.5L22 12L13.5 14.5L12 23L10.5 14.5L2 12L10.5 9.5L12 1Z"/></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Gait Accordion */}
              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  overflow: 'hidden',
                }}
              >
                <div
                  onClick={() => toggleExamAccordion('gait')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    background: openExamAccordions.gait ? 'var(--bg-dark)' : 'transparent',
                    cursor: 'pointer',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      border: '1px solid var(--border)',
                      background: 'transparent',
                    }} />
                    <span style={{ fontSize: '14px', fontWeight: 500 }}>Gait</span>
                    <span title="May be limited in telemedicine; MA assistance recommended" style={{ color: '#D97706', cursor: 'help' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                    </span>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    style={{ transform: openExamAccordions.gait ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </div>
                {openExamAccordions.gait && (
                  <div onClick={(e) => e.stopPropagation()} style={{ padding: '16px', borderTop: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="gait"
                          checked={examFindings.gaitEvaluated}
                          onChange={() => setExamFinding('gaitEvaluated', true)}
                          style={{ accentColor: 'var(--primary)' }}
                        />
                        <span style={{ fontSize: '13px' }}>Evaluated (MA assisted)</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="gait"
                          checked={!examFindings.gaitEvaluated}
                          onChange={() => setExamFinding('gaitEvaluated', false)}
                          style={{ accentColor: 'var(--primary)' }}
                        />
                        <span style={{ fontSize: '13px' }}>Not evaluated</span>
                      </label>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '16px' }}>
                      {[
                        { key: 'stationNormal', label: 'Station normal' },
                        { key: 'casualGait', label: 'Casual gait normal' },
                        { key: 'tandemGait', label: 'Tandem gait normal' },
                        { key: 'rombergNegative', label: 'Romberg negative' },
                      ].map(item => (
                        <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={examFindings[item.key]}
                            onChange={() => toggleExamFinding(item.key)}
                            style={{ accentColor: 'var(--primary)' }}
                          />
                          <span style={{ fontSize: '13px' }}>{item.label}</span>
                        </label>
                      ))}
                    </div>
                    {/* Free text notes */}
                    <div style={{ position: 'relative' }}>
                      <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Additional notes</label>
                      <textarea
                        value={examSectionNotes.gait}
                        onChange={(e) => updateExamSectionNote('gait', e.target.value)}
                        placeholder="Add observations (e.g., gait abnormalities observed via video, patient-reported balance issues)..."
                        style={{
                          width: '100%',
                          minHeight: '60px',
                          padding: '10px 12px',
                          paddingRight: '90px',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          fontSize: '13px',
                          resize: 'vertical',
                          fontFamily: 'inherit',
                        }}
                      />
                      <div style={{ position: 'absolute', bottom: '8px', right: '8px', display: 'flex', gap: '4px' }}>
                        <button onClick={() => openVoiceDrawer?.('document')} title="Dictate" style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', border: 'none', background: '#FEE2E2', color: '#EF4444', cursor: 'pointer' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/></svg>
                        </button>
                        <button onClick={() => openAiDrawer('ask-ai')} title="AI Assist" style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', border: 'none', background: '#FEF3C7', color: '#F59E0B', cursor: 'pointer' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L13.5 9.5L22 12L13.5 14.5L12 23L10.5 14.5L2 12L10.5 9.5L12 1Z"/></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Vital signs */}
            <div style={{
              background: 'var(--bg-white)',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}>
              <div style={{ marginBottom: '16px' }}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Vital signs</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Glucose (mg/dL) (Optional)</label>
                  <input type="text" style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    fontSize: '14px',
                    outline: 'none',
                  }}/>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>BP (mm/Hg) (Optional)</label>
                  <input type="text" style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    fontSize: '14px',
                    outline: 'none',
                  }}/>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Oxygen saturation (%) (Optional)</label>
                  <input type="text" style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    fontSize: '14px',
                    outline: 'none',
                  }}/>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Pulse (bpm) (Optional)</label>
                  <input type="text" style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    fontSize: '14px',
                    outline: 'none',
                  }}/>
                </div>
              </div>
              <div style={{ marginTop: '16px' }}>
                <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Fever symptoms</span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>(Optional)</span>
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  {['Febrile', 'Afebrile'].map(option => (
                    <button
                      key={option}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '20px',
                        fontSize: '13px',
                        cursor: 'pointer',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-white)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          </>
        )}

        {/* Recommendation Tab */}
        {(activeTab === 'recommendation' || isVerticalView) && (
          <>
            {isVerticalView && (
              <div style={{ marginTop: '32px', marginBottom: '20px', borderTop: '2px solid var(--border)', paddingTop: '32px' }}>
                <div className="vertical-section-header" style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '20px',
                  paddingBottom: '12px',
                  borderBottom: '1px solid var(--border)',
                }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'var(--primary)',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 600,
                    fontSize: '14px',
                  }}>
                    {tabs.findIndex(t => t.id === 'recommendation') + 1}
                  </div>
                  <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Recommendation
                  </h2>
                </div>
              </div>
            )}
            {/* Differential Diagnosis - Auto-populated from Reason for Consult */}
            <DifferentialDiagnosisSection
              chiefComplaints={noteData.chiefComplaint || []}
              selectedDiagnoses={noteData.differentialDiagnoses || []}
              onDiagnosesChange={(diagnoses: Diagnosis[]) => {
                updateNote('differentialDiagnoses', diagnoses)
                // Also notify parent for note generation
                if (onDiagnosesChange) {
                  onDiagnosesChange(diagnoses.map(d => ({
                    id: d.id,
                    name: d.name,
                    icd10: d.icd10,
                    category: d.category,
                  })))
                }
              }}
            />

            {/* Generate Assessment Button */}
            <button
              onClick={() => openAiDrawer('ask-ai')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 20px',
                background: '#F59E0B',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 500,
                cursor: 'pointer',
                marginBottom: '16px',
                fontSize: '14px',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 1L13.5 9.5L22 12L13.5 14.5L12 23L10.5 14.5L2 12L10.5 9.5L12 1Z"/>
              </svg>
              Generate assessment
            </button>

            {/* Assessment */}
            <div style={{ position: 'relative', marginBottom: '16px' }}>
              <span style={{
                position: 'absolute',
                right: '-12px',
                top: '0',
                background: '#EF4444',
                color: 'white',
                fontSize: '11px',
                fontWeight: 500,
                padding: '4px 8px',
                borderRadius: '0 4px 4px 0',
                zIndex: 1,
              }}>Required</span>
              <div style={{
                background: 'var(--bg-white)',
                borderRadius: '12px',
                padding: '20px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}>
                <div style={{ marginBottom: '16px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Assessment</span>
                  <span style={{ color: '#3B82F6', marginLeft: '8px', fontSize: '13px' }}>(Min. 5 words)*</span>
                </div>
                <NoteTextField
                  value={noteData.assessment}
                  onChange={(value) => updateNote('assessment', value)}
                  fieldName="assessment"
                  placeholder="Enter a detailed assessment..."
                  minHeight="120px"
                  showDictate={true}
                  showAiAction={true}
                  onOpenAiDrawer={() => openAiDrawer('ask-ai')}
                  onOpenFullPhrasesDrawer={() => openDotPhrases && openDotPhrases('assessment')}
                  setActiveTextField={handleSetActiveField}
                  rawDictation={rawDictation?.assessment}
                  onRawDictationChange={updateRawDictation ? (rawText) => updateRawDictation('assessment', rawText) : undefined}
                  patientContext={patientContext}
                />
              </div>
            </div>

            {/* Smart Recommendations - Evidence-Based Plans */}
            <SmartRecommendationsSection
              onAddToPlan={(items) => {
                const currentPlan = noteData.plan || ''
                const newItems = items.join('\n')
                updateNote('plan', currentPlan ? `${currentPlan}\n${newItems}` : newItems)
                // Track for note preview
                onRecommendationsSelected?.(items)
              }}
            />

            {/* Recommendations / Plan */}
            <div style={{ position: 'relative', marginBottom: '16px' }}>
              <span style={{
                position: 'absolute',
                right: '-12px',
                top: '0',
                background: '#EF4444',
                color: 'white',
                fontSize: '11px',
                fontWeight: 500,
                padding: '4px 8px',
                borderRadius: '0 4px 4px 0',
                zIndex: 1,
              }}>Required</span>
              <div style={{
                background: 'var(--bg-white)',
                borderRadius: '12px',
                padding: '20px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}>
                <div style={{ marginBottom: '16px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Plan</span>
                  <span style={{ color: '#EF4444', marginLeft: '2px' }}>*</span>
                  {noteData.plan && (
                    <span style={{
                      marginLeft: '12px',
                      fontSize: '12px',
                      color: 'var(--text-muted)',
                      background: 'var(--bg-gray)',
                      padding: '2px 8px',
                      borderRadius: '4px'
                    }}>
                      {noteData.plan.split('\n').filter((l: string) => l.trim()).length} items
                    </span>
                  )}
                </div>
                <NoteTextField
                  value={noteData.plan}
                  onChange={(value) => updateNote('plan', value)}
                  fieldName="plan"
                  placeholder="Add recommendations from Smart Recommendations above, or enter free-text plan..."
                  minHeight="150px"
                  showDictate={true}
                  showAiAction={true}
                  onOpenAiDrawer={() => openAiDrawer('ask-ai')}
                  onOpenFullPhrasesDrawer={() => openDotPhrases && openDotPhrases('plan')}
                  setActiveTextField={handleSetActiveField}
                  rawDictation={rawDictation?.plan}
                  onRawDictationChange={updateRawDictation ? (rawText) => updateRawDictation('plan', rawText) : undefined}
                  patientContext={patientContext}
                />
              </div>
            </div>

            {/* Final Recommendation Time */}
            <div style={{
              background: 'var(--bg-white)',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Final recommendation time</span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>(Optional)</span>
              </div>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 200px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Select date</label>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>01/16/2026</span>
                  </div>
                </div>
                <div style={{ flex: '1 1 200px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Military Time (PST)</label>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                  }}>
                    <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>HH : MM</span>
                    <button style={{
                      marginLeft: 'auto',
                      padding: '4px 12px',
                      borderRadius: '16px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-white)',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}>Now</button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Slide-out panel indicator */}
      <div style={{
        position: 'absolute',
        right: 0,
        top: '50%',
        transform: 'translateY(-50%)',
        width: '12px',
        height: '48px',
        background: 'var(--bg-dark)',
        borderRadius: '8px 0 0 8px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <svg width="8" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </div>
    </main>
  )
}
