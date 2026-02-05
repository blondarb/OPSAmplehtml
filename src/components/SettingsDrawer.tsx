'use client'

import { useState, useEffect, useCallback } from 'react'
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder'

// Default presets for AI instructions
const DEFAULT_PRESETS = {
  newConsult: `Write comprehensive new consultation notes that include:
- Complete history including onset, progression, and context
- All pertinent positives and negatives
- Thorough review of systems
- Detailed neurological examination findings
- Clear assessment with differential diagnosis
- Evidence-based treatment recommendations`,

  followUp: `Write focused follow-up notes that emphasize:
- Interval changes since last visit
- Response to current treatments
- Any new symptoms or concerns
- Updated examination findings (changes from baseline)
- Adjustments to treatment plan
- Next steps and follow-up timeline`,

  hpi: `Write the HPI as a narrative paragraph. Include onset, location, duration, character, aggravating/alleviating factors, radiation, timing, and severity (OLDCARTS). Include pertinent negatives.`,

  ros: `Document review of systems efficiently. List positive findings first, then summarize negative systems. Use standard abbreviations when appropriate.`,

  assessment: `Write a clear assessment that synthesizes the clinical picture. Link diagnoses to supporting evidence. Include ICD-10 codes when available.`,

  plan: `Organize the plan by diagnosis/problem. Include specific medications with dosages, follow-up timeline, and patient education points.`,

  physicalExam: `Document examination findings clearly. Note normal findings briefly and abnormal findings in detail. Include relevant scale scores.`,
}

interface NoteLayoutPreferences {
  includeHistorySummary: boolean
  includeAllergiesAtTop: boolean
  includeProblemList: boolean
  groupMedicationsWithAssessment: boolean
}

interface UserSettings {
  // Practice Info
  practiceName: string
  // AI Instructions - Note Type Specific
  newConsultInstructions: string
  followUpInstructions: string
  // Section-specific instructions (apply to both note types)
  sectionAiInstructions: {
    hpi: string
    ros: string
    assessment: string
    plan: string
    physicalExam: string
  }
  // Note Layout Preferences
  noteLayout: NoteLayoutPreferences
  // Appearance
  fontSize: 'small' | 'medium' | 'large'
  darkModePreference: 'light' | 'dark' | 'system'
  // Tab Order
  tabOrder: string[]
  // Documentation Style
  documentationStyle: 'concise' | 'detailed' | 'narrative'
  preferredTerminology: 'formal' | 'standard' | 'simplified'
  // Notifications
  soundEnabled: boolean
  notificationsEnabled: boolean
  // Legacy field for backward compatibility
  globalAiInstructions?: string
}

// Default tab configuration
const DEFAULT_TAB_ORDER = ['history', 'imaging', 'exam', 'recommendation']
const TAB_LABELS: Record<string, string> = {
  history: 'History',
  imaging: 'Imaging/results',
  exam: 'Physical exams',
  recommendation: 'Recommendation',
}

const DEFAULT_SETTINGS: UserSettings = {
  practiceName: '',
  newConsultInstructions: DEFAULT_PRESETS.newConsult,
  followUpInstructions: DEFAULT_PRESETS.followUp,
  sectionAiInstructions: {
    hpi: DEFAULT_PRESETS.hpi,
    ros: DEFAULT_PRESETS.ros,
    assessment: DEFAULT_PRESETS.assessment,
    plan: DEFAULT_PRESETS.plan,
    physicalExam: DEFAULT_PRESETS.physicalExam,
  },
  noteLayout: {
    includeHistorySummary: true,
    includeAllergiesAtTop: false,
    includeProblemList: false,
    groupMedicationsWithAssessment: false,
  },
  fontSize: 'medium',
  darkModePreference: 'system',
  tabOrder: DEFAULT_TAB_ORDER,
  documentationStyle: 'detailed',
  preferredTerminology: 'standard',
  soundEnabled: true,
  notificationsEnabled: true,
}

interface SettingsDrawerProps {
  isOpen: boolean
  onClose: () => void
  darkMode: boolean
  setDarkMode: (value: boolean) => void
  onStartTour?: () => void
}

