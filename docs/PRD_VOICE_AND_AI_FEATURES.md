# PRD: Voice and AI Features

## Document Info
- **Version**: 1.0
- **Last Updated**: February 5, 2026
- **Status**: Engineering Ready

## 1. Overview

The Voice and AI Features provide intelligent assistance throughout the clinical documentation workflow. This includes voice dictation, AI-powered content generation, clinical summarization, and patient education materials.

### Feature Groups
- **Voice Drawer** (Red theme) - Chart Prep and full visit documentation
- **AI Drawer** (Teal theme) - Ask AI, Patient Summary, Patient Handouts
- **Field-Level AI** - Improve/Expand/Summarize actions
- **Note Generation** - AI synthesis with review and in-modal chat

## 2. User Stories

### Voice Dictation
| ID | Story | Acceptance Criteria |
|----|-------|-------------------|
| VA-1 | As a clinician, I want to dictate pre-visit notes | Chart Prep captures, categorizes, and summarizes dictation |
| VA-2 | As a clinician, I want to record full patient visits | Visit AI extracts HPI, ROS, Exam, Assessment, Plan |
| VA-3 | As a clinician, I want to dictate into any text field | Red mic button transcribes to active field |

### AI Assistance
| ID | Story | Acceptance Criteria |
|----|-------|-------------------|
| VA-4 | As a clinician, I want to ask clinical questions | Ask AI responds with patient context |
| VA-5 | As a clinician, I want to improve my documentation | Field AI actions refine text without hallucination |
| VA-6 | As a clinician, I want patient-friendly summaries | Summary generates at Simple/Standard/Detailed levels |
| VA-7 | As a clinician, I want educational handouts | Handouts generated in selected language/reading level |

### Note Generation
| ID | Story | Acceptance Criteria |
|----|-------|-------------------|
| VA-8 | As a clinician, I want AI to review my note | Note review suggests improvements with section links |
| VA-9 | As a clinician, I want to ask questions about my note | In-modal chat answers questions about generated note |

## 3. OpenAI Model Configuration

### Models (Updated February 2026)
| Task Type | Model | Cost | Use Case |
|-----------|-------|------|----------|
| Simple | `gpt-5-mini` | Low | Ask AI, Chart Prep, Field Actions, Transcribe cleanup, Note Review |
| Complex | `gpt-5.2` | High | Visit AI extraction, Scale Autofill, Note Synthesis, Assessment Generation |
| Audio | `whisper-1` | Low | Audio transcription |
| Realtime | `gpt-realtime` | High | AI Historian voice sessions (see PRD_AI_HISTORIAN.md) |

### Migration Notes
- `gpt-4o-mini` deprecated Feb 16, 2026 → use `gpt-5-mini`
- `gpt-4o-realtime-preview` deprecated Feb 27, 2026 → use `gpt-realtime`

## 4. Voice Drawer (Red Theme)

### Tabs
1. **Chart Prep** - Pre-visit dictation with AI categorization
2. **Document** - Full visit recording with clinical extraction

### 4.1 Chart Prep Tab

#### Workflow
1. Click "Start Recording" (fresh session)
2. Dictate observations while reviewing chart
3. Pause/resume as needed
4. Stop recording → transcription sent to Whisper
5. AI categorizes content and generates summary

#### State Management
```typescript
// VoiceDrawer.tsx
const [prepNotes, setPrepNotes] = useState<Array<{
  text: string
  timestamp: string
  category: string
}>>([])
const [chartPrepSections, setChartPrepSections] = useState<ChartPrepOutput | null>(null)
```

