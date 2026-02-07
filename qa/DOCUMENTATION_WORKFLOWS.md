# Documentation Workflows - Complete Test Coverage

> Version: 1.0 | Last updated: 2026-02-07
>
> This document maps ALL documentation workflows in Sevaro Clinical for comprehensive QA coverage.

---

## Overview: Voice Input to Final Note

```
VOICE ENTRY POINTS              AI PROCESSING                    NOTE COMPOSITION
─────────────────               ─────────────                    ───────────────
Chart Prep Dictation  ─────────► Whisper + gpt-5-mini ─────────► chartPrepSections
                                 (auto-categorize + summarize)    (summary, alerts, HPI)
                                                                          │
Visit AI Recording    ─────────► Whisper + gpt-5.2   ─────────► visitAIOutput
                                 (extract 5 sections)             (HPI, ROS, Exam,      ├──► Merge Engine
                                                                   Assessment, Plan)     │    (resolve conflicts)
Field Dictation       ─────────► Whisper + gpt-5-mini ──────────► Direct field insert   │
                                 (transcribe + cleanup)                                  │
                                                                                         │
Manual Entry          ──────────────────────────────────────────► noteData fields ──────┘
                                                                          │
                                                                          ▼
                                                                   synthesize-note API
                                                                          │
                                                                          ▼
                                                                   FORMATTED NOTE
                                                                   (sections + metadata)
```

---

## 1. Voice Entry Points

### 1A. Chart Prep Dictation (VoiceDrawer - Chart Prep Tab)
| Component | Location | API Endpoint | Model |
|-----------|----------|--------------|-------|
| VoiceDrawer.tsx | Lines 1027-1481 | /api/ai/transcribe | Whisper + gpt-5-mini |
| | | /api/ai/chart-prep | gpt-5-mini |

**Flow:**
1. Click "Record Note" → MediaRecorder starts
2. Audio → Whisper API → Cleaned transcription
3. Auto-categorize: Imaging, Labs, Referral, History, Assessment, General
4. Append to `prepNotes[]` array
5. Auto-trigger AI summary (3 sections)
6. Persist to localStorage (`chart-prep-{visitId}`)

**Test Cases:** CP1-CP10, CR1-CR5 (covered in TEST_CASES.yaml)

---

### 1B. Visit AI Recording (VoiceDrawer - Document Tab)
| Component | Location | API Endpoint | Model |
|-----------|----------|--------------|-------|
| VoiceDrawer.tsx | Lines 1484-1947 | /api/ai/visit-ai | Whisper + gpt-5.2 |

**Flow:**
1. Click large mic circle → Recording starts with waveform
2. Pause/Resume/Stop available
3. On stop → Audio to /api/ai/visit-ai
4. Whisper transcription with timestamps
5. gpt-5.2 extracts: HPI, ROS, Exam, Assessment, Plan
6. Each section has confidence score (0-1)
7. Results displayed in cards with "Add" buttons

**Test Cases:** VA1-VA10 (NEW - see below)

---

### 1C. Field-Level Dictation (NoteTextField)
| Component | Location | API Endpoint | Model |
|-----------|----------|--------------|-------|
| NoteTextField.tsx | Lines 338-354 | /api/ai/transcribe | Whisper + gpt-5-mini |

**Flow:**
1. Click red mic button on any text field
2. Recording → Stop → Whisper transcription
3. Text inserted at cursor position
4. Field onChange triggered

**Test Cases:** FD1-FD5 (NEW - see below)

---

### 1D. Settings Dictation
| Component | Location | API Endpoint | Model |
|-----------|----------|--------------|-------|
| SettingsDrawer.tsx | Various | /api/ai/transcribe | Whisper + gpt-5-mini |

**Fields:** Global AI instructions, New Consult, Follow-up, HPI/Assessment/Plan instructions

---

### 1E. Patient Search Dictation
| Component | Location | API Endpoint | Model |
|-----------|----------|--------------|-------|
| TopNav.tsx | Search bar | /api/ai/transcribe | Whisper + gpt-5-mini |

---

## 2. AI Processing Endpoints

| Endpoint | Model | Purpose | Input | Output |
|----------|-------|---------|-------|--------|
| `/api/ai/transcribe` | Whisper + gpt-5-mini | Audio → cleaned text | FormData: audio | {text, rawText} |
| `/api/ai/chart-prep` | gpt-5-mini | Pre-visit summary | JSON: patient, noteData, prepNotes | {sections: {summary, alerts, suggestedHPI/Assessment/Plan}} |
| `/api/ai/visit-ai` | Whisper + gpt-5.2 | Visit transcription + extraction | FormData: audio, patient, chartPrep | {visitAI: {hpi, ros, exam, assessment, plan, confidence}, transcript} |
| `/api/ai/ask` | gpt-5-mini | General Q&A | JSON: question, context | {response} |
| `/api/ai/field-action` | gpt-5-mini | Improve/Expand/Summarize | JSON: action, text, fieldName | {result} |
| `/api/ai/synthesize-note` | gpt-5.2 | Merge + format final note | JSON: noteData, preferences | {formattedNote, suggestions} |
| `/api/ai/note-review` | gpt-5-mini | Suggested improvements | JSON: fullNoteText | {suggestions[]} |
| `/api/ai/generate-assessment` | gpt-5.2 | Assessment from diagnoses | JSON: diagnoses, patient | {assessment} |
| `/api/ai/scale-autofill` | gpt-5.2 | Auto-fill scales | JSON: scale, clinicalData | {answers[], confidence[]} |

