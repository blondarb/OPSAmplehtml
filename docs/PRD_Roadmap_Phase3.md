# PRD: Roadmap Phase 3 - UX Enhancements & Workflow Support

**Version:** 1.0
**Date:** January 24, 2026
**Status:** Planning

---

## Overview

This PRD outlines the next phase of development for Sevaro Clinical, focusing on user experience improvements, workflow documentation, and feature completeness. The goal is to ensure every UI element is functional and users understand how to effectively use the product.

---

## 1. Top-Left Lightbulb / Idea Icon Redesign

### Current State
- Lightbulb icon exists but behavior is undefined

### Requirements

Replace with a pull-out drawer containing four sections:

#### 1.1 Inspiration Tab
- Static, curated clinical content
- Best practices for documentation
- Tips for efficient workflows
- Sample note templates

#### 1.2 Tour Tab
- Guided walkthrough of all features
- Step-by-step tooltips highlighting UI elements
- Progress tracking (completed steps)
- "Start Tour" / "Resume Tour" / "Reset Tour" controls

#### 1.3 Features Tab
- Clear, readable feature list organized by category
- Links to relevant documentation
- Version changelog

#### 1.4 Feedback Tab
- Text input field for typed feedback
- Dictation button (uses existing voice infrastructure)
- Category dropdown: Bug Report, Feature Request, General Feedback, Usability Issue
- Priority selector: Low, Medium, High
- Submit button
- **Persistent storage**: Save to Supabase `feedback` table for admin review
- Confirmation message on submit

### Component
- New: `HelpDrawer.tsx`
- Location: Top-left icon in TopNav

---

## 2. Suggested Workflows (CRITICAL)

### Purpose
Show users HOW the product can be used, not just what it does. Users should understand different documentation strategies.

### Workflow Definitions

#### Workflow 1: Fully AI-Driven
| Aspect | Description |
|--------|-------------|
| Ideal For | High-volume clinics, providers comfortable with AI |
| Process | Dictate freely → AI performs chart prep → AI generates all sections → Review and sign |
| User Effort | Minimal clicking, mainly review |
| AI Role | Primary author |
| Editing | User can edit any section after generation |

#### Workflow 2: Fully Manual / Non-AI
| Aspect | Description |
|--------|-------------|
| Ideal For | Providers who prefer traditional documentation |
| Process | Click through sections → Type content manually → Use structured tools (scales, exams) |
| User Effort | Maximum control, all typing |
| AI Role | Disabled / Not used |
| Dictation | Still available for transcription only (no AI processing) |

#### Workflow 3: Hybrid – Lightweight AI
| Aspect | Description |
|--------|-------------|
| Ideal For | Providers who want AI assistance without full automation |
| Process | AI pre-fills from chart prep → User completes sections manually → AI acts as assistant |
| User Effort | Moderate clicking and editing |
| AI Role | Pre-fill and suggestions only |

#### Workflow 4: Hybrid – Advanced / Targeted AI
| Aspect | Description |
|--------|-------------|
| Ideal For | Experienced users who want selective AI help |
| Process | AI generates specific sections (HPI, Assessment) → User accepts/rejects → Manual for other sections |
| User Effort | Active review and curation |
| AI Role | Section-specific author |

### Workflow Selection UI
- Settings page: Default workflow preference
- Per-visit override option in toolbar
- Visual indicator showing current workflow mode

### Precedence Rules (Must Define)
1. Manual edits always override AI content
2. If user types in a field, AI will not overwrite without confirmation
3. Chart Prep content is "suggested" until explicitly added
4. Visit AI content follows same merge rules
5. Workflow mode affects which AI buttons are visible/active

### Implementation
- New: `WorkflowSelector.tsx` component
- New: `workflowConfig.ts` with workflow definitions
- Update: Settings to include workflow preference
- Update: CenterPanel to show/hide AI buttons based on workflow

---

## 3. Clickable Area Audit

### Purpose
Identify all UI elements that appear clickable but have no action, and define what each should do.

### Audit Checklist

#### TopNav
| Element | Current State | Required Action |
|---------|---------------|-----------------|
| Sevaro Logo | No action | Navigate to dashboard home |
| Patient Search | Partial | Open patient search modal |
| Queue Tabs | Working | Switch queue view |
| Timer | Display only | Click to pause/reset |
| PHI Toggle | Working | Toggle PHI visibility |
| Lock Icon | No action | Lock/unlock screen (session pause) |
| Notifications | No action | Open notifications panel |
| What's New | No action | Open changelog modal |
| User Avatar | Partial | Open settings drawer |

