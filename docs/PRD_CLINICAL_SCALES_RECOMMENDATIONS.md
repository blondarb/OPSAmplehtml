# PRD: Clinical Scales and Smart Recommendations Systems

## Document Information
- **Version**: 1.0
- **Last Updated**: February 2026
- **Status**: Engineering Specification
- **Target Audience**: Engineering teams rebuilding these features

---

## 1. Overview

This document specifies two interconnected clinical decision-support systems for Sevaro Clinical:

1. **Clinical Scales System** - A collection of validated clinical assessment scales that clinicians complete during patient encounters. Scales are dynamically suggested based on patient diagnoses and can be auto-populated from clinical notes using AI.

2. **Smart Recommendations System** - Evidence-based treatment plans sourced from the external neuro-plans repository, matched to patient diagnoses via ICD-10 codes, with recommendation items that clinicians can selectively add to the clinical note.

Both systems integrate deeply with the clinical note workflow, providing decision support at the point of care.

---

## 2. User Stories

### Clinical Scales

| ID | Role | Story | Acceptance Criteria |
|----|------|-------|---------------------|
| CS-1 | Clinician | I want to see relevant scales suggested based on my patient's diagnoses | When I select "Migraine" as a diagnosis, MIDAS and HIT-6 scales appear in the Clinical Scales section |
| CS-2 | Clinician | I want to complete a scale and see the interpreted results | After completing PHQ-9, I see the total score, severity interpretation (e.g., "Moderate depression"), and clinical recommendations |
| CS-3 | Clinician | I want to add a completed scale result to my clinical note | A button allows me to insert formatted text like "PHQ-9: 14 - Moderate depression [Jan 30, 2026]" |
| CS-4 | Clinician | I want AI to auto-fill scales from my dictation/notes | After dictating clinical notes, AI extracts relevant information and pre-populates scale answers with confidence indicators |
| CS-5 | Clinician | I want to see a patient's historical scale scores for trending | I can view prior PHQ-9 scores with dates and trend indicators (improving/stable/worsening) |
| CS-6 | Clinician | I want safety alerts when critical scale items are triggered | If a patient endorses suicidal ideation on PHQ-9 Q9, I see an immediate critical alert |
| CS-7 | MA/Staff | I want to perform exam-based scales (NIHSS, MAS) during telemedicine with provider guidance | Exam scales are clearly marked and available in a separate Exam Scales section |

### Smart Recommendations

| ID | Role | Story | Acceptance Criteria |
|----|------|-------|---------------------|
| SR-1 | Clinician | I want to see treatment plans matched to my patient's diagnoses | When I add "Migraine" to the differential, relevant treatment plans appear |
| SR-2 | Clinician | I want to select specific recommendations and add them to my plan | Checkboxes allow selecting items; "Add to Plan" inserts them into the Plan field |
| SR-3 | Clinician | I want to see dosing details for medications | Clicking a medication expands to show dosing instructions |
| SR-4 | Clinician | I want to understand rationale and contraindications | Icon buttons reveal rationale, timing, target, contraindications, and monitoring info |
| SR-5 | Clinician | I want to save my commonly-used plan selections for reuse | I can save a "My Migraine Plan" that pre-selects my preferred recommendations |
| SR-6 | Clinician | I want to search for plans by title or ICD-10 code | A search bar finds plans across all available treatment protocols |
| SR-7 | Admin | I want plans to stay current with the latest evidence | A sync script updates plans from the neuro-plans repository |

---

## 3. Clinical Scales System

### 3.1 Implemented Scales

The system includes **20+ validated clinical scales** organized by category:

#### Mental Health Scales
| Scale | ID | Items | Scoring | Time |
|-------|-----|-------|---------|------|
| PHQ-9 (Patient Health Questionnaire-9) | `phq9` | 9 | Sum (0-27) | 3 min |
| GAD-7 (Generalized Anxiety Disorder) | `gad7` | 7 | Sum (0-21) | 2 min |

#### Headache Scales
| Scale | ID | Items | Scoring | Time |
|-------|-----|-------|---------|------|
| MIDAS (Migraine Disability Assessment) | `midas` | 5 | Sum (days, 0-270) | 5 min |
| HIT-6 (Headache Impact Test) | `hit6` | 6 | Sum (36-78) | 2 min |

#### Cognitive Scales
| Scale | ID | Items | Scoring | Time |
|-------|-----|-------|---------|------|
| MoCA (Montreal Cognitive Assessment) | `moca` | 7 domains | Sum (0-30) | 10 min |
| Mini-Cog | `mini_cog` | 2 | Custom (0-5) | 3 min |

