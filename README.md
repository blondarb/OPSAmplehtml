# Sevaro Clinical

AI-powered clinical documentation platform for neurology outpatient practices.

## Features

- **Clinical Notes**: SOAP-format documentation with AI assistance
- **AI Features**: Ask AI, Chart Prep, voice dictation
- **Clinical Scales**: MIDAS, HIT-6, PHQ-9, GAD-7, and more
- **Patient Management**: Demographics, visits, imaging studies
- **Secure Authentication**: Email/password and magic link login

## Tech Stack

- [Next.js 15](https://nextjs.org/) - React framework
- [Supabase](https://supabase.com/) - Database & authentication
- [OpenAI](https://openai.com/) - AI capabilities
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [Vercel](https://vercel.com/) - Deployment

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
   - Run `supabase/migrations/001_initial_schema.sql`
   - Run `supabase/migrations/002_seed_demo_data.sql`

5. Add your OpenAI API key:
   - In Supabase Table Editor, go to `app_settings`
   - Insert row with `key: 'openai_api_key'`, `value: 'sk-your-key'`

6. Start the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Project Structure

```
src/
├── app/                # Next.js pages and API routes
├── components/         # React components
├── lib/               # Utilities and Supabase clients
└── middleware.ts      # Auth middleware
```

## Documentation

- [CLAUDE.md](./CLAUDE.md) - Development guide for AI assistants
- [docs/](./docs/) - Product requirements documents
- [FIGMA_MAKE_PROMPTS.md](./FIGMA_MAKE_PROMPTS.md) - UI design specifications

## Deployment

Deploy to Vercel:

1. Connect your GitHub repository to Vercel
2. Add environment variables in Vercel project settings
3. Deploy

## License

Proprietary - All rights reserved.