#### Left Sidebar
| Element | Current State | Required Action |
|---------|---------------|-----------------|
| Hospital Logo | No action | Navigate to facility info |
| Patient Card | Working | Expand patient details |
| Quick Links | Working | Open external links |
| Prior Visits | Working | Expand visit details |
| Score History | Working | Expand score trends |

#### Center Panel
| Element | Current State | Required Action |
|---------|---------------|-----------------|
| Tab Headers | Working | Switch tabs |
| Three Dots Menu | No action | Open actions menu (copy, print, template) |
| Thumbs Up | No action | Mark section as reviewed/approved |
| Mic Button (toolbar) | Working | Open voice drawer |
| AI Star (toolbar) | Working | Open AI drawer |
| Copy Button | No action | Copy note to clipboard |
| Pend Button | No action | Save as pending/incomplete |
| Sign & Complete | No action | Final signature workflow |
| Field Action Buttons | Working | Mic/dot phrase/AI per field |

#### Drawers
| Element | Current State | Required Action |
|---------|---------------|-----------------|
| All tab buttons | Working | Switch tabs |
| Close buttons | Working | Close drawer |
| AI action buttons | Partial | Execute AI prompts |

### Deliverable
- Implement actions for all "No action" elements
- Remove any purely decorative elements that appear interactive

---

## 4. Note Generation Pipeline

### Current State
- Generate Note button merges AI outputs with manual content
- No final review step

### Requirements

#### 4.1 Note Assembly
- After AI completes section-level work, pull all fields into single cohesive note
- Format as clinical document with proper structure
- Include all metadata (date, provider, patient, visit type)

#### 4.2 Preview/Edit Mode
- Full-screen or modal preview of assembled note
- Rich text editing capabilities
- Section-by-section navigation
- Track changes / diff view option

#### 4.3 Final Review Page
Must include:

| Component | Description |
|-----------|-------------|
| Recommendations Verification | Checklist of all recommendations with confirm/modify options |
| Suggested Improvements | AI analysis of note quality, completeness, clarity |
| Ask AI About This Note | Button to open AI Q&A specifically about the current note |
| Sign & Complete | Final submission button |
| Save as Draft | Preserve current state without signing |

### Component
- New: `NoteReviewModal.tsx`
- New: `NoteSuggestionsPanel.tsx`

---

## 5. AI Actions Must Function

### Requirement
Every AI button must trigger a defined prompt and perform a concrete action.

### Current AI Buttons
| Button | Location | Required Behavior |
|--------|----------|-------------------|
| Ask AI | AI Drawer | Working - Q&A with context |
| Generate Summary | AI Drawer | Generate patient-friendly summary |
| Generate Handout | AI Drawer | Generate educational handout |
| Field AI (star) | Text fields | Open AI drawer with field context |
| Improve | TBD | Rewrite content for clarity/completeness |
| Expand | TBD | Add more detail to existing content |
| Summarize | TBD | Condense content |

### New AI Actions to Add
| Action | Prompt Template |
|--------|-----------------|
| Improve Writing | "Improve the following clinical text for clarity and professional tone: {content}" |
| Expand Details | "Expand the following with more clinical detail: {content}" |
| Summarize | "Summarize the following concisely: {content}" |
| Check Completeness | "Review this clinical note for completeness and identify missing elements: {content}" |
| Suggest Diagnoses | "Based on this presentation, suggest differential diagnoses: {content}" |

### Implementation
- All buttons must call `/api/ai/ask` or dedicated endpoints
- No placeholder buttons allowed

---

## 6. User Settings Enhancement

### Current State
- Basic dark mode toggle
- User avatar click does nothing

### Requirements

#### 6.1 Settings Drawer Structure

```
Settings Drawer
├── Profile
│   ├── Name, credentials
│   ├── Specialty
│   └── Default clinic/location
├── Notifications
│   ├── Incoming call volume slider
│   ├── Ringtone selection dropdown
│   └── Notification preferences
├── Automation
│   ├── Auto-start timer on video
│   ├── Auto-save interval
│   └── Default workflow selection
├── Appearance
│   ├── Dark mode: Always On / Always Off / Match System
│   ├── Font size
│   └── Compact mode toggle
└── AI Custom Instructions (CRITICAL)
    ├── Global Instructions
    │   └── Default writing style, tone, detail level
    └── Per-Section Instructions
        ├── History: {custom instructions}
        ├── HPI: {custom instructions}
        ├── Physical Exam: {custom instructions}
        ├── Assessment: {custom instructions}
        ├── Recommendations: {custom instructions}
        └── Plan: {custom instructions}
```

#### 6.2 AI Custom Instructions Detail
- Text areas for each section
- Preset templates: "Concise", "Detailed", "Academic", "Patient-Friendly"
- Preview of how AI will write with current settings
- Reset to defaults option

