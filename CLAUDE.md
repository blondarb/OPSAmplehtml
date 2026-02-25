# Sevaro Clinical - AI-Powered Clinical Documentation

## Project Overview

Sevaro Clinical is a web application for AI-powered clinical documentation, specifically designed for neurology outpatient practices. It provides clinical note creation, AI assistance, voice dictation, dot phrases, clinical scales, and patient management.

## Tech Stack

- **Framework**: Next.js 15.1.x with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS v3 + Inline Styles
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **AI**: OpenAI GPT-5/GPT-4o-mini APIs + Whisper (transcription) + Realtime API (WebRTC)
- **Deployment**: Vercel

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes
│   │   ├── ai/            # AI endpoints
│   │   │   ├── ask/       # Ask AI questions
│   │   │   ├── chart-prep/# Pre-visit chart preparation
│   │   │   ├── historian/ # AI Neurologic Historian (Realtime API)
│   │   │   │   ├── session/ # Ephemeral token for WebRTC
│   │   │   │   └── save/    # Save/list historian sessions
│   │   │   ├── transcribe/# Voice transcription (Whisper)
│   │   │   └── visit-ai/  # Visit AI - full visit transcription & clinical extraction
│   │   │   └── draft-response/ # AI draft for patient messages (GPT-5-mini)
│   │   ├── allergies/     # Allergy CRUD API
│   │   ├── consults/      # Consult request CRUD
│   │   ├── incomplete-docs/ # Incomplete documentation detection
│   │   ├── medications/   # Medication CRUD API
│   │   ├── notifications/ # Unified notification system
│   │   ├── phrases/       # Dot phrases CRUD
│   │   ├── provider-messages/ # Provider messaging + threads
│   │   └── scales/        # Clinical scales API
│   ├── auth/              # Auth callback handler
│   ├── dashboard/         # Main clinical interface
│   ├── login/             # Login page
│   ├── mobile/            # Mobile-optimized clinical interface
│   │   ├── page.tsx       # Mobile patient list with FAB menu
│   │   ├── chart/[id]/    # Mobile chart view with voice recorder
│   │   ├── settings/      # Mobile settings page
│   │   └── voice/         # Mobile voice recording page
│   ├── patient/           # Patient portal
│   │   ├── page.tsx       # Patient portal (intake, messages, historian)
│   │   └── historian/     # AI Historian voice interview page
│   ├── signup/            # Signup page
│   └── page.tsx           # Root redirect
├── components/            # React components
│   ├── AiDrawer.tsx       # AI assistant drawer (Ask AI, Summary, Handout)
│   ├── AiSuggestionPanel.tsx # Inline AI suggestion panel for note fields
│   ├── CenterPanel.tsx    # Main content area with tabs
│   ├── ClinicalNote.tsx   # Clinical note container orchestrating all panels + Clinical Cockpit routing
│   ├── DifferentialDiagnosisSection.tsx # Differential diagnosis with ICD-10 codes
│   ├── DotPhrasesDrawer.tsx # Dot phrases management drawer
│   ├── EnhancedNotePreviewModal.tsx # Comprehensive note generation with type/length selection, AI note review, ask AI
│   ├── ExamScalesSection.tsx # Exam-driven scales (NIHSS, MAS, etc.)
│   ├── HistorianSessionComplete.tsx # Post-interview success screen
│   ├── HistorianSessionPanel.tsx # Physician-side historian session viewer
│   ├── ImagingResultsTab.tsx # Imaging/Results tab with collapsible study cards
│   ├── LeftSidebar.tsx    # Patient info, Prior Visits, Score History
│   ├── NeurologicHistorian.tsx # Full-page patient voice interview UI
│   ├── NoteTextField.tsx  # Reusable text field with dictation/AI/field actions
│   ├── ReasonForConsultSection.tsx # Two-tier reason for consult selection
│   ├── ScaleForm.tsx      # Generic scale form component
│   ├── SettingsDrawer.tsx # User settings (AI instructions, appearance)
│   ├── SmartRecommendationsSection.tsx # Treatment recommendations per diagnosis
│   ├── SmartScalesSection.tsx # Clinical scales based on selected conditions
│   ├── TopNav.tsx         # Navigation with queue tabs, timer, PHI toggle
│   ├── UrgencyBanner.tsx  # Persistent urgency banner below TopNav
│   ├── PhysicianHome.tsx  # Clinical Cockpit three-column home view
│   ├── VoiceDrawer.tsx    # Voice & Dictation drawer (Chart Prep, Document)
│   ├── home/              # Clinical Cockpit sub-components
│   │   ├── ScheduleColumn.tsx     # Today's schedule with prep status
│   │   ├── NotificationFeed.tsx   # Priority-sorted notification cards
│   │   └── ProviderCommColumn.tsx # Team chat + quick consult
│   └── mobile/            # Mobile-specific components
│       ├── MobileChartView.tsx        # Main mobile chart interface
│       ├── MobileLayout.tsx           # Mobile navigation and layout wrapper
│       ├── MobileNotePreview.tsx      # Mobile note preview modal
│       ├── MobilePatientCard.tsx      # Patient info card for mobile
│       ├── MobileRecommendationsSheet.tsx # Treatment recommendations bottom sheet
│       └── MobileVoiceRecorder.tsx    # Voice recording with waveform
├── hooks/
│   ├── useNotificationCounts.ts # Notification counts for badges/banner (polls API)
│   ├── useRealtimeSession.ts # WebRTC hook for OpenAI Realtime API
│   └── useVoiceRecorder.ts # Voice recording hook with pause/resume
├── lib/
│   ├── diagnosisData.ts   # 166 neurology diagnoses with ICD-10 codes
│   ├── historianTypes.ts  # TypeScript types for AI Historian
│   ├── historianPrompts.ts # System prompts for AI Historian interviews
│   ├── medicationTypes.ts # TypeScript types for medications & allergies
│   ├── neuroFormulary.ts  # ~70 neurology medications with search helper
│   ├── note-merge/        # Note merge engine for combining AI outputs
│   │   ├── index.ts       # Re-exports merge functions
│   │   ├── merge-engine.ts # Core merge logic + formatting functions
│   │   └── types.ts       # TypeScript interfaces (ComprehensiveNoteData, FormattedNote)
│   ├── reasonForConsultData.ts # Consult categories and sub-options
│   ├── supabase/
│   │   ├── client.ts      # Browser Supabase client
│   │   └── server.ts      # Server Supabase client
│   └── database.types.ts  # TypeScript types for Supabase
└── middleware.ts          # Auth middleware
```

## Database Schema

Located in `supabase/migrations/`:

- **patients**: Patient demographics
- **visits**: Patient visit records
- **clinical_notes**: Clinical documentation
- **clinical_scales**: Assessment scales (MIDAS, HIT-6, PHQ-9, etc.)
- **clinical_scale_history**: Historical scale scores with trends
- **diagnoses**: Patient diagnoses
- **imaging_studies**: Imaging records
- **app_settings**: Application settings (stores OpenAI API key)
- **dot_phrases**: User-defined text expansion phrases with scoping
- **historian_sessions**: AI voice interview sessions (structured output, transcript, red flags)
- **patient_medications**: Patient medication records with dosage, frequency, prescriber
- **patient_allergies**: Patient allergy records with severity and reaction type
- **medication_reviews**: Medication review audit trail
- **notifications**: Unified notification system (9 source types, priority, snooze)
- **provider_threads**: Provider messaging threads (patient-linked or general)
- **provider_messages**: Messages within provider threads
- **consult_requests**: Structured consult requests with urgency/type/status
- **patient_messages** (updated): Added `ai_draft`, `ai_assisted`, `draft_status` columns

## Environment Variables

Required for deployment:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Optional (can also be stored in Supabase `app_settings`):
```
OPENAI_API_KEY=sk-...
```

The OpenAI API key can be stored securely in Supabase `app_settings` table or as an environment variable.

## Key Features

1. **Authentication**: Email/password and magic link via Supabase Auth

2. **Clinical Notes**: Tabbed interface with four main tabs:
   - **History**: Reason for consult, HPI, ROS, allergies, medical history, clinical scales
   - **Imaging/Results**: Collapsible study cards for MRI, CT, EEG, EMG, labs
   - **Physical Exams**: Neurological examination with checkboxes
   - **Recommendation**: Assessment, differential diagnosis, plan

3. **Two-Tier Reason for Consult**:
   - 9 primary categories with icons (Headache, Movement, Seizure, Cognitive, Neuromuscular, MS/Neuroimmunology, Cerebrovascular, Sleep, Other)
   - Contextual sub-options per category (common always visible, expanded on request)
   - Custom option entry per category

4. **Differential Diagnosis Section**:
   - Auto-populates from Reason for Consult selections
   - 166 neurology diagnoses with ICD-10 codes
   - Searchable diagnosis picker with category filtering
   - Supports custom diagnosis entry

5. **AI Features** (Two Separate Drawers):

   **Voice Drawer** (Microphone icon - red accent):
   - **Chart Prep**: Pre-visit dictation with auto-categorization, AI summary generation
   - **Document**: Record full patient visits, AI extracts HPI/ROS/Exam/Assessment/Plan

   **AI Drawer** (Star icon - teal accent):
   - **Ask AI**: General clinical questions with patient context
   - **Patient Summary**: Generate patient-friendly visit summaries
   - **Patient Handouts**: Create educational materials

6. **Note Merge Engine**: Combines Chart Prep + Visit AI + manual content into unified note

7. **Dot Phrases**:
   - Text expansion shortcuts (e.g., `.exam` → full exam template)
   - Field-scoped phrases (global, HPI, Assessment, Plan, etc.)
   - Category organization
   - Usage tracking

8. **Clinical Scales**: Smart scale suggestions based on selected conditions
   - Headache: MIDAS, HIT-6
   - Cognitive: MoCA, Mini-Cog
   - Mental Health: PHQ-9, GAD-7

9. **Imaging/Results Tab**:
   - Collapsible study cards for each imaging type
   - Fields: Date, Impression (dropdown), Findings (with dictation/AI buttons), PACS link
   - Imaging studies: MRI Brain, CT Head, CTA Head & Neck, MRA Head, MRI Spine
   - Neurodiagnostic: EEG, EMG/NCS, VEP, Sleep Study
   - Lab results section with quick-add shortcuts

10. **Patient Management**: Demographics, visits, imaging, timeline

11. **AI Neurologic Historian**:
    - Voice-based patient intake interview via OpenAI Realtime API (WebRTC)
    - Structured neurologic history using OLDCARTS framework
    - New patient and follow-up interview flows
    - Safety monitoring with escalation protocol (suicide/crisis detection)
    - Structured output: chief complaint, HPI, medications, allergies, PMH, family/social history, ROS
    - Red flag identification with severity scoring
    - Physician-side session panel with transcript, summary, and structured data views
    - Import-to-note functionality for EHR integration
    - 4 demo scenarios (headache referral, seizure eval, migraine follow-up, MS follow-up)

12. **Mobile App** (`/mobile`):
    - Mobile-optimized clinical interface for smartphones
    - **Routes**:
      - `/mobile` - Patient list with FAB menu for quick actions
      - `/mobile/chart/[id]` - Full chart view with voice recording
      - `/mobile/settings` - Mobile settings
      - `/mobile/voice` - Dedicated voice recording page
    - **Key Components**:
      - `MobileChartView` - Scrollable sections (HPI, ROS, Exam, Assessment, Plan)
      - `MobileRecommendationsSheet` - Bottom sheet with treatment recommendations per diagnosis
      - `MobileVoiceRecorder` - Voice recording with waveform visualization
      - `MobileNotePreview` - Note preview modal
    - **Treatment Recommendations**: Tap any diagnosis to see evidence-based treatment plans from neuro-plans
    - **API**: `/api/plans?diagnosisId=` accepts both diagnosis IDs (`epilepsy-management`) and ICD-10 codes (`G40.909`)

13. **Clinical Cockpit** (physician home view):
    - Three-column layout: Schedule | Notification Feed | Provider Communication
    - **Urgency Banner**: Persistent bar below TopNav showing critical item counts (alerts, messages, docs, consults)
    - **Schedule Column**: Today's patients with prep status, type badges, incomplete doc warnings
    - **Notification Feed**: Priority-sorted cards for 9 notification types with filter tabs (All/Urgent/Messages/Tasks)
    - **Provider Communication**: Team chat threads + quick consult form + consult history
    - **AI Draft Responses**: Auto-generated draft replies for patient messages (always draft, never auto-send)
    - **Incomplete Doc Detection**: Detects unsigned notes, missing Assessment/Plan, visits without notes
    - **Badge System**: IconSidebar badges for unread notifications by category

## UI Components

### TopNav
- Sevaro brain logo (links to prototype wireframe at `/prototype.html`)
- Patient search bar
- Queue tabs (Acute Care, Rounding, EEG) with counts
- MD2 timer with live countdown
- What's New, PHI toggle, Lock, Notifications, Dark mode, User avatar

### LeftSidebar
- Patient card with edit button, badges (Non-Emergent, Follow-up, etc.)
- Video/Phone action buttons
- Quick links (PACS viewer, VizAI, Epic, GlobalProtect)
- **Prior Visits section**:
  - AI Summary toggle
  - Expandable visit cards with AI-generated summaries
  - Sample data showing treatment progression
- **Score History section**:
  - Trend indicators (improving/stable/worsening)
  - Historical scores with interpretations
- Local time display

### CenterPanel
- Tab navigation (History, Imaging/results, Physical exams, Recommendation)
- Action bar with:
  - More options (three dots)
  - Thumbs up
  - Microphone (opens Voice Drawer - red accent)
  - AI star (opens AI Drawer - teal accent)
  - Copy
  - Generate Note (purple, shows green dot when AI content available)
  - Pend, Sign & complete

### Text Fields with Action Buttons
All major text fields include inline action buttons:
- **Red mic button**: Open Voice Drawer for dictation
- **Purple lightning button**: Open Dot Phrases drawer
- **Teal star button**: Open AI Drawer for assistance

### ImagingResultsTab
- Collapsible study cards matching wireframe design
- Each study card contains:
  - Header with name, status badge, date summary
  - Expanded: Date picker, Impression dropdown, Findings textarea, PACS link
  - Action buttons on findings field (mic, dot phrase, AI)
- "Add Study" button for custom studies
- Lab results section with quick-add chips

### VoiceDrawer (Red theme)
- Header: "Voice & Dictation" with mic icon
- Tabs: Chart Prep, Document
- **Chart Prep tab**:
  - Dictate while reviewing with auto-categorization
  - Recording controls (pause/resume/restart)
  - AI summary generation with structured sections
  - Alerts (red highlight), Suggested Focus (yellow highlight)
  - "Add All to Note" button
- **Document tab**:
  - Full visit recording with waveform animation
  - Processing state with spinner
  - Results display with confidence scores

### AiDrawer (Teal theme)
- Header: "AI Assistant" with star icon
- Tabs: Ask AI, Summary, Handout
- Ask AI: Input field, suggested questions, AI response display
- Summary: Simple/Standard/Detailed level selection
- Handout: Condition dropdown, generate button

### NeurologicHistorian (Patient-facing)
- Full-page voice interview UI at `/patient/historian`
- State machine: Scenario Select → Connecting → Active → Complete (+ Safety Escalation)
- Voice orb with teal (AI speaking) / purple (patient speaking) animation
- Streaming transcript display with collapsible history
- Timer and session status indicators
- Safety escalation overlay with emergency resources (911, 988, Crisis Text Line)
- Post-interview success screen with duration/question stats

### HistorianSessionPanel (Physician-facing)
- LeftSidebar section showing completed historian sessions
- Expandable cards with sub-tabs: Summary, Structured Data, Transcript
- Red flag banners with severity indicators
- Safety escalation alerts for flagged sessions
- "Import to Note" button to populate clinical note fields

### DotPhrasesDrawer
- Search and filter by category
- Scope filtering (relevant to field vs all)
- Create, edit, delete phrases
- Usage tracking

## Development Notes

### Supabase Client Creation

The Supabase client must be created lazily (inside event handlers) to avoid issues during static page generation. Never create the client at component level.

```typescript
// WRONG - causes build errors
const supabase = createClient()

