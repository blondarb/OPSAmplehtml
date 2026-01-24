# Consolidated Roadmap - Sevaro Clinical

**Version:** 1.0
**Last Updated:** January 24, 2026
**Purpose:** Single source of truth consolidating all phases across PRDs

---

## Overview

This document provides a unified view of all planned features across:
- PRD_AI_Scribe.md (AI documentation)
- PRD_Dot_Phrases.md (Text expansion)
- PRD_Neurology_Scales.md (Clinical scales)
- PRD_Patient_Education.md (Handouts/education)
- Sevaro_Outpatient_MVP_PRD_v1.4.md (Core MVP)
- PRD_Roadmap_Phase3.md (UX enhancements)

---

## Legend

| Status | Meaning |
|--------|---------|
| ✅ COMPLETE | Feature fully implemented and tested |
| 🔧 PARTIAL | Some elements implemented, more work needed |
| ⏳ PENDING | Not yet started |
| 🎯 PRIORITY | Should be addressed next |

---

## Phase 1: Core MVP (Completed)

These foundational features are fully implemented.

### 1.1 Clinical Documentation Interface

| Feature | Status | Location |
|---------|--------|----------|
| Multi-tab interface (History, Imaging, Exam, Recommendation) | ✅ COMPLETE | CenterPanel.tsx |
| Patient context sidebar | ✅ COMPLETE | LeftSidebar.tsx |
| Prior visits with AI summaries | ✅ COMPLETE | LeftSidebar.tsx |
| NoteTextField with action buttons | ✅ COMPLETE | NoteTextField.tsx |
| Reason for Consult (9 categories) | ✅ COMPLETE | ReasonForConsultSection.tsx |
| Two-tier consult selection | ✅ COMPLETE | reasonForConsultData.ts |
| Differential Diagnosis with ICD-10 | ✅ COMPLETE | DifferentialDiagnosisSection.tsx |
| Neurological exam checkboxes | ✅ COMPLETE | CenterPanel.tsx |

### 1.2 Clinical Scales (MVP Set)

| Scale | Status | Notes |
|-------|--------|-------|
| MIDAS (0-270) | ✅ COMPLETE | Migraine disability |
| HIT-6 (36-78) | ✅ COMPLETE | Headache impact |
| MoCA (0-30) | ✅ COMPLETE | Cognitive screening |
| Mini-Cog (0-5) | ✅ COMPLETE | Quick cognitive |
| PHQ-9 (0-27) | ✅ COMPLETE | Depression |
| GAD-7 (0-21) | ✅ COMPLETE | Anxiety |
| Score History tracking | ✅ COMPLETE | With trend indicators |
| Database integration | ✅ COMPLETE | /api/scales |

### 1.3 Imaging/Results Tab

| Feature | Status | Notes |
|---------|--------|-------|
| Collapsible study cards | ✅ COMPLETE | ImagingResultsTab.tsx |
| Imaging studies (MRI, CT, etc.) | ✅ COMPLETE | 5 types |
| Neurodiagnostic studies | ✅ COMPLETE | 4 types |
| Lab results with quick-add | ✅ COMPLETE | 7 common panels |
| Date picker per study | ✅ COMPLETE | - |
| Impression dropdown | ✅ COMPLETE | Normal/Abnormal |
| PACS link field | ✅ COMPLETE | - |

### 1.4 Authentication & Infrastructure