#### API: `/api/ai/chart-prep`
```typescript
// Request
{
  patient: PatientInfo,
  noteData: ManualNoteData,
  prepNotes: Array<{ text: string; timestamp: string; category: string }>,
  userSettings?: {
    globalAiInstructions: string,
    documentationStyle: 'concise' | 'detailed' | 'standard',
    preferredTerminology: 'standard' | 'simplified'
  }
}

// Response
{
  sections: ChartPrepOutput
}

interface ChartPrepOutput {
  patientSummary?: string      // Narrative summary paragraph
  alerts?: string[]            // Red flag items
  suggestedFocus?: string[]    // Key areas to address
  suggestedHPI?: string
  relevantHistory?: string
  currentMedications?: string
  imagingFindings?: string
  scaleTrends?: string
  keyConsiderations?: string
  suggestedAssessment?: string
  suggestedPlan?: string
}
```

#### System Prompt (Chart Prep)
```
You are a clinical documentation assistant for a neurology practice.
Analyze the dictated notes and patient context to generate a structured
pre-visit summary.

Output a SINGLE PARAGRAPH narrative summary (patientSummary) that:
- Starts with patient demographics and chief complaint
- Flows naturally through relevant history
- Highlights key clinical considerations
- Does NOT use bullet points or numbered lists

Also identify:
- Alerts: Red flags requiring immediate attention
- Suggested Focus: Areas the clinician should address

{userSettings.globalAiInstructions}
```

#### Marker-Based Content Replacement
```typescript
// When re-processing Chart Prep, replace previous content using markers
const CHART_PREP_START = '--- Chart Prep ---'
const CHART_PREP_END = '--- End Chart Prep ---'

function insertChartPrepContent(currentText: string, newContent: string): string {
  const startIdx = currentText.indexOf(CHART_PREP_START)
  const endIdx = currentText.indexOf(CHART_PREP_END)

  if (startIdx !== -1 && endIdx !== -1) {
    // Replace existing Chart Prep content
    return currentText.slice(0, startIdx) +
           CHART_PREP_START + '\n' + newContent + '\n' + CHART_PREP_END +
           currentText.slice(endIdx + CHART_PREP_END.length)
  }

  // Append new Chart Prep content
  return currentText + '\n\n' + CHART_PREP_START + '\n' + newContent + '\n' + CHART_PREP_END
}
```

### 4.2 Document Tab (Visit AI)

#### Workflow
1. Click "Start Recording" to begin visit capture
2. Record entire patient encounter
3. Stop recording → audio sent to Visit AI endpoint
4. AI transcribes and extracts clinical content

#### API: `/api/ai/visit-ai`
```typescript
// Request: FormData with audio file
const formData = new FormData()
formData.append('audio', audioBlob, 'visit-recording.webm')
formData.append('patient', JSON.stringify(patient))
formData.append('noteData', JSON.stringify(noteData))
formData.append('maxDuration', '120')  // 2 minute limit

// Response
{
  hpiFromVisit: string,
  rosFromVisit: string,
  examFromVisit: string,
  assessmentFromVisit: string,
  planFromVisit: string,
  transcriptSummary: string,
  transcript: string,
  confidence: {
    hpi: number,      // 0-100
    ros: number,
    exam: number,
    assessment: number,
    plan: number
  }
}
```

#### System Prompt (Visit AI)
```
You are an expert clinical documentation assistant. Analyze this
patient-provider conversation transcript and extract structured
clinical content.

For each section, provide:
1. HPI: History of presenting illness in narrative format
2. ROS: Review of systems findings mentioned
3. Exam: Physical examination findings discussed
4. Assessment: Clinical impressions and diagnoses mentioned
5. Plan: Treatment recommendations discussed

Guidelines:
- Only include information explicitly stated in the transcript
- Do not infer or hallucinate details not mentioned
- Use appropriate medical terminology
- Format for direct EHR entry
- Provide confidence scores (0-100) for each extraction

{userSettings.globalAiInstructions}
```

## 5. AI Drawer (Teal Theme)

### Tabs
1. **Ask AI** - Clinical questions with patient context
2. **Summary** - Patient-friendly visit summaries
3. **Handout** - Educational materials

### 5.1 Ask AI Tab

#### Features
- Free-form clinical questions
- Suggested questions based on context
- Full patient context included in request