// CORRECT - create only when needed
const handleSubmit = () => {
  const supabase = createClient()
  // use supabase
}
```

### Middleware

The middleware (`src/middleware.ts`) handles session refresh. Uses a simplified pass-through approach to avoid edge function issues.

### API Routes

**AI Endpoints (Model Configuration):**
- `/api/ai/ask` - Ask clinical questions (gpt-5-mini - cost-effective Q&A)
- `/api/ai/chart-prep` - Generate pre-visit summaries (gpt-5-mini)
- `/api/ai/field-action` - Field-level AI actions: Improve/Expand/Summarize (gpt-5-mini)
- `/api/ai/transcribe` - Voice transcription (Whisper + gpt-5-mini cleanup)
- `/api/ai/visit-ai` - Visit AI: transcribe and extract clinical content (gpt-5.2 - complex extraction)
- `/api/ai/scale-autofill` - AI autofill for clinical scales from patient data (gpt-5.2)
- `/api/ai/synthesize-note` - Note synthesis from multiple sources (gpt-5.2)
- `/api/ai/generate-assessment` - Generate clinical assessment from diagnoses (gpt-5.2)
- `/api/ai/note-review` - AI-powered note review for suggested improvements (gpt-5-mini)
- `/api/ai/historian/session` - Create ephemeral token for WebRTC (gpt-realtime)
- `/api/ai/historian/save` - Save/list historian interview sessions

**Other Endpoints:**
- `/api/phrases` - List and create dot phrases
- `/api/phrases/[id]` - Get, update, delete individual phrases
- `/api/phrases/seed` - Seed default medical phrases
- `/api/scales` - Clinical scales API

## Design System

- **Primary Color**: Teal (#0D9488)
- **Secondary Colors**:
  - Orange (#F59E0B) - Quick actions
  - Purple (#8B5CF6) - Dot phrases, Generate Note
  - Red (#EF4444) - Required badges, errors, Voice Drawer
- **Font**: Inter (system fallback)
- **Layout**: Left sidebar (260px) + Center panel (flex)

### Icon Button Colors
- **Microphone**: Red background (#FEE2E2), red icon (#EF4444)
- **Dot Phrase**: Purple background (#EDE9FE), purple icon (#8B5CF6)
- **AI Assist**: Teal background (#CCFBF1), teal icon (#0D9488)

## Data Files

### diagnosisData.ts
- 166 neurology diagnoses organized into 16 categories
- Each diagnosis has: id, name, icd10, category, optional alternateIcd10
- CONSULT_TO_DIAGNOSIS_MAP links chief complaints to relevant diagnoses
- Helper functions: getDiagnosisByCategory, searchDiagnoses, getDiagnosisById

### reasonForConsultData.ts
- 9 primary consult categories with icons and sub-options
- Each category has: id, label, icon, subOptions (common + expanded)
- Helper functions: getCategoryById, getAllSubOptions, findCategoryForSubOption, derivePrimaryCategoriesFromSubOptions

### Smart Recommendations (neuro-plans)
- **Source**: `blondarb/neuro-plans` GitHub repo (built by Steve Arbogast)
- **Published**: https://blondarb.github.io/neuro-plans/clinical/
- **127 clinical plans** with evidence-based treatment recommendations
- **Sync command**: `npm run sync-plans` fetches JSON from GitHub and upserts to Supabase `clinical_plans` table
- **Order sentences**: Medications can have multiple `doseOptions` with dropdown selection in UI
- **ICD-10 matching**: Scored matching (exact=1000, category=1) links diagnoses to relevant plans

## Documentation

### Product Requirements
- `docs/Sevaro_Outpatient_MVP_PRD_v1.4.md` - Main product requirements
- `docs/PRD_AI_Scribe.md` - AI Scribe system (Chart Prep + Visit AI + Note Merge)
- `docs/PRD_AI_Summarizer.md` - Patient summary generation
- `docs/PRD_*.md` - Feature-specific PRDs
- `docs/IMPLEMENTATION_STATUS.md` - Current implementation status and gap analysis

### Design Docs
- `docs/plans/2026-02-24-clinical-cockpit-design.md` - Clinical Cockpit workspace redesign

### Engineering Handoff Docs (February 2026)
- `docs/SCHEMA_REFERENCE.md` - Complete database schema for all Supabase tables
- `docs/AI_PROMPTS_AND_MODELS.md` - All AI system prompts and model configuration
- `docs/API_CONTRACTS.md` - API reference with full request/response schemas
- `docs/PRD_CLINICAL_NOTE_SYSTEM.md` - Clinical note system with tabs, diagnoses, recommendations
- `docs/PRD_VOICE_AND_AI_FEATURES.md` - Voice dictation, AI assistance, note merge engine
- `docs/PRD_AI_HISTORIAN.md` - WebRTC voice interview system with safety protocol
- `docs/PRD_APPOINTMENTS_PATIENT_MGMT.md` - Appointment scheduling and patient management
- `docs/PRD_CLINICAL_SCALES_RECOMMENDATIONS.md` - 13+ clinical scales + neuro-plans integration
- `docs/PRD_SETTINGS_FEEDBACK_ADMIN.md` - User settings, feedback system, admin panel

### Other
- `FIGMA_MAKE_PROMPTS.md` - UI design prompts
- `public/prototype.html` - Original HTML prototype (accessible via logo click)

## Common Commands

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run start    # Start production server
npm run lint     # Run ESLint
```

