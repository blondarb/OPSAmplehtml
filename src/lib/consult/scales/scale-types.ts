/**
 * Scale Auto-Administration Engine — TypeScript types (Phase 3)
 *
 * These types extend the base scale system (src/lib/scales/) with consult-specific
 * concepts: trigger conditions, voice administration metadata, and session-scoped results.
 */

/** Whether the scale can be administered verbally by the AI or requires a physician */
export type ScaleAdminMode = 'voice_administrable' | 'exam_required'

/** Severity levels used in ScaleResult (superset of the scoring-engine levels) */
export type SeverityLevel =
  | 'none'
  | 'minimal'
  | 'mild'
  | 'moderate'
  | 'moderately_severe'
  | 'severe'

// ─── Trigger metadata ────────────────────────────────────────────────────────

/**
 * Defines when and how a scale should be triggered by the localizer.
 * Attached to each scale in the CONSULT_SCALE_LIBRARY.
 */
export interface ScaleTrigger {
  /** ID of the scale definition in the consult library */
  scaleId: string

  /**
   * Localizer diagnosis categories that should trigger this scale.
   * Matches against LocalizerOutput.differentialDiagnoses[].category
   */
  triggerCategories: string[]

  /**
   * Free-text keywords found in the historian transcript or chief complaint
   * that trigger this scale even without a formal category match.
   */
  triggerKeywords: string[]

  /** How the scale is administered in the context of the historian session */
  adminMode: ScaleAdminMode

  /**
   * 1 = highest priority (shown/asked first).
   * Used to rank when multiple scales are triggered simultaneously.
   */
  priority: number

  /** True if a physician must be present to administer (NIHSS, MoCA) */
  requiresPhysician: boolean
}

/**
 * A scale that has been evaluated against triggers and determined to be indicated.
 * Returned by the trigger engine to callers.
 */
export interface TriggeredScale {
  scaleId: string
  scaleName: string
  scaleAbbreviation: string
  adminMode: ScaleAdminMode
  requiresPhysician: boolean
  /** Human-readable explanation of why this scale was triggered */
  triggerReason: string
  priority: number
}

// ─── Voice administration ────────────────────────────────────────────────────

/**
 * A single question formatted for natural spoken delivery by the historian AI.
 * Wraps the base ScaleQuestion with voice-specific metadata.
 */
export interface ScaleAdministrationQuestion {
  /** Matches the question id in the base ScaleDefinition */
  id: string
  /** Standard clinical text (used in reports and scoring) */
  text: string
  /** How the AI should ask this question in natural conversational speech */
  conversationalText: string
  responseType: 'number' | 'choice' | 'boolean'
  options?: {
    value: number
    label: string
    /** How to say this option aloud (may differ from label) */
    spokenLabel: string
  }[]
  min?: number
  max?: number
}

/**
 * A live scale administration session tracked inside useRealtimeSession.
 * Created when the historian transitions to scale administration mode.
 */
export interface ScaleAdministrationSession {
  /** historian_session_id or consult_id this belongs to */
  sessionId: string
  scaleId: string
  scaleName: string
  scaleAbbreviation: string
  questions: ScaleAdministrationQuestion[]
  currentQuestionIndex: number
  /** Accumulated responses keyed by question id */
  responses: Record<string, number | string>
  status: 'pending' | 'in_progress' | 'complete' | 'abandoned'
  startedAt: string
}

// ─── Tool call schema ─────────────────────────────────────────────────────────

/**
 * Arguments the historian AI sends via the `save_scale_responses` function call tool.
 */
export interface SaveScaleResponsesArgs {
  scale_id: string
  scale_abbreviation: string
  /** Map of question ID → numeric response value */
  responses: Record<string, number>
}

// ─── Stored results ──────────────────────────────────────────────────────────

/**
 * A completed, scored scale result as returned from the API and stored in the DB.
 */
export interface ScaleResult {
  id: string
  /** Links to historian_sessions.id (or neurology_consults.id for Phase 1/2) */
  historianSessionId: string | null
  consultId: string | null
  scaleName: string
  scaleAbbreviation: string
  /** Raw question → value mapping */
  rawResponses: Record<string, number | string>
  totalScore: number
  /** Optional sub-scores (e.g., ALSFRS-R bulbar/motor/respiratory domains) */
  subscaleScores?: Record<string, number>
  interpretation: string
  severityLevel: SeverityLevel
  /** Triggered safety or clinical alerts from scoring-engine */
  triggeredAlerts?: Array<{ type: 'critical' | 'warning' | 'info'; message: string }>
  adminMode: ScaleAdminMode
  administeredAt: string
  completedAt: string
}

// ─── Localizer output shape (Phase 2 contract) ────────────────────────────────

/**
 * Minimal subset of the Phase 2 LocalizerOutput that the trigger engine consumes.
 * Defined here so Phase 3 compiles independently of the Phase 2 implementation.
 */
export interface LocalizerSnapshot {
  /** Diagnosis categories identified so far, e.g. "migraine", "depression", "stroke" */
  differentialCategories: string[]
  /** Free-text symptom summary from the transcript */
  symptomSummary: string
  /** Scale IDs that have already been completed in this session */
  completedScaleIds: string[]
}
