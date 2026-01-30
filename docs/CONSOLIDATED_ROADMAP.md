# Consolidated Roadmap - Sevaro Clinical

**Version:** 1.3
**Last Updated:** January 30, 2026 (AI Neurologic Historian)
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
| **GitHub → Supabase sync pipeline** | ✅ COMPLETE | P0 |
| **Dynamic plan loading from database** | ✅ COMPLETE | P0 |
| **OPD-only filtering in sync** | ✅ COMPLETE | P1 |
| Recommendation reconciliation engine | ⏳ PENDING | P2 |
| Expand to all 134 diagnoses | 🔧 PARTIAL | P1 - Pipeline ready, plans being built |

**Reference:** https://blondarb.github.io/neuro-plans/clinical/

**Integration Pipeline (January 26, 2026):**
- `npm run sync-plans` fetches plans.json from neuro-plans GitHub
- Filters to OPD-only items, flattens dosing structures
- Upserts to Supabase `clinical_plans` table
- SmartRecommendationsSection fetches from `/api/plans` endpoint

**Current Plans Available:**
- New Onset Seizure
- Status Epilepticus (outpatient follow-up)
- Multiple Sclerosis - New Diagnosis
- Peripheral Neuropathy - New Diagnosis/Evaluation
- Acute Ischemic Stroke (outpatient follow-up)
- *(6 more in development in neuro-plans)*

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

| Element | Status | Notes |
|---------|--------|-------|
| Sevaro Logo click | ✅ COMPLETE | Links to prototype.html |
| Timer click | ✅ COMPLETE | Dropdown with pause/resume, reset, billing code selector |
| Lock Icon | ✅ COMPLETE | Full-screen PHI protection overlay |
| Notifications | ✅ COMPLETE | Panel with alert/message/task/system types, read/unread states |
| What's New | ✅ COMPLETE | Version history changelog panel |

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
| **Comprehensive Note Generation** | ✅ COMPLETE | EnhancedNotePreviewModal |
| Note type selection (New Consult/Follow-up) | ✅ COMPLETE | Different layouts |
| Note length preference (Concise/Standard/Detailed) | ✅ COMPLETE | Formatting options |
| Note assembly from all sources | ✅ COMPLETE | Merge engine + modal |
| Scales integration (with scores) | ✅ COMPLETE | formatScales() |
| Diagnoses integration (with ICD-10) | ✅ COMPLETE | formatDiagnoses() |
| Imaging/Labs integration | ✅ COMPLETE | formatImagingStudies() |
| Physical exam text generation | ✅ COMPLETE | formatExamFindings() |
| Recommendations integration | ✅ COMPLETE | formatRecommendations() |
| Preview/Edit modal | ✅ COMPLETE | P1 |
| Section-by-section verification | ✅ COMPLETE | P1 |
| Recommendations verification checklist | ✅ COMPLETE | P1 |
| Source tracking (Manual/AI/Recs/Scales/Imaging) | ✅ COMPLETE | P1 |
| Final note preview (EHR-ready) | ✅ COMPLETE | Full text view |
| Copy to clipboard (one-click) | ✅ COMPLETE | For EHR paste |
| Word count display | ✅ COMPLETE | Real-time |
| AI suggestion accept/reject | ✅ COMPLETE | P1 |
| Suggested improvements section | ⏳ PENDING | P2 |
| "Ask AI about this note" button | ⏳ PENDING | P2 |

### 3.6 Physical Exam Enhancements

| Feature | Status | Priority |
|---------|--------|----------|
| Checkbox-based neurological exam | ✅ COMPLETE | - |
| Free-text exam option | ⏳ PENDING | P1 |
| NIH Stroke Scale (NIHSS) | ✅ COMPLETE | Full 15-item scale |
| Modified Ashworth Scale | ✅ COMPLETE | Spasticity grading |
| Exam Templates (5 predefined + custom) | ✅ COMPLETE | Quick apply |
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

### 3.8 Help Drawer (Lightbulb Icon) - COMPLETE

| Tab | Status | Priority |
|-----|--------|----------|
| Workflows | ✅ COMPLETE | P2 |
| Tour | ✅ COMPLETE | P2 |
| Features | ✅ COMPLETE | P2 |
| Feedback | ✅ COMPLETE | P2 |

**Additional Onboarding Features:**
- Interactive 9-step onboarding tour (OnboardingTour.tsx)
- SVG spotlight highlighting for tour elements
- Tour replay from Settings or Ideas Drawer

### 3.9 User Settings

