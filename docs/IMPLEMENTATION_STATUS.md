# Implementation Status - Sevaro Clinical

**Last Updated:** January 30, 2026 (P1 Features — free-text exam, handout auto-suggest, patient history summary, audio hardening)
**Based on:** PRD_AI_Scribe.md v1.4, Sevaro_Outpatient_MVP_PRD_v1.4, PRD_Roadmap_Phase3.md

---

## Quick Links

- **[CONSOLIDATED_ROADMAP.md](./CONSOLIDATED_ROADMAP.md)** - Master roadmap combining all phases from all PRDs
- **[PRD_Roadmap_Phase3.md](./PRD_Roadmap_Phase3.md)** - UX enhancements and workflow support

---

## Overview

This document tracks implementation progress against the product requirements and notes current work, issues, and next steps.

### Current Priority Focus

**Recently Completed:**
- ✅ **Responsive/Mobile Design** - Full mobile, tablet, desktop support with slide-in sidebar
- ✅ **Dark Mode Form Fixes** - Physical exam and all form elements properly themed
- ✅ **Onboarding Tour** - Interactive 9-step tour for new users with replay option
- ✅ **Ideas/Getting Started Drawer** - Workflows, Tour, Features, Feedback tabs
- ✅ **TopNav Enhancements** - Timer controls, Lock screen, Notifications panel, What's New
- ✅ **Comprehensive Note Generation** - New Consult vs Follow-up layouts, note length preferences
- ✅ **Enhanced Note Preview** - Section-by-section approval, formatted EHR-ready output
- ✅ **Smart Recommendations (Phase 2)** - 67 plans synced from neuro-plans with canonical ordering, saved plans, search
- ✅ **Field AI Actions** - Improve/Expand/Summarize with anti-hallucination safeguards
- ✅ **User Settings** - Full settings drawer with AI custom instructions (global + per-section)
- ✅ **Extended Scales** - NIHSS, Modified Ashworth, ABCD2, DHI, Mini-Cog, ISI, ESS
- ✅ **Exam Templates** - Predefined + custom template feature

