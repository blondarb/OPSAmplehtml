# Sevaro Clinical - Hospital Project Handoff

**Date:** February 3, 2026
**From:** Original dev team (Steve Arbogast)
**To:** Hospital project dev team
**Repo:** https://github.com/blondarb/OPSAmplehtml
**Live Demo:** https://ops-amplehtml.vercel.app/

---

## What Is This?

Sevaro Clinical is a fully functional AI-powered clinical documentation platform built for **neurology outpatient practices**. It's a working prototype deployed on Vercel with a Supabase backend and OpenAI integration. The app demonstrates the full physician workflow: view appointments, open a patient chart, document a visit using voice/AI/manual entry, generate a clinical note, sign it, and schedule a follow-up.

This is **not a toy prototype** — it has real database persistence, real AI calls (GPT-5.2 for complex tasks, GPT-4o-mini for simple ones), real voice transcription (Whisper), and a real-time AI voice interview system (OpenAI Realtime API over WebRTC).

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | Next.js 15.1.x (App Router) | TypeScript, server components + client components |
| Styling | Tailwind CSS v3 + Inline Styles | Most components use inline styles for rapid iteration |
| Database | Supabase (PostgreSQL) | RLS enabled, multi-tenant via tenant_id |
| Auth | Supabase Auth | Email/password, magic link |
| AI (text) | OpenAI GPT-5.2 / GPT-4o-mini | Complex extraction vs cost-effective Q&A |
| AI (voice) | OpenAI Whisper | Post-recording transcription |
| AI (realtime) | OpenAI Realtime API (WebRTC) | AI Historian voice interviews |
| Deployment | Vercel | Auto-deploy on push to main |

---

## How to Run Locally

```bash
# 1. Clone
git clone https://github.com/blondarb/OPSAmplehtml.git
cd OPSAmplehtml

# 2. Install
npm install

# 3. Environment variables (.env.local)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
# Optional (can also be stored in Supabase app_settings table):
OPENAI_API_KEY=sk-...

# 4. Database setup
# Run migrations in order from supabase/migrations/ via Supabase SQL Editor

# 5. Start
npm run dev
```

---

## Architecture Overview

### Application Layout

```
┌─────────────────────────────────────────────────────┐
│                    TopNav                            │
│  Logo | Search | Queue tabs | Timer | Settings      │
├──────┬──────────┬──────────────────────────┬────────┤
│ Icon │  Left    │      CenterPanel         │Drawers │
│ Side │  Side    │  (4 tabs: History,       │(slide  │
│ bar  │  bar     │   Imaging, Exam,         │ in)    │
│      │ (patient │   Recommendation)        │        │
│      │  info,   │                          │ Voice  │
│      │  prior   │                          │ AI     │
│      │  visits, │                          │ DotPhr │
│      │  scores) │                          │ Settings│
└──────┴──────────┴──────────────────────────┴────────┘
```

### Key Components

| Component | File | Purpose |
|-----------|------|---------|
| ClinicalNote | `src/components/ClinicalNote.tsx` | **Main orchestrator** — all state management, patient loading, autosave, sign/complete flow |
| CenterPanel | `src/components/CenterPanel.tsx` | 4-tab clinical documentation interface |
| LeftSidebar | `src/components/LeftSidebar.tsx` | Patient info, prior visits, score history, medications, View Full Note modal |
| TopNav | `src/components/TopNav.tsx` | Navigation header with timer, search, dark mode |
| VoiceDrawer | `src/components/VoiceDrawer.tsx` | Chart Prep (pre-visit dictation) + Document (full visit recording) |
| AiDrawer | `src/components/AiDrawer.tsx` | Ask AI, Patient Summary, Patient Handouts |
| EnhancedNotePreviewModal | `src/components/EnhancedNotePreviewModal.tsx` | Generate Note modal with AI synthesis, note review, section verification |
| PatientAppointments | `src/components/PatientAppointments.tsx` | Appointment list with date navigation |
| NeurologicHistorian | `src/components/NeurologicHistorian.tsx` | Patient-facing voice interview via WebRTC |

### Data Flow

```
Appointment List → Select Patient → Load from /api/patients/[id]
    ↓
ClinicalNote orchestrates state
    ↓
Manual entry / Voice dictation / AI assistance
    ↓
Pend (draft save via PATCH /api/visits/[id])
    ↓
Generate Note (AI synthesis via /api/ai/synthesize-note)
    ↓
Sign & Complete (POST /api/visits/[id]/sign → AI summary → mark completed)
    ↓
Schedule Follow-up (POST /api/appointments → new appointment)
    ↓
Next visit: prior visit appears in sidebar with AI summary
```

