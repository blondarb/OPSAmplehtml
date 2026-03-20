/**
 * TypeScript types for the Background Localizer — Phase 2 of the
 * Integrated Neuro Intake Engine.
 *
 * The localizer runs during an active historian session, querying the
 * Bedrock Evidence Engine to refine the neurological differential and
 * suggest clinically-grounded follow-up questions.
 */

// ── Request ───────────────────────────────────────────────────────────────────

/** A single turn in the historian transcript. */
export interface LocalizerTranscriptTurn {
  role: 'assistant' | 'user'
  /** Transcribed text for this turn. */
  text: string
  /** Unix timestamp (ms) when this turn was captured. */
  timestamp: number
}

/**
 * Request body for POST /api/ai/historian/localizer.
 *
 * Fired from the client every 3 completed user turns during a live historian
 * session. The request is non-blocking — if the localizer times out or errors,
 * the historian session continues unaffected.
 */
export interface LocalizerRequest {
  /** UUID of the active historian session (historian_sessions.id or ephemeral). */
  sessionId: string
  /** Session type influences the localizer prompt — new patients need diagnosis; follow-ups need treatment response. */
  sessionType: 'new_patient' | 'follow_up'
  /**
   * Recent transcript turns to analyze. Send the last 6–10 turns for
   * efficiency; the localizer does not need the full session history.
   */
  transcript: LocalizerTranscriptTurn[]
  /** Chief complaint from the session init context (e.g. "new-onset headache"). */
  chiefComplaint?: string
  /** Original referral reason from the neurology_consults record, if available. */
  referralReason?: string
}

// ── Step 1 Output: Symptom Extraction ────────────────────────────────────────

/**
 * Structured symptoms extracted from the transcript by the first Bedrock call.
 * Used as the query input for KB retrieval.
 */
export interface ExtractedSymptoms {
  /** Primary symptoms mentioned by the patient (e.g. ["throbbing headache", "photophobia"]). */
  primarySymptoms: string[]
  /** Location descriptors (e.g. ["unilateral", "right temporal", "radiates to neck"]). */
  location: string[]
  /** Temporal characteristics (e.g. ["episodic", "4–72 hours", "worsens with activity"]). */
  temporalPattern: string[]
  /** Severity qualifiers (e.g. ["8/10", "disabling", "limits daily activities"]). */
  severity: string[]
  /** Associated symptoms (e.g. ["nausea", "vomiting", "aura"]). */
  associatedFeatures: string[]
  /** Potential red flags identified in the transcript (e.g. ["thunderclap onset", "fever"]). */
  redFlags: string[]
  /** Free-text summary of the clinical picture in 1–2 sentences. */
  clinicalSummary: string
}

// ── Step 3 Output: Question + Differential Generation ────────────────────────

/**
 * A candidate diagnosis in the ranked differential.
 */
export interface DifferentialEntry {
  /** Display name (e.g. "Migraine with aura"). */
  diagnosis: string
  /** ICD-10 code if determinable from symptoms (e.g. "G43.109"). */
  icd10?: string
  /** Why this diagnosis is on the differential given the transcript. */
  rationale: string
  /** Relative ranking confidence: high | medium | low. */
  likelihood: 'high' | 'medium' | 'low'
}

/**
 * Structured output from the question generator (Step 3 Bedrock call).
 */
export interface GeneratedQuestions {
  /** 2–3 specific follow-up questions tailored to the symptoms and KB evidence. */
  followUpQuestions: string[]
  /** Ranked differential diagnoses (2–4 candidates). */
  differential: DifferentialEntry[]
  /**
   * Neuroanatomical localization hypothesis (e.g. "cortical/meningeal irritation
   * vs. trigeminal pathway activation"). Empty string if insufficient data.
   */
  localizationHypothesis: string
  /**
   * One-sentence context hint formatted for injection into the historian's
   * system message. Should complete naturally after the fixed prefix:
   * "Based on what the patient has shared so far, clinical guidelines suggest..."
   */
  contextHint: string
  /** Overall confidence in the differential given available transcript data. */
  confidence: 'high' | 'medium' | 'low'
}

// ── API Response ──────────────────────────────────────────────────────────────

/**
 * Response from POST /api/ai/historian/localizer.
 *
 * All fields are safe to partially populate — if any pipeline step fails,
 * the route returns whatever was successfully computed rather than an error.
 */
export interface LocalizerResponse {
  /** 2–4 candidate diagnoses, ranked by likelihood. */
  differential: DifferentialEntry[]
  /** Evidence Engine excerpts (for the physician observer panel — NOT injected into the session). */
  evidenceSnippets: string[]
  /** 2–3 specific follow-up questions to suggest to the AI historian. */
  followUpQuestions: string[]
  /** One-sentence system hint for injection via WebRTC data channel. */
  contextHint: string
  /** Overall confidence level based on transcript depth and KB match quality. */
  confidence: 'high' | 'medium' | 'low'
  /** Neuroanatomical localization hypothesis. */
  localizationHypothesis: string
  /** Source document names from the KB (audit trail for the physician panel). */
  kbSources: string[]
  /** Total wall-clock time for the localizer pipeline in milliseconds. */
  processingMs: number
  /** True if the localizer degraded gracefully (partial results). */
  partial?: boolean
  /** Error message if the route degraded (session continues regardless). */
  degradedReason?: string
}

// ── DB columns added to neurology_consults ───────────────────────────────────

/**
 * The localizer result stored on the neurology_consults row.
 * Persisted after each successful localizer call so the physician panel
 * can show the most recent differential even after the session ends.
 */
export interface LocalizerConsultRecord {
  /** Most recent differential from the localizer. */
  localizer_differential: DifferentialEntry[] | null
  /** Most recent follow-up questions. */
  localizer_questions: string[] | null
  /** Most recent localization hypothesis. */
  localizer_hypothesis: string | null
  /** KB source names from the last successful localizer call. */
  localizer_kb_sources: string[] | null
  /** Timestamp of the last successful localizer call. */
  localizer_last_run_at: string | null
  /** Number of times the localizer ran during this session. */
  localizer_run_count: number
}
