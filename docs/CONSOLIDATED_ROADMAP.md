# Consolidated Roadmap - Sevaro Clinical

**Version:** 1.8
**Last Updated:** March 17, 2026 (Phase 10: Advanced Clinical Workflows & Neuro OS Foundation — stakeholder feedback integration)
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

### 1.4 Medications & Allergies

| Feature | Status | Notes |
|---------|--------|-------|
| patient_medications table | ✅ COMPLETE | Migration 014, RLS, indexes, triggers |
| patient_allergies table | ✅ COMPLETE | Migration 014, severity levels |
| medication_reviews table | ✅ COMPLETE | Audit trail for reviews |
| Medications API (CRUD) | ✅ COMPLETE | /api/medications, /api/medications/[id] |
| Allergies API (CRUD) | ✅ COMPLETE | /api/allergies, /api/allergies/[id] |
| TypeScript types | ✅ COMPLETE | medicationTypes.ts — 8 interfaces, 4 enums |
| Neuro formulary data | ✅ COMPLETE | ~70 meds, 8 categories, searchFormulary() |
| CenterPanel medication UI | ✅ COMPLETE | List, add/edit modal, formulary typeahead, discontinue modal |
| CenterPanel allergy UI | ✅ COMPLETE | Chips/pills with severity colors, add form |
| LeftSidebar medication summary | ✅ COMPLETE | Medication list in sidebar |
| LeftSidebar allergy banner | ✅ COMPLETE | Alert banner + allergy summary |
| ClinicalNote state management | ✅ COMPLETE | useState, useEffect fetch, 7 useCallback handlers |

### 1.5 Authentication & Infrastructure

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
| Import templates from neuro-plans (67 plans synced) | ✅ COMPLETE | P0 |
| Checkbox-based recommendation selection | ✅ COMPLETE | P0 |
| Expandable sections with subsections | ✅ COMPLETE | P0 |
| Priority badges (STAT/URGENT/ROUTINE/EXT) | ✅ COMPLETE | P1 |
| Item details (dosing, rationale, monitoring, contraindications) | ✅ COMPLETE | P1 |
| Patient instructions section | ✅ COMPLETE | P1 |
| Add selected items to Plan textarea | ✅ COMPLETE | P0 |
| **GitHub → Supabase sync pipeline** | ✅ COMPLETE | P0 |
| **Dynamic plan loading from database** | ✅ COMPLETE | P0 |
| **OPD-only filtering in sync** | ✅ COMPLETE | P1 |
| **Canonical subsection ordering** | ✅ COMPLETE | P0 |
| **Keyword-based Treatment tier sorting** | ✅ COMPLETE | P0 |
| **Saved plans (save/load per user)** | ✅ COMPLETE | P1 |
| **Plan search by keyword** | ✅ COMPLETE | P1 |
| **Diagnosis synonym/abbreviation search** | ✅ COMPLETE | P1 |
| **Alternate ICD-10 code matching** | ✅ COMPLETE | P0 |
| **Plan overrides mechanism for sync** | ✅ COMPLETE | P1 |
| **ICD-10 parsing fix (markdown-formatted source)** | ✅ COMPLETE | P0 |
| Recommendation reconciliation engine | ⏳ PENDING | P2 |
| hasSmartPlan flag sync | ✅ COMPLETE | 148/166 diagnoses flagged, matches 98 DB plans |
| Expand to all 166 diagnoses | 🔧 PARTIAL | P1 — 98 plans in DB, 148/166 covered (89%), 18 still need plans |

**Reference:** https://blondarb.github.io/neuro-plans/clinical/

**Integration Pipeline (January 30, 2026):**
- `npm run sync-plans` fetches plans.json from neuro-plans GitHub repo
- Strips markdown formatting (`**`) from ICD-10 codes, extracts clean codes
- Filters to OPD-only items, flattens dosing structures
- Applies local overrides from `scripts/plan-overrides.json` (fixes source data gaps)
- Upserts to Supabase `clinical_plans` table (98 plans in DB total)
- SmartRecommendationsSection fetches from `/api/plans` endpoint with fallback to hardcoded data

