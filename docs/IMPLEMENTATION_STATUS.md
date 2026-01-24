# Implementation Status - Sevaro Clinical

**Last Updated:** January 24, 2026 (Consolidated Roadmap Created)
**Based on:** PRD_AI_Scribe.md v1.4, Sevaro_Outpatient_MVP_PRD_v1.4, PRD_Roadmap_Phase3.md

---

## Quick Links

- **[CONSOLIDATED_ROADMAP.md](./CONSOLIDATED_ROADMAP.md)** - Master roadmap combining all phases from all PRDs
- **[PRD_Roadmap_Phase3.md](./PRD_Roadmap_Phase3.md)** - UX enhancements and workflow support

---

## Overview

This document tracks implementation progress against the product requirements and notes current work, issues, and next steps.

### Current Priority Focus

Based on the consolidated roadmap analysis:

1. **Phase 2 Gap: Smart Recommendations** - Link diagnoses to treatment plans (import neuro-plans)
2. **Phase 3A Remaining: Field AI Actions** - Improve/Expand/Summarize buttons need real actions
3. **Phase 3A Remaining: User Settings** - Settings drawer with AI custom instructions

---

## Recent Updates (January 23, 2026)

### Voice/AI Drawer Separation - NEW
- Split single AiDrawer into two separate drawers for clearer UX
- **VoiceDrawer** (red theme, mic icon):
  - Chart Prep tab: Pre-visit dictation with auto-categorization
  - Document tab: Full visit recording with clinical extraction
- **AiDrawer** (teal theme, star icon):
  - Ask AI tab: Clinical Q&A
  - Summary tab: Patient-friendly summaries
  - Handout tab: Educational materials
- Updated toolbar icons with distinct colors (mic=red, AI=teal)

### Imaging/Results Tab Redesign - NEW
- Completely rebuilt to match wireframe design
- Created new `ImagingResultsTab.tsx` component
- **Imaging Studies section**:
  - MRI Brain, CT Head, CTA Head & Neck, MRA Head, MRI Spine
  - Collapsible cards with date, impression dropdown, findings textarea
  - PACS link field for each study
- **Neurodiagnostic Studies section**:
  - EEG, EMG/NCS, VEP, Sleep Study
  - Same collapsible card pattern
- **Lab Results section**:
  - Free-text findings field
  - Quick-add buttons: CBC, CMP, Lipid Panel, HbA1c, TSH, Vitamin B12, Vitamin D
- All text fields have mic/dot phrase/AI action buttons
- Status badges on collapsed cards (Normal/Abnormal/Documented)

### History Tab Improvements - NEW
- Added expandable detail fields to multiple sections:
  - **ROS**: Shows textarea when "Unable to obtain due to:" or "Other" selected
  - **Allergies**: Shows textarea when "Other" selected
  - **Medical History**: Shows textarea when "Yes" selected
- All new textareas include dictation/dot phrase/AI buttons

### Prior Visits Sample Data - UPDATED
- Added 3 realistic prior visits with clinical progression
- Each visit has provider name, chief complaints, AI summary
- Shows treatment timeline (propranolol → topiramate transition)
- Demonstrates MIDAS score improvement tracking

---

## Feature Implementation Status

### Core Clinical Documentation

| Feature | Status | Component | Notes |
|---------|--------|-----------|-------|
| History Tab | COMPLETE | CenterPanel.tsx | ROS, Allergies, History with expandable details |
| Imaging/Results Tab | COMPLETE | ImagingResultsTab.tsx | Collapsible study cards, labs |
| Physical Exam Tab | COMPLETE | CenterPanel.tsx | Neurological exam checkboxes |
| Recommendation Tab | COMPLETE | CenterPanel.tsx | Assessment, differential, plan |
| HPI Text Field | COMPLETE | NoteTextField.tsx | With dictation/AI buttons |

### Reason for Consult

| Feature | Status | Component | Notes |
|---------|--------|-----------|-------|
| Two-tier selection | COMPLETE | ReasonForConsultSection.tsx | 9 categories |
| Primary category icons | COMPLETE | - | Visual selection grid |
| Sub-options | COMPLETE | - | Common + expanded per category |
| Custom entries | COMPLETE | - | Add custom per category |
| Category data | COMPLETE | reasonForConsultData.ts | Full data structure |

