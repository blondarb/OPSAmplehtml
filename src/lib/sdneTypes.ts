/**
 * SDNE (Standardized Digital Neurologic Exam) Core-15 Types
 *
 * Ported from SDNE dashboard for integration into Sevaro Clinical EHR.
 * These types represent the results of a VR-based neurologic screening exam.
 */

// Flag status for each domain/task - matches clinical thresholds
export type SDNEFlag = 'GREEN' | 'YELLOW' | 'RED' | 'INVALID' | 'NOT_PERFORMED'

// Confidence level for pattern detection
export type SDNEConfidence = 'HIGH' | 'MEDIUM' | 'LOW'

// 8 neurologic domains assessed in Core-15
export type SDNEDomain =
  | 'Setup'
  | 'Cognition'
  | 'Oculomotor'
  | 'Facial'
  | 'Motor'
  | 'Coordination'
  | 'Language'
  | 'Gait'

// Human-readable domain labels
export const SDNE_DOMAIN_LABELS: Record<SDNEDomain, string> = {
  Setup: 'Setup & Calibration',
  Cognition: 'Cognition',
  Oculomotor: 'Oculomotor',
  Facial: 'Facial/Bulbar',
  Motor: 'Motor',
  Coordination: 'Coordination',
  Language: 'Language',
  Gait: 'Gait & Balance',
}

// Flag display labels
export const SDNE_FLAG_LABELS: Record<SDNEFlag, string> = {
  GREEN: 'Normal',
  YELLOW: 'Borderline',
  RED: 'Abnormal',
  INVALID: 'Invalid Data',
  NOT_PERFORMED: 'Not Performed',
}