#### API: `/api/ai/ask`
```typescript
// Request
{
  question: string,
  patientContext: {
    name: string,
    age: number,
    chiefComplaint: string[],
    diagnoses: Diagnosis[],
    medications: PatientMedication[],
    recentNotes: string
  },
  fullNoteText?: string  // For "Ask AI About This Note" feature
}

// Response
{
  answer: string
}
```

#### System Prompt (Ask AI)
```
You are a clinical assistant for a neurology practice. Answer the
clinician's question using the provided patient context.

Patient Context:
{patientContext}

Guidelines:
- Provide evidence-based clinical guidance
- Cite relevant guidelines when applicable
- Be concise but thorough
- If uncertain, acknowledge limitations
- Never provide definitive diagnoses

{userSettings.globalAiInstructions}
```

### 5.2 Summary Tab

#### Reading Levels
- **Simple** - 5th grade reading level, basic terms
- **Standard** - 8th grade reading level, some medical terms explained
- **Detailed** - Full medical terminology with explanations

#### API: `/api/ai/ask` (with summary prompt)
```typescript
// Request
{
  question: "Generate a patient summary",
  patientContext: {...},
  summaryLevel: 'simple' | 'standard' | 'detailed'
}
```

### 5.3 Handout Tab

#### Features
- Auto-suggest conditions from diagnoses
- Reading level selector (Simple/Standard/Advanced)
- Language selection (free-text input)
- Practice name header
- Print formatting

#### Condition Groups
```typescript
const HANDOUT_CONDITIONS = {
  fromThisVisit: [], // Populated from selected diagnoses
  commonConditions: [
    'Migraine',
    'Tension Headache',
    'Epilepsy',
    'Parkinson Disease',
    'Multiple Sclerosis',
    'Stroke Prevention',
    // ...
  ],
  personalized: []  // User-saved custom handouts
}
```

#### Print CSS
```css
@media print {
  [data-no-print] { display: none !important; }

  .print-wrapper {
    padding: 20mm;
    font-family: 'Times New Roman', serif;
    font-size: 12pt;
    line-height: 1.5;
  }

  .practice-header {
    text-align: center;
    margin-bottom: 20mm;
  }

  .print-footer {
    position: fixed;
    bottom: 10mm;
    text-align: center;
    font-size: 10pt;
  }
}
```

## 6. Field-Level AI Actions

### AiSuggestionPanel Component
Appears below NoteTextField when AI star button clicked.

#### Actions
| Action | Description | Anti-Hallucination |
|--------|-------------|-------------------|
| Improve | Enhance clarity and medical terminology | Must preserve all original facts |
| Expand | Add clinical detail and context | Only expand on existing content |
| Summarize | Condense to key points | No new information added |

#### API: `/api/ai/field-action`
```typescript
// Request
{
  action: 'improve' | 'expand' | 'summarize',
  text: string,
  fieldId: string,
  patientContext?: PatientContext,
  userSettings?: UserSettings
}

// Response
{
  result: string
}
```

#### System Prompt (Field Action)
```
You are a clinical documentation assistant. ${actionPrompt}

CRITICAL ANTI-HALLUCINATION RULES:
1. Do NOT add symptoms, findings, or history not in the original text
2. Do NOT add medications, allergies, or diagnoses not mentioned
3. Do NOT infer clinical reasoning not explicitly stated
4. Only ${actionVerb} what is already present

Original text:
${text}

${userSettings?.globalAiInstructions || ''}
```

## 7. Voice Recording Hook

### useVoiceRecorder
```typescript
// src/hooks/useVoiceRecorder.ts
interface UseVoiceRecorderOptions {
  onRecordingComplete?: (audioBlob: Blob) => void
}

interface UseVoiceRecorderReturn {
  isRecording: boolean
  isPaused: boolean
  isTranscribing: boolean
  error: string | null
  transcribedText: string
  recordingDuration: number
  startRecording: () => void
  pauseRecording: () => void
  resumeRecording: () => void
  stopRecording: () => void
  restartRecording: () => void
  clearTranscription: () => void
}
```