#### Sleep Scales
| Scale | ID | Items | Scoring | Time |
|-------|-----|-------|---------|------|
| ESS (Epworth Sleepiness Scale) | `ess` | 8 | Sum (0-24) | 3 min |
| ISI (Insomnia Severity Index) | `isi` | 7 | Sum (0-28) | 3 min |

#### Movement Disorder Scales (Exam-Based)
| Scale | ID | Items | Scoring | Time |
|-------|-----|-------|---------|------|
| UPDRS Motor (Part III) | `updrs_motor` | 33 | Sum (0-132) | 15 min |
| Hoehn & Yahr | `hoehn_yahr` | 3 | Stage (0-5) | 2 min |
| Modified Ashworth Scale | `modified_ashworth` | 3 | Custom (0-5) | 5 min |

#### Stroke/Cerebrovascular Scales
| Scale | ID | Items | Scoring | Time |
|-------|-----|-------|---------|------|
| NIHSS (NIH Stroke Scale) | `nihss` | 15 | Sum (0-42) | 10 min |
| ABCD2 (TIA Risk) | `abcd2` | 5 | Sum (0-7) | 2 min |
| CHA2DS2-VASc (Stroke Risk in AFib) | `cha2ds2_vasc` | 8 | Sum (0-9) | 2 min |
| HAS-BLED (Bleeding Risk) | `has_bled` | 9 | Sum (0-9) | 3 min |

#### MS Scales (Exam-Based)
| Scale | ID | Items | Scoring | Time |
|-------|-----|-------|---------|------|
| EDSS (Expanded Disability Status Scale) | `edss` | 9 | Custom (0-10) | 20 min |

#### Other Scales
| Scale | ID | Items | Scoring | Time |
|-------|-----|-------|---------|------|
| DHI (Dizziness Handicap Inventory) | `dhi` | 10 | Sum (0-40) | 5 min |
| DN4 (Neuropathic Pain) | `dn4` | 10 | Sum (0-10) | 5 min |
| ODI (Oswestry Disability Index) | `odi` | 10 | Percentage (0-100%) | 10 min |
| NDI (Neck Disability Index) | `ndi` | 10 | Percentage (0-100%) | 10 min |

### 3.2 Scale Location System

Scales are categorized by administration context:

**History-Based Scales** (administered via SmartScalesSection in History tab):
- Patient self-report or interview questions
- Examples: PHQ-9, GAD-7, MIDAS, HIT-6, ESS, ISI, CHA2DS2-VASc, HAS-BLED

**Exam-Based Scales** (administered via ExamScalesSection in Physical Exams tab):
- Require physical examination or direct observation
- Can be performed with MA assistance during telemedicine
- Examples: NIHSS, Modified Ashworth, UPDRS Motor, Hoehn & Yahr, EDSS, DN4

### 3.3 Type Definitions

```typescript
// /src/lib/scales/types.ts

export interface QuestionOption {
  value: number
  label: string
  score?: number  // If different from value
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
  alertValue?: number   // Value that triggers an alert
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
  questionId?: string
  condition: string  // e.g., "q9 > 0" or "score >= 21"
  type: 'critical' | 'warning' | 'info'
  message: string
  action?: string
}

export interface ScaleDefinition {
  id: string
  name: string
  abbreviation: string
  description?: string
  category: 'headache' | 'cognitive' | 'mental_health' | 'movement' |
            'sleep' | 'functional' | 'quality_of_life' | 'other'
  questions: ScaleQuestion[]
  scoringMethod: 'sum' | 'weighted' | 'custom' | 'average'
  scoringRanges: ScoringRange[]
  alerts?: ScaleAlert[]
  timeToComplete?: number
  source?: string
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
```

### 3.4 Condition-Scale Linkages

Scales are suggested based on selected diagnoses/conditions. The mapping uses string matching against diagnosis names and chief complaint selections:

