# Sevaro Clinical - AI-Powered Clinical Documentation

## Design System (MANDATORY)
- **Reference:** `~/dev/repos/sevaro-design-system/DESIGN_SYSTEM.md` — all colors, typography, components
- **Figma:** [Sevaro Design System](https://www.figma.com/design/2SvpMV4WE5CFjxvsxTRg1w/Sevaro-Design-System) (file key: `2SvpMV4WE5CFjxvsxTRg1w`)
- All UI must match the design system 1:1. Read the reference doc before building any UI component.

## Deploy Workflow (OPSAmple)

**Push-to-deploy is enabled.** After making code changes:
1. Run the local dev server (`preview_start`) and verify changes work (no console errors, feature functions correctly)
2. Commit and push to `main` — Amplify auto-deploys from `main`
3. Do NOT wait for user approval to commit/push — test locally first, then ship it

This applies to bug fixes, feature work, and infrastructure changes. Local testing is the safety gate, not a separate approval step.

## Project Overview

Sevaro Clinical is a web application for AI-powered clinical documentation, specifically designed for neurology outpatient practices. It provides clinical note creation, AI assistance, voice dictation, dot phrases, clinical scales, and patient management.

## Tech Stack

- **Framework**: Next.js 15.1.x with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS v3 + Inline Styles
- **Database**: AWS RDS (PostgreSQL) via node-postgres
- **Authentication**: AWS Cognito OAuth + PKCE via Hosted UI at `auth.neuroplans.app` (pool `us-east-2_9y6XyJnXC`, client `6rahc3cs4846f05gf7fbucqi4d`)
- **AI**: AWS Bedrock (Claude Sonnet 4.6) + OpenAI Whisper (transcription) + Realtime API (WebRTC)
- **SMS/Voice**: Twilio (SDK v5) for live patient follow-up demos
- **Deployment**: AWS Amplify (push-to-deploy from main)

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
│   │   │   │   ├── save/    # Save/list historian sessions
│   │   │   │   ├── localizer/ # Background localizer (Bedrock differential)
│   │   │   │   ├── escalation/ # Historian escalation handling
│   │   │   │   └── scales/  # Auto-administered clinical scales
│   │   │   ├── transcribe/# Voice transcription (Whisper)
│   │   │   └── visit-ai/  # Visit AI - full visit transcription & clinical extraction
│   │   │   └── draft-response/ # AI draft for patient messages (GPT-5-mini)
│   │   ├── allergies/     # Allergy CRUD API
│   │   ├── neuro-consults/ # Neurology consult pipeline
│   │   │   └── [id]/
│   │   │       ├── route.ts  # Consult CRUD
│   │   │       ├── sdne/     # SDNE integration (request/link/retrieve)
│   │   │       └── report/   # Unified report generation
│   │   ├── patient/
│   │   │   └── tools/     # Patient web tools (body map, motor tests)
│   │   ├── command-center/ # Command Center Revamp APIs
│   │   │   ├── actions/   # Action queue (list + approve + batch-approve)
│   │   │   ├── briefing/  # AI morning briefing (GPT-5.2)
│   │   │   ├── metrics/   # Status tile metrics
│   │   │   └── patients/  # Patient queue + AI summaries
│   │   ├── follow-up/     # Follow-Up Agent APIs
│   │   │   ├── message/   # Browser chat conversation turns
│   │   │   ├── send-sms/  # Initiate live SMS demo (Twilio)
│   │   │   └── twilio-sms/ # Inbound Twilio SMS webhook
│   │   ├── consults/      # Consult request CRUD
│   │   ├── incomplete-docs/ # Incomplete documentation detection
│   │   ├── medications/   # Medication CRUD API
│   │   ├── notifications/ # Unified notification system
│   │   ├── phrases/       # Dot phrases CRUD
│   │   ├── provider-messages/ # Provider messaging + threads
│   │   └── scales/        # Clinical scales API
│   ├── auth/              # Auth callback handler
│   ├── dashboard/         # Command Center (5-zone AI dashboard)
│   ├── ehr/               # Documentation (direct chart access, random patient)
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
│   ├── PhysicianHome.tsx  # Clinical Cockpit two-column home view (Schedule + Briefing, notification drawer)
│   ├── VoiceDrawer.tsx    # Voice & Dictation drawer (Chart Prep, Document)
│   ├── command-center/    # Command Center Revamp components (5-zone layout)
│   │   ├── CommandCenterPage.tsx    # Top-level orchestrator
│   │   ├── OperationalSummary.tsx   # Zone 1: Practice-wide operational summary
│   │   ├── MorningBriefing.tsx      # Cockpit time-phased briefing (Morning/Midday/End of Day, local fallback data)
│   │   ├── StatusBar.tsx            # Zone 2: 8 metric tiles
│   │   ├── ActionQueue.tsx          # Zone 3: Batch + individual actions
│   │   ├── PatientQueue.tsx         # Zone 4: Priority patient list
│   │   ├── QuickAccessStrip.tsx     # Zone 5: Feature links
│   │   ├── DisclaimerBanner.tsx     # Demo disclaimer
│   │   ├── ActionItemCard.tsx       # Single action card
│   │   ├── ActionBatchGroup.tsx     # Grouped batch-approvable actions
│   │   ├── DraftedContentPreview.tsx # Expandable AI draft preview
│   │   ├── PatientRow.tsx           # Level 1 scan row
│   │   ├── PatientDetailCard.tsx    # Level 2 expanded AI summary
│   │   ├── StatusTile.tsx           # Clickable metric card
│   │   ├── ConfidenceBadge.tsx      # High/Medium/Low pill
│   │   ├── UrgencyIndicator.tsx     # 4px colored left border
│   │   ├── SourceBadge.tsx          # Origin tag (Sevaro/EHR/Wearable)
│   │   ├── PendingItemBadges.tsx    # Icon+count badges
│   │   ├── RoleToggle.tsx           # My Patients / All Patients toggle
│   │   └── TimeRangeSelector.tsx    # Date display + range dropdown
│   ├── home/              # Clinical Cockpit sub-components
│   │   ├── ScheduleColumn.tsx     # Schedule with week-strip nav, mini-month grid, prep badges
│   │   ├── NotificationFeed.tsx   # Enhanced notification cards with inline clinical data, filter tabs
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
│   ├── command-center/
│   │   ├── types.ts       # Command Center TypeScript interfaces
│   │   ├── demoActions.ts # Shared demo action data for API routes
│   │   └── briefingPrompt.ts # GPT-5.2 system prompt + demo briefing
│   ├── follow-up/
│   │   ├── types.ts             # Follow-Up Agent TypeScript interfaces
│   │   ├── demoScenarios.ts     # 6 demo patient scenarios
│   │   ├── systemPrompt.ts      # AI system prompt builder
│   │   ├── escalationRules.ts   # Regex + merge escalation logic
│   │   ├── conversationEngine.ts # Shared AI turn logic (browser + SMS)
│   │   └── twilioClient.ts      # Twilio SMS send/validate helpers
│   ├── bedrock.ts         # AWS Bedrock client (Claude Sonnet 4.6)
│   ├── cognito/           # AWS Cognito auth helpers
│   ├── db.ts              # RDS connection pools (node-postgres)
│   ├── db-query.ts        # Query builder (Supabase-compatible API over RDS)
└── middleware.ts          # Auth middleware
```

## Database Schema

Tables in AWS RDS (PostgreSQL):

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
- **command_center_actions**: AI-suggested actions with confidence scoring, batch grouping, approval workflow
- **command_center_briefings**: Cached AI morning briefings with reasoning chain
- **followup_phone_sessions**: Ephemeral phone-to-session mapping for live Twilio demo (24hr auto-expiry)
- **neurology_consults**: Consult records with triage, intake, historian, localizer, SDNE fields (11-state status machine)
- **scale_results**: Clinical scale scores linked to consults
- **red_flag_events**: Detected red flags with severity and confidence
- **patient_body_map_markers**: Patient-reported symptom locations (26 body regions)
- **patient_device_measurements**: Phone-based assessments (finger tapping, tremor detection)
- **consult_reports**: Generated unified reports (draft/final/amended)

## Environment Variables

Required for deployment (set in Amplify console):

```
# Cognito Auth (OAuth + PKCE via Hosted UI SSO)
NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-2_9y6XyJnXC
NEXT_PUBLIC_COGNITO_CLIENT_ID=6rahc3cs4846f05gf7fbucqi4d
NEXT_PUBLIC_COGNITO_REGION=us-east-2
NEXT_PUBLIC_COGNITO_DOMAIN=auth.neuroplans.app
COGNITO_CLIENT_SECRET=<stored in Amplify>

# RDS PostgreSQL
RDS_HOST=sevaro-postgres.....us-east-2.rds.amazonaws.com
RDS_PORT=5432
RDS_USER=sevaro_admin
RDS_PASSWORD=...
RDS_DATABASE=ops_amplehtml

# Bedrock AI
BEDROCK_ACCESS_KEY_ID=...
BEDROCK_SECRET_ACCESS_KEY=...
BEDROCK_REGION=us-east-2
```

Optional:
```
OPENAI_API_KEY=sk-...           # Whisper transcription + Realtime API
TWILIO_ACCOUNT_SID=AC...        # Live follow-up agent SMS demo
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1XXXXXXXXXX
```

## Key Features

1. **Authentication**: OAuth + PKCE via Cognito Hosted UI SSO at `auth.neuroplans.app` (shared Evidence Engine pool). Login redirects to Hosted UI; tokens stored in httpOnly cookies (id_token 1h, refresh_token 30d). Proactive refresh every 50 minutes.

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
    - Two-column layout: Schedule (~380px) | Time-Phased Briefing (flex), with notification slide-over drawer
    - **Schedule Column**: Week-strip navigation (Mon–Fri) with prev/next arrows, toggleable mini-month grid with appointment dots, "Today" pill to jump back. Patient cards show time, name, type badge (New/Follow-up/Urgent), chief complaint, prep status dot (green/yellow/red), and alert icons.
    - **Time-Phased Briefing**: Adapts to time of day — Morning Briefing (sunrise icon, amber→teal gradient), Midday Update (sun icon, teal→blue), End of Day Summary (sunset icon, indigo→purple). Phase-specific narratives with "Regenerate" button and collapsible "Show reasoning" chain. Uses local demo fallback data (no API dependency).
    - **Notification Drawer**: Bell icon with badge count opens a 380px slide-over panel. Filter tabs (All/Urgent/Messages/Tasks) with counts. Enhanced notification cards with inline clinical data (vitals, wearable readings in code blocks), expandable detail sections, severity badges (CRITICAL/HIGH/MEDIUM/LOW), and "View Details" buttons.
    - **Navigation**: Breadcrumb bar ("< Home | Clinician Cockpit | Demo") persists across view modes. Home icon in sidebar returns to cockpit view.
    - **Badge System**: IconSidebar badges for unread notifications by category

14. **Command Center Revamp** (`/dashboard` — 5-zone layout):
    - **Zone 1 — AI Morning Briefing**: GPT-5.2-generated daily summary with gradient border, show reasoning, regenerate
    - **Zone 2 — Status Bar**: 8 clickable metric tiles (Pending Actions, Urgent Patients, Unread Messages, etc.) with trend arrows
    - **Zone 3 — Action Queue**: Batch-approvable groups (refills, scale reminders) + individual actions with confidence badges, drafted content preview, approve/dismiss with toast notifications
    - **Zone 4 — Patient Queue**: Urgency-sorted patient list with 3-level drill-down (scan row → AI summary card → full feature page), category/urgency/search filters
    - **Zone 5 — Quick Access**: 6 pill-shaped links to other Sevaro features + demo disclaimer banner
    - **Controls**: Role toggle (My Patients / All Patients), time range selector (Today / Yesterday / Last 7 Days)
    - **Confidence-based batch approval**: Only all-High-confidence batches get "Approve All" button
    - **17 demo actions** spanning 8 action types: refill, order, call, message, care_gap, pcp_summary, appointment, pa_followup, scale_reminder
    - **12 demo patients** with urgency levels, pending items, micro-summaries
    - **Design**: Dark gradient background (#0F172A → #1E293B), indigo accent, glassmorphic cards

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

### Database Access

All database queries use the `from()` and `wearableFrom()` builders from `@/lib/db-query`, backed by node-postgres connection pools to AWS RDS. Auth uses AWS Cognito via `@/lib/cognito/server`.

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

**Command Center Endpoints:**
- `/api/command-center/metrics` - GET: 8 aggregate status tile metrics
- `/api/command-center/actions` - GET: Action queue with batch groups
- `/api/command-center/actions/[id]/approve` - POST: Approve single action
- `/api/command-center/actions/batch-approve` - POST: Batch approve multiple actions
- `/api/command-center/patients` - GET: Priority patient queue (filterable)
- `/api/command-center/patients/[id]/summary` - GET: AI patient summary
- `/api/command-center/briefing` - POST: Generate AI morning briefing (GPT-5.2)

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
- **Sync command**: `npm run sync-plans` fetches JSON from GitHub and upserts to RDS `clinical_plans` table
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
- `docs/plans/2026-02-25-command-center-revamp-design.md` - Command Center 5-zone revamp design
- `docs/plans/2026-02-25-command-center-revamp-plan.md` - Command Center implementation plan (19 tasks)
- `docs/plans/2026-02-25-live-followup-agent-design.md` - Live Follow-Up Agent: Twilio + OpenAI Realtime for real phone demos

### Product Playbooks (`playbooks/`)

Comprehensive product playbooks for the 6-card Sevaro Ambulatory demo platform plus the homepage. **Read the relevant playbook before building or modifying any card's features, demo flow, data model, or AI prompts.**

| File | Card | Route(s) |
|------|------|----------|
| `playbooks/00_homepage_hero.md` | Homepage & Platform Shell | `/` |
| `playbooks/01_my_patients_schedule.md` | My Schedule & Documentation | `/physician` (schedule), `/ehr` (chart) |
| `playbooks/02_clinician_command_center.md` | Operations Dashboard | `/dashboard` |
| `playbooks/03_ai_triage.md` | AI-Powered Triage | `/triage` |
| `playbooks/04_post_visit_agent.md` | AI Follow-Up Agent | `/post-visit`, `/follow-up` |
| `playbooks/05_sdne.md` | Digital Neurological Exam | `/sdne` |
| `playbooks/06_wearable_monitoring.md` | Continuous Wearable Monitoring | `/wearable` |

Each playbook contains 10 sections: Executive Summary, How To Use, Clinical Context, Functional Requirements, Technical Architecture, AI & Algorithm Design, Safety & Guardrails, Demo Design, Phased Roadmap, and Open Questions. They include complete database schemas, API contracts, system prompts, and 3-minute demo scripts. Demo patients overlap across cards for continuity.

### Engineering Handoff Docs (February 2026)
- `docs/SCHEMA_REFERENCE.md` - Complete database schema for all RDS tables
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

Deployed on AWS Amplify. Push to `main` triggers auto-deploy.

Environment variables are set in the Amplify console (see "Environment Variables" section above).

## Git Workflow

- Main branch: `main` (production)
- Feature branches: `claude/review-repo-design-*`
- Push to feature branch, create PR, merge to main for deployment

## Recent Changes

- **OAuth SSO Migration (2026-03-27)**: Migrated auth from direct Cognito SDK (USER_PASSWORD_AUTH) to OAuth + PKCE via Cognito Hosted UI at `auth.neuroplans.app`. Removed `amazon-cognito-identity-js` dependency. Created new OAuth API routes (login, callback, logout, refresh, me). Replaced AuthContext with cookie-based auth (httpOnly cookies, proactive 50-min refresh). All 80+ API routes work unchanged via `getUser()`. Login page now redirects to SSO. Signup handled by Hosted UI. Evidence Engine pool `us-east-2_9y6XyJnXC`, client `6rahc3cs4846f05gf7fbucqi4d`.

- **Integrated Neuro Intake Engine — Phases 1–7 (2026-03-20)**: Built the complete 7-phase clinical pipeline: (1) Triage & Intake with 11-state ConsultStatus machine, (2) AI Historian integration with camelCase LocalizerRequest contract, (3) Background Localizer with Bedrock-powered differential generation, (4) Red Flag Escalation with 20+ pattern detector wired into useRealtimeSession, (5) Patient Web Tools — interactive SVG body map (26 regions), finger tapping test, accelerometer tremor detector, (6) SDNE Integration linking XR exam results to consults, (7) Unified Report Generator with pure-function builder and physician-facing viewer. New tables: `patient_body_map_markers`, `patient_device_measurements`, `consult_reports`, plus SDNE columns on `neurology_consults`. Migrations 036–038 pending against RDS. See `docs/HANDOFF_2026-03-20_neuro-intake-engine.md`.

- **AI Triage Consistency Improvements (2026-03-12)**: Pushed triage scoring consistency from 96% toward 99%+ target. Added clinical anchoring examples (2-3 neurology-specific examples per score level for all 5 dimensions) and tie-breaking rules to the system prompt. Changed production defaults: temperature 0.2→0 (greedy decoding), aligned maxTokens to 3000 across both route.ts and runTriage.ts. Added token usage passthrough in `invokeBedrockJSON` and logging to `triage_sessions` table (new `ai_input_tokens`/`ai_output_tokens` columns). Updated playbook pseudocode to reflect deterministic red flag escalation, synced system prompt section, replaced OpenAI model references with Bedrock Sonnet 4.6. Added Triage section to `docs/AI_PROMPTS_AND_MODELS.md`.

- **Wearable Narrative Enhancements (2026-03-05)**: Added "Generate 30-Day Summary" button to PatientTimeline header for longitudinal narrative generation. Added regenerate (refresh) buttons to ClinicalNarrativePanel and LongitudinalSummaryBanner. Added auto-generation logic that detects assessments without narratives on data load/poll/patient-switch and generates them sequentially with progress indicator.

- **AI Clinical Narrative Pipeline (2026-03-04)**: Split DiseaseTrack into MotorTrack + CognitiveTrack. Built 2-stage AI pipeline (Bedrock extraction → narrative) for `analyze-assessment`. "Generate AI Clinical Interpretation" buttons on each assessment card produce clinical narratives with severity-flagged findings. See `docs/HANDOFF_2026-03-04_clinical-narrative-pipeline.md`.

- **Wearable Dashboard Data Fixes (2026-03-02)**: Fixed 6 data display issues on `/wearable` for real Apple Watch data: resting HR 0 treated as null, sleep fallback to total bar when stages unavailable, server-side rolling 7-day averages, auto-computed baselines from actual data, diagnosis-aware Disease Track (ET vs PD), 15-minute auto-refresh polling. See `docs/HANDOFF_2026-03-02_wearable-dashboard-fixes.md`.

- **SevaroMonitor iOS Sleep Fixes (2026-03-02)**: Fixed overnight sleep split (6 PM-to-6 PM window instead of midnight) and added per-stage sleep breakdown (Deep, Light, REM, Awake) to HealthKit collection. Changes in `blondarb/SevaroMonitor` repo.

- **Live Follow-Up Agent Phase A: SMS (2026-02-25)**: Implemented real-phone SMS demo for Follow-Up Agent. User enters phone number on conversation page, receives a real Twilio text, replies via SMS, and the clinician dashboard updates via polling. New files: `twilioClient.ts` (send/validate), `conversationEngine.ts` (shared AI turn logic), `send-sms/route.ts` (initiate), `twilio-sms/route.ts` (webhook), `LiveDemoPanel.tsx` (UI). Migration 031 fixes schema mismatches and adds `followup_phone_sessions` table. Refactored `message/route.ts` to use shared engine. `ClinicianDashboard` now accepts `liveSessionId` prop for Realtime subscription. See `docs/plans/2026-02-25-live-followup-sms-plan.md` for implementation plan.

- **Cockpit/Dashboard Separation (2026-02-25)**: Separated Clinician Cockpit and Operations Dashboard into distinct tools. Cockpit (`/physician`) redesigned as a 2-column layout: Schedule (~380px, with week-strip nav, mini-month grid, prep badges) | Time-Phased Briefing (Morning/Midday/End of Day with phase-specific narratives, icons, gradients). Notifications moved to a bell-triggered 380px slide-over drawer with enhanced cards showing inline clinical data (vitals, wearable readings). Breadcrumb bar ("< Home | Clinician Cockpit | Demo") added for navigation. Dashboard (`/dashboard`) renamed to Operations Dashboard with new Zone 1 Operational Summary. Homepage rearranged to 4+3 layout. See `docs/plans/2026-02-25-cockpit-dashboard-separation-design.md`.

- **Live Follow-Up Agent Design (2026-02-25)**: Design doc for real phone demo — Twilio SMS + OpenAI Realtime voice. User enters phone number, gets a real text, can reply or call back. Dashboard updates in real-time. See `docs/plans/2026-02-25-live-followup-agent-design.md`. Playbook `04_post_visit_agent.md` updated with Phase 1.5 roadmap.

- **Physician Workspace Card Breakout**: Replaced single "Physician Workspace" homepage card with 3 cards:
  - **Clinician Dashboard** → `/dashboard` (Command Center — 5-zone AI dashboard)
  - **My Schedule** → `/physician` (schedule-first via `initialViewMode="appointments"`, click patient for inline chart swap)
  - **Documentation** → `/ehr` (lands directly on patient chart via `initialViewMode="chart"`, random patient selection, supports `?patient=ID`)
  - Command Center card moved from Ongoing Care track to Clinician track (Ongoing Care now has 2 cards: Follow-Up Agent + Wearable)
  - `ClinicalNote` now accepts `initialViewMode` prop (`'cockpit' | 'appointments' | 'chart'`)
  - `fetchDashboardData()` accepts optional `patientId` for specific patient loading
  - Client wrapper components (`PhysicianPageWrapper.tsx`, `EhrPageWrapper.tsx`) handle Server→Client icon serialization boundary

Full changelog: [`docs/CHANGELOG.md`](docs/CHANGELOG.md)

## Body of Work

**Status**: Active

### Recent
- **Feedback widget security hardening + API key (PRs #102-104, Apr 4)** — Prevented submission freeze on Edge/Windows (PR #102); HIPAA click redaction, CORS origin allowlist, input validation, AbortController timeouts (PR #103); added feedback API key to widget config (PR #104).
- **SSO client_secret fix (Mar 31)** — Added `COGNITO_CLIENT_SECRET` to `next.config` env inline for Amplify SSR runtime access; wired to OAuth token exchange flow to fix SSO login failure on Amplify.
- **OAuth SSO migration** to Cognito Hosted UI + PKCE with Amplify redirect fixes (PRs #100-101, Mar 27)
- **EHR Integration Phases 1-5** — patient flow, historian import, follow-up triggers, wearable unification, SDNE bridge, Twilio prep (PRs #94-99, Mar 26)
- **Notification feed wiring** to live API data with demo fallback (PR #93, Mar 26)
- **Consult state fixes** — validation, phrase scope filtering, draft column fix (PR #92, Mar 25)
- **Security hardening** — gate demo endpoints, harden secrets, remove dead code (PR #91, Mar 25)

### In Progress
- Diagnosis plan coverage expansion (98 plans in DB, 148/166 diagnoses covered)
- Real-time voice streaming during encounters

### Planned
- Speaker diarization UI (P2)
- Recommendation reconciliation engine (P2)
- Inpatient clinical scales (GCS, mRS, FOUR Score, Hunt & Hess, ICH, CAM-ICU, RASS)

### Known Issues
- Bedrock Amplify SSR env var wiring requires `next.config` inline for runtime access
- 18 neurology diagnoses still lack treatment plans in the database

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