### MIME Type Handling (Safari Fix)
```typescript
const MIME_TYPES = {
  'audio/webm': 'webm',
  'audio/mp4': 'mp4',   // Safari
  'audio/m4a': 'm4a',   // Safari alternate
  'audio/ogg': 'ogg',
}

function getSupportedMimeType(): string {
  for (const mimeType of Object.keys(MIME_TYPES)) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType
    }
  }
  return 'audio/webm'  // Default
}
```

### File Size Validation
```typescript
const MAX_AUDIO_SIZE = 25 * 1024 * 1024  // 25MB

function validateAudioSize(blob: Blob): boolean {
  if (blob.size > MAX_AUDIO_SIZE) {
    throw new Error('Recording too large. Please limit recordings to 2 minutes.')
  }
  return true
}
```

### Retry with Stored Audio
```typescript
// Store last audio blob for retry
const lastAudioBlobRef = useRef<Blob | null>(null)

const processVisitAI = async (audioBlob: Blob) => {
  lastAudioBlobRef.current = audioBlob
  // ... process
}

const retryProcessing = () => {
  if (lastAudioBlobRef.current) {
    processVisitAI(lastAudioBlobRef.current)
  }
}
```

## 8. Transcription API

### `/api/ai/transcribe`
```typescript
// Request: FormData with audio file
const formData = new FormData()
formData.append('audio', audioBlob, `recording.${extension}`)

// Response
{
  text: string,
  duration: number
}
```

### Pipeline
1. Receive audio file (webm/mp4/m4a/ogg)
2. Transcribe with Whisper (`whisper-1`)
3. Clean up with GPT-5-mini:
   - Fix grammar, punctuation, and spelling errors
   - Correct medical terminology and abbreviations
   - **Handle verbal corrections** (e.g., "right hand, no wait, left hand" → "left hand")
   - Remove filler words (um, uh, like, you know) and false starts
   - Remove meta-commentary about the dictation
   - Never add information that wasn't dictated
4. Return cleaned transcript

### Transcription Cleanup Rules
| Behavior | Example Input | Example Output |
|----------|---------------|----------------|
| Verbal corrections | "right hand numbness, no I mean left hand" | "left hand numbness" |
| Filler words | "She, um, has had headaches for, like, two weeks" | "She has had headaches for two weeks" |
| False starts | "The patient, the patient reports..." | "The patient reports..." |
| Medical terms | "topomax 100 milligrams" | "Topiramate 100 mg" |
| Meta-commentary | "Let me start over. She presents with..." | "She presents with..." |

## 9. Note Merge Engine

### Purpose
Combines content from three sources into unified clinical note:
1. **Manual** - Clinician-entered content
2. **Chart Prep** - AI-generated pre-visit content
3. **Visit AI** - AI-extracted visit content

### Merge Priority
```
Manual > Visit AI > Chart Prep
```

### Core Function
```typescript
// src/lib/note-merge/merge-engine.ts
function mergeNoteContent(
  manualData: ManualNoteData,
  chartPrepData: ChartPrepOutput | null,
  visitAIData: VisitAIOutput | null,
  options: MergeOptions = DEFAULT_OPTIONS
): MergedClinicalNote

interface MergeOptions {
  conflictResolution: 'keep-manual' | 'prefer-ai' | 'merge-append'
  showAiSuggestions: boolean
}
```

### Field Merge Logic
```typescript
function mergeField(
  manual: string,
  chartPrep: string,
  visitAI: string,
  options: MergeOptions
): NoteFieldContent {
  // If manual content exists, keep it
  if (manual) {
    // Offer AI as suggestion if different
    if (options.showAiSuggestions && (visitAI || chartPrep)) {
      return {
        content: manual,
        source: 'manual',
        aiSuggestion: visitAI || chartPrep,
        aiSuggestionSource: visitAI ? 'visit-ai' : 'chart-prep'
      }
    }
    return { content: manual, source: 'manual' }
  }

  // No manual - use AI content
  if (visitAI) return { content: visitAI, source: 'visit-ai' }
  if (chartPrep) return { content: chartPrep, source: 'chart-prep' }

  return { content: '', source: 'manual' }
}
```