### Differential Diagnosis

| Feature | Status | Component | Notes |
|---------|--------|-----------|-------|
| Auto-populate from consult | COMPLETE | DifferentialDiagnosisSection.tsx | Maps chief complaints to diagnoses |
| ICD-10 codes | COMPLETE | diagnosisData.ts | 134 diagnoses with codes |
| Search picker | COMPLETE | - | Category filtering |
| Custom diagnosis entry | COMPLETE | - | Free text option |
| Smart Recommendations | PENDING | - | Phase 2 |

### AI Features

| Feature | Status | Component | Notes |
|---------|--------|-----------|-------|
| Voice Drawer | COMPLETE | VoiceDrawer.tsx | Chart Prep + Document |
| AI Drawer | COMPLETE | AiDrawer.tsx | Ask AI + Summary + Handout |
| Chart Prep | COMPLETE | VoiceDrawer.tsx | Dictation + AI summary |
| Visit AI (Document) | COMPLETE | VoiceDrawer.tsx | Full visit recording |
| Ask AI | COMPLETE | AiDrawer.tsx | GPT-4 Q&A |
| Note Merge Engine | COMPLETE | lib/note-merge/ | Combine AI outputs |
| Generate Note Button | COMPLETE | CenterPanel.tsx | Purple button with indicator |

### Clinical Scales

| Feature | Status | Component | Notes |
|---------|--------|-----------|-------|
| Smart scale suggestions | COMPLETE | SmartScalesSection.tsx | Based on conditions |
| MIDAS, HIT-6 | COMPLETE | - | Headache scales |
| MoCA, Mini-Cog | COMPLETE | - | Cognitive scales |
| PHQ-9, GAD-7 | COMPLETE | - | Mental health |
| Score History | COMPLETE | LeftSidebar.tsx | With trends |
| Database integration | COMPLETE | /api/scales | History persistence |

### Imaging/Results Tab

| Feature | Status | Component | Notes |
|---------|--------|-----------|-------|
| Collapsible study cards | COMPLETE | ImagingResultsTab.tsx | Matches wireframe |
| Imaging studies | COMPLETE | - | 5 types |
| Neurodiagnostic studies | COMPLETE | - | 4 types |
| Lab results | COMPLETE | - | With quick-add |
| Date picker | COMPLETE | - | Per study |
| Impression dropdown | COMPLETE | - | Normal/Abnormal/etc |
| Findings textarea | COMPLETE | - | With action buttons |
| PACS link | COMPLETE | - | URL field |
| Add Study button | COMPLETE | - | For custom studies |

### Left Sidebar

| Feature | Status | Component | Notes |
|---------|--------|-----------|-------|
| Patient card | COMPLETE | LeftSidebar.tsx | With badges |
| Prior Visits | COMPLETE | - | Expandable with AI summaries |
| Score History | COMPLETE | - | With trend indicators |
| Quick links | COMPLETE | - | PACS, VizAI, Epic, etc. |
| Local time display | COMPLETE | - | Live clock |

### Dot Phrases

| Feature | Status | Component | Notes |
|---------|--------|-----------|-------|
| Drawer UI | COMPLETE | DotPhrasesDrawer.tsx | Search, filter |
| Field scoping | COMPLETE | - | Field-specific phrases |
| CRUD operations | COMPLETE | /api/phrases | Full API |
| Usage tracking | COMPLETE | - | Count updates |
| Inline trigger | COMPLETE | NoteTextField.tsx | Lightning button |

---

## Files Structure

