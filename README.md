# Sevaro Clinical

AI-powered clinical documentation platform for neurology outpatient practices.

## Features

### Clinical Documentation
- **Tabbed Interface**: History, Imaging/Results, Physical Exams, Recommendation
- **Reason for Consult**: Two-tier selection with 9 categories and 100+ sub-options
- **Differential Diagnosis**: Auto-population from chief complaint with ICD-10 codes (166 diagnoses)
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
- **Secure Authentication**: Email/password via AWS Cognito

## Tech Stack

- [Next.js 15](https://nextjs.org/) - React framework with App Router
- [AWS RDS](https://aws.amazon.com/rds/) - PostgreSQL database
- [AWS Cognito](https://aws.amazon.com/cognito/) - Authentication
- [AWS Bedrock](https://aws.amazon.com/bedrock/) - AI (Claude Sonnet 4.6)
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [AWS Amplify](https://aws.amazon.com/amplify/) - Deployment

## Getting Started

### Prerequisites

- Node.js 18+
- AWS account with RDS, Cognito, and Bedrock configured
- OpenAI API key (for Whisper transcription)

### Setup

1. Clone the repository:
```bash
git clone https://github.com/blondarb/OPSAmplehtml.git
cd OPSAmplehtml
```

2. Install dependencies:
```bash
pnpm install
```

3. Create `.env.local` with your AWS credentials (see CLAUDE.md for full list):
```
COGNITO_USER_POOL_ID=us-east-2_...
COGNITO_CLIENT_ID=...
RDS_HOST=...
RDS_USER=...
RDS_PASSWORD=...
RDS_DATABASE=ops_amplehtml
BEDROCK_ACCESS_KEY_ID=...
BEDROCK_SECRET_ACCESS_KEY=...
```

4. Start the development server:
```bash
pnpm run dev
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
│   ├── CenterPanel.tsx            # Main content with 4 tabs
│   ├── ClinicalNote.tsx           # State management + Generate Note
│   ├── LeftSidebar.tsx            # Patient info, prior visits, scores
│   ├── TopNav.tsx                 # Navigation header
│   └── VoiceDrawer.tsx            # Voice (Chart Prep, Document) - red theme
├── lib/
│   ├── bedrock.ts                 # AWS Bedrock AI client
│   ├── cognito/                   # AWS Cognito auth helpers
│   ├── db.ts                      # RDS connection pools
│   ├── db-query.ts                # Query builder over node-postgres
│   └── diagnosisData.ts           # 166 diagnoses with ICD-10 codes
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

## Deployment

Deployed on AWS Amplify with push-to-deploy from `main`. Environment variables are set in the Amplify console.

## License

Proprietary - All rights reserved.