### API Routes

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/patients/[id]` | GET | Full patient data with visits, meds, allergies, scores |
| `/api/visits` | POST | Create new visit |
| `/api/visits/[id]` | GET/PATCH | Get or update visit + clinical note |
| `/api/visits/[id]/sign` | POST | Sign visit, generate AI summary |
| `/api/appointments` | GET/POST | List and create appointments |
| `/api/appointments/[id]` | PATCH/DELETE | Update appointment status |
| `/api/medications` | GET/POST | Patient medications CRUD |
| `/api/allergies` | GET/POST | Patient allergies CRUD |
| `/api/ai/ask` | POST | General clinical Q&A (GPT-4o-mini) |
| `/api/ai/chart-prep` | POST | Pre-visit dictation summary (GPT-4o-mini) |
| `/api/ai/visit-ai` | POST | Full visit transcription + extraction (GPT-5.2) |
| `/api/ai/transcribe` | POST | Whisper transcription |
| `/api/ai/synthesize-note` | POST | AI note synthesis from all sources (GPT-5.2) |
| `/api/ai/generate-assessment` | POST | Assessment generation from diagnoses (GPT-5.2) |
| `/api/ai/note-review` | POST | AI-powered note quality review (GPT-4o-mini) |
| `/api/ai/scale-autofill` | POST | Scale data extraction from clinical text (GPT-5.2) |
| `/api/ai/field-action` | POST | Improve/Expand/Summarize on fields (GPT-4o-mini) |
| `/api/ai/historian/session` | POST | Ephemeral WebRTC token for AI Historian |
| `/api/ai/historian/save` | GET/POST | Save/list AI Historian interview sessions |
| `/api/plans` | GET | Clinical treatment plans (127 plans in DB) |
| `/api/phrases` | GET/POST | Dot phrases CRUD |
| `/api/scales` | GET/POST | Clinical scale results |

### Database Schema (Key Tables)

| Table | Purpose |
|-------|---------|
| `patients` | Patient demographics, referral info |
| `appointments` | Scheduled appointments with date/time/type |
| `visits` | Visit records linked to patients and appointments |
| `clinical_notes` | Clinical documentation (HPI, ROS, exam, assessment, plan, vitals, AI summary) |
| `patient_medications` | Structured medication records |
| `patient_allergies` | Allergy records with severity |
| `clinical_plans` | 127 evidence-based treatment plans for neurology |
| `saved_plans` | User-customized plan selections |
| `scale_results` | Clinical scale scores (MIDAS, PHQ-9, MoCA, etc.) |
| `historian_sessions` | AI Historian voice interview transcripts and structured output |
| `dot_phrases` | Text expansion shortcuts |
| `app_settings` | Application config (OpenAI API key storage) |

All tables use `tenant_id` for multi-tenant isolation and have RLS policies enabled.

---

## Current Feature Status (February 3, 2026)

### Fully Working

- Appointment scheduling and management (date navigation, create, complete)
- Patient chart loading from appointment selection
- Clinical documentation across 4 tabs (History, Imaging/Results, Physical Exams, Recommendation)
- Two-tier Reason for Consult with 9 categories and 100+ sub-options
- 166 neurology diagnoses with ICD-10 codes, auto-populated from chief complaint
- Smart Recommendations: 127 evidence-based treatment plans with scored ICD-10 matching
- Voice dictation on all text fields (Whisper transcription)
- Chart Prep: pre-visit dictation with AI-categorized summary
- Document: full visit recording with structured clinical extraction
- AI Assistant: Ask AI, Patient Summary, Patient Handouts
- Generate Note: comprehensive AI synthesis from all data sources
- AI Note Review: automated quality/completeness analysis
- Sign & Complete: saves to DB, generates AI summary, marks visit completed
- Schedule Follow-up: modal with interval selection, creates appointment
- Prior visit display with AI summaries and View Full Note modal
- Patient History Summary: AI longitudinal summary with brief/standard/detailed modes
- 21 clinical scales (MIDAS, HIT-6, MoCA, PHQ-9, GAD-7, NIHSS, UPDRS, EDSS, etc.)
- AI Scale Autofill from clinical text
- Medications & Allergies: full CRUD with ~70-med neuro formulary
- 70+ pre-built dot phrases for neurology
- AI Neurologic Historian: real-time voice patient interviews via WebRTC
- Dark mode, responsive design (mobile/tablet/desktop), onboarding tour
- Autosave with cross-patient contamination protection

### Known Limitations / Not Yet Built

1. **18 diagnoses without treatment plans** (89% coverage, lower priority)
2. **Medications from note text don't populate structured list** — only medications added via the form appear in the medication list. Medications mentioned in HPI/Plan text (e.g., "ibuprofen PRN") require manual entry.
3. **Three voice recorder instances** — AiDrawer, VoiceDrawer, and settings each create their own recorder instance. Could be optimized.
4. **Real-time transcription** — currently post-recording only (not streaming)
5. **Speaker diarization** — not implemented in the UI
6. **No HIPAA audit logging** — would need to be added for production
7. **No EHR integration** — copy/paste workflow only (no HL7/FHIR)
8. **No real scheduling system** — appointments are simple database records, not integrated with a scheduling platform

---

## Key Files to Understand First

If your team is evaluating this for the hospital project, start with these files:

1. **`CLAUDE.md`** (root) — Comprehensive project reference including all features, API endpoints, design system, and recent changes. This is the most complete single-file overview.

2. **`docs/IMPLEMENTATION_STATUS.md`** — Detailed feature tracking with implementation notes and code-level details for every major feature.

3. **`docs/CONSOLIDATED_ROADMAP.md`** — Master roadmap showing what's complete, partial, and pending across all phases.

4. **`docs/PRD_Working_Demo_Workflow.md`** — The demo workflow spec with sample patient data (Maria Santos, Robert Chen) and step-by-step scenarios.

5. **`src/components/ClinicalNote.tsx`** — The heart of the app. All state management, patient switching, autosave, sign/complete, and data flow orchestration.

6. **`src/app/api/visits/[id]/sign/route.ts`** — The sign flow: generates AI summary, updates clinical_notes and visit status, handles appointment linkage.

---

## Demo Walkthrough

To see the full workflow in action:

1. **Open** https://ops-amplehtml.vercel.app/ and log in
2. **Appointments list** — see scheduled patients for today
3. **Click a patient** (e.g., Maria Santos) to open their chart
4. **History tab** — select Reason for Consult, document HPI
5. **Physical Exams tab** — enter vitals, check exam findings
6. **Recommendation tab** — select diagnoses, review Smart Recommendations, write assessment/plan
7. **Generate Note** (purple button) — AI synthesizes all data into a clinical note
8. **Sign & Complete** — saves, generates AI summary, opens follow-up scheduling modal
9. **Schedule Follow-up** — creates appointment for future date
10. **Navigate forward** (date arrow) to find the follow-up appointment
11. **Open follow-up** — prior visit shows in sidebar with AI summary; click "View Full Note" to see the full prior note

---

## Environment Variables

| Variable | Required | Notes |
|----------|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |
| `OPENAI_API_KEY` | Optional | Can also be stored in `app_settings` table in Supabase |

---

## Database Migrations

Migrations are in `supabase/migrations/` and should be run in order (001 through 016+). Key migrations:

| Migration | What it does |
|-----------|-------------|
| 001 | Initial schema (patients, visits, clinical_notes, etc.) |
| 002 | Seed demo data |
| 003-004 | Dot phrases |
| 010 | Historian sessions |
| 011 | Patient-centric historian (patient_id FK, referral fields) |
| 012 | Enriched patient context function |
| 013 | Clinical plans and saved plans |
| 014 | Medications and allergies |
| 015 | Demo reset function |
| 016 | Appointments table |

---

## Deployment

The app deploys automatically via GitHub → Vercel:

1. Push to `main` triggers production deploy
2. Push to feature branches creates preview deployments
3. Environment variables are set in Vercel project settings
4. After schema changes, run migrations in Supabase SQL Editor

When redeploying after changes, use **"Redeploy without cache"** in Vercel to ensure fresh builds.

---

## What Would Need to Change for Hospital Use

This section outlines what the hospital project team should consider when adapting this codebase:

### Security & Compliance
- Add HIPAA audit logging (access logs, data change logs)
- Implement proper role-based access control (currently simple auth)
- Add session timeout and automatic lock
- Review and harden RLS policies for multi-department use
- Add data encryption at rest (Supabase handles this, but verify)
- Remove demo reset functionality

### EHR Integration
- Add HL7 FHIR endpoints for interoperability
- Implement ADT (Admit/Discharge/Transfer) message handling
- Add CCDA document generation for note export
- Consider Epic/Cerner integration via their APIs

### Scaling Considerations
- The inline style approach works for rapid prototyping but may want migration to a design system (component library)
- Consider moving from localStorage autosave to server-side draft persistence
- Voice recordings are currently client-side only (processed and discarded) — may need server-side storage for compliance
- OpenAI API costs: GPT-5.2 for complex tasks is expensive at scale; consider fine-tuned models or self-hosted alternatives

### Multi-Specialty Expansion
- Diagnosis data (`diagnosisData.ts`) is neurology-specific — would need expansion for other specialties
- Clinical plans are neurology-specific — need specialty-specific plan libraries
- Exam templates and scales are neurology-focused
- AI prompts reference neurology context — would need parameterization

### Data Model Changes
- May need to add department/ward/unit hierarchy
- May need order management (lab orders, imaging orders)
- May need medication reconciliation workflow
- May need care team assignment
- May need bed management (for inpatient)

---

## Questions? Contact

- **Repo owner:** Steve Arbogast
- **GitHub:** https://github.com/blondarb/OPSAmplehtml
- **Documentation:** See `docs/` folder for PRDs, implementation status, and roadmap
- **QA:** See `qa/` folder for test runbook, test cases, and release checklist

---

*Document created: February 3, 2026*
