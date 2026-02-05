# PRD: Clinical Note System

## Document Info
- **Version**: 1.0
- **Last Updated**: February 5, 2026
- **Status**: Engineering Ready

## 1. Overview

The Clinical Note System is the core documentation platform for Sevaro Clinical, designed for neurology outpatient practices. It provides a structured, AI-assisted clinical documentation workflow with four main tabs, smart recommendations, and comprehensive note generation.

### Key Capabilities
- Tabbed clinical documentation (History, Imaging/Results, Physical Exams, Recommendation)
- Two-tier Reason for Consult selection
- Differential Diagnosis with 166 neurology diagnoses and ICD-10 codes
- Smart Recommendations pulling from 127 evidence-based treatment plans
- AI-powered note generation with merge engine
- Voice dictation and AI assistance on all text fields

## 2. User Stories

### Clinician Documentation
| ID | Story | Acceptance Criteria |
|----|-------|-------------------|
| CN-1 | As a clinician, I want to document patient history in structured sections | All HPI, ROS, allergies, and medical history fields save correctly |
| CN-2 | As a clinician, I want to select reason for consult from predefined categories | 9 categories with sub-options auto-populate differential diagnosis |
| CN-3 | As a clinician, I want AI to suggest diagnoses based on chief complaint | Differential auto-populates with relevant diagnoses |
| CN-4 | As a clinician, I want evidence-based treatment recommendations | Plans from neuro-plans database display with tooltips |
| CN-5 | As a clinician, I want to generate a formatted clinical note | Note preview shows all sections with copy/print options |
| CN-6 | As a clinician, I want to dictate into any text field | Red mic button opens voice drawer for transcription |
| CN-7 | As a clinician, I want AI to improve my documentation | Teal AI button provides improve/expand/summarize actions |

### Note Management
| ID | Story | Acceptance Criteria |
|----|-------|-------------------|
| CN-8 | As a clinician, I want to save draft notes | Pend button saves current state to database |
| CN-9 | As a clinician, I want to finalize and sign notes | Sign & Complete saves visit and generates summary |
| CN-10 | As a clinician, I want to view prior visit notes | Left sidebar shows expandable prior visit cards |

## 3. Architecture

### Component Hierarchy
```
ClinicalNote.tsx (Main orchestrator)
├── TopNav.tsx (Navigation, search, patient queue)
├── IconSidebar (View mode: appointments vs chart)
├── LeftSidebar.tsx (Patient info, prior visits, score history)
├── CenterPanel.tsx (Clinical documentation tabs)
│   ├── History Tab
│   │   ├── PatientHistorySummary.tsx
│   │   ├── ReasonForConsultSection.tsx
│   │   ├── NoteTextField.tsx (HPI, ROS, etc.)
│   │   ├── Medications Section
│   │   ├── Allergies Section
│   │   └── SmartScalesSection.tsx
│   ├── Imaging/Results Tab
│   │   └── ImagingResultsTab.tsx
│   ├── Physical Exams Tab
│   │   ├── Structured checkboxes
│   │   ├── Free-text toggle
│   │   ├── Vital signs
│   │   └── ExamScalesSection.tsx
│   └── Recommendation Tab
│       ├── AI Assessment Generator
│       ├── DifferentialDiagnosisSection.tsx
│       └── SmartRecommendationsSection.tsx
├── VoiceDrawer.tsx (Chart Prep, Document)
├── AiDrawer.tsx (Ask AI, Summary, Handout)
├── DotPhrasesDrawer.tsx
└── EnhancedNotePreviewModal.tsx (Generate Note)
```

