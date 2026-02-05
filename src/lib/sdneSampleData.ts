/**
 * SDNE Sample Data & Referral Mapping
 *
 * 5 clinical archetypes matched to referral reason patterns.
 * Maps OPSAmplehtml chief complaints to appropriate SDNE profiles.
 */

import {
  SDNESessionResult,
  SDNETaskResult,
  SDNEQualityMetrics,
  SDNEDomain,
  SDNEFlag,
  SDNEClinicalProfile,
} from './sdneTypes'

// ─── Helper functions ──────────────────────────────────────────────

function quality(
  validity: number,
  sensor: number,
  artifacts: number,
  notes: string[] = []
): SDNEQualityMetrics {
  return {
    validity,
    sensorAvailability: sensor,
    calibrationValid: true,
    artifactCount: artifacts,
    qcNotes: notes,
  }
}

function task(
  id: string,
  name: string,
  domain: SDNEDomain,
  flag: SDNEFlag,
  durationSec: number,
  metrics: Record<string, unknown>,
  q: SDNEQualityMetrics
): SDNETaskResult {
  return {
    taskId: id,
    taskName: name,
    domain,
    flag,
    durationSeconds: durationSec,
    completed: true,
    quality: q,
    metrics,
  }
}

const goodQ = quality(0.97, 0.99, 0, [])
const okQ = quality(0.92, 0.95, 1, [])
const warnQ = (notes: string[]) => quality(0.88, 0.93, 2, notes)

// ═══════════════════════════════════════════════════════════════════
// PROFILE 1: Healthy Normal — All GREEN baseline
// ═══════════════════════════════════════════════════════════════════
const healthyNormalTasks: SDNETaskResult[] = [
  task('T00', 'Setup & Calibration', 'Setup', 'GREEN', 82, { eye_calibration_error_deg: 0.62, hand_tracking_confidence: 0.95 }, goodQ),
  task('T01', 'Orientation', 'Cognition', 'GREEN', 28, { correct_count: 5, total_questions: 5, mean_response_time_seconds: 1.8 }, goodQ),
  task('T02', '3-Word Registration', 'Cognition', 'GREEN', 18, { words_recalled: 3, trials_to_learn: 1 }, goodQ),
  task('T03', 'Digit Span Forward', 'Cognition', 'GREEN', 36, { max_span_achieved: 6, total_trials: 5 }, goodQ),
  task('T04', 'Horizontal Saccades', 'Oculomotor', 'GREEN', 29, { mean_accuracy_pct: 94.2, mean_latency_ms: 195, asymmetry_index: 0.04 }, goodQ),
  task('T05', 'Smooth Pursuit', 'Oculomotor', 'GREEN', 30, { horizontal_gain: 0.92, vertical_gain: 0.89, saccadic_intrusions: 2 }, goodQ),
  task('T06', 'Fixation & Convergence', 'Oculomotor', 'GREEN', 19, { bcea_deg2: 0.38, npc_cm: 7.5, nystagmus_detected: false }, goodQ),
  task('T07', 'Facial Activation', 'Facial', 'GREEN', 42, { asymmetry_index: 0.04, movements_completed: 6 }, goodQ),
  task('T08', 'Pa-Ta-Ka (DDK)', 'Facial', 'GREEN', 18, { syllable_rate_hz: 5.8, regularity_cv: 0.09 }, goodQ),
  task('T09', 'Rest Tremor', 'Motor', 'GREEN', 19, { right_amplitude_mm: 0.3, left_amplitude_mm: 0.25, frequency_hz: 0 }, goodQ),
  task('T10', 'Postural Tremor', 'Motor', 'GREEN', 19, { right_amplitude_mm: 0.4, left_amplitude_mm: 0.35, frequency_hz: 0 }, goodQ),
  task('T11', 'Finger Tapping', 'Motor', 'GREEN', 28, { right_rate_hz: 5.2, left_rate_hz: 4.9, asymmetry_pct: 5.8, decrement_pct: 8.2 }, goodQ),
  task('T12', 'Finger-to-Target', 'Coordination', 'GREEN', 38, { mean_endpoint_error_mm: 10.5, intention_tremor_mm: 2.8 }, goodQ),
  task('T13', 'Semantic Fluency', 'Language', 'GREEN', 48, { valid_words: 19, cluster_count: 5, switch_count: 7 }, goodQ),
  task('T14', 'Confrontation Naming', 'Language', 'GREEN', 28, { correct_count: 6, total_items: 6, mean_latency_ms: 1650 }, goodQ),
  task('T15', '10-Meter Walk', 'Gait', 'GREEN', 42, { gait_speed_m_s: 1.18, cadence_steps_min: 118, stride_length_m: 0.72, stride_cv_pct: 3.8 }, goodQ),
  task('T16', 'Timed Up-and-Go', 'Gait', 'GREEN', 38, { total_time_s: 8.4, sit_to_stand_s: 1.2, turn_time_s: 1.8 }, goodQ),
  task('T17', '3-Word Delayed Recall', 'Cognition', 'GREEN', 18, { free_recall_count: 3, cued_recall_count: 0 }, goodQ),
]

const healthyNormal: SDNESessionResult = {
  sessionId: 'sdne-healthy-normal',
  examDate: new Date().toISOString(),
  totalDurationSeconds: 862,
  completed: true,
  sessionFlag: 'GREEN',
  confidenceLevel: 'HIGH',
  domainFlags: {
    Setup: 'GREEN',
    Cognition: 'GREEN',
    Oculomotor: 'GREEN',
    Facial: 'GREEN',
    Motor: 'GREEN',
    Coordination: 'GREEN',
    Language: 'GREEN',
    Gait: 'GREEN',
  },
  taskResults: healthyNormalTasks,
  detectedPatterns: [],
  addOnRecommendations: [],
}

