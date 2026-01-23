// Scoring engine for clinical scales

import {
  ScaleDefinition,
  ScaleResponses,
  ScoreCalculation,
  TriggeredAlert,
  ScoringRange,
} from './types'

/**
 * Calculate the score for a completed or partially completed scale
 */
export function calculateScore(
  scale: ScaleDefinition,
  responses: ScaleResponses
): ScoreCalculation {
  const totalQuestions = scale.questions.filter(q => q.required !== false).length
  const answeredQuestions = scale.questions.filter(
    q => responses[q.id] !== undefined && responses[q.id] !== ''
  ).length

  // Calculate raw score based on scoring method
  let rawScore = 0

  switch (scale.scoringMethod) {
    case 'sum':
      rawScore = calculateSumScore(scale, responses)
      break
    case 'average':
      rawScore = calculateAverageScore(scale, responses)
      break
    case 'weighted':
      rawScore = calculateWeightedScore(scale, responses)
      break
    case 'custom':
      rawScore = calculateCustomScore(scale, responses)
      break
    default:
      rawScore = calculateSumScore(scale, responses)
  }

  // Determine if the scale is complete
  const isComplete = answeredQuestions >= totalQuestions

  // Find the matching scoring range
  const matchingRange = findScoringRange(scale.scoringRanges, rawScore)

  // Check for triggered alerts
  const triggeredAlerts = checkAlerts(scale, responses, rawScore)

  return {
    rawScore,
    interpretation: matchingRange?.interpretation || '',
    severity: matchingRange?.severity || null,
    grade: matchingRange?.grade,
    recommendations: matchingRange?.recommendations || [],
    triggeredAlerts,
    isComplete,
    answeredQuestions,
    totalQuestions,
  }
}

/**
 * Calculate sum of all responses
 */
function calculateSumScore(scale: ScaleDefinition, responses: ScaleResponses): number {
  let total = 0

  for (const question of scale.questions) {
    const response = responses[question.id]
    if (response === undefined || response === '') continue

    if (typeof response === 'number') {
      total += response
    } else if (typeof response === 'boolean') {
      total += response ? 1 : 0
    } else if (question.options) {
      // Find the option and get its score
      const option = question.options.find(o => o.value === Number(response))
      if (option) {
        total += option.score !== undefined ? option.score : option.value
      }
    }
  }

  return total
}

/**
 * Calculate average of all responses
 */
function calculateAverageScore(scale: ScaleDefinition, responses: ScaleResponses): number {
  const sum = calculateSumScore(scale, responses)
  const answeredCount = scale.questions.filter(
    q => responses[q.id] !== undefined && responses[q.id] !== ''
  ).length

  return answeredCount > 0 ? Math.round((sum / answeredCount) * 10) / 10 : 0
}

/**
 * Calculate weighted score (weights stored in question options)
 */
function calculateWeightedScore(scale: ScaleDefinition, responses: ScaleResponses): number {
  // For weighted scoring, the option.score should contain the weighted value
  return calculateSumScore(scale, responses)
}

/**
 * Calculate custom score based on scale-specific logic
 */
function calculateCustomScore(scale: ScaleDefinition, responses: ScaleResponses): number {
  // Custom scoring is handled per-scale
  // For now, fall back to sum scoring
  return calculateSumScore(scale, responses)
}

/**
 * Find the scoring range that matches the given score
 */
function findScoringRange(
  ranges: ScoringRange[],
  score: number
): ScoringRange | undefined {
  return ranges.find(range => score >= range.min && score <= range.max)
}

/**
 * Check for any alerts that should be triggered
 */
function checkAlerts(
  scale: ScaleDefinition,
  responses: ScaleResponses,
  rawScore: number
): TriggeredAlert[] {
  const triggered: TriggeredAlert[] = []

  if (!scale.alerts) return triggered

  for (const alert of scale.alerts) {
    if (evaluateAlertCondition(alert.condition, responses, rawScore)) {
      triggered.push({
        id: alert.id,
        type: alert.type,
        message: alert.message,
        action: alert.action,
      })
    }
  }

  return triggered
}

/**
 * Evaluate an alert condition
 * Supports: "q9 > 0", "score >= 21", "q9 > 0 AND score >= 10"
 */
function evaluateAlertCondition(
  condition: string,
  responses: ScaleResponses,
  rawScore: number
): boolean {
  // Replace 'score' with actual score value
  let evalCondition = condition.replace(/\bscore\b/gi, String(rawScore))

  // Replace question references (q1, q2, etc.) with their values
  const questionRegex = /\b(q\d+)\b/gi
  evalCondition = evalCondition.replace(questionRegex, (match) => {
    const value = responses[match.toLowerCase()]
    if (value === undefined || value === '') return '0'
    if (typeof value === 'boolean') return value ? '1' : '0'
    return String(value)
  })

  // Handle AND/OR operators
  evalCondition = evalCondition.replace(/\bAND\b/gi, '&&')
  evalCondition = evalCondition.replace(/\bOR\b/gi, '||')

  try {
    // Safe evaluation - only allows numbers, operators, and parentheses
    if (!/^[\d\s\+\-\*\/\>\<\=\&\|\!\(\)\.]+$/.test(evalCondition)) {
      console.warn('Invalid alert condition:', condition)
      return false
    }
    return Function(`"use strict"; return (${evalCondition})`)()
  } catch (e) {
    console.error('Error evaluating alert condition:', condition, e)
    return false
  }
}

/**
 * Get the color associated with a severity level
 */
export function getSeverityColor(
  severity: 'minimal' | 'mild' | 'moderate' | 'moderately_severe' | 'severe' | null
): string {
  switch (severity) {
    case 'minimal':
      return '#10B981' // green-500
    case 'mild':
      return '#22C55E' // green-400
    case 'moderate':
      return '#F59E0B' // amber-500
    case 'moderately_severe':
      return '#F97316' // orange-500
    case 'severe':
      return '#EF4444' // red-500
    default:
      return '#6B7280' // gray-500
  }
}

/**
 * Format a scale result for adding to a clinical note
 */
export function formatScaleResultForNote(
  scale: ScaleDefinition,
  calculation: ScoreCalculation
): string {
  const date = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  let result = `${scale.abbreviation}: ${calculation.rawScore}`
  if (calculation.grade) {
    result += ` (${calculation.grade})`
  }
  result += ` - ${calculation.interpretation} [${date}]`

  return result
}