**Subsection Ordering (recommendationOrdering.ts):**
- Labs: Essential/Core Labs → Extended Workup → Rare/Specialized → Lumbar Puncture
- Imaging: Essential/First-line → Extended → Rare/Specialized
- Treatment: Keyword-based tiers (Acute → First-line → Disease-modifying → Second-line → Symptomatic → Refractory → Surgical → Avoid → Complications)
- Other: Referrals & Consults → Lifestyle & Prevention → Patient Instructions

**Saved Plans:**
- `saved_plans` table (migration 013) with RLS, user-owned
- CRUD API at `/api/saved-plans` and `/api/saved-plans/[id]`
- Save/Load UI in SmartRecommendationsSection (10-plan soft limit per user)
- Stores selections + custom items relative to base plan

**Diagnosis Search Enhancements:**
- 60+ clinical abbreviation synonyms (tia, ms, gbs, als, mg, nmo, pd, rls, mci, etc.)
- Search matches against name, ICD-10 code, AND diagnosis ID
- Plan search across title, ICD-10 codes, and scope

**Current Plans Available (98 in DB):**
Migraine, Migraine with Aura, Chronic Migraine, Cluster Headache, Tension-Type Headache, Medication Overuse Headache, Low Pressure Headache, Post-Concussion Syndrome, Trigeminal Neuralgia, New Onset Seizure, Status Epilepticus, Breakthrough Seizure, NCSE, Acute Ischemic Stroke, TIA, Intracerebral Hemorrhage, Subarachnoid Hemorrhage, CVT, Parkinson's Disease, Parkinson's Disease - New Diagnosis, Drug-Induced Parkinsonism, Essential Tremor, Dystonia, Tardive Dyskinesia, Huntington's Disease, RLS, Wilson's Disease, MS - New Diagnosis, MS - Chronic Management, NMOSD, Optic Neuritis, Dementia Evaluation, MCI, Alzheimer's Disease, Lewy Body Dementia, Vascular Dementia, Frontotemporal Dementia, Rapidly Progressive Dementia, NPH, Peripheral Neuropathy, Diabetic Neuropathy, Small Fiber Neuropathy, CIDP, Carpal Tunnel Syndrome, Radiculopathy, GBS, MG - New Diagnosis, MG - Outpatient Management, MG - Exacerbation/Crisis, ALS/MND, Neuromuscular Respiratory Failure, Autoimmune Encephalitis, Bacterial Meningitis, HSV Encephalitis, Bell's Palsy, Syncope, Vertigo/Dizziness Evaluation, Wernicke Encephalopathy, Brain Metastases, IIH, Elevated ICP Management, Spinal Epidural Abscess, Acute Myelopathy, Cauda Equina Syndrome, Spinal Cord Compression, GCA, FND

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
| Feedback form | ✅ COMPLETE |
| Search fields | ✅ COMPLETE |
| Settings inputs | ✅ COMPLETE |

### 3.4b Clinical Workflow UX (January 31, 2026)

| Feature | Status | Notes |
|---------|--------|-------|
| History Tab Section Navigation | ✅ COMPLETE | Sticky pill-bar with 8 sections, IntersectionObserver active tracking, smooth scroll |
| Vital Signs Inputs | ✅ COMPLETE | BP/HR/Temp/Weight/BMI at top of Exam tab, saved to noteData, in generated notes |
| Medication Form as Modal | ✅ COMPLETE | Moved from inline to centered modal overlay, reduces scroll displacement |
| Dead Code Cleanup (LeftSidebar) | ✅ COMPLETE | Removed ~260 lines of unused Prior History Summary |

### 3.4c UX Improvements (February 1, 2026)

| Feature | Status | Notes |
|---------|--------|-------|
| Consult sub-options visibility | ✅ COMPLETE | Auto-scroll, hint text, highlight border, chevron connector |
| Tab completion indicators | ✅ COMPLETE | Green/amber dots with missing-field tooltips |
| DDx edit affordances | ✅ COMPLETE | Priority badges, reorder arrows, set primary, swap search |
| Recommendation → Plan adoption | ✅ COMPLETE | Select all/deselect all, Added! confirm, plan flash |
| Contextual exam scales | ✅ COMPLETE | Recommended/All filter, diagnosis context banner, teal dots |

### 3.4d User Feedback Backlog (February 1, 2026)