// ═══════════════════════════════════════════════════════════════════
// PROFILE 2: Parkinsonism — Motor RED, Gait YELLOW
// ═══════════════════════════════════════════════════════════════════
const parkinsonismTasks: SDNETaskResult[] = [
  task('T00', 'Setup & Calibration', 'Setup', 'GREEN', 88, { eye_calibration_error_deg: 0.71, hand_tracking_confidence: 0.93 }, goodQ),
  task('T01', 'Orientation', 'Cognition', 'GREEN', 30, { correct_count: 5, total_questions: 5, mean_response_time_seconds: 2.1 }, goodQ),
  task('T02', '3-Word Registration', 'Cognition', 'GREEN', 22, { words_recalled: 3, trials_to_learn: 2 }, goodQ),
  task('T03', 'Digit Span Forward', 'Cognition', 'GREEN', 38, { max_span_achieved: 5, total_trials: 5 }, goodQ),
  task('T04', 'Horizontal Saccades', 'Oculomotor', 'GREEN', 30, { mean_accuracy_pct: 88.5, mean_latency_ms: 215, asymmetry_index: 0.06 }, goodQ),
  task('T05', 'Smooth Pursuit', 'Oculomotor', 'YELLOW', 30, { horizontal_gain: 0.78, vertical_gain: 0.81, saccadic_intrusions: 6 }, okQ),
  task('T06', 'Fixation & Convergence', 'Oculomotor', 'GREEN', 20, { bcea_deg2: 0.52, npc_cm: 8.8, nystagmus_detected: false }, goodQ),
  task('T07', 'Facial Activation', 'Facial', 'YELLOW', 44, { asymmetry_index: 0.12, movements_completed: 6 }, warnQ(['Reduced facial expressivity noted — possible hypomimia'])),
  task('T08', 'Pa-Ta-Ka (DDK)', 'Facial', 'GREEN', 19, { syllable_rate_hz: 4.8, regularity_cv: 0.12 }, goodQ),
  task('T09', 'Rest Tremor', 'Motor', 'RED', 20, { right_amplitude_mm: 3.8, left_amplitude_mm: 2.4, frequency_hz: 4.8 }, warnQ(['Bilateral rest tremor detected — right > left', 'Frequency consistent with parkinsonian tremor (4-6 Hz)'])),
  task('T10', 'Postural Tremor', 'Motor', 'YELLOW', 20, { right_amplitude_mm: 2.1, left_amplitude_mm: 1.6, frequency_hz: 5.2 }, warnQ(['Mild postural tremor — re-emergent pattern'])),
  task('T11', 'Finger Tapping', 'Motor', 'RED', 30, { right_rate_hz: 3.1, left_rate_hz: 3.8, asymmetry_pct: 18.4, decrement_pct: 32.5 }, warnQ(['Reduced tapping rate bilaterally', 'Significant decrement: 32.5% — suggests bradykinesia', 'Right hand more affected than left'])),
  task('T12', 'Finger-to-Target', 'Coordination', 'GREEN', 39, { mean_endpoint_error_mm: 14.2, intention_tremor_mm: 3.5 }, goodQ),
  task('T13', 'Semantic Fluency', 'Language', 'GREEN', 49, { valid_words: 16, cluster_count: 4, switch_count: 6 }, goodQ),
  task('T14', 'Confrontation Naming', 'Language', 'GREEN', 29, { correct_count: 6, total_items: 6, mean_latency_ms: 1820 }, goodQ),
  task('T15', '10-Meter Walk', 'Gait', 'YELLOW', 44, { gait_speed_m_s: 0.88, cadence_steps_min: 102, stride_length_m: 0.58, stride_cv_pct: 7.2 }, warnQ(['Reduced stride length', 'Mildly reduced arm swing observed'])),
  task('T16', 'Timed Up-and-Go', 'Gait', 'YELLOW', 40, { total_time_s: 12.8, sit_to_stand_s: 2.4, turn_time_s: 2.9 }, warnQ(['Borderline TUG time', 'Slow turn — required extra steps'])),
  task('T17', '3-Word Delayed Recall', 'Cognition', 'GREEN', 19, { free_recall_count: 2, cued_recall_count: 1 }, goodQ),
]

const parkinsonism: SDNESessionResult = {
  sessionId: 'sdne-parkinsonism',
  examDate: new Date().toISOString(),
  totalDurationSeconds: 885,
  completed: true,
  sessionFlag: 'RED',
  confidenceLevel: 'HIGH',
  domainFlags: {
    Setup: 'GREEN',
    Cognition: 'GREEN',
    Oculomotor: 'YELLOW',
    Facial: 'YELLOW',
    Motor: 'RED',
    Coordination: 'GREEN',
    Language: 'GREEN',
    Gait: 'YELLOW',
  },
  taskResults: parkinsonismTasks,
  detectedPatterns: [
    {
      patternId: 'PATTERN_PARKINSONISM',
      description: 'Findings may be consistent with parkinsonism',
      confidence: 'HIGH',
      supportingTasks: ['T09', 'T11', 'T07', 'T15'],
      supportingFindings: [
        'Bilateral rest tremor (R > L) at 4.8 Hz',
        'Finger tapping bradykinesia with 32.5% decrement',
        'Reduced facial expressivity (possible hypomimia)',
        'Reduced stride length and arm swing',
      ],
    },
  ],
  addOnRecommendations: [
    {
      addOnId: 'B-Ext',
      name: 'Extended Motor Assessment',
      rationale: 'Motor domain RED — detailed tremor characterization, rigidity assessment, and bradykinesia quantification recommended',
      estimatedDurationSeconds: 180,
    },
    {
      addOnId: 'C-Ext',
      name: 'Extended Gait Assessment',
      rationale: 'Gait domain borderline with parkinsonism pattern — detailed gait analysis and dual-task walking recommended',
      estimatedDurationSeconds: 240,
    },
  ],
}

