'use client'

import { useState, useMemo, useEffect } from 'react'
import {
  getDiagnosesForConsultReason,
  searchDiagnoses,
  DIAGNOSIS_CATEGORIES,
  type Diagnosis,
  type DiagnosisCategory,
} from '@/lib/diagnosisData'

interface DifferentialDiagnosisSectionProps {
  chiefComplaints: string[] // From Reason for Consult
  selectedDiagnoses: Diagnosis[]
  onDiagnosesChange: (diagnoses: Diagnosis[]) => void
}

export default function DifferentialDiagnosisSection({
  chiefComplaints,
  selectedDiagnoses,
  onDiagnosesChange,
}: DifferentialDiagnosisSectionProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [expandedDiagnoses, setExpandedDiagnoses] = useState<Record<string, boolean>>({})
  const [searchCategory, setSearchCategory] = useState<string | null>(null)
  // Track manually removed diagnoses to prevent auto-re-adding
  const [manuallyRemoved, setManuallyRemoved] = useState<Set<string>>(new Set())

  // Auto-populate diagnoses from chief complaints
  const suggestedDiagnoses = useMemo(() => {
    const suggested: Diagnosis[] = []
    const seenIds = new Set<string>()

    for (const complaint of chiefComplaints) {
      const diagnoses = getDiagnosesForConsultReason(complaint)
      for (const d of diagnoses) {
        if (!seenIds.has(d.id)) {
          seenIds.add(d.id)
          suggested.push(d)
        }
      }
    }
    return suggested
  }, [chiefComplaints])

  // Auto-add suggested diagnoses that aren't already selected and haven't been manually removed
  useEffect(() => {
    const currentIds = new Set(selectedDiagnoses.map(d => d.id))
    // Don't re-add diagnoses that were manually removed by the user
    const newDiagnoses = suggestedDiagnoses.filter(d =>
      !currentIds.has(d.id) && !manuallyRemoved.has(d.id)
    )

    if (newDiagnoses.length > 0) {
      onDiagnosesChange([...selectedDiagnoses, ...newDiagnoses])
    }
  }, [suggestedDiagnoses, manuallyRemoved]) // Run when suggested or removed changes

  // Search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return []
    let results = searchDiagnoses(searchQuery)
    if (searchCategory) {
      results = results.filter(d => d.category === searchCategory)
    }
    // Exclude already selected
    const selectedIds = new Set(selectedDiagnoses.map(d => d.id))
    return results.filter(d => !selectedIds.has(d.id)).slice(0, 20)
  }, [searchQuery, searchCategory, selectedDiagnoses])

  const acceptDiagnosis = (diagnosis: Diagnosis) => {
    if (!selectedDiagnoses.find(d => d.id === diagnosis.id)) {
      onDiagnosesChange([...selectedDiagnoses, diagnosis])
    }
  }

  const removeDiagnosis = (diagnosisId: string) => {
    // Track that this diagnosis was manually removed so it won't be auto-added again
    setManuallyRemoved(prev => new Set([...prev, diagnosisId]))
    onDiagnosesChange(selectedDiagnoses.filter(d => d.id !== diagnosisId))
  }

  const toggleExpanded = (diagnosisId: string) => {
    setExpandedDiagnoses(prev => ({
      ...prev,
      [diagnosisId]: !prev[diagnosisId],
    }))
  }

  const refineDiagnosis = (oldDiagnosis: Diagnosis, newDiagnosis: Diagnosis) => {
    onDiagnosesChange(
      selectedDiagnoses.map(d => (d.id === oldDiagnosis.id ? newDiagnosis : d))
    )
    setExpandedDiagnoses(prev => ({ ...prev, [oldDiagnosis.id]: false }))
  }

  return (
    <div style={{ position: 'relative', marginBottom: '16px' }}>
      <span
        style={{
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
        }}
      >
        Required
      </span>
      <div
        style={{
          background: 'var(--bg-white)',
          borderRadius: '12px',
          padding: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: '16px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Differential diagnosis
          </span>
          <span style={{ color: '#EF4444', marginLeft: '2px' }}>*</span>
          {chiefComplaints.length > 0 && (
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Auto-populated from Reason for Consult. Accept, refine, or remove diagnoses.
            </p>
          )}
        </div>

        {/* Selected Diagnoses */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
          {selectedDiagnoses.length === 0 ? (
            <div
              style={{
                padding: '20px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: '13px',
                border: '1px dashed var(--border)',
                borderRadius: '8px',
              }}
            >
              No diagnoses selected. Select a Reason for Consult or add diagnoses below.
            </div>
          ) : (
            selectedDiagnoses.map(diagnosis => (
              <DiagnosisCard
                key={diagnosis.id}
                diagnosis={diagnosis}
                isExpanded={expandedDiagnoses[diagnosis.id] || false}
                onToggleExpand={() => toggleExpanded(diagnosis.id)}
                onRemove={() => removeDiagnosis(diagnosis.id)}
                onRefine={(newDiagnosis) => refineDiagnosis(diagnosis, newDiagnosis)}
              />
            ))
          )}
        </div>

        {/* Add Diagnosis Button / Search */}
        {!showSearch ? (
          <button
            onClick={() => setShowSearch(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 16px',
              border: '1px dashed var(--border)',
              borderRadius: '8px',
              background: 'transparent',
              color: 'var(--text-secondary)',
              fontSize: '13px',
              cursor: 'pointer',
              width: '100%',
              justifyContent: 'center',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add diagnosis
          </button>
        ) : (
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: '8px',
              overflow: 'hidden',
            }}
          >
            {/* Search Input */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search diagnoses by name or ICD-10..."
                autoFocus
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  padding: '8px',
                  fontSize: '14px',
                  background: 'transparent',
                }}
              />
              <button
                onClick={() => {
                  setShowSearch(false)
                  setSearchQuery('')
                  setSearchCategory(null)
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  color: 'var(--text-muted)',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Category Filter */}
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              <button
                onClick={() => setSearchCategory(null)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  border: '1px solid',
                  borderColor: !searchCategory ? 'var(--primary)' : 'var(--border)',
                  background: !searchCategory ? 'rgba(13, 148, 136, 0.1)' : 'transparent',
                  color: !searchCategory ? 'var(--primary)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                All
              </button>
              {DIAGNOSIS_CATEGORIES.slice(0, 8).map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSearchCategory(cat.id)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '12px',
                    fontSize: '11px',
                    border: '1px solid',
                    borderColor: searchCategory === cat.id ? 'var(--primary)' : 'var(--border)',
                    background: searchCategory === cat.id ? 'rgba(13, 148, 136, 0.1)' : 'transparent',
                    color: searchCategory === cat.id ? 'var(--primary)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  {cat.icon} {cat.name}
                </button>
              ))}
            </div>

            {/* Search Results */}
            <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
              {searchQuery.trim() === '' ? (
                <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                  Type to search diagnoses...
                </div>
              ) : searchResults.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                  No matching diagnoses found
                </div>
              ) : (
                searchResults.map(diagnosis => (
                  <button
                    key={diagnosis.id}
                    onClick={() => {
                      acceptDiagnosis(diagnosis)
                      setSearchQuery('')
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      padding: '10px 12px',
                      border: 'none',
                      borderBottom: '1px solid var(--border)',
                      background: 'transparent',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>
                        {diagnosis.name}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {diagnosis.icd10} • {DIAGNOSIS_CATEGORIES.find(c => c.id === diagnosis.category)?.name}
                      </div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Individual diagnosis card component
interface DiagnosisCardProps {
  diagnosis: Diagnosis
  isExpanded: boolean
  onToggleExpand: () => void
  onRemove: () => void
  onRefine: (newDiagnosis: Diagnosis) => void
}

function DiagnosisCard({ diagnosis, isExpanded, onToggleExpand, onRemove, onRefine }: DiagnosisCardProps) {
  const category = DIAGNOSIS_CATEGORIES.find(c => c.id === diagnosis.category)
  const hasAlternates = diagnosis.alternateIcd10 && diagnosis.alternateIcd10.length > 0

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: '8px',
        overflow: 'hidden',
        background: 'var(--bg-secondary)',
      }}
    >
      {/* Main row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '12px',
          gap: '12px',
        }}
      >
        {/* Category icon */}
        <span style={{ fontSize: '20px' }}>{category?.icon || '📋'}</span>

        {/* Diagnosis info */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
              {diagnosis.name}
            </span>
            {diagnosis.hasSmartPlan && (
              <span
                style={{
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontSize: '10px',
                  fontWeight: 600,
                  background: 'rgba(13, 148, 136, 0.1)',
                  color: 'var(--primary)',
                }}
              >
                Smart Plan
              </span>
            )}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            ICD-10: {diagnosis.icd10}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {hasAlternates && (
            <button
              onClick={onToggleExpand}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                background: 'var(--bg-white)',
                color: 'var(--text-secondary)',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Refine
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
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          )}
          <button
            onClick={onRemove}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: 'var(--bg-white)',
              color: 'var(--text-muted)',
              cursor: 'pointer',
            }}
            title="Remove diagnosis"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Expanded refinement options */}
      {isExpanded && hasAlternates && (
        <div
          style={{
            borderTop: '1px solid var(--border)',
            padding: '12px',
            background: 'var(--bg-white)',
          }}
        >
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
            Select a more specific diagnosis:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {diagnosis.alternateIcd10?.map(alt => (
              <button
                key={alt.code}
                onClick={() =>
                  onRefine({
                    ...diagnosis,
                    icd10: alt.code,
                    name: alt.description,
                  })
                }
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: diagnosis.icd10 === alt.code ? 'rgba(13, 148, 136, 0.1)' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span
                  style={{
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    border: '2px solid',
                    borderColor: diagnosis.icd10 === alt.code ? 'var(--primary)' : 'var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {diagnosis.icd10 === alt.code && (
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: 'var(--primary)',
                      }}
                    />
                  )}
                </span>
                <div>
                  <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{alt.description}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{alt.code}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