export default function SettingsDrawer({
  isOpen,
  onClose,
  darkMode,
  setDarkMode,
  onStartTour,
}: SettingsDrawerProps) {
  const [activeTab, setActiveTab] = useState<'ai' | 'appearance' | 'notifications'>('ai')
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS)
  const [expandedSection, setExpandedSection] = useState<string | null>(null)
  const [expandedNoteType, setExpandedNoteType] = useState<'newConsult' | 'followUp' | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [dictationTarget, setDictationTarget] = useState<string | null>(null)

  const voice = useVoiceRecorder()

  // When transcription completes, append to the targeted textarea
  useEffect(() => {
    if (voice.transcribedText && dictationTarget) {
      if (dictationTarget === 'newConsult') {
        const newValue = settings.newConsultInstructions
          ? `${settings.newConsultInstructions} ${voice.transcribedText}`
          : voice.transcribedText
        updateSettings('newConsultInstructions', newValue)
      } else if (dictationTarget === 'followUp') {
        const newValue = settings.followUpInstructions
          ? `${settings.followUpInstructions} ${voice.transcribedText}`
          : voice.transcribedText
        updateSettings('followUpInstructions', newValue)
      } else if (dictationTarget in settings.sectionAiInstructions) {
        const section = dictationTarget as keyof typeof settings.sectionAiInstructions
        const current = settings.sectionAiInstructions[section]
        const newValue = current ? `${current} ${voice.transcribedText}` : voice.transcribedText
        updateSectionInstruction(section, newValue)
      }
      voice.clearTranscription()
      setDictationTarget(null)
    }
  }, [voice.transcribedText])

  const toggleDictation = useCallback((target: string) => {
    if (voice.isRecording && dictationTarget === target) {
      voice.stopRecording()
    } else if (voice.isRecording) {
      voice.stopRecording()
      setTimeout(() => {
        setDictationTarget(target)
        voice.startRecording()
      }, 300)
    } else {
      setDictationTarget(target)
      voice.startRecording()
    }
  }, [voice.isRecording, dictationTarget])

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('sevaro-user-settings')
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings)
        // Migrate old settings format
        const migrated = migrateSettings(parsed)
        setSettings({ ...DEFAULT_SETTINGS, ...migrated })
      } catch (e) {
        console.error('Failed to parse settings:', e)
      }
    }
  }, [])

  // Migrate old settings to new format
  const migrateSettings = (old: Partial<UserSettings>): Partial<UserSettings> => {
    const migrated = { ...old }

    // If old globalAiInstructions exists and new fields don't, migrate
    if (old.globalAiInstructions && !old.newConsultInstructions) {
      migrated.newConsultInstructions = old.globalAiInstructions
      migrated.followUpInstructions = old.globalAiInstructions
    }

    // Ensure noteLayout exists
    if (!migrated.noteLayout) {
      migrated.noteLayout = DEFAULT_SETTINGS.noteLayout
    }

    return migrated
  }

  const updateSettings = <K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K]
  ) => {
    setSettings(prev => ({ ...prev, [key]: value }))
    setHasUnsavedChanges(true)
  }

  const updateSectionInstruction = (section: keyof UserSettings['sectionAiInstructions'], value: string) => {
    setSettings(prev => ({
      ...prev,
      sectionAiInstructions: {
        ...prev.sectionAiInstructions,
        [section]: value,
      },
    }))
    setHasUnsavedChanges(true)
  }

  const updateLayoutPreference = (key: keyof NoteLayoutPreferences, value: boolean) => {
    setSettings(prev => ({
      ...prev,
      noteLayout: {
        ...prev.noteLayout,
        [key]: value,
      },
    }))
    setHasUnsavedChanges(true)
  }

  const resetSectionToDefault = (section: keyof typeof DEFAULT_PRESETS) => {
    if (section === 'newConsult') {
      updateSettings('newConsultInstructions', DEFAULT_PRESETS.newConsult)
    } else if (section === 'followUp') {
      updateSettings('followUpInstructions', DEFAULT_PRESETS.followUp)
    } else {
      updateSectionInstruction(section as keyof UserSettings['sectionAiInstructions'], DEFAULT_PRESETS[section])
    }
  }

  const saveSettings = () => {
    setSaveStatus('saving')
    localStorage.setItem('sevaro-user-settings', JSON.stringify(settings))

    // Also save tab order separately for CenterPanel to use
    localStorage.setItem('sevaro-tab-order', JSON.stringify(settings.tabOrder || DEFAULT_TAB_ORDER))

    // Apply font size to document
    document.documentElement.style.setProperty(
      '--base-font-size',
      settings.fontSize === 'small' ? '13px' : settings.fontSize === 'large' ? '16px' : '14px'
    )

    // Apply dark mode preference
    applyDarkModePreference(settings.darkModePreference)

    setTimeout(() => {
      setSaveStatus('saved')
      setHasUnsavedChanges(false)
      setTimeout(() => setSaveStatus('idle'), 2000)
    }, 500)
  }

  // Helper to apply dark mode based on preference
  const applyDarkModePreference = (preference: 'light' | 'dark' | 'system') => {
    if (preference === 'system') {
      const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      setDarkMode(systemPrefersDark)
    } else {
      setDarkMode(preference === 'dark')
    }
  }

  // Handle dark mode preference change
  const handleDarkModePreferenceChange = (preference: 'light' | 'dark' | 'system') => {
    updateSettings('darkModePreference', preference)
    applyDarkModePreference(preference)
  }

  const resetToDefaults = () => {
    if (confirm('Reset all settings to defaults? This cannot be undone.')) {
      setSettings(DEFAULT_SETTINGS)
      setHasUnsavedChanges(true)
    }
  }

  // Tab order management
  const moveTab = (tabId: string, direction: 'up' | 'down') => {
    const currentOrder = settings.tabOrder || DEFAULT_TAB_ORDER
    const currentIndex = currentOrder.indexOf(tabId)
    if (currentIndex === -1) return

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (newIndex < 0 || newIndex >= currentOrder.length) return

    const newOrder = [...currentOrder]
    ;[newOrder[currentIndex], newOrder[newIndex]] = [newOrder[newIndex], newOrder[currentIndex]]
    updateSettings('tabOrder', newOrder)
  }

  // Check if a section has been customized from default
  const isCustomized = (section: keyof typeof DEFAULT_PRESETS): boolean => {
    if (section === 'newConsult') {
      return settings.newConsultInstructions !== DEFAULT_PRESETS.newConsult
    } else if (section === 'followUp') {
      return settings.followUpInstructions !== DEFAULT_PRESETS.followUp
    } else {
      return settings.sectionAiInstructions[section as keyof UserSettings['sectionAiInstructions']] !== DEFAULT_PRESETS[section]
    }
  }

  if (!isOpen) return null

  const tabs = [
    { id: 'ai' as const, label: 'AI & Documentation', icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="#F59E0B">
        <path d="M12 1L13.5 9.5L22 12L13.5 14.5L12 23L10.5 14.5L2 12L10.5 9.5L12 1Z"/>
      </svg>
    )},
    { id: 'appearance' as const, label: 'Appearance', icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
      </svg>
    )},
    { id: 'notifications' as const, label: 'Notifications', icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
      </svg>
    )},
  ]

  const sectionLabels: Record<keyof UserSettings['sectionAiInstructions'], string> = {
    hpi: 'History of Present Illness (HPI)',
    ros: 'Review of Systems (ROS)',
    assessment: 'Assessment',
    plan: 'Plan',
    physicalExam: 'Physical Exam',
  }

  const layoutOptions: Array<{ key: keyof NoteLayoutPreferences; label: string; description: string }> = [
    { key: 'includeHistorySummary', label: 'Include history summary at top', description: 'Add a brief patient history summary at the beginning of follow-up notes' },
    { key: 'includeAllergiesAtTop', label: 'List allergies prominently', description: 'Display allergies at the top of the note for visibility' },
    { key: 'includeProblemList', label: 'Include active problem list', description: 'Add the patient\'s active problem list in the note header' },
    { key: 'groupMedicationsWithAssessment', label: 'Group medications with assessment', description: 'List relevant medications alongside each diagnosis in the assessment' },
  ]

  // Render textarea with dictation button
  const renderTextareaWithDictation = (
    value: string,
    onChange: (value: string) => void,
    placeholder: string,
    target: string,
    minHeight: string = '100px'
  ) => (
    <div style={{ position: 'relative' }}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          minHeight,
          padding: '12px',
          paddingRight: '40px',
          borderRadius: '8px',
          border: '1px solid var(--border)',
          background: 'var(--bg-gray)',
          fontSize: '13px',
          color: 'var(--text-primary)',
          resize: 'vertical',
          fontFamily: 'inherit',
          lineHeight: 1.5,
        }}
      />
      <button
        onClick={() => toggleDictation(target)}
        title={voice.isRecording && dictationTarget === target ? 'Stop dictation' : 'Dictate'}
        style={{
          position: 'absolute',
          bottom: '8px',
          right: '8px',
          width: '24px',
          height: '24px',
          borderRadius: '6px',
          border: 'none',
          background: voice.isRecording && dictationTarget === target ? '#EF4444' : '#FEE2E2',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background 0.2s',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={voice.isRecording && dictationTarget === target ? 'white' : '#EF4444'} strokeWidth="2">
          <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
          <path d="M19 10v2a7 7 0 01-14 0v-2"/>
          <line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
        </svg>
      </button>
      {voice.isTranscribing && dictationTarget === target && (
        <div style={{
          position: 'absolute',
          bottom: '8px',
          right: '40px',
          fontSize: '11px',
          color: 'var(--text-muted)',
        }}>
          Transcribing...
        </div>
      )}
    </div>
  )

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.3)',
          zIndex: 999,
        }}
      />

      {/* Drawer */}
      <div
        className="ai-drawer show"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: '520px',
          maxWidth: '100vw',
          height: '100vh',
          background: 'var(--bg-white)',
          boxShadow: '-4px 0 20px rgba(0, 0, 0, 0.15)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
            </svg>
            <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
              Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '6px',
              border: 'none',
              background: 'var(--bg-gray)',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border)',
            padding: '0 20px',
          }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 16px',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
                color: activeTab === tab.id ? 'var(--primary)' : 'var(--text-secondary)',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                marginBottom: '-1px',
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {/* AI & Documentation Tab */}
          {activeTab === 'ai' && (
            <div>
              {/* Practice Name */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{ marginBottom: '12px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 4px 0', color: 'var(--text-primary)' }}>
                    Practice Name
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                    Displayed on patient education handouts and printed materials.
                  </p>
                </div>
                <input
                  type="text"
                  value={settings.practiceName}
                  onChange={(e) => updateSettings('practiceName', e.target.value)}
                  placeholder="e.g., Meridian Neurology Associates"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-gray)',
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              {/* Note Layout Preferences */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{ marginBottom: '12px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 4px 0', color: 'var(--text-primary)' }}>
                    Note Layout Preferences
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                    Customize what appears in your generated notes.
                  </p>
                </div>
                <div style={{
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  overflow: 'hidden',
                }}>
                  {layoutOptions.map((option, index) => (
                    <label
                      key={option.key}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '12px',
                        padding: '12px 14px',
                        background: index % 2 === 0 ? 'var(--bg-white)' : 'var(--bg-gray)',
                        cursor: 'pointer',
                        borderBottom: index < layoutOptions.length - 1 ? '1px solid var(--border)' : 'none',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={settings.noteLayout[option.key]}
                        onChange={(e) => updateLayoutPreference(option.key, e.target.checked)}
                        style={{
                          marginTop: '2px',
                          width: '16px',
                          height: '16px',
                          accentColor: 'var(--primary)',
                        }}
                      />
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                          {option.label}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {option.description}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Note Type-Specific Instructions */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{ marginBottom: '12px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 4px 0', color: 'var(--text-primary)' }}>
                    Note Type Instructions
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                    Customize AI behavior for different visit types. Click to expand and edit.
                  </p>
                </div>

                {/* New Consultation */}
                <div style={{
                  marginBottom: '8px',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  overflow: 'hidden',
                }}>
                  <button
                    onClick={() => setExpandedNoteType(expandedNoteType === 'newConsult' ? null : 'newConsult')}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 14px',
                      background: expandedNoteType === 'newConsult' ? 'var(--bg-gray)' : 'var(--bg-white)',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '18px' }}>📋</span>
                      <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                        New Consultation Notes
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {isCustomized('newConsult') && (
                        <span style={{
                          fontSize: '10px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: '#8B5CF6',
                          color: 'white',
                        }}>
                          Customized
                        </span>
                      )}
                      <svg
                        width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="var(--text-muted)" strokeWidth="2"
                        style={{ transform: expandedNoteType === 'newConsult' ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </div>
                  </button>
                  {expandedNoteType === 'newConsult' && (
                    <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)' }}>
                      {renderTextareaWithDictation(
                        settings.newConsultInstructions,
                        (val) => updateSettings('newConsultInstructions', val),
                        'Instructions for new consultation notes...',
                        'newConsult',
                        '120px'
                      )}
                      {isCustomized('newConsult') && (
                        <button
                          onClick={() => resetSectionToDefault('newConsult')}
                          style={{
                            marginTop: '8px',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: '1px solid var(--border)',
                            background: 'var(--bg-white)',
                            fontSize: '11px',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8"/>
                            <path d="M3 3v5h5"/>
                          </svg>
                          Reset to Default
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Follow-up */}
                <div style={{
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  overflow: 'hidden',
                }}>
                  <button
                    onClick={() => setExpandedNoteType(expandedNoteType === 'followUp' ? null : 'followUp')}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 14px',
                      background: expandedNoteType === 'followUp' ? 'var(--bg-gray)' : 'var(--bg-white)',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '18px' }}>🔄</span>
                      <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                        Follow-up Notes
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {isCustomized('followUp') && (
                        <span style={{
                          fontSize: '10px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: '#8B5CF6',
                          color: 'white',
                        }}>
                          Customized
                        </span>
                      )}
                      <svg
                        width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="var(--text-muted)" strokeWidth="2"
                        style={{ transform: expandedNoteType === 'followUp' ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </div>
                  </button>
                  {expandedNoteType === 'followUp' && (
                    <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)' }}>
                      {renderTextareaWithDictation(
                        settings.followUpInstructions,
                        (val) => updateSettings('followUpInstructions', val),
                        'Instructions for follow-up notes...',
                        'followUp',
                        '120px'
                      )}
                      {isCustomized('followUp') && (
                        <button
                          onClick={() => resetSectionToDefault('followUp')}
                          style={{
                            marginTop: '8px',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: '1px solid var(--border)',
                            background: 'var(--bg-white)',
                            fontSize: '11px',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8"/>
                            <path d="M3 3v5h5"/>
                          </svg>
                          Reset to Default
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Section-specific Instructions */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{ marginBottom: '12px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 4px 0', color: 'var(--text-primary)' }}>
                    Section-Specific Instructions
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                    Fine-tune AI behavior for individual note sections. These apply to both note types.
                  </p>
                </div>
                {(Object.keys(sectionLabels) as Array<keyof typeof sectionLabels>).map((section) => (
                  <div
                    key={section}
                    style={{
                      marginBottom: '8px',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      overflow: 'hidden',
                    }}
                  >
                    <button
                      onClick={() => setExpandedSection(expandedSection === section ? null : section)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 14px',
                        background: expandedSection === section ? 'var(--bg-gray)' : 'var(--bg-white)',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                        {sectionLabels[section]}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {isCustomized(section) && (
                          <span style={{
                            fontSize: '10px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: '#8B5CF6',
                            color: 'white',
                          }}>
                            Customized
                          </span>
                        )}
                        <svg
                          width="14" height="14" viewBox="0 0 24 24" fill="none"
                          stroke="var(--text-muted)" strokeWidth="2"
                          style={{ transform: expandedSection === section ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </div>
                    </button>
                    {expandedSection === section && (
                      <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)' }}>
                        {renderTextareaWithDictation(
                          settings.sectionAiInstructions[section],
                          (val) => updateSectionInstruction(section, val),
                          `Instructions for ${sectionLabels[section]}...`,
                          section,
                          '80px'
                        )}
                        {isCustomized(section) && (
                          <button
                            onClick={() => resetSectionToDefault(section)}
                            style={{
                              marginTop: '8px',
                              padding: '6px 12px',
                              borderRadius: '6px',
                              border: '1px solid var(--border)',
                              background: 'var(--bg-white)',
                              fontSize: '11px',
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                            }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8"/>
                              <path d="M3 3v5h5"/>
                            </svg>
                            Reset to Default
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Documentation Style */}
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 12px 0', color: 'var(--text-primary)' }}>
                  Documentation Style
                </h3>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {(['concise', 'detailed', 'narrative'] as const).map((style) => (
                    <button
                      key={style}
                      onClick={() => updateSettings('documentationStyle', style)}
                      style={{
                        flex: 1,
                        padding: '12px',
                        borderRadius: '8px',
                        border: settings.documentationStyle === style
                          ? '2px solid var(--primary)'
                          : '1px solid var(--border)',
                        background: settings.documentationStyle === style
                          ? 'rgba(13, 148, 136, 0.05)'
                          : 'var(--bg-white)',
                        cursor: 'pointer',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{
                        fontSize: '13px',
                        fontWeight: 500,
                        color: settings.documentationStyle === style ? 'var(--primary)' : 'var(--text-primary)',
                        textTransform: 'capitalize',
                      }}>
                        {style}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        {style === 'concise' && 'Brief, essential info only'}
                        {style === 'detailed' && 'Comprehensive coverage'}
                        {style === 'narrative' && 'Story-like prose'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Terminology Preference */}
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 12px 0', color: 'var(--text-primary)' }}>
                  Terminology Preference
                </h3>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {(['formal', 'standard', 'simplified'] as const).map((pref) => (
                    <button
                      key={pref}
                      onClick={() => updateSettings('preferredTerminology', pref)}
                      style={{
                        flex: 1,
                        padding: '10px',
                        borderRadius: '8px',
                        border: settings.preferredTerminology === pref
                          ? '2px solid var(--primary)'
                          : '1px solid var(--border)',
                        background: settings.preferredTerminology === pref
                          ? 'rgba(13, 148, 136, 0.05)'
                          : 'var(--bg-white)',
                        cursor: 'pointer',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{
                        fontSize: '13px',
                        fontWeight: 500,
                        color: settings.preferredTerminology === pref ? 'var(--primary)' : 'var(--text-primary)',
                        textTransform: 'capitalize',
                      }}>
                        {pref}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Appearance Tab */}
          {activeTab === 'appearance' && (
            <div>
              {/* Dark Mode Preference */}
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 8px 0', color: 'var(--text-primary)' }}>
                  Theme
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 12px 0' }}>
                  Choose how Sevaro appears. Currently: {darkMode ? 'Dark' : 'Light'}
                </p>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {[
                    { id: 'light' as const, label: 'Light', description: 'Always use light theme', icon: (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                      </svg>
                    )},
                    { id: 'dark' as const, label: 'Dark', description: 'Always use dark theme', icon: (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
                      </svg>
                    )},
                    { id: 'system' as const, label: 'System', description: 'Match system settings', icon: (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                      </svg>
                    )},
                  ].map((option) => (
                    <button
                      key={option.id}
                      onClick={() => handleDarkModePreferenceChange(option.id)}
                      style={{
                        flex: 1,
                        padding: '14px 12px',
                        borderRadius: '8px',
                        border: settings.darkModePreference === option.id
                          ? '2px solid var(--primary)'
                          : '1px solid var(--border)',
                        background: settings.darkModePreference === option.id
                          ? 'rgba(13, 148, 136, 0.05)'
                          : 'var(--bg-white)',
                        cursor: 'pointer',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{
                        display: 'flex',
                        justifyContent: 'center',
                        marginBottom: '8px',
                        color: settings.darkModePreference === option.id ? 'var(--primary)' : 'var(--text-secondary)',
                      }}>
                        {option.icon}
                      </div>
                      <div style={{
                        fontSize: '13px',
                        fontWeight: 500,
                        color: settings.darkModePreference === option.id ? 'var(--primary)' : 'var(--text-primary)',
                      }}>
                        {option.label}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        {option.description}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Font Size */}
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 12px 0', color: 'var(--text-primary)' }}>
                  Font Size
                </h3>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {(['small', 'medium', 'large'] as const).map((size) => (
                    <button
                      key={size}
                      onClick={() => updateSettings('fontSize', size)}
                      style={{
                        flex: 1,
                        padding: '14px',
                        borderRadius: '8px',
                        border: settings.fontSize === size
                          ? '2px solid var(--primary)'
                          : '1px solid var(--border)',
                        background: settings.fontSize === size
                          ? 'rgba(13, 148, 136, 0.05)'
                          : 'var(--bg-white)',
                        cursor: 'pointer',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{
                        fontSize: size === 'small' ? '12px' : size === 'large' ? '16px' : '14px',
                        fontWeight: 500,
                        color: settings.fontSize === size ? 'var(--primary)' : 'var(--text-primary)',
                        textTransform: 'capitalize',
                      }}>
                        Aa
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', textTransform: 'capitalize' }}>
                        {size}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Tab Order */}
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 8px 0', color: 'var(--text-primary)' }}>
                  Tab Order
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 12px 0' }}>
                  Customize the order of tabs in the clinical note editor.
                </p>
                <div style={{
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  overflow: 'hidden',
                }}>
                  {(settings.tabOrder || DEFAULT_TAB_ORDER).map((tabId, index) => (
                    <div
                      key={tabId}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 14px',
                        background: index % 2 === 0 ? 'var(--bg-white)' : 'var(--bg-gray)',
                        borderBottom: index < (settings.tabOrder || DEFAULT_TAB_ORDER).length - 1 ? '1px solid var(--border)' : 'none',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '6px',
                          background: 'var(--primary)',
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '12px',
                          fontWeight: 600,
                        }}>
                          {index + 1}
                        </span>
                        <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                          {TAB_LABELS[tabId] || tabId}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          onClick={() => moveTab(tabId, 'up')}
                          disabled={index === 0}
                          style={{
                            width: '28px',
                            height: '28px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '6px',
                            border: '1px solid var(--border)',
                            background: index === 0 ? 'var(--bg-gray)' : 'var(--bg-white)',
                            cursor: index === 0 ? 'not-allowed' : 'pointer',
                            color: index === 0 ? 'var(--text-muted)' : 'var(--text-secondary)',
                          }}
                          title="Move up"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="18 15 12 9 6 15"/>
                          </svg>
                        </button>
                        <button
                          onClick={() => moveTab(tabId, 'down')}
                          disabled={index === (settings.tabOrder || DEFAULT_TAB_ORDER).length - 1}
                          style={{
                            width: '28px',
                            height: '28px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '6px',
                            border: '1px solid var(--border)',
                            background: index === (settings.tabOrder || DEFAULT_TAB_ORDER).length - 1 ? 'var(--bg-gray)' : 'var(--bg-white)',
                            cursor: index === (settings.tabOrder || DEFAULT_TAB_ORDER).length - 1 ? 'not-allowed' : 'pointer',
                            color: index === (settings.tabOrder || DEFAULT_TAB_ORDER).length - 1 ? 'var(--text-muted)' : 'var(--text-secondary)',
                          }}
                          title="Move down"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="6 9 12 15 18 9"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Onboarding Tour */}
              {onStartTour && (
                <div style={{ marginBottom: '24px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 8px 0', color: 'var(--text-primary)' }}>
                    Guided Tour
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 12px 0' }}>
                    Learn about key features and how to use Sevaro Clinical.
                  </p>
                  <button
                    onClick={() => {
                      onClose()
                      setTimeout(() => onStartTour(), 300)
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '12px 16px',
                      borderRadius: '8px',
                      border: '1px solid var(--primary)',
                      background: 'rgba(13, 148, 136, 0.05)',
                      cursor: 'pointer',
                      color: 'var(--primary)',
                      fontSize: '13px',
                      fontWeight: 500,
                      width: '100%',
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/>
                      <line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    Take the Guided Tour
                  </button>
                </div>
              )}

              {/* Preview */}
              <div style={{
                padding: '16px',
                background: 'var(--bg-gray)',
                borderRadius: '8px',
                border: '1px solid var(--border)',
              }}>
                <h4 style={{ fontSize: '12px', fontWeight: 600, margin: '0 0 8px 0', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Preview
                </h4>
                <p style={{
                  fontSize: settings.fontSize === 'small' ? '13px' : settings.fontSize === 'large' ? '16px' : '14px',
                  color: 'var(--text-primary)',
                  margin: 0,
                  lineHeight: 1.5,
                }}>
                  This is how your clinical notes will appear with the current font size setting.
                  Patient presents with chronic headache for the past 3 months...
                </p>
              </div>
            </div>
          )}

          {/* Notifications Tab */}
          {activeTab === 'notifications' && (
            <div>
              {/* Sound */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px',
                background: 'var(--bg-gray)',
                borderRadius: '8px',
                marginBottom: '12px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                    <path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/>
                  </svg>
                  <div>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 2px 0', color: 'var(--text-primary)' }}>
                      Sound Effects
                    </h3>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                      Play sounds for notifications and alerts
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => updateSettings('soundEnabled', !settings.soundEnabled)}
                  style={{
                    width: '52px',
                    height: '28px',
                    borderRadius: '14px',
                    border: 'none',
                    background: settings.soundEnabled ? 'var(--primary)' : 'var(--border)',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'background 0.2s',
                  }}
                >
                  <div
                    style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '50%',
                      background: 'white',
                      position: 'absolute',
                      top: '3px',
                      left: settings.soundEnabled ? '27px' : '3px',
                      transition: 'left 0.2s',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }}
                  />
                </button>
              </div>

              {/* Push Notifications */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px',
                background: 'var(--bg-gray)',
                borderRadius: '8px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2">
                    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
                  </svg>
                  <div>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 2px 0', color: 'var(--text-primary)' }}>
                      Push Notifications
                    </h3>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                      Receive browser notifications
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => updateSettings('notificationsEnabled', !settings.notificationsEnabled)}
                  style={{
                    width: '52px',
                    height: '28px',
                    borderRadius: '14px',
                    border: 'none',
                    background: settings.notificationsEnabled ? 'var(--primary)' : 'var(--border)',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'background 0.2s',
                  }}
                >
                  <div
                    style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '50%',
                      background: 'white',
                      position: 'absolute',
                      top: '3px',
                      left: settings.notificationsEnabled ? '27px' : '3px',
                      transition: 'left 0.2s',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }}
                  />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 20px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <button
            onClick={resetToDefaults}
            style={{
              padding: '10px 16px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--bg-white)',
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            Reset All
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {saveStatus === 'saved' && (
              <span style={{ fontSize: '12px', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Saved
              </span>
            )}
            <button
              onClick={saveSettings}
              disabled={!hasUnsavedChanges || saveStatus === 'saving'}
              style={{
                padding: '10px 24px',
                borderRadius: '8px',
                border: 'none',
                background: hasUnsavedChanges ? 'var(--primary)' : 'var(--bg-gray)',
                fontSize: '13px',
                fontWeight: 600,
                color: hasUnsavedChanges ? 'white' : 'var(--text-muted)',
                cursor: hasUnsavedChanges ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {saveStatus === 'saving' ? (
                <>
                  <div
                    style={{
                      width: '14px',
                      height: '14px',
                      border: '2px solid rgba(255,255,255,0.3)',
                      borderTopColor: 'white',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite',
                    }}
                  />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  )
}

// Export type for other components
export type { UserSettings, NoteLayoutPreferences }

// Export a helper to get settings for use in other components
export function getUserSettings(): UserSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS

  const savedSettings = localStorage.getItem('sevaro-user-settings')
  if (savedSettings) {
    try {
      const parsed = JSON.parse(savedSettings)
      return { ...DEFAULT_SETTINGS, ...parsed }
    } catch (e) {
      return DEFAULT_SETTINGS
    }
  }
  return DEFAULT_SETTINGS
}

// Export default presets for reference
export { DEFAULT_PRESETS }