| Feature | Status | Notes |
|---------|--------|-------|
| Supabase Auth | ✅ COMPLETE | Email/password |
| Middleware session refresh | ✅ COMPLETE | middleware.ts |
| Database schema | ✅ COMPLETE | All tables created |
| API routes structure | ✅ COMPLETE | /api/* |

---

## Phase 2: AI Features & Smart Recommendations

### 2.1 Voice & Dictation (VoiceDrawer - Red Theme)

| Feature | Status | Priority |
|---------|--------|----------|
| Chart Prep dictation | ✅ COMPLETE | P0 |
| Auto-categorization of dictation | ✅ COMPLETE | P0 |
| Chart Prep AI summary generation | ✅ COMPLETE | P0 |
| Pause/Resume recording | ✅ COMPLETE | P1 |
| Document tab (full visit) | ✅ COMPLETE | P0 |
| Visit AI processing | ✅ COMPLETE | P0 |
| Structured output sections | ✅ COMPLETE | P0 |
| Real-time transcription display | 🔧 PARTIAL | P1 - Post-recording only |
| Speaker diarization UI | ⏳ PENDING | P2 |
| Audio playback for review | ⏳ PENDING | P2 |
| Audio storage | ⏳ PENDING | P2 - Currently discarded |

### 2.2 AI Assistant (AiDrawer - Teal Theme)

| Feature | Status | Priority |
|---------|--------|----------|
| Ask AI tab | ✅ COMPLETE | P0 |
| GPT-4 Q&A integration | ✅ COMPLETE | P0 |
| Suggested questions | ✅ COMPLETE | P1 |
| Generate Patient Summary | ✅ COMPLETE | P1 |
| Detail levels (Simple/Standard/Detailed) | ✅ COMPLETE | P1 |
| Generate Patient Handout | ✅ COMPLETE | P1 |
| Condition-specific handouts | ✅ COMPLETE | 7 conditions |
| Copy to clipboard | ✅ COMPLETE | P1 |

### 2.3 Note Merge Infrastructure

| Feature | Status | Notes |
|---------|--------|-------|
| Merge engine types | ✅ COMPLETE | lib/note-merge/types.ts |
| mergeNoteContent() function | ✅ COMPLETE | lib/note-merge/merge-engine.ts |
| Source tracking | ✅ COMPLETE | Manual/ChartPrep/VisitAI |
| Generate Note button | ✅ COMPLETE | CenterPanel.tsx |

### 2.4 Smart Recommendations

| Feature | Status | Priority |
|---------|--------|----------|
| Link diagnoses to treatment recommendations | ✅ COMPLETE | P0 |
| Import templates from neuro-plans (5 demo diagnoses) | ✅ COMPLETE | P0 |
| Checkbox-based recommendation selection | ✅ COMPLETE | P0 |
| Expandable sections with subsections | ✅ COMPLETE | P0 |
| Priority badges (STAT/URGENT/ROUTINE/EXT) | ✅ COMPLETE | P1 |
| Item details (dosing, rationale, monitoring, contraindications) | ✅ COMPLETE | P1 |
| Patient instructions section | ✅ COMPLETE | P1 |
| Add selected items to Plan textarea | ✅ COMPLETE | P0 |
| Recommendation reconciliation engine | ⏳ PENDING | P2 |
| Expand to all 134 diagnoses | ⏳ PENDING | P2 |

**Reference:** https://blondarb.github.io/neuro-plans/clinical/

**Demo Diagnoses Available:**
- New Onset Seizure
- Status Epilepticus (outpatient follow-up)
- Multiple Sclerosis - New Diagnosis
- Peripheral Neuropathy - New Diagnosis/Evaluation
- Acute Ischemic Stroke (outpatient follow-up)

---

## Phase 3A: Critical UX Fixes (Current Focus)

### 3.1 Toolbar Actions

| Element | Status | Notes |
|---------|--------|-------|
| Three Dots Menu | ✅ COMPLETE | Copy/Print/Dot Phrases |
| Thumbs Up (reviewed) | ✅ COMPLETE | Toggle with visual feedback |
| Copy Button | ✅ COMPLETE | With success indicator |
| Pend Button | ✅ COMPLETE | Saving/saved states |
| Sign & Complete | ✅ COMPLETE | Verification modal with checklist |

### 3.2 TopNav Elements

| Element | Status | Priority |
|---------|--------|----------|
| Sevaro Logo click | ⏳ PENDING | Navigate to dashboard |
| Timer click | ⏳ PENDING | Pause/reset |
| Lock Icon | ⏳ PENDING | Session lock |
| Notifications | ⏳ PENDING | Panel with items |
| What's New | ⏳ PENDING | Changelog modal |

### 3.3 AI Actions on Fields

| Feature | Status | Priority |
|---------|--------|----------|
| Field AI (star button) | ✅ COMPLETE | Opens dropdown menu |
| Improve Writing | ✅ COMPLETE | Polishes grammar & clarity |
| Expand Details | ✅ COMPLETE | Adds clinical context |
| Summarize | ✅ COMPLETE | Condenses to key points |
| Ask AI link | ✅ COMPLETE | Opens AI drawer from menu |

### 3.4 Dictation Coverage

| Location | Status |
|----------|--------|
| Clinical text fields | ✅ COMPLETE |
| Feedback form | ⏳ PENDING |
| Search fields | ⏳ PENDING |
| Settings inputs | ⏳ PENDING |

---

## Phase 3B: Feature Enhancements

### 3.5 Note Generation Pipeline

| Feature | Status | Priority |
|---------|--------|----------|
| Note assembly from all sources | ✅ COMPLETE | Merge engine + modal |
| Preview/Edit modal | ✅ COMPLETE | P1 |
| Recommendations verification checklist | ✅ COMPLETE | P1 |
| Source tracking (Manual/AI/Recs) | ✅ COMPLETE | P1 |
| Section verification progress | ✅ COMPLETE | P1 |
| AI suggestion accept/reject | ✅ COMPLETE | P1 |
| Suggested improvements section | ⏳ PENDING | P2 |
| "Ask AI about this note" button | ⏳ PENDING | P2 |

### 3.6 Physical Exam Enhancements

| Feature | Status | Priority |
|---------|--------|----------|
| Checkbox-based neurological exam | ✅ COMPLETE | - |
| Free-text exam option | ⏳ PENDING | P1 |
| NIH Stroke Scale (NIHSS) | ⏳ PENDING | 🎯 HIGH |
| Modified Rankin Scale | ⏳ PENDING | P2 |
| Other exam types dropdown | ⏳ PENDING | P2 |

### 3.7 Patient History Summary

| Feature | Status | Priority |
|---------|--------|----------|
| Longitudinal AI summary paragraph | ⏳ PENDING | P1 |
| Length control (brief/standard/detailed) | ⏳ PENDING | P1 |
| Manual editing | ⏳ PENDING | P1 |
| Customization settings | ⏳ PENDING | P2 |

---

## Phase 3C: Onboarding & Settings

### 3.8 Help Drawer (Lightbulb Icon)

| Tab | Status | Priority |
|-----|--------|----------|
| Inspiration | ⏳ PENDING | P2 |
| Tour | ⏳ PENDING | P2 |
| Features | ⏳ PENDING | P2 |
| Feedback | ⏳ PENDING | P2 |

### 3.9 User Settings

| Feature | Status | Priority |
|---------|--------|----------|
| Settings Drawer | ⏳ PENDING | P1 |
| Call volume/ringtone | ⏳ PENDING | P2 |
| Dark mode (system preference) | 🔧 PARTIAL | Basic toggle exists |
| Font size settings | ⏳ PENDING | P2 |
| AI Custom Instructions (global) | ⏳ PENDING | 🎯 HIGH |
| AI Custom Instructions (per-section) | ⏳ PENDING | P1 |

### 3.10 Workflow Documentation

| Workflow | Status |
|----------|--------|
| Fully AI-Driven | ⏳ NOT DOCUMENTED |
| Fully Manual | 🔧 SUPPORTED (implicit) |
| Hybrid Lightweight | 🔧 PARTIAL |
| Hybrid Advanced | 🔧 PARTIAL |
| Workflow selection UI | ⏳ PENDING |

---

## Phase 4: Dot Phrases (Complete)

| Feature | Status | Notes |
|---------|--------|-------|
| Phrase library structure | ✅ COMPLETE | Categories, search |
| Lightning button trigger | ✅ COMPLETE | NoteTextField.tsx |
| Field scoping | ✅ COMPLETE | Field-specific phrases |
| CRUD operations | ✅ COMPLETE | /api/phrases |
| Usage tracking | ✅ COMPLETE | Count updates |
| Drawer UI | ✅ COMPLETE | DotPhrasesDrawer.tsx |
| Pre-built neurology phrases | ⏳ PENDING | Need to seed library |
| Dot-prefix auto-expand | ⏳ PENDING | P2 |
| Keyboard shortcuts | ⏳ PENDING | P2 |
| Import/Export | ⏳ PENDING | P3 |

---

## Phase 5: Extended Clinical Scales

### Outpatient (Future)

| Scale | Status | Priority |
|-------|--------|----------|
| Epworth Sleepiness Scale | ⏳ PENDING | P1 |
| UPDRS (Parkinson's) | ⏳ PENDING | P2 |
| Hoehn & Yahr | ⏳ PENDING | P2 |
| EDSS (MS) | ⏳ PENDING | P2 |
| ABCD2 (TIA risk) | ⏳ PENDING | P1 |
| CHA₂DS₂-VASc | ⏳ PENDING | P2 |
| HAS-BLED | ⏳ PENDING | P2 |
| DN4 (neuropathic pain) | ⏳ PENDING | P2 |
| ODI (spine) | ⏳ PENDING | P2 |
| NDI (neck) | ⏳ PENDING | P2 |
| DHI (dizziness) | ⏳ PENDING | P2 |
| Modified Ashworth | ⏳ PENDING | P1 |

### Inpatient Module (Future)

| Scale | Status | Priority |
|-------|--------|----------|
| NIHSS | ⏳ PENDING | 🎯 P0 for inpatient |
| GCS | ⏳ PENDING | P0 for inpatient |
| mRS | ⏳ PENDING | P0 for inpatient |
| FOUR Score | ⏳ PENDING | P1 |
| Hunt & Hess | ⏳ PENDING | P1 |
| ICH Score | ⏳ PENDING | P1 |
| CAM/CAM-ICU | ⏳ PENDING | P1 |
| RASS | ⏳ PENDING | P1 |

---

## Phase 6: Patient Education (Complete)

| Feature | Status | Notes |
|---------|--------|-------|
| Handout tab in AiDrawer | ✅ COMPLETE | 7 conditions |
| Reading level control | ⏳ PENDING | P1 |
| Language selection | ⏳ PENDING | P2 |
| Print formatting | ⏳ PENDING | P2 |
| Practice branding | ⏳ PENDING | P2 |
| Auto-suggest based on diagnosis | ⏳ PENDING | P1 |
| Template library expansion | ⏳ PENDING | Ongoing |

---

## Technical Debt & Known Issues

| Issue | Priority | Notes |
|-------|----------|-------|
| Audio routing for Visit AI | P1 | May need endpoint routing fix |
| Three voice recorder instances | P2 | Could optimize in AiDrawer/VoiceDrawer |
| No audio storage | P2 | Audio processed and discarded |
| AI suggestions not wired | P2 | Component exists but not integrated |
| Supabase client creation pattern | Done | Fixed - lazy initialization |

---

## Recommended Priority Order

Based on the analysis, here's the recommended implementation order to minimize risk:

### Immediate (Complete Phase 2 Foundation)

1. ~~**Smart Recommendations** - Link diagnoses to treatment plans~~ ✅ COMPLETE
   - 5 demo diagnoses with full outpatient recommendations
   - Expandable sections with checkbox-based selection
   - Integrated into Recommendation tab with Plan textarea

### Short-term (Phase 3A Completion)

2. ~~**Field-level AI Actions** - Improve/Expand/Summarize~~ ✅ COMPLETE
   - Dropdown menu with Improve Writing, Expand Details, Summarize
   - API endpoint `/api/ai/field-action` with GPT-4 integration
   - Patient context awareness for better results

3. ~~**Note Review Modal** - Final review workflow~~ ✅ COMPLETE
   - Source tracking (Manual/ChartPrep/VisitAI/Recs)
   - Section verification with progress
   - AI suggestion accept/reject

4. **User Settings with AI Instructions**
   - Personalization is key to adoption
   - AI custom instructions enable provider preferences

### Medium-term (Phase 3B)

5. **NIHSS Scale** - Critical for stroke
   - High clinical value
   - Bridges outpatient/inpatient needs

### Ongoing (Polish & Expansion)

6. **TopNav Dead Elements** - Logo, Timer, Lock, Notifications
7. **Pre-built Dot Phrases** - Seed neurology library
8. **Additional Scales** - Epworth, ABCD2, etc.
9. **Workflow Documentation** - Help users understand options

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Dead UI elements | 0 |
| AI buttons with real actions | 100% |
| Dictation coverage | All text inputs |
| Phase 2 completion | 100% |
| Core scales implemented | NIHSS added |

---

*Document created: January 24, 2026*
*Consolidates: All PRD documents*