```
src/
├── app/api/ai/
│   ├── ask/route.ts           # Ask AI endpoint
│   ├── chart-prep/route.ts    # Chart Prep AI endpoint
│   ├── transcribe/route.ts    # Whisper transcription
│   └── visit-ai/route.ts      # Visit AI processing
├── components/
│   ├── AiDrawer.tsx           # AI Assistant (Ask AI, Summary, Handout)
│   ├── AiSuggestionPanel.tsx  # AI suggestion component
│   ├── CenterPanel.tsx        # Main content with tabs
│   ├── ClinicalNote.tsx       # State management + generateNote
│   ├── DifferentialDiagnosisSection.tsx # Diagnosis with ICD-10
│   ├── DotPhrasesDrawer.tsx   # Dot phrases panel
│   ├── ImagingResultsTab.tsx  # Imaging tab (NEW)
│   ├── LeftSidebar.tsx        # Patient info, visits, scores
│   ├── NoteTextField.tsx      # Text field with buttons
│   ├── ReasonForConsultSection.tsx # Two-tier consult
│   ├── SmartScalesSection.tsx # Clinical scales
│   ├── TopNav.tsx             # Navigation header
│   └── VoiceDrawer.tsx        # Voice & Dictation (NEW)
├── hooks/
│   └── useVoiceRecorder.ts    # Pause/resume recording
└── lib/
    ├── diagnosisData.ts       # 134 diagnoses with ICD-10
    ├── note-merge/            # Merge infrastructure
    │   ├── types.ts
    │   ├── merge-engine.ts
    │   └── index.ts
    └── reasonForConsultData.ts # Consult categories
```

---

## Roadmap

See full PRD: [PRD_Roadmap_Phase3.md](./PRD_Roadmap_Phase3.md)

### Phase 2: Smart Recommendations

| Task | Status | Priority |
|------|--------|----------|
| Link diagnoses to treatment recommendations | PENDING | High |
| Import templates from neuro-plans demo (134 diagnoses) | PENDING | High |
| Checkbox-based recommendation selection per diagnosis | PENDING | High |

Reference: https://blondarb.github.io/neuro-plans/clinical/

---

### Phase 3A: Critical UX Fixes (High Priority)

#### 1. Clickable Area Audit
Eliminate all dead UI affordances.

| Element | Location | Current | Required Action |
|---------|----------|---------|-----------------|
| Sevaro Logo | TopNav | No action | Navigate to dashboard |
| Timer | TopNav | Display only | Pause/reset on click |
| Lock Icon | TopNav | No action | Session lock |
| Notifications | TopNav | No action | Open notifications panel |
| What's New | TopNav | No action | Open changelog modal |
| Three Dots Menu | CenterPanel | **COMPLETE** | Actions menu (copy, print, dot phrases) |
| Thumbs Up | CenterPanel | **COMPLETE** | Toggle reviewed status with visual feedback |
| Copy Button | CenterPanel | **COMPLETE** | Copies formatted note with success indicator |
| Pend Button | CenterPanel | **COMPLETE** | Shows saving/saved states |
| Sign & Complete | CenterPanel | **COMPLETE** | Verification modal with checklist |

#### 2. AI Actions Must Function
All AI buttons must trigger real prompts - no placeholders.

| Button | Location | Status | Required |
|--------|----------|--------|----------|
| Ask AI | AI Drawer | **COMPLETE** | - |
| Generate Summary | AI Drawer | **COMPLETE** | Patient-friendly summary with detail levels |
| Generate Handout | AI Drawer | **COMPLETE** | Educational materials by condition |
| Improve Writing | Fields | NOT BUILT | Add action |
| Expand Details | Fields | NOT BUILT | Add action |
| Summarize | Fields | NOT BUILT | Add action |

#### 3. Dictation Everywhere
Any text input should have dictation.

| Location | Current | Status |
|----------|---------|--------|
| Clinical text fields | Has mic | COMPLETE |
| Feedback form | No mic | NEEDED |
| Search fields | No mic | NEEDED |
| Settings inputs | No mic | NEEDED |

#### 4. User Settings Enhancement

| Feature | Status |
|---------|--------|
| Settings Drawer | NOT BUILT |
| Call volume/ringtone | NOT BUILT |
| Dark mode (on/off/system) | PARTIAL |
| Automation toggles | NOT BUILT |
| **AI Custom Instructions (global)** | NOT BUILT |
| **AI Custom Instructions (per-section)** | NOT BUILT |

---

### Phase 3B: Feature Enhancements (Medium Priority)

#### 5. Note Generation Pipeline