// ═══════════════════════════════════════════════════════════════════
// PROFILE 3: Cognitive Impairment — Cognition RED, Language YELLOW
// ═══════════════════════════════════════════════════════════════════
const cognitiveImpairmentTasks: SDNETaskResult[] = [
  task('T00', 'Setup & Calibration', 'Setup', 'GREEN', 95, { eye_calibration_error_deg: 0.78, hand_tracking_confidence: 0.91 }, goodQ),
  task('T01', 'Orientation', 'Cognition', 'YELLOW', 35, { correct_count: 3, total_questions: 5, mean_response_time_seconds: 3.8 }, warnQ(['Incorrect on date and day of week'])),
  task('T02', '3-Word Registration', 'Cognition', 'YELLOW', 28, { words_recalled: 3, trials_to_learn: 3 }, warnQ(['Required 3 trials to learn all words'])),
  task('T03', 'Digit Span Forward', 'Cognition', 'YELLOW', 42, { max_span_achieved: 4, total_trials: 6 }, warnQ(['Borderline attention: span of 4'])),
  task('T04', 'Horizontal Saccades', 'Oculomotor', 'GREEN', 30, { mean_accuracy_pct: 86.1, mean_latency_ms: 228, asymmetry_index: 0.07 }, goodQ),
  task('T05', 'Smooth Pursuit', 'Oculomotor', 'GREEN', 30, { horizontal_gain: 0.86, vertical_gain: 0.83, saccadic_intrusions: 4 }, goodQ),
  task('T06', 'Fixation & Convergence', 'Oculomotor', 'GREEN', 20, { bcea_deg2: 0.48, npc_cm: 9.2, nystagmus_detected: false }, goodQ),
  task('T07', 'Facial Activation', 'Facial', 'GREEN', 43, { asymmetry_index: 0.05, movements_completed: 6 }, goodQ),
  task('T08', 'Pa-Ta-Ka (DDK)', 'Facial', 'GREEN', 19, { syllable_rate_hz: 5.1, regularity_cv: 0.11 }, goodQ),
  task('T09', 'Rest Tremor', 'Motor', 'GREEN', 20, { right_amplitude_mm: 0.35, left_amplitude_mm: 0.28, frequency_hz: 0 }, goodQ),
  task('T10', 'Postural Tremor', 'Motor', 'GREEN', 20, { right_amplitude_mm: 0.42, left_amplitude_mm: 0.38, frequency_hz: 0 }, goodQ),
  task('T11', 'Finger Tapping', 'Motor', 'GREEN', 29, { right_rate_hz: 4.6, left_rate_hz: 4.4, asymmetry_pct: 4.3, decrement_pct: 10.1 }, goodQ),
  task('T12', 'Finger-to-Target', 'Coordination', 'GREEN', 39, { mean_endpoint_error_mm: 12.8, intention_tremor_mm: 3.1 }, goodQ),
  task('T13', 'Semantic Fluency', 'Language', 'YELLOW', 50, { valid_words: 11, cluster_count: 3, switch_count: 4 }, warnQ(['Reduced fluency: 11 animals in 45 seconds', 'Low switching — possible executive dysfunction'])),
  task('T14', 'Confrontation Naming', 'Language', 'YELLOW', 30, { correct_count: 5, total_items: 6, mean_latency_ms: 2850 }, warnQ(['Missed 1 item', 'Elevated response latency'])),
  task('T15', '10-Meter Walk', 'Gait', 'GREEN', 43, { gait_speed_m_s: 1.02, cadence_steps_min: 110, stride_length_m: 0.65, stride_cv_pct: 5.1 }, goodQ),
  task('T16', 'Timed Up-and-Go', 'Gait', 'GREEN', 39, { total_time_s: 9.6, sit_to_stand_s: 1.5, turn_time_s: 2.1 }, goodQ),
  task('T17', '3-Word Delayed Recall', 'Cognition', 'RED', 20, { free_recall_count: 1, cued_recall_count: 1 }, warnQ(['Significant recall deficit: 1/3 free recall', 'Only 1 additional word with cueing'])),
]

const cognitiveImpairment: SDNESessionResult = {
  sessionId: 'sdne-cognitive-impairment',
  examDate: new Date().toISOString(),
  totalDurationSeconds: 846,
  completed: true,
  sessionFlag: 'RED',
  confidenceLevel: 'HIGH',
  domainFlags: {
    Setup: 'GREEN',
    Cognition: 'RED',
    Oculomotor: 'GREEN',
    Facial: 'GREEN',
    Motor: 'GREEN',
    Coordination: 'GREEN',
    Language: 'YELLOW',
    Gait: 'GREEN',
  },
  taskResults: cognitiveImpairmentTasks,
  detectedPatterns: [
    {
      patternId: 'PATTERN_COGNITIVE_IMPAIRMENT',
      description: 'Findings may be consistent with mild cognitive impairment',
      confidence: 'HIGH',
      supportingTasks: ['T01', 'T03', 'T13', 'T17'],
      supportingFindings: [
        'Impaired orientation (3/5)',
        'Borderline digit span (4)',
        'Reduced semantic fluency (11 words)',
        'Significant delayed recall deficit (1/3 free, 2/3 total)',
      ],
    },
  ],
  addOnRecommendations: [
    {
      addOnId: 'F-Ext',
      name: 'Extended Cognitive Assessment',
      rationale: 'Cognition domain RED with impairment pattern — detailed memory, executive function, and visuospatial assessment recommended',
      estimatedDurationSeconds: 300,
    },
    {
      addOnId: 'D-Ext',
      name: 'Extended Language Assessment',
      rationale: 'Language domain borderline with word-finding difficulty — detailed naming, repetition, and comprehension assessment recommended',
      estimatedDurationSeconds: 180,
    },
  ],
}