| Feature | Status | Priority |
|---------|--------|----------|
| Settings Drawer | ✅ COMPLETE | P1 |
| Call volume/ringtone | ⏳ PENDING | P2 |
| Dark mode (system preference) | ✅ COMPLETE | Toggle in Settings |
| Font size settings | ✅ COMPLETE | Small/Medium/Large |
| AI Custom Instructions (global) | ✅ COMPLETE | P0 |
| AI Custom Instructions (per-section) | ✅ COMPLETE | P1 |
| Documentation style preference | ✅ COMPLETE | Concise/Detailed/Narrative |
| Terminology preference | ✅ COMPLETE | Formal/Standard/Simplified |

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

### Recently Implemented (January 2026)

| Scale | Status | Notes |
|-------|--------|-------|
| NIHSS (NIH Stroke Scale) | ✅ COMPLETE | Full 15-item version, exam-driven |
| Modified Ashworth Scale | ✅ COMPLETE | Spasticity assessment |
| ABCD2 (TIA risk) | ✅ COMPLETE | Stroke risk stratification |
| DHI (Dizziness Handicap) | ✅ COMPLETE | 10-item short form |
| Mini-Cog | ✅ COMPLETE | Brief cognitive screen |
| ISI (Insomnia Severity) | ✅ COMPLETE | 7-item sleep assessment |
| ESS (Epworth Sleepiness) | ✅ COMPLETE | Daytime sleepiness |

### Scale Location System

| Feature | Status | Notes |
|---------|--------|-------|
| Exam vs History categorization | ✅ COMPLETE | SCALE_LOCATION_MAP |
| getExamScales() helper | ✅ COMPLETE | For Physical Exam tab |
| getHistoryScales() helper | ✅ COMPLETE | For History tab |
| Condition-to-scale mappings | ✅ COMPLETE | Stroke, TIA, Dizziness, etc. |

### Outpatient (Future)

