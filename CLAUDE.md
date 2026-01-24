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
│   │   └── phrases/       # Dot phrases CRUD
│   ├── auth/              # Auth callback handler
│   ├── dashboard/         # Main clinical interface
│   ├── login/             # Login page
│   ├── signup/            # Signup page
│   └── page.tsx           # Root redirect
├── components/            # React components
│   ├── AiDrawer.tsx       # AI assistant drawer (Chart Prep, Document, Ask AI, Summary, Handout)
│   ├── AiSuggestionPanel.tsx # Inline AI suggestion panel for note fields
│   ├── CenterPanel.tsx    # Main content area with tabs (History, Imaging, Exam, Recommendation)
│   ├── ClinicalNote.tsx   # Clinical note container with icon sidebar
│   ├── DotPhrasesDrawer.tsx # Dot phrases management drawer
│   ├── LeftSidebar.tsx    # Patient info, Timeline, Hospitalist, Recent consults
│   └── TopNav.tsx         # Navigation with queue tabs, timer, PHI toggle
├── hooks/
│   └── useVoiceRecorder.ts # Voice recording hook for dictation
├── lib/
│   ├── note-merge/        # Note merge engine for combining AI outputs
│   │   ├── index.ts       # Re-exports merge functions
│   │   ├── merge-engine.ts # Core merge logic
│   │   └── types.ts       # TypeScript interfaces for merge system
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
2. **Clinical Notes**: Tabbed interface (History, Imaging/results, Physical exams, Recommendation)
3. **AI Features**:
   - **Ask AI**: General clinical questions with context
   - **Chart Prep**: AI-generated pre-visit summaries with pause/resume dictation
   - **Visit AI (Document tab)**: Record full patient visits, extract HPI/ROS/Exam/Assessment/Plan
   - **Voice Dictation**: Record and transcribe using OpenAI Whisper + GPT-4 cleanup
   - **Patient Summary**: Generate patient-friendly visit summaries
   - **Patient Handouts**: Create educational materials
   - **Note Merge Engine**: Combines Chart Prep + Visit AI + manual content into unified note
4. **Dot Phrases**:
   - Text expansion shortcuts (e.g., `.exam` → full exam template)
   - Field-scoped phrases (global, HPI, Assessment, Plan, etc.)
   - Category organization
   - Usage tracking
5. **Clinical Scales**: Standardized assessment tools
6. **Patient Management**: Demographics, visits, imaging, timeline

## UI Components

### TopNav
- Sevaro brain logo
- Patient search bar
- Queue tabs (Acute Care, Rounding, EEG) with counts
- MD2 timer with live countdown
- What's New, PHI toggle, Lock, Notifications, Dark mode, User avatar

### LeftSidebar
- Hospital logo (Marshall / TNK | PST)
- Medical history link
- Patient card with edit button, Non-Emergent badge
- Video/Phone action buttons
- Quick links (PACS viewer, VizAI, Epic, GlobalProtect)
- Prior Visits section with AI Summary toggle
- Score History section with trend indicators (improving/stable/worsening)
- Timeline (Initial call, Time on video, Assessment time, Final recommendation)
- Recent consults

### CenterPanel
- Tab navigation (History, Imaging/results, Physical exams, Recommendation)
- Action bar (three dots, thumbs up, mic, AI star, copy, Pend, Sign & complete)
- Form sections with Required badges
- Inline action buttons on text fields (mic, lightning, star, dots)
- **Clinical Scales Section** (in History tab):
  - Headache Scales: MIDAS (0-270), HIT-6 (36-78) with disability interpretations
  - Cognitive Scales: MoCA (0-30), Mini-Cog (0-5) with impairment levels
  - Mental Health Screens: PHQ-9 (0-27), GAD-7 (0-21) with severity levels
- **Neurological Examination** (in Physical exams tab):
  - General Appearance dropdown
  - Mental Status: Level of consciousness (radio), Orientation (checkboxes), Following commands
  - Cranial Nerves: Visual fields, Pupils, EOMs, Facial sensation, Face symmetry, Hearing, Palate, Tongue
  - Motor: Bulk, Tone, Strength, Pronator drift
  - Sensation: Light touch, Pinprick, Vibration, Proprioception
  - Coordination: Finger-to-nose, Heel-to-shin, Rapid alternating movements
  - Gait: Evaluated/Not evaluated, Station, Casual gait, Tandem gait, Romberg
- **Reason for Consult chips** organized by outpatient neurology categories:
  - Headache & Pain (Migraine types, facial pain)
  - Movement Disorders (Parkinson, tremor, dystonia, RLS)
  - Epilepsy & Seizures
  - Dementia & Cognitive (MCI, Alzheimer, evaluation)
  - Neuromuscular (neuropathy, myasthenia, ALS)
  - MS & Neuroimmunology
  - Cerebrovascular (stroke follow-up, TIA)
  - Sleep disorders

### AiDrawer
- Tabs: Chart Prep, Document, Ask AI, Summary, Handout
- **Chart Prep Tab**: Pre-visit preparation with pause/resume dictation, structured output sections
- **Document Tab (Visit AI)**: Full visit recording with clinical content extraction
  - Inactive → Recording → Paused → Processing → Results states
  - Extracts HPI, ROS, Exam, Assessment, Plan from conversation
  - Confidence scores for each extracted section
  - Insert individual sections or generate full note
- Voice recording UI with Whisper transcription
- Recording waveform animation with pulsing bars
- AI response display with insert functionality

### TopNav
- Sevaro brain logo
- Patient search bar
- AI launcher dropdown menu (quick access to all 5 AI tools)
- Queue tabs with counts
- Timer display
- PHI toggle, notifications, dark mode

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

- `/api/ai/ask` - Ask clinical questions to GPT-4
- `/api/ai/chart-prep` - Generate pre-visit summaries with structured JSON output
- `/api/ai/transcribe` - Voice transcription (Whisper + GPT-4 cleanup)
- `/api/ai/visit-ai` - Visit AI: transcribe full visits and extract clinical content
- `/api/phrases` - List and create dot phrases
- `/api/phrases/[id]` - Get, update, delete individual phrases
- `/api/phrases/seed` - Seed default medical phrases

## Design System

- **Primary Color**: Teal (#0D9488)
- **Secondary Colors**:
  - Orange (#F59E0B) - Quick actions
  - Purple (#8B5CF6) - Dot phrases
  - Red (#EF4444) - Required badges, errors
- **Font**: Inter (system fallback)
- **Layout**: Icon sidebar + Left sidebar + Center panel

## Documentation

- `docs/Sevaro_Outpatient_MVP_PRD_v1.4.md` - Main product requirements
- `docs/PRD_AI_Scribe.md` - AI Scribe system (Chart Prep + Visit AI + Note Merge)
- `docs/PRD_AI_Summarizer.md` - Patient summary generation
- `docs/PRD_*.md` - Feature-specific PRDs
- `docs/IMPLEMENTATION_STATUS.md` - Current implementation status and gap analysis
- `FIGMA_MAKE_PROMPTS.md` - UI design prompts
- `prototype/index.html` - Original HTML prototype

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