// ═══════════════════════════════════════════════════════════════════
// PROFILE 4: Fall Risk / NPH Pattern — Gait RED, Cognition YELLOW
// ═══════════════════════════════════════════════════════════════════
const fallRiskTasks: SDNETaskResult[] = [
  task('T00', 'Setup & Calibration', 'Setup', 'GREEN', 90, { eye_calibration_error_deg: 0.82, hand_tracking_confidence: 0.90 }, goodQ),
  task('T01', 'Orientation', 'Cognition', 'GREEN', 32, { correct_count: 4, total_questions: 5, mean_response_time_seconds: 2.6 }, goodQ),
  task('T02', '3-Word Registration', 'Cognition', 'GREEN', 24, { words_recalled: 3, trials_to_learn: 2 }, goodQ),
  task('T03', 'Digit Span Forward', 'Cognition', 'YELLOW', 40, { max_span_achieved: 4, total_trials: 6 }, warnQ(['Borderline attention: span of 4'])),
  task('T04', 'Horizontal Saccades', 'Oculomotor', 'GREEN', 30, { mean_accuracy_pct: 84.8, mean_latency_ms: 238, asymmetry_index: 0.08 }, goodQ),
  task('T05', 'Smooth Pursuit', 'Oculomotor', 'GREEN', 30, { horizontal_gain: 0.85, vertical_gain: 0.82, saccadic_intrusions: 5 }, goodQ),
  task('T06', 'Fixation & Convergence', 'Oculomotor', 'GREEN', 20, { bcea_deg2: 0.55, npc_cm: 9.8, nystagmus_detected: false }, goodQ),
  task('T07', 'Facial Activation', 'Facial', 'GREEN', 43, { asymmetry_index: 0.06, movements_completed: 6 }, goodQ),
  task('T08', 'Pa-Ta-Ka (DDK)', 'Facial', 'GREEN', 19, { syllable_rate_hz: 4.9, regularity_cv: 0.13 }, goodQ),
  task('T09', 'Rest Tremor', 'Motor', 'GREEN', 20, { right_amplitude_mm: 0.42, left_amplitude_mm: 0.38, frequency_hz: 0 }, goodQ),
  task('T10', 'Postural Tremor', 'Motor', 'GREEN', 20, { right_amplitude_mm: 0.48, left_amplitude_mm: 0.45, frequency_hz: 0 }, goodQ),
  task('T11', 'Finger Tapping', 'Motor', 'GREEN', 29, { right_rate_hz: 4.3, left_rate_hz: 4.1, asymmetry_pct: 4.7, decrement_pct: 12.0 }, goodQ),
  task('T12', 'Finger-to-Target', 'Coordination', 'GREEN', 39, { mean_endpoint_error_mm: 15.5, intention_tremor_mm: 3.8 }, goodQ),
  task('T13', 'Semantic Fluency', 'Language', 'GREEN', 49, { valid_words: 15, cluster_count: 4, switch_count: 5 }, goodQ),
  task('T14', 'Confrontation Naming', 'Language', 'GREEN', 29, { correct_count: 6, total_items: 6, mean_latency_ms: 2100 }, goodQ),
  task('T15', '10-Meter Walk', 'Gait', 'RED', 45, { gait_speed_m_s: 0.68, cadence_steps_min: 92, stride_length_m: 0.48, stride_cv_pct: 12.5 }, warnQ(['Gait speed below 0.8 m/s threshold', 'Short shuffling steps', 'High stride variability: 12.5%', 'Magnetic gait pattern noted'])),
  task('T16', 'Timed Up-and-Go', 'Gait', 'RED', 42, { total_time_s: 18.6, sit_to_stand_s: 3.2, turn_time_s: 3.8 }, warnQ(['Mobility impairment — fall risk: TUG 18.6 seconds', 'Slow sit-to-stand: 3.2s', 'Slow turn: 3.8s — needed multiple steps', 'Required steadying during turn'])),
  task('T17', '3-Word Delayed Recall', 'Cognition', 'YELLOW', 20, { free_recall_count: 2, cued_recall_count: 1 }, warnQ(['Partial recall: 2/3 free, 3/3 with cues'])),
]