From live testing session. Items organized by priority tier.

#### Bugs (P0 — broken behavior)

| Item | Status | Component | Description |
|------|--------|-----------|-------------|
| Cross-patient data contamination | ✅ FIXED | ClinicalNote.tsx | resetAllClinicalState + async guards |
| Second Chart Prep breaks note (F1) | ✅ FIXED | VoiceDrawer.tsx | Marker-based replace + noteDataRef |
| Tab nav scrolls with content (F2) | ✅ FIXED | globals.css, CenterPanel.tsx | z-index 20 on tab-nav-wrapper |
| Sign & Complete non-functional (F3) | ✅ FIXED | CenterPanel.tsx | Prior commit |

#### Quick UI Fixes (P1)

| Item | Status | Component | Description |
|------|--------|-----------|-------------|
| Remove "Final recommendation time" (F4) | ✅ FIXED | CenterPanel.tsx | Already removed |
| Remove DDx search filter pills (F5) | ✅ FIXED | DifferentialDiagnosisSection.tsx | Filter bar + dead state removed |
| Rename "Differential diagnosis" → "Diagnoses" (F6) | ✅ FIXED | DifferentialDiagnosisSection.tsx | Already renamed |
| Remove mystery circle next to Gait (F7) | ✅ FIXED | CenterPanel.tsx | 8px teal dot removed |
| Remove "AI Summary" button in Chart Prep (F8) | ✅ FIXED | VoiceDrawer.tsx | Already removed |

#### Behavior Changes (P1)

| Item | Status | Component | Description |
|------|--------|-----------|-------------|
| Chart Prep → single paragraph summary (F9) | ✅ FIXED | VoiceDrawer.tsx, chart-prep API | API refactored to narrative format |
| AI should not judge missing findings (F10) | ✅ FIXED | visit-ai, synthesize-note | Guardrails added to all AI prompts |
| Copy Note → slide-out drawer (F11) | ✅ FIXED | CenterPanel.tsx | showCopyDrawer added |
| Exam scale hover tooltips (F12) | ✅ FIXED | ExamScalesSection.tsx | title attribute on scale buttons |

#### Feature Additions (P2)

| Item | Status | Component | Description |
|------|--------|-----------|-------------|
| Add symptom-based diagnoses (F13) | ✅ FIXED | diagnosisData.ts | 10 symptoms added |
| Patient History Summary context (F14) | ✅ FIXED | PatientHistorySummary.tsx | Referral card for new patients; full medication context for follow-ups (Feb 3: removed truncation, explicit medication instructions) |
| Sign & Complete full workflow (F15) | ✅ FIXED | ClinicalNote.tsx + API | Writes to visits, AI summary, ScheduleFollowupModal, appointments API; stale closure fix (Feb 3); tenant_id fix (Feb 3) |
| Imaging longitudinal tracking (F16) | ✅ FIXED | ImagingResultsTab.tsx | Array-based study tracking, prior studies, grouped dropdown |

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
| Suggested improvements section | ✅ COMPLETE | P2 — AI note review with collapsible suggestions panel |
| "Ask AI about this note" button | ✅ COMPLETE | P2 — Chat interface with full note context |

### 3.6 Physical Exam Enhancements

| Feature | Status | Priority |
|---------|--------|----------|
| Checkbox-based neurological exam | ✅ COMPLETE | - |
| Free-text exam option | ✅ COMPLETE | Structured/Free-text pill toggle |
| NIH Stroke Scale (NIHSS) | ✅ COMPLETE | Full 15-item scale |
| Modified Ashworth Scale | ✅ COMPLETE | Spasticity grading |
| Exam Templates (5 predefined + custom) | ✅ COMPLETE | Quick apply |
| Vital Signs (BP/HR/Temp/Weight/BMI) | ✅ COMPLETE | Controlled inputs at top of Exam tab, saved to noteData, in generated notes |
| Modified Rankin Scale | ⏳ PENDING | P2 |
| Other exam types dropdown | ⏳ PENDING | P2 |

### 3.7 Patient History Summary

