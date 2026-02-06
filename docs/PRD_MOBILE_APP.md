# PRD: Mobile Clinical App

## Document Information

| Field | Value |
|-------|-------|
| Version | 1.0 |
| Last Updated | February 2026 |
| Status | Production |
| Owner | Sevaro Clinical Engineering |

---

## 1. Overview

The Mobile Clinical App provides a touch-optimized, voice-first interface for clinical documentation on smartphones and tablets. It enables physicians to complete patient charts efficiently while moving between exam rooms, with full AI assistance and treatment recommendation integration.

### Key Capabilities

- **Voice-first input**: Chart Prep dictation with AI summary generation
- **Touch-optimized UI**: Bottom sheets, FAB menu, haptic feedback
- **Complete note generation**: AI-synthesized clinical documentation
- **Smart Recommendations**: Treatment plans linked to diagnoses
- **Offline-friendly**: Works with intermittent connectivity

### Architecture

```
Mobile Browser                    Next.js API                    Services
     |                               |                              |
     |-- MobileChartView.tsx ------->|                              |
     |   ├── FAB Menu                |                              |
     |   ├── Section Navigation      |                              |
     |   └── Diagnosis Pills         |                              |
     |                               |                              |
     |-- MobileVoiceRecorder.tsx --->|                              |
     |   ├── Audio Recording ------->| POST /api/ai/transcribe ---->| Whisper
     |   └── Chart Prep Mode ------->| POST /api/ai/chart-prep ---->| GPT-5-mini
     |                               |                              |
     |-- MobileNotePreview.tsx ----->|                              |
     |   └── Generate Note --------->| POST /api/ai/synthesize ---->| GPT-5.2
     |                               |                              |
     |-- MobileRecommendationsSheet->|                              |
     |   └── Fetch Plans ----------->| GET /api/plans ------------->| Supabase
```

---

## 2. User Stories

### 2.1 Patient List & Navigation

| ID | Story | Priority |
|----|-------|----------|
| M01 | As a physician, I want to see my patient schedule on my phone so I can prepare between appointments | P0 |
| M02 | As a physician, I want to tap a patient card to open their chart | P0 |
| M03 | As a physician, I want to search for patients by name when I need to find someone quickly | P1 |
| M04 | As a physician, I want to filter patients by status (scheduled, active, completed) | P1 |
| M05 | As a physician, I want to swipe to check-in a patient | P2 |

### 2.2 FAB Menu

| ID | Story | Priority |
|----|-------|----------|
| M10 | As a physician, I want a floating button for quick actions so I don't have to scroll | P0 |
| M11 | As a physician, I want to save a draft from the FAB menu | P0 |
| M12 | As a physician, I want to prepare a complete note from the FAB menu | P0 |
| M13 | As a physician, I want to sign and complete from the FAB menu | P0 |

### 2.3 Chart Prep AI

| ID | Story | Priority |
|----|-------|----------|
| M20 | As a physician, I want to dictate pre-visit notes while reviewing prior records | P0 |
| M21 | As a physician, I want AI to categorize my dictation into HPI, Assessment, and Plan | P0 |
| M22 | As a physician, I want to add individual Chart Prep items to specific note sections | P0 |
| M23 | As a physician, I want to add all Chart Prep content to my note with one tap | P0 |
| M24 | As a physician, I want re-running Chart Prep to replace previous AI content, not duplicate it | P0 |

### 2.4 Note Preview

| ID | Story | Priority |
|----|-------|----------|
| M30 | As a physician, I want to preview my complete note before signing | P0 |
| M31 | As a physician, I want to choose between New Consult and Follow-up formatting | P0 |
| M32 | As a physician, I want to select note length (Concise or Standard) | P1 |
| M33 | As a physician, I want to copy the note to my clipboard for EHR paste | P0 |
| M34 | As a physician, I want to sign and complete directly from the preview | P0 |

### 2.5 Smart Recommendations

| ID | Story | Priority |
|----|-------|----------|
| M40 | As a physician, I want to see treatment recommendations when I tap a diagnosis | P0 |
| M41 | As a physician, I want recommendations organized into expandable sections | P1 |
| M42 | As a physician, I want to select multiple recommendations with checkboxes | P0 |
| M43 | As a physician, I want to add selected recommendations to my plan with one tap | P0 |

---

## 3. Component Architecture

### 3.1 File Structure