// Color theme for flags (matches OPSAmplehtml design system)
export const SDNE_FLAG_THEME = {
  green: { main: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', text: '#15803D' },
  yellow: { main: '#EAB308', bg: '#FEFCE8', border: '#FEF08A', text: '#A16207' },
  red: { main: '#DC2626', bg: '#FEF2F2', border: '#FECACA', text: '#B91C1C' },
  invalid: { main: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB', text: '#4B5563' },
}

// Map Flag to theme key
export const SDNE_FLAG_KEY: Record<SDNEFlag, keyof typeof SDNE_FLAG_THEME> = {
  GREEN: 'green',
  YELLOW: 'yellow',
  RED: 'red',
  INVALID: 'invalid',
  NOT_PERFORMED: 'invalid',
}

// Quality metrics for data validity
export interface SDNEQualityMetrics {
  validity: number           // 0-1 overall validity score
  sensorAvailability: number // 0-1 sensor availability during task
  calibrationValid: boolean
  artifactCount: number
  qcNotes: string[]          // Clinical observations from task
}

// Individual task result
export interface SDNETaskResult {
  taskId: string              // e.g., "T01"
  taskName: string            // e.g., "Orientation"
  domain: SDNEDomain
  flag: SDNEFlag
  durationSeconds?: number
  completed: boolean
  quality: SDNEQualityMetrics
  metrics: Record<string, unknown>  // Task-specific metrics
}

// Detected clinical pattern (e.g., parkinsonism, MCI)
export interface SDNEClinicalPattern {
  patternId: string           // e.g., "PATTERN_PARKINSONISM"
  description: string
  confidence: SDNEConfidence
  supportingTasks: string[]   // Task IDs
  supportingFindings: string[]
}

// Recommended add-on module
export interface SDNEAddOnRecommendation {
  addOnId: string
  name: string
  rationale: string
  estimatedDurationSeconds: number
}

// Complete session result
export interface SDNESessionResult {
  sessionId: string
  examDate: string            // ISO 8601 datetime
  totalDurationSeconds?: number
  completed: boolean
  sessionFlag: SDNEFlag       // Overall session flag (worst domain)
  confidenceLevel: SDNEConfidence
  domainFlags: Record<SDNEDomain, SDNEFlag>
  taskResults: SDNETaskResult[]
  detectedPatterns: SDNEClinicalPattern[]
  addOnRecommendations: SDNEAddOnRecommendation[]
}

// Task metadata - 18 tasks in Core-15
export const SDNE_TASK_INFO: Record<string, { name: string; domain: SDNEDomain }> = {
  T00: { name: 'Setup & Calibration', domain: 'Setup' },
  T01: { name: 'Orientation', domain: 'Cognition' },
  T02: { name: '3-Word Registration', domain: 'Cognition' },
  T03: { name: 'Digit Span Forward', domain: 'Cognition' },
  T04: { name: 'Horizontal Saccades', domain: 'Oculomotor' },
  T05: { name: 'Smooth Pursuit', domain: 'Oculomotor' },
  T06: { name: 'Fixation & Convergence', domain: 'Oculomotor' },
  T07: { name: 'Facial Activation', domain: 'Facial' },
  T08: { name: 'Pa-Ta-Ka (DDK)', domain: 'Facial' },
  T09: { name: 'Rest Tremor', domain: 'Motor' },
  T10: { name: 'Postural Tremor', domain: 'Motor' },
  T11: { name: 'Finger Tapping', domain: 'Motor' },
  T12: { name: 'Finger-to-Target', domain: 'Coordination' },
  T13: { name: 'Semantic Fluency', domain: 'Language' },
  T14: { name: 'Confrontation Naming', domain: 'Language' },
  T15: { name: '10-Meter Walk', domain: 'Gait' },
  T16: { name: 'Timed Up-and-Go', domain: 'Gait' },
  T17: { name: '3-Word Delayed Recall', domain: 'Cognition' },
}

// ─── Facial Asymmetry Index (AsI) thresholds — Task T07 ─────────────
//
// The AsI is the Vrochidou facial asymmetry index — the mean normalized
// left/right deviation of paired facial landmarks from the midline:
//
//             1    l    | d_Rᵢ − d_Lᵢ |
//     AsI  = ─── ·  Σ   ───────────────      (range 0–1; lower = more symmetric)
//             l   i=1    d_Rᵢ + d_Lᵢ
//
// where d_Rᵢ / d_Lᵢ are the i-th right/left landmark distances from the
// midline, each pair normalized by its sum (d_Rᵢ + d_Lᵢ).
//
// What this app consumes: t07.metrics.asymmetry_index is produced by the SDNE
// headset capture pipeline, which computes a DENOMINATOR-FREE blendshape variant
// (mean |peakL − peakR|, no /(L+R)) because the headset exposes 0–1 blendshape
// activations, not landmark distances. The cutoffs below are calibrated on the
// reference's normalized scale and remain VALIDATION-PENDING on the headset's
// blendshape AsI — see the SDNE repo's docs/T07_FACIAL_ASYMMETRY_AsI.md.
//
// Screening cutoffs (NOT diagnostic), calibrated against:
//  - Hand-held CV reference device (UT Arlington, Bell's-palsy cohort):
//    balanced ≈0.02–0.04, untreated ≈0.17+ (e.g. before 0.170 → after 0.042).
//  - Demo baselines: healthy 0.04–0.06 → GREEN; hypomimia / resolving ≈0.12
//    → YELLOW; central facial weakness (stroke) ≈0.28 → RED.
//
// Caveat: subtle CENTRAL facial weakness can sit below the RED cutoff on
// overall AsI alone. The upper-vs-lower-face ratio is the discriminating
// feature and should be evaluated alongside the overall index where the
// landmark capture supports it (the XR headset occludes the upper face).
export const FACIAL_ASYMMETRY_AsI = {
  greenMax: 0.08,  // AsI < 0.08          → within normal limits
  yellowMax: 0.15, // 0.08 ≤ AsI < 0.15   → borderline asymmetry
  //                  AsI ≥ 0.15          → abnormal asymmetry
} as const

/** Classify a facial Asymmetry Index value into a screening flag. */
export function classifyFacialAsymmetry(asi: number): SDNEFlag {
  if (asi < FACIAL_ASYMMETRY_AsI.greenMax) return 'GREEN'
  if (asi < FACIAL_ASYMMETRY_AsI.yellowMax) return 'YELLOW'
  return 'RED'
}

// Clinical profile types for mapping referral reasons
export type SDNEClinicalProfile =
  | 'healthy_normal'      // All GREEN baseline
  | 'parkinsonism'        // Motor RED, Gait YELLOW
  | 'cognitive_impairment'// Cognition RED, Language YELLOW
  | 'fall_risk'           // Gait RED, Cognition YELLOW
  | 'post_stroke'         // Facial RED, Motor YELLOW
