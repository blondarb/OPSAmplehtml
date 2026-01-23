'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  ScaleDefinition,
  ScaleResponses,
  ScoreCalculation,
  ScaleQuestion,
  QuestionOption,
} from '@/lib/scales/types'
import { calculateScore, getSeverityColor } from '@/lib/scales/scoring-engine'

interface ScaleFormProps {
  scale: ScaleDefinition
  initialResponses?: ScaleResponses
  onResponsesChange?: (responses: ScaleResponses, calculation: ScoreCalculation) => void
  onComplete?: (responses: ScaleResponses, calculation: ScoreCalculation) => void
  isExpanded?: boolean
  onToggleExpand?: () => void
  showAddToNote?: boolean
  onAddToNote?: (text: string) => void
}

export default function ScaleForm({
  scale,
  initialResponses = {},
  onResponsesChange,
  onComplete,
  isExpanded = false,
  onToggleExpand,
  showAddToNote = true,
  onAddToNote,
}: ScaleFormProps) {
  const [responses, setResponses] = useState<ScaleResponses>(initialResponses)
  const [hasInteracted, setHasInteracted] = useState(false)

  // Calculate score whenever responses change
  const calculation = useMemo(() => {
    return calculateScore(scale, responses)
  }, [scale, responses])

  // Notify parent of changes
  useEffect(() => {
    if (hasInteracted && onResponsesChange) {
      onResponsesChange(responses, calculation)
    }
  }, [responses, calculation, hasInteracted, onResponsesChange])

  const handleResponseChange = (questionId: string, value: number | string | boolean) => {
    setHasInteracted(true)
    setResponses(prev => ({
      ...prev,
      [questionId]: value,
    }))
  }

  const handleAddToNote = () => {
    if (onAddToNote && calculation.isComplete) {
      const date = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
      let text = `${scale.abbreviation}: ${calculation.rawScore}`
      if (calculation.grade) {
        text += ` (${calculation.grade})`
      }
      text += ` - ${calculation.interpretation} [${date}]`
      onAddToNote(text)
    }
  }

  const renderQuestion = (question: ScaleQuestion, index: number) => {
    const value = responses[question.id]

    switch (question.type) {
      case 'select':
      case 'radio':
        return (
          <div key={question.id} style={{ marginBottom: '16px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
              marginBottom: '8px',
            }}>
              <span style={{
                fontSize: '13px',
                color: 'var(--text-muted)',
                minWidth: '20px',
              }}>
                {index + 1}.
              </span>
              <span style={{ fontSize: '13px', color: 'var(--text-primary)', flex: 1 }}>
                {question.text}
                {question.required && <span style={{ color: 'var(--danger)', marginLeft: '4px' }}>*</span>}
              </span>
            </div>
            <div style={{ marginLeft: '28px' }}>
              {question.options?.map((option: QuestionOption) => (
                <label
                  key={option.value}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 0',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  <input
                    type="radio"
                    name={`${scale.id}-${question.id}`}
                    value={option.value}
                    checked={value === option.value}
                    onChange={() => handleResponseChange(question.id, option.value)}
                    style={{ accentColor: 'var(--primary)' }}
                  />
                  <span style={{ color: value === option.value ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    {option.label}
                  </span>
                </label>
              ))}
            </div>
            {question.helpText && (
              <p style={{
                fontSize: '11px',
                color: 'var(--text-muted)',
                marginLeft: '28px',
                marginTop: '4px',
                fontStyle: 'italic',
              }}>
                {question.helpText}
              </p>
            )}
          </div>
        )

      case 'number':
        return (
          <div key={question.id} style={{ marginBottom: '16px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}>
              <span style={{
                fontSize: '13px',
                color: 'var(--text-muted)',
                minWidth: '20px',
              }}>
                {index + 1}.
              </span>
              <span style={{ fontSize: '13px', color: 'var(--text-primary)', flex: 1 }}>
                {question.text}
                {question.required && <span style={{ color: 'var(--danger)', marginLeft: '4px' }}>*</span>}
              </span>
              <input
                type="number"
                min={question.min}
                max={question.max}
                step={question.step || 1}
                value={value !== undefined ? String(value) : ''}
                onChange={(e) => handleResponseChange(question.id, parseInt(e.target.value) || 0)}
                placeholder={question.min !== undefined && question.max !== undefined
                  ? `${question.min}-${question.max}`
                  : ''}
                style={{
                  width: '80px',
                  padding: '8px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  textAlign: 'center',
                  fontSize: '14px',
                }}
              />
            </div>
            {question.helpText && (
              <p style={{
                fontSize: '11px',
                color: 'var(--text-muted)',
                marginLeft: '28px',
                marginTop: '4px',
                fontStyle: 'italic',
              }}>
                {question.helpText}
              </p>
            )}
          </div>
        )

      case 'boolean':
        return (
          <div key={question.id} style={{ marginBottom: '16px' }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
            }}>
              <span style={{
                fontSize: '13px',
                color: 'var(--text-muted)',
                minWidth: '20px',
              }}>
                {index + 1}.
              </span>
              <input
                type="checkbox"
                checked={value === true}
                onChange={(e) => handleResponseChange(question.id, e.target.checked)}
                style={{ accentColor: 'var(--primary)' }}
              />
              <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                {question.text}
              </span>
            </label>
            {question.helpText && (
              <p style={{
                fontSize: '11px',
                color: 'var(--text-muted)',
                marginLeft: '28px',
                marginTop: '4px',
                fontStyle: 'italic',
              }}>
                {question.helpText}
              </p>
            )}
          </div>
        )

      default:
        return null
    }
  }

  const severityColor = getSeverityColor(calculation.severity)
  const progressPercent = calculation.totalQuestions > 0
    ? (calculation.answeredQuestions / calculation.totalQuestions) * 100
    : 0

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: '8px',
        marginBottom: '8px',
        overflow: 'hidden',
      }}
    >
      {/* Header - always visible */}
      <div
        onClick={onToggleExpand}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          background: isExpanded ? 'var(--bg-dark)' : 'transparent',
          cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
          {/* Status indicator */}
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: calculation.isComplete ? severityColor : 'transparent',
              border: calculation.isComplete ? 'none' : '1px solid var(--border)',
            }}
          />

          {/* Scale name */}
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: '14px', fontWeight: 500 }}>
              {scale.abbreviation}
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>
              {scale.name}
            </span>
          </div>

          {/* Score display (when complete) */}
          {calculation.isComplete && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                fontSize: '16px',
                fontWeight: 600,
                color: severityColor,
              }}>
                {calculation.rawScore}
              </span>
              <span style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: '4px',
                background: `${severityColor}20`,
                color: severityColor,
              }}>
                {calculation.interpretation}
              </span>
            </div>
          )}

          {/* Progress indicator (when not complete) */}
          {!calculation.isComplete && hasInteracted && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '60px',
                height: '4px',
                background: 'var(--border)',
                borderRadius: '2px',
                overflow: 'hidden',
              }}>
                <div style={{
                  width: `${progressPercent}%`,
                  height: '100%',
                  background: 'var(--primary)',
                  transition: 'width 0.2s',
                }} />
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {calculation.answeredQuestions}/{calculation.totalQuestions}
              </span>
            </div>
          )}
        </div>

        {/* Expand/collapse arrow */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
            color: 'var(--text-muted)',
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ padding: '16px', borderTop: '1px solid var(--border)' }}
        >
          {/* Description */}
          {scale.description && (
            <p style={{
              fontSize: '12px',
              color: 'var(--text-muted)',
              marginBottom: '16px',
              padding: '8px 12px',
              background: 'var(--bg-dark)',
              borderRadius: '6px',
            }}>
              {scale.description}
              {scale.timeToComplete && (
                <span style={{ marginLeft: '8px' }}>
                  (~{scale.timeToComplete} min)
                </span>
              )}
            </p>
          )}

          {/* Questions */}
          <div style={{ marginBottom: '16px' }}>
            {scale.questions.map((question, index) => renderQuestion(question, index))}
          </div>

          {/* Score Result Section */}
          {calculation.isComplete && (
            <div
              style={{
                padding: '16px',
                background: `${severityColor}10`,
                border: `1px solid ${severityColor}30`,
                borderRadius: '8px',
                marginBottom: '16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div>
                  <span style={{ fontSize: '24px', fontWeight: 700, color: severityColor }}>
                    {calculation.rawScore}
                  </span>
                  {calculation.grade && (
                    <span style={{ fontSize: '14px', color: 'var(--text-secondary)', marginLeft: '8px' }}>
                      {calculation.grade}
                    </span>
                  )}
                </div>
                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: 500,
                    padding: '4px 12px',
                    borderRadius: '6px',
                    background: severityColor,
                    color: 'white',
                  }}
                >
                  {calculation.interpretation}
                </span>
              </div>

              {/* Recommendations */}
              {calculation.recommendations.length > 0 && (
                <div style={{ marginTop: '12px' }}>
                  <p style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-primary)' }}>
                    Recommendations:
                  </p>
                  <ul style={{ margin: 0, paddingLeft: '20px' }}>
                    {calculation.recommendations.map((rec, i) => (
                      <li key={i} style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Alerts */}
              {calculation.triggeredAlerts.length > 0 && (
                <div style={{ marginTop: '12px' }}>
                  {calculation.triggeredAlerts.map((alert, i) => (
                    <div
                      key={i}
                      style={{
                        padding: '10px 12px',
                        background: alert.type === 'critical' ? '#FEE2E2' : '#FEF3C7',
                        border: `1px solid ${alert.type === 'critical' ? '#FCA5A5' : '#FCD34D'}`,
                        borderRadius: '6px',
                        marginBottom: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={alert.type === 'critical' ? '#DC2626' : '#D97706'} strokeWidth="2">
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                          <line x1="12" y1="9" x2="12" y2="13"/>
                          <line x1="12" y1="17" x2="12.01" y2="17"/>
                        </svg>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: alert.type === 'critical' ? '#DC2626' : '#D97706' }}>
                          {alert.type === 'critical' ? 'CRITICAL ALERT' : 'Warning'}
                        </span>
                      </div>
                      <p style={{ fontSize: '12px', color: 'var(--text-primary)', marginTop: '6px', marginBottom: 0 }}>
                        {alert.message}
                      </p>
                      {alert.action && (
                        <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', fontStyle: 'italic' }}>
                          Action: {alert.action}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Add to Note button */}
          {showAddToNote && calculation.isComplete && (
            <button
              onClick={handleAddToNote}
              style={{
                width: '100%',
                padding: '10px',
                background: 'var(--primary)',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add to Assessment
            </button>
          )}
        </div>
      )}
    </div>
  )
}