```
src/
├── app/mobile/
│   ├── page.tsx                    # Patient list
│   ├── chart/[id]/page.tsx         # Chart view route
│   ├── voice/page.tsx              # Voice recorder route
│   └── settings/page.tsx           # Mobile settings
├── components/mobile/
│   ├── MobileLayout.tsx            # Wrapper with safe areas
│   ├── MobilePatientCard.tsx       # Patient list item
│   ├── MobileChartView.tsx         # Main chart with FAB (972 lines)
│   ├── MobileVoiceRecorder.tsx     # Voice with Chart Prep (1000 lines)
│   ├── MobileNotePreview.tsx       # Note generation sheet (448 lines)
│   └── MobileRecommendationsSheet.tsx # Treatment plans (504 lines)
└── middleware.ts                   # Mobile auto-detection
```

### 3.2 Component Hierarchy

```
MobileLayout
├── MobilePatientList (/mobile)
│   └── MobilePatientCard[]
└── MobileChartView (/mobile/chart/[id])
    ├── Section Navigation Pills
    ├── Note Fields (collapsible sections)
    ├── Diagnosis Pills
    ├── FAB Menu (fixed bottom-right)
    ├── MobileVoiceRecorder (modal)
    ├── MobileNotePreview (bottom sheet)
    └── MobileRecommendationsSheet (bottom sheet)
```

### 3.3 State Management

**MobileChartView.tsx State:**
```typescript
// Note content
const [noteData, setNoteData] = useState<Record<string, string>>({})

// UI state
const [selectedSection, setSelectedSection] = useState<string>('summary')
const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['summary']))
const [fabOpen, setFabOpen] = useState(false)

// Voice recorder
const [showVoiceRecorder, setShowVoiceRecorder] = useState(false)
const [voiceMode, setVoiceMode] = useState<'dictate' | 'chart-prep'>('dictate')
const [chartPrepTarget, setChartPrepTarget] = useState<string | null>(null)

// Sheets
const [showNotePreview, setShowNotePreview] = useState(false)
const [activeRecommendation, setActiveRecommendation] = useState<{id: string, name: string} | null>(null)

// Diagnoses
const [selectedDiagnoses, setSelectedDiagnoses] = useState<Array<{id: string, name: string, icd10: string}>>([])
```

---

## 4. Component Specifications

### 4.1 FAB Menu

**Purpose**: Quick access to save, note preview, and sign actions

**Position**: Fixed bottom-right, 24px from edges, respecting safe-area-inset-bottom

**Appearance**:
- Collapsed: 56px teal circle with checkmark icon
- Expanded: 3 vertically stacked action buttons

**Actions** (bottom to top):
1. **Sign & Complete** (green): Triggers sign workflow, marks patient complete
2. **Prepare Note** (teal): Opens MobileNotePreview sheet
3. **Save Draft** (amber outline): Saves current note state

**Interactions**:
- Tap FAB to expand/collapse
- Tap outside expanded menu to collapse
- Haptic feedback (20ms vibrate) on all interactions

**Visual States**:
```typescript
// Collapsed FAB
<button style={{
  position: 'fixed',
  bottom: 'calc(24px + env(safe-area-inset-bottom))',
  right: '24px',
  width: '56px',
  height: '56px',
  borderRadius: '50%',
  background: 'linear-gradient(135deg, #0D9488, #14B8A6)',
  boxShadow: '0 4px 12px rgba(13, 148, 136, 0.4)',
  zIndex: 1000,
}} />

// Expanded menu items
// Save Draft: amber outline
// Prepare Note: teal gradient
// Sign & Complete: green gradient
```

### 4.2 MobileVoiceRecorder

**Purpose**: Voice dictation with optional Chart Prep AI processing

**Props**:
```typescript
interface MobileVoiceRecorderProps {
  isOpen: boolean
  onClose: () => void
  onTranscriptionComplete: (text: string, targetSection: string) => void
  mode: 'dictate' | 'chart-prep'
  targetSection: string
  patient?: { id: string; name: string; ... }
  noteData?: Record<string, string>
  onChartPrepComplete?: (sections: ChartPrepSection[]) => void
}
```

**Modes**:

1. **Dictate Mode**: Transcription only
   - Records audio → Sends to /api/ai/transcribe → Returns text
   - Appends transcribed text to target section

2. **Chart Prep Mode**: Transcription + AI processing
   - Records audio → Transcribes → Sends to /api/ai/chart-prep
   - Returns categorized sections (Summary, Alerts, HPI, Assessment, Plan)
   - Shows results panel with Add/Add All buttons