### State Management
```typescript
// ClinicalNote.tsx manages all clinical state
const [noteData, setNoteData] = useState<ManualNoteData>({
  chiefComplaint: [],
  hpi: '',
  ros: '',
  rosDetails: '',
  allergies: '',
  allergyDetails: '',
  historyAvailable: '',
  historyDetails: '',
  physicalExam: '',
  assessment: '',
  plan: '',
  vitals: { bp: '', hr: '', temp: '', weight: '', bmi: '' }
})

// AI outputs stored separately
const [chartPrepOutput, setChartPrepOutput] = useState<ChartPrepOutput | null>(null)
const [visitAIOutput, setVisitAIOutput] = useState<VisitAIOutput | null>(null)
const [visitAITranscript, setVisitAITranscript] = useState('')

// Structured data
const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([])
const [imagingStudies, setImagingStudies] = useState<ImagingStudyEntry[]>([])
const [scaleResults, setScaleResults] = useState<ScaleResult[]>([])
const [selectedRecommendations, setSelectedRecommendations] = useState<RecommendationItem[]>([])
const [medications, setMedications] = useState<PatientMedication[]>([])
const [allergies, setAllergies] = useState<PatientAllergy[]>([])
```

## 4. Tab System

### 4.1 History Tab

#### Sections (with sticky navigation pills)
1. **Summary** - PatientHistorySummary.tsx: AI-generated longitudinal summary
2. **Consult** - ReasonForConsultSection.tsx: Two-tier category/sub-option selection
3. **HPI** - NoteTextField with dictation/AI/dot-phrase buttons
4. **ROS** - Quick-select pills + detail textarea
5. **Meds** - Medication list with add/edit/discontinue
6. **Allergies** - Quick-select pills + allergy chips
7. **History** - Medical/surgical/family/social history
8. **Scales** - SmartScalesSection.tsx: Condition-based scale suggestions

#### Section Navigation
```typescript
const HISTORY_SECTIONS = [
  { id: 'summary', label: 'Summary' },
  { id: 'consult', label: 'Consult' },
  { id: 'hpi', label: 'HPI' },
  { id: 'ros', label: 'ROS' },
  { id: 'meds', label: 'Meds' },
  { id: 'allergies-section', label: 'Allergies' },
  { id: 'history-section', label: 'History' },
  { id: 'scales', label: 'Scales' },
]

// IntersectionObserver tracks visible section, highlights active pill
// Click pill scrolls to section with smooth behavior
```

### 4.2 Imaging/Results Tab

#### Study Types
- **Imaging**: MRI Brain, CT Head, CTA Head & Neck, MRA Head, MRI Spine
- **Neurodiagnostic**: EEG, EMG/NCS, VEP, Sleep Study
- **Labs**: Quick-add chips for common panels

#### Study Card Structure
```typescript
interface ImagingStudyEntry {
  id: string
  studyType: string
  date: string
  impression: 'normal' | 'abnormal' | 'pending' | 'not-reviewed'
  findings?: string
  pacsLink?: string
}
```

### 4.3 Physical Exams Tab

#### Modes
1. **Structured** - Checkbox grid for neuro exam findings
2. **Free-text** - Single NoteTextField (toggle persisted to localStorage)

#### Vital Signs
```typescript
vitals: {
  bp: string      // Blood pressure
  hr: string      // Heart rate
  temp: string    // Temperature
  weight: string  // Weight
  bmi: string     // BMI
}
```

#### Exam-Driven Scales
ExamScalesSection.tsx shows scales relevant to exam findings (NIHSS, Modified Ashworth, etc.)

### 4.4 Recommendation Tab

#### Components
1. **Assessment Textarea** - With "Generate with AI" button
2. **Differential Diagnosis** - DifferentialDiagnosisSection.tsx
3. **Smart Recommendations** - SmartRecommendationsSection.tsx
4. **Plan Textarea** - Final plan text

## 5. Reason for Consult System

### Categories (9 total)
```typescript
const CONSULT_CATEGORIES = [
  { id: 'headache', label: 'Headache', icon: HeadacheIcon },
  { id: 'movement', label: 'Movement', icon: MovementIcon },
  { id: 'seizure', label: 'Seizure', icon: SeizureIcon },
  { id: 'cognitive', label: 'Cognitive', icon: CognitiveIcon },
  { id: 'neuromuscular', label: 'Neuromuscular', icon: NeuromuscularIcon },
  { id: 'ms-neuroimmunology', label: 'MS/Neuroimmunology', icon: MSIcon },
  { id: 'cerebrovascular', label: 'Cerebrovascular', icon: CerebrovascularIcon },
  { id: 'sleep', label: 'Sleep', icon: SleepIcon },
  { id: 'other', label: 'Other', icon: OtherIcon },
]
```

