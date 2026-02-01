'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import NoteTextField from './NoteTextField'

export interface StudyEntry {
  entryId: string
  studyType: string
  date: string
  impression: string
  findings: string
  pacsLink: string
}

interface PriorStudy {
  date: string
  impression: string
  findings: string
  studyType: string
  visitDate?: string
}

interface ImagingResultsTabProps {
  noteData: any
  updateNote: (field: string, value: any) => void
  openVoiceDrawer?: (tab: string) => void
  openAiDrawer: (tab: string) => void
  openDotPhrases?: (field: string) => void
  setActiveTextField?: (field: string | null) => void
  priorImagingStudies?: PriorStudy[]
  onImagingChange?: (entries: StudyEntry[]) => void
}

const IMPRESSION_OPTIONS = ['Normal', 'Abnormal', 'Unchanged', 'Pending', 'Not available']

const ALL_STUDY_TYPES = [
  { id: 'mri_brain', name: 'MRI Brain', icon: 'imaging' as const, section: 'imaging' },
  { id: 'ct_head', name: 'CT Head', icon: 'imaging' as const, section: 'imaging' },
  { id: 'cta_head_neck', name: 'CTA Head & Neck', icon: 'imaging' as const, section: 'imaging' },
  { id: 'mra_head', name: 'MRA Head', icon: 'imaging' as const, section: 'imaging' },
  { id: 'mri_spine', name: 'MRI Spine', icon: 'imaging' as const, section: 'imaging' },
  { id: 'eeg', name: 'EEG', icon: 'neuro' as const, section: 'neuro' },
  { id: 'emg_ncs', name: 'EMG/NCS', icon: 'neuro' as const, section: 'neuro' },
  { id: 'vep', name: 'VEP', icon: 'neuro' as const, section: 'neuro' },
  { id: 'sleep_study', name: 'Sleep Study', icon: 'neuro' as const, section: 'neuro' },
]

const IMAGING_TYPE_IDS = ALL_STUDY_TYPES.filter(s => s.section === 'imaging').map(s => s.id)
const NEURO_TYPE_IDS = ALL_STUDY_TYPES.filter(s => s.section === 'neuro').map(s => s.id)

function getStudyTypeName(typeId: string): string {
  return ALL_STUDY_TYPES.find(s => s.id === typeId)?.name || typeId
}

function getStudyTypeIcon(typeId: string): 'imaging' | 'neuro' {
  return ALL_STUDY_TYPES.find(s => s.id === typeId)?.icon || 'imaging'
}

let entryCounter = 1

