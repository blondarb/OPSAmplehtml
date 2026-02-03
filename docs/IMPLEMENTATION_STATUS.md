# Implementation Status - Sevaro Clinical

**Last Updated:** February 3, 2026 (Follow-up visit workflow, plan sync pipeline, ICD-10 matching, Sign & Complete fixes)
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

**Newly Completed (February 3, 2026):**
- ✅ **Follow-Up Visit Workflow (Round 1)** — View Full Note modal, Patient History Summary medication context, medication list fallback from prior visit text, sign route resilience
- ✅ **Follow-Up Visit Workflow (Round 2)** — View Full Note opens even when clinical_notes is null (shows AI summary fallback), tenant_id added to clinical_notes INSERT in PATCH and sign routes, vitals/examFreeText fields added to PATCH route, Patient History Summary sends full untruncated text to AI with explicit medication instructions, examFreeText propagated through patients API and ClinicalNote prior visits mapping
- ✅ **Plan-Diagnosis Matching Fix** — Scored ICD-10 matching replaces boolean prefix match; weighted scoring (exact=10, prefix=5, category=2) prevents false matches; diagnosis synonyms and consult map added
- ✅ **Clinical Plans Sync Pipeline** — 127 plans synced from neuro-plans repo to Supabase; ES module compatibility fix; duplicate draft plan exclusion (syncope-evaluation, vertigo-evaluation)
- ✅ **Sign & Complete Fixes** — Stale closure fix (handlePend returns visitId directly), OpenAI `max_tokens` → `max_completion_tokens` across 8 API routes, assessment generation gets full context
- ✅ **Plan Pill Click Fix** — SmartRecommendationsSection plan pills now respond to clicks correctly
- ✅ **History Summary Query Fix** — dashboardData.ts query corrected for score history

**Previously Completed (February 1, 2026):**
- ✅ **5 UX Improvements** - Consult sub-options visibility, tab completion dots, DDx edit affordances (priority/reorder/swap), recommendation plan adoption (select all, Added! confirm, plan flash), contextual exam scales (recommended filter + diagnosis context)
- ✅ **P0: Cross-Patient Data Contamination Fix** — `resetAllClinicalState()` wipes all clinical state on patient switch/sign; `isSwitchingPatientRef` guards async callbacks (Chart Prep, Visit AI, Historian import)
- ✅ **P0: Second Chart Prep Fix (F1)** — Marker-based replace (`--- Chart Prep ---` / `--- End Chart Prep ---`) prevents duplication; `noteDataRef` fixes stale closure in auto-process effect
- ✅ **P0: Tab Nav Z-Index Fix (F2)** — `.tab-nav-wrapper` raised to z-index 20; section pills to z-index 15; field action icons remain at z-index 10
- ✅ **Chart Prep Narrative Format (F9)** — API refactored to produce single paragraph summary instead of multi-section output
- ✅ **Copy Note Drawer (F11)** — Copy button now opens slide-out drawer showing formatted note
- ✅ **Exam Scale Tooltips (F12)** — Title attribute on scale buttons with hover explanation
- ✅ **Symptom-Based Diagnoses (F13)** — 10 symptom entries added to diagnosisData.ts (paresthesia, headache, tremor, dizziness, weakness, numbness, gait difficulty, memory complaints, spells/episodes, back pain)
- ✅ **Patient History Summary Context (F14)** — Referral note card for new patients
- ✅ **Imaging Longitudinal Tracking (F16)** — Array-based study tracking, prior studies, grouped dropdown
- ✅ **hasSmartPlan Sync** — 148/166 diagnoses now flagged `hasSmartPlan: true` (was only 6); matches 98 plans in Supabase `clinical_plans` table
- ✅ **Cervical Myelopathy ICD-10 Fix** — Corrected from G99.2 to M47.12 to match DB plan