### Component
- New: `SettingsDrawer.tsx`
- New: `AIInstructionsEditor.tsx`
- New Supabase table: `user_settings`

---

## 7. Dictation Everywhere

### Requirement
Anywhere a user can type, they should also be able to dictate.

### Current Coverage
- HPI field: Has mic button
- Assessment field: Has mic button
- Plan field: Has mic button
- Imaging findings: Has mic button

### Required Additions
| Location | Current | Required |
|----------|---------|----------|
| All text fields | Partial | Add mic button |
| Feedback form | No | Add mic button |
| Search fields | No | Add mic button |
| Notes in modals | No | Add mic button |

### Implementation
- Ensure `NoteTextField` component is used universally
- Add `useVoiceRecorder` hook integration to any custom text inputs

---

## 8. Physical Exam Enhancements

### Current State
- Checkbox-based neurological exam
- No free-text option
- Limited scale support

### Requirements

#### 8.1 Free-Text Physical Exam
- Add "Free Text" option at top of Physical Exam tab
- Full textarea with dictation support
- Toggle between structured and free-text modes

#### 8.2 NIH Stroke Scale (Priority)
| Item | Score Range |
|------|-------------|
| 1a. Level of Consciousness | 0-3 |
| 1b. LOC Questions | 0-2 |
| 1c. LOC Commands | 0-2 |
| 2. Best Gaze | 0-2 |
| 3. Visual Fields | 0-3 |
| 4. Facial Palsy | 0-3 |
| 5a. Motor Arm Left | 0-4 |
| 5b. Motor Arm Right | 0-4 |
| 6a. Motor Leg Left | 0-4 |
| 6b. Motor Leg Right | 0-4 |
| 7. Limb Ataxia | 0-2 |
| 8. Sensory | 0-2 |
| 9. Best Language | 0-3 |
| 10. Dysarthria | 0-2 |
| 11. Extinction/Inattention | 0-2 |
| **Total** | **0-42** |

#### 8.3 Other Exams Section
Dropdown to add additional exam types:
- General Physical Exam
- Cardiovascular Exam
- Respiratory Exam
- Abdominal Exam
- Musculoskeletal Exam
- Skin Exam
- HEENT Exam

Each additional exam has:
- Structured checkboxes (where applicable)
- Free-text findings field
- Normal/Abnormal toggle

#### 8.4 Additional Scales to Consider
- Modified Rankin Scale (mRS) - disability/dependence
- Barthel Index - ADL assessment
- EDSS (for MS)
- UPDRS (for Parkinson's)
- Berg Balance Scale

### Component
- Update: `CenterPanel.tsx` Physical Exam tab
- New: `NIHSSSection.tsx`
- New: `AdditionalExamsSection.tsx`

---

## 9. Patient History Section

### Current State
- Prior Visits shows individual visit summaries
- No longitudinal overview

### Requirements

#### 9.1 Longitudinal Patient History
- Location: Above "Reason for Consult" section
- AI-generated paragraph summarizing:
  - Long-standing medical conditions
  - Prior diagnoses
  - Prior medications
  - Relevant surgical history
  - Key clinical events

#### 9.2 Features
| Feature | Description |
|---------|-------------|
| Length Control | Slider or presets: Brief / Standard / Detailed |
| Customization | Settings to include/exclude: medications, surgeries, family history, social history |
| Manual Edit | Allow direct editing of AI output |
| Regenerate | Button to regenerate with new parameters |
| Version History | Track changes over time |

#### 9.3 Data Sources
- Pull from prior visits in database
- Import from external records (future)
- Manual additions

### Component
- New: `PatientHistorySummary.tsx`
- Location: CenterPanel, above ReasonForConsultSection

---

## Implementation Priority

### Phase 3A (High Priority)
1. Clickable Area Audit - eliminate dead UI
2. AI Actions Must Function - no placeholder buttons
3. Dictation Everywhere - universal voice input
4. User Settings with AI Instructions - personalization

### Phase 3B (Medium Priority)
5. Note Generation Pipeline - final review workflow
6. Physical Exam Enhancements - NIHSS, free text
7. Patient History Section - longitudinal summary

### Phase 3C (Lower Priority)
8. Help Drawer (Lightbulb) - onboarding and feedback
9. Suggested Workflows - documentation and selection UI

---

## Success Metrics

- 0 dead clickable elements in UI
- 100% of AI buttons trigger real actions
- Dictation available on all text inputs
- User can customize AI writing style
- NIHSS scale fully functional
- Longitudinal patient history visible and editable

---

## Dependencies

- OpenAI API for AI features
- Supabase for persistent storage (feedback, settings)
- Existing voice recording infrastructure

---

*Document created: January 24, 2026*
*Author: Development Team*
