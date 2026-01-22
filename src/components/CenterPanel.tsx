'use client'

import { useState } from 'react'
import NoteTextField from './NoteTextField'

interface CenterPanelProps {
  noteData: any
  updateNote: (field: string, value: any) => void
  currentVisit: any
  imagingStudies: any[]
  openAiDrawer: (tab: string) => void
  openPhrasesDrawer: (field?: string) => void
  setActiveTextField: (field: string | null) => void
  rawDictation: Record<string, string>
  updateRawDictation: (field: string, rawText: string) => void
}

const CHIEF_COMPLAINTS = [
  'Altered mental status', 'Amnesia', 'Blurry vision', 'Chronic pain',
  'Dizziness/Vertigo', 'Double vision', 'Headache', 'Memory problem',
  'Movement problem', 'Neuropathy', 'Numbness', 'Parkinson Disease',
  'Seizure', 'Stroke like symptoms', 'Syncope', 'TIA', 'Tremor',
  'Vision loss', 'Weakness', 'Other'
]

export default function CenterPanel({ noteData, updateNote, currentVisit, imagingStudies, openAiDrawer, openPhrasesDrawer, setActiveTextField, rawDictation, updateRawDictation }: CenterPanelProps) {
  const [activeTab, setActiveTab] = useState('history')
  const [openAccordions, setOpenAccordions] = useState<string[]>(['headache-scales'])

  const toggleChip = (complaint: string) => {
    const current = noteData.chiefComplaint || []
    if (current.includes(complaint)) {
      updateNote('chiefComplaint', current.filter((c: string) => c !== complaint))
    } else {
      updateNote('chiefComplaint', [...current, complaint])
    }
  }

  const toggleAccordion = (id: string) => {
    setOpenAccordions(prev =>
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    )
  }

  const tabs = [
    { id: 'history', label: 'History' },
    { id: 'imaging', label: 'Imaging/results' },
    { id: 'exam', label: 'Physical exams' },
    { id: 'recommendation', label: 'Recommendation' },
  ]

  return (
    <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Tab Navigation */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--bg-white)',
        borderBottom: '1px solid var(--border)',
        paddingRight: '16px',
      }}>
        <div style={{ display: 'flex', gap: '4px', padding: '0 24px' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '16px 20px',
                fontSize: '14px',
                fontWeight: 500,
                color: activeTab === tab.id ? 'var(--primary)' : 'var(--text-secondary)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                position: 'relative',
                borderBottom: activeTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
                marginBottom: '-1px',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px', background: 'var(--bg-gray)' }}>
        {/* History Tab */}
        {activeTab === 'history' && (
          <>
            {/* Chief Complaint */}
            <div style={{
              background: 'var(--bg-white)',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Reason for visit</span>
                <span style={{
                  background: 'var(--error)',
                  color: 'white',
                  fontSize: '11px',
                  fontWeight: 500,
                  padding: '3px 8px',
                  borderRadius: '4px',
                }}>Required</span>
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

            {/* HPI */}
            <div style={{
              background: 'var(--bg-white)',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>History of presenting illness</span>
                <span style={{
                  background: 'var(--error)',
                  color: 'white',
                  fontSize: '11px',
                  fontWeight: 500,
                  padding: '3px 8px',
                  borderRadius: '4px',
                }}>Required</span>
              </div>
              <NoteTextField
                value={noteData.hpi}
                onChange={(value) => updateNote('hpi', value)}
                fieldName="hpi"
                placeholder="Min. 25 words"
                minHeight="120px"
                showDictate={true}
                showAiAction={true}
                onOpenAiDrawer={() => openAiDrawer('ask-ai')}
                onOpenFullPhrasesDrawer={() => openPhrasesDrawer('hpi')}
                setActiveTextField={setActiveTextField}
                rawDictation={rawDictation.hpi}
                onRawDictationChange={(rawText) => updateRawDictation('hpi', rawText)}
              />
            </div>

            {/* Clinical Scales */}
            <div style={{
              background: 'var(--bg-white)',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Clinical Scales</span>
                <span style={{
                  background: 'var(--bg-dark)',
                  color: 'var(--text-secondary)',
                  fontSize: '11px',
                  fontWeight: 500,
                  padding: '3px 8px',
                  borderRadius: '4px',
                }}>Optional</span>
              </div>

              {/* Headache Scales Accordion */}
              <div style={{
                border: '1px solid var(--border)',
                borderRadius: '8px',
                marginBottom: '8px',
                overflow: 'hidden',
              }}>
                <div
                  onClick={() => toggleAccordion('headache-scales')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 16px',
                    background: 'var(--bg-white)',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '12px', fontWeight: 500 }}>
                    <span style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: 'var(--success)',
                    }}/>
                    Headache Scales
                  </span>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--text-muted)"
                    strokeWidth="2"
                    style={{
                      transform: openAccordions.includes('headache-scales') ? 'rotate(180deg)' : 'rotate(0)',
                      transition: 'transform 0.2s',
                    }}
                  >
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </div>

                {openAccordions.includes('headache-scales') && (
                  <div style={{
                    padding: '16px',
                    borderTop: '1px solid var(--border)',
                    background: 'var(--bg-gray)',
                  }}>
                    {/* MIDAS */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      padding: '12px 0',
                      borderBottom: '1px solid var(--border)',
                    }}>
                      <span style={{ flex: 1, fontWeight: 500 }}>MIDAS Score</span>
                      <input
                        type="number"
                        defaultValue={18}
                        style={{
                          width: '80px',
                          padding: '8px',
                          border: '1px solid var(--border)',
                          borderRadius: '6px',
                          textAlign: 'center',
                        }}
                      />
                      <select style={{
                        width: '150px',
                        padding: '8px',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        background: 'var(--bg-white)',
                      }}>
                        <option>Moderate disability</option>
                        <option>Little/No disability</option>
                        <option>Mild disability</option>
                        <option>Severe disability</option>
                      </select>
                    </div>
                    {/* HIT-6 */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      padding: '12px 0',
                    }}>
                      <span style={{ flex: 1, fontWeight: 500 }}>HIT-6 Score</span>
                      <input
                        type="number"
                        defaultValue={58}
                        style={{
                          width: '80px',
                          padding: '8px',
                          border: '1px solid var(--border)',
                          borderRadius: '6px',
                          textAlign: 'center',
                        }}
                      />
                      <select style={{
                        width: '150px',
                        padding: '8px',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        background: 'var(--bg-white)',
                      }}>
                        <option>Substantial impact</option>
                        <option>Little/No impact</option>
                        <option>Some impact</option>
                        <option>Severe impact</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Cognitive Scales */}
              <div style={{
                border: '1px solid var(--border)',
                borderRadius: '8px',
                marginBottom: '8px',
              }}>
                <div
                  onClick={() => toggleAccordion('cognitive-scales')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 16px',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '12px', fontWeight: 500 }}>
                    <span style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: 'var(--border)',
                    }}/>
                    Cognitive Scales
                  </span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </div>
              </div>

              {/* Mental Health */}
              <div style={{
                border: '1px solid var(--border)',
                borderRadius: '8px',
              }}>
                <div
                  onClick={() => toggleAccordion('mental-health')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 16px',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '12px', fontWeight: 500 }}>
                    <span style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: 'var(--border)',
                    }}/>
                    Mental Health Screens
                  </span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </div>
              </div>
            </div>

            {/* ROS */}
            <div style={{
              background: 'var(--bg-white)',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Review of systems</span>
                <span style={{
                  background: 'var(--error)',
                  color: 'white',
                  fontSize: '11px',
                  fontWeight: 500,
                  padding: '3px 8px',
                  borderRadius: '4px',
                }}>Required</span>
              </div>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                {['Reviewed', 'Unable to obtain due to:', 'Other'].map(option => (
                  <label key={option} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="ros"
                      checked={noteData.ros === option}
                      onChange={() => updateNote('ros', option)}
                      style={{ accentColor: 'var(--primary)' }}
                    />
                    {option}
                  </label>
                ))}
              </div>
            </div>

            {/* Allergies */}
            <div style={{
              background: 'var(--bg-white)',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Allergies</span>
                <span style={{
                  background: 'var(--error)',
                  color: 'white',
                  fontSize: '11px',
                  fontWeight: 500,
                  padding: '3px 8px',
                  borderRadius: '4px',
                }}>Required</span>
              </div>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                {['NKDA', 'Reviewed in EHR', 'Unknown', 'Other'].map(option => (
                  <label key={option} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="allergies"
                      checked={noteData.allergies === option}
                      onChange={() => updateNote('allergies', option)}
                      style={{ accentColor: 'var(--primary)' }}
                    />
                    {option}
                  </label>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Imaging Tab */}
        {activeTab === 'imaging' && (
          <div>
            {imagingStudies.length === 0 ? (
              <div style={{
                background: 'var(--bg-white)',
                borderRadius: '12px',
                padding: '40px',
                textAlign: 'center',
                color: 'var(--text-muted)',
              }}>
                No imaging studies found
              </div>
            ) : (
              imagingStudies.map(study => (
                <div key={study.id} style={{
                  background: 'var(--bg-white)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  marginBottom: '8px',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 16px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontWeight: 500 }}>{study.study_type} - {study.description}</span>
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {new Date(study.study_date).toLocaleDateString()}
                    </span>
                  </div>
                  {study.impression && (
                    <div style={{
                      padding: '16px',
                      borderTop: '1px solid var(--border)',
                      background: 'var(--bg-gray)',
                      fontSize: '13px',
                      color: 'var(--text-secondary)',
                    }}>
                      <strong>Impression:</strong> {study.impression}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Exam Tab */}
        {activeTab === 'exam' && (
          <div style={{
            background: 'var(--bg-white)',
            borderRadius: '12px',
            padding: '20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}>
            <div style={{ marginBottom: '16px' }}>
              <button style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 16px',
                background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 500,
                cursor: 'pointer',
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Quick Normal Exam
              </button>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
              Physical examination documentation will appear here. Click &quot;Quick Normal Exam&quot; to populate with normal findings.
            </p>
          </div>
        )}

        {/* Recommendation Tab */}
        {activeTab === 'recommendation' && (
          <>
            <div style={{
              background: 'var(--bg-white)',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}>
              <div style={{ marginBottom: '16px' }}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Diagnosis</span>
              </div>
              <input
                type="text"
                placeholder="Search diagnoses by name or ICD-10 code..."
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  paddingLeft: '40px',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  fontSize: '14px',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{
              background: 'var(--bg-white)',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}>
              <div style={{ marginBottom: '16px' }}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Assessment & Plan</span>
              </div>
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
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
                Generate Assessment
              </button>
              <NoteTextField
                value={noteData.assessment}
                onChange={(value) => updateNote('assessment', value)}
                fieldName="assessment"
                placeholder="Assessment will appear here..."
                minHeight="150px"
                showDictate={true}
                showAiAction={true}
                onOpenAiDrawer={() => openAiDrawer('ask-ai')}
                onOpenFullPhrasesDrawer={() => openPhrasesDrawer('assessment')}
                setActiveTextField={setActiveTextField}
                rawDictation={rawDictation.assessment}
                onRawDictationChange={(rawText) => updateRawDictation('assessment', rawText)}
              />
            </div>
          </>
        )}
      </div>
    </main>
  )
}
