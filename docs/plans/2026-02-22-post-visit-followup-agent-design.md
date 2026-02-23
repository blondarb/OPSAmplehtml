# Post-Visit AI Follow-Up Agent — Design Document

**Date:** 2026-02-22
**Card:** 5 (new addition to landing page)
**Route:** `/follow-up`
**Playbook:** `playbooks/04_post_visit_agent.md`

---

## Overview

AI-powered post-visit follow-up agent that contacts neurology patients after their office visit via text or voice to check on medication tolerance, side effects, symptom changes, and functional status. Follows a structured 7-module clinical interview script with 4-tier escalation logic.

## Approach

Full playbook POC scope (Approach A):
- Split-screen layout: chat conversation (left) + live clinician dashboard (right)
- Two modes: SMS text chat (default) + voice via OpenAI Realtime API
- Patient selector pulls from Supabase `patients` table + 6 seeded demo scenarios
- Post-conversation structured clinical summary
- All conversations logged to Supabase

## Tech Stack

| Component | Choice | Rationale |
|---|---|---|
| AI Model | GPT-5.2 | Matches existing project; best reasoning for clinical extraction |
| Voice | OpenAI Realtime API | Already integrated in codebase (`useRealtimeSession` hook) |
| Voice Abstraction | `FollowUpVoiceProvider` interface | Swappable for Vapi.ai/ElevenLabs later |
| Database | Supabase (new tables) | Matches existing pattern |
| API | Next.js App Router route | Matches existing pattern |
| Styling | Inline styles + Tailwind | Matches existing pattern |

## Page Layout

```
┌─────────────────────────────────────────────────────┐
│  Header: green (#16A34A) | ← Home | Post-Visit      │
│  Follow-Up Agent | Demo badge                        │
├─────────────────────┬───────────────────────────────┤
│  Patient Selector   │                               │
│  [dropdown + meds]  │   CLINICIAN DASHBOARD         │
│                     │                               │
│  Mode: [SMS][Voice] │   Status: in_progress         │
│                     │   Module: medication_check    │
│  ┌───────────────┐  │   Medication Status:          │
│  │ Chat Area     │  │     ✓ Levetiracetam filled   │
│  │               │  │   Escalation Flags:           │
│  │ AI: Hi, this  │  │     (none)                   │
│  │ is the...     │  │                               │
│  │               │  │   ─────────────────────       │
│  │ Patient: Yes  │  │   ESCALATION ALERT            │
│  │ I picked it   │  │   (flashes red/orange when    │
│  │ up...         │  │    triggered)                 │
│  │               │  │                               │
│  └───────────────┘  │   POST-CALL SUMMARY           │
│  [Type response...] │   (appears after wrap-up)     │
├─────────────────────┴───────────────────────────────┤
│  Phase 2 Voice Banner (if in SMS mode)              │
│  Disclaimer Banner                                   │
└─────────────────────────────────────────────────────┘
```

## Conversation Engine

### 7-Module Script (from playbook Section 4.2)

1. **Greeting & Consent** — AI identity disclosure, time check, caregiver detection
2. **Medication Check** — fill status, adherence, abrupt cessation detection
3. **Side Effects** — severity assessment, daily life impact
4. **Symptom Check** — new/worsening symptoms, red flag detection
5. **Functional Status** — better/worse/same (comparative, not 1-10 scale)
6. **Questions** — logistical answers directly, clinical flagged for clinician
7. **Wrap-Up** — summary, office number, sign-off

### Escalation Decision Tree (from playbook Section 6.3)

**Tier 1 — IMMEDIATE (Red):** Chest pain, stroke symptoms, seizure, suicidal ideation, allergic reaction (even if "resolved"), abrupt anti-epileptic/benzodiazepine cessation, sudden vision loss, fall with head injury/LOC. **Conversation terminates immediately.** Dashboard flashes red.

**Tier 2 — SAME-DAY (Orange):** Side effects impacting daily life, new neuro symptoms, worsening primary symptom, can't tolerate medication, patient feels significantly worse, significant distress. Dashboard shows orange alert.

**Tier 3 — NEXT-VISIT (Yellow):** Mild side effects, mild new symptoms, clinical questions, partial adherence, patient feels about the same.

**Tier 4 — INFORMATIONAL (Green):** No issues, taking meds as prescribed, patient feels better.

### Safety Guardrails

- AI never diagnoses, changes medications, or provides specific medical advice
- Strict canned refusal for dose-change requests
- Escalation is one-directional and conservative (never de-escalates)
- Dual-check: AI applies rules AND post-processing regex scans for trigger phrases
- Mandatory human review disclaimer on all summaries
- Business hours awareness for after-hours escalation routing

## Dual Mode: SMS + Voice

### SMS Mode (Default)
- Text chat interface with message bubbles (AI left, patient right)
- User types responses in text input
- Each message round-trips through `POST /api/follow-up/message`

### Voice Mode
- Uses OpenAI Realtime API (same pattern as existing `useRealtimeSession` hook)
- Real-time transcript displayed in chat area as conversation progresses
- Voice provider abstracted behind `FollowUpVoiceProvider` interface:
  ```typescript
  interface FollowUpVoiceProvider {
    connect(config: VoiceConfig): Promise<void>
    disconnect(): void
    sendSystemMessage(text: string): void
    onTranscript: (callback: (text: string, role: 'agent' | 'patient') => void) => void
    onEscalation: (callback: (details: EscalationDetails) => void) => void
  }
  ```
- Swappable for Vapi.ai/ElevenLabs in Phase 2 without touching conversation logic

## API Design

### `POST /api/follow-up/message`

