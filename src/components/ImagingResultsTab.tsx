'use client'

import { useState } from 'react'
import NoteTextField from './NoteTextField'

interface Study {
  id: string
  name: string
  icon: 'imaging' | 'neuro'
  date: string
  impression: string
  findings: string
  pacsLink: string
}

interface ImagingResultsTabProps {
  noteData: any
  updateNote: (field: string, value: any) => void
  openVoiceDrawer?: (tab: string) => void
  openAiDrawer: (tab: string) => void
  openDotPhrases?: (field: string) => void
  setActiveTextField?: (field: string | null) => void
}

const IMPRESSION_OPTIONS = ['Normal', 'Abnormal', 'Unchanged', 'Pending', 'Not available']

const IMAGING_STUDIES = [
  { id: 'mri_brain', name: 'MRI Brain', icon: 'imaging' as const },
  { id: 'ct_head', name: 'CT Head', icon: 'imaging' as const },
  { id: 'cta_head_neck', name: 'CTA Head & Neck', icon: 'imaging' as const },
  { id: 'mra_head', name: 'MRA Head', icon: 'imaging' as const },
  { id: 'mri_spine', name: 'MRI Spine', icon: 'imaging' as const },
]

const NEURODIAGNOSTIC_STUDIES = [
  { id: 'eeg', name: 'EEG', icon: 'neuro' as const },
  { id: 'emg_ncs', name: 'EMG/NCS', icon: 'neuro' as const },
  { id: 'vep', name: 'VEP', icon: 'neuro' as const },
  { id: 'sleep_study', name: 'Sleep Study', icon: 'neuro' as const },
]

