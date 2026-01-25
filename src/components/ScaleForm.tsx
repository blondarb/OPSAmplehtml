'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  ScaleDefinition,
  ScaleResponses,
  ScoreCalculation,
  ScaleQuestion,
  QuestionOption,
} from '@/lib/scales/types'
import { calculateScore, getSeverityColor } from '@/lib/scales/scoring-engine'

interface AutofillResult {
  responses: Record<string, number | boolean | string>
  confidence: Record<string, 'high' | 'medium' | 'low'>
  reasoning: Record<string, string>
  missingInfo: string[]
  suggestedPrompts: string[]
}

interface ScaleFormProps {
  scale: ScaleDefinition
  initialResponses?: ScaleResponses
  onResponsesChange?: (responses: ScaleResponses, calculation: ScoreCalculation) => void
  onComplete?: (responses: ScaleResponses, calculation: ScoreCalculation) => void
  isExpanded?: boolean
  onToggleExpand?: () => void
  showAddToNote?: boolean
  onAddToNote?: (text: string) => void
  // AI Autofill props
  clinicalText?: string  // Text from HPI, exam notes, or dictation to analyze
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
  showAiAutofill?: boolean
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
  clinicalText,
  patientContext,
  showAiAutofill = true,
}: ScaleFormProps) {
  const [responses, setResponses] = useState<ScaleResponses>(initialResponses)
  const [hasInteracted, setHasInteracted] = useState(false)
  const [isAutofilling, setIsAutofilling] = useState(false)
  const [autofillResult, setAutofillResult] = useState<AutofillResult | null>(null)
  const [autofillError, setAutofillError] = useState<string | null>(null)
  const [showAutofillDetails, setShowAutofillDetails] = useState(false)

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

  // AI Autofill function
  const handleAiAutofill = useCallback(async () => {
    if (!clinicalText || clinicalText.trim().length === 0) {
      setAutofillError('No clinical text available to analyze. Please enter notes or record dictation first.')
      return
    }

    setIsAutofilling(true)
    setAutofillError(null)
    setAutofillResult(null)

    try {
      const response = await fetch('/api/ai/scale-autofill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scaleId: scale.id,
          clinicalText,
          patientContext,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to autofill scale')
      }

      const data = await response.json()

      // Store the autofill result for display
      setAutofillResult({
        responses: data.responses,
        confidence: data.confidence,
        reasoning: data.reasoning,
        missingInfo: data.missingInfo || [],
        suggestedPrompts: data.suggestedPrompts || [],
      })

      // Apply the autofilled responses
      if (data.responses && Object.keys(data.responses).length > 0) {
        setHasInteracted(true)
        setResponses(prev => ({
          ...prev,
          ...data.responses,
        }))
      }

      // Show details if there's missing info
      if (data.missingInfo?.length > 0 || data.suggestedPrompts?.length > 0) {
        setShowAutofillDetails(true)
      }

    } catch (error: any) {
      console.error('AI Autofill error:', error)
      setAutofillError(error.message || 'Failed to autofill scale data')
    } finally {
      setIsAutofilling(false)
    }
  }, [scale.id, clinicalText, patientContext])

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
    const aiConfidence = autofillResult?.confidence[question.id]
    const aiReasoning = autofillResult?.reasoning[question.id]
    const wasAiFilled = autofillResult?.responses[question.id] !== undefined

    // Confidence indicator style
    const confidenceStyle = aiConfidence ? {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      marginLeft: '8px',
      padding: '2px 6px',
      borderRadius: '4px',
      fontSize: '10px',
      fontWeight: 500,
      background: aiConfidence === 'high' ? '#D1FAE5' : aiConfidence === 'medium' ? '#FEF3C7' : '#FEE2E2',
      color: aiConfidence === 'high' ? '#065F46' : aiConfidence === 'medium' ? '#92400E' : '#991B1B',
    } : undefined

    switch (question.type) {
      case 'select':
      case 'radio':
        return (
          <div key={question.id} style={{
            marginBottom: '16px',
            padding: wasAiFilled ? '8px' : undefined,
            background: wasAiFilled ? 'rgba(13, 148, 136, 0.05)' : undefined,
            borderRadius: wasAiFilled ? '8px' : undefined,
            border: wasAiFilled ? '1px solid rgba(13, 148, 136, 0.2)' : undefined,
          }}>
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
                {aiConfidence && (
                  <span style={confidenceStyle} title={aiReasoning || 'AI extracted'}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2L2 7l10 5 10-5-10-5z" />
                    </svg>
                    AI {aiConfidence}
                  </span>
                )}
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

          {/* AI Autofill Section */}
          {showAiAutofill && (
            <div style={{ marginBottom: '16px' }}>
              <button
                onClick={handleAiAutofill}
                disabled={isAutofilling || !clinicalText}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '10px 16px',
                  background: isAutofilling ? 'var(--bg-dark)' : clinicalText ? 'linear-gradient(135deg, #0D9488, #14B8A6)' : 'var(--bg-dark)',
                  color: clinicalText ? 'white' : 'var(--text-muted)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: isAutofilling || !clinicalText ? 'not-allowed' : 'pointer',
                  opacity: isAutofilling ? 0.7 : 1,
                  transition: 'all 0.2s',
                }}
              >
                {isAutofilling ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                      <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                    </svg>
                    Analyzing clinical text...
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2L2 7l10 5 10-5-10-5z" />
                      <path d="M2 17l10 5 10-5" />
                      <path d="M2 12l10 5 10-5" />
                    </svg>
                    AI Auto-fill from Notes
                  </>
                )}
              </button>

              {!clinicalText && (
                <p style={{
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  marginTop: '6px',
                  textAlign: 'center',
                  fontStyle: 'italic',
                }}>
                  Enter notes or record dictation to enable AI auto-fill
                </p>
              )}

              {/* Autofill Error */}
              {autofillError && (
                <div style={{
                  marginTop: '8px',
                  padding: '10px 12px',
                  background: '#FEE2E2',
                  border: '1px solid #FCA5A5',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: '#DC2626',
                }}>
                  {autofillError}
                </div>
              )}

              {/* Autofill Result Details */}
              {autofillResult && (
                <div style={{
                  marginTop: '8px',
                  padding: '12px',
                  background: '#F0FDFA',
                  border: '1px solid #99F6E4',
                  borderRadius: '8px',
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '8px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#0D9488' }}>
                        AI filled {Object.keys(autofillResult.responses).length} of {scale.questions.length} fields
                      </span>
                    </div>
                    <button
                      onClick={() => setShowAutofillDetails(!showAutofillDetails)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        fontSize: '11px',
                        color: 'var(--primary)',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                      }}
                    >
                      {showAutofillDetails ? 'Hide details' : 'Show details'}
                    </button>
                  </div>

                  {showAutofillDetails && (
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      {/* Confidence breakdown */}
                      <div style={{ marginBottom: '8px' }}>
                        <strong>Confidence:</strong>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                          {Object.entries(autofillResult.confidence).map(([qId, conf]) => (
                            <span key={qId} style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: conf === 'high' ? '#D1FAE5' : conf === 'medium' ? '#FEF3C7' : '#FEE2E2',
                              color: conf === 'high' ? '#065F46' : conf === 'medium' ? '#92400E' : '#991B1B',
                            }}>
                              {qId}: {conf}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Missing information */}
                      {autofillResult.missingInfo.length > 0 && (
                        <div style={{ marginBottom: '8px' }}>
                          <strong style={{ color: '#F59E0B' }}>Missing information:</strong>
                          <ul style={{ margin: '4px 0 0 0', paddingLeft: '16px' }}>
                            {autofillResult.missingInfo.map((info, i) => (
                              <li key={i}>{info}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Suggested questions to ask */}
                      {autofillResult.suggestedPrompts.length > 0 && (
                        <div>
                          <strong style={{ color: '#8B5CF6' }}>Ask the patient:</strong>
                          <ul style={{ margin: '4px 0 0 0', paddingLeft: '16px' }}>
                            {autofillResult.suggestedPrompts.map((prompt, i) => (
                              <li key={i}>{prompt}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
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