```typescript
// /src/lib/scales/scale-definitions.ts

export const CONDITION_SCALE_MAPPINGS: ConditionScaleMapping[] = [
  // Headache conditions
  { condition: 'migraine', scaleId: 'midas', priority: 1, isRequired: false },
  { condition: 'migraine', scaleId: 'hit6', priority: 2, isRequired: false },
  { condition: 'headache', scaleId: 'midas', priority: 1, isRequired: false },
  { condition: 'headache', scaleId: 'hit6', priority: 2, isRequired: false },

  // Cognitive conditions
  { condition: 'cognitive', scaleId: 'moca', priority: 1, isRequired: false },
  { condition: 'memory', scaleId: 'moca', priority: 1, isRequired: false },
  { condition: 'dementia', scaleId: 'moca', priority: 1, isRequired: false },
  { condition: 'cognitive', scaleId: 'mini_cog', priority: 2, isRequired: false },

  // Mental health
  { condition: 'depression', scaleId: 'phq9', priority: 1, isRequired: false },
  { condition: 'anxiety', scaleId: 'gad7', priority: 1, isRequired: false },

  // Sleep disorders
  { condition: 'sleep', scaleId: 'ess', priority: 1, isRequired: false },
  { condition: 'insomnia', scaleId: 'isi', priority: 1, isRequired: false },
  { condition: 'sleepiness', scaleId: 'ess', priority: 1, isRequired: false },

  // Movement disorders
  { condition: 'parkinson', scaleId: 'updrs_motor', priority: 1, isRequired: false },
  { condition: 'parkinson', scaleId: 'hoehn_yahr', priority: 2, isRequired: false },
  { condition: 'tremor', scaleId: 'updrs_motor', priority: 1, isRequired: false },
  { condition: 'spasticity', scaleId: 'modified_ashworth', priority: 1, isRequired: false },

  // Cerebrovascular
  { condition: 'stroke', scaleId: 'nihss', priority: 1, isRequired: false },
  { condition: 'tia', scaleId: 'abcd2', priority: 1, isRequired: false },
  { condition: 'atrial fibrillation', scaleId: 'cha2ds2_vasc', priority: 1, isRequired: false },
  { condition: 'afib', scaleId: 'cha2ds2_vasc', priority: 1, isRequired: false },
  { condition: 'anticoagulation', scaleId: 'has_bled', priority: 1, isRequired: false },

  // MS
  { condition: 'multiple sclerosis', scaleId: 'edss', priority: 1, isRequired: false },
  { condition: 'ms', scaleId: 'edss', priority: 1, isRequired: false },

  // Vestibular
  { condition: 'dizziness', scaleId: 'dhi', priority: 1, isRequired: false },
  { condition: 'vertigo', scaleId: 'dhi', priority: 1, isRequired: false },

  // Neuropathy
  { condition: 'neuropathy', scaleId: 'dn4', priority: 1, isRequired: false },
  { condition: 'neuropathic pain', scaleId: 'dn4', priority: 1, isRequired: false },

  // Spine
  { condition: 'low back pain', scaleId: 'odi', priority: 1, isRequired: false },
  { condition: 'lumbar', scaleId: 'odi', priority: 1, isRequired: false },
  { condition: 'neck pain', scaleId: 'ndi', priority: 1, isRequired: false },
  { condition: 'cervical', scaleId: 'ndi', priority: 1, isRequired: false },
]

export function getScalesForCondition(condition: string): ScaleWithMapping[] {
  const normalizedCondition = condition.toLowerCase()
  const mappings = CONDITION_SCALE_MAPPINGS.filter(m =>
    normalizedCondition.includes(m.condition.toLowerCase())
  )

  return mappings
    .map(m => ({
      ...ALL_SCALES[m.scaleId],
      priority: m.priority,
      isRequired: m.isRequired,
    }))
    .filter(Boolean)
    .sort((a, b) => a.priority - b.priority)
}

export function getExamScales(): ScaleDefinition[] {
  return [NIHSS, MODIFIED_ASHWORTH, UPDRS_MOTOR, HOEHN_YAHR, EDSS, DN4]
}
```

### 3.5 Scoring Engine

```typescript
// /src/lib/scales/scoring-engine.ts

export function calculateScore(
  scale: ScaleDefinition,
  responses: ScaleResponses
): ScoreCalculation {
  const totalQuestions = scale.questions.filter(q => q.required !== false).length
  const answeredQuestions = scale.questions.filter(
    q => responses[q.id] !== undefined && responses[q.id] !== ''
  ).length

  let rawScore = 0

  switch (scale.scoringMethod) {
    case 'sum':
      rawScore = calculateSumScore(scale, responses)
      break
    case 'average':
      rawScore = calculateAverageScore(scale, responses)
      break
    case 'custom':
      rawScore = calculateCustomScore(scale, responses)
      break
    default:
      rawScore = calculateSumScore(scale, responses)
  }

  const isComplete = answeredQuestions >= totalQuestions
  const matchingRange = findScoringRange(scale.scoringRanges, rawScore)
  const triggeredAlerts = checkAlerts(scale, responses, rawScore)

  return {
    rawScore,
    interpretation: matchingRange?.interpretation || '',
    severity: matchingRange?.severity || null,
    grade: matchingRange?.grade,
    recommendations: matchingRange?.recommendations || [],
    triggeredAlerts,
    isComplete,
    answeredQuestions,
    totalQuestions,
  }
}

// Custom scoring for ODI/NDI (percentage-based)
function calculateCustomScore(scale: ScaleDefinition, responses: ScaleResponses): number {
  if (scale.id === 'odi' || scale.id === 'ndi') {
    const sum = calculateSumScore(scale, responses)
    const answeredCount = scale.questions.filter(
      q => responses[q.id] !== undefined && responses[q.id] !== ''
    ).length
    if (answeredCount === 0) return 0
    return Math.round((sum / (answeredCount * 5)) * 100)
  }
  return calculateSumScore(scale, responses)
}

export function getSeverityColor(severity: string | null): string {
  switch (severity) {
    case 'minimal': return '#10B981'    // green-500
    case 'mild': return '#22C55E'       // green-400
    case 'moderate': return '#F59E0B'   // amber-500
    case 'moderately_severe': return '#F97316'  // orange-500
    case 'severe': return '#EF4444'     // red-500
    default: return '#6B7280'           // gray-500
  }
}
```

