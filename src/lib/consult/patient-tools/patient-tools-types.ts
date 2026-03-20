/**
 * Types for Phase 5 — Patient Web Tools
 *
 * Covers interactive body map markers and phone-based device measurements
 * (finger tapping, tremor detection, balance assessment).
 */

// ── Body Map ──────────────────────────────────────────────────────────────────

export type BodyRegion =
  | 'head'
  | 'face_left'
  | 'face_right'
  | 'neck'
  | 'chest'
  | 'abdomen'
  | 'upper_back'
  | 'lower_back'
  | 'shoulder_left'
  | 'shoulder_right'
  | 'upper_arm_left'
  | 'upper_arm_right'
  | 'forearm_left'
  | 'forearm_right'
  | 'hand_left'
  | 'hand_right'
  | 'hip_left'
  | 'hip_right'
  | 'thigh_left'
  | 'thigh_right'
  | 'knee_left'
  | 'knee_right'
  | 'calf_left'
  | 'calf_right'
  | 'foot_left'
  | 'foot_right'

export type SymptomType = 'pain' | 'numbness' | 'tingling' | 'weakness' | 'stiffness' | 'spasm'

export type Severity = 'mild' | 'moderate' | 'severe'

export type Laterality = 'left' | 'right' | 'bilateral' | 'midline'

export interface BodyMapMarker {
  id: string
  region: BodyRegion
  symptom_type: SymptomType
  severity: Severity
  laterality: Laterality
  onset: string        // free-text e.g. "2 weeks ago"
  notes: string
  created_at: string
}

/** Display metadata for each body region (label + SVG path data). */
export interface BodyRegionMeta {
  id: BodyRegion
  label: string
  laterality: Laterality
  /** SVG path "d" attribute for the clickable zone. */
  path: string
  /** Center point for marker dot placement. */
  center: { x: number; y: number }
}

// ── Device Measurements ───────────────────────────────────────────────────────

export type MeasurementType =
  | 'finger_tapping'
  | 'tremor_detection'
  | 'postural_sway'

export type HandSide = 'left' | 'right'

/** Result of a single finger-tapping test (10-second window). */
export interface FingerTappingResult {
  type: 'finger_tapping'
  hand: HandSide
  total_taps: number
  /** Taps per second, averaged over the test window. */
  tapping_rate: number
  /** Coefficient of variation (SD / mean) of inter-tap intervals. Lower = more regular. */
  regularity_cv: number
  /** Raw inter-tap intervals in ms. */
  intervals_ms: number[]
  duration_ms: number
}

/** Result of a tremor detection session (10-second hold). */
export interface TremorResult {
  type: 'tremor_detection'
  hand: HandSide
  /** RMS acceleration magnitude (m/s²). Higher = more tremor. */
  rms_acceleration: number
  /** Dominant frequency in Hz (from FFT). PD rest tremor ~4-6 Hz. */
  dominant_frequency_hz: number | null
  /** Peak acceleration (m/s²). */
  peak_acceleration: number
  /** Clinical classification based on RMS. */
  classification: 'none' | 'minimal' | 'mild' | 'moderate' | 'severe'
  duration_ms: number
}

/** Result of a postural sway test (30-second stand). */
export interface PosturalSwayResult {
  type: 'postural_sway'
  /** Total sway path length in degrees. */
  sway_path_length: number
  /** Mean velocity of sway (deg/s). */
  mean_sway_velocity: number
  /** Anterior-posterior range of sway (degrees). */
  ap_range: number
  /** Medial-lateral range of sway (degrees). */
  ml_range: number
  duration_ms: number
}

export type DeviceMeasurementResult =
  | FingerTappingResult
  | TremorResult
  | PosturalSwayResult

/** Full measurement record as stored in the database. */
export interface DeviceMeasurement {
  id: string
  consult_id: string | null
  patient_id: string | null
  measurement_type: MeasurementType
  result: DeviceMeasurementResult
  device_info: {
    user_agent: string
    platform: string
    screen_width: number
    screen_height: number
  }
  created_at: string
}

// ── Combined patient tools submission ─────────────────────────────────────────

export interface PatientToolsSubmission {
  consult_id?: string
  patient_id?: string
  body_map_markers: Omit<BodyMapMarker, 'id' | 'created_at'>[]
  device_measurements: Omit<DeviceMeasurement, 'id' | 'created_at' | 'device_info'>[]
}
