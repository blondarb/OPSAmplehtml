# Sevaro Clinical

AI-powered clinical documentation platform for neurology outpatient practices.

## Features

- **Clinical Notes**: Tabbed interface (History, Imaging/results, Physical exams, Recommendation)
- **AI Features**:
  - Ask AI: Clinical questions with context
  - Chart Prep: Pre-visit summaries
  - Voice Dictation: Record and transcribe with OpenAI Whisper
  - Patient Summary: Generate visit summaries
  - Patient Handouts: Educational materials
- **Dot Phrases**: Text expansion shortcuts with field scoping
- **Clinical Scales**: MIDAS, HIT-6, PHQ-9, GAD-7, and more
- **Patient Management**: Demographics, visits, imaging, timeline
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
├── app/                    # Next.js pages and API routes
│   ├── api/
│   │   ├── ai/            # AI endpoints (ask, chart-prep, transcribe)
│   │   └── phrases/       # Dot phrases CRUD
│   ├── dashboard/         # Main clinical interface
│   ├── login/             # Login page
│   └── signup/            # Signup page
├── components/            # React components
│   ├── AiDrawer.tsx       # AI assistant panel
│   ├── CenterPanel.tsx    # Main content with tabs
│   ├── ClinicalNote.tsx   # Note container
│   ├── DotPhrasesDrawer.tsx # Dot phrases panel
│   ├── LeftSidebar.tsx    # Patient info sidebar
│   └── TopNav.tsx         # Navigation header
├── hooks/
│   └── useVoiceRecorder.ts # Voice recording
├── lib/
│   └── supabase/          # Supabase clients
└── middleware.ts          # Auth middleware
```

## Documentation

- [CLAUDE.md](./CLAUDE.md) - Development guide for AI assistants
- [docs/](./docs/) - Product requirements documents
- [FIGMA_MAKE_PROMPTS.md](./FIGMA_MAKE_PROMPTS.md) - UI design specifications
- [prototype/](./prototype/) - Original HTML prototype

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