---

## 3. Note Composition Flows

### 3A. Manual Entry Only
User types directly into note fields (HPI, ROS, Assessment, Plan).
No AI processing. Content saved to `noteData` state.

### 3B. Chart Prep → Note
1. Generate Chart Prep summary
2. Click "Insert to HPI" or "Add All to Note"
3. Content wrapped in markers: `--- Chart Prep ---` / `--- End Chart Prep ---`
4. Markers prevent duplication on re-insert

### 3C. Visit AI → Note
1. Complete Visit AI recording
2. Click "Generate Note" button
3. Opens EnhancedNotePreviewModal
4. Visit AI sections merged into note with source tracking

### 3D. Combined Flow (Chart Prep + Visit AI + Manual)
1. Merge engine resolves conflicts
2. Manual content prioritized
3. Source attribution shown in preview

### 3E. Field AI Actions
1. Click star button on field
2. Choose: Improve | Expand | Summarize
3. gpt-5-mini modifies field text
4. Anti-hallucination safeguards applied

### 3F. Dot Phrase Expansion
1. Type `.trigger ` (dot + text + space)
2. Phrase expands from database
3. Scope: global or field-specific

---

## 4. NEW Test Cases for Documentation Workflows

### VA. Visit AI Workflow

| ID | Title | Priority | Description |
|----|-------|----------|-------------|
| VA1 | Visit recording starts | P1 | Click large mic → waveform animates |
| VA2 | Pause/Resume recording | P1 | Pause button stops waveform, resume continues |
| VA3 | Stop triggers processing | P0 | Stop → "Processing..." → structured output |
| VA4 | Section extraction | P0 | HPI, ROS, Exam, Assessment, Plan all extracted |
| VA5 | Confidence scores display | P1 | Each section shows confidence % |
| VA6 | Add individual section | P1 | Click "Add" on HPI → HPI field populated |
| VA7 | Generate Note integration | P0 | Click Generate Note → Visit AI merged |
| VA8 | Long recording handling | P1 | 10+ minute recording processes correctly |
| VA9 | Safari audio format | P0 | iPhone Safari mp4/m4a transcribes correctly |
| VA10 | Error retry with saved audio | P1 | On error, retry button reprocesses same audio |

### FD. Field Dictation

| ID | Title | Priority | Description |
|----|-------|----------|-------------|
| FD1 | Mic button opens recorder | P1 | Click mic → recording starts |
| FD2 | Insert at cursor | P1 | Text inserted at current cursor position |
| FD3 | Append if unfocused | P1 | Text appends to end if field not focused |
| FD4 | Multi-field dictation | P1 | Dictate HPI → Dictate Assessment → both work |
| FD5 | Raw text preserved | P2 | Info button shows original (uncleaned) dictation |

### FA. Field AI Actions

| ID | Title | Priority | Description |
|----|-------|----------|-------------|
| FA1 | Improve action | P1 | "Improve" polishes grammar without changing meaning |
| FA2 | Expand action | P1 | "Expand" adds clinical detail |
| FA3 | Summarize action | P1 | "Summarize" condenses to key points |
| FA4 | No hallucination | P0 | Actions don't add fabricated clinical data |
| FA5 | Works on all fields | P1 | HPI, ROS, Assessment, Plan, Imaging findings |

### DP. Dot Phrase Expansion

| ID | Title | Priority | Description |
|----|-------|----------|-------------|
| DP1 | Basic expansion | P1 | Type `.exam ` → template expands |
| DP2 | Field scope | P1 | Plan-scoped phrase only works in Plan field |
| DP3 | Global scope | P1 | Global phrase works in any field |
| DP4 | Usage tracking | P2 | Phrase usage count increments |
| DP5 | Custom phrases | P2 | User-created phrases work |

### NG. Note Generation

| ID | Title | Priority | Description |
|----|-------|----------|-------------|
| NG1 | Generate Note opens modal | P0 | Purple button → EnhancedNotePreviewModal opens |
| NG2 | Note type selection | P1 | New Consult vs Follow-up toggle works |
| NG3 | Note length selection | P1 | Concise/Standard/Detailed produces appropriate output |
| NG4 | Include toggles | P1 | Scales/Imaging/Labs/Recommendations toggles work |
| NG5 | Source attribution | P1 | Manual/Chart Prep/Visit AI sources shown |
| NG6 | Note review suggestions | P1 | AI suggestions panel appears with type badges |
| NG7 | Section editing | P1 | Edit section inline → changes saved |
| NG8 | Copy to clipboard | P0 | Copy button copies full note |
| NG9 | Sign & Complete | P0 | Sign saves to DB + marks visit signed |
| NG10 | Ask about this note | P1 | Chat input allows questions about generated note |

