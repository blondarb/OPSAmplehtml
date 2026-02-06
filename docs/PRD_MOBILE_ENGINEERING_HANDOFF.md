# Mobile App Engineering Handoff

## Document Information

| Field | Value |
|-------|-------|
| Version | 1.0 |
| Last Updated | February 2026 |
| Status | Engineering Ready |
| Owner | Sevaro Clinical Engineering |

---

## 1. Component Reference

### MobileChartView.tsx

| Property | Value |
|----------|-------|
| **Path** | `src/components/mobile/MobileChartView.tsx` |
| **Lines** | ~972 |
| **Purpose** | Main chart view with section navigation, FAB menu, voice recording, diagnosis selection |

**Key Props**:
```typescript
interface MobileChartViewProps {
  patient: {
    id: string
    name: string
    age: number
    gender: string
    reason?: string
    status?: string
  }
  onBack: () => void
  onComplete: () => void
}
```

**Key State**:
```typescript
// Note content
noteData: Record<string, string>

// UI
selectedSection: string
expandedSections: Set<string>
fabOpen: boolean

// Voice
showVoiceRecorder: boolean
voiceMode: 'dictate' | 'chart-prep'
chartPrepTarget: string | null

// Sheets
showNotePreview: boolean
activeRecommendation: { id: string; name: string } | null

// Diagnoses
selectedDiagnoses: Array<{ id: string; name: string; icd10: string }>
```

**Key Handlers**:
- `handleChartPrepComplete(sections)` - Inserts Chart Prep content with markers
- `handleAddRecommendationsToPlan(items)` - Appends recommendations to plan
- `handleSave()` - PATCH to /api/visits/[id]
- `handleSign()` - POST to /api/visits/[id]/sign

---

### MobileVoiceRecorder.tsx

| Property | Value |
|----------|-------|
| **Path** | `src/components/mobile/MobileVoiceRecorder.tsx` |
| **Lines** | ~1000 |
| **Purpose** | Voice recording with dictation and chart-prep modes |

**Key Props**:
```typescript
interface MobileVoiceRecorderProps {
  isOpen: boolean
  onClose: () => void
  onTranscriptionComplete: (text: string, targetSection: string) => void
  mode: 'dictate' | 'chart-prep'
  targetSection: string
  patient?: {
    id: string
    name: string
    age: number
    gender: string
    reason?: string
  }
  noteData?: Record<string, string>
  onChartPrepComplete?: (sections: ChartPrepSection[]) => void
}
```

**Chart Prep Types**:
```typescript
interface ChartPrepSection {
  category: 'summary' | 'alerts' | 'focus' | 'hpi' | 'assessment' | 'plan'
  items: string[]
  color: string
}
```

**API Calls**:
1. `POST /api/ai/transcribe` - Audio → text
2. `POST /api/ai/chart-prep` - Text → structured sections

---

### MobileNotePreview.tsx

| Property | Value |
|----------|-------|
| **Path** | `src/components/mobile/MobileNotePreview.tsx` |
| **Lines** | 448 |
| **Purpose** | Bottom sheet for note generation with type/length selection |

**Props**:
```typescript
interface MobileNotePreviewProps {
  isOpen: boolean
  onClose: () => void
  noteData: Record<string, string>
  patient: {
    id: string
    name: string
    age: number
    gender: string
    reason?: string
  }
  onSign: () => void
}
```

**State**:
```typescript
noteType: 'new-consult' | 'follow-up'
noteLength: 'concise' | 'standard'
isGenerating: boolean
generatedNote: string | null
copied: boolean
```

**API Call**:
```typescript
POST /api/ai/synthesize-note
{
  noteType: string,
  noteLength: string,
  manualData: { hpi, ros, exam, assessment, plan },
  patient: { name, age, gender, chiefComplaint }
}
// Response: { synthesizedNote: string }
```

---

### MobileRecommendationsSheet.tsx

