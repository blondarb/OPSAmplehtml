'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import ScaleForm from './ScaleForm'
import {
  ScaleDefinition,
  ScaleResponses,
  ScoreCalculation,
} from '@/lib/scales/types'
import { getScalesForCondition } from '@/lib/scales/scale-definitions'

interface ScaleResult {
  id: string
  scale_id: string
  raw_score: number
  interpretation: string
  severity_level: string
  completed_at: string
  responses: ScaleResponses
}

interface SmartScalesSectionProps {
  selectedConditions: string[]
  patientId?: string
  visitId?: string
  onAddToNote?: (field: string, text: string) => void
  onScaleComplete?: (scaleId: string, result: ScoreCalculation) => void
  // Clinical text for AI autofill (from HPI, notes, dictation)
  clinicalText?: string
  patientContext?: {
    age?: number
    sex?: string
    diagnoses?: string[]
    medications?: string[]
    medicalHistory?: string[]
    allergies?: string[]
    vitalSigns?: {
      bloodPressure?: string
      heartRate?: number
      weight?: number
      height?: number
    }
  }
}

interface ScaleState {
  responses: ScaleResponses
  calculation: ScoreCalculation | null
  isExpanded: boolean
  isSaved: boolean
  previousResult?: ScaleResult
}

export default function SmartScalesSection({
  selectedConditions,
  patientId,
  visitId,
  onAddToNote,
  onScaleComplete,
  clinicalText,
  patientContext,
}: SmartScalesSectionProps) {
  // Track expanded state and responses for each scale
  const [scaleStates, setScaleStates] = useState<Record<string, ScaleState>>({})
  const [scaleHistory, setScaleHistory] = useState<ScaleResult[]>([])
  const [isSaving, setIsSaving] = useState<string | null>(null)

  // Get relevant scales based on selected conditions
  const relevantScales = useMemo(() => {
    if (!selectedConditions || selectedConditions.length === 0) {
      return []
    }

    // Collect all scales from all selected conditions
    const scaleMap = new Map<string, ScaleDefinition & { priority: number; isRequired: boolean }>()

    for (const condition of selectedConditions) {
      const scales = getScalesForCondition(condition)
      for (const scale of scales) {
        // Use lowest priority (most relevant) if scale appears multiple times
        const existing = scaleMap.get(scale.id)
        if (!existing || scale.priority < existing.priority) {
          scaleMap.set(scale.id, scale)
        }
      }
    }

    // Sort by priority and return
    return Array.from(scaleMap.values()).sort((a, b) => a.priority - b.priority)
  }, [selectedConditions])

  // Fetch scale history for the patient
  useEffect(() => {
    if (!patientId) return

    const fetchHistory = async () => {
      try {
        const response = await fetch(`/api/scales?patientId=${patientId}&limit=20`)
        if (response.ok) {
          const data = await response.json()
          setScaleHistory(data.results || [])

          // Update scale states with previous results
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
        isSaved: false, // Mark as unsaved when responses change
      },
    }))
  }

  // Save scale result to database
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

        // Notify parent
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

  // Auto-save when a scale is completed
  useEffect(() => {
    for (const [scaleId, state] of Object.entries(scaleStates)) {
      if (state.calculation?.isComplete && !state.isSaved && patientId) {
        saveScaleResult(scaleId, state)
      }
    }
  }, [scaleStates, patientId, saveScaleResult])

  const handleAddToNote = (text: string) => {
    if (onAddToNote) {
      onAddToNote('assessment', text)
    }
  }

  // Get trend indicator for a scale
  const getTrendIndicator = (scaleId: string): { trend: 'improving' | 'stable' | 'worsening' | null; previousScore: number | null } => {
    const currentState = scaleStates[scaleId]
    const previousResult = currentState?.previousResult

    if (!currentState?.calculation?.isComplete || !previousResult) {
      return { trend: null, previousScore: previousResult?.raw_score || null }
    }

    const currentScore = currentState.calculation.rawScore
    const prevScore = previousResult.raw_score
    const diff = currentScore - prevScore

    // For most scales, lower is better (PHQ-9, GAD-7, MIDAS, HIT-6, ESS)
    // For MoCA, higher is better
    const lowerIsBetter = scaleId !== 'moca'

    if (Math.abs(diff) < 2) {
      return { trend: 'stable', previousScore: prevScore }
    } else if ((lowerIsBetter && diff < 0) || (!lowerIsBetter && diff > 0)) {
      return { trend: 'improving', previousScore: prevScore }
    } else {
      return { trend: 'worsening', previousScore: prevScore }
    }
  }

  // Count completed scales
  const completedCount = useMemo(() => {
    return relevantScales.filter(scale => scaleStates[scale.id]?.calculation?.isComplete).length
  }, [relevantScales, scaleStates])

  if (relevantScales.length === 0) {
    return (
      <div style={{
        background: 'var(--bg-white)',
        borderRadius: '12px',
        padding: '20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        marginBottom: '16px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Clinical Scales</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--bg-dark)', padding: '4px 8px', borderRadius: '4px' }}>Optional</span>
        </div>
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
            Select a diagnosis above to see relevant clinical scales
          </p>
        </div>
      </div>
    )
  }

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
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Clinical Scales</span>
          <span style={{
            fontSize: '11px',
            padding: '2px 8px',
            borderRadius: '10px',
            background: 'var(--primary)',
            color: 'white',
          }}>
            {relevantScales.length} recommended
          </span>
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
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--bg-dark)', padding: '4px 8px', borderRadius: '4px' }}>Optional</span>
        </div>
      </div>

      {/* Info banner for conditions */}
      <div style={{
        padding: '10px 12px',
        background: 'var(--bg-dark)',
        borderRadius: '6px',
        marginBottom: '12px',
        fontSize: '12px',
        color: 'var(--text-secondary)',
      }}>
        <strong>Scales for:</strong>{' '}
        {selectedConditions.join(', ')}
      </div>

      {/* Scale Forms */}
      {relevantScales.map(scale => {
        const trendInfo = getTrendIndicator(scale.id)
        const state = scaleStates[scale.id]

        return (
          <div key={scale.id} style={{ position: 'relative' }}>
            {/* Trend indicator badge */}
            {trendInfo.previousScore !== null && state?.calculation?.isComplete && (
              <div style={{
                position: 'absolute',
                top: '8px',
                right: '40px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '10px',
                padding: '2px 6px',
                borderRadius: '4px',
                background: trendInfo.trend === 'improving' ? '#D1FAE5' :
                           trendInfo.trend === 'worsening' ? '#FEE2E2' : '#F3F4F6',
                color: trendInfo.trend === 'improving' ? '#059669' :
                       trendInfo.trend === 'worsening' ? '#DC2626' : '#6B7280',
                zIndex: 1,
              }}>
                {trendInfo.trend === 'improving' && '↓'}
                {trendInfo.trend === 'worsening' && '↑'}
                {trendInfo.trend === 'stable' && '→'}
                <span>prev: {trendInfo.previousScore}</span>
              </div>
            )}

            {/* Saving indicator */}
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
              clinicalText={clinicalText}
              patientContext={patientContext}
              showAiAutofill={true}
            />
          </div>
        )
      })}

      {/* Required scales notice */}
      {relevantScales.some(s => s.isRequired) && (
        <p style={{
          fontSize: '11px',
          color: 'var(--text-muted)',
          marginTop: '12px',
          marginBottom: 0,
          fontStyle: 'italic',
        }}>
          * Some scales are recommended for the selected condition(s)
        </p>
      )}
    </div>
  )
}
