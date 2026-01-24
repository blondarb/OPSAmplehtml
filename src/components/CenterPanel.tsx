'use client'

import { useState } from 'react'
import NoteTextField from './NoteTextField'
import SmartScalesSection from './SmartScalesSection'

interface CenterPanelProps {
  noteData: any
  updateNote: (field: string, value: any) => void
  currentVisit: any
  patient?: any
  imagingStudies: any[]
  openAiDrawer: (tab: string) => void
  openDotPhrases?: (field: string) => void
  setActiveTextField?: (field: string | null) => void
  rawDictation?: Record<string, Array<{ text: string; timestamp: string }>>
  updateRawDictation?: (field: string, rawText: string) => void
}

// Categorized diagnoses with primary (always shown) and expanded (shown on expand) items
const DIAGNOSIS_CATEGORIES: Record<string, { primary: string[]; expanded: string[] }> = {
  'Headache': {
    primary: ['Migraine', 'Chronic migraine', 'Tension headache'],
    expanded: ['Cluster headache', 'New daily persistent headache', 'Medication overuse headache', 'Post-traumatic headache', 'Facial pain/Trigeminal neuralgia'],
  },
  'Movement': {
    primary: ['Parkinson disease', 'Essential tremor', 'Restless legs syndrome'],
    expanded: ['Dystonia', 'Tics/Tourette syndrome', 'Huntington disease', 'Ataxia', 'Chorea'],
  },
  'Epilepsy': {
    primary: ['Epilepsy', 'New onset seizure'],
    expanded: ['Breakthrough seizures', 'Seizure medication adjustment'],
  },
  'Cognitive': {
    primary: ['Memory loss', 'Dementia evaluation', 'Mild cognitive impairment'],
    expanded: ['Alzheimer disease', 'Frontotemporal dementia', 'Lewy body dementia'],
  },
  'Neuromuscular': {
    primary: ['Peripheral neuropathy', 'Carpal tunnel syndrome'],
    expanded: ['Myasthenia gravis', 'ALS/Motor neuron disease', 'Myopathy', 'Radiculopathy', 'Plexopathy'],
  },
  'MS & Neuroimmunology': {
    primary: ['Multiple sclerosis', 'MS follow-up'],
    expanded: ['Optic neuritis', 'Transverse myelitis', 'NMOSD'],
  },
  'Cerebrovascular': {
    primary: ['Stroke follow-up', 'TIA evaluation'],
    expanded: ['Carotid stenosis', 'Stroke prevention'],
  },
  'Sleep': {
    primary: ['Insomnia'],
    expanded: ['Narcolepsy', 'Sleep apnea evaluation'],
  },
  'Other': {
    primary: ['Dizziness/Vertigo', 'Numbness/Tingling', 'Weakness', 'Second opinion'],
    expanded: ['Gait disorder', 'Back pain with neuro symptoms', 'Concussion/Post-concussion syndrome', 'Bell palsy', 'Other'],
  },
}