### NM. Note Merge Engine

| ID | Title | Priority | Description |
|----|-------|----------|-------------|
| NM1 | Manual priority | P0 | Manual content not overwritten by AI |
| NM2 | Chart Prep markers | P0 | Markers prevent duplication |
| NM3 | Visit AI merge | P1 | Visit AI sections merged appropriately |
| NM4 | Combined sources | P1 | Chart Prep + Visit AI + Manual all present |
| NM5 | Conflict resolution | P1 | Conflicting content shows manual version |

---

## 5. Complete Workflow Test Scenarios

### Scenario 1: Chart Prep Only Workflow
**Steps:**
1. Open Voice drawer → Chart Prep tab
2. Record 2-3 separate dictations
3. View auto-categorized notes
4. Click "Generate Summary"
5. View AI summary (summary, alerts, focus)
6. Click "Add All to Note"
7. Verify HPI field updated with markers

**Expected:** Summary generated, content in HPI with `--- Chart Prep ---` markers

---

### Scenario 2: Visit AI Only Workflow
**Steps:**
1. Open Voice drawer → Document tab
2. Record 2-3 minute visit simulation
3. Click Stop → Wait for processing
4. View extracted sections with confidence
5. Click "Generate Note" (purple button)
6. View merged note in preview modal
7. Copy or Sign note

**Expected:** 5 sections extracted, confidence scores shown, note generated

---

### Scenario 3: Combined Workflow (Chart Prep + Visit AI)
**Steps:**
1. Chart Prep: Record pre-visit notes → Generate summary
2. Visit AI: Record full visit → Process
3. Click "Generate Note"
4. View merged content from both sources
5. Verify no duplicates, sources attributed

**Expected:** Both Chart Prep and Visit AI content merged, no duplication

---

### Scenario 4: Manual + AI Workflow
**Steps:**
1. Type HPI manually: "Patient reports headaches for 3 weeks"
2. Run Visit AI → HPI extraction includes different detail
3. Generate Note
4. Verify manual content preserved, AI content as suggestion

**Expected:** Manual content prioritized, AI suggestions available

---

### Scenario 5: Full Documentation Flow
**Steps:**
1. Chart Prep pre-visit notes
2. Manual entry of ROS checkboxes
3. Visit AI recording
4. Field dictation in Assessment
5. Field AI "Expand" on Plan
6. Dot phrase `.exam` in Physical Exam
7. Generate Note with Standard length
8. Review suggestions
9. Edit one section
10. Sign & Complete

**Expected:** All sources merged, note signed and saved

---

## 6. Data Flow Verification Points

### Transcription Quality
- [ ] Verbal corrections applied ("no wait" → corrected text)
- [ ] Medical terminology preserved
- [ ] Filler words removed
- [ ] Safari audio formats work (mp4/m4a/aac)

### AI Processing
- [ ] Chart Prep generates 3 sections (summary, alerts, focus)
- [ ] Visit AI extracts 5 sections with confidence
- [ ] Field actions don't hallucinate
- [ ] Note synthesis respects preferences

### Content Persistence
- [ ] localStorage Chart Prep data survives drawer close
- [ ] Patient switch clears correct visit data
- [ ] Note saved to database on Sign

### Source Attribution
- [ ] Manual content marked as "manual"
- [ ] Chart Prep content marked as "chart-prep"
- [ ] Visit AI content marked as "visit-ai"
- [ ] Merged content tracked appropriately

---

## 7. Error Scenarios

| Scenario | Expected Behavior |
|----------|-------------------|
| Empty audio (0 bytes) | Error message: "No audio recorded" |
| Very short audio (<1s) | Warning: "Audio may be too short" |
| Audio > 25MB | Error: "File size exceeds limit" |
| Network timeout | Retry button appears with saved audio |
| Invalid API key | 401 error with clear message |
| Whisper failure | Error message, retry available |
| AI processing failure | Fallback to raw transcription |

---

## 8. Quick Test Matrix

| Workflow | Pre-AI | AI Processing | Post-AI | Sign |
|----------|--------|---------------|---------|------|
| Chart Prep Only | Record | Summary | Add to Note | Sign |
| Visit AI Only | Record | Extract 5 | Generate Note | Sign |
| Field Dictation | Record | Transcribe | Insert | - |
| Field AI | Select text | Action | Replace | - |
| Manual Only | Type | - | - | Sign |
| Combined | All above | Merge | Preview | Sign |

---

## 9. Related Files

| File | Purpose |
|------|---------|
| `qa/TEST_CASES.yaml` | Structured test cases |
| `qa/TEST_RUNBOOK.md` | Test procedures |
| `qa/CHART_PREP_CHECKLIST.md` | Quick Chart Prep verification |
| `qa/runs/RUN_TEMPLATE.md` | Per-release run template |
| `docs/PRD_VOICE_AND_AI_FEATURES.md` | Full PRD documentation |