### 3.6 AI Scale Autofill

The AI autofill feature extracts scale responses from clinical text and patient context.

**Endpoint**: `POST /api/ai/scale-autofill`

**Request Body**:
```typescript
interface ScaleAutofillRequest {
  scaleId: string
  clinicalText: string
  patientContext?: {
    age?: number
    sex?: string
    diagnoses?: string[]
    medications?: string[]
    medicalHistory?: string[]
    allergies?: string[]
    vitalSigns?: {
      bloodPressure?: string
      heartRate?: number
      weight?: number
      height?: number
    }
  }
}
```

**Response**:
```typescript
interface AutofillResponse {
  scaleId: string
  scaleName: string
  responses: Record<string, number | boolean | string>
  confidence: Record<string, 'high' | 'medium' | 'low'>
  reasoning: Record<string, string>
  missingInfo: string[]
  suggestedPrompts: string[]
  validationWarnings: string[]
  questionsCount: number
  answeredCount: number
}
```

**AI Model**: GPT-5.2 (best reasoning for structured extraction)

**Confidence Scoring**:
- **High**: Direct data from demographics, vitals, or explicit diagnosis list
- **Medium**: Inferred from medications (e.g., metformin implies diabetes)
- **Low**: Extracted from clinical narrative with some ambiguity

**Key Features**:
- Uses patient demographics (age, sex) directly for applicable questions
- Infers conditions from medication lists (e.g., lisinopril suggests hypertension)
- Parses vital signs (BP values for hypertension detection)
- Never hallucinates missing data - marks as missing instead
- Suggests follow-up questions for incomplete data

### 3.7 Component Architecture

#### ScaleForm.tsx
Generic form component for rendering any scale:

```typescript
interface ScaleFormProps {
  scale: ScaleDefinition
  initialResponses?: ScaleResponses
  onResponsesChange?: (responses: ScaleResponses, calculation: ScoreCalculation) => void
  onComplete?: (responses: ScaleResponses, calculation: ScoreCalculation) => void
  isExpanded?: boolean
  onToggleExpand?: () => void
  showAddToNote?: boolean
  onAddToNote?: (text: string) => void
  clinicalText?: string
  patientContext?: PatientContext
  showAiAutofill?: boolean
}
```

**Features**:
- Renders questions based on type (select, radio, number, boolean)
- Real-time score calculation as answers change
- Progress indicator showing answered/total questions
- Score result display with severity color coding
- AI autofill button with confidence indicators
- "Add to Assessment" button for completed scales
- Alert display for triggered warnings

#### SmartScalesSection.tsx
History-based scales, shown in History tab:

```typescript
interface SmartScalesSectionProps {
  selectedConditions: string[]
  patientId?: string
  visitId?: string
  onAddToNote?: (field: string, text: string) => void
  onScaleComplete?: (scaleId: string, result: ScoreCalculation) => void
  clinicalText?: string
  patientContext?: PatientContext
}
```

**Features**:
- Dynamically suggests scales based on selected diagnoses
- Shows completion count and trend indicators
- Auto-saves completed scales to database
- Displays prior results for trending

#### ExamScalesSection.tsx
Exam-based scales, shown in Physical Exams tab:

```typescript
interface ExamScalesSectionProps {
  selectedConditions: string[]
  diagnosisNames?: string[]
  patientId?: string
  visitId?: string
  onAddToNote?: (field: string, text: string) => void
  onScaleComplete?: (scaleId: string, result: ScoreCalculation) => void
  clinicalText?: string
  patientContext?: PatientContext
}
```

**Features**:
- Always shows all exam scales (not filtered by condition)
- Recommended/All toggle for filtering by diagnosis relevance
- Teal dot indicators for recommended scales
- Scale chips with completion status badges

---

## 4. Smart Recommendations System

### 4.1 Data Source

Treatment plans are sourced from the **blondarb/neuro-plans** GitHub repository:
- **Repository URL**: https://github.com/blondarb/neuro-plans
- **Clinical Content URL**: https://blondarb.github.io/neuro-plans/clinical/
- **Author**: Steve Arbogast (practicing neurologist)
- **Format**: Structured JSON files with multi-setting support (ED, HOSP, OPD, ICU)

