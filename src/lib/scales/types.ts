// Type definitions for Clinical Scales module

export interface QuestionOption {
  value: number
  label: string
  score?: number // If different from value
}

export interface ScaleQuestion {
  id: string
  text: string
  type: 'select' | 'radio' | 'number' | 'boolean'
  options?: QuestionOption[]
  required?: boolean
  helpText?: string
  min?: number
  max?: number
  step?: number
  alertValue?: number  // Value that triggers an alert (e.g., PHQ-9 Q9 > 0)
  alertMessage?: string
}

export interface ScoringRange {
  min: number
  max: number
  grade?: string
  interpretation: string
  severity: 'minimal' | 'mild' | 'moderate' | 'moderately_severe' | 'severe'
  recommendations?: string[]
  color?: string
}

export interface ScaleAlert {
  id: string
  questionId?: string  // Specific question that triggers alert
  condition: string // e.g., "q9 > 0" or "score >= 21"
  type: 'critical' | 'warning' | 'info'
  message: string
  action?: string
}

export interface TriggeredAlert {
  id: string
  type: 'critical' | 'warning' | 'info'
  message: string
  action?: string
}

export interface ScaleDefinition {
  id: string
  name: string
  abbreviation: string
  description?: string
  category: 'headache' | 'cognitive' | 'mental_health' | 'movement' | 'sleep' | 'functional' | 'quality_of_life' | 'other'
  questions: ScaleQuestion[]
  scoringMethod: 'sum' | 'weighted' | 'custom' | 'average'
  scoringRanges: ScoringRange[]
  alerts?: ScaleAlert[]
  timeToComplete?: number // in minutes
  source?: string
}

export interface ScaleResponses {
  [questionId: string]: number | string | boolean
}

export interface ScoreCalculation {
  rawScore: number
  interpretation: string
  severity: 'minimal' | 'mild' | 'moderate' | 'moderately_severe' | 'severe' | null
  grade?: string
  recommendations: string[]
  triggeredAlerts: TriggeredAlert[]
  isComplete: boolean
  answeredQuestions: number
  totalQuestions: number
}

export interface ConditionScaleMapping {
  condition: string
  scaleId: string
  priority: number
  isRequired: boolean
}

export interface ScaleWithMapping extends ScaleDefinition {
  priority: number
  isRequired: boolean
}
