# Sevaro Clinical — Changelog

Full history of notable changes. For project overview and architecture, see [CLAUDE.md](../CLAUDE.md).

## April 2026

### Consult page feedback fixes (April 17, 2026)
Resolved 5 action items from tester feedback session `18250867-ca49-460c-bd85-df91dbdb3f55` (all reported on `/consult`).

- **Speaker phone audio cut-out (critical)**: AI voice was being cancelled when the user listened on speakerphone. Root cause was echo bleeding back into the mic and tripping server VAD into "user is speaking" interrupts. Raised `turn_detection.threshold` 0.5→0.65 and `silence_duration_ms` 700→1200 in `src/app/api/ai/historian/session/route.ts`. Added explicit `echoCancellation`/`noiseSuppression`/`autoGainControl` mic constraints and attached the remote `<audio>` element to the DOM (iOS Safari routing requirement) in `src/hooks/useRealtimeSession.ts`.
- **TTS cuts off mid-sentence (major)**: Same VAD tuning above — shorter pauses no longer trigger false end-of-turn, and echo bleed no longer interrupts the AI.
- **Mobile layout not optimized (major)**: Responsive padding on `/consult` container (24px → 12px <640px), compact `FeatureSubHeader` on mobile (hide "Home"/next-step labels <640px, title ellipsis, smaller padding), pipeline bar labels shrink <640px then hide <380px, actor side panel stacks below main <900px instead of crushing into a sidebar.
- **Questions/text cut off on mobile (major)**: Added `overflow-wrap: anywhere` + `word-break: break-word` to `EmbeddedHistorian` streaming text and transcript entries; responsive padding on `HistorianStepPanel`.
- **Auto-end chat session (minor)**: `useRealtimeSession` now exposes `interviewCompleted`, flipped when the AI calls `save_interview_output`. `EmbeddedHistorian` auto-calls `endSession()` 1.5s after the AI stops speaking post-completion, removing the need to press "End Interview".
- **Verification**: `tsc --noEmit` clean, `next build` clean. Live speakerphone/mobile verification deferred to production (Cognito OAuth doesn't allow localhost callbacks).

## March 2026

### Wearable Narrative Enhancements (March 5, 2026)
- **30-Day Longitudinal Summary**: "Generate 30-Day Summary" pill button in PatientTimeline header triggers longitudinal narrative generation via existing Edge Function pipeline; label switches to "Regenerate" after first generation
- **Narrative Regeneration**: Refresh icon buttons on ClinicalNarrativePanel and LongitudinalSummaryBanner allow re-generating any narrative; spinner during regeneration, hover accent color matching panel theme
- **Auto-Generation on Data Load**: After initial load, 15-minute poll refresh, or patient switch, any assessments (tremor, tapping, fluency) without narratives are automatically queued for sequential generation with progress indicator ("Auto-generating interpretations... 2/5")
- **Files**: Modified `ClinicalNarrativePanel.tsx`, `LongitudinalSummaryBanner.tsx`, `MotorTrack.tsx`, `CognitiveTrack.tsx`, `PatientTimeline.tsx`, `page.tsx` (wearable)

### AI Clinical Narrative Pipeline (March 3–4, 2026)
- **Motor/Cognitive track split**: Separated `DiseaseTrack` into `MotorTrack` (tremor, tapping) and `CognitiveTrack` (verbal fluency) with shared utilities in `trackUtils.ts`
- **2-stage AI pipeline**: gpt-4o-mini (structured metric extraction) → gpt-5.2 (clinical narrative generation) via Supabase Edge Function `analyze-assessment`
- **Generate buttons**: "Generate AI Clinical Interpretation" on each assessment card — purple for tremor, blue for tapping, green for fluency
- **ClinicalNarrativePanel**: Renders AI narrative text with color-coded severity flags (orange/yellow/green pills) for key metrics
- **API key passthrough**: `X-OpenAI-Key` header from Vercel env to Edge Function (Supabase secret not yet set)
- **Data format fixes**: Snake_case → camelCase normalization for tapping data; null guards on `.toFixed()`; nullable `structured_summary`
- **Files**: New `analyze-assessment/route.ts` API route; modified MotorTrack, CognitiveTrack, PatientTimeline, page.tsx; Edge Function deployed to Supabase
- **Tested live**: All 3 assessment types generate narratives successfully on production site

### Wearable Dashboard Data Fixes (March 2–3, 2026)
- **Null-safe rendering**: Resting HR 0 treated as missing data; all metric fields made nullable in TypeScript types
- **Sleep fallback mode**: Single "Total Sleep" bar rendered when sleep stage breakdown unavailable from device
- **Rolling averages**: Server-side 7-day rolling average computation for HRV and steps (previously missing)
- **Auto-computed baselines**: Baselines calculated from actual patient data instead of hardcoded zeros
- **Diagnosis-aware Disease Track**: Shows "Essential Tremor Monitoring" or "Parkinson's Motor Metrics" based on patient diagnosis
- **Auto-refresh polling**: 15-minute visibility-aware polling on `/wearable` page
- **Files**: 8 modified across types, API route, and 5 chart components (PR #59)

### SevaroMonitor iOS — Sleep Fixes (March 2–3, 2026)
- **Sleep midnight boundary**: Changed HealthKit sleep query from midnight-to-midnight to 6 PM-to-6 PM window, preventing overnight sleep sessions from being split across two calendar days
- **Sleep stage breakdown**: Now collects per-stage hours (Deep, Light/Core, REM, Awake) from HealthKit and uploads to Supabase JSONB metrics; web dashboard automatically shows stacked stage bars
- **Files**: `HealthKitCollector.swift`, `WearableModels.swift` (SevaroMonitor repo)

## February 2026

### Physician Workspace Card Breakout (February 25, 2026)
- **Homepage redesign**: Replaced single "Physician Workspace" card with 3 distinct entry points in the Clinician Journey track
- **Clinician Dashboard** → `/dashboard` — Command Center (5-zone AI dashboard, unchanged)
- **My Schedule** → `/physician` — Lands on calendar view (`initialViewMode="appointments"`), click any patient to swap inline to their chart
- **Documentation** → `/ehr` — Lands directly on a random sample patient chart (`initialViewMode="chart"`), supports `?patient=ID` for specific patients
- **Ongoing Care track**: Removed duplicate Command Center card (now 2 cards: Follow-Up Agent + Wearable)
- **New components**: `EhrPageWrapper.tsx`, `PhysicianPageWrapper.tsx` — client wrapper components that handle Server→Client icon serialization boundary
- **ClinicalNote enhancement**: New `initialViewMode` prop controls which view loads first (`'cockpit' | 'appointments' | 'chart'`)
- **Data fetching**: `fetchDashboardData()` now accepts optional `patientId` parameter; random patient selection when none specified

### Command Center Revamp (February 25, 2026)
- **5-Zone Layout**: AI Morning Briefing → Status Bar (8 tiles) → Action Queue → Patient Queue → Quick Access
- **AI Morning Briefing** (Zone 1): GPT-5.2-generated daily summary with gradient border card, show reasoning toggle, regenerate
- **Status Bar** (Zone 2): 8 clickable metric tiles (Pending Actions, Urgent Patients, Unread Messages, Incomplete Docs, Open Consults, Care Gaps, Refill Requests, Upcoming Follow-ups) with trend arrows and tile-to-queue scrolling
- **Action Queue** (Zone 3): 17 demo actions across 8 action types; batch-approvable groups for all-High-confidence batches; individual action cards with confidence badges (High/Medium/Low), drafted content preview, approve/dismiss with toast notifications
- **Patient Queue** (Zone 4): 12 demo patients with urgency-sorted list; 3-level drill-down (scan row → AI summary card → full feature page); category/urgency/search filters
- **Quick Access** (Zone 5): 6 pill-shaped links to other Sevaro features + demo disclaimer banner
- **Controls**: Role toggle (My Patients / All Patients), time range selector (Today / Yesterday / Last 7 Days)
- **New API routes**: `/api/command-center/metrics`, `/api/command-center/actions` (+ approve + batch-approve), `/api/command-center/patients` (+ `[id]/summary`), `/api/command-center/briefing`
- **New database tables**: `command_center_actions` (AI action suggestions), `command_center_briefings` (cached briefings) — migration 030
- **New TypeScript types**: `src/lib/command-center/types.ts` with full type coverage
- **20 new components** in `src/components/command-center/` organized by zone
- **Design**: Dark gradient background (#0F172A → #1E293B), indigo accent, glassmorphic cards via PlatformShell + FeatureSubHeader

### Mobile Recommendations Fix (February 6, 2026)
- **ICD-10 Code Lookup Support**: `/api/plans` now accepts both diagnosis IDs (e.g., `epilepsy-management`) AND ICD-10 codes directly (e.g., `G40.909`)
- **Mobile View Fix**: MobileRecommendationsSheet was passing ICD-10 codes but API only supported diagnosis IDs - now both work
- **Regex Detection**: API detects ICD-10 format (`/^[A-Z]\d+(\.\d+)?$/i`) and uses code directly for plan matching
- **Mobile PRD Docs**: Added `docs/PRD_MOBILE_APP.md` and `docs/PRD_MOBILE_ENGINEERING_HANDOFF.md`

### OpenAI Model Migration & Order Sentences (February 5, 2026)
- **Model Migration**: All `gpt-4o-mini` → `gpt-5-mini`, `gpt-4o-realtime-preview` → `gpt-realtime` (deprecation deadlines Feb 16 & Feb 27)
- **Order Sentence Dropdowns**: Medications with multiple dose options now show radio button selector instead of single dose
  - New types: `DoseOption`, `StructuredDosing` in `recommendationPlans.ts`
  - Sync script preserves full `doseOptions` array from neuro-plans
  - SmartRecommendationsSection shows dose picker with custom option
  - Selected dose included in "Add to Plan" output
- **Engineering PRDs**: 9 comprehensive docs for engineering team handoff:
  - `docs/SCHEMA_REFERENCE.md` - Complete database schema
  - `docs/AI_PROMPTS_AND_MODELS.md` - All AI system prompts + model config
  - `docs/API_CONTRACTS.md` - API reference with request/response schemas
  - `docs/PRD_CLINICAL_NOTE_SYSTEM.md` - Core clinical documentation
  - `docs/PRD_VOICE_AND_AI_FEATURES.md` - Voice dictation + AI assistance
  - `docs/PRD_AI_HISTORIAN.md` - WebRTC voice interview system
  - `docs/PRD_APPOINTMENTS_PATIENT_MGMT.md` - Scheduling and patient management
  - `docs/PRD_CLINICAL_SCALES_RECOMMENDATIONS.md` - Clinical scales + neuro-plans treatment recommendations
  - `docs/PRD_SETTINGS_FEEDBACK_ADMIN.md` - Settings, feedback, admin panel

### OpenAI Model Optimization (February 5, 2026)
- **Simple tasks use gpt-5-mini**: ask, chart-prep, transcribe, field-action, note-review
- **Complex tasks use gpt-5.2**: visit-ai, scale-autofill, synthesize-note, generate-assessment
- **Realtime voice use gpt-realtime**: historian session (WebRTC)
- Migration from gpt-4o-mini (deprecated Feb 16, 2026) and gpt-4o-realtime-preview (deprecated Feb 27, 2026)

### Follow-Up Visit Workflow & Plan Sync (February 3, 2026)
- **View Full Note Resilience**: Modal now opens even when clinical_notes is null/empty; shows AI summary fallback + "not available" message; Copy Note handles null gracefully
- **PATCH Route Missing Fields**: Added `vitals` and `examFreeText` field handling; added `tenant_id` to clinical_notes INSERT; error logging on INSERT failure
- **Sign Route tenant_id**: Added `tenant_id` from `getTenantServer()` to clinical_notes INSERT in sign route
- **Patient History Summary Full Context**: Removed `.substring(0, 200)` truncation on HPI/assessment/plan; standard/detailed modes now explicitly request medication details from prior visits
- **examFreeText Propagation**: Added to patients API transform and ClinicalNote prior visits mapping
- **Plan Sync Pipeline**: 127 plans synced from neuro-plans repo; ES module compatibility fix; duplicate draft exclusion
- **Scored ICD-10 Matching**: Weighted scoring (exact=10, prefix=5, category=2) replaces boolean prefix match; prevents false positives
- **Plan-Diagnosis Linking**: Added synonyms, consult map, fixed incorrect matches, deduplication
- **OpenAI API Migration**: `max_tokens` → `max_completion_tokens` across 8 API routes
- **Sign & Complete Stale Closure Fix**: `handlePend()` returns visitId directly to prevent stale state reads
- **Assessment Full Context**: generate-assessment endpoint now receives full diagnosis data with ICD-10 codes
- **Plan Pill Click Fix**: SmartRecommendationsSection plan pills now respond to clicks
- **History Summary Query Fix**: dashboardData.ts query corrected for score history

### P0 Bugfixes & Data Sync (February 1, 2026)
- **Cross-Patient Data Contamination Fix**: New `resetAllClinicalState()` in ClinicalNote.tsx wipes all state on patient switch/sign; `isSwitchingPatientRef` guards async callbacks (Chart Prep, Visit AI, Historian import) from writing to wrong patient
- **Second Chart Prep Fix (F1)**: Marker-based replace (`--- Chart Prep ---` / `--- End Chart Prep ---`) prevents content duplication; `noteDataRef` fixes stale closure in VoiceDrawer auto-process effect
- **Tab Nav Z-Index Fix (F2)**: `.tab-nav-wrapper` raised to z-index 20; section pills to z-index 15; field action icons stay at z-index 10
- **hasSmartPlan Sync**: Updated 148/166 diagnoses with `hasSmartPlan: true` (was only 6); matches 98 plans in Supabase `clinical_plans` table
- **Cervical Myelopathy ICD-10 Fix**: Corrected from G99.2 to M47.12 to match DB plan
- **Feedback Backlog Triage**: F1, F2, F9, F11, F12, F13, F14 (partial), F16 fixed; F4, F5, F6, F7, F8, F10 still pending

### 5 UX Improvements (February 1, 2026)
- **Consult Sub-Options Visibility**: Auto-scroll to sub-options, hint text, teal border highlight, chevron connector
- **Tab Completion Indicators**: Green/amber dots on tabs with missing-field tooltips
- **DDx Edit Affordances**: Priority badges, reorder arrows, set primary, swap search
- **Recommendation Plan Adoption**: Select all/deselect all, "Added!" confirmation, plan textarea flash
- **Contextual Exam Scales**: Recommended/All filter toggle, diagnosis context banner, teal dots

### Earlier Fixes (February 1, 2026)
- **Chart Prep Narrative Format (F9)**: API refactored to single paragraph summary
- **Copy Note Drawer (F11)**: Copy button opens slide-out drawer showing formatted note
- **Exam Scale Tooltips (F12)**: Title attribute with hover explanation on scale buttons
- **Symptom-Based Diagnoses (F13)**: 10 symptom entries added to diagnosisData.ts
- **Patient History Summary Context (F14)**: Referral note card for new patients
- **Imaging Longitudinal Tracking (F16)**: Array-based study tracking, prior studies, grouped dropdown

## January 2026

### 4 Critical UX Fixes (January 30, 2026)
- **Dead Code Removal**: Removed ~260 lines of unused "Prior History Summary" from LeftSidebar (state vars, generate function, entire JSX block); real implementation lives in `PatientHistorySummary.tsx` rendered in CenterPanel
- **Vital Signs Wiring**: Added `vitals` field (`bp`, `hr`, `temp`, `weight`, `bmi`) to noteData state in ClinicalNote.tsx, `ManualNoteData` interface in types.ts, and merge engine; controlled inputs at top of Physical Exams tab; Vital Signs section appears in generated notes
- **Medication Form Modal**: Extracted inline medication add/edit form (~130 lines) from History tab into centered modal overlay; reduces scroll displacement, keeps medication list compact; uses same modal pattern as discontinue confirmation
- **History Tab Section Navigation**: Sticky pill-bar at top of History tab with 8 sections (Summary, Consult, HPI, ROS, Meds, Allergies, History, Scales); IntersectionObserver tracks visible section and highlights active pill; click scrolls smoothly to target section; `data-section` attributes on each section container

### 4 New Clinical Scales + Patient Education Enhancements (January 30, 2026)
- **HAS-BLED**: Bleeding risk score (0-9), 9 binary items; pairs with CHA₂DS₂-VASc for AFib patients; history-based
- **DN4**: Neuropathic pain screening (0-10), 7 interview + 3 exam items, ≥4 = neuropathic; exam-based
- **ODI**: Oswestry Disability Index (0-100%), 10 sections for low back pain disability; custom percentage scoring
- **NDI**: Neck Disability Index (0-100%), 10 sections for neck disability; custom percentage scoring
- **Practice Name Setting**: New `practiceName` field in SettingsDrawer (AI & Documentation tab), displayed on handout headers
- **Handout Language Selection**: Free-text language input in AiDrawer Handout tab; persisted to localStorage; injects language instructions into all handout prompts
- **Handout Print Formatting**: Practice name header + date footer in print output; hidden print wrapper; clean print CSS with proper margins/typography; `[data-no-print]` hides action buttons

### Note Review & Ask AI About This Note (January 30, 2026)
- **Suggested Improvements**: New `/api/ai/note-review` endpoint (gpt-4o-mini, JSON response, max 6 suggestions); collapsible panel in EnhancedNotePreviewModal with type badges (consistency/completeness/quality), severity borders (amber warning, teal info), "Go to section" scroll links, dismiss buttons; auto-triggers after AI synthesis
- **Ask AI About This Note**: Chat input bar in Generate Note modal; full note text sent as `fullNoteText` context to `/api/ai/ask`; 4 suggested question pills; right-aligned question bubbles and left-aligned answer bubbles with teal border; Enter key sends

### Reading Level Control & Dictation Expansion (January 30, 2026)
- **Handout Reading Level Control**: Pill-style selector (Simple/Standard/Advanced) in AiDrawer Handout tab; injects reading-level instructions into all handout AI prompts; persisted to localStorage
- **Settings Dictation**: `useVoiceRecorder` hook on global AI instructions textarea and all 5 per-section instruction textareas in SettingsDrawer; 24x24 red mic buttons with transcription append
- **TopNav Search Dictation**: Mic button in patient search bar; red border during recording; transcribed text auto-populates search field

### P1 Features (January 30, 2026)
- **Free-text Exam Toggle**: Structured/Free-text pill toggle on Physical Exams tab; free-text mode shows single NoteTextField with dictation/AI/dot phrase buttons; persisted to localStorage
- **Handout Auto-suggest by Diagnosis**: AiDrawer Handout tab now shows "From this visit" optgroup populated from selected diagnoses, plus "Common conditions" and "Personalized" groups
- **Patient History Summary**: New `PatientHistorySummary.tsx` component above Reason for Consult in History tab; AI-generated longitudinal summary with Brief/Standard/Detailed modes; editable after generation; calls `/api/ai/chart-prep`; empty state for new patients
- **Audio Routing Hardening**: Safari MIME type mapping fix (mp4/m4a/ogg), 25MB file size validation (client + server), retry button with stored audio blob ref, `maxDuration=120` on visit-ai route

### Medications & Allergies (January 30, 2026)
- **Migration 014**: `patient_medications`, `patient_allergies`, `medication_reviews` tables with RLS, indexes, triggers
- **API routes**: Full CRUD (GET/POST/PATCH/DELETE) for `/api/medications` and `/api/allergies` with auth + tenant scoping
- **TypeScript types**: 8 interfaces and 4 enums in `medicationTypes.ts`
- **Neuro formulary**: ~70 neurology medications across 8 categories with `searchFormulary()` helper
- **ClinicalNote state**: useState, useEffect fetch, 7 useCallback handlers for med/allergy CRUD
- **CenterPanel UI**: Medication list with add/edit form, formulary typeahead, discontinue modal, allergy chips with severity colors
- **LeftSidebar UI**: Allergy alert banner, medication summary list, allergy overview

### Enriched Patient Context for AI Historian (January 30, 2026)
- **Migration 012**: `get_patient_context_for_portal` now returns `last_note_allergies`, `last_note_ros`, and `active_diagnoses` (aggregated from diagnoses table with ICD-10 codes)
- **Removed truncation**: API route no longer truncates HPI (was 500 chars) or assessment (was 300 chars) — full text passed to AI
- **New PatientContext fields**: `allergies`, `diagnoses`, `lastNoteSummary` added to TypeScript interface and API response
- **Richer AI context string**: Historian now receives active diagnoses, allergies, and prior visit summary in addition to existing HPI/assessment/plan

### AI Neurologic Historian (January 30, 2026)
- **Voice-based patient intake**: Real-time voice interviews via OpenAI Realtime API over WebRTC
- **Architecture**: Client connects directly to OpenAI via WebRTC; server only issues ephemeral token (Vercel-compatible)
- **Interview flows**: New patient (OLDCARTS framework) and follow-up (interval changes, treatment response)
- **Safety monitoring**: Keyword detection + AI-level safety protocol with escalation overlay (911, 988, Crisis Text Line)
- **Structured output**: AI calls `save_interview_output` tool to produce structured clinical data (chief complaint, HPI, meds, allergies, PMH, family/social hx, ROS)
- **Red flag detection**: AI identifies clinical red flags with severity scoring
- **Patient portal integration**: New "AI Historian" tab in PatientPortal with 4 demo scenarios
- **Physician integration**: HistorianSessionPanel in LeftSidebar with transcript, summary, structured data views
- **Import to note**: One-click import of structured output into clinical note fields
- **New files**: historianTypes.ts, historianPrompts.ts, useRealtimeSession.ts, NeurologicHistorian.tsx, HistorianSessionComplete.tsx, HistorianSessionPanel.tsx, historian API routes, migration 010
- **Database**: `historian_sessions` table with JSONB structured output, transcript, red flags

### Production Fixes & Generate Assessment (January 28, 2026)
- **Cross-patient data contamination fix**: Autosave key now includes patient ID to prevent data leakage
- **Generate Assessment feature**: New `/api/ai/generate-assessment` endpoint creates clinical assessments from selected diagnoses
- **Diagnosis removal fix**: Removed diagnoses no longer re-appear from auto-population; recommendations update correctly
- **Hover popover positioning**: Appointment row popovers now appear to the right instead of below
- **GPT-5.2 upgrade**: All complex AI tasks now use latest GPT-5.2 model

### Clinical Scales & AI Autofill (January 24, 2026)
- **New Scales**: UPDRS Motor (33-item Parkinson's), Hoehn & Yahr, EDSS (MS), CHA₂DS₂-VASc (stroke risk)
- **AI Scale Autofill**: Extracts data from demographics, vitals, diagnoses, medications, clinical text
- **Confidence Scoring**: High/medium/low confidence with reasoning for each extraction
- **Missing Info Detection**: AI suggests questions to ask for incomplete data

### Voice/AI Drawer Separation
- Split single AI drawer into two separate drawers
- **VoiceDrawer**: Chart Prep + Document (mic-based functions, red theme)
- **AiDrawer**: Ask AI + Summary + Handout (AI query functions, teal theme)
- Microphone icon opens VoiceDrawer, AI star opens AiDrawer

### Imaging/Results Tab Redesign
- Completely rebuilt to match wireframe design
- Collapsible study cards for all imaging and neurodiagnostic studies
- Each card has date, impression dropdown, findings textarea, PACS link
- All text fields have dictation/AI/dot phrase buttons
- Lab results section with quick-add shortcuts

### History Tab Improvements
- Added expandable detail fields to ROS, Allergies, Medical History sections
- Fields appear when relevant option selected (e.g., "Other" for allergies)
- All new fields have dictation/AI/dot phrase buttons

### Two-Tier Reason for Consult
- 9 primary categories with contextual sub-options
- Progressive disclosure (common options first, expandable for more)
- Custom option entry per category

### Differential Diagnosis with ICD-10
- 134 neurology diagnoses with ICD-10 codes
- Auto-populates from chief complaint selections
- Searchable picker with category filtering

### Prior Visits with AI Summaries
- Expandable visit cards in left sidebar
- AI-generated visit summaries
- Sample data showing treatment progression over time

### Score History with Trends
- Historical clinical scale scores
- Trend indicators (improving/stable/worsening)
- Visual progress tracking

### Phase 2 & 3A Completion (January 24, 2026)
- **Smart Recommendations**: 5 diagnoses with neuro-plans treatment recommendations
- **Field AI Actions**: Improve/Expand/Summarize with anti-hallucination safeguards (/api/ai/field-action)
- **User Settings Drawer**: Global + per-section AI instructions, documentation style preferences
- **Extended Scales**: NIHSS, Modified Ashworth, ABCD2, DHI, Mini-Cog, ISI, ESS
- **Exam Templates**: 5 predefined templates + custom template saving
- **Scale Location System**: Exam vs history-based categorization

### Onboarding & UX Improvements (January 24, 2026)
- **Onboarding Tour**: Interactive 9-step tour for new users highlighting key UI features
  - SVG spotlight mask for element highlighting
  - Auto-triggers on first visit, completion saved to localStorage
  - Can be replayed from Settings or Ideas Drawer
- **Ideas/Getting Started Drawer**: Accessed via lightbulb icon in TopNav
  - Workflows tab (informational workflow styles)
  - Tour tab with "Launch Interactive Tour" button
  - Features tab, Feedback tab
- **Clean Chart for Testing**: New users start with empty chart (no default values)
- **Workflows Section**: Made informational-only (no saving/persistence)

### Responsive/Mobile Design (January 24, 2026)
- **Viewport Meta Tag**: Added to layout.tsx for proper mobile rendering
- **CSS Breakpoints**:
  - Mobile: < 640px (slide-in sidebar, full-screen drawers)
  - Tablet: 640px - 1024px (reduced padding/widths)
  - Desktop: > 1024px (standard layout)
- **TopNav**: Hamburger menu on mobile, queue pills hidden
- **LeftSidebar**: Slide-in overlay on mobile with backdrop
- **All Drawers**: Full-screen on mobile (maxWidth: 100vw)
- **IconSidebar**: Hidden on mobile to save space
- **Touch Enhancements**: Larger tap targets (44px), active states
- **Print Styles**: Hide navigation, full-width content

### Dark Mode Fixes (January 24, 2026)
- **Physical Exam Section**: Fixed form elements (textarea, select) to use CSS variables
- **Global Form Overrides**: Added dark mode styles for all input/textarea/select elements
- **Placeholder Colors**: Proper muted color in dark mode

### Additional Clinical Scales (January 24, 2026)
- **UPDRS Motor (Part III)**: 33-item motor examination for Parkinson's disease
- **Hoehn & Yahr**: Parkinson's staging scale (0-5)
- **EDSS**: Expanded Disability Status Scale for MS (0-10)
- **CHA₂DS₂-VASc**: Stroke risk calculator for atrial fibrillation (0-9)
- New condition-scale linkages for movement disorders, MS, and AFib

### AI Scale Autofill (January 24, 2026)
- **New API Endpoint**: `/api/ai/scale-autofill` - Extracts scale data from clinical notes
- **Features**:
  - Confidence scoring (high/medium/low) for each extracted answer
  - Reasoning display for AI's extraction logic
  - Missing info detection with suggested prompts to ask patient
  - Conservative extraction - never hallucinates missing data
- **UI Integration**: "AI Auto-fill from Notes" button in ScaleForm
- **Visual Feedback**: AI-filled fields highlighted, expandable confidence details
