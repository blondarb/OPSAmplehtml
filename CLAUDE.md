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
│   │   ├── phrases/       # Dot phrases CRUD
│   │   └── scales/        # Clinical scales API
│   ├── auth/              # Auth callback handler
│   ├── dashboard/         # Main clinical interface
│   ├── login/             # Login page
│   ├── patient/           # Patient portal
│   │   ├── page.tsx       # Patient portal (intake, messages, historian)
│   │   └── historian/     # AI Historian voice interview page
│   ├── signup/            # Signup page
│   └── page.tsx           # Root redirect
├── components/            # React components
│   ├── AiDrawer.tsx       # AI assistant drawer (Ask AI, Summary, Handout)
│   ├── AiSuggestionPanel.tsx # Inline AI suggestion panel for note fields
│   ├── CenterPanel.tsx    # Main content area with tabs
│   ├── ClinicalNote.tsx   # Clinical note container orchestrating all panels
│   ├── DifferentialDiagnosisSection.tsx # Differential diagnosis with ICD-10 codes
│   ├── DotPhrasesDrawer.tsx # Dot phrases management drawer
│   ├── EnhancedNotePreviewModal.tsx # Comprehensive note generation with type/length selection
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
│   └── VoiceDrawer.tsx    # Voice & Dictation drawer (Chart Prep, Document)
├── hooks/
│   ├── useRealtimeSession.ts # WebRTC hook for OpenAI Realtime API
│   └── useVoiceRecorder.ts # Voice recording hook with pause/resume
├── lib/
│   ├── diagnosisData.ts   # 134 neurology diagnoses with ICD-10 codes
│   ├── historianTypes.ts  # TypeScript types for AI Historian
│   ├── historianPrompts.ts # System prompts for AI Historian interviews
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
   - 134 neurology diagnoses with ICD-10 codes
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
- `/api/ai/ask` - Ask clinical questions (gpt-4o-mini - cost-effective Q&A)
- `/api/ai/chart-prep` - Generate pre-visit summaries (gpt-4o-mini)
- `/api/ai/field-action` - Field-level AI actions: Improve/Expand/Summarize (gpt-4o-mini)
- `/api/ai/transcribe` - Voice transcription (Whisper + gpt-4o-mini cleanup)
- `/api/ai/visit-ai` - Visit AI: transcribe and extract clinical content (gpt-5.2 - complex extraction)
- `/api/ai/scale-autofill` - AI autofill for clinical scales from patient data (gpt-5.2)
- `/api/ai/synthesize-note` - Note synthesis from multiple sources (gpt-5.2)
- `/api/ai/generate-assessment` - Generate clinical assessment from diagnoses (gpt-5.2)
- `/api/ai/historian/session` - Create ephemeral token for WebRTC (gpt-4o-realtime-preview)
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
- 134 neurology diagnoses organized into 15 categories
- Each diagnosis has: id, name, icd10, category, optional alternateIcd10
- CONSULT_TO_DIAGNOSIS_MAP links chief complaints to relevant diagnoses
- Helper functions: getDiagnosisByCategory, searchDiagnoses, getDiagnosisById

### reasonForConsultData.ts
- 9 primary consult categories with icons and sub-options
- Each category has: id, label, icon, subOptions (common + expanded)
- Helper functions: getCategoryById, getAllSubOptions, findCategoryForSubOption, derivePrimaryCategoriesFromSubOptions

## Documentation

- `docs/Sevaro_Outpatient_MVP_PRD_v1.4.md` - Main product requirements
- `docs/PRD_AI_Scribe.md` - AI Scribe system (Chart Prep + Visit AI + Note Merge)
- `docs/PRD_AI_Summarizer.md` - Patient summary generation
- `docs/PRD_*.md` - Feature-specific PRDs
- `docs/IMPLEMENTATION_STATUS.md` - Current implementation status and gap analysis
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

## Recent Changes (January 2026)

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

### OpenAI Model Optimization (January 25, 2026)
- **Simple tasks use gpt-4o-mini** ($0.15/$0.60 per 1M tokens): ask, chart-prep, transcribe, field-action
- **Complex tasks use gpt-5.2** (latest): visit-ai, scale-autofill, synthesize-note, generate-assessment
- ~93% cost reduction for simple tasks, best accuracy for complex clinical reasoning

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

## Documentation Update Policy

**IMPORTANT: When making significant changes, always update these files:**

1. **docs/IMPLEMENTATION_STATUS.md** - Mark features as COMPLETE/PENDING
2. **docs/CONSOLIDATED_ROADMAP.md** - Update status and completion dates
3. **CLAUDE.md** (this file) - Add to "Recent Changes" section if notable

**What counts as a significant change:**
- New features or components
- Completing roadmap items
- New API endpoints
- New clinical scales
- Major UI changes
- Bug fixes that change expected behavior

This ensures documentation stays in sync with the codebase.

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