const fallRisk: SDNESessionResult = {
  sessionId: 'sdne-fall-risk',
  examDate: new Date().toISOString(),
  totalDurationSeconds: 955,
  completed: true,
  sessionFlag: 'RED',
  confidenceLevel: 'HIGH',
  domainFlags: {
    Setup: 'GREEN',
    Cognition: 'YELLOW',
    Oculomotor: 'GREEN',
    Facial: 'GREEN',
    Motor: 'GREEN',
    Coordination: 'GREEN',
    Language: 'GREEN',
    Gait: 'RED',
  },
  taskResults: fallRiskTasks,
  detectedPatterns: [
    {
      patternId: 'PATTERN_FALL_RISK',
      description: 'Elevated fall risk based on gait and mobility findings',
      confidence: 'HIGH',
      supportingTasks: ['T15', 'T16'],
      supportingFindings: [
        'Gait speed 0.68 m/s (below 0.8 m/s threshold)',
        'TUG 18.6 seconds (well above 14s fall-risk threshold)',
        'High stride variability (12.5%)',
        'Magnetic gait pattern with shuffling steps',
      ],
    },
    {
      patternId: 'PATTERN_NPH_TRIAD',
      description: 'Findings may warrant evaluation for normal pressure hydrocephalus',
      confidence: 'MEDIUM',
      supportingTasks: ['T15', 'T16', 'T03', 'T17'],
      supportingFindings: [
        'Magnetic gait pattern',
        'Borderline cognitive findings (digit span, delayed recall)',
        'Note: urinary symptoms should be assessed clinically to complete triad evaluation',
      ],
    },
  ],
  addOnRecommendations: [
    {
      addOnId: 'C-Ext',
      name: 'Extended Gait Assessment',
      rationale: 'Gait domain RED with fall risk — detailed balance testing, dual-task gait, and Romberg assessment recommended',
      estimatedDurationSeconds: 240,
    },
    {
      addOnId: 'C-DT',
      name: 'Dual-Task Gait',
      rationale: 'Cognitive-gait interaction assessment — count backward while walking to evaluate dual-task cost',
      estimatedDurationSeconds: 120,
    },
  ],
}

// ═══════════════════════════════════════════════════════════════════
// PROFILE 5: Post-Stroke — Facial RED, Motor YELLOW
// ═══════════════════════════════════════════════════════════════════
const postStrokeTasks: SDNETaskResult[] = [
  task('T00', 'Setup & Calibration', 'Setup', 'GREEN', 85, { eye_calibration_error_deg: 0.68, hand_tracking_confidence: 0.94 }, goodQ),
  task('T01', 'Orientation', 'Cognition', 'GREEN', 30, { correct_count: 5, total_questions: 5, mean_response_time_seconds: 2.3 }, goodQ),
  task('T02', '3-Word Registration', 'Cognition', 'GREEN', 20, { words_recalled: 3, trials_to_learn: 1 }, goodQ),
  task('T03', 'Digit Span Forward', 'Cognition', 'GREEN', 37, { max_span_achieved: 5, total_trials: 5 }, goodQ),
  task('T04', 'Horizontal Saccades', 'Oculomotor', 'YELLOW', 30, { mean_accuracy_pct: 74.2, mean_latency_ms: 285, asymmetry_index: 0.18 }, warnQ(['Directional asymmetry: leftward saccades slower', 'Hypometric saccades to the left'])),
  task('T05', 'Smooth Pursuit', 'Oculomotor', 'YELLOW', 30, { horizontal_gain: 0.72, vertical_gain: 0.80, saccadic_intrusions: 8 }, warnQ(['Reduced horizontal pursuit gain', 'Frequent saccadic intrusions'])),
  task('T06', 'Fixation & Convergence', 'Oculomotor', 'GREEN', 20, { bcea_deg2: 0.62, npc_cm: 10.5, nystagmus_detected: false }, goodQ),
  task('T07', 'Facial Activation', 'Facial', 'RED', 45, { asymmetry_index: 0.28, movements_completed: 6 }, warnQ(['Significant lower face asymmetry — right nasolabial fold flattened', 'Upper face relatively symmetric', 'Pattern consistent with central facial weakness'])),
  task('T08', 'Pa-Ta-Ka (DDK)', 'Facial', 'YELLOW', 20, { syllable_rate_hz: 4.2, regularity_cv: 0.18 }, warnQ(['Mildly reduced articulation rate', 'Irregular rhythm'])),
  task('T09', 'Rest Tremor', 'Motor', 'GREEN', 20, { right_amplitude_mm: 0.32, left_amplitude_mm: 0.30, frequency_hz: 0 }, goodQ),
  task('T10', 'Postural Tremor', 'Motor', 'GREEN', 20, { right_amplitude_mm: 0.45, left_amplitude_mm: 0.40, frequency_hz: 0 }, goodQ),
  task('T11', 'Finger Tapping', 'Motor', 'YELLOW', 30, { right_rate_hz: 3.8, left_rate_hz: 4.8, asymmetry_pct: 20.8, decrement_pct: 14.0 }, warnQ(['Right hand tapping rate reduced relative to left', 'Significant hand asymmetry: 20.8%'])),
  task('T12', 'Finger-to-Target', 'Coordination', 'GREEN', 39, { mean_endpoint_error_mm: 16.2, intention_tremor_mm: 3.2 }, goodQ),
  task('T13', 'Semantic Fluency', 'Language', 'YELLOW', 50, { valid_words: 12, cluster_count: 3, switch_count: 4 }, warnQ(['Reduced fluency: 12 animals in 45 seconds'])),
  task('T14', 'Confrontation Naming', 'Language', 'GREEN', 29, { correct_count: 5, total_items: 6, mean_latency_ms: 2400 }, okQ),
  task('T15', '10-Meter Walk', 'Gait', 'YELLOW', 44, { gait_speed_m_s: 0.85, cadence_steps_min: 98, stride_length_m: 0.55, stride_cv_pct: 8.8 }, warnQ(['Mildly reduced gait speed', 'Asymmetric stride pattern'])),
  task('T16', 'Timed Up-and-Go', 'Gait', 'YELLOW', 40, { total_time_s: 13.2, sit_to_stand_s: 2.0, turn_time_s: 2.6 }, warnQ(['Borderline TUG time: 13.2s'])),
  task('T17', '3-Word Delayed Recall', 'Cognition', 'GREEN', 19, { free_recall_count: 3, cued_recall_count: 0 }, goodQ),
]