| Feature | Status | Priority |
|---------|--------|----------|
| Longitudinal AI summary paragraph | ✅ COMPLETE | PatientHistorySummary.tsx |
| Length control (brief/standard/detailed) | ✅ COMPLETE | Mode selector buttons |
| Manual editing | ✅ COMPLETE | Click to edit after generation |
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
| Pre-built neurology phrases | ✅ COMPLETE | 70+ phrases seeded via /api/phrases/seed |
| Dot-prefix auto-expand | ✅ COMPLETE | Already implemented in NoteTextField.tsx |
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

### Outpatient — Recently Implemented (January 2026)

| Scale | Status | Notes |
|-------|--------|-------|
| UPDRS Motor (Part III) | ✅ COMPLETE | 33-item Parkinson's motor exam |
| Hoehn & Yahr | ✅ COMPLETE | Parkinson's staging (0-5) |
| EDSS | ✅ COMPLETE | MS disability (0-10) |
| CHA₂DS₂-VASc | ✅ COMPLETE | Stroke risk in AFib (0-9) |

### Outpatient — Implemented (January 30, 2026)

| Scale | Status | Notes |
|-------|--------|-------|
| HAS-BLED | ✅ COMPLETE | Bleeding risk (0-9), pairs with CHA₂DS₂-VASc for AFib |
| DN4 (neuropathic pain) | ✅ COMPLETE | 7 interview + 3 exam items, ≥4 = neuropathic |
| ODI (spine) | ✅ COMPLETE | 10-section low back disability, percentage scoring |
| NDI (neck) | ✅ COMPLETE | 10-section neck disability, percentage scoring |

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
| Reading level control | ✅ COMPLETE | P1 — Simple/Standard/Advanced pill selector, localStorage persistence |
| Language selection | ✅ COMPLETE | Free-text language input, persisted to localStorage |
| Print formatting | ✅ COMPLETE | Practice name header, date footer, clean print styles |
| Practice branding | ✅ COMPLETE | Practice name in Settings, displayed on handouts and print |
| Auto-suggest based on diagnosis | ✅ COMPLETE | Grouped optgroups from visit diagnoses |
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
| AI Historian tab in PatientPortal | ✅ COMPLETE | Patient picker + add patient + demo fallback |
| Full-screen voice interview page | ✅ COMPLETE | /patient/historian (?patient_id= or ?scenario=) |
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

### 8.4 Patient-Centric Upgrade

| Feature | Status | Notes |
|---------|--------|-------|
| Real patient list in portal | ✅ COMPLETE | get_patients_for_portal RPC |
| Add New Patient from portal | ✅ COMPLETE | portal_register_patient RPC |
| Patient context loading | ✅ COMPLETE | get_patient_context_for_portal RPC |
| Prior visit context in interviews | ✅ COMPLETE | HPI, assessment, plan, allergies, diagnoses, ROS, AI summary passed to AI |
| Auto session type derivation | ✅ COMPLETE | follow_up if prior visit exists |
| patient_id FK on sessions | ✅ COMPLETE | Migration 011, nullable FK |
| Physician view patient join | ✅ COMPLETE | Real names from patients table |
| Demo scenario fallback | ✅ COMPLETE | Collapsible section, unchanged flow |
| Enriched context (migration 012) | ✅ COMPLETE | Allergies, ROS, active diagnoses, AI summary; removed HPI/assessment truncation |

---

## Phase 9: QA Framework (Complete)

| Feature | Status | Notes |
|---------|--------|-------|
| Test runbook (v1.0) | ✅ COMPLETE | qa/TEST_RUNBOOK.md |
| Structured test cases (v1.0) | ✅ COMPLETE | qa/TEST_CASES.yaml (35 cases) |
| Bug report template | ✅ COMPLETE | qa/BUG_TEMPLATE.md |
| Release checklist | ✅ COMPLETE | qa/RELEASE_CHECKLIST.md |
| Run log template | ✅ COMPLETE | qa/runs/RUN_TEMPLATE.md |
| First test run | ✅ COMPLETE | qa/runs/RUN-2026-01-30-001.md (GO) |
| CLAUDE.md QA rules | ✅ COMPLETE | Rules-of-engagement section added |

---

## Phase 10: Advanced Clinical Workflows & Neuro OS Foundation

**Source:** Stakeholder feedback session (March 17, 2026) during OPSAmple demo. Key themes: multimodal patient intake, post-discharge billing compliance, patient engagement automation, and Neuro OS SaaS positioning.