### 4.2 Plan JSON Structure

```typescript
// Source plan structure from neuro-plans repository
interface SourcePlan {
  id: string              // e.g., "migraine"
  title: string           // e.g., "Migraine - Acute and Preventive Management"
  version?: string
  icd10: string[]         // e.g., ["G43.909", "G43.001", "G43.011"]
  scope: string           // Brief description of scope
  notes: string[]         // Clinical pearls
  sections: {
    [sectionName: string]: {
      [subsectionName: string]: RecommendationItem[]
    }
  }
  patientInstructions?: string[]
  referrals?: string[]
  differential?: DifferentialDiagnosis[]
  evidence?: EvidenceEntry[]
  monitoring?: MonitoringEntry[]
  disposition?: DispositionEntry[]
}

interface RecommendationItem {
  item: string              // e.g., "Sumatriptan (Imitrex)"
  rationale?: string        // Why this is recommended
  dosing?: string | DosingObject  // Dosing instructions
  timing?: string           // When to administer
  target?: string           // Treatment target/goal
  indication?: string       // When to use this item
  contraindications?: string
  monitoring?: string       // What to monitor
  priority: 'STAT' | 'URGENT' | 'ROUTINE' | 'EXT' | '—' | '✓'
  ED?: string               // Emergency setting applicability
  HOSP?: string             // Hospital setting
  OPD?: string              // Outpatient setting (what we use)
  ICU?: string              // ICU setting
}
```

### 4.3 Sync Pipeline

The sync script (`scripts/sync-plans.ts`) fetches plans from GitHub and transforms them for outpatient use:

**Command**: `npm run sync-plans`

**Environment Variables Required**:
```
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY  # Needs write access
```

**Process**:
1. **Discovery**: Fetch GitHub tree API to list all JSON files in `docs/plans/` and `docs/drafts/`
2. **Priority**: Prefer `plans/` over `drafts/` for duplicate slugs
3. **Fetch**: Parallel fetch with retry logic (8 concurrent, exponential backoff)
4. **Transform**: Filter to OPD-only items, flatten dosing objects, clean ICD-10 codes
5. **Override**: Apply local corrections from `scripts/plan-overrides.json`
6. **Upsert**: Bulk upsert to `clinical_plans` table with `plan_key` as conflict key

**Current Stats**: 127 plans covering ~89% of 166 diagnoses

### 4.4 Plan Overrides

Local corrections are stored in `scripts/plan-overrides.json`:

```json
{
  "_comment": "Local overrides applied after syncing plans from neuro-plans...",
  "parkinsons-disease": {
    "_comment": "Add F06.0 so Parkinson's Psychosis diagnosis matches this plan",
    "icd10_codes": ["G20", "F06.0"]
  }
}
```

### 4.5 ICD-10 Matching

Plans are matched to diagnoses using scored ICD-10 matching:

```typescript
// /src/app/api/plans/route.ts

// Weighted scoring: exact full-code match >> prefix-only match
function matchScore(planCodes: string[], diagCodes: string[]): number {
  let exactMatches = 0
  let prefixMatches = 0

  for (const planCode of planCodes) {
    const planBase = planCode.substring(0, 3)  // e.g., "G43" from "G43.709"
    for (const diagCode of diagCodes) {
      if (planCode === diagCode) {
        exactMatches++
      } else if (planBase === diagCode.substring(0, 3)) {
        prefixMatches++
      }
    }
  }

  if (exactMatches === 0 && prefixMatches === 0) return 0
  return exactMatches * 1000 + prefixMatches  // Exact match: 1000, prefix: 1
}
```

### 4.6 Recommendation Ordering

Plans display sections and subsections in a canonical order:

```typescript
// /src/lib/recommendationOrdering.ts

export const SECTION_ORDER = [
  'Laboratory Workup',
  'Imaging & Studies',
  'Treatment',
  'Other Recommendations',
  'Referrals & Follow-up',
  'Patient Instructions',
]

// Treatment subsections use keyword-based priority tiers
const TREATMENT_TIER_KEYWORDS = [
  // Tier 1: Acute/Emergent
  [1, /^stabiliz/i],
  [2, /acute.*emerg|emerg.*acute/i],

  // Tier 10: First-line/Essential
  [10, /first[- ]line/i],
  [11, /essential|core|primary/i],

  // Tier 20: Disease-modifying/Preventive
  [20, /disease[- ]modif/i],
  [21, /preventive|prevention/i],

  // Tier 30: Second-line/Adjunctive
  [30, /second[- ]line/i],
  [31, /adjunct/i],

  // Tier 40: Symptomatic/Supportive
  [40, /symptomatic/i],
  [41, /supportive/i],

  // Tier 60: Third-line/Refractory
  [60, /third[- ]line/i],
  [61, /refractory/i],

  // Tier 70: Surgical
  [70, /surgical/i],

  // Tier 80: Avoid/Special populations
  [80, /avoid/i],
  [81, /pregnancy/i],
]
```