const postStroke: SDNESessionResult = {
  sessionId: 'sdne-post-stroke',
  examDate: new Date().toISOString(),
  totalDurationSeconds: 882,
  completed: true,
  sessionFlag: 'RED',
  confidenceLevel: 'HIGH',
  domainFlags: {
    Setup: 'GREEN',
    Cognition: 'GREEN',
    Oculomotor: 'YELLOW',
    Facial: 'RED',
    Motor: 'YELLOW',
    Coordination: 'GREEN',
    Language: 'YELLOW',
    Gait: 'YELLOW',
  },
  taskResults: postStrokeTasks,
  detectedPatterns: [
    {
      patternId: 'PATTERN_CENTRAL_FACIAL',
      description: 'Lower facial asymmetry with upper face sparing may be consistent with central facial weakness',
      confidence: 'HIGH',
      supportingTasks: ['T07', 'T04', 'T11'],
      supportingFindings: [
        'Right lower face asymmetry (nasolabial fold flattening)',
        'Upper face relatively symmetric',
        'Ipsilateral saccade asymmetry',
        'Right hand motor deficit (reduced finger tapping)',
      ],
    },
  ],
  addOnRecommendations: [
    {
      addOnId: 'G',
      name: 'Visual Field Assessment',
      rationale: 'Central facial pattern detected — visual field assessment recommended to evaluate for hemianopia',
      estimatedDurationSeconds: 120,
    },
    {
      addOnId: 'D-Ext',
      name: 'Extended Language Assessment',
      rationale: 'Language domain borderline with possible motor speech involvement — detailed assessment recommended',
      estimatedDurationSeconds: 180,
    },
  ],
}

// ═══════════════════════════════════════════════════════════════════
// Export profiles map
// ═══════════════════════════════════════════════════════════════════
export const SDNE_PROFILES: Record<SDNEClinicalProfile, SDNESessionResult> = {
  healthy_normal: healthyNormal,
  parkinsonism: parkinsonism,
  cognitive_impairment: cognitiveImpairment,
  fall_risk: fallRisk,
  post_stroke: postStroke,
}

// ═══════════════════════════════════════════════════════════════════
// Referral reason to profile mapping
// Maps OPSAmplehtml chief complaints to appropriate SDNE profiles
// ═══════════════════════════════════════════════════════════════════

/**
 * Map referral reasons / chief complaints to SDNE clinical profiles
 * Uses keyword matching against common consult sub-options
 */
export function mapReferralToSDNEProfile(
  chiefComplaints: string[] = [],
  consultCategories: string[] = []
): SDNEClinicalProfile {
  const complaints = chiefComplaints.map(c => c.toLowerCase()).join(' ')
  const categories = consultCategories.map(c => c.toLowerCase()).join(' ')
  const combined = complaints + ' ' + categories

  // Movement disorder referral → Parkinsonism pattern
  if (
    combined.includes('parkinson') ||
    combined.includes('tremor') ||
    combined.includes('movement') ||
    combined.includes('bradykinesia') ||
    combined.includes('rigidity') ||
    combined.includes('dystonia') ||
    combined.includes('chorea') ||
    combined.includes('huntington')
  ) {
    return 'parkinsonism'
  }

  // Memory concerns → MCI pattern
  if (
    combined.includes('memory') ||
    combined.includes('dementia') ||
    combined.includes('alzheimer') ||
    combined.includes('cognitive') ||
    combined.includes('confusion') ||
    combined.includes('forgetful') ||
    combined.includes('mild cognitive impairment') ||
    combined.includes('lewy body') ||
    combined.includes('frontotemporal')
  ) {
    return 'cognitive_impairment'
  }

  // Falls / balance → Fall Risk pattern
  if (
    combined.includes('fall') ||
    combined.includes('balance') ||
    combined.includes('gait') ||
    combined.includes('unsteady') ||
    combined.includes('nph') ||
    combined.includes('normal pressure hydrocephalus') ||
    combined.includes('vertigo') ||
    combined.includes('dizziness') ||
    combined.includes('ataxia')
  ) {
    return 'fall_risk'
  }

  // Stroke follow-up → Post-Stroke pattern
  if (
    combined.includes('stroke') ||
    combined.includes('tia') ||
    combined.includes('cerebrovascular') ||
    combined.includes('hemiparesis') ||
    combined.includes('hemiplegia') ||
    combined.includes('facial weakness') ||
    combined.includes('facial droop') ||
    combined.includes('bell') ||
    combined.includes('aphasia')
  ) {
    return 'post_stroke'
  }

  // Default: Healthy Normal
  return 'healthy_normal'
}

/**
 * Get SDNE session data for a patient based on their referral reason
 */
export function getSDNESessionForPatient(
  chiefComplaints: string[] = [],
  consultCategories: string[] = []
): SDNESessionResult {
  const profile = mapReferralToSDNEProfile(chiefComplaints, consultCategories)
  return { ...SDNE_PROFILES[profile] }
}

// ═══════════════════════════════════════════════════════════════════
// PATIENT-SPECIFIC SDNE EXAM HISTORIES
// Maps demo patients to their SDNE exam history with progression
// ═══════════════════════════════════════════════════════════════════

export interface SDNEPatientHistory {
  patientMrn: string
  patientName: string
  sessions: SDNESessionResult[]
}

/**
 * Generate a session with modified date and session ID
 */
function createHistoricalSession(
  baseSession: SDNESessionResult,
  sessionId: string,
  daysAgo: number,
  modifications?: Partial<SDNESessionResult>
): SDNESessionResult {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  return {
    ...baseSession,
    sessionId,
    examDate: date.toISOString(),
    ...modifications,
  }
}

/**
 * Maria Santos (MRN: 2024-00142)
 * Chief Complaints: Headache, Memory problems
 * Profile: Cognitive impairment with improving trend over 3 visits
 */