### Sub-Options Structure
```typescript
interface ConsultCategory {
  id: string
  label: string
  icon: ReactNode
  subOptions: {
    common: string[]     // Always visible
    expanded: string[]   // Shown on "More" click
    allowCustom: boolean
  }
}
```

### Auto-Population Flow
1. User selects primary category
2. Sub-options appear (common first)
3. Selected sub-options map to `CONSULT_TO_DIAGNOSIS_MAP`
4. Relevant diagnoses auto-populate in Differential Diagnosis section

## 6. Differential Diagnosis System

### Data Structure (166 diagnoses)
```typescript
// src/lib/diagnosisData.ts
interface Diagnosis {
  id: string
  name: string
  icd10: string
  category: string
  alternateIcd10?: Array<{ code: string; description: string }>
}

const DIAGNOSIS_CATEGORIES = [
  { id: 'headache', name: 'Headache Disorders', diagnoses: [...] },
  { id: 'movement', name: 'Movement Disorders', diagnoses: [...] },
  // ... 16 categories total
]
```

### Features
- Searchable picker with category filtering
- ICD-10 code display
- Primary diagnosis designation
- Drag-to-reorder priority
- Custom diagnosis entry

### Mapping to Smart Recommendations
```typescript
// Each diagnosis links to treatment plans via ICD-10 matching
function findPlansForDiagnosis(diagnosis: Diagnosis): ClinicalPlan[] {
  const diagCodes = [diagnosis.icd10, ...(diagnosis.alternateIcd10?.map(a => a.code) || [])]
  return plans.filter(plan =>
    plan.icd10_codes.some(planCode =>
      diagCodes.some(diagCode =>
        planCode === diagCode || planCode.substring(0, 3) === diagCode.substring(0, 3)
      )
    )
  )
}
```

## 7. Smart Recommendations System

### Source: neuro-plans Repository
- **GitHub**: `blondarb/neuro-plans` (built by Steve Arbogast)
- **Published**: https://blondarb.github.io/neuro-plans/clinical/
- **Format**: Structured JSON with evidence-based treatment plans
- **Count**: 127 plans covering ~89% of diagnoses

### Sync Pipeline
```bash
npm run sync-plans  # scripts/sync-plans.ts
```

#### Process
1. Fetch JSON files from GitHub repo (`docs/plans/` and `docs/drafts/`)
2. Transform to OPD-only format (filter items with `OPD !== '—'`)
3. Apply local overrides from `scripts/plan-overrides.json`
4. Upsert to Supabase `clinical_plans` table

### Plan JSON Structure
```typescript
interface ClinicalPlan {
  plan_key: string           // e.g., "migraine"
  title: string              // e.g., "Migraine"
  icd10_codes: string[]      // e.g., ["G43.909", "G43.709"]
  scope: string
  notes: string[]
  sections: {
    [sectionName: string]: {
      [subsectionName: string]: RecommendationItem[]
    }
  }
  patient_instructions: string[]
  referrals: string[]
  differential: Array<{ diagnosis: string; features: string; tests: string }>
  evidence: Array<{ recommendation: string; evidenceLevel: string; source: string }>
  monitoring: Array<{ item: string; frequency: string; action: string }>
  disposition: Array<{ disposition: string; criteria: string }>
}

interface RecommendationItem {
  item: string
  rationale?: string
  dosing?: string
  timing?: string
  target?: string
  indication?: string
  contraindications?: string
  monitoring?: string
  priority: 'STAT' | 'URGENT' | 'ROUTINE' | 'EXT'
}
```

### UI Features (SmartRecommendationsSection.tsx)
- Expandable section cards with subsections
- Tooltip icons: Rationale (blue), Timing (purple), Target (green), Contraindications (red)
- Dark mode support with MutationObserver
- "Add to Plan" buttons per item
- Select All / Deselect All
- Saved plans per patient/visit