| Property | Value |
|----------|-------|
| **Path** | `src/components/mobile/MobileRecommendationsSheet.tsx` |
| **Lines** | 504 |
| **Purpose** | Bottom sheet for treatment recommendations |

**Props**:
```typescript
interface MobileRecommendationsSheetProps {
  isOpen: boolean
  onClose: () => void
  diagnosisId: string
  diagnosisName: string
  onAddToPlan: (items: string[]) => void
}
```

**Types**:
```typescript
interface ClinicalPlan {
  id: string
  title: string
  icd10: string[]
  scope?: string
  sections: {
    [section: string]: {
      [subsection: string]: RecommendationItem[]
    }
  }
  patientInstructions?: string[]
}

interface RecommendationItem {
  item: string
  priority?: 'STAT' | 'URGENT' | 'ROUTINE'
  dosing?: string | {
    orderSentence?: string
    doseOptions?: Array<{ text: string; orderSentence: string }>
  }
  rationale?: string
}
```

**API Call**:
```typescript
GET /api/plans?diagnosisId={id}
// Response: { plan: ClinicalPlan }
```

---

## 2. API Dependencies

### /api/ai/transcribe

| Property | Value |
|----------|-------|
| Method | POST |
| Model | Whisper + GPT-5-mini cleanup |
| Max file size | 25MB |
| Supported formats | webm, mp4, aac, ogg, m4a |

**Request**:
```typescript
// FormData with audio file
const formData = new FormData()
formData.append('audio', audioBlob)
```

**Response**:
```typescript
{
  text: string
  confidence?: number
}
```

---

### /api/ai/chart-prep

| Property | Value |
|----------|-------|
| Method | POST |
| Model | GPT-5-mini |
| Max tokens | 1000 |

**Request**:
```typescript
{
  dictationText: string
  patientContext: {
    name: string
    age: number
    gender: string
    chiefComplaint?: string
    priorNotes?: string
  }
  currentNoteData?: Record<string, string>
}
```

**Response**:
```typescript
{
  aiSummary: string
  alerts: string[]      // Critical findings
  focus: string[]       // Suggested focus areas
  keyPoints: string[]   // Key observations
  suggestedHPI?: string
  suggestedAssessment?: string
  suggestedPlan?: string
}
```

---

### /api/ai/synthesize-note

| Property | Value |
|----------|-------|
| Method | POST |
| Model | GPT-5.2 |
| Max tokens | 2000 |

**Request**:
```typescript
{
  noteType: 'new-consult' | 'follow-up'
  noteLength: 'concise' | 'standard'
  manualData: {
    hpi: string
    ros: string
    exam: string
    assessment: string
    plan: string
  }
  patient: {
    name: string
    age: number
    gender: string
    chiefComplaint: string
  }
}
```

**Response**:
```typescript
{
  synthesizedNote: string
}
```

---

### /api/plans

| Property | Value |
|----------|-------|
| Method | GET |
| Data source | Supabase clinical_plans table |

**Query Parameters**:
- `diagnosisId` - ICD-10 code or diagnosis ID

**Response**:
```typescript
{
  plan: ClinicalPlan | null
}
```

---

## 3. Safari/iOS Compatibility

### Audio MIME Type Mapping

Safari doesn't support `audio/webm`. Use this fallback:

```typescript
const getSupportedMimeType = (): string => {
  const types = [
    'audio/webm',
    'audio/mp4',
    'audio/aac',
    'audio/m4a',
    'audio/ogg'
  ]
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type
    }
  }
  return 'audio/mp4' // Safari default
}
```

### Safe Area Insets

All fixed-position elements must respect notch/home indicator:

```typescript
// Header
paddingTop: 'max(16px, env(safe-area-inset-top))'

// Footer
paddingBottom: 'calc(12px + env(safe-area-inset-bottom))'

// FAB
bottom: 'calc(24px + env(safe-area-inset-bottom))'
right: '24px'
```

### Audio Autoplay

iOS requires user gesture for audio. For playback elements:

```html
<audio autoPlay playsInline />
```