| Scale | Status | Priority |
|-------|--------|----------|
| UPDRS (Parkinson's) | ⏳ PENDING | P2 |
| Hoehn & Yahr | ⏳ PENDING | P2 |
| EDSS (MS) | ⏳ PENDING | P2 |
| CHA₂DS₂-VASc | ⏳ PENDING | P2 |
| HAS-BLED | ⏳ PENDING | P2 |
| DN4 (neuropathic pain) | ⏳ PENDING | P2 |
| ODI (spine) | ⏳ PENDING | P2 |
| NDI (neck) | ⏳ PENDING | P2 |

### Inpatient Module (Future)

| Scale | Status | Priority |
|-------|--------|----------|
| GCS | ⏳ PENDING | P0 for inpatient |
| mRS (Modified Rankin) | ⏳ PENDING | P0 for inpatient |
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

## Phase 7: Responsive Design & Accessibility (Complete)

### 7.1 Mobile/Tablet/Desktop Support

| Feature | Status | Notes |
|---------|--------|-------|
| Viewport meta tag | ✅ COMPLETE | layout.tsx |
| Mobile breakpoint (<640px) | ✅ COMPLETE | Slide-in sidebar, full-screen drawers |
| Tablet breakpoint (640-1024px) | ✅ COMPLETE | Reduced padding, narrower elements |
| Desktop breakpoint (>1024px) | ✅ COMPLETE | Standard layout |
| Hamburger menu | ✅ COMPLETE | TopNav mobile toggle |
| Sidebar overlay | ✅ COMPLETE | LeftSidebar with backdrop |
| Touch enhancements | ✅ COMPLETE | 44px tap targets, active states |
| Print styles | ✅ COMPLETE | Clean document output |

### 7.2 Dark Mode Support

| Feature | Status | Notes |
|---------|--------|-------|
| Theme toggle | ✅ COMPLETE | Settings Drawer |
| CSS variables | ✅ COMPLETE | Full color system |
| Form element styling | ✅ COMPLETE | Global overrides for dark mode |
| Physical exam forms | ✅ COMPLETE | Textarea/select themed |

---

## Phase 8: AI Neurologic Historian (Complete)

### 8.1 Voice-Based Patient Intake

| Feature | Status | Notes |
|---------|--------|-------|
| OpenAI Realtime API integration (WebRTC) | ✅ COMPLETE | gpt-4o-realtime-preview, verse voice |
| Ephemeral token API endpoint | ✅ COMPLETE | /api/ai/historian/session |
| WebRTC hook (useRealtimeSession) | ✅ COMPLETE | Full lifecycle management |
| New patient interview (OLDCARTS) | ✅ COMPLETE | Structured symptom characterization |
| Follow-up interview flow | ✅ COMPLETE | Interval changes, treatment response |
| Safety monitoring & escalation | ✅ COMPLETE | Keyword detection + AI protocol |
| Structured output via tool call | ✅ COMPLETE | save_interview_output function |
| Red flag identification | ✅ COMPLETE | High/medium/low severity |
| 4 demo scenarios | ✅ COMPLETE | Headache, seizure, migraine f/u, MS f/u |

### 8.2 Patient Portal Integration

| Feature | Status | Notes |
|---------|--------|-------|
| AI Historian tab in PatientPortal | ✅ COMPLETE | Third tab with scenario cards |
| Full-screen voice interview page | ✅ COMPLETE | /patient/historian |
| Animated voice orb UI | ✅ COMPLETE | Teal (AI) / purple (patient) |
| Streaming transcript display | ✅ COMPLETE | Collapsible with timestamps |
| Safety escalation overlay | ✅ COMPLETE | 911, 988, Crisis Text Line |
| Post-interview success screen | ✅ COMPLETE | Duration, question count stats |

### 8.3 Physician Integration

| Feature | Status | Notes |
|---------|--------|-------|
| HistorianSessionPanel in LeftSidebar | ✅ COMPLETE | After Patient Messages section |
| Session cards with type/duration/time | ✅ COMPLETE | Expandable with sub-tabs |
| Summary view | ✅ COMPLETE | Narrative AI summary |
| Structured data view | ✅ COMPLETE | Key-value clinical fields |
| Transcript view | ✅ COMPLETE | Scrollable with role colors |
| Red flag banners | ✅ COMPLETE | Amber warning with severity dots |
| Safety escalation alerts | ✅ COMPLETE | Red alert for flagged sessions |
| Import to Note | ✅ COMPLETE | Maps structured output to note fields |
| historian_sessions table | ✅ COMPLETE | Migration 010, JSONB columns |
| Session save/list API | ✅ COMPLETE | /api/ai/historian/save |

---

## Technical Debt & Known Issues

| Issue | Priority | Notes |
|-------|----------|-------|
| Audio routing for Visit AI | P1 | May need endpoint routing fix |
| Three voice recorder instances | P2 | Could optimize in AiDrawer/VoiceDrawer |
| No audio storage | P2 | Audio processed and discarded |
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

4. ~~**User Settings with AI Instructions**~~ ✅ COMPLETE
   - Settings Drawer with AI & Documentation, Appearance, Notifications tabs
   - Global and per-section AI instructions
   - Documentation style and terminology preferences
   - Font size settings

### Medium-term (Phase 3B)

5. ~~**NIHSS Scale** - Critical for stroke~~ ✅ COMPLETE
   - Full 15-item version implemented
   - Integrated with exam scales section
   - Also added: Modified Ashworth, ABCD2, DHI, Mini-Cog, ISI, ESS

6. ~~**Exam Template Feature**~~ ✅ COMPLETE
   - Predefined templates (General Neuro, Headache, Stroke, Cognitive, Movement)
   - Custom template saving with user naming
   - Compact chip-based scale selection

### Ongoing (Polish & Expansion)

7. ~~**TopNav Dead Elements** - Logo, Timer, Lock, Notifications~~ ✅ COMPLETE
8. ~~**Pre-built Dot Phrases** - Seed neurology library~~ ✅ COMPLETE
   - 70+ phrases across 15 categories
   - Covers all major neurology conditions
   - Includes exams, assessments, plans, orders, and return precautions
9. ~~**Workflow Documentation** - Help users understand options~~ ✅ COMPLETE
   - Quick selection guide with scenario-based recommendations
   - Step-by-step guides for each workflow style
   - Key buttons and typical time estimates per workflow

---

## Success Metrics

| Metric | Target | Status |
|--------|--------|--------|
| Dead UI elements | 0 | ✅ TopNav items complete |
| AI buttons with real actions | 100% | ✅ COMPLETE |
| Dictation coverage | All text inputs | ✅ Clinical fields done |
| Phase 2 completion | 100% | ✅ COMPLETE |
| Core scales implemented | NIHSS added | ✅ COMPLETE (7 new scales) |
| Field AI Actions | Working | ✅ COMPLETE |
| User Settings | Working | ✅ COMPLETE |
| Responsive design | Mobile/Tablet/Desktop | ✅ COMPLETE |
| Dark mode | All form elements | ✅ COMPLETE |
| Pre-built Dot Phrases | Neurology library | ✅ COMPLETE (70+ phrases) |
| Workflow Documentation | User guidance | ✅ COMPLETE |
| Onboarding | Interactive tour | ✅ COMPLETE |
| Help Drawer | All tabs | ✅ COMPLETE |
| AI Neurologic Historian | Voice intake via WebRTC | ✅ COMPLETE |

---

*Document created: January 24, 2026*
*Last updated: January 30, 2026 (AI Neurologic Historian)*
*Consolidates: All PRD documents*
