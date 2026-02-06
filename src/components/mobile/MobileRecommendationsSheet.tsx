'use client'

import { useState, useEffect } from 'react'

interface RecommendationItem {
  item: string
  priority?: string
  dosing?: string | { doseOptions?: Array<{ text: string; orderSentence: string }>; orderSentence?: string }
  rationale?: string
}

interface RecommendationSection {
  [subsection: string]: RecommendationItem[]
}

interface ClinicalPlan {
  id: string
  title: string
  icd10: string[]
  scope?: string
  sections: {
    [section: string]: RecommendationSection
  }
  patientInstructions?: string[]
}

interface MobileRecommendationsSheetProps {
  isOpen: boolean
  onClose: () => void
  diagnosisId: string
  diagnosisName: string
  onAddToPlan: (items: string[]) => void
}

export default function MobileRecommendationsSheet({
  isOpen,
  onClose,
  diagnosisId,
  diagnosisName,
  onAddToPlan,
}: MobileRecommendationsSheetProps) {
  const [plan, setPlan] = useState<ClinicalPlan | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const [added, setAdded] = useState(false)

  useEffect(() => {
    if (isOpen && diagnosisId) {
      fetchPlan()
    }
  }, [isOpen, diagnosisId])

  const fetchPlan = async () => {
    setLoading(true)
    setError(null)
    setPlan(null)
    setSelectedItems(new Set())

    try {
      const response = await fetch(`/api/plans?diagnosisId=${encodeURIComponent(diagnosisId)}`)
      if (!response.ok) {
        throw new Error('No treatment plan available for this diagnosis')
      }
      const data = await response.json()
      if (data.plan) {
        setPlan(data.plan)
        // Auto-expand first section
        if (data.plan.sections) {
          const firstSection = Object.keys(data.plan.sections)[0]
          if (firstSection) {
            setExpandedSections(new Set([firstSection]))
          }
        }
      } else {
        throw new Error('No treatment plan available')
      }
    } catch (err) {
      console.error('Failed to fetch plan:', err)
      setError(err instanceof Error ? err.message : 'Failed to load recommendations')
    } finally {
      setLoading(false)
    }
  }

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections)
    if (newExpanded.has(section)) {
      newExpanded.delete(section)
    } else {
      newExpanded.add(section)
    }
    setExpandedSections(newExpanded)
  }

  const toggleItem = (itemKey: string) => {
    const newSelected = new Set(selectedItems)
    if (newSelected.has(itemKey)) {
      newSelected.delete(itemKey)
    } else {
      newSelected.add(itemKey)
    }
    setSelectedItems(newSelected)
    if ('vibrate' in navigator) navigator.vibrate(20)
  }

  const getItemText = (item: RecommendationItem): string => {
    let text = item.item
    if (item.dosing) {
      if (typeof item.dosing === 'string') {
        text += `: ${item.dosing}`
      } else if (item.dosing.orderSentence) {
        text += `: ${item.dosing.orderSentence}`
      } else if (item.dosing.doseOptions?.[0]) {
        text += `: ${item.dosing.doseOptions[0].orderSentence}`
      }
    }
    return text
  }

  const handleAddToPlan = () => {
    const items = Array.from(selectedItems)
    if (items.length > 0) {
      onAddToPlan(items)
      setAdded(true)
      if ('vibrate' in navigator) navigator.vibrate([100, 50, 100])
      setTimeout(() => {
        setAdded(false)
        onClose()
      }, 1500)
    }
  }

  const getPriorityColor = (priority?: string) => {
    switch (priority?.toUpperCase()) {
      case 'STAT': return '#EF4444'
      case 'URGENT': return '#F59E0B'
      case 'ROUTINE': return '#3B82F6'
      default: return '#6B7280'
    }
  }

  if (!isOpen) return null

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 10000,
    }}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.4)',
        }}
      />

      {/* Sheet */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        maxHeight: '70vh',
        background: 'var(--bg-white, #fff)',
        borderTopLeftRadius: '16px',
        borderTopRightRadius: '16px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'slideUp 0.3s ease-out',
      }}>
        {/* Drag handle */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          padding: '8px',
        }}>
          <div style={{
            width: '36px',
            height: '4px',
            borderRadius: '2px',
            background: 'var(--border, #e5e7eb)',
          }} />
        </div>

        {/* Header */}
        <div style={{
          padding: '8px 16px 12px',
          borderBottom: '1px solid var(--border, #e5e7eb)',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div>
              <div style={{
                fontSize: '16px',
                fontWeight: 600,
                color: 'var(--text-primary, #111827)',
              }}>
                {plan?.title || diagnosisName}
              </div>
              {plan?.icd10?.[0] && (
                <div style={{
                  display: 'inline-block',
                  marginTop: '4px',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: '#0D948815',
                  fontSize: '11px',
                  fontWeight: 500,
                  color: '#0D9488',
                }}>
                  {plan.icd10[0]}
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                padding: '8px',
                cursor: 'pointer',
                color: 'var(--text-muted, #6b7280)',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '12px 16px',
          WebkitOverflowScrolling: 'touch',
        }}>
          {loading && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '40px',
            }}>
              <div style={{
                width: '24px',
                height: '24px',
                border: '2px solid var(--border, #e5e7eb)',
                borderTopColor: '#0D9488',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }} />
            </div>
          )}

          {error && (
            <div style={{
              padding: '20px',
              textAlign: 'center',
              color: 'var(--text-muted, #6b7280)',
            }}>
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                style={{ margin: '0 auto 12px', opacity: 0.5 }}
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              <div style={{ fontSize: '14px' }}>{error}</div>
            </div>
          )}

          {plan?.sections && Object.entries(plan.sections).map(([sectionName, subsections]) => (
            <div key={sectionName} style={{ marginBottom: '12px' }}>
              <button
                onClick={() => toggleSection(sectionName)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  background: 'var(--bg-gray, #f9fafb)',
                  border: '1px solid var(--border, #e5e7eb)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                }}
              >
                <span style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--text-primary, #111827)',
                }}>
                  {sectionName}
                </span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--text-muted, #6b7280)"
                  strokeWidth="2"
                  style={{
                    transform: expandedSections.has(sectionName) ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s',
                  }}
                >
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>

              {expandedSections.has(sectionName) && (
                <div style={{
                  marginTop: '8px',
                  paddingLeft: '8px',
                }}>
                  {Object.entries(subsections as RecommendationSection).map(([subsectionName, items]) => (
                    <div key={subsectionName} style={{ marginBottom: '8px' }}>
                      <div style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: 'var(--text-muted, #6b7280)',
                        marginBottom: '6px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}>
                        {subsectionName}
                      </div>
                      {items.map((item: RecommendationItem, index: number) => {
                        const itemKey = getItemText(item)
                        const isSelected = selectedItems.has(itemKey)
                        return (
                          <button
                            key={index}
                            onClick={() => toggleItem(itemKey)}
                            style={{
                              width: '100%',
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: '10px',
                              padding: '10px',
                              background: isSelected ? '#0D948810' : 'var(--bg-white, #fff)',
                              border: isSelected ? '1px solid #0D9488' : '1px solid var(--border, #e5e7eb)',
                              borderRadius: '8px',
                              marginBottom: '6px',
                              cursor: 'pointer',
                              textAlign: 'left',
                            }}
                          >
                            {/* Checkbox */}
                            <div style={{
                              width: '18px',
                              height: '18px',
                              borderRadius: '4px',
                              border: isSelected ? '2px solid #0D9488' : '2px solid var(--border, #d1d5db)',
                              background: isSelected ? '#0D9488' : 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              marginTop: '1px',
                            }}>
                              {isSelected && (
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                                  <polyline points="20 6 9 17 4 12"/>
                                </svg>
                              )}
                            </div>

                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                flexWrap: 'wrap',
                              }}>
                                <span style={{
                                  fontSize: '13px',
                                  fontWeight: 500,
                                  color: 'var(--text-primary, #111827)',
                                }}>
                                  {item.item}
                                </span>
                                {item.priority && item.priority !== '—' && (
                                  <span style={{
                                    fontSize: '9px',
                                    fontWeight: 600,
                                    padding: '1px 4px',
                                    borderRadius: '3px',
                                    background: `${getPriorityColor(item.priority)}15`,
                                    color: getPriorityColor(item.priority),
                                  }}>
                                    {item.priority}
                                  </span>
                                )}
                              </div>
                              {item.dosing && (
                                <div style={{
                                  fontSize: '12px',
                                  color: 'var(--text-secondary, #4b5563)',
                                  marginTop: '2px',
                                }}>
                                  {typeof item.dosing === 'string'
                                    ? item.dosing
                                    : item.dosing.orderSentence || item.dosing.doseOptions?.[0]?.text}
                                </div>
                              )}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 16px',
          paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
          borderTop: '1px solid var(--border, #e5e7eb)',
          background: 'var(--bg-white, #fff)',
        }}>
          <button
            onClick={handleAddToPlan}
            disabled={selectedItems.size === 0 || added}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '14px',
              borderRadius: '10px',
              border: 'none',
              background: added
                ? 'linear-gradient(135deg, #10B981 0%, #059669 100%)'
                : selectedItems.size === 0
                ? 'var(--text-muted, #9ca3af)'
                : 'linear-gradient(135deg, #0D9488 0%, #14B8A6 100%)',
              color: 'white',
              fontSize: '15px',
              fontWeight: 600,
              cursor: selectedItems.size === 0 ? 'not-allowed' : 'pointer',
              opacity: selectedItems.size === 0 ? 0.5 : 1,
            }}
          >
            {added ? (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Added!
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Add {selectedItems.size > 0 ? `${selectedItems.size} ` : ''}to Plan
              </>
            )}
          </button>
        </div>
      </div>

      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes slideUp {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  )
}