## Deployment

Deployed on Vercel at: https://ops-amplehtml.vercel.app/

Environment variables must be set in Vercel project settings:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

When redeploying after changes, use "Redeploy without cache" to ensure fresh builds.

## Git Workflow

- Main branch: `main` (production)
- Feature branches: `claude/review-repo-design-*`
- Push to feature branch, create PR, merge to main for deployment

## Recent Changes

Full changelog: [`docs/CHANGELOG.md`](docs/CHANGELOG.md)

## Documentation Update Policy

**IMPORTANT: Every commit must include updates to relevant documentation.** Documentation is never "a follow-up task" — it ships with the code.

**On every commit, review and update as needed:**

1. **CLAUDE.md** (this file) - Add to "Recent Changes" section for any notable change
2. **docs/IMPLEMENTATION_STATUS.md** - Mark features as COMPLETE/PENDING
3. **docs/CONSOLIDATED_ROADMAP.md** - Update status and completion dates
4. **Relevant PRD or handoff docs** in `docs/` - Keep feature specs accurate
5. **qa/TEST_CASES.yaml** - Add or update test cases for new/changed behavior
6. **API docs** (`docs/API_CONTRACTS.md`, `docs/AI_PROMPTS_AND_MODELS.md`) - Update if endpoints or models change