const mariaSantosHistory: SDNEPatientHistory = {
  patientMrn: '2024-00142',
  patientName: 'Maria Santos',
  sessions: [
    // Most recent exam (today) - Improved, now mostly GREEN with borderline cognition
    createHistoricalSession(
      SDNE_PROFILES.healthy_normal,
      'sdne-maria-003',
      0,
      {
        sessionFlag: 'YELLOW',
        domainFlags: {
          Setup: 'GREEN',
          Cognition: 'YELLOW',
          Oculomotor: 'GREEN',
          Facial: 'GREEN',
          Motor: 'GREEN',
          Coordination: 'GREEN',
          Language: 'GREEN',
          Gait: 'GREEN',
        },
        detectedPatterns: [
          {
            patternId: 'PATTERN_COGNITIVE_BORDERLINE',
            description: 'Borderline cognitive findings - improved from prior',
            confidence: 'MEDIUM',
            supportingTasks: ['T03', 'T17'],
            supportingFindings: [
              'Digit span 5 (improved from 4)',
              'Delayed recall 2/3 (improved from 1/3)',
              'Semantic fluency improved to 15 words',
            ],
          },
        ],
        addOnRecommendations: [],
      }
    ),
    // Second exam (30 days ago) - Moderate MCI findings
    createHistoricalSession(
      SDNE_PROFILES.cognitive_impairment,
      'sdne-maria-002',
      30,
      {
        sessionFlag: 'RED',
        confidenceLevel: 'HIGH',
        detectedPatterns: [
          {
            patternId: 'PATTERN_COGNITIVE_IMPAIRMENT',
            description: 'Findings consistent with mild cognitive impairment',
            confidence: 'HIGH',
            supportingTasks: ['T01', 'T03', 'T13', 'T17'],
            supportingFindings: [
              'Orientation 3/5',
              'Digit span 4',
              'Reduced semantic fluency (11 words)',
              'Significant delayed recall deficit (1/3)',
            ],
          },
        ],
      }
    ),
    // First exam (90 days ago) - Initial presentation with concern
    createHistoricalSession(
      SDNE_PROFILES.cognitive_impairment,
      'sdne-maria-001',
      90,
      {
        sessionFlag: 'RED',
        confidenceLevel: 'HIGH',
        detectedPatterns: [
          {
            patternId: 'PATTERN_COGNITIVE_IMPAIRMENT',
            description: 'Findings may be consistent with mild cognitive impairment',
            confidence: 'HIGH',
            supportingTasks: ['T01', 'T03', 'T13', 'T17'],
            supportingFindings: [
              'Orientation 3/5 (incorrect on date and day)',
              'Borderline digit span (4)',
              'Reduced semantic fluency (10 words)',
              'Significant delayed recall deficit (0/3 free, 1/3 cued)',
            ],
          },
          {
            patternId: 'PATTERN_APHASIA',
            description: 'Word-finding difficulty pattern noted',
            confidence: 'LOW',
            supportingTasks: ['T13', 'T14'],
            supportingFindings: [
              'Reduced semantic fluency',
              'Elevated naming latency (3100ms)',
            ],
          },
        ],
      }
    ),
  ],
}

/**
 * Robert Chen (MRN: 2024-00089)
 * Chief Complaints: Movement disorder / Tremor
 * Profile: Early Parkinson's with stable findings over 2 visits
 */
const robertChenHistory: SDNEPatientHistory = {
  patientMrn: '2024-00089',
  patientName: 'Robert Chen',
  sessions: [
    // Most recent exam (today) - Stable parkinsonism features
    createHistoricalSession(
      SDNE_PROFILES.parkinsonism,
      'sdne-robert-002',
      0,
      {
        sessionFlag: 'RED',
        confidenceLevel: 'HIGH',
        detectedPatterns: [
          {
            patternId: 'PATTERN_PARKINSONISM',
            description: 'Findings consistent with parkinsonism - stable from prior',
            confidence: 'HIGH',
            supportingTasks: ['T09', 'T11', 'T07', 'T15'],
            supportingFindings: [
              'Bilateral rest tremor (R > L) at 4.6 Hz - stable',
              'Finger tapping decrement 30% - slight improvement',
              'Reduced facial expressivity persists',
              'Gait speed 0.90 m/s - stable',
            ],
          },
        ],
      }
    ),
    // First exam (60 days ago) - Initial parkinsonism detection
    createHistoricalSession(
      SDNE_PROFILES.parkinsonism,
      'sdne-robert-001',
      60,
      {
        sessionFlag: 'RED',
        confidenceLevel: 'HIGH',
        detectedPatterns: [
          {
            patternId: 'PATTERN_PARKINSONISM',
            description: 'Findings may be consistent with parkinsonism',
            confidence: 'HIGH',
            supportingTasks: ['T09', 'T11', 'T07', 'T15'],
            supportingFindings: [
              'Bilateral rest tremor (R > L) at 4.8 Hz',
              'Finger tapping bradykinesia with 32.5% decrement',
              'Reduced facial expressivity (possible hypomimia)',
              'Reduced stride length and arm swing',
            ],
          },
        ],
        addOnRecommendations: [
          {
            addOnId: 'B-Ext',
            name: 'Extended Motor Assessment',
            rationale: 'Motor domain RED — detailed tremor characterization recommended',
            estimatedDurationSeconds: 180,
          },
          {
            addOnId: 'C-Ext',
            name: 'Extended Gait Assessment',
            rationale: 'Gait domain borderline — dual-task walking recommended',
            estimatedDurationSeconds: 240,
          },
        ],
      }
    ),
  ],
}

/**
 * Test Patient (MRN: 123123) - Default for new users
 * Chief Complaints: Various - uses healthy normal baseline
 * Profile: Healthy Normal with single exam
 */