export default function ImagingResultsTab({
  noteData,
  updateNote,
  openVoiceDrawer,
  openAiDrawer,
  openDotPhrases,
  setActiveTextField,
}: ImagingResultsTabProps) {
  // Track which study cards are expanded
  const [expandedStudies, setExpandedStudies] = useState<Set<string>>(new Set(['mri_brain']))

  // Study data state
  const [studyData, setStudyData] = useState<Record<string, Study>>({
    mri_brain: {
      id: 'mri_brain',
      name: 'MRI Brain',
      icon: 'imaging',
      date: '2026-01-05',
      impression: 'Normal',
      findings: 'No acute intracranial abnormality. No evidence of hemorrhage, mass effect, or midline shift.',
      pacsLink: '',
    },
  })

  const toggleStudy = (studyId: string) => {
    setExpandedStudies(prev => {
      const next = new Set(prev)
      if (next.has(studyId)) {
        next.delete(studyId)
      } else {
        next.add(studyId)
      }
      return next
    })
  }

  const updateStudyField = (studyId: string, field: keyof Study, value: string) => {
    setStudyData(prev => ({
      ...prev,
      [studyId]: {
        ...prev[studyId] || {
          id: studyId,
          name: [...IMAGING_STUDIES, ...NEURODIAGNOSTIC_STUDIES].find(s => s.id === studyId)?.name || '',
          icon: [...IMAGING_STUDIES, ...NEURODIAGNOSTIC_STUDIES].find(s => s.id === studyId)?.icon || 'imaging',
          date: '',
          impression: '',
          findings: '',
          pacsLink: '',
        },
        [field]: value,
      },
    }))
  }

  const getStudySummary = (studyId: string) => {
    const study = studyData[studyId]
    if (!study?.date && !study?.impression) return 'Not documented'
    const parts = []
    if (study.date) parts.push(new Date(study.date).toLocaleDateString())
    if (study.impression) parts.push(study.impression)
    return parts.join(' - ')
  }

  const renderStudyCard = (study: { id: string; name: string; icon: 'imaging' | 'neuro' }) => {
    const isExpanded = expandedStudies.has(study.id)
    const data = studyData[study.id]
    const summary = getStudySummary(study.id)
    const hasData = data?.date || data?.impression || data?.findings

    return (
      <div
        key={study.id}
        style={{
          background: 'var(--bg-white)',
          border: isExpanded ? '1px solid var(--primary)' : '1px solid var(--border)',
          borderRadius: '8px',
          marginBottom: '8px',
          overflow: 'hidden',
        }}
      >
        {/* Header - Always visible */}
        <div
          onClick={() => toggleStudy(study.id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            cursor: 'pointer',
            background: isExpanded ? 'rgba(13, 148, 136, 0.04)' : 'transparent',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2">
              {study.icon === 'imaging' ? (
                <><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></>
              ) : (
                <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></>
              )}
            </svg>
            <span style={{ fontWeight: 500, fontSize: '14px', color: 'var(--text-primary)' }}>
              {study.name}
            </span>
            {hasData && (
              <span style={{
                fontSize: '10px',
                padding: '2px 6px',
                borderRadius: '10px',
                background: data?.impression === 'Normal' ? '#D1FAE5' : data?.impression === 'Abnormal' ? '#FEE2E2' : '#E5E7EB',
                color: data?.impression === 'Normal' ? '#059669' : data?.impression === 'Abnormal' ? '#DC2626' : '#6B7280',
              }}>
                {data?.impression || 'Documented'}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {summary}
            </span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--text-muted)"
              strokeWidth="2"
              style={{
                transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s',
              }}
            >
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>
        </div>

        {/* Expanded content */}
        {isExpanded && (
          <div
            style={{
              padding: '16px',
              borderTop: '1px solid var(--border)',
              background: 'var(--bg-gray)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Date and Impression row */}
            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
              <div style={{ flex: '1' }}>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Date
                </label>
                <input
                  type="date"
                  value={data?.date || ''}
                  onChange={(e) => updateStudyField(study.id, 'date', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    fontSize: '14px',
                    background: 'var(--bg-white)',
                  }}
                />
              </div>
              <div style={{ flex: '1' }}>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Impression
                </label>
                <select
                  value={data?.impression || ''}
                  onChange={(e) => updateStudyField(study.id, 'impression', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    fontSize: '14px',
                    background: 'var(--bg-white)',
                  }}
                >
                  <option value="">Select impression...</option>
                  {IMPRESSION_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Findings textarea with action buttons */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Findings
              </label>
              <div style={{ position: 'relative' }}>
                <textarea
                  value={data?.findings || ''}
                  onChange={(e) => updateStudyField(study.id, 'findings', e.target.value)}
                  onFocus={() => setActiveTextField?.(`imaging_${study.id}_findings`)}
                  placeholder="Enter imaging findings..."
                  style={{
                    width: '100%',
                    minHeight: '80px',
                    padding: '10px 12px',
                    paddingRight: '90px',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    fontSize: '14px',
                    resize: 'vertical',
                    fontFamily: 'inherit',
                    background: 'var(--bg-white)',
                  }}
                />
                {/* Action buttons */}
                <div style={{
                  position: 'absolute',
                  top: '8px',
                  right: '8px',
                  display: 'flex',
                  gap: '4px',
                }}>
                  {/* Mic button */}
                  <button
                    onClick={() => openVoiceDrawer?.('document')}
                    title="Dictate"
                    style={{
                      width: '24px',
                      height: '24px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '4px',
                      border: 'none',
                      background: '#FEE2E2',
                      color: '#EF4444',
                      cursor: 'pointer',
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
                      <path d="M19 10v2a7 7 0 01-14 0v-2"/>
                    </svg>
                  </button>
                  {/* Dot phrase button */}
                  <button
                    onClick={() => openDotPhrases?.(`imaging_${study.id}_findings`)}
                    title="Dot Phrases"
                    style={{
                      width: '24px',
                      height: '24px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '4px',
                      border: 'none',
                      background: '#EDE9FE',
                      color: '#8B5CF6',
                      cursor: 'pointer',
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                    </svg>
                  </button>
                  {/* AI button */}
                  <button
                    onClick={() => openAiDrawer('ask-ai')}
                    title="AI Assist"
                    style={{
                      width: '24px',
                      height: '24px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '4px',
                      border: 'none',
                      background: '#CCFBF1',
                      color: '#0D9488',
                      cursor: 'pointer',
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* PACS Link */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                PACS Link (optional)
              </label>
              <input
                type="url"
                value={data?.pacsLink || ''}
                onChange={(e) => updateStudyField(study.id, 'pacsLink', e.target.value)}
                placeholder="https://pacs.hospital.com/..."
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  background: 'var(--bg-white)',
                }}
              />
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      {/* Imaging Studies Section */}
      <div style={{
        background: 'var(--bg-white)',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '16px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Imaging Studies</span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>(Optional)</span>
          </div>
        </div>

        {IMAGING_STUDIES.map(study => renderStudyCard(study))}

        {/* Add Study Button */}
        <button
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '10px 16px',
            background: 'var(--bg-gray)',
            border: '1px dashed var(--border)',
            borderRadius: '8px',
            color: 'var(--primary)',
            cursor: 'pointer',
            width: '100%',
            justifyContent: 'center',
            marginTop: '8px',
            fontSize: '13px',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add Study
        </button>
      </div>

      {/* Neurodiagnostic Studies Section */}
      <div style={{
        background: 'var(--bg-white)',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '16px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Neurodiagnostic Studies</span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>(Optional)</span>
          </div>
        </div>

        {NEURODIAGNOSTIC_STUDIES.map(study => renderStudyCard(study))}
      </div>

      {/* Lab Results Section */}
      <div style={{
        background: 'var(--bg-white)',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '16px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}>
        <div style={{ marginBottom: '16px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Lab Results</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>(Optional)</span>
        </div>

        {/* Lab results textarea with action buttons */}
        <div style={{ position: 'relative' }}>
          <textarea
            value={noteData.labResults || ''}
            onChange={(e) => updateNote('labResults', e.target.value)}
            onFocus={() => setActiveTextField?.('labResults')}
            placeholder="Enter relevant lab results..."
            style={{
              width: '100%',
              minHeight: '100px',
              padding: '12px',
              paddingRight: '90px',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              fontSize: '14px',
              resize: 'vertical',
              fontFamily: 'inherit',
              background: 'var(--bg-white)',
            }}
          />
          {/* Action buttons */}
          <div style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            display: 'flex',
            gap: '4px',
          }}>
            <button
              onClick={() => openVoiceDrawer?.('document')}
              title="Dictate"
              style={{
                width: '24px',
                height: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '4px',
                border: 'none',
                background: '#FEE2E2',
                color: '#EF4444',
                cursor: 'pointer',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
                <path d="M19 10v2a7 7 0 01-14 0v-2"/>
              </svg>
            </button>
            <button
              onClick={() => openDotPhrases?.('labResults')}
              title="Dot Phrases"
              style={{
                width: '24px',
                height: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '4px',
                border: 'none',
                background: '#EDE9FE',
                color: '#8B5CF6',
                cursor: 'pointer',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
              </svg>
            </button>
            <button
              onClick={() => openAiDrawer('ask-ai')}
              title="AI Assist"
              style={{
                width: '24px',
                height: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '4px',
                border: 'none',
                background: '#CCFBF1',
                color: '#0D9488',
                cursor: 'pointer',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Common lab shortcuts */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
          {['CBC', 'CMP', 'Lipid Panel', 'HbA1c', 'TSH', 'Vitamin B12', 'Vitamin D'].map(lab => (
            <button
              key={lab}
              onClick={() => {
                const current = noteData.labResults || ''
                updateNote('labResults', current ? `${current}\n${lab}: ` : `${lab}: `)
              }}
              style={{
                padding: '6px 12px',
                borderRadius: '16px',
                fontSize: '12px',
                cursor: 'pointer',
                border: '1px solid var(--border)',
                background: 'var(--bg-white)',
                color: 'var(--text-secondary)',
              }}
            >
              + {lab}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
