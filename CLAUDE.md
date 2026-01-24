# Sevaro Clinical - AI-Powered Clinical Documentation

## Project Overview

Sevaro Clinical is a web application for AI-powered clinical documentation, specifically designed for neurology outpatient practices. It provides clinical note creation, AI assistance, voice dictation, dot phrases, clinical scales, and patient management.

## Tech Stack

- **Framework**: Next.js 15.1.x with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS v3 + Inline Styles
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **AI**: OpenAI GPT-4 API + Whisper (transcription)
- **Deployment**: Vercel

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes
│   │   ├── ai/            # AI endpoints
│   │   │   ├── ask/       # Ask AI questions
│   │   │   ├── chart-prep/# Pre-visit chart preparation
│   │   │   ├── transcribe/# Voice transcription (Whisper)
│   │   │   └── visit-ai/  # Visit AI - full visit transcription & clinical extraction
│   │   ├── phrases/       # Dot phrases CRUD
│   │   └── scales/        # Clinical scales API
│   ├── auth/              # Auth callback handler
│   ├── dashboard/         # Main clinical interface
│   ├── login/             # Login page
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
│   ├── ImagingResultsTab.tsx # Imaging/Results tab with collapsible study cards
│   ├── LeftSidebar.tsx    # Patient info, Prior Visits, Score History
│   ├── NoteTextField.tsx  # Reusable text field with dictation/AI/field actions
│   ├── ReasonForConsultSection.tsx # Two-tier reason for consult selection
│   ├── ScaleForm.tsx      # Generic scale form component
│   ├── SettingsDrawer.tsx # User settings (AI instructions, appearance)
│   ├── SmartRecommendationsSection.tsx # Treatment recommendations per diagnosis
│   ├── SmartScalesSection.tsx # Clinical scales based on selected conditions
│   ├── TopNav.tsx         # Navigation with queue tabs, timer, PHI toggle
│   └── VoiceDrawer.tsx    # Voice & Dictation drawer (Chart Prep, Document)
├── hooks/
│   └── useVoiceRecorder.ts # Voice recording hook with pause/resume
├── lib/
│   ├── diagnosisData.ts   # 134 neurology diagnoses with ICD-10 codes
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

- `/api/ai/ask` - Ask clinical questions to GPT-4 (with user settings integration)
- `/api/ai/chart-prep` - Generate pre-visit summaries with structured JSON output
- `/api/ai/field-action` - Field-level AI actions (Improve/Expand/Summarize) with anti-hallucination
- `/api/ai/transcribe` - Voice transcription (Whisper + GPT-4 cleanup)
- `/api/ai/visit-ai` - Visit AI: transcribe full visits and extract clinical content
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
