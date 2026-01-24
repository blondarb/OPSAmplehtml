'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import ScaleForm from './ScaleForm'
import {
  ScaleDefinition,
  ScaleResponses,
  ScoreCalculation,
} from '@/lib/scales/types'
import { getExamScales } from '@/lib/scales/scale-definitions'
import { getSeverityColor } from '@/lib/scales/scoring-engine'

interface ScaleResult {
  id: string
  scale_id: string
  raw_score: number
  interpretation: string
  severity_level: string
  completed_at: string
  responses: ScaleResponses
}

interface ExamScalesSectionProps {
  selectedConditions: string[]
  patientId?: string
  visitId?: string
  onAddToNote?: (field: string, text: string) => void
  onScaleComplete?: (scaleId: string, result: ScoreCalculation) => void
}

interface ScaleState {
  responses: ScaleResponses
  calculation: ScoreCalculation | null
  isExpanded: boolean
  isSaved: boolean
  previousResult?: ScaleResult
}

export default function ExamScalesSection({
  selectedConditions,
  patientId,
  visitId,
  onAddToNote,
  onScaleComplete,
}: ExamScalesSectionProps) {
  const [scaleStates, setScaleStates] = useState<Record<string, ScaleState>>({})
  const [scaleHistory, setScaleHistory] = useState<ScaleResult[]>([])
  const [isSaving, setIsSaving] = useState<string | null>(null)
  const [showInfoTooltip, setShowInfoTooltip] = useState(false)
  const [selectedScaleId, setSelectedScaleId] = useState<string | null>(null)

  // Always show all exam scales
  const allExamScales = useMemo(() => {
    return getExamScales()
  }, [])

  // Fetch scale history
  useEffect(() => {
    if (!patientId) return

    const fetchHistory = async () => {
      try {
        const response = await fetch(`/api/scales?patientId=${patientId}&limit=20`)
        if (response.ok) {
          const data = await response.json()
          setScaleHistory(data.results || [])

          const historyByScale: Record<string, ScaleResult> = {}
          for (const result of data.results || []) {
            if (!historyByScale[result.scale_id]) {
              historyByScale[result.scale_id] = result
            }
          }

          setScaleStates(prev => {
            const updated = { ...prev }
            for (const [scaleId, result] of Object.entries(historyByScale)) {
              updated[scaleId] = {
                ...updated[scaleId],
                responses: updated[scaleId]?.responses || {},
                calculation: updated[scaleId]?.calculation || null,
                isExpanded: updated[scaleId]?.isExpanded ?? false,
                isSaved: updated[scaleId]?.isSaved ?? false,
                previousResult: result,
              }
            }
            return updated
          })
        }
      } catch (error) {
        console.error('Failed to fetch scale history:', error)
      }
    }

    fetchHistory()
  }, [patientId])

  const handleScaleSelect = (scaleId: string) => {
    setSelectedScaleId(selectedScaleId === scaleId ? null : scaleId)
    setScaleStates(prev => ({
      ...prev,
      [scaleId]: {
        ...prev[scaleId],
        responses: prev[scaleId]?.responses || {},
        calculation: prev[scaleId]?.calculation || null,
        isExpanded: selectedScaleId !== scaleId,
        isSaved: prev[scaleId]?.isSaved ?? false,
      },
    }))
  }

  const handleResponsesChange = (
    scaleId: string,
    responses: ScaleResponses,
    calculation: ScoreCalculation
  ) => {
    setScaleStates(prev => ({
      ...prev,
      [scaleId]: {
        ...prev[scaleId],
        responses,
        calculation,
        isExpanded: true,
        isSaved: false,
      },
    }))
  }

  const saveScaleResult = useCallback(async (scaleId: string, state: ScaleState) => {
    if (!patientId || !state.calculation?.isComplete) return

    setIsSaving(scaleId)
    try {
      const response = await fetch('/api/scales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId,
          visitId,
          scaleId,
          responses: state.responses,
          rawScore: state.calculation.rawScore,
          interpretation: state.calculation.interpretation,
          severityLevel: state.calculation.severity,
          grade: state.calculation.grade,
          triggeredAlerts: state.calculation.triggeredAlerts,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setScaleStates(prev => ({
          ...prev,
          [scaleId]: {
            ...prev[scaleId],
            isSaved: true,
            previousResult: data.result,
          },
        }))

        if (onScaleComplete) {
          onScaleComplete(scaleId, state.calculation)
        }
      }
    } catch (error) {
      console.error('Failed to save scale result:', error)
    } finally {
      setIsSaving(null)
    }
  }, [patientId, visitId, onScaleComplete])

  // Auto-save when completed
  useEffect(() => {
    for (const [scaleId, state] of Object.entries(scaleStates)) {
      if (state.calculation?.isComplete && !state.isSaved && patientId) {
        saveScaleResult(scaleId, state)
      }
    }
  }, [scaleStates, patientId, saveScaleResult])

  const handleAddToNote = (text: string) => {
    if (onAddToNote) {
      onAddToNote('examNotes', text)
    }
  }

  const completedCount = useMemo(() => {
    return allExamScales.filter(scale => scaleStates[scale.id]?.calculation?.isComplete).length
  }, [allExamScales, scaleStates])

  // Get scale status for chip display
  const getScaleStatus = (scale: ScaleDefinition) => {
    const state = scaleStates[scale.id]
    if (state?.calculation?.isComplete) {
      return {
        status: 'completed' as const,
        score: state.calculation.rawScore,
        severity: state.calculation.severity,
      }
    }
    if (state?.calculation && state.calculation.answeredQuestions > 0) {
      return { status: 'in_progress' as const }
    }
    return { status: 'not_started' as const }
  }

  return (
    <div style={{
      background: 'var(--bg-white)',
      borderRadius: '12px',
      padding: '16px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      marginBottom: '16px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Exam Scales</span>

          {/* Info icon with tooltip */}
          <div style={{ position: 'relative' }}>
            <button
              onMouseEnter={() => setShowInfoTooltip(true)}
              onMouseLeave={() => setShowInfoTooltip(false)}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '2px',
                cursor: 'pointer',
                color: '#8B5CF6',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 16v-4"/>
                <path d="M12 8h.01"/>
              </svg>
            </button>
            {showInfoTooltip && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                marginTop: '4px',
                padding: '8px 12px',
                background: '#1F2937',
                color: 'white',
                fontSize: '11px',
                borderRadius: '6px',
                whiteSpace: 'nowrap',
                zIndex: 100,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              }}>
                Exam-driven scales can be performed with MA assistance for telemedicine
                <div style={{
                  position: 'absolute',
                  top: '-4px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 0,
                  height: 0,
                  borderLeft: '4px solid transparent',
                  borderRight: '4px solid transparent',
                  borderBottom: '4px solid #1F2937',
                }} />
              </div>
            )}
          </div>

          {completedCount > 0 && (
            <span style={{
              fontSize: '11px',
              color: '#10B981',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {completedCount}/{allExamScales.length}
            </span>
          )}
        </div>
      </div>

      {/* Scale chips - always show all */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        marginBottom: selectedScaleId ? '12px' : 0,
      }}>
        {allExamScales.map(scale => {
          const scaleStatus = getScaleStatus(scale)
          const isSelected = selectedScaleId === scale.id
          const severityColor = scaleStatus.status === 'completed' && scaleStatus.severity
            ? getSeverityColor(scaleStatus.severity)
            : null

          return (
            <button
              key={scale.id}
              onClick={() => handleScaleSelect(scale.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 10px',
                border: isSelected
                  ? '2px solid var(--primary)'
                  : scaleStatus.status === 'completed' && severityColor
                    ? `1px solid ${severityColor}`
                    : '1px solid var(--border)',
                borderRadius: '20px',
                background: isSelected
                  ? 'var(--bg-dark)'
                  : scaleStatus.status === 'completed' && severityColor
                    ? `${severityColor}10`
                    : 'var(--bg-white)',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 500,
                color: scaleStatus.status === 'completed' && severityColor ? severityColor : 'var(--text-primary)',
                transition: 'all 0.15s ease',
              }}
            >
              {/* Status indicator */}
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: scaleStatus.status === 'completed' && severityColor
                  ? severityColor
                  : scaleStatus.status === 'in_progress'
                    ? '#F59E0B'
                    : 'transparent',
                border: scaleStatus.status === 'not_started'
                  ? '1px solid var(--border)'
                  : 'none',
                flexShrink: 0,
              }} />

              <span>{scale.abbreviation}</span>

              {/* Score badge for completed */}
              {scaleStatus.status === 'completed' && scaleStatus.score !== undefined && severityColor && (
                <span style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  padding: '1px 5px',
                  background: severityColor,
                  color: 'white',
                  borderRadius: '8px',
                }}>
                  {scaleStatus.score}
                </span>
              )}

              {/* Saving indicator */}
              {isSaving === scale.id && (
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>...</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Expanded scale form */}
      {selectedScaleId && (
        <div style={{
          border: '1px solid var(--border)',
          borderRadius: '8px',
          overflow: 'hidden',
        }}>
          {allExamScales
            .filter(scale => scale.id === selectedScaleId)
            .map(scale => {
              const state = scaleStates[scale.id]
              return (
                <ScaleForm
                  key={scale.id}
                  scale={scale}
                  initialResponses={state?.responses || {}}
                  isExpanded={true}
                  onToggleExpand={() => setSelectedScaleId(null)}
                  onResponsesChange={(responses, calculation) =>
                    handleResponsesChange(scale.id, responses, calculation)
                  }
                  onAddToNote={handleAddToNote}
                  showAddToNote={true}
                />
              )
            })}
        </div>
      )}
    </div>
  )
}
