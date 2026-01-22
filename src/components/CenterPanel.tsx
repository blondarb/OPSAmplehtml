'use client'

import { useState } from 'react'

interface CenterPanelProps {
  noteData: any
  updateNote: (field: string, value: any) => void
  currentVisit: any
  imagingStudies: any[]
  openAiDrawer: (tab: string) => void
}

const CHIEF_COMPLAINTS = [
  'Altered mental status', 'Amnesia', 'Blurry vision', 'Chronic pain',
  'Confirmed stroke on neuroimaging', 'Difficulty swallowing', 'Dizziness/Vertigo',
  'Double vision', 'Headache', 'Hemorrhagic Stroke', 'Hypoxic/Anoxic brain injury',
  'Memory problem', 'Movement problem', 'Multiple Sclerosis Exacerbation',
  'Myasthenia Gravis Exacerbation', 'Neuropathy', 'Numbness', 'Parkinson Disease',
  'Prognosis after cardiac arrest', 'Seizure', 'Stroke like symptoms', 'Syncope',
  'TIA', 'Tremor', 'Vision loss', 'Weakness', 'Other'
]

const ALLERGY_OPTIONS = ['NKDA', 'Reviewed in EMR', 'Unknown', 'Other']
const ROS_OPTIONS = ['Reviewed', 'Unable to obtain due to:', 'Other']
const HISTORY_OPTIONS = ['Yes', 'No, due to patient mentation', 'NA due to phone consult']

export default function CenterPanel({ noteData, updateNote, currentVisit, imagingStudies, openAiDrawer }: CenterPanelProps) {
  const [activeTab, setActiveTab] = useState('history')

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
    <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Tab Navigation with Action Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--bg-white)',
        borderBottom: '1px solid var(--border)',
        padding: '0 16px',
      }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '16px 20px',
                fontSize: '14px',
                fontWeight: 500,
                color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                position: 'relative',
                borderBottom: activeTab === tab.id ? '2px solid var(--text-primary)' : '2px solid transparent',
                marginBottom: '-1px',
              }}
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
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px', background: 'var(--bg-gray)', position: 'relative' }}>
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
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {CHIEF_COMPLAINTS.map(complaint => (
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
                <div style={{ position: 'relative' }}>
                  <div style={{
                    position: 'absolute',
                    top: '-8px',
                    left: '12px',
                    background: 'var(--bg-white)',
                    padding: '0 4px',
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                  }}>
                    Describe symptoms and history *
                  </div>
                  <textarea
                    value={noteData.hpi}
                    onChange={(e) => updateNote('hpi', e.target.value)}
                    placeholder=""
                    style={{
                      width: '100%',
                      minHeight: '120px',
                      padding: '16px',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      fontSize: '14px',
                      resize: 'vertical',
                      outline: 'none',
                      fontFamily: 'inherit',
                      color: 'var(--text-primary)',
                      background: 'var(--bg-white)',
                    }}
                  />
                </div>
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
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
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

            {/* Neuro exam */}
            <div style={{
              background: 'var(--bg-white)',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                <input type="checkbox" style={{ width: '18px', height: '18px', accentColor: 'var(--primary)' }}/>
                <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Neuro exam</span>
              </label>
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
                <div style={{ position: 'relative' }}>
                  <div style={{
                    position: 'absolute',
                    top: '-8px',
                    left: '12px',
                    background: 'var(--bg-white)',
                    padding: '0 4px',
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                  }}>
                    Enter a detailed assessment *
                  </div>
                  <textarea
                    value={noteData.assessment}
                    onChange={(e) => updateNote('assessment', e.target.value)}
                    placeholder=""
                    style={{
                      width: '100%',
                      minHeight: '120px',
                      padding: '16px',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      fontSize: '14px',
                      resize: 'vertical',
                      outline: 'none',
                      fontFamily: 'inherit',
                      color: 'var(--text-primary)',
                      background: 'var(--bg-white)',
                    }}
                  />
                </div>
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