| Feature | Status |
|---------|--------|
| Note assembly from all sources | PARTIAL (merge engine exists) |
| Preview/Edit modal | NOT BUILT |
| Recommendations verification checklist | NOT BUILT |
| Suggested improvements section | NOT BUILT |
| "Ask AI about this note" button | NOT BUILT |
| Sign & Complete flow | NOT BUILT |

#### 6. Physical Exam Enhancements

| Feature | Status |
|---------|--------|
| Free-text exam option | NOT BUILT |
| **NIH Stroke Scale (NIHSS)** | NOT BUILT - Priority |
| Modified Rankin Scale | NOT BUILT |
| Other exam types dropdown | NOT BUILT |

#### 7. Patient History Section (Above Reason for Consult)

| Feature | Status |
|---------|--------|
| Longitudinal AI summary paragraph | NOT BUILT |
| Length control (brief/standard/detailed) | NOT BUILT |
| Customization settings | NOT BUILT |
| Manual editing | NOT BUILT |

---

### Phase 3C: Onboarding & Workflows (Lower Priority)

#### 8. Help Drawer (Top-Left Lightbulb)

| Tab | Status | Description |
|-----|--------|-------------|
| Inspiration | NOT BUILT | Curated clinical content |
| Tour | NOT BUILT | Guided feature walkthrough |
| Features | NOT BUILT | Feature list with docs |
| Feedback | NOT BUILT | Dictation + typing, persistent storage |

#### 9. Suggested Workflows (CRITICAL)

| Workflow | Description | Status |
|----------|-------------|--------|
| **Fully AI-Driven** | Dictate → AI generates all → Review | NOT DOCUMENTED |
| **Fully Manual** | Click through → Type manually | SUPPORTED (implicit) |
| **Hybrid Lightweight** | AI pre-fills → Manual completion | PARTIAL |
| **Hybrid Advanced** | Selective AI per section | PARTIAL |

**Workflow Precedence Rules (to define):**
- Manual edits always override AI content
- User-typed content protected from AI overwrite
- Chart Prep = suggested until explicitly added
- Workflow mode controls which AI buttons are visible

---

### Other Enhancements

- Real-time transcription (currently post-recording only)
- Speaker diarization in UI
- Audio playback for review
- Confidence indicators in generated note
- AI Suggestion Panel integration with text fields

---

## Technical Debt / Known Issues

1. **Audio routing** - Visit AI recording may need endpoint routing fix
2. **Three voice recorder instances** - AiDrawer/VoiceDrawer could optimize
3. **No audio storage** - Audio processed and discarded
4. **AI suggestions not wired** - Component built but not integrated

---

## Architecture Notes

### Data Flow

```
CHART PREP FLOW:
[Dictate] → MediaRecorder → /api/ai/transcribe → Whisper → categorized note
[Generate] → /api/ai/chart-prep → GPT-4 → structured JSON sections

VISIT AI FLOW:
[Record Visit] → MediaRecorder → /api/ai/visit-ai → Whisper + GPT-4 → structured sections
                                                   ↓
                                    Patient context + Chart Prep context included

GENERATE NOTE FLOW:
[Click Generate Note]
    → Gather: manualData, chartPrepOutput, visitAIOutput
    → mergeNoteContent() from note-merge module
    → Returns MergedClinicalNote with:
        - content per field
        - source tracking
        - AI suggestions where applicable
    → Populate empty fields with AI content
```

### Drawer Separation

```
VOICE DRAWER (Red theme, mic icon):
├── Chart Prep tab
│   ├── Dictation with auto-categorization
│   ├── AI summary generation
│   ├── Structured output sections
│   └── "Add All to Note" functionality
└── Document tab
    ├── Full visit recording
    ├── Pause/Resume/Restart controls
    ├── Processing spinner
    └── Extracted sections with confidence

AI DRAWER (Teal theme, star icon):
├── Ask AI tab
│   ├── Clinical Q&A
│   ├── Suggested questions
│   └── AI response display
├── Summary tab
│   └── Patient-friendly summary generation
└── Handout tab
    └── Educational material generation
```

---

*Document maintained by Development Team*
*Last updated: January 24, 2026*