**Rule: If code changes, docs change in the same commit.** No exceptions. This prevents documentation drift and keeps the project source of truth reliable.

## QA Rules of Engagement

All test artifacts live in `qa/`. See those files for full details — this section is the short reference.

| File | Purpose |
|------|---------|
| `qa/TEST_RUNBOOK.md` | Stable baseline test plan (smoke + regression + mobile + role-based) |
| `qa/TEST_CASES.yaml` | Structured test cases with IDs, preconditions, steps, expected results |
| `qa/BUG_TEMPLATE.md` | Bug report template (repro, expected/actual, env, logs) |
| `qa/RELEASE_CHECKLIST.md` | Pre-deploy and post-deploy checks |
| `qa/runs/RUN_TEMPLATE.md` | Per-release run log template (copy, fill, save as `RUN-YYYY-MM-DD-NNN.md`) |

**Key rules:**
1. **Stable baseline + mission brief** — The runbook is stable. Each release gets a short mission brief in `qa/runs/` listing only the delta. Do not recreate the full plan each run.
2. **Every deploy runs smoke suite** (S1-S5) plus the mission brief's focus cases.
3. **VS Code (Claude Code)** = planner. **Chrome (Claude Code for Chrome)** = executor.
4. **Mobile-first**: Every run includes at least one 375px check (E1).
5. **Versioned**: `runbook_version` and `test_cases_version` tracked in file headers. Bump when flows/cases change.
