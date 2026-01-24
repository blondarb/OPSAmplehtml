'use client'

import { useState, useEffect } from 'react'
import {
  OUTPATIENT_PLANS,
  getAllPlanTitles,
  type ClinicalPlan,
  type RecommendationItem,
  type DifferentialDiagnosis,
  type EvidenceEntry,
  type MonitoringEntry,
} from '@/lib/recommendationPlans'

interface SmartRecommendationsSectionProps {
  onAddToPlan: (items: string[]) => void
}

// Priority badge colors
const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  'STAT': { bg: '#FEE2E2', text: '#DC2626' },
  'URGENT': { bg: '#FEF3C7', text: '#D97706' },
  'ROUTINE': { bg: '#DBEAFE', text: '#2563EB' },
  'EXT': { bg: '#E5E7EB', text: '#6B7280' },
  '✓': { bg: '#D1FAE5', text: '#059669' },
  '—': { bg: '#F3F4F6', text: '#9CA3AF' },
}

export default function SmartRecommendationsSection({
  onAddToPlan,
}: SmartRecommendationsSectionProps) {
  const [selectedDiagnosis, setSelectedDiagnosis] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})
  const [expandedSubsections, setExpandedSubsections] = useState<Record<string, boolean>>({})
  const [selectedItems, setSelectedItems] = useState<Map<string, Set<string>>>(new Map())
  const [showPlanBuilder, setShowPlanBuilder] = useState(false)
  const [activeReferenceTab, setActiveReferenceTab] = useState<'differential' | 'evidence' | 'monitoring' | null>(null)

  const planTitles = getAllPlanTitles()
  const currentPlan = selectedDiagnosis ? OUTPATIENT_PLANS[selectedDiagnosis] : null

  // Reset selections when diagnosis changes
  useEffect(() => {
    setExpandedSections({})
    setExpandedSubsections({})
    setSelectedItems(new Map())
    setActiveReferenceTab(null)
  }, [selectedDiagnosis])

  const toggleSection = (sectionName: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionName]: !prev[sectionName],
    }))
  }

  const toggleSubsection = (key: string) => {
    setExpandedSubsections(prev => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const toggleItem = (sectionKey: string, itemText: string) => {
    setSelectedItems(prev => {
      const newMap = new Map(prev)
      const sectionItems = newMap.get(sectionKey) || new Set()

      if (sectionItems.has(itemText)) {
        sectionItems.delete(itemText)
      } else {
        sectionItems.add(itemText)
      }

      newMap.set(sectionKey, sectionItems)
      return newMap
    })
  }

  const isItemSelected = (sectionKey: string, itemText: string): boolean => {
    return selectedItems.get(sectionKey)?.has(itemText) || false
  }

  const getTotalSelectedCount = (): number => {
    let count = 0
    selectedItems.forEach(set => {
      count += set.size
    })
    return count
  }

  const handleAddSelectedToPlan = () => {
    const allSelected: string[] = []

    selectedItems.forEach((items, sectionKey) => {
      items.forEach(item => {
        // Format the item with section context
        allSelected.push(`• ${item}`)
      })
    })

    if (allSelected.length > 0) {
      onAddToPlan(allSelected)
      // Clear selections after adding
      setSelectedItems(new Map())
    }
  }

  const renderPriorityBadge = (priority: string) => {
    const colors = PRIORITY_COLORS[priority] || PRIORITY_COLORS['—']
    if (priority === '—') return null

    return (
      <span
        style={{
          padding: '2px 6px',
          borderRadius: '4px',
          fontSize: '10px',
          fontWeight: 600,
          background: colors.bg,
          color: colors.text,
          marginLeft: '8px',
          flexShrink: 0,
        }}
      >
        {priority}
      </span>
    )
  }

  const renderRecommendationItem = (
    item: RecommendationItem,
    sectionKey: string,
    index: number
  ) => {
    if (item.priority === '—') return null

    const isSelected = isItemSelected(sectionKey, item.item)
    const hasDetails = item.dosing || item.rationale || item.monitoring || item.contraindications || item.timing || item.target || item.indication

    return (
      <div
        key={`${sectionKey}-${index}`}
        style={{
          padding: '10px 12px',
          borderRadius: '6px',
          border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
          background: isSelected ? 'rgba(13, 148, 136, 0.05)' : 'var(--bg-white)',
          marginBottom: '8px',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
        onClick={() => toggleItem(sectionKey, item.item)}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          {/* Checkbox */}
          <div
            style={{
              width: '18px',
              height: '18px',
              borderRadius: '4px',
              border: `2px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
              background: isSelected ? 'var(--primary)' : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              marginTop: '2px',
            }}
          >
            {isSelected && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </div>

          {/* Content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
              <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                {item.item}
              </span>
              {renderPriorityBadge(item.priority)}
            </div>

            {/* Details (shown when selected or on hover) */}
            {hasDetails && (
              <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                {item.dosing && (
                  <div style={{ marginBottom: '4px' }}>
                    <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Dosing: </span>
                    {item.dosing}
                  </div>
                )}
                {item.rationale && (
                  <div style={{ marginBottom: '4px' }}>
                    <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Rationale: </span>
                    {item.rationale}
                  </div>
                )}
                {item.indication && (
                  <div style={{ marginBottom: '4px' }}>
                    <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Indication: </span>
                    {item.indication}
                  </div>
                )}
                {item.timing && (
                  <div style={{ marginBottom: '4px' }}>
                    <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Timing: </span>
                    {item.timing}
                  </div>
                )}
                {item.target && (
                  <div style={{ marginBottom: '4px' }}>
                    <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Target: </span>
                    {item.target}
                  </div>
                )}
                {item.monitoring && (
                  <div style={{ marginBottom: '4px' }}>
                    <span style={{ fontWeight: 500, color: '#2563EB' }}>Monitoring: </span>
                    {item.monitoring}
                  </div>
                )}
                {item.contraindications && (
                  <div style={{ color: '#DC2626' }}>
                    <span style={{ fontWeight: 500 }}>Contraindications: </span>
                    {item.contraindications}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      background: 'var(--bg-white)',
      borderRadius: '12px',
      padding: '20px',
      marginBottom: '16px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
            <rect x="9" y="3" width="6" height="4" rx="1" />
            <path d="M9 12h6" />
            <path d="M9 16h6" />
          </svg>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Smart Recommendations
          </span>
          <span style={{
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '10px',
            fontWeight: 500,
            background: 'linear-gradient(135deg, #8B5CF6 0%, #A78BFA 100%)',
            color: 'white',
          }}>
            AI-Powered
          </span>
        </div>
        {getTotalSelectedCount() > 0 && (
          <button
            onClick={handleAddSelectedToPlan}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--primary)',
              color: 'white',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add {getTotalSelectedCount()} to Plan
          </button>
        )}
      </div>

      {/* Sample Diagnoses Buttons */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
          Select a diagnosis to view evidence-based recommendations:
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {planTitles.map(title => (
            <button
              key={title}
              onClick={() => {
                setSelectedDiagnosis(selectedDiagnosis === title ? null : title)
                setShowPlanBuilder(true)
              }}
              style={{
                padding: '8px 14px',
                borderRadius: '20px',
                fontSize: '13px',
                cursor: 'pointer',
                border: '1px solid',
                borderColor: selectedDiagnosis === title ? 'var(--primary)' : 'var(--border)',
                background: selectedDiagnosis === title ? 'var(--primary)' : 'var(--bg-white)',
                color: selectedDiagnosis === title ? 'white' : 'var(--text-secondary)',
                fontWeight: selectedDiagnosis === title ? 500 : 400,
                transition: 'all 0.15s ease',
              }}
            >
              {title}
            </button>
          ))}
        </div>
      </div>

      {/* Plan Builder */}
      {currentPlan && showPlanBuilder && (
        <div style={{
          border: '1px solid var(--border)',
          borderRadius: '8px',
          overflow: 'hidden',
        }}>
          {/* Plan Header */}
          <div style={{
            padding: '16px',
            background: 'linear-gradient(135deg, #0D9488 0%, #14B8A6 100%)',
            color: 'white',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>{currentPlan.title}</h3>
                <div style={{ fontSize: '12px', opacity: 0.9, marginTop: '4px' }}>
                  ICD-10: {currentPlan.icd10.join(', ')}
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedDiagnosis(null)
                  setShowPlanBuilder(false)
                }}
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px',
                  cursor: 'pointer',
                  color: 'white',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div style={{ fontSize: '13px', marginTop: '8px', opacity: 0.9 }}>
              {currentPlan.scope}
            </div>
          </div>

          {/* Clinical Notes */}
          {currentPlan.notes.length > 0 && (
            <div style={{
              padding: '12px 16px',
              background: '#FEF3C7',
              borderBottom: '1px solid var(--border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" style={{ flexShrink: 0, marginTop: '2px' }}>
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4M12 8h.01" />
                </svg>
                <div style={{ fontSize: '12px', color: '#92400E' }}>
                  <strong>Clinical Pearls:</strong>
                  <ul style={{ margin: '4px 0 0 0', paddingLeft: '16px' }}>
                    {currentPlan.notes.map((note, i) => (
                      <li key={i} style={{ marginBottom: '2px' }}>{note}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Reference Icons Row */}
          {(currentPlan.differential || currentPlan.evidence || currentPlan.monitoring) && (
            <div style={{
              padding: '8px 16px',
              background: 'var(--bg-gray)',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              gap: '8px',
              alignItems: 'center',
            }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginRight: '4px' }}>References:</span>

              {/* Differential Diagnosis */}
              {currentPlan.differential && currentPlan.differential.length > 0 && (
                <button
                  onClick={() => setActiveReferenceTab(activeReferenceTab === 'differential' ? null : 'differential')}
                  title="Differential Diagnosis"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 10px',
                    borderRadius: '16px',
                    fontSize: '11px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    border: 'none',
                    background: activeReferenceTab === 'differential' ? '#DBEAFE' : 'var(--bg-white)',
                    color: activeReferenceTab === 'differential' ? '#2563EB' : 'var(--text-secondary)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
                    <rect x="8" y="2" width="8" height="4" rx="1" />
                    <path d="M9 14l2 2 4-4" />
                  </svg>
                  DDx ({currentPlan.differential.length})
                </button>
              )}

              {/* Evidence */}
              {currentPlan.evidence && currentPlan.evidence.length > 0 && (
                <button
                  onClick={() => setActiveReferenceTab(activeReferenceTab === 'evidence' ? null : 'evidence')}
                  title="Evidence & Guidelines"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 10px',
                    borderRadius: '16px',
                    fontSize: '11px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    border: 'none',
                    background: activeReferenceTab === 'evidence' ? '#D1FAE5' : 'var(--bg-white)',
                    color: activeReferenceTab === 'evidence' ? '#059669' : 'var(--text-secondary)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
                    <path d="M8 7h8M8 11h8M8 15h4" />
                  </svg>
                  Evidence ({currentPlan.evidence.length})
                </button>
              )}

              {/* Monitoring */}
              {currentPlan.monitoring && currentPlan.monitoring.length > 0 && (
                <button
                  onClick={() => setActiveReferenceTab(activeReferenceTab === 'monitoring' ? null : 'monitoring')}
                  title="Monitoring Parameters"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 10px',
                    borderRadius: '16px',
                    fontSize: '11px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    border: 'none',
                    background: activeReferenceTab === 'monitoring' ? '#FEE2E2' : 'var(--bg-white)',
                    color: activeReferenceTab === 'monitoring' ? '#DC2626' : 'var(--text-secondary)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                  </svg>
                  Monitor ({currentPlan.monitoring.length})
                </button>
              )}
            </div>
          )}

          {/* Reference Content Panels */}
          {activeReferenceTab && (
            <div style={{
              padding: '12px 16px',
              background: 'var(--bg-white)',
              borderBottom: '1px solid var(--border)',
              maxHeight: '250px',
              overflowY: 'auto',
            }}>
              {/* Differential Diagnosis Panel */}
              {activeReferenceTab === 'differential' && currentPlan.differential && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2">
                      <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
                      <rect x="8" y="2" width="8" height="4" rx="1" />
                      <path d="M9 14l2 2 4-4" />
                    </svg>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#2563EB' }}>Differential Diagnosis</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {currentPlan.differential.map((ddx, index) => (
                      <div key={index} style={{
                        padding: '10px 12px',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-gray)',
                      }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                          {ddx.diagnosis}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 500 }}>Features: </span>{ddx.features}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          <span style={{ fontWeight: 500 }}>Tests: </span>{ddx.tests}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Evidence Panel */}
              {activeReferenceTab === 'evidence' && currentPlan.evidence && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2">
                      <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
                      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
                      <path d="M8 7h8M8 11h8M8 15h4" />
                    </svg>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#059669' }}>Evidence & Guidelines</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {currentPlan.evidence.map((ev, index) => (
                      <div key={index} style={{
                        padding: '10px 12px',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-gray)',
                      }}>
                        <div style={{ fontSize: '12px', color: 'var(--text-primary)', marginBottom: '6px' }}>
                          {ev.recommendation}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            fontWeight: 600,
                            background: '#D1FAE5',
                            color: '#059669',
                          }}>
                            {ev.evidenceLevel}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {ev.source}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Monitoring Panel */}
              {activeReferenceTab === 'monitoring' && currentPlan.monitoring && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2">
                      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                    </svg>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#DC2626' }}>Monitoring Parameters</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {currentPlan.monitoring.map((mon, index) => (
                      <div key={index} style={{
                        padding: '10px 12px',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-gray)',
                      }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                          {mon.item}
                        </div>
                        <div style={{ display: 'flex', gap: '16px', fontSize: '12px' }}>
                          <div>
                            <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Frequency: </span>
                            <span style={{ color: 'var(--text-muted)' }}>{mon.frequency}</span>
                          </div>
                          <div>
                            <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Action: </span>
                            <span style={{ color: 'var(--text-muted)' }}>{mon.action}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sections */}
          <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
            {Object.entries(currentPlan.sections).map(([sectionName, subsections]) => (
              <div key={sectionName} style={{ borderBottom: '1px solid var(--border)' }}>
                {/* Section Header */}
                <button
                  onClick={() => toggleSection(sectionName)}
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: expandedSections[sectionName] ? 'var(--bg-gray)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: 'var(--primary)',
                    }} />
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {sectionName}
                    </span>
                  </div>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{
                      transform: expandedSections[sectionName] ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {/* Section Content */}
                {expandedSections[sectionName] && (
                  <div style={{ padding: '0 16px 16px' }}>
                    {Object.entries(subsections).map(([subsectionName, items]) => {
                      const subsectionKey = `${sectionName}-${subsectionName}`
                      const hasValidItems = items.some(item => item.priority !== '—')

                      if (!hasValidItems) return null

                      return (
                        <div key={subsectionKey} style={{ marginBottom: '12px' }}>
                          {/* Subsection Header */}
                          <button
                            onClick={() => toggleSubsection(subsectionKey)}
                            style={{
                              width: '100%',
                              padding: '10px 12px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              background: 'var(--bg-dark)',
                              border: '1px solid var(--border)',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              textAlign: 'left',
                              marginBottom: expandedSubsections[subsectionKey] ? '8px' : '0',
                            }}
                          >
                            <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                              {subsectionName}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{
                                fontSize: '11px',
                                color: 'var(--text-muted)',
                                background: 'var(--bg-white)',
                                padding: '2px 6px',
                                borderRadius: '4px',
                              }}>
                                {items.filter(i => i.priority !== '—').length} items
                              </span>
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                style={{
                                  transform: expandedSubsections[subsectionKey] ? 'rotate(180deg)' : 'rotate(0deg)',
                                  transition: 'transform 0.2s',
                                  color: 'var(--text-muted)',
                                }}
                              >
                                <polyline points="6 9 12 15 18 9" />
                              </svg>
                            </div>
                          </button>

                          {/* Items */}
                          {expandedSubsections[subsectionKey] && (
                            <div style={{ paddingLeft: '8px' }}>
                              {items.map((item, index) =>
                                renderRecommendationItem(item, subsectionKey, index)
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}

            {/* Patient Instructions Section */}
            {currentPlan.patientInstructions.length > 0 && (
              <div style={{ borderBottom: '1px solid var(--border)' }}>
                <button
                  onClick={() => toggleSection('Patient Instructions')}
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: expandedSections['Patient Instructions'] ? 'var(--bg-gray)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: '#8B5CF6',
                    }} />
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      Patient Instructions
                    </span>
                  </div>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{
                      transform: expandedSections['Patient Instructions'] ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {expandedSections['Patient Instructions'] && (
                  <div style={{ padding: '0 16px 16px' }}>
                    {currentPlan.patientInstructions.map((instruction, index) => {
                      const isSelected = isItemSelected('patient-instructions', instruction)
                      return (
                        <div
                          key={index}
                          onClick={() => toggleItem('patient-instructions', instruction)}
                          style={{
                            padding: '10px 12px',
                            borderRadius: '6px',
                            border: `1px solid ${isSelected ? '#8B5CF6' : 'var(--border)'}`,
                            background: isSelected ? 'rgba(139, 92, 246, 0.05)' : 'var(--bg-white)',
                            marginBottom: '8px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '10px',
                          }}
                        >
                          <div
                            style={{
                              width: '18px',
                              height: '18px',
                              borderRadius: '4px',
                              border: `2px solid ${isSelected ? '#8B5CF6' : 'var(--border)'}`,
                              background: isSelected ? '#8B5CF6' : 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              marginTop: '2px',
                            }}
                          >
                            {isSelected && (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </div>
                          <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                            {instruction}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer with selection summary */}
          {getTotalSelectedCount() > 0 && (
            <div style={{
              padding: '12px 16px',
              background: 'var(--bg-gray)',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                {getTotalSelectedCount()} item{getTotalSelectedCount() !== 1 ? 's' : ''} selected
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setSelectedItems(new Map())}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-white)',
                    color: 'var(--text-secondary)',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Clear
                </button>
                <button
                  onClick={handleAddSelectedToPlan}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    background: 'var(--primary)',
                    color: 'white',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Add to Plan
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state when no diagnosis selected */}
      {!selectedDiagnosis && (
        <div style={{
          padding: '32px',
          textAlign: 'center',
          color: 'var(--text-muted)',
          background: 'var(--bg-gray)',
          borderRadius: '8px',
        }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: '0 auto 12px', opacity: 0.5 }}>
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
            <rect x="9" y="3" width="6" height="4" rx="1" />
            <path d="M9 12h6" />
            <path d="M9 16h6" />
          </svg>
          <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>
            Select a Diagnosis
          </div>
          <div style={{ fontSize: '13px' }}>
            Choose a diagnosis above to view evidence-based treatment recommendations
          </div>
        </div>
      )}
    </div>
  )
}