---

## 4. State Management Patterns

### Chart Prep Marker System

Chart Prep content uses markers for idempotent updates:

```typescript
const CHART_PREP_START = '--- Chart Prep ---'
const CHART_PREP_END = '--- End Chart Prep ---'

// Insert with markers
const insertChartPrepContent = (existingText: string, newContent: string): string => {
  // Remove existing Chart Prep content
  const cleaned = existingText.replace(
    /--- Chart Prep ---[\s\S]*?--- End Chart Prep ---/g,
    ''
  ).trim()

  // Add new content with markers
  return `${cleaned}\n\n${CHART_PREP_START}\n${newContent}\n${CHART_PREP_END}`.trim()
}
```

### FAB Menu State

Simple boolean toggle with backdrop:

```typescript
const [fabOpen, setFabOpen] = useState(false)

// Toggle on FAB click
onClick={() => setFabOpen(!fabOpen)}

// Close on backdrop click
{fabOpen && <div onClick={() => setFabOpen(false)} />}
```

### Haptic Feedback

Use throughout for touch feedback:

```typescript
// Light tap
const lightHaptic = () => {
  if ('vibrate' in navigator) navigator.vibrate(20)
}

// Success feedback
const successHaptic = () => {
  if ('vibrate' in navigator) navigator.vibrate([100, 50, 100])
}
```

---

## 5. Testing Requirements

### Real Device Testing

These features require real device testing (not simulator):

1. **Voice transcription** - Microphone access, audio quality
2. **Haptic feedback** - `navigator.vibrate()` not available in simulator
3. **Safe area insets** - Notch/home indicator handling
4. **Bottom sheet gestures** - Touch responsiveness

### Critical Test Paths

1. **Chart Prep Flow**:
   - Open voice recorder in chart-prep mode
   - Record 30+ seconds of dictation
   - Verify AI summary appears with categorized sections
   - Verify "Add All to Note" inserts with markers
   - Re-run Chart Prep, verify previous content replaced

2. **Note Preview Flow**:
   - Open Prepare Note from FAB
   - Select type and length
   - Generate with AI
   - Verify formatted note appears
   - Copy to clipboard, verify in paste target
   - Sign & Complete, verify patient status changes

3. **Recommendations Flow**:
   - Add diagnosis in Assessment
   - Tap diagnosis pill
   - Verify plan loads (or graceful error)
   - Select multiple items
   - Add to Plan
   - Verify items appear in plan section

### Browser Compatibility Matrix

| Browser | Voice | Haptic | Sheets | Notes |
|---------|-------|--------|--------|-------|
| Chrome iOS | ✅ | ❌ | ✅ | No haptic on iOS Chrome |
| Safari iOS | ✅ | ✅ | ✅ | Requires MIME fallback |
| Chrome Android | ✅ | ✅ | ✅ | Full support |
| Firefox Android | ✅ | ✅ | ✅ | Full support |

---

## 6. File Change Summary

| File | Lines Changed | Description |
|------|---------------|-------------|
| MobileChartView.tsx | +350 | FAB menu, Chart Prep handling, diagnosis selection |
| MobileVoiceRecorder.tsx | +400 | Chart-prep mode, results panel, API integration |
| MobileNotePreview.tsx | +448 (new) | Full component for note generation |
| MobileRecommendationsSheet.tsx | +504 (new) | Full component for recommendations |

**Total**: ~1,700 lines added/modified

---

## 7. Deployment Notes

### Environment Variables

No new environment variables required. Uses existing:
- `OPENAI_API_KEY` for AI endpoints
- Supabase credentials for plans API

### Database Dependencies

Uses existing tables:
- `clinical_plans` - Treatment recommendations
- `visits` - Visit records
- `clinical_notes` - Signed notes

No migrations required for mobile features.

### Vercel Configuration

Mobile routes are server-side rendered. Ensure:
- `/mobile/*` routes not excluded from SSR
- API routes have adequate timeout (30s for AI endpoints)