**Audio Configuration**:
```typescript
// Safari MIME type fallback
const mimeTypes = ['audio/webm', 'audio/mp4', 'audio/aac', 'audio/ogg']
const supportedType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type))

// Max duration: 120 seconds
// File size limit: 25MB
```

**Chart Prep Results Panel**:
```typescript
interface ChartPrepSection {
  category: 'summary' | 'alerts' | 'focus' | 'hpi' | 'assessment' | 'plan'
  items: string[]
  color: string // red for alerts, yellow for focus, gray for others
}
```

### 4.3 MobileNotePreview

**Purpose**: Generate and preview formatted clinical note

**Props**:
```typescript
interface MobileNotePreviewProps {
  isOpen: boolean
  onClose: () => void
  noteData: Record<string, string>
  patient: { id: string; name: string; age: number; gender: string; reason?: string }
  onSign: () => void
}
```

**State**:
```typescript
const [noteType, setNoteType] = useState<'new-consult' | 'follow-up'>('new-consult')
const [noteLength, setNoteLength] = useState<'concise' | 'standard'>('standard')
const [isGenerating, setIsGenerating] = useState(false)
const [generatedNote, setGeneratedNote] = useState<string | null>(null)
```

**Layout**:
1. **Header**: Purple gradient with document icon, close button
2. **Options Bar**: Note type toggle, length toggle
3. **Content Area**:
   - Before generation: "Generate with AI" button
   - After generation: Scrollable monospace note preview
4. **Footer**: Copy button, Sign & Complete button

**API Call**:
```typescript
POST /api/ai/synthesize-note
{
  noteType: 'new-consult' | 'follow-up',
  noteLength: 'concise' | 'standard',
  manualData: { hpi, ros, exam, assessment, plan },
  patient: { name, age, gender, chiefComplaint }
}
```

**Fallback**: If API fails, uses `formatNoteManually()` which builds note from sections

### 4.4 MobileRecommendationsSheet

**Purpose**: Display and select treatment recommendations for a diagnosis

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

**State**:
```typescript
const [plan, setPlan] = useState<ClinicalPlan | null>(null)
const [loading, setLoading] = useState(false)
const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
```

**Data Types**:
```typescript
interface ClinicalPlan {
  id: string
  title: string
  icd10: string[]
  sections: { [section: string]: { [subsection: string]: RecommendationItem[] } }
  patientInstructions?: string[]
}

interface RecommendationItem {
  item: string
  priority?: 'STAT' | 'URGENT' | 'ROUTINE'
  dosing?: string | { orderSentence?: string; doseOptions?: DoseOption[] }
  rationale?: string
}
```

**Layout**:
1. **Drag Handle**: Centered 36x4px gray bar
2. **Header**: Plan title, ICD-10 badge, close button
3. **Content**: Collapsible sections with subsections and checkbox items
4. **Footer**: "Add to Plan" button with selected count

