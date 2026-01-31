// Public exports for the scales module

// Types
export type {
  QuestionOption,
  ScaleQuestion,
  ScoringRange,
  ScaleAlert,
  TriggeredAlert,
  ScaleDefinition,
  ScaleResponses,
  ScoreCalculation,
  ConditionScaleMapping,
  ScaleWithMapping,
} from './types'

// Scoring engine functions
export {
  calculateScore,
  getSeverityColor,
  formatScaleResultForNote,
} from './scoring-engine'

// Scale definitions and helpers
export {
  PHQ9,
  GAD7,
  MIDAS,
  HIT6,
  MOCA,
  ESS,
  HAS_BLED,
  DN4,
  ODI,
  NDI,
  ALL_SCALES,
  CONDITION_SCALE_MAPPINGS,
  getScalesForCondition,
  getConditionsWithScales,
} from './scale-definitions'