export default function ImagingResultsTab({
  noteData,
  updateNote,
  openVoiceDrawer,
  openAiDrawer,
  openDotPhrases,
  setActiveTextField,
  priorImagingStudies = [],
  onImagingChange,
}: ImagingResultsTabProps) {
  // Track which entry cards are expanded
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set(['mri_brain_0']))

  // Study entries — array-based, supports multiple per type
  const [studyEntries, setStudyEntries] = useState<StudyEntry[]>([
    {
      entryId: 'mri_brain_0',
      studyType: 'mri_brain',
      date: '2026-01-05',
      impression: 'Normal',
      findings: 'No acute intracranial abnormality. No evidence of hemorrhage, mass effect, or midline shift.',
      pacsLink: '',
    },
  ])

  // Add Study dropdown state
  const [showAddDropdown, setShowAddDropdown] = useState<'imaging' | 'neuro' | null>(null)
  const addDropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!showAddDropdown) return
    const handleClick = (e: MouseEvent) => {
      if (addDropdownRef.current && !addDropdownRef.current.contains(e.target as Node)) {
        setShowAddDropdown(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showAddDropdown])

  // Notify parent of changes
  useEffect(() => {
    onImagingChange?.(studyEntries)
  }, [studyEntries]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleEntry = (entryId: string) => {
    setExpandedEntries(prev => {
      const next = new Set(prev)
      if (next.has(entryId)) {
        next.delete(entryId)
      } else {
        next.add(entryId)
      }
      return next
    })
  }

  const addStudyEntry = useCallback((studyType: string) => {
    const newId = `${studyType}_${entryCounter++}`
    const newEntry: StudyEntry = {
      entryId: newId,
      studyType,
      date: '',
      impression: '',
      findings: '',
      pacsLink: '',
    }
    setStudyEntries(prev => [...prev, newEntry])
    setExpandedEntries(prev => new Set(prev).add(newId))
    setShowAddDropdown(null)
  }, [])

  const removeStudyEntry = useCallback((entryId: string) => {
    setStudyEntries(prev => prev.filter(e => e.entryId !== entryId))
    setExpandedEntries(prev => {
      const next = new Set(prev)
      next.delete(entryId)
      return next
    })
  }, [])

  const updateEntryField = useCallback((entryId: string, field: keyof StudyEntry, value: string) => {
    setStudyEntries(prev => prev.map(e =>
      e.entryId === entryId ? { ...e, [field]: value } : e
    ))
  }, [])

  const getEntrySummary = (entry: StudyEntry) => {
    if (!entry.date && !entry.impression) return 'Not documented'
    const parts = []
    if (entry.date) parts.push(new Date(entry.date).toLocaleDateString())
    if (entry.impression) parts.push(entry.impression)
    return parts.join(' - ')
  }

  // Get entries for a given study type, in order
  const getEntriesForType = (typeId: string) => studyEntries.filter(e => e.studyType === typeId)

  // Get display label for an entry (with numbering when multiple of same type)
  const getEntryLabel = (entry: StudyEntry) => {
    const siblings = getEntriesForType(entry.studyType)
    const name = getStudyTypeName(entry.studyType)
    if (siblings.length <= 1) return name
    const idx = siblings.indexOf(entry) + 1
    return `${name} #${idx}`
  }

  // Get prior studies for a given type
  const getPriorStudiesForType = (typeId: string) =>
    priorImagingStudies.filter(s => s.studyType === typeId)

  const renderPriorCard = (prior: PriorStudy, index: number) => {
    const truncatedFindings = prior.findings && prior.findings.length > 120
      ? prior.findings.slice(0, 120) + '...'
      : prior.findings

    return (
      <div
        key={`prior-${prior.studyType}-${index}`}
        style={{
          background: 'var(--bg-gray)',
          border: '1px solid var(--border)',
          borderRadius: '6px',
          padding: '10px 14px',
          marginBottom: '6px',
          opacity: 0.8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>Prior</span>
          {prior.date && (
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {new Date(prior.date).toLocaleDateString()}
            </span>
          )}
          {prior.impression && (
            <span style={{
              fontSize: '10px',
              padding: '1px 6px',
              borderRadius: '10px',
              background: prior.impression === 'Normal' ? '#D1FAE5' : prior.impression === 'Abnormal' ? '#FEE2E2' : '#E5E7EB',
              color: prior.impression === 'Normal' ? '#059669' : prior.impression === 'Abnormal' ? '#DC2626' : '#6B7280',
            }}>
              {prior.impression}
            </span>
          )}
          {prior.visitDate && (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
              Visit: {new Date(prior.visitDate).toLocaleDateString()}
            </span>
          )}
        </div>
        {truncatedFindings && (
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            {truncatedFindings}
          </p>
        )}
      </div>
    )
  }

  const renderEntryCard = (entry: StudyEntry) => {
    const isExpanded = expandedEntries.has(entry.entryId)
    const hasData = entry.date || entry.impression || entry.findings
    const summary = getEntrySummary(entry)
    const icon = getStudyTypeIcon(entry.studyType)
    const label = getEntryLabel(entry)

    return (
      <div
        key={entry.entryId}
        style={{
          background: 'var(--bg-white)',
          border: isExpanded ? '1px solid var(--primary)' : '1px solid var(--border)',
          borderRadius: '8px',
          marginBottom: '8px',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          onClick={() => toggleEntry(entry.entryId)}
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
              {icon === 'imaging' ? (
                <><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></>
              ) : (
                <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></>
              )}
            </svg>
            <span style={{ fontWeight: 500, fontSize: '14px', color: 'var(--text-primary)' }}>
              {label}
            </span>
            {hasData && (
              <span style={{
                fontSize: '10px',
                padding: '2px 6px',
                borderRadius: '10px',
                background: entry.impression === 'Normal' ? '#D1FAE5' : entry.impression === 'Abnormal' ? '#FEE2E2' : '#E5E7EB',
                color: entry.impression === 'Normal' ? '#059669' : entry.impression === 'Abnormal' ? '#DC2626' : '#6B7280',
              }}>
                {entry.impression || 'Documented'}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {summary}
            </span>
            {/* Remove button (not for the last entry of a type rendered from defaults) */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                removeStudyEntry(entry.entryId)
              }}
              title="Remove study"
              style={{
                width: '20px',
                height: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '4px',
                border: 'none',
                background: 'transparent',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
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
                flexShrink: 0,
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
            {/* Prior results for this type */}
            {getPriorStudiesForType(entry.studyType).length > 0 && (
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Prior Results
                </div>
                {getPriorStudiesForType(entry.studyType).map((prior, i) => renderPriorCard(prior, i))}
              </div>
            )}

            {/* Date and Impression row */}
            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
              <div style={{ flex: '1' }}>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Date
                </label>
                <input
                  type="date"
                  value={entry.date}
                  onChange={(e) => updateEntryField(entry.entryId, 'date', e.target.value)}
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
                  value={entry.impression}
                  onChange={(e) => updateEntryField(entry.entryId, 'impression', e.target.value)}
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
                  value={entry.findings}
                  onChange={(e) => updateEntryField(entry.entryId, 'findings', e.target.value)}
                  onFocus={() => setActiveTextField?.(`imaging_${entry.entryId}_findings`)}
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
                    onClick={() => openDotPhrases?.(`imaging_${entry.entryId}_findings`)}
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
                      background: '#FEF3C7',
                      color: '#F59E0B',
                      cursor: 'pointer',
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 1L13.5 9.5L22 12L13.5 14.5L12 23L10.5 14.5L2 12L10.5 9.5L12 1Z"/>
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
                value={entry.pacsLink}
                onChange={(e) => updateEntryField(entry.entryId, 'pacsLink', e.target.value)}
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

  const renderAddStudyButton = (section: 'imaging' | 'neuro') => {
    const typeIds = section === 'imaging' ? IMAGING_TYPE_IDS : NEURO_TYPE_IDS
    const types = ALL_STUDY_TYPES.filter(s => typeIds.includes(s.id))

    return (
      <div style={{ position: 'relative' }} ref={showAddDropdown === section ? addDropdownRef : undefined}>
        <button
          onClick={() => setShowAddDropdown(showAddDropdown === section ? null : section)}
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

        {showAddDropdown === section && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: '4px',
            background: 'var(--bg-white)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            zIndex: 10,
            overflow: 'hidden',
          }}>
            {types.map(type => (
              <button
                key={type.id}
                onClick={() => addStudyEntry(type.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '10px 14px',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: 'var(--text-primary)',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-gray)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2">
                  {type.icon === 'imaging' ? (
                    <><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></>
                  ) : (
                    <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></>
                  )}
                </svg>
                {type.name}
                {getEntriesForType(type.id).length > 0 && (
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                    ({getEntriesForType(type.id).length} existing)
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Entries grouped by section
  const imagingEntries = studyEntries.filter(e => IMAGING_TYPE_IDS.includes(e.studyType))
  const neuroEntries = studyEntries.filter(e => NEURO_TYPE_IDS.includes(e.studyType))

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

        {imagingEntries.map(entry => renderEntryCard(entry))}

        {renderAddStudyButton('imaging')}
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

        {neuroEntries.map(entry => renderEntryCard(entry))}

        {renderAddStudyButton('neuro')}
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
                background: '#FEF3C7',
                color: '#F59E0B',
                cursor: 'pointer',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 1L13.5 9.5L22 12L13.5 14.5L12 23L10.5 14.5L2 12L10.5 9.5L12 1Z"/>
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
