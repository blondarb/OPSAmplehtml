/**
 * Types for Phase 7 — Unified Report Generator
 *
 * A ConsultReport aggregates all pipeline outputs into a structured
 * physician-facing report ready for EHR import or PDF export.
 */

export type ReportStatus = 'draft' | 'final' | 'amended'

export interface ReportSection {
  id: string
  title: string
  content: string
  /** Source pipeline stage that contributed this section */
  source: 'triage' | 'intake' | 'historian' | 'localizer' | 'scales' | 'red_flags' | 'sdne' | 'patient_tools' | 'physician' | 'ai_synthesis'
  /** Order within the report (lower = earlier) */
  order: number
}

/** Scale result summary for the report */
export interface ReportScaleResult {
  scale_name: string
  abbreviation: string
  score: number
  max_score: number
  severity: string
  interpretation: string
}

/** Localizer differential for the report */
export interface ReportDifferentialEntry {
  diagnosis: string
  likelihood: string
  rationale: string
}

/** Body map summary for the report */
export interface ReportBodyMapSummary {
  total_markers: number
  regions_affected: string[]
  symptom_types: string[]
  severities: string[]
}

/** Device measurement summary for the report */
export interface ReportMeasurementSummary {
  type: string
  hand?: string
  key_value: string
  classification: string
}

/** SDNE summary for the report */
export interface ReportSDNESummary {
  session_flag: string
  abnormal_domains: Array<{ domain: string; flag: string }>
  detected_patterns: Array<{ description: string; confidence: string }>
}

/** Red flag summary for the report */
export interface ReportRedFlagSummary {
  count: number
  highest_severity: string | null
  flags: Array<{
    name: string
    severity: string
    confidence: number
  }>
}

/**
 * The complete unified consult report.
 * This is the final artifact of the pipeline.
 */
export interface ConsultReport {
  id: string
  consult_id: string
  status: ReportStatus

  // ── Header ──────────────────────────────────────────────────────────
  patient_name: string | null
  exam_date: string
  chief_complaint: string
  triage_tier: string | null
  subspecialty: string | null

  // ── Structured sections ─────────────────────────────────────────────
  sections: ReportSection[]

  // ── Aggregated data summaries ───────────────────────────────────────
  scale_results: ReportScaleResult[]
  differential: ReportDifferentialEntry[]
  body_map: ReportBodyMapSummary | null
  device_measurements: ReportMeasurementSummary[]
  sdne_summary: ReportSDNESummary | null
  red_flags: ReportRedFlagSummary

  // ── Metadata ────────────────────────────────────────────────────────
  generated_at: string
  generated_by: 'system' | 'physician'
  word_count: number
}