Request:
```json
{
  "session_id": "uuid (null for first message)",
  "patient_message": "string",
  "patient_context": {
    "patient_name": "string",
    "visit_date": "date",
    "provider_name": "string",
    "medications": [{ "name": "string", "dose": "string", "new": true }],
    "visit_summary": "string"
  }
}
```

Response:
```json
{
  "session_id": "uuid",
  "agent_response": "string",
  "current_module": "greeting|medication|side_effects|symptoms|functional|questions|wrapup",
  "escalation_triggered": false,
  "escalation_details": null,
  "conversation_complete": false,
  "dashboard_update": {
    "status": "in_progress",
    "flags": [],
    "medication_status": [{ "medication": "name", "filled": true, "taking": true, "side_effects": [] }],
    "functional_status": null,
    "patient_questions": []
  }
}
```

### `POST /api/follow-up/realtime-session`

Returns an OpenAI Realtime API session token configured with the follow-up system prompt. Used for voice mode only.

### `GET /api/follow-up/[id]/summary`

Returns the structured post-call summary for a completed session.

## Supabase Schema

### `followup_sessions`

| Column | Type | Description |
|---|---|---|
| id | uuid (PK) | Session ID |
| created_at | timestamptz | Session start |
| patient_id | uuid (FK → patients) | Reference to patient |
| patient_name | text | Display name |
| visit_date | date | Visit date |
| provider_name | text | Treating neurologist |
| follow_up_method | text | 'voice' or 'sms' |
| conversation_status | text | in_progress, completed, abandoned, escalated |
| transcript | jsonb | Full conversation as message array |
| medications_discussed | jsonb | Medication status objects |
| side_effects_reported | jsonb | Reported side effects |
| new_symptoms_reported | jsonb | New symptoms |
| functional_status | text | better, worse, about_the_same |
| functional_details | text | Details if worse |
| caregiver_name | text | Caregiver name if applicable |
| caregiver_relationship | text | Relationship to patient |
| patient_questions | jsonb | Patient questions array |
| escalation_flags | jsonb | Escalation objects with severity |
| escalation_level | text | none, informational, next_visit, same_day, urgent |
| post_call_summary | text | Generated clinical summary |
| clinician_reviewed | boolean | Whether reviewed |
| ai_model_used | text | Model identifier |
| language_used | text | Auto-detected language |
| user_id | uuid | Owner (for RLS) |

### `followup_escalations`

| Column | Type | Description |
|---|---|---|
| id | uuid (PK) | Escalation ID |
| session_id | uuid (FK) | Reference to session |
| created_at | timestamptz | Timestamp |
| severity | text | urgent, same_day, next_visit, informational |
| trigger_text | text | Patient statement that triggered |
| trigger_category | text | Category of trigger |
| ai_assessment | text | AI's assessment |
| recommended_action | text | Recommended next step |
| acknowledged | boolean | Team acknowledged |

## Demo Patient Scenarios (Seeded)

1. **Maria Santos** (34F) — MS follow-up, Tecfidera 240mg BID. Happy path: filled, taking, mild flushing.
2. **James Okonkwo** (42M) — New epilepsy, Levetiracetam 500mg BID. Reports seizure → URGENT escalation.
3. **Dorothy Chen** (72F) — Memory clinic, Donepezil 5mg. Not filled (insurance). → Care coordinator flag.
4. **Robert Alvarez** (55M) — Parkinson's, carbidopa/levodopa increased. Reports hopelessness → CRITICAL escalation, script terminates.
5. **Harold Washington** (78M) — Alzheimer's, Donepezil 10mg. Caregiver (daughter Linda) answers. Mild nausea → Tier 3.
6. **Keisha Brown** (28F) — Epilepsy, Levetiracetam 750mg BID. Ran out 3 days ago → URGENT abrupt cessation.

## Homepage Card (Card 5)

- **Color:** Green `#16A34A` (light `#22C55E`, bg `rgba(22,163,74,0.15)`)
- **Icon:** Chat/phone bubble SVG
- **Title:** Post-Visit Follow-Up
- **Description:** AI-powered patient follow-up agent that checks on medication tolerance, side effects, and symptoms after a neurology visit — with real-time escalation alerts.
- **CTA:** Start Follow-Up Demo
- **Route:** `/follow-up`

## File Structure

```
src/
├── app/
│   ├── follow-up/
│   │   └── page.tsx                          # Main page
│   └── api/
│       └── follow-up/
│           ├── message/route.ts              # Conversation endpoint
│           ├── realtime-session/route.ts      # Voice session endpoint
│           └── [id]/summary/route.ts         # Post-call summary
├── components/
│   └── follow-up/
│       ├── PatientSelector.tsx               # Patient picker + context display
│       ├── ModeSelector.tsx                  # SMS / Voice toggle
│       ├── ChatConversation.tsx              # SMS chat interface
│       ├── MessageBubble.tsx                 # Individual message
│       ├── VoiceConversation.tsx             # Voice mode with transcript
│       ├── ClinicianDashboard.tsx            # Right panel dashboard
│       ├── EscalationAlert.tsx               # Flash alert component
│       ├── PostCallSummary.tsx               # Structured summary display
│       ├── DisclaimerBanner.tsx              # Safety disclaimer
│       └── CaregiverBadge.tsx               # Visual indicator for proxy
├── lib/
│   └── follow-up/
│       ├── types.ts                          # TypeScript types
│       ├── systemPrompt.ts                   # System prompt builder
│       ├── escalationRules.ts                # Regex trigger patterns
│       └── voiceProvider.ts                  # Voice abstraction interface
supabase/
└── migrations/
    └── 022_followup_sessions.sql             # New tables + seed data
```

## Deferred to Future Phases

- Real Twilio SMS sending
- EHR integration / write-back
- Multi-language template localization
- Scheduled automated outreach
- Analytics dashboards
- TCM/CCM billing workflow
- Multi-clinic deployment
