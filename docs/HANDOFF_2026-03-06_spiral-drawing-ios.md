# Spiral Drawing Assessment — SevaroMonitor iOS Handoff

## Audience
Next Claude Code session working on the **SevaroMonitor iOS app** (`blondarb/SevaroMonitor` repo).

## Goal
Add a **spiral drawing assessment** to SevaroMonitor's Assessments tab. The patient traces an Archimedes spiral on the touchscreen; the app captures raw touch data, computes quantitative tremor/motor metrics, and uploads results to Supabase — exactly like the existing tremor and tapping assessments.

## Why
Digitized spiral analysis differentiates Parkinson's Disease from Essential Tremor with 85–95% accuracy. PD spirals show micrographia (progressive tightening), 4–6 Hz rest tremor, high pen pressure, and bradykinetic deceleration. ET spirals show large-amplitude 6–12 Hz oscillations perpendicular to the stroke. Tracking spiral metrics weekly gives objective between-visit motor progression data.

## Current Architecture (Follow This Pattern)

The app already has guided assessments that follow this flow:

1. **UI**: SwiftUI view under Assessments tab (see existing tremor/tapping views)
2. **Data capture**: Sensor data collected during timed task
3. **Score computation**: On-device metric calculation
4. **Upload**: Results posted to Supabase table via existing `SupabaseManager`
5. **Web display**: `MotorTrack.tsx` in OPSAmplehtml renders scores on the 30-day timeline

Existing assessment types for reference:
- `wearable_tremor_assessments` — accelerometer tremor % and intensity across 3 tasks (postural hold, pouring, drinking)
- `wearable_tapping_assessments` — finger tapping speed, accuracy, fatigue, asymmetry

## What to Build

### 1. Drawing Canvas View (`SpiralAssessmentView.swift`)

- Show a light gray **Archimedes spiral template** (3 turns, center-out) as a guide
- Instructions: "Using your index finger, trace the spiral from center to outside as smoothly as you can"
- Capture touch data at **120 Hz** (or max touch sample rate): `(x: CGFloat, y: CGFloat, timestamp: TimeInterval, force: CGFloat)`
  - Use `UIKit` touch handling via `UIViewRepresentable` — SwiftUI's gesture system doesn't give force/timestamp at high enough rate
  - `touchesMoved` with `coalescedTouches(for:)` to get interpolated high-frequency samples
  - `force` from `UITouch.force` (0 on devices without 3D Touch/Force Touch — store as `nil`)
- Draw the patient's stroke in real-time (teal line, 2pt) over the template
- **3 trials per hand** — show "Trial 1 of 3" counter, brief pause between trials
- Optional: "Now try with your other hand" prompt for asymmetry comparison
- "Done" button after all trials → compute metrics → upload

### 2. Feature Extraction (On-Device)

Compute these metrics from raw touch points for each trial:

**Primary metrics:**
| Metric | How to Compute |
|--------|---------------|
| `tremor_frequency_hz` | FFT of radial displacement (distance from spiral center) over time. Peak frequency in 2–15 Hz band. |
| `tremor_amplitude` | Peak-to-peak amplitude of the dominant frequency component from FFT |
| `drawing_speed_avg` | Mean of point-to-point velocity (distance/dt) across all samples |
| `drawing_speed_variance` | Variance of point-to-point velocity |
| `spiral_tightness_ratio` | Ratio of average inner-third loop spacing to outer-third loop spacing. <1.0 = micrographia (PD signature) |
| `smoothness_index` | Spectral Arc Length (SPARC): `−∫|d(V̂(f))/df|df` over normalized velocity spectrum. More negative = less smooth. |
| `pen_pressure_mean` | Mean of force values (nil if device lacks force sensing) |
| `pen_pressure_variance` | Variance of force values |
| `radial_deviation_mean` | Mean absolute deviation of drawn points from ideal Archimedes spiral path |
| `radial_deviation_max` | Maximum deviation from ideal path |
| `total_duration_ms` | Time from first touch to last touch |
| `pause_count` | Number of pauses where velocity < threshold for > 100ms |
| `pause_total_ms` | Total pause time |
| `direction_reversals` | Count of sign changes in angular velocity |

**Composite scores:**
| Metric | How to Compute |
|--------|---------------|
| `composite_score` | Weighted combination: 0.3×(1−norm_deviation) + 0.25×smoothness_norm + 0.2×speed_consistency + 0.15×tightness_norm + 0.1×(1−pause_ratio). Scale 0–100. |
| `pd_probability` | Rule-based initial version: high if tremor_freq 4–6 Hz AND tightness_ratio < 0.7 AND speed_variance high AND smoothness low. Sigmoid scaling 0.0–1.0. |
| `et_probability` | High if tremor_freq 6–12 Hz AND tremor_amplitude high AND tightness_ratio ~1.0 AND speed normal. Sigmoid scaling 0.0–1.0. |
| `classification` | `'pd_pattern'` if pd_prob > 0.6, `'et_pattern'` if et_prob > 0.6, `'normal'` if both < 0.3, else `'indeterminate'` |