**All Feedback Items Now Resolved:**
- ✅ **F4: Remove "Final recommendation time"** — Already removed (verified)
- ✅ **F5: Remove DDx search category filter pills** — Removed filter bar + dead searchCategory state
- ✅ **F6: Rename "Differential diagnosis" → "Diagnoses"** — Already renamed (verified)
- ✅ **F7: Remove mystery circle next to Gait** — Removed 8px teal dot from CenterPanel.tsx
- ✅ **F8: Remove "AI Summary" button in Chart Prep** — Already removed (verified)
- ✅ **F10: AI should not judge missing findings** — Guardrails added to visit-ai and synthesize-note prompts (chart-prep already had them)
- ✅ **F15: Sign & Complete full workflow** — Already implemented: writes to visits table, generates AI summary, ScheduleFollowupModal, appointments API (migration 016 pending DB apply)

**Previously Completed:**
- ✅ **Vital Signs Wiring** - BP/HR/Temp/Weight/BMI controlled inputs at top of Physical Exams tab; values saved to noteData, included in generated notes via merge engine
- ✅ **History Tab Section Navigation** - Sticky pill-bar (Summary/Consult/HPI/ROS/Meds/Allergies/History/Scales); IntersectionObserver tracks active section; smooth scroll on click
- ✅ **Medication Form Modal** - Add/edit medication form moved from inline to centered modal overlay; reduces scroll displacement in History tab
- ✅ **Dead Code Removal** - Removed ~260 lines of unused Prior History Summary from LeftSidebar (real implementation is PatientHistorySummary.tsx in CenterPanel)
- ✅ **Note Review (Suggested Improvements)** - AI-powered note analysis for consistency, completeness, quality issues; collapsible panel in Generate Note modal; auto-runs after AI synthesis; new `/api/ai/note-review` endpoint (gpt-4o-mini)
- ✅ **Ask AI About This Note** - Chat-like interface in Generate Note modal to ask questions about the generated note; full note context passed to AI; suggested question pills; conversation history
- ✅ **Medications & Allergies** - Full CRUD API, ~70-med neuro formulary with typeahead, allergy severity chips, sidebar summary, migration 014
- ✅ **Patient-Centric Historian** - Real patients from Supabase, prior visit context in interviews, patient_id FK linkage
- ✅ **QA Framework** - Test runbook, 35 structured test cases, release checklist, bug template, run log system
- ✅ **AI Neurologic Historian** - Voice-based patient intake via OpenAI Realtime API (WebRTC)
- ✅ **Pre-built Dot Phrases** - 70+ neurology phrases seeded (exams, assessments, plans per condition)
- ✅ **Workflow Documentation** - Quick selection guide, scenario recommendations, step-by-step guides
- ✅ **Additional Clinical Scales** - UPDRS Motor (Parkinson's), Hoehn & Yahr staging, EDSS (MS), CHA₂DS₂-VASc (stroke risk)
- ✅ **AI Scale Autofill** - Extracts scale data from clinical notes/dictation with confidence scoring

**Remaining (Lower Priority):**
- Expand Smart Recommendations plan coverage — 98 plans in DB covering 148/166 diagnoses (89%); 18 diagnoses still need plans

---

## Recent Updates (February 3, 2026) — Follow-Up Workflow & Plan Sync

### Session Summary (9 commits)

This session focused on making the end-to-end patient workflow reliable: appointment → visit → sign → follow-up → view prior visit. Also upgraded the clinical plans pipeline and fixed several API-level bugs.

### Follow-Up Visit Workflow (Round 1 & 2)

**Problem:** After signing a visit and navigating to the follow-up, three things were broken: the "View Full Note" modal wouldn't open, the Patient History Summary didn't mention medications from the prior visit, and ibuprofen from the prior visit wasn't showing in the medication list.

**Root Cause:** The prior visit was signed using old code that had a broken appointment FK join, leaving the clinical_notes record empty/missing. The modal required `cn` (clinical_notes) to be truthy, so it never opened.

**Fixes across 6 files:**

1. **LeftSidebar.tsx — View Full Note resilience** (`a600bd7`):
   - Modal gate changed from requiring `cn` to requiring `viewingVisitNote`
   - When note sections are empty, shows AI summary (if available) + "not available" message
   - Copy Note button handles null `cn` gracefully with AI summary fallback

2. **visits/[id]/route.ts (PATCH) — Missing fields + tenant_id** (`a600bd7`):
   - Added `vitals` and `examFreeText` field handlers (were being silently dropped)
   - Added `tenant_id` from `getTenantServer()` to clinical_notes INSERT
   - Added error logging on INSERT failure

3. **visits/[id]/sign/route.ts — tenant_id** (`3e16316`, `a600bd7`):
   - Direct clinical_notes lookup when join returns empty (bypasses FK issues)
   - Auto-creates clinical_notes if truly missing
   - Added `tenant_id` to INSERT

4. **PatientHistorySummary.tsx — Full medication context** (`3e16316`, `a600bd7`):
   - Removed `.substring(0, 200)` truncation on HPI, assessment, and plan
   - Standard/detailed mode instructions now explicitly request "all medications prescribed, current and from prior visits, along with treatment changes between visits"

5. **patients/[id]/route.ts — examFreeText** (`a600bd7`):
   - Added `examFreeText: visit.clinical_notes[0].exam_free_text` to transform

6. **ClinicalNote.tsx — Prior visits mapping** (`3e16316`, `a600bd7`):
   - Added medication list fallback from patient prop when API returns empty
   - Added `examFreeText` to prior visits clinical_notes mapping

### Plan Sync Pipeline & ICD-10 Matching

**1. Sync 127 Plans** (`d518f18`):
- `scripts/sync-plans.ts` upgraded to handle larger plan set from neuro-plans repo
- Updated `diagnosisData.ts` hasSmartPlan flags

**2. Plan-Diagnosis Linking Fix** (`0a6d532`):
- Added `DIAGNOSIS_SYNONYMS` and `CONSULT_TO_DIAGNOSIS_MAP` for better matching
- Fixed incorrect ICD-10 matches, added deduplication

**3. ES Module Fix** (`f3503f2`):
- `__dirname` → `fileURLToPath(import.meta.url)` for ES module compatibility

**4. Duplicate Draft Exclusion** (`8bee29e`):
- Excluded `syncope-evaluation` and `vertigo-evaluation` draft plans from sync

**5. Scored ICD-10 Matching** (`474ed74`):
- Replaced boolean prefix match with weighted scoring (exact=10, prefix=5, category=2)
- Prevents false positive matches across diagnosis families

### API & Sign Flow Fixes

**1. OpenAI max_tokens Migration** (`1beff32`):
- Changed `max_tokens` → `max_completion_tokens` across 8 API routes (OpenAI API breaking change)

**2. Sign & Complete Stale Closure** (`1beff32`):
- `handlePend()` now returns visitId directly, preventing `handleSignComplete` from reading stale state

**3. Assessment Full Context** (`481573b`):
- `/api/ai/generate-assessment` now receives full diagnosis data including ICD-10 codes

**4. Plan Pill Clicks** (`481573b`):
- Fixed SmartRecommendationsSection plan pills that weren't responding to clicks

**5. History Summary Query** (`481573b`):
- Fixed `dashboardData.ts` query for score history retrieval

**Modified Files (total across all commits):** 25 files changed, +690/-385 lines

---

## Recent Updates (February 1, 2026) — Bugfixes & Data Sync

### P0 Bugfixes

**1. Cross-Patient Data Contamination** (`ClinicalNote.tsx`):
- New `resetAllClinicalState()` function wipes ALL clinical state (noteData, chartPrep, visitAI, scales, diagnoses, imaging, exams, meds, allergies, drawers)
- Called in `handleBackToAppointments` (before switching view) and `handleSignComplete` (after saving note)
- `isSwitchingPatientRef` guard prevents stale async callbacks (Chart Prep, Visit AI, Historian import) from writing to wrong patient

**2. Second Chart Prep Corruption (F1)** (`VoiceDrawer.tsx`):
- Added `noteDataRef` to prevent stale closure in auto-process effect
- AI content wrapped in `--- Chart Prep ---` / `--- End Chart Prep ---` markers
- Subsequent chart prep runs strip existing markers before re-inserting (idempotent)
- Same marker pattern applied to `insertSection` function
- Removed `--- Pre-Visit Notes ---` block that duplicated raw dictation

**3. Tab Nav Z-Index Overlap (F2)** (`globals.css`, `CenterPanel.tsx`):
- `.tab-nav-wrapper` raised from z-index 10 to z-index 20
- Section pills raised from z-index 10 to z-index 15
- `.ai-textarea-icons` (field action buttons) remain at z-index 10
- Field action buttons no longer paint over sticky tab bar during scroll

### hasSmartPlan Sync & Plan Count Correction

- **98 plans** found in Supabase `clinical_plans` table (was documented as 67)
- Updated `hasSmartPlan: true` on 148 of 166 diagnoses in `diagnosisData.ts` (was only 6)
- Fixed cervical myelopathy ICD-10 code from G99.2 to M47.12 to match DB plan
- 18 diagnoses remain without plans: post-stroke-management, carotid-stenosis, headache-evaluation, thunderclap-headache, botulism, peroneal-neuropathy, plexopathy, tics-tourette, neurocysticercosis, hiv-neurocognitive, susac-syndrome, neuro-behcets, hashimotos-encephalopathy, nystagmus-evaluation, tinnitus-evaluation, symptom-paresthesia, symptom-headache, symptom-tremor

### Feedback Backlog Triage (F1-F16)

Items fixed in this session: F1, F2, F9, F11, F12, F13, F14 (partial), F16
Items still pending: F4, F5, F6, F7, F8, F10

**Modified Files:** `ClinicalNote.tsx`, `VoiceDrawer.tsx`, `CenterPanel.tsx`, `globals.css`, `diagnosisData.ts`

---

## Recent Updates (February 1, 2026) — UX Improvements

### 5 UX Improvements - NEW

**1. Consult Sub-Options Visibility** (`ReasonForConsultSection.tsx`):
- Auto-scrolls to sub-options when category selected (100ms delay + scrollIntoView)
- "(select details below)" hint text on selected category buttons
- Teal border highlight on sub-options area (1.5s CSS transition)
- Chevron arrow visual connector between category grid and sub-options

**2. Tab-Level Completion Indicators** (`CenterPanel.tsx`):
- useMemo computing per-tab completion: History (chief + HPI 25+ words), Imaging (any study data), Exam (any data/vitals), Recommendation (DDx + assessment 5+ words + plan 5+ words)
- 8px colored dots (green=complete, amber=partial) next to tab labels
- Hover tooltip showing missing fields per tab

**3. DDx Edit Affordances** (`DifferentialDiagnosisSection.tsx`):
- Numbered priority badges (1, 2, 3...) with "Primary" badge on first item
- Up/down arrow buttons for reordering diagnoses
- "Set primary" link on non-primary items
- "Refine" (items with alternates) or "Swap" (inline search to replace) on all items

**4. Smart Recommendation → Plan Adoption** (`SmartRecommendationsSection.tsx`, `CenterPanel.tsx`, `NoteTextField.tsx`):
- "Select all / Deselect all" toggle per subsection header
- Improved formatting: section headers + indented bullet items when adding to plan
- "Added!" confirmation with checkmark (2s timeout)
- Teal border glow flash on Plan textarea when items appended
- `data-field` attribute added to NoteTextField for DOM targeting

**5. Contextual Exam Scales** (`ExamScalesSection.tsx`, `CenterPanel.tsx`):
- `diagnosisNames` prop from differential diagnoses passed to ExamScalesSection
- Uses `getScalesForCondition()` to identify recommended exam scales
- "Recommended (N) / All (N)" filter toggle
- Recommended scales sorted first when showing all
- Teal dot indicator on recommended scale chips
- "Recommended for: [diagnosis list]" context banner

**Modified Files (6):** ReasonForConsultSection.tsx, CenterPanel.tsx, DifferentialDiagnosisSection.tsx, SmartRecommendationsSection.tsx, ExamScalesSection.tsx, NoteTextField.tsx (+560/-124 lines)

### User Feedback Backlog (February 1, 2026)

Feedback collected from live testing session. Organized by priority:

#### Bugs (Broken Behavior)

| # | Issue | Severity | Component | Status |
|---|-------|----------|-----------|--------|
| F1 | Second Chart Prep breaks the note | High | VoiceDrawer.tsx | ✅ FIXED — Marker-based replace + noteDataRef |
| F2 | Tab nav scrolls with content | High | CenterPanel.tsx | ✅ FIXED — z-index 20 on tab-nav-wrapper |
| F3 | Sign & Complete non-functional | High | CenterPanel.tsx | ✅ FIXED (prior commit) |
| — | Cross-patient data contamination | Critical | ClinicalNote.tsx | ✅ FIXED — resetAllClinicalState + async guards |

#### UI Cleanup (Quick Fixes)

| # | Issue | Component | Notes |
|---|-------|-----------|-------|
| F4 | Remove "Final recommendation time" section | CenterPanel.tsx | Not needed |
| F5 | Remove/fix category filter icons in DDx search | DifferentialDiagnosisSection.tsx | Makes searching harder; if kept, should show selectable diagnoses |
| F6 | Rename "Differential diagnosis" → "Diagnoses" | DifferentialDiagnosisSection.tsx | Simpler label |
| F7 | Remove mystery circle next to Gait exam | CenterPanel.tsx | Unexplained UI element |
| F8 | Remove "AI Summary" button in Chart Prep | VoiceDrawer.tsx | Keep only "Done" button |

#### Behavior Changes (Medium)

| # | Issue | Component | Notes |
|---|-------|-----------|-------|
| F9 | Chart Prep → single paragraph summary | VoiceDrawer.tsx / chart-prep API | ✅ FIXED — API refactored to narrative format |
| F10 | AI should not judge missing exam findings | AI prompts | ⏳ PENDING |
| F11 | Copy Note → slide-out drawer | CenterPanel.tsx | ✅ FIXED — showCopyDrawer added |
| F12 | Exam scale hover tooltips | ExamScalesSection.tsx | ✅ FIXED — title attribute on scale buttons |

#### Feature Additions (Larger)

| # | Issue | Component | Notes |
|---|-------|-----------|-------|
| F13 | Add symptom-based diagnoses | diagnosisData.ts | ✅ FIXED — 10 symptoms added (paresthesia, headache, tremor, dizziness, weakness, numbness, gait, memory, spells, back pain) |
| F14 | Patient History Summary context | PatientHistorySummary.tsx | ✅ PARTIAL — Referral note card for new patients; longitudinal follow-up TBD |
| F15 | Sign & Complete: full workflow | CenterPanel.tsx + API | ⏳ PENDING — Write to visits table, schedule follow-up |
| F16 | Imaging longitudinal tracking | ImagingResultsTab.tsx | ✅ FIXED — Array-based study tracking, prior studies, grouped dropdown |

---

## Recent Updates (January 31, 2026)

### 4 Critical UX Fixes

**1. Vital Signs Wiring** (`ClinicalNote.tsx`, `CenterPanel.tsx`, `types.ts`, `merge-engine.ts`):
- Added `vitals` field (`bp`, `hr`, `temp`, `weight`, `bmi`) to noteData state in ClinicalNote.tsx
- Added `vitals` to `ManualNoteData` interface in note-merge types
- Added "Vital Signs" section to merge engine output (formatted as `BP: 120/80 | HR: 72 | ...`)
- Replaced 4 uncontrolled inputs + dead Febrile/Afebrile buttons with 5 controlled inputs at top of Physical Exams tab

**2. History Tab Section Navigation** (`CenterPanel.tsx`):
- Added `useRef` + IntersectionObserver to track visible section
- Sticky pill-bar with 8 section buttons: Summary, Consult, HPI, ROS, Meds, Allergies, History, Scales
- `data-section` attributes on all History tab sections
- Active pill highlights with teal background; click scrolls smoothly to target section
- Pills only show in tab view (hidden in vertical/scroll view)

**3. Medication Form Modal** (`CenterPanel.tsx`):
- Extracted inline medication add/edit form into fixed-position centered modal overlay
- Same pattern as existing discontinue confirmation modal
- Formulary typeahead and all form fields preserved
- Medication list stays compact; no vertical displacement on form open

**4. Dead Code Removal** (`LeftSidebar.tsx`):
- Removed `DEFAULT_SUMMARY_OPTIONS` constant
- Removed 5 state variables, `generateHistorySummary` function, `toggleSummaryOption` function
- Removed ~260 lines of "Prior History Summary" JSX block
- Per-visit AI summaries and all other sidebar sections unchanged

**Modified Files (5):** `LeftSidebar.tsx` (-260 lines), `ClinicalNote.tsx` (+3 lines), `types.ts` (+2 lines), `merge-engine.ts` (+18 lines), `CenterPanel.tsx` (+80/-120 lines net)

---

## Recent Updates (January 30, 2026)

### 4 New Outpatient Clinical Scales + Patient Education Enhancements

**1. Four New Clinical Scales** (`scale-definitions.ts`, `scoring-engine.ts`):
- **HAS-BLED** (Bleeding Risk): 9 binary items (0-9), pairs with CHA₂DS₂-VASc for atrial fibrillation patients; history-based
- **DN4** (Neuropathic Pain): 7 interview + 3 physical exam items (0-10), ≥4 = neuropathic pain likely; exam-based (has physical exam component)
- **ODI** (Oswestry Disability Index): 10 sections (0-5 each), percentage scoring (0-100%); low back pain disability; history-based
- **NDI** (Neck Disability Index): 10 sections (0-5 each), percentage scoring (0-100%); neck disability; history-based
- Custom scoring engine updated for ODI/NDI percentage calculation: `Math.round((sum / (answeredCount * 5)) * 100)`
- `formatScaleResultForNote` appends `%` for ODI/NDI scores
- All 4 registered in ALL_SCALES, SCALE_LOCATION_MAP, and CONDITION_SCALE_MAPPINGS
- Condition mappings: HAS-BLED → AFib/flutter/cardioembolic/cryptogenic stroke; DN4 → peripheral/small fiber neuropathy, numbness/tingling, radiculopathy; ODI → back pain, radiculopathy; NDI → radiculopathy

**2. Practice Name Setting** (`SettingsDrawer.tsx`):
- New `practiceName` field in UserSettings interface with text input at top of AI & Documentation tab
- Persisted to localStorage via existing settings save mechanism
- Displayed on patient education handout headers when set

**3. Handout Language Selection** (`AiDrawer.tsx`):
- Free-text language input between reading level selector and Generate button
- Persisted to localStorage key `sevaro-handout-language`
- Language instructions injected into all 3 handout prompt paths (diagnosis-based, personalized, standard)
- Blank defaults to English

**4. Handout Print Formatting** (`AiDrawer.tsx`, `globals.css`):
- Practice name header shown above handout result when set
- Hidden print wrapper (`#handout-print-wrapper`) populated on Print click with practice name header, handout content, date footer
- Print CSS: full-width layout with proper margins (0.75in/1in), 12pt content, 18pt bold practice name, gray footer with date
- Action buttons hidden in print via `[data-no-print]` attribute

**5. Housekeeping**:
- Dot-prefix auto-expand marked as COMPLETE in roadmap (already implemented in NoteTextField.tsx)

**Modified Files (6):** `scoring-engine.ts` (+12 lines), `scale-definitions.ts` (+400 lines), `index.ts` (+4 lines), `SettingsDrawer.tsx` (+20 lines), `AiDrawer.tsx` (+80 lines), `globals.css` (+55 lines)

### Note Review & Ask AI About This Note

**1. Suggested Improvements (Note Review)** (`EnhancedNotePreviewModal.tsx`, `/api/ai/note-review`):
- New API endpoint `/api/ai/note-review` analyzes generated notes for consistency, completeness, and quality issues
- Uses gpt-4o-mini with temperature 0.3, JSON response format, max 6 prioritized suggestions
- Collapsible panel in review view with "Check Note" button and count badge
- Each suggestion has colored left border (amber=warning, teal=info), type badge pill, message text
- "Go to [section]" links scroll to and highlight the relevant section card (2s highlight with teal glow)
- Suggestions can be dismissed individually; zero-suggestions shows green checkmark
- Auto-triggers after AI Synthesis completes; also available manually via "Check Note"

**2. Ask AI About This Note** (`EnhancedNotePreviewModal.tsx`, `/api/ai/ask`):
- Chat-like interface in the Generate Note modal between content area and footer
- Full note text passed as `fullNoteText` context to existing `/api/ai/ask` endpoint
- 4 suggested question pills shown when no conversation history (billing codes, consistency, completeness, summary)
- Conversation displayed as right-aligned question bubbles and left-aligned answer bubbles with teal border
- Enter key sends; auto-scrolls to latest response
- Dark mode compatible using CSS variables throughout

**Modified Files (3):** `EnhancedNotePreviewModal.tsx` (+~250 lines), `/api/ai/note-review/route.ts` (new, ~90 lines), `/api/ai/ask/route.ts` (+3 lines)

### Reading Level Control & Dictation Expansion

**1. Reading Level Control for Handouts** (`AiDrawer.tsx`):
- Pill-style selector (Simple / Standard / Advanced) between condition dropdown and Generate button
- Simple = 5th grade reading level, no jargon; Standard = 8th grade with explained terms; Advanced = college level, full medical terminology
- Reading level instructions injected into all three handout prompt paths (diagnosis-based, personalized, standard condition)
- Selection persisted to localStorage key `sevaro-handout-reading-level`

**2. Dictation on Settings AI Instructions** (`SettingsDrawer.tsx`):
- Imported `useVoiceRecorder` hook with shared instance and `dictationTarget` state
- 24x24 red mic buttons at bottom-right of global AI instructions textarea and each section-specific textarea
- Transcribed text appends to the targeted field; "Transcribing..." indicator during processing
- Mic button turns solid red while recording, light red (#FEE2E2) when idle

**3. Dictation on TopNav Search** (`TopNav.tsx`):
- Imported `useVoiceRecorder` hook with controlled `searchValue` state
- 14px mic icon button inside search container (right side)
- Search bar border turns red during recording; placeholder shows "Listening..." / "Transcribing..."
- Transcribed text populates search field automatically

**Modified Files (3):** AiDrawer.tsx, SettingsDrawer.tsx, TopNav.tsx

### P1 Features
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
| ICD-10 codes | COMPLETE | diagnosisData.ts | 166 diagnoses with codes (134 conditions + 10 symptoms + 22 expanded) |
| Search picker | COMPLETE | - | Category filtering |
| Custom diagnosis entry | COMPLETE | - | Free text option |
| Smart Recommendations | COMPLETE | SmartRecommendationsSection.tsx | 98 plans in DB, 148/166 diagnoses covered, ordering, saved plans, search |

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
| Expand to all 166 diagnoses | **PARTIAL** | Medium — 98 plans in DB, 148/166 diagnoses covered (89%), 18 still need plans |

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
| Feedback form | Has mic | COMPLETE |
| Search fields | Has mic | COMPLETE |
| Settings inputs | Has mic | COMPLETE |

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
| Suggested improvements section | **COMPLETE** (note-review API + collapsible panel) |
| "Ask AI about this note" button | **COMPLETE** (chat interface in Generate Note modal) |
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
- Confidence indicators in generated note
- AI Suggestion Panel integration with text fields

---

## Technical Debt / Known Issues

1. ~~**Audio routing**~~ - Fixed: Safari MIME types, file size validation, retry with stored blob, maxDuration=120
2. **Three voice recorder instances** - AiDrawer/VoiceDrawer could optimize
3. ~~**No audio storage**~~ - By design: audio is processed and immediately discarded to avoid storing PHI
4. ~~**OpenAI max_tokens deprecation**~~ - Fixed Feb 3: migrated to `max_completion_tokens` across all 8 API routes
5. ~~**Sign & Complete stale closure**~~ - Fixed Feb 3: handlePend returns visitId directly
6. ~~**View Full Note fails on legacy data**~~ - Fixed Feb 3: modal now opens with AI summary fallback when clinical_notes is null
7. ~~**PATCH route missing vitals/examFreeText**~~ - Fixed Feb 3: both fields now handled in save
8. ~~**clinical_notes INSERT missing tenant_id**~~ - Fixed Feb 3: PATCH and sign routes now include tenant_id
9. **18 diagnoses without plans** - Lower priority: post-stroke-management, carotid-stenosis, headache-evaluation, thunderclap-headache, botulism, peroneal-neuropathy, plexopathy, tics-tourette, neurocysticercosis, hiv-neurocognitive, susac-syndrome, neuro-behcets, hashimotos-encephalopathy, nystagmus-evaluation, tinnitus-evaluation, symptom-paresthesia, symptom-headache, symptom-tremor
10. **Medication records only show structured data** - Medications mentioned in note text (e.g., ibuprofen in HPI) don't appear in the medication list unless added via the medication form. Expected behavior but could confuse demo viewers.

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
*Last updated: February 3, 2026 (Follow-up visit workflow, plan sync pipeline, ICD-10 matching, Sign & Complete fixes)*