## 10. Note Generation & Review

### EnhancedNotePreviewModal

#### Generation Options
```typescript
interface NotePreferences {
  noteType: 'new-consult' | 'follow-up'
  noteLength: 'concise' | 'standard' | 'detailed'
  includeScales: boolean
  includeImaging: boolean
  includeLabs: boolean
  includeRecommendations: boolean
  showSources: boolean
}
```

### API: `/api/ai/synthesize-note`
```typescript
// Request
{
  data: ComprehensiveNoteData,
  preferences: NotePreferences
}

// Response
{
  note: FormattedNote
}

interface FormattedNote {
  header: string
  sections: FormattedNoteSection[]
  footer: string
  fullText: string
  wordCount: number
  generatedAt: string
}
```

### AI Note Review

#### API: `/api/ai/note-review`
```typescript
// Request
{
  fullNoteText: string,
  noteType: 'new-consult' | 'follow-up'
}

// Response
{
  suggestions: Array<{
    type: 'consistency' | 'completeness' | 'quality'
    severity: 'warning' | 'info'
    message: string
    section?: string
  }>
}
```

#### UI Components
- Collapsible suggestions panel
- Type badges with colors (amber warning, teal info)
- "Go to section" scroll links
- Dismiss buttons per suggestion
- Max 6 suggestions displayed

### Ask AI About This Note

#### Features
- Chat input bar in Generate Note modal
- Full note text sent as context
- 4 suggested question pills
- Right-aligned question bubbles, left-aligned answer bubbles

```typescript
// Request to /api/ai/ask
{
  question: "What medication interactions should I consider?",
  fullNoteText: generatedNote.fullText,
  patientContext: {...}
}
```

## 11. User Settings Integration

### Settings Structure
```typescript
interface NoteLayoutPreferences {
  includeHistorySummary: boolean    // Add patient history summary at top
  includeAllergiesAtTop: boolean    // Display allergies prominently
  includeProblemList: boolean       // Include active problem list
  groupMedicationsWithAssessment: boolean  // List meds with each diagnosis
}

interface UserSettings {
  // Note type-specific instructions (NEW)
  newConsultInstructions: string    // Instructions for new consultation notes
  followUpInstructions: string      // Instructions for follow-up notes

  // Section-specific instructions (apply to both note types)
  sectionAiInstructions: {
    hpi: string
    ros: string
    assessment: string
    plan: string
    physicalExam: string
  }

  // Note layout preferences (NEW)
  noteLayout: NoteLayoutPreferences

  // Documentation style
  documentationStyle: 'concise' | 'detailed' | 'narrative'
  preferredTerminology: 'formal' | 'standard' | 'simplified'

  // Legacy (for backward compatibility)
  globalAiInstructions?: string
}
```

### LocalStorage Key
```typescript
const SETTINGS_KEY = 'sevaro-user-settings'
```

### Injection Pattern (Updated for Note Types)

The synthesize-note endpoint selects instructions based on note type:

