# Sevaro Clinical

AI-powered clinical documentation platform for neurology outpatient practices.

## Features

### Clinical Documentation
- **Tabbed Interface**: History, Imaging/Results, Physical Exams, Recommendation
- **Reason for Consult**: Two-tier selection with 9 categories and 100+ sub-options
- **Differential Diagnosis**: Auto-population from chief complaint with ICD-10 codes (134 diagnoses)
- **Neurological Exam**: Comprehensive checkbox-based exam with all cranial nerves, motor, sensory, coordination, gait

### Voice & Dictation (Red Theme)
- **Chart Prep**: Pre-visit dictation with auto-categorization into clinical sections
- **Document**: Full visit recording with pause/resume and clinical extraction

### AI Assistant (Teal Theme)
- **Ask AI**: Clinical Q&A with patient context
- **Patient Summary**: Generate patient-friendly visit summaries
- **Patient Handouts**: Educational materials by condition

### Clinical Scales
- **Headache**: MIDAS (0-270), HIT-6 (36-78)
- **Cognitive**: MoCA (0-30), Mini-Cog (0-5)
- **Mental Health**: PHQ-9 (0-27), GAD-7 (0-21)
- **History Tracking**: Score trends with visual indicators

### Other Features
- **Dot Phrases**: Text expansion with field scoping and categories
- **Imaging/Results Tab**: Collapsible study cards for MRI, CT, EEG, labs
- **Prior Visits**: Expandable visit cards with AI summaries
- **Secure Authentication**: Email/password via Supabase Auth

## Tech Stack

- [Next.js 15](https://nextjs.org/) - React framework with App Router
- [Supabase](https://supabase.com/) - Database & authentication
- [OpenAI](https://openai.com/) - GPT-4 + Whisper for AI capabilities
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [Vercel](https://vercel.com/) - Deployment

## Live Demo

https://ops-amplehtml.vercel.app/

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase account
- OpenAI API key

### Setup

1. Clone the repository:
```bash
git clone https://github.com/blondarb/OPSAmplehtml.git
cd OPSAmplehtml
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env.local` with your Supabase credentials:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

4. Set up the database:
   - Go to Supabase SQL Editor
   - Run migrations in order:
     - `supabase/migrations/001_initial_schema.sql`
     - `supabase/migrations/002_seed_demo_data.sql`
     - `supabase/migrations/003_dot_phrases.sql`
     - `supabase/migrations/004_dot_phrases_scope.sql`

5. Add your OpenAI API key (one of):
   - In Supabase Table Editor, go to `app_settings`, insert row with `key: 'openai_api_key'`, `value: 'sk-your-key'`
   - Or add `OPENAI_API_KEY=sk-your-key` to `.env.local`

6. Start the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Project Structure

```
src/
├── app/                           # Next.js App Router
│   ├── api/
│   │   ├── ai/
│   │   │   ├── ask/               # Ask AI clinical Q&A
│   │   │   ├── chart-prep/        # Pre-visit AI processing
│   │   │   ├── transcribe/        # Whisper transcription
│   │   │   └── visit-ai/          # Full visit recording AI
│   │   ├── phrases/               # Dot phrases CRUD
│   │   └── scales/                # Clinical scales history
│   ├── dashboard/                 # Main clinical interface
│   ├── login/                     # Login page
│   └── signup/                    # Signup page
├── components/
│   ├── AiDrawer.tsx               # AI Assistant (Ask AI, Summary, Handout) - teal theme
│   ├── AiSuggestionPanel.tsx      # Inline AI suggestions for text fields
│   ├── CenterPanel.tsx            # Main content with 4 tabs
│   ├── ClinicalNote.tsx           # State management + Generate Note
│   ├── DifferentialDiagnosisSection.tsx  # Diagnosis picker with ICD-10
│   ├── DotPhrasesDrawer.tsx       # Dot phrases management
│   ├── ImagingResultsTab.tsx      # Collapsible imaging/lab cards
│   ├── LeftSidebar.tsx            # Patient info, prior visits, scores
│   ├── NoteTextField.tsx          # Text field with action buttons
│   ├── ReasonForConsultSection.tsx # Two-tier consult selection
│   ├── SmartScalesSection.tsx     # Clinical scales with scoring
│   ├── TopNav.tsx                 # Navigation header
│   └── VoiceDrawer.tsx            # Voice (Chart Prep, Document) - red theme
├── hooks/
│   └── useVoiceRecorder.ts        # Pause/resume recording hook
├── lib/
│   ├── diagnosisData.ts           # 134 diagnoses with ICD-10 codes
│   ├── note-merge/                # Merge AI outputs with manual content
│   │   ├── types.ts
│   │   ├── merge-engine.ts
│   │   └── index.ts
│   ├── reasonForConsultData.ts    # 9 categories with sub-options
│   └── supabase/                  # Supabase clients
└── middleware.ts                  # Auth middleware
```

## Architecture

### Two-Drawer System
The application uses two separate slide-out drawers for different functionality:

1. **VoiceDrawer** (Red theme, microphone icon)
   - Chart Prep: Pre-visit dictation with AI categorization
   - Document: Full visit recording with pause/resume

2. **AiDrawer** (Teal theme, star icon)
   - Ask AI: Clinical Q&A with patient context
   - Summary: Patient-friendly visit summaries
   - Handout: Educational materials by condition

### Generate Note Flow
```
[Manual Entry] ──┐
                 ├──> mergeNoteContent() ──> Populate empty fields
[Chart Prep] ────┤
                 │
[Visit AI] ──────┘
```

### Design System
- **Primary**: Teal (#0D9488) - AI, main actions
- **Voice**: Red (#EF4444) - Recording, microphone
- **Dot Phrases**: Purple (#8B5CF6) - Text expansion
- **Quick Actions**: Orange (#F59E0B) - Secondary buttons

## Documentation

- [CLAUDE.md](./CLAUDE.md) - Comprehensive development guide
- [docs/IMPLEMENTATION_STATUS.md](./docs/IMPLEMENTATION_STATUS.md) - Feature tracking
- [docs/Sevaro_Outpatient_MVP_PRD_v1.4.md](./docs/Sevaro_Outpatient_MVP_PRD_v1.4.md) - Product requirements
- [docs/PRD_AI_Scribe.md](./docs/PRD_AI_Scribe.md) - AI feature specifications
- [prototype/](./prototype/) - Original HTML wireframe

## Deployment

Deploy to Vercel:

1. Connect your GitHub repository to Vercel
2. Add environment variables in Vercel project settings:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Deploy

When redeploying, use "Redeploy without cache" for fresh builds.

## License

Proprietary - All rights reserved.