### ICD-10 Matching Scoring
```typescript
function matchScore(planCodes: string[], diagCodes: string[]): number {
  let score = 0
  for (const planCode of planCodes) {
    for (const diagCode of diagCodes) {
      if (planCode === diagCode) score += 1000  // Exact match
      else if (planCode.substring(0, 3) === diagCode.substring(0, 3)) score += 1  // Category match
    }
  }
  return score
}
```

## 8. Note Generation

### EnhancedNotePreviewModal
- **Note Type**: New Consult / Follow-up
- **Note Length**: Concise / Standard / Detailed
- **Include toggles**: Scales, Imaging, Labs, Recommendations

### User Settings Integration

The note generation system respects user settings stored in `localStorage`:

**Note Type Instructions:**
When the user selects "New Consult" or "Follow-up", the corresponding custom instructions (`newConsultInstructions` or `followUpInstructions`) are injected into the AI synthesis prompt. This allows different documentation styles for different visit types.

**Section-Specific Instructions:**
Each section (HPI, ROS, Assessment, Plan, Physical Exam) can have custom instructions that get injected into the AI prompt for that section.

**Layout Preferences:**
User preferences affect note structure:
- `includeHistorySummary` - Adds brief patient history at the beginning
- `includeAllergiesAtTop` - Places allergies prominently in the note header
- `includeProblemList` - Includes active problem list in assessment
- `groupMedicationsWithAssessment` - Lists medications with each diagnosis

**Documentation Style & Terminology:**
- `documentationStyle`: 'concise' | 'detailed' | 'narrative'
- `preferredTerminology`: 'formal' | 'standard' | 'simplified'

### Settings Retrieval
```typescript
// EnhancedNotePreviewModal.tsx
function getUserSettings() {
  const saved = localStorage.getItem('sevaro-user-settings')
  if (!saved) return null

  const settings = JSON.parse(saved)
  return {
    newConsultInstructions: settings.newConsultInstructions,
    followUpInstructions: settings.followUpInstructions,
    sectionInstructions: settings.sectionAiInstructions,
    noteLayout: settings.noteLayout,
    documentationStyle: settings.documentationStyle,
    preferredTerminology: settings.preferredTerminology,
    globalInstructions: settings.globalAiInstructions, // Legacy
  }
}
```

### Note Merge Engine
```typescript
// src/lib/note-merge/merge-engine.ts
function mergeNoteContent(
  manualData: ManualNoteData,
  chartPrepData: ChartPrepOutput | null,
  visitAIData: VisitAIOutput | null,
  options: MergeOptions
): MergedClinicalNote

// Priority: Manual > Visit AI > Chart Prep
// AI suggestions shown when manual content exists and differs
```

### AI Synthesis API Call
```typescript
// Sent to /api/ai/synthesize-note
{
  noteType: 'new-consult' | 'follow-up',
  noteLength: 'concise' | 'standard' | 'detailed',
  manualData, chartPrepData, visitAIData,
  scales, diagnoses, imagingStudies, recommendations, patient,
  userSettings: {
    newConsultInstructions,    // Used when noteType === 'new-consult'
    followUpInstructions,      // Used when noteType === 'follow-up'
    sectionInstructions,       // Per-section customizations
    noteLayout,                // Structure preferences
    documentationStyle,        // Writing style
    preferredTerminology       // Language level
  }
}
```

### Formatted Output
```typescript
interface FormattedNote {
  header: string              // Patient name, DOB, visit date
  sections: FormattedNoteSection[]
  footer: string              // Provider signature
  fullText: string            // Complete note text
  wordCount: number
  generatedAt: string
}
```

### AI Note Review
After generation, `/api/ai/note-review` analyzes note for:
- Consistency issues
- Completeness gaps
- Quality improvements

Returns up to 6 suggestions with type badges (consistency/completeness/quality) and "Go to section" links.

## 9. NoteTextField Component

### Props
```typescript
interface NoteTextFieldProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label?: string
  fieldId: string
  onOpenVoiceDrawer?: () => void
  onOpenDotPhrases?: () => void
  onOpenAiDrawer?: () => void
  disabled?: boolean
}
```