### 4.7 Type Definitions

```typescript
// /src/lib/recommendationPlans.ts

export interface RecommendationItem {
  item: string
  rationale?: string
  dosing?: string
  timing?: string
  target?: string
  indication?: string
  contraindications?: string
  monitoring?: string
  priority: 'STAT' | 'URGENT' | 'ROUTINE' | 'EXT' | '—' | '✓'
}

export interface ClinicalPlan {
  id: string
  title: string
  icd10: string[]
  scope: string
  notes: string[]
  sections: {
    [sectionName: string]: {
      [subsectionName: string]: RecommendationItem[]
    }
  }
  patientInstructions: string[]
  referrals: string[]
  differential?: DifferentialDiagnosis[]
  evidence?: EvidenceEntry[]
  monitoring?: MonitoringEntry[]
  disposition?: DispositionEntry[]
}

// /src/lib/savedPlanTypes.ts

export interface SavedPlan {
  id: string
  tenant_id: string
  user_id: string
  name: string
  description?: string
  source_plan_key?: string
  selected_items: Record<string, string[]>
  custom_items: Record<string, string[]>
  plan_overrides: Record<string, unknown>
  is_default: boolean
  use_count: number
  last_used?: string
  created_at: string
  updated_at: string
}
```

### 4.8 SmartRecommendationsSection.tsx

Main component for displaying and interacting with treatment plans:

```typescript
interface SmartRecommendationsSectionProps {
  onAddToPlan: (items: string[]) => void
  selectedDiagnoses?: string[]  // Array of diagnosis IDs
}
```

**Features**:
- Plan dropdown filtered to selected diagnoses (sorted by ICD-10 match score)
- Expandable sections with subsections
- Checkbox selection for individual items
- "Select All" / "Deselect All" per subsection
- Priority badges (STAT=red, URGENT=amber, ROUTINE=blue, EXT=gray)
- Icon tooltips for rationale, indication, timing, target, contraindications, monitoring
- Expandable dosing details for medication items
- Custom item entry per section
- "Add to Plan" button with confirmation feedback
- Save/Load saved plans
- Plan search functionality
- Dark mode support

**Priority Badge Colors**:
```typescript
const PRIORITY_COLORS = {
  'STAT': { bg: '#FEE2E2', text: '#DC2626' },
  'URGENT': { bg: '#FEF3C7', text: '#D97706' },
  'ROUTINE': { bg: '#DBEAFE', text: '#2563EB' },
  'EXT': { bg: '#E5E7EB', text: '#6B7280' },
}
```

**Reference Information Tabs**:
- ICD-10 codes
- Scope description
- Clinical pearls
- Differential diagnosis
- Evidence/citations
- Monitoring requirements

---

## 5. API Contracts

### 5.1 Scales API

**Endpoint**: `GET /api/scales`

Fetch scale results for a patient.

**Query Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| patientId | string | Yes | Patient UUID |
| scaleId | string | No | Filter to specific scale |
| limit | number | No | Max results (default 10) |

**Response**:
```json
{
  "results": [
    {
      "id": "uuid",
      "scale_id": "phq9",
      "raw_score": 14,
      "interpretation": "Moderate depression",
      "severity_level": "moderate",
      "completed_at": "2026-01-30T10:00:00Z",
      "responses": { "q1": 2, "q2": 2, ... }
    }
  ]
}
```

---

**Endpoint**: `POST /api/scales`

Save a scale result.

**Request Body**:
```json
{
  "patientId": "uuid",
  "visitId": "uuid",
  "scaleId": "phq9",
  "responses": { "q1": 2, "q2": 2, ... },
  "rawScore": 14,
  "interpretation": "Moderate depression",
  "severityLevel": "moderate",
  "grade": null,
  "triggeredAlerts": [],
  "notes": "Optional provider notes"
}
```

**Response**:
```json
{
  "result": {
    "id": "uuid",
    "scale_id": "phq9",
    ...
  }
}
```

### 5.2 Plans API

**Endpoint**: `GET /api/plans`

Fetch clinical plans.

**Query Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| diagnosisId | string | Get best-matching plan for this diagnosis |
| planKey | string | Get specific plan by key |
| list | boolean | List all plans (summary only) |
| search | string | Search plans by title/ICD-10/scope |