**FFT implementation note:** Use Accelerate framework's `vDSP_fft_zrip` for efficient on-device FFT. The radial displacement signal (distance from center vs time) is what gets transformed — NOT x/y separately.

**Ideal spiral for deviation calculation:** Archimedes spiral in polar: `r = a + b·θ`. Fit `a` and `b` to the drawn points using least-squares, then compute per-point radial deviation from the fitted ideal.

### 3. Supabase Table

Create `wearable_spiral_assessments` in Supabase (migration in OPSAmplehtml repo):

```sql
CREATE TABLE wearable_spiral_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES wearable_patients(id) NOT NULL,
  assessment_date TIMESTAMPTZ DEFAULT NOW(),
  hand TEXT NOT NULL CHECK (hand IN ('left', 'right')),
  trial_number INT NOT NULL CHECK (trial_number BETWEEN 1 AND 5),

  -- Raw data
  raw_points JSONB NOT NULL,          -- [{x, y, t, pressure}, ...]
  sampling_rate_hz NUMERIC,

  -- Computed metrics
  tremor_frequency_hz NUMERIC,
  tremor_amplitude NUMERIC,
  drawing_speed_avg NUMERIC,
  drawing_speed_variance NUMERIC,
  spiral_tightness_ratio NUMERIC,
  smoothness_index NUMERIC,
  pen_pressure_mean NUMERIC,
  pen_pressure_variance NUMERIC,
  radial_deviation_mean NUMERIC,
  radial_deviation_max NUMERIC,
  total_duration_ms INT,
  pause_count INT,
  pause_total_ms INT,
  direction_reversals INT,

  -- Composite scores
  composite_score NUMERIC,
  pd_probability NUMERIC,
  et_probability NUMERIC,
  classification TEXT CHECK (classification IN ('pd_pattern', 'et_pattern', 'indeterminate', 'normal')),

  -- AI narrative (filled later by web pipeline)
  ai_narrative_id UUID REFERENCES wearable_clinical_narratives(id),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_spiral_patient_date ON wearable_spiral_assessments(patient_id, assessment_date DESC);
```

### 4. Upload to Supabase

Follow the same pattern as tremor/tapping assessment uploads in `SupabaseManager`:
- Upload each trial as a separate row
- `raw_points` JSON array should be compressed if > 5000 points (downsample to every-other point, or store separately)
- Include all computed metrics in the row
- Handle offline: queue for upload when connectivity returns (same as other assessments)

### 5. Assessment Flow UX

```
[Assessments Tab]
  ├── Tremor Assessment (existing)
  ├── Tapping Assessment (existing)
  ├── Verbal Fluency (existing)
  └── Spiral Drawing (NEW)
       ├── Instructions screen (brief, with animation showing expected spiral motion)
       ├── "Start" button
       ├── Drawing canvas (3 trials, dominant hand)
       ├── Optional: "Assess other hand?" prompt
       ├── Results summary (composite score, classification badge)
       └── "Upload" confirmation
```

## Key References

- **Design doc**: `docs/plans/2026-03-06-rpm-multi-specialty-expansion-design.md` Section 2.1
- **Existing assessment types**: `src/lib/wearable/types.ts` lines 165–230
- **MotorTrack display**: `src/components/wearable/MotorTrack.tsx`
- **Supabase tables**: `supabase/migrations/035_wearable_assessments.sql`, `036_enhanced_clinical_analysis.sql`

## What NOT to Build (Web Side — Separate Session)

These will be done in the OPSAmplehtml repo after the iOS work is complete:
- Supabase migration file (create it here as reference but apply in OPSAmplehtml)
- TypeScript `SpiralAssessment` interface in `types.ts`
- `MotorTrack.tsx` spiral sub-track rendering
- AI narrative pipeline for spiral interpretation
- Dashboard spiral trend visualization

## Success Criteria

1. Patient can draw 3 spiral trials per hand on iPhone/iPad
2. Touch data captured at ≥60 Hz with timestamps (120 Hz preferred)
3. All 14 primary metrics computed on-device before upload
4. PD/ET classification produces reasonable results (tremor_freq differentiates the two patterns)
5. Data uploads to `wearable_spiral_assessments` in Supabase
6. Assessment appears in Assessments tab alongside existing tremor/tapping/fluency tests