### 10.1 Multimodal Patient Intake (Historian Enhancement)

Extends the AI Neurologic Historian (Phase 8) with visual/interactive intake alongside voice.

| Feature | Status | Priority | Notes |
|---------|--------|----------|-------|
| Interactive body diagram component (SVG) | ⏳ PENDING | P0 | Tap-to-locate pain/symptoms on head, spine, body |
| Companion app model (phone + visual) | ⏳ PENDING | P1 | AI calls patient on phone, instructs them to open app for visual interaction |
| Sequential descriptor questioning | ⏳ PENDING | P0 | One descriptor at a time: throbbing? pulsating? electric? radiating? |
| Patient-adaptive pacing | ⏳ PENDING | P1 | Adjust question complexity/speed based on age, comorbidities, cognitive status |
| Symptom location documentation | ⏳ PENDING | P0 | Store tap locations as structured data (body region, coordinates) |
| Visual descriptor cards | ⏳ PENDING | P1 | Show images/animations for pain descriptors patients can select |
| `patient_intake_diagrams` table | ⏳ PENDING | P0 | Schema for body map tap data linked to historian sessions |

**Clinical rationale:** Patients often cannot verbalize symptoms in a doctor's office — they forget, they struggle with descriptors. Pain clinics have long used circle-the-area diagrams. This brings that paradigm into the AI historian flow.

### 10.2 Post-Discharge Contact Tracking & TCM Compliance

Extends the Follow-Up Agent with structured contact attempt tracking and billing compliance monitoring.

| Feature | Status | Priority | Notes |
|---------|--------|----------|-------|
| Contact attempt tracking | ⏳ PENDING | P0 | `contact_attempts` JSONB: timestamp, method, outcome, notes |
| Attempted vs. successful status column | ⏳ PENDING | P0 | Visual queue showing contact outcomes per patient |
| TCM 2-day first-contact alert | ⏳ PENDING | P0 | Alert when window closing for initial post-discharge contact |
| TCM 14-day F2F scheduling check | ⏳ PENDING | P0 | Track whether face-to-face follow-up is scheduled within window |
| Auto-retry scheduling | ⏳ PENDING | P1 | `next_retry_scheduled_at` — don't lose track of unreachable patients |
| CPT compliance dashboard | ⏳ PENDING | P1 | Per-patient view of TCM/CCM/RPM code requirements vs. status |
| Discharge-triggered workflow | ⏳ PENDING | P1 | Auto-create follow-up tasks based on discharge date + diagnosis |
| Revenue opportunity tracker | ⏳ PENDING | P2 | Summary of billable codes earned vs. missed across patient panel |

**Billing context:**
- **TCM** (Transition Care Management): First contact within 2 business days post-discharge; F2F appointment within 14 days
- **CCM** (Chronic Care Management): 20+ minutes/month of care coordination
- **RPM** (Remote Patient Monitoring): Device setup + 16 days/month of readings + 20 min clinical review
- Each has separate CPT codes — meeting timing windows is critical for reimbursement

### 10.3 Patient Engagement & "Love Taps"

Inspired by ChenMed's wellness call model — automated patient outreach maintaining human connection.

| Feature | Status | Priority | Notes |
|---------|--------|----------|-------|
| Wellness check-in queue | ⏳ PENDING | P1 | Separate from clinical follow-up — "How are you doing?" calls |
| Appointment reminder + barrier detection | ⏳ PENDING | P1 | Identify why patients miss appointments (no ride, forgot, etc.) |
| Engagement scoring | ⏳ PENDING | P2 | Track patient responsiveness over time |
| Caregiver outreach | ⏳ PENDING | P2 | Contact designated caregiver when patient unreachable |
| Proactive care gap detection | ⏳ PENDING | P2 | Flag patients overdue for follow-up, labs, imaging |

### 10.4 RPM Dashboard Enhancements

Extends the Wearable Monitoring dashboard (Phase 6/wearable) with clinical action automation.

