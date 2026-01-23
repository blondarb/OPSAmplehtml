'use client'

import { useState, useMemo } from 'react'
import ScaleForm from './ScaleForm'
import {
  ScaleDefinition,
  ScaleResponses,
  ScoreCalculation,
} from '@/lib/scales/types'
import { getScalesForCondition } from '@/lib/scales/scale-definitions'

interface SmartScalesSectionProps {
  selectedConditions: string[]
  onAddToNote?: (field: string, text: string) => void
}

interface ScaleState {
  responses: ScaleResponses
  calculation: ScoreCalculation | null
  isExpanded: boolean
}

export default function SmartScalesSection({
  selectedConditions,
  onAddToNote,
}: SmartScalesSectionProps) {
  // Track expanded state and responses for each scale
  const [scaleStates, setScaleStates] = useState<Record<string, ScaleState>>({})

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

  const toggleScaleExpanded = (scaleId: string) => {
    setScaleStates(prev => ({
      ...prev,
      [scaleId]: {
        ...prev[scaleId],
        responses: prev[scaleId]?.responses || {},
        calculation: prev[scaleId]?.calculation || null,
        isExpanded: !prev[scaleId]?.isExpanded,
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
      },
    }))
  }

  const handleAddToNote = (text: string) => {
    if (onAddToNote) {
      onAddToNote('assessment', text)
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
      {relevantScales.map(scale => (
        <ScaleForm
          key={scale.id}
          scale={scale}
          initialResponses={scaleStates[scale.id]?.responses || {}}
          isExpanded={scaleStates[scale.id]?.isExpanded ?? false}
          onToggleExpand={() => toggleScaleExpanded(scale.id)}
          onResponsesChange={(responses, calculation) =>
            handleResponsesChange(scale.id, responses, calculation)
          }
          onAddToNote={handleAddToNote}
          showAddToNote={true}
        />
      ))}

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