**Response (list=true)**:
```json
{
  "plans": [
    {
      "plan_id": "migraine",
      "title": "Migraine - Acute and Preventive Management",
      "icd10_codes": ["G43.909", "G43.001"],
      "linked_diagnoses": ["migraine-chronic", "migraine-episodic"],
      "diagnosis_scores": { "migraine-chronic": 1000, "migraine-episodic": 1000 }
    }
  ]
}
```

**Response (diagnosisId or planKey)**:
```json
{
  "plan": {
    "id": "migraine",
    "title": "Migraine - Acute and Preventive Management",
    "icd10": ["G43.909", "G43.001"],
    "scope": "Acute treatment and preventive therapy...",
    "notes": ["Consider CGRP inhibitors for chronic migraine..."],
    "sections": { ... },
    "patientInstructions": [...],
    "referrals": [...],
    "differential": [...],
    "evidence": [...],
    "isGeneric": false
  }
}
```

### 5.3 AI Scale Autofill API

**Endpoint**: `POST /api/ai/scale-autofill`

Auto-populate scale from clinical text.

**Request**:
```json
{
  "scaleId": "cha2ds2_vasc",
  "clinicalText": "72-year-old female with hypertension, diabetes, and history of TIA...",
  "patientContext": {
    "age": 72,
    "sex": "Female",
    "diagnoses": ["Hypertension", "Type 2 Diabetes", "Prior TIA"],
    "medications": ["Lisinopril", "Metformin"]
  }
}
```

**Response**:
```json
{
  "scaleId": "cha2ds2_vasc",
  "scaleName": "CHA₂DS₂-VASc Score",
  "responses": {
    "chf": 0,
    "hypertension": 1,
    "age_75": 0,
    "age_65_74": 1,
    "diabetes": 1,
    "stroke_tia": 2,
    "vascular": 0,
    "sex_female": 1
  },
  "confidence": {
    "hypertension": "high",
    "age_65_74": "high",
    "diabetes": "high",
    "stroke_tia": "high",
    "sex_female": "high"
  },
  "reasoning": {
    "hypertension": "Hypertension from diagnosis list",
    "age_65_74": "Patient age is 72 from demographics",
    "diabetes": "Type 2 Diabetes from diagnosis list",
    "stroke_tia": "Prior TIA from diagnosis list",
    "sex_female": "Female from demographics"
  },
  "missingInfo": ["CHF status", "Vascular disease history"],
  "suggestedPrompts": [
    "Does the patient have a history of heart failure?",
    "Any history of MI, PAD, or aortic plaque?"
  ],
  "questionsCount": 8,
  "answeredCount": 6
}
```

---

## 6. Database Schema

### 6.1 Scale Results Table

```sql
-- /supabase/migrations/006_smart_scales.sql

CREATE TABLE scale_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  tenant_id TEXT NOT NULL DEFAULT 'default',
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  visit_id UUID REFERENCES visits(id) ON DELETE SET NULL,
  scale_id TEXT NOT NULL,
  responses JSONB NOT NULL,
  raw_score INTEGER NOT NULL,
  interpretation TEXT,
  severity_level TEXT CHECK (severity_level IN
    ('minimal', 'mild', 'moderate', 'moderately_severe', 'severe')),
  grade TEXT,
  triggered_alerts JSONB,
  notes TEXT,
  completed_by UUID REFERENCES auth.users(id),
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  added_to_note BOOLEAN DEFAULT FALSE,
  added_to_note_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_scale_results_patient_id ON scale_results(patient_id);
CREATE INDEX idx_scale_results_visit_id ON scale_results(visit_id);
CREATE INDEX idx_scale_results_scale_id ON scale_results(scale_id);
CREATE INDEX idx_scale_results_completed_at ON scale_results(completed_at);

-- RLS: Users can only access their own patients' results
ALTER TABLE scale_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own patient scale results" ON scale_results
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM patients
            WHERE patients.id = scale_results.patient_id
            AND patients.user_id = auth.uid())
  );
```

### 6.2 Clinical Plans Table

```sql
-- /supabase/migrations/013_clinical_plans_and_saved_plans.sql

CREATE TABLE clinical_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_key TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  icd10_codes TEXT[] DEFAULT '{}',
  scope TEXT,
  notes TEXT[] DEFAULT '{}',
  sections JSONB NOT NULL DEFAULT '{}',
  patient_instructions TEXT[] DEFAULT '{}',
  referrals TEXT[] DEFAULT '{}',
  differential JSONB,
  evidence JSONB,
  monitoring JSONB,
  disposition JSONB,
  source TEXT DEFAULT 'neuro-plans',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: All authenticated users can read (reference data)
ALTER TABLE clinical_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read clinical plans"
  ON clinical_plans FOR SELECT
  TO authenticated
  USING (true);
```

### 6.3 Saved Plans Table