| Feature | Status | Priority | Notes |
|---------|--------|----------|-------|
| Fall detection → PT referral suggestion | ⏳ PENDING | P0 | "2 falls in past 2 weeks — consider physical therapy referral" |
| Longitudinal trend dashboard | 🔧 PARTIAL | P1 | Component built (`LongitudinalSummaryBanner`), needs data wiring |
| Risk stratification rules | ⏳ PENDING | P1 | Pattern-based risk scoring from anomaly frequency/severity |
| Automated care suggestions | ⏳ PENDING | P1 | Based on RPM data patterns, suggest clinical actions |
| Human-in-loop notification | ⏳ PENDING | P1 | Clinician reviews and approves/dismisses AI suggestions |
| Comparative cohort analytics | ⏳ PENDING | P2 | Patient outcomes vs. similar patients |

### 10.5 Neuro OS Platform Positioning

Strategic features for SaaS overlay onto existing EHR systems (e.g., Epic).

| Feature | Status | Priority | Notes |
|---------|--------|----------|-------|
| Epic overlay integration design | ⏳ PENDING | P1 | Architecture for FHIR-based data exchange |
| Value-based care metrics dashboard | ⏳ PENDING | P1 | Track metrics that qualify organizations for certifications |
| Specialty certification tracker | ⏳ PENDING | P2 | Map achieved metrics to certification requirements |
| Multi-tenant billing analytics | ⏳ PENDING | P2 | Per-organization TCM/CCM/RPM revenue tracking |

**Business model:** Sevaro doesn't bill directly — it's SaaS that customer organizations use to meet value-based care standards, earn specialty certifications, and capture billable code revenue. "Neuro OS" concept coined by Raj.

### 10.6 Open Items (Requires Discussion)

| Item | Owner | Notes |
|------|-------|-------|
| Legal review of AI-assisted clinical documentation | Raj / Legal | Liability, compliance, informed consent for AI historian |
| Neuro OS brand positioning | Raj | Confirm naming, marketing, feature prioritization |
| Which billable codes to prioritize first | Clinical team | TCM vs. CCM vs. RPM — customer demand signals |
| Epic integration partnership | Business dev | FHIR API access, certification requirements |

---

## Technical Debt & Known Issues

| Issue | Priority | Notes |
|-------|----------|-------|
| ~~Audio routing for Visit AI~~ | Done | Safari MIME fix, file size validation, retry, maxDuration |
| Three voice recorder instances | P2 | Could optimize in AiDrawer/VoiceDrawer |
| Supabase client creation pattern | Done | Fixed - lazy initialization |
| ~~OpenAI max_tokens deprecation~~ | Done | Feb 3: migrated to max_completion_tokens across all 8 API routes |
| ~~Sign & Complete stale closure~~ | Done | Feb 3: handlePend returns visitId directly |
| ~~View Full Note fails on legacy data~~ | Done | Feb 3: modal opens with AI summary fallback |
| ~~PATCH route missing fields~~ | Done | Feb 3: vitals + examFreeText now saved |
| ~~clinical_notes missing tenant_id~~ | Done | Feb 3: PATCH and sign routes include tenant_id |
| 18 diagnoses without plans | P2 | Low coverage gap — 148/166 (89%) covered |
| Medication text mentions vs structured records | P2 | Meds in note text don't appear in structured medication list |

---

## Recommended Priority Order

Based on the analysis, here's the recommended implementation order to minimize risk:

### Immediate (Complete Phase 2 Foundation)

1. ~~**Smart Recommendations** - Link diagnoses to treatment plans~~ ✅ COMPLETE
   - 67 plans synced from neuro-plans repo (covering most neurology diagnoses)
   - Canonical subsection ordering (Essential first, Rare/Specialized last)
   - Saved plans per user, plan search, diagnosis synonym search
   - Alternate ICD-10 matching, plan overrides mechanism for sync

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
| Dictation coverage | All text inputs | ✅ COMPLETE — Clinical fields, settings, search, feedback |
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
| AI Neurologic Historian | Voice intake via WebRTC + patient-centric | ✅ COMPLETE |
| QA Framework | Test runbook, cases, checklists, run logs | ✅ COMPLETE |

---

*Document created: January 24, 2026*
*Last updated: February 3, 2026 (Follow-up visit workflow, plan sync pipeline, ICD-10 matching, Sign & Complete fixes)*
*Consolidates: All PRD documents*