const testPatientHistory: SDNEPatientHistory = {
  patientMrn: '123123',
  patientName: 'Test Patient',
  sessions: [
    createHistoricalSession(
      SDNE_PROFILES.healthy_normal,
      'sdne-test-001',
      7,
      {
        sessionFlag: 'GREEN',
        confidenceLevel: 'HIGH',
        detectedPatterns: [],
        addOnRecommendations: [],
      }
    ),
  ],
}

/**
 * Additional demo patients for comprehensive testing
 */

// Fall risk patient - Eleanor Vance (fictional)
const eleanorVanceHistory: SDNEPatientHistory = {
  patientMrn: '2024-00201',
  patientName: 'Eleanor Vance',
  sessions: [
    // Current exam - Fall risk with NPH workup
    createHistoricalSession(
      SDNE_PROFILES.fall_risk,
      'sdne-eleanor-002',
      0,
      {
        sessionFlag: 'RED',
        confidenceLevel: 'HIGH',
      }
    ),
    // Prior exam (45 days ago) - Initial gait concerns
    createHistoricalSession(
      SDNE_PROFILES.fall_risk,
      'sdne-eleanor-001',
      45,
      {
        sessionFlag: 'RED',
        confidenceLevel: 'HIGH',
        detectedPatterns: [
          {
            patternId: 'PATTERN_FALL_RISK',
            description: 'Elevated fall risk - recommend PT evaluation',
            confidence: 'HIGH',
            supportingTasks: ['T15', 'T16'],
            supportingFindings: [
              'Gait speed 0.65 m/s (below threshold)',
              'TUG 19.2 seconds (high fall risk)',
              'Magnetic gait pattern',
            ],
          },
        ],
      }
    ),
  ],
}

// Post-stroke patient - James Morrison (fictional)
const jamesMorrisonHistory: SDNEPatientHistory = {
  patientMrn: '2024-00315',
  patientName: 'James Morrison',
  sessions: [
    // Current exam - Improved from acute stroke
    createHistoricalSession(
      SDNE_PROFILES.post_stroke,
      'sdne-james-003',
      0,
      {
        sessionFlag: 'YELLOW',
        domainFlags: {
          Setup: 'GREEN',
          Cognition: 'GREEN',
          Oculomotor: 'GREEN',
          Facial: 'YELLOW',
          Motor: 'GREEN',
          Coordination: 'GREEN',
          Language: 'GREEN',
          Gait: 'GREEN',
        },
        detectedPatterns: [
          {
            patternId: 'PATTERN_CENTRAL_FACIAL_RESOLVING',
            description: 'Resolving central facial weakness - improved from prior',
            confidence: 'MEDIUM',
            supportingTasks: ['T07'],
            supportingFindings: [
              'Facial asymmetry index 0.12 (improved from 0.28)',
              'Motor function normalized',
              'Gait speed improved to 1.05 m/s',
            ],
          },
        ],
        addOnRecommendations: [],
      }
    ),
    // 30 days post-stroke
    createHistoricalSession(
      SDNE_PROFILES.post_stroke,
      'sdne-james-002',
      30,
      {
        sessionFlag: 'RED',
        confidenceLevel: 'HIGH',
      }
    ),
    // 60 days post-stroke (acute presentation)
    createHistoricalSession(
      SDNE_PROFILES.post_stroke,
      'sdne-james-001',
      60,
      {
        sessionFlag: 'RED',
        confidenceLevel: 'HIGH',
        detectedPatterns: [
          {
            patternId: 'PATTERN_CENTRAL_FACIAL',
            description: 'Acute central facial weakness with motor deficit',
            confidence: 'HIGH',
            supportingTasks: ['T07', 'T04', 'T11', 'T15'],
            supportingFindings: [
              'Significant right lower face asymmetry (index 0.32)',
              'Right hand motor deficit (finger tapping 2.8 Hz)',
              'Gait speed 0.72 m/s with asymmetric stride',
              'Saccade asymmetry with hypometric leftward saccades',
            ],
          },
        ],
      }
    ),
  ],
}

// Export patient histories map
export const SDNE_PATIENT_HISTORIES: Record<string, SDNEPatientHistory> = {
  '2024-00142': mariaSantosHistory,
  '2024-00089': robertChenHistory,
  '123123': testPatientHistory,
  '2024-00201': eleanorVanceHistory,
  '2024-00315': jamesMorrisonHistory,
}

/**
 * Get SDNE exam history for a specific patient by MRN
 * Returns all historical sessions for the patient
 */
export function getSDNEHistoryForPatient(mrn: string): SDNEPatientHistory | undefined {
  return SDNE_PATIENT_HISTORIES[mrn]
}

/**
 * Get the most recent SDNE session for a patient
 * Falls back to referral-based mapping if no patient history exists
 */
export function getLatestSDNESessionForPatient(
  mrn?: string,
  chiefComplaints: string[] = [],
  consultCategories: string[] = []
): SDNESessionResult {
  // First try patient-specific history
  if (mrn && SDNE_PATIENT_HISTORIES[mrn]) {
    const history = SDNE_PATIENT_HISTORIES[mrn]
    // Return the most recent session (first in array)
    return { ...history.sessions[0] }
  }

  // Fall back to referral-based mapping
  return getSDNESessionForPatient(chiefComplaints, consultCategories)
}

/**
 * Get all SDNE sessions for a patient (for historical comparison)
 */
export function getAllSDNESessionsForPatient(mrn: string): SDNESessionResult[] {
  const history = SDNE_PATIENT_HISTORIES[mrn]
  if (history) {
    return history.sessions.map(s => ({ ...s }))
  }
  return []
}
