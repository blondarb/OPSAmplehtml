'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import ScaleForm from './ScaleForm'
import {
  ScaleDefinition,
  ScaleResponses,
  ScoreCalculation,
} from '@/lib/scales/types'
import { ALL_SCALES, getExamScales, getScalesForCondition, getScaleLocation } from '@/lib/scales/scale-definitions'

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
  const [showAllScales, setShowAllScales] = useState(false)

  // Get exam-driven scales based on selected conditions
  const relevantScales = useMemo(() => {
    if (!selectedConditions || selectedConditions.length === 0) {
      return []
    }

    const scaleMap = new Map<string, ScaleDefinition & { priority: number; isRequired: boolean }>()

    for (const condition of selectedConditions) {
      const scales = getScalesForCondition(condition)
      for (const scale of scales) {
        // Only include exam-driven scales
        if (getScaleLocation(scale.id) === 'exam') {
          const existing = scaleMap.get(scale.id)
          if (!existing || scale.priority < existing.priority) {
            scaleMap.set(scale.id, scale)
          }
        }
      }
    }

    return Array.from(scaleMap.values()).sort((a, b) => a.priority - b.priority)
  }, [selectedConditions])

  // Get all available exam scales (for "show all" mode)
  const allExamScales = useMemo(() => {
    return getExamScales()
  }, [])

  const displayedScales = showAllScales ? allExamScales : relevantScales

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

  const toggleScaleExpanded = (scaleId: string) => {
    setScaleStates(prev => ({
      ...prev,
      [scaleId]: {
        ...prev[scaleId],
        responses: prev[scaleId]?.responses || {},
        calculation: prev[scaleId]?.calculation || null,
        isExpanded: !prev[scaleId]?.isExpanded,
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
        isExpanded: prev[scaleId]?.isExpanded ?? true,
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
    return displayedScales.filter(scale => scaleStates[scale.id]?.calculation?.isComplete).length
  }, [displayedScales, scaleStates])

  return (
    <div style={{
      background: 'var(--bg-white)',
      borderRadius: '12px',
      padding: '20px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      marginBottom: '16px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Exam Scales</span>
          {relevantScales.length > 0 && (
            <span style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '10px',
              background: '#8B5CF6',
              color: 'white',
            }}>
              {relevantScales.length} recommended
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
              {completedCount} completed
            </span>
          )}
          <button
            onClick={() => setShowAllScales(!showAllScales)}
            style={{
              fontSize: '11px',
              color: 'var(--primary)',
              background: showAllScales ? 'var(--primary)' : 'transparent',
              border: '1px solid var(--primary)',
              padding: '4px 8px',
              borderRadius: '4px',
              cursor: 'pointer',
              ...(showAllScales ? { color: 'white' } : {}),
            }}
          >
            {showAllScales ? 'Show Recommended' : 'Show All'}
          </button>
        </div>
      </div>

      {/* Info about MA assistance */}
      <div style={{
        padding: '10px 12px',
        background: '#EDE9FE',
        borderRadius: '6px',
        marginBottom: '12px',
        fontSize: '12px',
        color: '#6D28D9',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 16v-4"/>
          <path d="M12 8h.01"/>
        </svg>
        <span>These exam-driven scales can be performed with MA assistance for telemedicine visits.</span>
      </div>

      {displayedScales.length === 0 ? (
        <div style={{
          padding: '24px',
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: '13px',
          background: 'var(--bg-dark)',
          borderRadius: '8px',
        }}>
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            style={{ margin: '0 auto 8px', opacity: 0.5 }}
          >
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
            <rect x="9" y="3" width="6" height="4" rx="2" />
            <path d="M9 14l2 2 4-4" />
          </svg>
          <p style={{ margin: 0 }}>
            {showAllScales
              ? 'No exam scales available'
              : 'Select a diagnosis to see relevant exam scales, or click "Show All"'}
          </p>
        </div>
      ) : (
        <>
          {/* Scale Forms */}
          {displayedScales.map(scale => {
            const state = scaleStates[scale.id]

            return (
              <div key={scale.id} style={{ position: 'relative' }}>
                {isSaving === scale.id && (
                  <div style={{
                    position: 'absolute',
                    top: '8px',
                    right: '40px',
                    fontSize: '10px',
                    color: 'var(--text-muted)',
                  }}>
                    Saving...
                  </div>
                )}

                <ScaleForm
                  scale={scale}
                  initialResponses={state?.responses || {}}
                  isExpanded={state?.isExpanded ?? false}
                  onToggleExpand={() => toggleScaleExpanded(scale.id)}
                  onResponsesChange={(responses, calculation) =>
                    handleResponsesChange(scale.id, responses, calculation)
                  }
                  onAddToNote={handleAddToNote}
                  showAddToNote={true}
                />
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