### Action Buttons
- **Red mic** - Opens VoiceDrawer for dictation
- **Purple lightning** - Opens DotPhrasesDrawer
- **Teal star** - Opens AiDrawer for AI assistance

## 10. Dot Phrases System

### Structure
```typescript
interface DotPhrase {
  id: string
  name: string        // e.g., ".neuroexam"
  content: string     // Expansion text
  category?: string   // Exam, History, Plan, etc.
  scope?: string      // 'global' | 'hpi' | 'assessment' | 'plan' | etc.
  usage_count: number
  created_at: string
  user_id: string
}
```

### Features
- Type `.` followed by phrase name for expansion
- Scope filtering shows relevant phrases per field
- Usage tracking for frequently used phrases
- User-specific phrases

## 11. Data Models

### Database Tables
- `visits` - Visit records with clinical_notes JSONB
- `clinical_notes` - Standalone note storage
- `diagnoses` - Patient diagnoses with ICD-10
- `clinical_plans` - Treatment plan library (127 plans)
- `saved_plans` - User-saved plan selections
- `patient_medications` - Medication records
- `patient_allergies` - Allergy records
- `clinical_scales` - Scale definitions
- `clinical_scale_history` - Completed scale scores

### TypeScript Interfaces
See `src/lib/note-merge/types.ts` for complete type definitions:
- `ManualNoteData`
- `ChartPrepOutput`
- `VisitAIOutput`
- `ComprehensiveNoteData`
- `FormattedNote`
- `ScaleResult`
- `DiagnosisEntry`
- `ImagingStudyEntry`
- `RecommendationItem`

## 12. API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/ai/generate-assessment` | POST | Generate assessment from diagnoses |
| `/api/ai/synthesize-note` | POST | Generate complete formatted note |
| `/api/ai/note-review` | POST | Review note for improvements |
| `/api/plans` | GET | Get treatment plans by diagnosis or plan key |
| `/api/scales` | GET/POST | Clinical scales CRUD |
| `/api/medications` | GET/POST/PATCH/DELETE | Medication management |
| `/api/allergies` | GET/POST/PATCH/DELETE | Allergy management |
| `/api/visits/[id]/sign` | POST | Sign and complete visit |

## 13. LocalStorage Keys

| Key | Purpose |
|-----|---------|
| `sevaro-tab-order` | Custom tab ordering |
| `sevaro-vertical-view` | Vertical view preference |
| `sevaro-exam-mode` | Structured vs free-text exam |
| `sevaro-user-settings` | AI instructions, style preferences |
| `sevaro-clinical-note-{patientId}` | Autosaved note draft |

## 14. Implementation Notes

### Cross-Patient Data Isolation
```typescript
// ClinicalNote.tsx
const resetAllClinicalState = useCallback(() => {
  setNoteData(DEFAULT_NOTE_DATA)
  setChartPrepOutput(null)
  setVisitAIOutput(null)
  setDiagnoses([])
  // ... reset all state
}, [])

// Guard async callbacks with patient ref
const isSwitchingPatientRef = useRef(false)
```

### Autosave
```typescript
// Autosave key includes patient ID to prevent data leakage
const autosaveKey = `sevaro-clinical-note-${patient?.id}`

useEffect(() => {
  const saved = localStorage.getItem(autosaveKey)
  if (saved) {
    setNoteData(JSON.parse(saved))
  }
}, [autosaveKey])

useEffect(() => {
  localStorage.setItem(autosaveKey, JSON.stringify(noteData))
}, [noteData, autosaveKey])
```

### Tab Completion Indicators
- Green dot: Section complete
- Amber dot: Section partially complete
- Tooltip shows missing fields

## 15. Future Considerations

1. **Real-time collaboration** - Multiple providers editing same note
2. **Template library** - Pre-built note templates by visit type
3. **EHR integration** - Direct export to Epic/Cerner
4. **Audit trail** - Track all note modifications
5. **Natural language parsing** - Extract structured data from free text
