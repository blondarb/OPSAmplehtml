# Sevaro Clinical - AI-Powered Clinical Documentation

## Project Overview

Sevaro Clinical is a web application for AI-powered clinical documentation, specifically designed for neurology outpatient practices. It provides clinical note creation, AI assistance, clinical scales, and patient management.

## Tech Stack

- **Framework**: Next.js 15.1.x with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS v3
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **AI**: OpenAI GPT-4 API
- **Deployment**: Vercel

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes
│   │   └── ai/            # AI endpoints (ask, chart-prep)
│   ├── auth/              # Auth callback handler
│   ├── dashboard/         # Main clinical interface
│   ├── login/             # Login page
│   ├── signup/            # Signup page
│   └── page.tsx           # Root redirect
├── components/            # React components
│   ├── AiDrawer.tsx       # AI assistant drawer
│   ├── CenterPanel.tsx    # Main content area
│   ├── ClinicalNote.tsx   # Clinical note container
│   ├── LeftSidebar.tsx    # Patient info sidebar
│   ├── RightActionBar.tsx # Quick actions bar
│   └── TopNav.tsx         # Navigation header
├── lib/
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

## Environment Variables

Required for deployment:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

The OpenAI API key is stored securely in Supabase `app_settings` table, not in environment variables.

## Key Features

1. **Authentication**: Email/password and magic link via Supabase Auth
2. **Clinical Notes**: SOAP format with AI assistance
3. **AI Features**:
   - Ask AI: General clinical questions
   - Chart Prep: Pre-visit preparation
   - Voice dictation (planned)
4. **Clinical Scales**: Standardized assessment tools
5. **Patient Management**: Demographics, visits, imaging

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

The middleware (`src/middleware.ts`) handles:
- Session refresh
- Protected route redirects
- Auth page redirects for logged-in users

### API Routes

AI endpoints in `src/app/api/ai/` fetch the OpenAI key from Supabase at runtime, keeping it secure and server-side only.

## Design System

- **Primary Color**: Teal (#0D9488)
- **Font**: Inter
- **Layout**: 3-column (sidebar, center, action bar)

See `FIGMA_MAKE_PROMPTS.md` for detailed design specifications.

## Documentation

- `docs/Sevaro_Outpatient_MVP_PRD_v1.3.md` - Main product requirements
- `docs/PRD_*.md` - Feature-specific PRDs
- `FIGMA_MAKE_PROMPTS.md` - UI design prompts

## Common Commands

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run start    # Start production server
npm run lint     # Run ESLint
```

## Deployment

Deployed on Vercel. Environment variables must be set in Vercel project settings.

When redeploying after changes, use "Redeploy without cache" to ensure fresh builds.