```typescript
// /api/ai/synthesize-note/route.ts
function buildSystemPrompt(
  noteType: 'new-consult' | 'follow-up',
  noteLength: 'concise' | 'standard' | 'detailed',
  userSettings?: UserSettings
): string {
  // Select note-type specific instructions
  const noteTypeGuidance = noteType === 'new-consult'
    ? (userSettings?.newConsultInstructions || DEFAULT_NEW_CONSULT)
    : (userSettings?.followUpInstructions || DEFAULT_FOLLOW_UP)

  let prompt = `${BASE_PROMPT}\n\n${noteTypeGuidance}`

  // Add terminology preference
  prompt += `\nTerminology: ${userSettings?.preferredTerminology || 'standard'}`

  // Add documentation style
  prompt += `\nDocumentation style: ${userSettings?.documentationStyle || 'detailed'}`

  // Add section-specific instructions
  if (userSettings?.sectionAiInstructions) {
    const sections = userSettings.sectionAiInstructions
    if (sections.hpi) prompt += `\nHPI Instructions: ${sections.hpi}`
    if (sections.ros) prompt += `\nROS Instructions: ${sections.ros}`
    if (sections.assessment) prompt += `\nAssessment Instructions: ${sections.assessment}`
    if (sections.plan) prompt += `\nPlan Instructions: ${sections.plan}`
    if (sections.physicalExam) prompt += `\nPhysical Exam Instructions: ${sections.physicalExam}`
  }

  // Add layout preferences
  if (userSettings?.noteLayout) {
    const layout = userSettings.noteLayout
    if (layout.includeHistorySummary) prompt += `\n- Include history summary at top`
    if (layout.includeAllergiesAtTop) prompt += `\n- List allergies prominently`
    if (layout.includeProblemList) prompt += `\n- Include active problem list in assessment`
    if (layout.groupMedicationsWithAssessment) prompt += `\n- Group medications with assessment`
  }

  // Legacy support
  if (userSettings?.globalAiInstructions && !userSettings.newConsultInstructions) {
    prompt += `\n\nAdditional instructions: ${userSettings.globalAiInstructions}`
  }

  return prompt
}
```

### Settings Migration

For backward compatibility, old settings are migrated to new format:
```typescript
function migrateSettings(old: Partial<UserSettings>): Partial<UserSettings> {
  const migrated = { ...old }

  // Migrate globalAiInstructions to both note types
  if (old.globalAiInstructions && !old.newConsultInstructions) {
    migrated.newConsultInstructions = old.globalAiInstructions
    migrated.followUpInstructions = old.globalAiInstructions
  }

  // Ensure noteLayout exists with defaults
  if (!migrated.noteLayout) {
    migrated.noteLayout = {
      includeHistorySummary: true,
      includeAllergiesAtTop: false,
      includeProblemList: false,
      groupMedicationsWithAssessment: false,
    }
  }

  return migrated
}
```

## 12. Error Handling

### Voice Recording Errors
| Error | Recovery |
|-------|----------|
| Microphone denied | Show permission instructions |
| Recording too long | Suggest shorter recordings |
| File too large (>25MB) | Auto-stop, show retry option |
| Transcription failed | Retry button with stored audio |
| Network error | Retry with exponential backoff |

### AI API Errors
| Error | Recovery |
|-------|----------|
| Rate limited | Queue request, show loading |
| Timeout | Retry with shorter input |
| Invalid response | Show error, allow retry |
| Context too long | Truncate older content |

## 13. Performance Considerations

### Audio Processing
- Max recording: 2 minutes (120 seconds)
- Max file size: 25MB
- Supported formats: webm, mp4, m4a, ogg

### API Timeouts
| Endpoint | Timeout |
|----------|---------|
| `/api/ai/transcribe` | 60s |
| `/api/ai/visit-ai` | 120s |
| `/api/ai/chart-prep` | 30s |
| `/api/ai/ask` | 30s |
| `/api/ai/field-action` | 15s |
| `/api/ai/synthesize-note` | 60s |
| `/api/ai/note-review` | 30s |

### Stale Closure Prevention
```typescript
// Use ref to always have latest noteData in async callbacks
const noteDataRef = useRef(noteData)
useEffect(() => { noteDataRef.current = noteData }, [noteData])

// In async callback:
const currentNoteData = noteDataRef.current
```

## 14. Future Enhancements

1. **Streaming responses** - Show AI output as it generates
2. **Voice commands** - "Add to HPI", "Next section"
3. **Multi-language transcription** - Support non-English encounters
4. **Speaker diarization** - Distinguish provider vs patient voice
5. **Real-time transcription** - Live transcript during recording
6. **Custom AI models** - Fine-tuned on specialty content
