/**
 * Public exports for the consult/scales module (Phase 3)
 */

// Types
export type {
  ScaleAdminMode,
  SeverityLevel,
  ScaleTrigger,
  TriggeredScale,
  ScaleAdministrationQuestion,
  ScaleAdministrationSession,
  SaveScaleResponsesArgs,
  ScaleResult,
  LocalizerSnapshot,
} from './scale-types'

// Scale library
export {
  NIHSS,
  ALSFRS_R,
  SCALE_TRIGGERS,
  CONSULT_SCALE_DEFINITIONS,
  getAdministrationQuestions,
  getConsultScaleById,
  SCALE_AUTO_ADMIN_ENABLED,
} from './scale-library'

// Trigger engine
export {
  getTriggeredScales,
  getVoiceAdministrableScales,
  getPhysicianRequiredScales,
  buildScaleAdministrationInstructions,
  SAVE_SCALE_RESPONSES_TOOL,
} from './scale-trigger'

export type { TriggerOptions } from './scale-trigger'