**Newly Completed:**
- ✅ **Medications & Allergies** - Full CRUD API, ~70-med neuro formulary with typeahead, allergy severity chips, sidebar summary, migration 014
- ✅ **Patient-Centric Historian** - Real patients from Supabase, prior visit context in interviews, patient_id FK linkage
- ✅ **QA Framework** - Test runbook, 35 structured test cases, release checklist, bug template, run log system
- ✅ **AI Neurologic Historian** - Voice-based patient intake via OpenAI Realtime API (WebRTC)
- ✅ **Pre-built Dot Phrases** - 70+ neurology phrases seeded (exams, assessments, plans per condition)
- ✅ **Workflow Documentation** - Quick selection guide, scenario recommendations, step-by-step guides
- ✅ **Additional Clinical Scales** - UPDRS Motor (Parkinson's), Hoehn & Yahr staging, EDSS (MS), CHA₂DS₂-VASc (stroke risk)
- ✅ **AI Scale Autofill** - Extracts scale data from clinical notes/dictation with confidence scoring

**Remaining (Lower Priority):**
- Patient education enhancements (reading level, language selection)
- Expand Smart Recommendations to all 134 diagnoses (67/134 done)

---

## Recent Updates (January 30, 2026)

### P1 Features - NEW
Four features shipped in a single commit:

**1. Free-text Exam Toggle** (`CenterPanel.tsx`, `ClinicalNote.tsx`):
- Structured / Free-text pill toggle in Neurological Examination header
- Free-text mode hides all accordion checkbox sections, shows single NoteTextField (300px min-height)
- Dictation, AI assist, and dot phrase buttons on free-text field
- Exam Summary and ExamScalesSection visible in both modes
- `examFreeText` added to noteData with localStorage persistence

**2. Handout Auto-suggest by Diagnosis** (`AiDrawer.tsx`, `ClinicalNote.tsx`):
- `selectedDiagnoses` prop threaded from ClinicalNote to AiDrawer
- Handout dropdown uses `<optgroup>`: "From this visit" (selected diagnoses with ICD-10), "Common conditions" (10 hardcoded), "Personalized" (custom)
- `generateHandout()` handles `dx:` prefixed selections using diagnosis name directly in AI prompt

**3. Patient History Summary** (new `PatientHistorySummary.tsx`, `CenterPanel.tsx`, `ClinicalNote.tsx`):
- Collapsible card above Reason for Consult in History tab
- Brief / Standard / Detailed mode selector
- Calls `/api/ai/chart-prep` with prior visits, medications, allergies, score history
- Editable sections after generation (click Edit → textarea → Save/Cancel)
- Copy button for summary text
- Empty state for new patients: "No prior visits on file"
- Props threaded: ClinicalNote → CenterPanel → PatientHistorySummary

**4. Audio Routing Hardening** (`VoiceDrawer.tsx`, `useVoiceRecorder.ts`, `visit-ai/route.ts`):
- Safari MIME type mapping: `audio/mp4`, `audio/x-m4a` → `.m4a`; `audio/ogg` → `.ogg`
- 25MB file size validation client-side (before upload) and server-side (in route)
- `lastVisitAudioBlobRef` stores last recording for retry
- Retry button in error state re-sends stored audio blob (red, with refresh icon)
- `export const maxDuration = 120` on visit-ai route for Vercel function timeout
- `lastAudioBlob` exposed from useVoiceRecorder hook

**New Files (1):** PatientHistorySummary.tsx
**Modified Files (6):** CenterPanel.tsx, ClinicalNote.tsx, AiDrawer.tsx, VoiceDrawer.tsx, useVoiceRecorder.ts, visit-ai/route.ts

### Smart Recommendations Expansion - NEW
Major upgrade to Smart Recommendations: 67 clinical plans synced from neuro-plans, canonical subsection ordering, saved plans, search, and ICD-10 matching fixes.

**Database (Migration 013):**
- `clinical_plans` table (reference data, shared across tenants) — already existed, RLS policies added
- `saved_plans` table (user-owned) — stores selections + custom items relative to base plan
- RLS policies, indexes on user_id/tenant_id/source_plan_key, updated_at triggers

**Sync Pipeline Fixes (`scripts/sync-plans.ts`):**
- Fixed `cleanIcd10Codes()` — source data has `**` markdown bold markers (e.g. `"** G45.9 (Transient cerebral ischemic attack, unspecified)"`) that caused codes to be silently dropped
- 6 plans had completely empty ICD-10 codes (GBS, MS, MG, Autoimmune Encephalitis, Parkinson's, MS Chronic); now all 67 plans have proper codes
- Added `scripts/plan-overrides.json` — local overrides merged after source parsing, before Supabase upsert; prevents manual DB patches from being lost on re-sync
- TIA override: source JSON only has G45.9, but clinical documentation lists G45.0, G45.1, G45.8 as well

**Canonical Subsection Ordering (`src/lib/recommendationOrdering.ts`):**
- Labs: Essential/Core Labs → Extended Workup → Rare/Specialized → Lumbar Puncture
- Imaging: Essential/First-line → Extended → Rare/Specialized
- Other: Referrals & Consults → Lifestyle & Prevention → Patient Instructions
- Treatment: Keyword-based priority tiers (200+ unique subsection names across 67 plans) — Acute/Emergent → First-line/Essential → Disease-modifying → Second-line → Symptomatic → Refractory → Surgical → Avoid → Complications

**Plans API (`/api/plans/route.ts`):**
- Fallback to hardcoded OUTPATIENT_PLANS when Supabase query fails
- Alternate ICD-10 code matching — `diagnosisToIcd10Map` stores arrays of all codes (primary + alternates)
- `codesMatch()` helper with prefix-aware matching
- `?planKey=` parameter for direct plan lookup
- `?search=` parameter for keyword search across title, ICD-10, and scope

**Saved Plans API:**
- `GET /api/saved-plans` — list saved plans for current user
- `POST /api/saved-plans` — create with 10-plan soft limit
- `GET/PUT/DELETE/PATCH /api/saved-plans/[id]` — CRUD + usage tracking

**Diagnosis Search Enhancements (`src/lib/diagnosisData.ts`):**
- Added `DIAGNOSIS_SYNONYMS` map with 60+ clinical abbreviations (tia, ms, gbs, als, mg, nmo, pd, rls, mci, etc.)
- `searchDiagnoses()` now checks synonym map first, then searches name, ICD-10, AND diagnosis ID

**SmartRecommendationsSection.tsx:**
- Imports canonical ordering from recommendationOrdering.ts
- Save/Load UI (disk/folder icons) with inline dialogs
- Plan search bar (always visible, debounced 300ms)
- Saved plans state and API integration

**New Files (7):**
- `supabase/migrations/013_clinical_plans_and_saved_plans.sql`
- `src/lib/recommendationOrdering.ts`
- `src/lib/savedPlanTypes.ts`
- `src/app/api/plans/seed/route.ts`
- `src/app/api/saved-plans/route.ts`
- `src/app/api/saved-plans/[id]/route.ts`
- `scripts/plan-overrides.json`

**Modified Files (4):**
- `src/app/api/plans/route.ts` — fallback, ICD-10 matching, search, planKey lookup
- `src/components/SmartRecommendationsSection.tsx` — ordering, save/load, search UI
- `src/lib/diagnosisData.ts` — synonym search
- `src/lib/database.types.ts` — clinical_plans and saved_plans type definitions
- `scripts/sync-plans.ts` — ICD-10 parsing fix, overrides mechanism

### Enriched Patient Context for AI Historian
Upgraded the SQL function and data pipeline so the AI Historian receives richer clinical context during follow-up interviews.

**Database (Migration 012):**
- `get_patient_context_for_portal` now returns 3 new columns: `last_note_allergies`, `last_note_ros`, `active_diagnoses`
- `active_diagnoses` aggregates from `diagnoses` table via the latest completed visit (format: "description (ICD-10), ...")
- Function was DROP + CREATE (PostgreSQL cannot change return type via CREATE OR REPLACE)
- GRANT EXECUTE re-applied for anon + authenticated roles

**API Route Changes (`/api/patient/context`):**
- Removed aggressive truncation (HPI was capped at 500 chars, assessment at 300 chars) — full text now passed through
- Added `allergies`, `diagnoses`, `lastNoteSummary` to JSON response

**TypeScript (`PatientContext` interface):**
- Added `allergies: string | null`, `diagnoses: string | null`, `lastNoteSummary: string | null`

**Component (`NeurologicHistorian.tsx`):**
- Context string builder now includes active diagnoses, allergies, and prior visit summary
- Each section only included when data is non-null

**Modified Files (4):** 012_enrich_patient_context.sql (new), historianTypes.ts, patient/context/route.ts, NeurologicHistorian.tsx

### Patient-Centric AI Historian - NEW
Upgraded the AI Historian from hardcoded demo scenarios to real patient data.

**Patient Portal Changes:**
- Historian tab shows real patients fetched from Supabase via `get_patients_for_portal` RPC
- "Add New Patient" inline form creates patients via `portal_register_patient` RPC
- Patient selection navigates to `/patient/historian?patient_id=<uuid>`
- Prior visit context (HPI, assessment, plan) loaded via `get_patient_context_for_portal` RPC
- Session type auto-derived: follow-up if prior visit exists, new_patient otherwise
- Demo scenarios moved to collapsible "Or try a demo scenario" section

**Physician View Changes:**
- `dashboardData.ts` historian query joins with `patients` table
- `HistorianSessionPanel` displays real patient name from join data when available
- Sessions without `patient_id` (legacy demo sessions) still display correctly

**Database (Migration 011):**
- `patient_id UUID` FK added to `historian_sessions` (nullable, ON DELETE SET NULL)
- `referral_reason TEXT` and `referring_physician TEXT` added to `patients`
- 3 SECURITY DEFINER RPC functions for unauthenticated portal access
- Anon RLS policies on `historian_sessions` for portal saves

**New API Routes:**
- `GET /api/patient/patients` - List patients for portal
- `GET /api/patient/context?patient_id=` - Patient name, referral, last visit/note data, allergies, diagnoses, AI summary
- `POST /api/patient/register` - Register new patient using demo physician's user_id

**Modified Files (7):** historianTypes.ts, useRealtimeSession.ts, historian/save/route.ts, NeurologicHistorian.tsx, PatientPortal.tsx, dashboardData.ts, HistorianSessionPanel.tsx

### QA Framework - NEW
Added `qa/` folder with versioned test infrastructure.

- `qa/TEST_RUNBOOK.md` (v1.0) - Stable baseline: smoke suite (S1-S5), regression flows (A-F), mobile-first checks, role-based matrix, tooling guidance
- `qa/TEST_CASES.yaml` (v1.0) - 35 structured test cases with IDs, preconditions, steps, expected results
- `qa/BUG_TEMPLATE.md` - Repro steps, expected/actual, environment, logs
- `qa/RELEASE_CHECKLIST.md` - Pre-deploy (9 checks), deploy (3), post-deploy (7), rollback plan
- `qa/runs/RUN_TEMPLATE.md` - Per-release mission brief + result log
- `qa/runs/RUN-2026-01-30-001.md` - First run: Smoke 5/5 PASS, Focus 5/7 PASS, 0 bugs, verdict GO

### AI Neurologic Historian - PREVIOUSLY ADDED
Voice-based patient intake interview system using OpenAI Realtime API over WebRTC.

**Architecture:**
- Client connects directly to OpenAI via WebRTC (no WebSocket server needed)
- Server issues ephemeral token via `/api/ai/historian/session` (one REST call)
- Fully Vercel-compatible deployment

**Patient-Facing Features:**
- Full-screen voice interview UI at `/patient/historian`
- 4 demo scenarios: headache referral, seizure eval, migraine follow-up, MS follow-up
- New patient flow: OLDCARTS symptom characterization, meds, PMH, family/social hx, ROS
- Follow-up flow: interval changes, treatment response, new symptoms, functional status
- Animated voice orb (teal=AI speaking, purple=patient speaking)
- Streaming transcript display with collapsible history
- Safety escalation overlay with emergency resources (911, 988 Suicide Hotline, Crisis Text Line)
- AI Historian tab added to PatientPortal

**Physician-Facing Features:**
- HistorianSessionPanel in LeftSidebar with expandable session cards
- Sub-tabs: Summary, Structured Data, Transcript
- Red flag banners with severity indicators (high/medium/low)
- Safety escalation alerts for flagged sessions
- "Import to Note" button maps structured output to clinical note fields

**Technical:**
- `useRealtimeSession` hook manages full WebRTC lifecycle
- `buildHistorianSystemPrompt()` constructs interview instructions
- `save_interview_output` tool definition for structured JSON extraction
- `historian_sessions` table (migration 010) with JSONB columns
- Safety keyword monitoring as secondary defense layer
- Model: `gpt-4o-realtime-preview` with `verse` voice, server VAD

**New Files (10):**
- `src/lib/historianTypes.ts` - TypeScript interfaces and demo scenarios
- `src/lib/historianPrompts.ts` - System prompts and tool definitions
- `src/hooks/useRealtimeSession.ts` - WebRTC lifecycle hook
- `src/components/NeurologicHistorian.tsx` - Patient voice interview UI
- `src/components/HistorianSessionComplete.tsx` - Post-interview screen
- `src/components/HistorianSessionPanel.tsx` - Physician session viewer
- `src/app/api/ai/historian/session/route.ts` - Ephemeral token endpoint
- `src/app/api/ai/historian/save/route.ts` - Session save/list endpoint
- `src/app/patient/historian/page.tsx` - Historian page route
- `supabase/migrations/010_historian_sessions.sql` - Database migration

**Modified Files (5):**
- `src/components/PatientPortal.tsx` - Added AI Historian tab
- `src/lib/dashboardData.ts` - Fetch historian sessions
- `src/components/ClinicalNote.tsx` - Import handler, pass to sidebar
- `src/components/LeftSidebar.tsx` - Render HistorianSessionPanel
- `src/app/physician/page.tsx` + `src/app/dashboard/page.tsx` - Pass sessions prop

---

## Previous Updates (January 25, 2026)

### OpenAI Model Optimization
Optimized all AI API endpoints for best cost/performance:

**Simple Tasks (gpt-4o-mini - $0.15/$0.60 per 1M tokens):**
- `/api/ai/ask` - General Q&A
- `/api/ai/chart-prep` - Summarization
- `/api/ai/transcribe` - Text cleanup
- `/api/ai/field-action` - Improve/Expand/Summarize

**Complex Tasks (gpt-5 - $1.25/$10 per 1M tokens):**
- `/api/ai/visit-ai` - Clinical extraction from visit transcripts
- `/api/ai/scale-autofill` - Scale data extraction from patient data
- `/api/ai/synthesize-note` - Note synthesis and merging

**Cost Savings:**
- Simple tasks: ~93% cheaper than previous gpt-4
- Complex tasks: ~50% cheaper input vs gpt-4o, better reasoning with GPT-5

---

## Previous Updates (January 24, 2026)

### Additional Clinical Scales
Added four new clinical assessment scales with full diagnosis linkage:

**Exam-Driven Scales (Physical Exams tab):**
- **UPDRS Motor (Part III)** - 33-item Unified Parkinson's Disease Rating Scale motor examination
  - Comprehensive motor assessment: speech, facial expression, rigidity (5 locations), finger tapping, hand movements, leg agility, gait, postural stability, tremor
  - Scoring ranges: Minimal (0-10), Mild (11-25), Moderate (26-50), Moderately Severe (51-80), Severe (81-132)
  - Alerts for postural instability and severe freezing of gait
- **Hoehn & Yahr** - Parkinson's disease staging scale (0-5)
  - Stages from no signs to wheelchair/bedridden
  - Captures side initially affected and predominant symptoms (tremor-dominant vs PIGD)
- **EDSS** - Expanded Disability Status Scale for MS (0-10)
  - Functional system scores: pyramidal, cerebellar, brainstem, sensory, bowel/bladder, visual, cerebral
  - Ambulation scoring integrated
  - Alerts for rapid progression and severe disability

**History-Driven Scales (History tab):**
- **CHA₂DS₂-VASc** - Stroke risk in atrial fibrillation (0-9)
  - Calculates stroke risk for anticoagulation decisions
  - Factors: CHF, hypertension, age, diabetes, stroke history, vascular disease, sex
  - Annual stroke risk percentages per score

**Diagnosis-Scale Linkages Added:**
- Parkinson disease → UPDRS Motor, Hoehn & Yahr, MoCA, PHQ-9, ESS
- Parkinsonism, PSP, MSA → Hoehn & Yahr, MoCA
- Multiple sclerosis, MS follow-up, MS relapse → EDSS, PHQ-9, MoCA
- Neuromyelitis optica, CIS → EDSS, PHQ-9
- Atrial fibrillation, atrial flutter → CHA₂DS₂-VASc
- Cardioembolic stroke, cryptogenic stroke → CHA₂DS₂-VASc, NIHSS, MoCA
- Post-stroke spasticity → Modified Ashworth, NIHSS, MoCA

### AI Scale Autofill - NEW
Intelligent data extraction from ALL patient data sources to pre-populate scale responses:

**API Endpoint:** `/api/ai/scale-autofill`
- Uses **GPT-5** (latest model) with very low temperature (0.1) for consistent extraction
- Analyzes ALL available patient data:
  - **Demographics**: Age, sex (used directly for scales like CHA₂DS₂-VASc)
  - **Vital Signs**: Blood pressure (flags hypertension automatically)
  - **Diagnoses**: Checks for CHF, diabetes, stroke/TIA, vascular disease, AFib
  - **Medications**: Infers conditions from med list (diabetes meds → diabetes, etc.)
  - **Medical History**: Full history content
  - **Clinical Text**: HPI, exam notes, dictation
- Conservative approach: only extracts explicitly stated information
- Never hallucinates or guesses missing data

**Intelligent Condition Detection:**
- Automatically flags age thresholds (≥65, ≥75) relevant for stroke risk
- Parses blood pressure to detect hypertension (≥140/90)
- Recognizes medications that imply conditions:
  - Diabetes meds (metformin, insulin, etc.) → diabetes
  - Antihypertensives → hypertension
  - Anticoagulants → notes anticoagulation status
  - Parkinson's meds → movement disorder

**Features:**
- **Confidence Scoring** - Each extracted answer marked as high/medium/low confidence
- **Reasoning Display** - Shows AI's justification citing data source (demographics/vitals/diagnoses/meds/text)
- **Missing Info Detection** - Lists questions that couldn't be answered from ANY source
- **Suggested Prompts** - AI-generated questions to ask patient for missing data
- **Visual Feedback** - AI-filled fields highlighted with teal background
- **Validation** - Ensures extracted values match scale question types and valid options

**UI Integration:**
- "AI Auto-fill from Notes" button in ScaleForm when clinical text available
- Disabled state when no clinical text to analyze
- Expandable details showing confidence breakdown
- Works in both ExamScalesSection and SmartScalesSection

**Safety:**
- Demographics used with HIGH confidence for age/sex questions
- Diagnoses list = HIGH confidence, medication-implied = MEDIUM confidence
- Conservative option selection when ambiguous in clinical text
- Respects examiner documentation for physical findings

### Responsive/Mobile Design - NEW
- **Viewport Meta Tag** - Added to layout.tsx for proper mobile scaling
- **CSS Breakpoints** - Three-tier system:
  - Mobile (< 640px): Slide-in sidebar overlay, full-screen drawers, hamburger menu
  - Tablet (640px - 1024px): Reduced padding/widths, narrower sidebar
  - Desktop (> 1024px): Standard layout with all elements visible
- **TopNav Mobile** - Hamburger menu toggle, queue pills hidden, compact timer
- **LeftSidebar Mobile** - Slide-in overlay with backdrop, closes on backdrop click
- **All Drawers** - Full-screen on mobile (maxWidth: 100vw)
- **IconSidebar** - Hidden on mobile to maximize space
- **Touch Enhancements** - 44px minimum tap targets, active states instead of hover
- **Print Styles** - Hide navigation, full-width content for clean printing

### Dark Mode Form Fixes - NEW
- **Physical Exam Section** - All textarea and select elements now use CSS variables
- **Global Form Overrides** - Added `[data-theme="dark"]` rules for input/textarea/select
- **Placeholder Colors** - Properly uses `--text-muted` in dark mode

### Onboarding Tour - NEW
- **OnboardingTour Component** - Interactive 9-step tour highlighting key features
- **SVG Spotlight Mask** - Visual highlight effect for tour elements
- **data-tour Attributes** - Added to key elements for tour targeting
- **Persistence** - Completion saved to localStorage (`sevaro-onboarding-complete`)
- **Replay Options** - Can be triggered from Settings Drawer or Ideas Drawer Tour tab

### Ideas/Getting Started Drawer - NEW
- **IdeasDrawer Component** - Accessed via lightbulb icon in TopNav
- **Tabs**: Workflows, Tour, Features, Feedback
- **Workflows Tab** - Informational workflow styles (no persistence)
- **Tour Tab** - "Launch Interactive Tour" button
- **Features Tab** - Feature list and descriptions
- **Feedback Tab** - User feedback form

### TopNav Enhancements
- **Timer Dropdown** - Pause/Resume controls, Reset button, Billing code selector (MD2, MD3, 99213-99215)
- **Lock Screen** - Full-screen PHI protection overlay with unlock button
- **Notifications Panel** - Sample notifications with alert/message/task/system types, read/unread states, Mark all read
- **What's New Panel** - Version history with release notes for recent features

### Comprehensive Note Generation - NEW
- **EnhancedNotePreviewModal** - Complete replacement for basic note preview
- **Note Type Selection** - New Consult vs Follow-up with different layouts
- **Note Length Preferences** - Concise, Standard, Detailed formatting options
- **All Data Sources Collated**:
  - AI Chart Prep output
  - Visit AI transcription
  - Manual clinical entries
  - Clinical scales (with scores and interpretations)
  - Differential diagnoses (with ICD-10 codes)
  - Imaging results (with findings)
  - Physical exam findings (checkbox-generated text)
  - Smart Recommendations
- **Section-by-Section Approval** - Verify each section before signing
- **Final Note Preview** - Formatted EHR-ready text with one-click copy
- **Word Count Display** - Track note length in real-time

### Phase 2 & 3A Completion
- Smart Recommendations with 67 plans synced from neuro-plans (see Smart Recommendations Expansion above)
- Field AI Actions (/api/ai/field-action) with GPT-4 integration
- Settings Drawer with AI custom instructions
- 7 new clinical scales added (NIHSS, MAS, ABCD2, DHI, Mini-Cog, ISI, ESS)
- Exam template feature with predefined and custom templates
- Compact chip-based exam scale selection

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
| Smart Recommendations | COMPLETE | SmartRecommendationsSection.tsx | 67 plans, ordering, saved plans, search |

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
| AI Historian (Voice) | COMPLETE | NeurologicHistorian.tsx | WebRTC real-time voice |
| Historian Patient Context | COMPLETE | NeurologicHistorian.tsx | Real patients, prior visit context |
| Historian Patient Picker | COMPLETE | PatientPortal.tsx | Patient list, add patient, demo fallback |
| Historian Patient FK | COMPLETE | migration 011 | patient_id links sessions to patients |
| Historian Session Panel | COMPLETE | HistorianSessionPanel.tsx | Physician review/import, real names |

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
| Mobile slide-in overlay | COMPLETE | - | With backdrop click to close |
| AI Historian sessions | COMPLETE | HistorianSessionPanel.tsx | With import-to-note |

### Responsive Design

| Feature | Status | Component | Notes |
|---------|--------|-----------|-------|
| Viewport meta tag | COMPLETE | layout.tsx | Mobile scaling |
| Mobile breakpoint (<640px) | COMPLETE | globals.css | Slide-in sidebar, full drawers |
| Tablet breakpoint (640-1024px) | COMPLETE | globals.css | Reduced padding |
| Desktop breakpoint (>1024px) | COMPLETE | globals.css | Standard layout |
| Hamburger menu | COMPLETE | TopNav.tsx | Mobile sidebar toggle |
| Touch enhancements | COMPLETE | globals.css | 44px tap targets |
| Print styles | COMPLETE | globals.css | Clean document output |

### Onboarding & Help

| Feature | Status | Component | Notes |
|---------|--------|-----------|-------|
| Onboarding Tour | COMPLETE | OnboardingTour.tsx | 9-step interactive tour |
| Ideas Drawer | COMPLETE | IdeasDrawer.tsx | Workflows, Tour, Features, Feedback |
| Tour replay | COMPLETE | Settings/IdeasDrawer | Can replay from either location |
| Dark mode support | COMPLETE | globals.css | Form elements properly themed |

### Dot Phrases

| Feature | Status | Component | Notes |
|---------|--------|-----------|-------|
| Drawer UI | COMPLETE | DotPhrasesDrawer.tsx | Search, filter |
| Field scoping | COMPLETE | - | Field-specific phrases |
| CRUD operations | COMPLETE | /api/phrases | Full API |
| Usage tracking | COMPLETE | - | Count updates |
| Inline trigger | COMPLETE | NoteTextField.tsx | Lightning button |
| **Pre-built Library** | COMPLETE | /api/phrases/seed | 70+ neurology phrases |

**Pre-built Phrase Categories (70+ phrases):**
- General: .wnl, .nfnd, .deny, .educated, .stable, .improved
- Allergies: .nkda, .nka, .pcnallergy, .sulfa
- Physical Exam: .neuroexam, .neurobrief, .mentalstatus, .cranialnerves, .motorexam, .sensoryexam, .reflexes, .coordination, .gait
- ROS: .rosneg, .rosneuro, .rosbrief
- Headache: .migraine, .migraineha, .haplan, .haflags, .moh, .tensionha
- Seizure: .seizure, .szplan, .szdescribe, .firstsz, .szfree
- Movement: .parkinson, .pdplan, .tremor, .dystonia
- Stroke: .stroke, .strokeplan, .tia
- MS: .ms, .msplan, .msrelapse
- Cognitive: .dementia, .dementiaplan, .mci
- Neuromuscular: .neuropathy, .neuroplan, .myasthenia, .mgplan
- Sleep: .sleepapnea, .insomnia, .sleephygiene, .rls
- Follow-up: .fu1wk, .fu2wk, .fu1mo, .fu3mo, .fu6mo, .fuprn
- Orders: .labs, .mri, .mrispine, .eeg, .emg, .ptref, .otref, .stref
- Return Precautions: .returnha, .returnstroke, .returnsz

---

## Files Structure

```
src/
├── app/
│   ├── globals.css            # Global styles + responsive breakpoints
│   ├── layout.tsx             # Root layout with viewport meta
│   └── api/
│       ├── ai/
│       │   ├── ask/route.ts       # Ask AI endpoint
│       │   ├── chart-prep/route.ts # Chart Prep AI endpoint
│       │   ├── field-action/route.ts # Improve/Expand/Summarize
│       │   ├── historian/         # AI Neurologic Historian
│       │   │   ├── session/route.ts # Ephemeral token for WebRTC
│       │   │   └── save/route.ts  # Save/list sessions (+ patient_id)
│       │   ├── transcribe/route.ts # Whisper transcription
│       │   └── visit-ai/route.ts  # Visit AI processing
│       ├── plans/
│       │   ├── route.ts           # Clinical plans API (list, search, by diagnosis/key)
│       │   └── seed/route.ts      # Seed plans from hardcoded data
│       ├── saved-plans/
│       │   ├── route.ts           # Saved plans list + create
│       │   └── [id]/route.ts      # Saved plans CRUD + usage tracking
│       └── patient/
│           ├── patients/route.ts  # List patients for portal (RPC)
│           ├── context/route.ts   # Patient context for historian (RPC)
│           └── register/route.ts  # Register new patient (RPC)
├── components/
│   ├── AiDrawer.tsx           # AI Assistant (Ask AI, Summary, Handout)
│   ├── AiSuggestionPanel.tsx  # AI suggestion component
│   ├── CenterPanel.tsx        # Main content with tabs
│   ├── ClinicalNote.tsx       # State management + generateNote
│   ├── DifferentialDiagnosisSection.tsx # Diagnosis with ICD-10
│   ├── DotPhrasesDrawer.tsx   # Dot phrases panel
│   ├── EnhancedNotePreviewModal.tsx # Comprehensive note generation
│   ├── ExamScalesSection.tsx  # Exam-driven scales (NIHSS, etc.)
│   ├── HistorianSessionComplete.tsx # Post-interview success screen
│   ├── HistorianSessionPanel.tsx # Physician historian session viewer
│   ├── NeurologicHistorian.tsx # Patient voice interview UI
│   ├── IdeasDrawer.tsx        # Getting Started/Help drawer
│   ├── ImagingResultsTab.tsx  # Imaging tab
│   ├── LeftSidebar.tsx        # Patient info, visits, scores (responsive)
│   ├── NoteTextField.tsx      # Text field with buttons
│   ├── OnboardingTour.tsx     # Interactive 9-step tour
│   ├── PatientHistorySummary.tsx # AI longitudinal patient summary
│   ├── ReasonForConsultSection.tsx # Two-tier consult
│   ├── SettingsDrawer.tsx     # User settings with AI instructions
│   ├── SmartRecommendationsSection.tsx # Treatment recommendations
│   ├── SmartScalesSection.tsx # Clinical scales
│   ├── TopNav.tsx             # Navigation header (responsive)
│   └── VoiceDrawer.tsx        # Voice & Dictation
├── hooks/
│   ├── useRealtimeSession.ts  # WebRTC hook for OpenAI Realtime API
│   └── useVoiceRecorder.ts    # Pause/resume recording
└── lib/
    ├── diagnosisData.ts       # 134 diagnoses with ICD-10 + synonym search
    ├── historianTypes.ts      # AI Historian TypeScript types
    ├── historianPrompts.ts    # AI Historian system prompts
    ├── recommendationOrdering.ts # Canonical section/subsection ordering
    ├── savedPlanTypes.ts      # Saved plan TypeScript interfaces
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
| Link diagnoses to treatment recommendations | **COMPLETE** | High |
| 67 plans synced from neuro-plans GitHub repo | **COMPLETE** | High |
| Checkbox-based recommendation selection per diagnosis | **COMPLETE** | High |
| SmartRecommendationsSection component | **COMPLETE** | High |
| Priority badges (STAT/URGENT/ROUTINE/EXT) | **COMPLETE** | Medium |
| Add selected items to Plan textarea | **COMPLETE** | High |
| Canonical subsection ordering (Essential first) | **COMPLETE** | High |
| Keyword-based Treatment tier sorting | **COMPLETE** | High |
| Saved plans (save/load per user, 10-plan limit) | **COMPLETE** | Medium |
| Plan search by keyword | **COMPLETE** | Medium |
| Diagnosis synonym/abbreviation search (60+ terms) | **COMPLETE** | Medium |
| Alternate ICD-10 code matching | **COMPLETE** | High |
| Plan overrides mechanism for sync | **COMPLETE** | Medium |
| ICD-10 parsing fix (markdown source format) | **COMPLETE** | High |
| Expand to all 134 diagnoses | **PARTIAL** | Medium — 67/134, ~90 more to build |

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
| Improve Writing | Fields | **COMPLETE** | /api/ai/field-action with anti-hallucination |
| Expand Details | Fields | **COMPLETE** | /api/ai/field-action with safety prompts |
| Summarize | Fields | **COMPLETE** | /api/ai/field-action |

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
| Settings Drawer | **COMPLETE** (SettingsDrawer.tsx) |
| Call volume/ringtone | NOT BUILT |
| Dark mode (on/off/system) | **COMPLETE** |
| Font size settings | **COMPLETE** |
| Documentation style preference | **COMPLETE** (concise/detailed/narrative) |
| Terminology preference | **COMPLETE** (formal/standard/simplified) |
| **AI Custom Instructions (global)** | **COMPLETE** |
| **AI Custom Instructions (per-section)** | **COMPLETE** (HPI, ROS, Assessment, Plan, Physical Exam) |
| Settings persistence | **COMPLETE** (localStorage) |

---

### Phase 3B: Feature Enhancements (Medium Priority)

#### 5. Note Generation Pipeline

| Feature | Status |
|---------|--------|
| **Comprehensive data collation** | **COMPLETE** (EnhancedNotePreviewModal) |
| Note type selection (New Consult/Follow-up) | **COMPLETE** |
| Note length preference (Concise/Standard/Detailed) | **COMPLETE** |
| Note assembly from all sources | **COMPLETE** (merge engine + modal) |
| Scales integration | **COMPLETE** |
| Diagnoses with ICD-10 | **COMPLETE** |
| Imaging/Labs integration | **COMPLETE** |
| Physical exam text generation | **COMPLETE** |
| Preview/Edit modal | **COMPLETE** |
| Section-by-section verification | **COMPLETE** |
| Recommendations verification checklist | **COMPLETE** |
| Source tracking (Manual/AI/Recs/Scales/Imaging) | **COMPLETE** |
| Final note preview (EHR-ready) | **COMPLETE** |
| Copy to clipboard | **COMPLETE** |
| Word count display | **COMPLETE** |
| Suggested improvements section | NOT BUILT |
| "Ask AI about this note" button | NOT BUILT |
| Sign & Complete flow | **COMPLETE** |

#### 6. Physical Exam Enhancements

| Feature | Status |
|---------|--------|
| Free-text exam option | **COMPLETE** | Structured/Free-text pill toggle, NoteTextField for narrative |
| **NIH Stroke Scale (NIHSS)** | **COMPLETE** (full 15-item version) |
| Modified Ashworth Scale | **COMPLETE** (spasticity) |
| Modified Rankin Scale | NOT BUILT |
| Exam Templates | **COMPLETE** (5 predefined + custom) |
| Exam Scales Section (compact chips) | **COMPLETE** |

#### 7. Patient History Section (Above Reason for Consult)

| Feature | Status |
|---------|--------|
| Longitudinal AI summary paragraph | **COMPLETE** (PatientHistorySummary.tsx) |
| Length control (brief/standard/detailed) | **COMPLETE** |
| Manual editing | **COMPLETE** (click to edit after generation) |
| Customization settings | NOT BUILT |

---

### Phase 3C: Onboarding & Workflows (Lower Priority)

#### 8. Help Drawer (Top-Left Lightbulb) - COMPLETE

| Tab | Status | Description |
|-----|--------|-------------|
| Workflows | **COMPLETE** | Informational workflow styles |
| Tour | **COMPLETE** | "Launch Interactive Tour" button |
| Features | **COMPLETE** | Feature list with descriptions |
| Feedback | **COMPLETE** | User feedback form |

**Additional Features:**
- OnboardingTour component with 9-step interactive walkthrough
- SVG spotlight mask for visual highlighting
- Completion persistence via localStorage
- Replay option from Settings Drawer

#### 9. Suggested Workflows - COMPLETE

| Workflow | Description | Status |
|----------|-------------|--------|
| **Fully AI-Driven** | Dictate → AI generates all → Review | **COMPLETE** |
| **Fully Manual** | Click through → Type manually | **COMPLETE** |
| **Hybrid Lightweight** | AI pre-fills → Manual completion | **COMPLETE** |
| **Hybrid Advanced** | Selective AI per section | **COMPLETE** |

**Workflow Documentation Features:**
- Quick selection guide ("Which Style Should I Use?")
- Scenario-based recommendations (new users, busy clinic, complex cases)
- Key buttons listed per workflow
- Typical time estimates
- Step-by-step instructions
- Edit priority explanation (manual edits always take precedence)

**Workflow Precedence Rules (documented):**
- Manual edits always override AI content
- User-typed content protected from AI overwrite
- Chart Prep = suggested until explicitly added

---

### Other Enhancements

- Real-time transcription (currently post-recording only)
- Speaker diarization in UI
- Audio playback for review
- Confidence indicators in generated note
- AI Suggestion Panel integration with text fields

---

## Technical Debt / Known Issues

1. ~~**Audio routing**~~ - Fixed: Safari MIME types, file size validation, retry with stored blob, maxDuration=120
2. **Three voice recorder instances** - AiDrawer/VoiceDrawer could optimize
3. **No audio storage** - Audio processed and discarded

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

### AI Historian Flow

```
PATIENT-CENTRIC FLOW:
[Portal] → GET /api/patient/patients → Patient list
         → Select patient → GET /api/patient/context?patient_id=
         → Derives session type (new_patient / follow_up)
         → Builds patientContext string (name, referral, diagnoses, allergies, prior HPI/assessment/plan/summary)

INTERVIEW FLOW:
[Start Interview] → POST /api/ai/historian/session (with patientContext)
                  → Ephemeral Token → RTCPeerConnection + DataChannel
                  → OpenAI Realtime API (context-aware greeting)
                  → Voice conversation (server VAD, Whisper transcription)
                  → AI calls save_interview_output tool → Structured JSON
                  → POST /api/ai/historian/save (with patient_id FK)
                  → historian_sessions table

DEMO SCENARIO FLOW (unchanged):
[Select Scenario] → /patient/historian?scenario=<id> → Same interview flow without patient_id

PHYSICIAN REVIEW FLOW:
[Login] → fetchDashboardData() → historian_sessions JOIN patients query
        → LeftSidebar → HistorianSessionPanel (real patient name from join)
        → Expand session → Summary / Structured / Transcript tabs
        → "Import to Note" → Maps structured_output to noteData fields
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
*Last updated: January 30, 2026 (P1 Features — free-text exam, handout auto-suggest, patient history summary, audio hardening)*