// Flat list for compatibility with existing code
const CHIEF_COMPLAINTS = Object.values(DIAGNOSIS_CATEGORIES).flatMap(cat => [...cat.primary, ...cat.expanded])

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
  openDotPhrases,
  setActiveTextField,
  rawDictation,
  updateRawDictation
}: CenterPanelProps) {
  const [activeTab, setActiveTab] = useState('history')
  const [localActiveField, setLocalActiveField] = useState<string | null>(null)

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

  // Diagnosis category expansion state
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({})

  const toggleExamAccordion = (key: string) => {
    setOpenExamAccordions(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const toggleCategoryExpansion = (category: string) => {
    setExpandedCategories(prev => ({ ...prev, [category]: !prev[category] }))
  }

  const toggleExamFinding = (key: string) => {
    setExamFindings(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const setExamFinding = (key: string, value: boolean) => {
    setExamFindings(prev => ({ ...prev, [key]: value }))
  }

  const handleSetActiveField = (field: string | null) => {
    setLocalActiveField(field)
    if (setActiveTextField) setActiveTextField(field)
  }

  const toggleChip = (complaint: string) => {
    const current = noteData.chiefComplaint || []
    if (current.includes(complaint)) {
      updateNote('chiefComplaint', current.filter((c: string) => c !== complaint))
    } else {
      updateNote('chiefComplaint', [...current, complaint])
    }
  }

  const tabs = [
    { id: 'history', label: 'History' },
    { id: 'imaging', label: 'Imaging/results' },
    { id: 'exam', label: 'Physical exams' },
    { id: 'recommendation', label: 'Recommendation' },
  ]

  return (
    <main className="center-panel">
      {/* Tab Navigation with Action Bar */}
      <div className="tab-nav-wrapper">
        {/* Tabs */}
        <div className="tab-nav">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* More Options */}
          <button style={{
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
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><circle cx="5" cy="12" r="2"/>
            </svg>
          </button>

          {/* Thumbs Up */}
          <button style={{
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
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/>
            </svg>
          </button>

          {/* Microphone */}
          <button
            onClick={() => openAiDrawer('document')}
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
              background: 'var(--primary)',
              cursor: 'pointer',
              color: 'white',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          </button>

          {/* Copy */}
          <button style={{
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
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
            </svg>
          </button>

          {/* Divider */}
          <div style={{ width: '1px', height: '24px', background: 'var(--border)', margin: '0 4px' }}/>

          {/* Generate Note Button */}
          <button
            onClick={() => openAiDrawer('chart-prep')}
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
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            Generate Note
          </button>

          {/* Pend Button */}
          <button style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            background: 'var(--bg-white)',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 500,
            color: 'var(--text-primary)',
          }}>
            Pend
          </button>

          {/* Sign & Complete Button */}
          <button style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            background: 'var(--primary)',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 500,
            color: 'white',
          }}>
            Sign & complete
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="tab-content" style={{ position: 'relative' }}>
        {/* History Tab */}
        {activeTab === 'history' && (
          <>
            {/* Reason for Consult */}
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
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Reason for consult</span>
                  <span style={{ color: '#EF4444', marginLeft: '2px' }}>*</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {Object.entries(DIAGNOSIS_CATEGORIES).map(([category, items]) => {
                    const isExpanded = expandedCategories[category]
                    const hasExpanded = items.expanded.length > 0
                    const visibleItems = isExpanded ? [...items.primary, ...items.expanded] : items.primary

                    return (
                      <div key={category}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          marginBottom: '8px',
                        }}>
                          <span style={{
                            fontSize: '12px',
                            fontWeight: 600,
                            color: 'var(--text-secondary)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                          }}>
                            {category}
                          </span>
                          {hasExpanded && (
                            <button
                              onClick={() => toggleCategoryExpansion(category)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '2px 8px',
                                borderRadius: '12px',
                                fontSize: '11px',
                                cursor: 'pointer',
                                border: '1px solid var(--border)',
                                background: isExpanded ? 'var(--bg-secondary)' : 'transparent',
                                color: 'var(--text-secondary)',
                                transition: 'all 0.2s',
                              }}
                            >
                              {isExpanded ? 'Less' : `+${items.expanded.length} more`}
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                style={{
                                  transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                  transition: 'transform 0.2s',
                                }}
                              >
                                <polyline points="6 9 12 15 18 9"/>
                              </svg>
                            </button>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          {visibleItems.map(complaint => (
                            <button
                              key={complaint}
                              onClick={() => toggleChip(complaint)}
                              style={{
                                padding: '8px 14px',
                                borderRadius: '20px',
                                fontSize: '13px',
                                cursor: 'pointer',
                                border: '1px solid',
                                borderColor: noteData.chiefComplaint?.includes(complaint) ? 'var(--primary)' : 'var(--border)',
                                background: noteData.chiefComplaint?.includes(complaint) ? 'var(--primary)' : 'var(--bg-white)',
                                color: noteData.chiefComplaint?.includes(complaint) ? 'white' : 'var(--text-secondary)',
                                transition: 'all 0.2s',
                              }}
                            >
                              {complaint}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

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
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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
            />
          </>
        )}

        {/* Imaging Tab */}
        {activeTab === 'imaging' && (
          <div>
            {/* CTH Done */}
            <div style={{
              background: 'var(--bg-white)',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Was CTH done?</span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>(Optional)</span>
                <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                  <button style={{
                    padding: '8px 24px',
                    borderRadius: '20px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-white)',
                    color: 'var(--text-secondary)',
                  }}>Yes</button>
                  <button style={{
                    padding: '8px 24px',
                    borderRadius: '20px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-white)',
                    color: 'var(--text-secondary)',
                  }}>No</button>
                </div>
              </div>
            </div>

            {/* CTA head & neck */}
            <div style={{
              background: 'var(--bg-white)',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Was CTA head & neck done?</span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>(Optional)</span>
                <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                  <button style={{
                    padding: '8px 24px',
                    borderRadius: '20px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-white)',
                    color: 'var(--text-secondary)',
                  }}>Yes</button>
                  <button style={{
                    padding: '8px 24px',
                    borderRadius: '20px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-white)',
                    color: 'var(--text-secondary)',
                  }}>No</button>
                </div>
              </div>
            </div>

            {/* MRI brain */}
            <div style={{
              background: 'var(--bg-white)',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>MRI brain</span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>(Optional)</span>
                <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                  <button style={{
                    padding: '8px 24px',
                    borderRadius: '20px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-white)',
                    color: 'var(--text-secondary)',
                  }}>Yes</button>
                  <button style={{
                    padding: '8px 24px',
                    borderRadius: '20px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    border: '1px solid var(--primary)',
                    background: 'var(--primary)',
                    color: 'white',
                  }}>No</button>
                </div>
              </div>
            </div>

            {/* TTE */}
            <div style={{
              background: 'var(--bg-white)',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>TTE</span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>(Optional)</span>
                <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                  <button style={{
                    padding: '8px 24px',
                    borderRadius: '20px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-white)',
                    color: 'var(--text-secondary)',
                  }}>Yes</button>
                  <button style={{
                    padding: '8px 24px',
                    borderRadius: '20px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-white)',
                    color: 'var(--text-secondary)',
                  }}>No</button>
                </div>
              </div>
            </div>

            {/* Lab results */}
            <div style={{
              background: 'var(--bg-white)',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}>
              <div style={{ marginBottom: '16px' }}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Lab results</span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>(Optional)</span>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {['Lipid profile panel', 'HbA1c', 'Other lab results'].map(option => (
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
        )}

        {/* Exam Tab */}
        {activeTab === 'exam' && (
          <div>
            {/* Initial Assessment */}
            <div style={{
              background: 'var(--bg-white)',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Initial assessment</span>
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
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--bg-dark)', padding: '4px 8px', borderRadius: '4px' }}>Optional</span>
              </div>

              {/* General Appearance Accordion */}
              <div
                onClick={() => toggleExamAccordion('generalAppearance')}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  marginBottom: '8px',
                  overflow: 'hidden',
                  cursor: 'pointer',
                }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: openExamAccordions.generalAppearance ? 'var(--bg-dark)' : 'transparent',
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
                    <select style={{ width: '100%', padding: '10px', border: '1px solid var(--border)', borderRadius: '6px' }}>
                      <option>In no apparent distress</option>
                      <option>Appears uncomfortable</option>
                      <option>Appears ill</option>
                      <option>Appears anxious</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Mental Status Accordion */}
              <div
                onClick={() => toggleExamAccordion('mentalStatus')}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  marginBottom: '8px',
                  overflow: 'hidden',
                  cursor: 'pointer',
                }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: openExamAccordions.mentalStatus ? 'var(--bg-dark)' : 'transparent',
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
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={examFindings.followingCommands}
                        onChange={() => toggleExamFinding('followingCommands')}
                        style={{ accentColor: 'var(--primary)' }}
                      />
                      <span style={{ fontSize: '13px' }}>Following commands</span>
                    </label>
                  </div>
                )}
              </div>

              {/* Cranial Nerves Accordion */}
              <div
                onClick={() => toggleExamAccordion('cranialNerves')}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  marginBottom: '8px',
                  overflow: 'hidden',
                  cursor: 'pointer',
                }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: openExamAccordions.cranialNerves ? 'var(--bg-dark)' : 'transparent',
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
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
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
                  </div>
                )}
              </div>

              {/* Motor Accordion */}
              <div
                onClick={() => toggleExamAccordion('motor')}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  marginBottom: '8px',
                  overflow: 'hidden',
                  cursor: 'pointer',
                }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: openExamAccordions.motor ? 'var(--bg-dark)' : 'transparent',
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
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
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
                  </div>
                )}
              </div>

              {/* Sensation Accordion */}
              <div
                onClick={() => toggleExamAccordion('sensation')}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  marginBottom: '8px',
                  overflow: 'hidden',
                  cursor: 'pointer',
                }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: openExamAccordions.sensation ? 'var(--bg-dark)' : 'transparent',
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
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
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
                  </div>
                )}
              </div>

              {/* Coordination Accordion */}
              <div
                onClick={() => toggleExamAccordion('coordination')}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  marginBottom: '8px',
                  overflow: 'hidden',
                  cursor: 'pointer',
                }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: openExamAccordions.coordination ? 'var(--bg-dark)' : 'transparent',
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
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
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
                  </div>
                )}
              </div>

              {/* Gait Accordion */}
              <div
                onClick={() => toggleExamAccordion('gait')}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  cursor: 'pointer',
                }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: openExamAccordions.gait ? 'var(--bg-dark)' : 'transparent',
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
                        <span style={{ fontSize: '13px' }}>Evaluated</span>
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
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
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
        )}

        {/* Recommendation Tab */}
        {activeTab === 'recommendation' && (
          <>
            {/* Differential Diagnosis */}
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
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Differential diagnosis</span>
                  <span style={{ color: '#EF4444', marginLeft: '2px' }}>*</span>
                </div>
                <div style={{ position: 'relative' }}>
                  <select style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    fontSize: '14px',
                    outline: 'none',
                    appearance: 'none',
                    background: 'var(--bg-white)',
                    cursor: 'pointer',
                  }}>
                    <option value="">Select diagnosis...</option>
                    <option value="migraine">Headache/migraine</option>
                    <option value="stroke">Stroke</option>
                    <option value="seizure">Seizure disorder</option>
                  </select>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" style={{
                    position: 'absolute',
                    right: '16px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    pointerEvents: 'none',
                  }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </div>
              </div>
            </div>

            {/* Generate Assessment Button */}
            <button
              onClick={() => openAiDrawer('ask-ai')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 20px',
                background: 'var(--primary)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 500,
                cursor: 'pointer',
                marginBottom: '16px',
                fontSize: '14px',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
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
                />
              </div>
            </div>

            {/* Recommendations */}
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
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Recommendations</span>
                  <span style={{ color: '#EF4444', marginLeft: '2px' }}>*</span>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                  <button style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    border: 'none',
                    background: 'var(--primary)',
                    color: 'white',
                    fontWeight: 500,
                  }}>
                    Pre-made template
                  </button>
                  <button style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-white)',
                    color: 'var(--text-secondary)',
                  }}>
                    Free-text recommendations
                  </button>
                </div>
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