**Priority Colors**:
- STAT: Red (#EF4444)
- URGENT: Amber (#F59E0B)
- ROUTINE: Blue (#3B82F6)

---

## 5. Data Flow

### 5.1 Chart Prep Flow

```
1. User taps mic button on a note section
2. MobileVoiceRecorder opens in chart-prep mode
3. User records dictation (max 120s)
4. Audio sent to /api/ai/transcribe (Whisper)
5. Transcription + patient context sent to /api/ai/chart-prep (GPT-5-mini)
6. AI returns structured sections:
   - Summary: Brief overview
   - Alerts: Critical findings (red highlight)
   - Focus: Suggested focus areas (yellow highlight)
   - HPI/Assessment/Plan: Categorized content
7. User can tap "Add" on individual items or "Add All to Note"
8. Content inserted with markers:
   --- Chart Prep ---
   [AI content]
   --- End Chart Prep ---
9. Re-running Chart Prep replaces content between markers
```

### 5.2 Note Preview Flow

```
1. User taps "Prepare Note" in FAB menu
2. MobileNotePreview sheet slides up
3. User selects note type (New Consult / Follow-up)
4. User selects length (Concise / Standard)
5. User taps "Generate with AI"
6. /api/ai/synthesize-note called with:
   - noteType, noteLength
   - manualData (all note sections)
   - patient demographics
7. AI returns formatted clinical note
8. Note displayed in monospace preview
9. User can:
   - Tap "Copy" to copy to clipboard
   - Tap "Sign & Complete" to finish visit
```

### 5.3 Recommendations Flow

```
1. User selects diagnosis in Assessment section
2. Diagnosis pill appears with "Tap for Treatment Recommendations"
3. User taps diagnosis pill
4. MobileRecommendationsSheet opens
5. /api/plans?diagnosisId={id} fetched
6. Plan sections displayed with first section auto-expanded
7. User checks desired items
8. User taps "Add to Plan"
9. Selected items passed to onAddToPlan callback
10. Items appended to Plan section in noteData
11. Sheet closes with "Added!" confirmation
```

---

## 6. UI Patterns

### 6.1 Bottom Sheet Pattern

All mobile sheets use consistent styling:

```typescript
// Container
{
  position: 'fixed',
  inset: 0,
  zIndex: 10000,
}

// Backdrop
{
  position: 'absolute',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.4)',
  onClick: onClose,
}

// Sheet
{
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  maxHeight: '70vh', // or 90vh for note preview
  background: 'var(--bg-white, #fff)',
  borderTopLeftRadius: '16px',
  borderTopRightRadius: '16px',
  animation: 'slideUp 0.3s ease-out',
}

// Drag handle
{
  width: '36px',
  height: '4px',
  borderRadius: '2px',
  background: 'var(--border, #e5e7eb)',
  margin: '8px auto',
}

// Footer with safe area
{
  paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
}
```

### 6.2 Haptic Feedback

All interactive elements trigger haptic feedback:

```typescript
// Light tap (20ms)
if ('vibrate' in navigator) navigator.vibrate(20)

// Success pattern (100-50-100ms)
if ('vibrate' in navigator) navigator.vibrate([100, 50, 100])
```

### 6.3 Touch Targets

Minimum 44px tap targets per Apple HIG:

```typescript
// Button minimum
{ minHeight: '44px', minWidth: '44px' }

// List item padding
{ padding: '12px 16px' }
```

---

## 7. Safari/iOS Compatibility

### 7.1 Safe Area Handling

```typescript
// Header padding
paddingTop: 'max(16px, env(safe-area-inset-top))'

// Footer padding
paddingBottom: 'calc(12px + env(safe-area-inset-bottom))'

// FAB position
bottom: 'calc(24px + env(safe-area-inset-bottom))'
```

### 7.2 Audio MIME Types

Safari requires specific MIME type handling:

```typescript
const getMimeType = () => {
  if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm'
  if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4'
  if (MediaRecorder.isTypeSupported('audio/aac')) return 'audio/aac'
  if (MediaRecorder.isTypeSupported('audio/ogg')) return 'audio/ogg'
  return 'audio/mp4' // fallback
}
```

### 7.3 Audio Playback

```typescript
// Required for iOS autoplay
<audio autoPlay playsInline />
```

---

## 8. API Dependencies

| Endpoint | Method | Purpose | Response |
|----------|--------|---------|----------|
| /api/ai/transcribe | POST | Transcribe audio to text | `{ text, confidence }` |
| /api/ai/chart-prep | POST | Generate Chart Prep summary | `{ aiSummary, alerts, focus, keyPoints }` |
| /api/ai/synthesize-note | POST | Generate formatted note | `{ synthesizedNote }` |
| /api/plans | GET | Fetch treatment recommendations | `{ plan: ClinicalPlan }` |
| /api/visits/[id] | PATCH | Save draft | `{ visit }` |
| /api/visits/[id]/sign | POST | Sign and complete | `{ visit, note }` |

---

## 9. Testing Considerations

### 9.1 QA Test Sections

See `/qa/TEST_RUNBOOK.md` for full test cases:
- **Section M**: Mobile patient list
- **Section N**: Mobile chart view
- **Section Q**: Mobile Chart Prep AI
- **Section R**: Mobile Note Preview
- **Section S**: Mobile Smart Recommendations

### 9.2 Real Device Testing Required

- Voice transcription on iPhone Safari
- Haptic feedback verification
- Bottom sheet gesture behavior
- Safe area inset rendering
- Audio recording in background/locked state

### 9.3 Critical Paths

1. Voice → Transcribe → Chart Prep → Add to Note
2. FAB → Prepare Note → Generate → Sign
3. Diagnosis tap → Recommendations → Select → Add to Plan

---

## 10. Future Enhancements

| Enhancement | Priority | Description |
|-------------|----------|-------------|
| Offline mode | P1 | Queue actions when offline, sync when connected |
| Apple Watch companion | P2 | Voice dictation from watch |
| Face ID signature | P2 | Biometric sign-off for notes |
| Swipe gestures | P3 | Swipe between patients in chart view |
| Widget support | P3 | iOS widget for next patient |