```sql
CREATE TABLE saved_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL DEFAULT 'default',
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  source_plan_key TEXT,
  selected_items JSONB NOT NULL DEFAULT '{}',
  custom_items JSONB NOT NULL DEFAULT '{}',
  plan_overrides JSONB DEFAULT '{}',
  is_default BOOLEAN DEFAULT FALSE,
  use_count INTEGER DEFAULT 0,
  last_used TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_saved_plans_user_id ON saved_plans(user_id);
CREATE INDEX idx_saved_plans_tenant_id ON saved_plans(tenant_id);

-- RLS: Users own their saved plans
ALTER TABLE saved_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own saved plans" ON saved_plans
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

---

## 7. File Structure Reference

```
src/
├── app/api/
│   ├── ai/
│   │   └── scale-autofill/
│   │       └── route.ts          # AI autofill endpoint
│   ├── plans/
│   │   └── route.ts              # Clinical plans CRUD
│   ├── scales/
│   │   └── route.ts              # Scale results CRUD
│   └── saved-plans/
│       ├── route.ts              # Saved plans list/create
│       └── [id]/route.ts         # Saved plan update/delete
├── components/
│   ├── ScaleForm.tsx             # Generic scale rendering
│   ├── SmartScalesSection.tsx    # History-based scales
│   ├── ExamScalesSection.tsx     # Exam-based scales
│   └── SmartRecommendationsSection.tsx  # Treatment plans UI
├── lib/
│   ├── scales/
│   │   ├── index.ts              # Public exports
│   │   ├── types.ts              # TypeScript interfaces
│   │   ├── scale-definitions.ts  # All scale definitions
│   │   └── scoring-engine.ts     # Score calculation
│   ├── recommendationPlans.ts    # Plan types + fallback data
│   ├── recommendationOrdering.ts # Section/subsection ordering
│   └── savedPlanTypes.ts         # Saved plan interfaces
scripts/
├── sync-plans.ts                 # GitHub -> Supabase sync
└── plan-overrides.json           # Local ICD-10 corrections
supabase/migrations/
├── 006_smart_scales.sql          # Scale results schema
└── 013_clinical_plans_and_saved_plans.sql  # Plans schema
```

---

## 8. Implementation Notes

### Scale Implementation Checklist

When adding a new scale:

1. **Define scale** in `/src/lib/scales/scale-definitions.ts`:
   - Unique `id`
   - All questions with types and options
   - Scoring ranges with interpretations
   - Optional alerts for critical values

2. **Export scale** from index.ts and add to `ALL_SCALES` object

3. **Add condition mappings** to `CONDITION_SCALE_MAPPINGS` array

4. **Categorize as history-based or exam-based**:
   - History-based: Patient-reported, included in SmartScalesSection
   - Exam-based: Add to `getExamScales()` return array

5. **Test scoring** with edge cases and verify interpretation ranges

### Plan Sync Checklist

When syncing new plans:

1. Run `npm run sync-plans` to pull latest from neuro-plans

2. Check console output for:
   - Plans with no OPD items (skipped)
   - New plans added vs updated
   - Any fetch errors

3. Verify ICD-10 matching:
   - Check `linked_diagnoses` in list response
   - Add overrides to `plan-overrides.json` if needed

4. Test in UI:
   - Select diagnosis that should match the plan
   - Verify plan appears in dropdown
   - Check all sections render correctly

---

## 9. Future Enhancements

### Clinical Scales
- [ ] Patient-facing scale completion via patient portal
- [ ] Automated scale reminders based on follow-up schedules
- [ ] Cross-scale correlation analysis (e.g., PHQ-9 vs headache frequency)
- [ ] Export scale history as PDF report

### Smart Recommendations
- [ ] Plan versioning with change tracking
- [ ] Institution-specific plan customization
- [ ] Drug interaction checking integration
- [ ] Prior authorization integration for medications
- [ ] Cost/insurance coverage display

---

## 10. References

### Clinical Scale Sources
- PHQ-9: Kroenke K, Spitzer RL, Williams JB. J Gen Intern Med. 2001
- GAD-7: Spitzer RL, Kroenke K, Williams JB, Lowe B. Arch Intern Med. 2006
- MIDAS: Stewart WF, et al. Neurology. 2001
- HIT-6: Kosinski M, et al. Qual Life Res. 2003
- MoCA: Nasreddine ZS, et al. J Am Geriatr Soc. 2005
- NIHSS: National Institute of Neurological Disorders and Stroke
- UPDRS: Goetz CG, et al. Movement Disorders. 2008
- CHA2DS2-VASc: Lip GY, et al. Chest. 2010
- HAS-BLED: Pisters R, et al. Chest. 2010

### Treatment Plan Source
- neuro-plans repository: https://github.com/blondarb/neuro-plans
- Author: Steve Arbogast (blondarb)
