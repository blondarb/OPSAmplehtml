# Post-Visit Follow-Up Agent — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build Card 5 — an AI-powered post-visit follow-up agent with split-screen SMS/voice chat + clinician dashboard, 4-tier escalation logic, and Supabase persistence.

**Architecture:** Next.js App Router page at `/follow-up` with 3 API routes. Split-screen layout: left panel (patient selector + chat) and right panel (clinician dashboard). SMS mode uses GPT-5.2 via chat completions; voice mode uses OpenAI Realtime API via WebRTC (same pattern as existing historian). All conversations stored in Supabase.

**Tech Stack:** Next.js 15, React 18, TypeScript, OpenAI GPT-5.2 + Realtime API, Supabase, Tailwind + inline styles.

**Design Doc:** `docs/plans/2026-02-22-post-visit-followup-agent-design.md`

**Playbook:** `playbooks/04_post_visit_agent.md` (Section references throughout)

---

## Task 1: Create Git Branch

**Files:** None (git only)

**Step 1:** Create and switch to feature branch

```bash
cd /Users/stevearbogast/dev/repos/OPSamplehtml
git checkout -b feature/card-5-post-visit-agent
```

---

## Task 2: Supabase Migration — Tables + Demo Seed Data

**Files:**
- Create: `supabase/migrations/022_followup_sessions.sql`

**Step 1:** Write migration SQL

Creates `followup_sessions` and `followup_escalations` tables (schema from design doc Section "Supabase Schema"), plus inserts 6 demo patients from playbook Section 8.3 into the existing `patients` table with a `followup_demo_` prefix on MRN to avoid collisions.

Key details:
- `followup_sessions.patient_id` is FK to `patients(id)` with `ON DELETE SET NULL`
- `followup_escalations.session_id` is FK to `followup_sessions(id)` with `ON DELETE CASCADE`
- Indexes on `created_at DESC`, `escalation_level`, `conversation_status`, `patient_id`
- 6 demo patient INSERTs with `ON CONFLICT (mrn) DO NOTHING` to be idempotent
- Demo patients use a fixed `user_id` placeholder (`00000000-0000-0000-0000-000000000000`) since this is demo data

**Step 2:** Commit

```bash
git add supabase/migrations/022_followup_sessions.sql
git commit -m "feat(follow-up): add followup_sessions and followup_escalations tables with demo data"
```

---

## Task 3: TypeScript Types

**Files:**
- Create: `src/lib/follow-up/types.ts`

**Step 1:** Define all types for the follow-up system

Types needed (derived from design doc API section):
- `FollowUpModule` — union: `'greeting' | 'medication' | 'side_effects' | 'symptoms' | 'functional' | 'questions' | 'wrapup'`
- `EscalationTier` — union: `'urgent' | 'same_day' | 'next_visit' | 'informational'`
- `ConversationStatus` — union: `'idle' | 'in_progress' | 'completed' | 'abandoned' | 'escalated'`
- `FollowUpMethod` — union: `'sms' | 'voice'`
- `MedicationInfo` — `{ name: string; dose: string; isNew: boolean }`
- `PatientScenario` — `{ id: string; name: string; age: number; gender: string; diagnosis: string; visitDate: string; providerName: string; medications: MedicationInfo[]; visitSummary: string; scenarioHint?: string }`
- `MedicationStatus` — `{ medication: string; filled: boolean | null; taking: boolean | null; sideEffects: string[] }`
- `EscalationFlag` — `{ tier: EscalationTier; triggerText: string; category: string; aiAssessment: string; recommendedAction: string; timestamp: string }`
- `DashboardUpdate` — `{ status: ConversationStatus; currentModule: FollowUpModule; flags: EscalationFlag[]; medicationStatus: MedicationStatus[]; functionalStatus: string | null; functionalDetails: string | null; patientQuestions: string[]; caregiverInfo: { isCaregiver: boolean; name: string | null; relationship: string | null } }`
- `TranscriptEntry` — `{ role: 'agent' | 'patient'; text: string; timestamp: number }`
- `FollowUpMessageRequest` — request body type
- `FollowUpMessageResponse` — response body type
- `PostCallSummary` — structured summary fields

**Step 2:** Commit

```bash
git add src/lib/follow-up/types.ts
git commit -m "feat(follow-up): add TypeScript types"
```

---

## Task 4: System Prompt Builder

**Files:**
- Create: `src/lib/follow-up/systemPrompt.ts`

**Step 1:** Build the system prompt function

Function `buildFollowUpSystemPrompt(context: PatientScenario)` returns the full system prompt string. Content comes directly from playbook Section 6.4 with these template variables filled:
- `{patient_name}`, `{visit_date}`, `{provider_name}`, `{medications_json}`, `{visit_summary}`

The prompt includes:
- AI identity rules (Section 6.4 "YOUR IDENTITY")
- 7-module conversation flow (Modules 1-7)
- Full escalation rules with all tiers (Section 6.4 "ESCALATION RULES")
- Communication style rules (grade 6, short sentences, empathy)
- Strict output format: JSON with `agent_message`, `current_module`, `escalation_triggered`, `escalation_details`, `conversation_complete`, `extracted_data`
- "WHAT YOU MUST NEVER DO" guardrails (10 items)
- Caregiver handling instructions
- Abrupt cessation detection rules
- Canned refusal for dose changes

**Step 2:** Commit

```bash
git add src/lib/follow-up/systemPrompt.ts
git commit -m "feat(follow-up): add system prompt builder from playbook spec"
```

---

## Task 5: Escalation Rules (Regex Safety Net)

**Files:**
- Create: `src/lib/follow-up/escalationRules.ts`

**Step 1:** Build the dual-check escalation scanner

Function `scanForEscalationTriggers(text: string): EscalationFlag[]` scans patient text for known trigger phrases using regex. This is the secondary defense layer (playbook Section 6.5 — "dual-check: AI applies rules AND a post-processing regex layer").

Tier 1 patterns (from playbook Section 6.3):
- chest pain, difficulty breathing, can't breathe
- worst headache, thunderclap headache
- face droop, arm weakness, speech slurred, stroke
- seizure, convulsion, fit
- fall, hit my head, lost consciousness, passed out
- suicidal, kill myself, want to die, hopeless, self-harm, no point
- allergic reaction, rash, swelling, hives, anaphylaxis
- vision loss, can't see, blind, double vision
- stopped taking, ran out, quit, discontinued + medication names (levetiracetam, carbamazepine, lamotrigine, valproate, phenytoin, baclofen, tizanidine, benzodiazepine, clonazepam, lorazepam, diazepam)

Tier 2 patterns:
- can't function, can't work, can't sleep, interfering with daily
- new symptom, never had before, started having
- getting worse, much worse, significantly worse
- can't tolerate, makes me sick, can't take it
- very anxious, very scared, terrified, panicking

Returns array of `EscalationFlag` objects with tier, trigger text, category, and recommended action.

**Step 2:** Commit

```bash
git add src/lib/follow-up/escalationRules.ts
git commit -m "feat(follow-up): add regex-based escalation safety net"
```

---

## Task 6: Demo Patient Scenarios Data

**Files:**
- Create: `src/lib/follow-up/demoScenarios.ts`

**Step 1:** Define the 6 hardcoded demo scenarios

Export `DEMO_SCENARIOS: PatientScenario[]` with all 6 scenarios from playbook Section 8.3:

1. Maria Santos (34F) — MS, Tecfidera 240mg BID
2. James Okonkwo (42M) — Epilepsy, Levetiracetam 500mg BID
3. Dorothy Chen (72F) — Memory clinic, Donepezil 5mg
4. Robert Alvarez (55M) — Parkinson's, carbidopa/levodopa
5. Harold Washington (78M) — Alzheimer's, Donepezil 10mg (caregiver scenario)
6. Keisha Brown (28F) — Epilepsy, Levetiracetam 750mg BID

Each scenario includes: id (prefixed UUID), name, age, gender, diagnosis, visitDate, providerName, medications array, visitSummary, and a scenarioHint describing what demo behavior to expect.

**Step 2:** Commit

```bash
git add src/lib/follow-up/demoScenarios.ts
git commit -m "feat(follow-up): add 6 demo patient scenarios from playbook"
```

---

## Task 7: API — POST /api/follow-up/message

**Files:**
- Create: `src/app/api/follow-up/message/route.ts`

**Step 1:** Implement the conversation endpoint

Pattern: matches existing `src/app/api/triage/route.ts` structure.

Flow:
1. Parse request body (`session_id`, `patient_message`, `patient_context`, `conversation_history`)
2. Get OpenAI API key (env var first, then Supabase `app_settings` fallback — same pattern as triage)
3. Build system prompt via `buildFollowUpSystemPrompt(patient_context)`
4. Construct messages array: system prompt + conversation history + new patient message
5. Call OpenAI `chat.completions.create` with model `gpt-5.2`, response_format `json_object`
6. Parse the JSON response into `FollowUpMessageResponse`
7. Run `scanForEscalationTriggers(patient_message)` as secondary check
8. Merge any regex-detected escalations with AI-detected ones (take the higher tier)
9. If this is first message (`session_id` is null), create a new `followup_sessions` row in Supabase
10. Update the session row with latest transcript, medication status, escalation level
11. If escalation triggered, insert into `followup_escalations`
12. Return the structured response

Model: `gpt-5.2` (matches existing triage/assessment routes)

**Step 2:** Commit

```bash
git add src/app/api/follow-up/message/route.ts
git commit -m "feat(follow-up): add conversation message API endpoint"
```

---

## Task 8: API — POST /api/follow-up/realtime-session

**Files:**
- Create: `src/app/api/follow-up/realtime-session/route.ts`

**Step 1:** Implement the voice session endpoint

Pattern: matches existing `src/app/api/ai/historian/session/route.ts` exactly.

Flow:
1. Parse request body (`patient_context: PatientScenario`)
2. Get OpenAI API key from env
3. Build follow-up system prompt via `buildFollowUpSystemPrompt(patient_context)`
4. Request ephemeral token from `https://api.openai.com/v1/realtime/sessions` with:
   - `model: 'gpt-realtime'`
   - `voice: 'verse'` (warm, professional — matches playbook voice characteristics)
   - `instructions`: the system prompt (adapted for voice — remove JSON output format requirement, use natural conversation instead)
   - `input_audio_transcription: { model: 'whisper-1' }`
   - `turn_detection: { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 700 }`
   - `tools`: a `save_followup_output` tool definition for structured data extraction at conversation end
5. Return `{ ephemeralKey, sessionId, expiresAt }`

**Step 2:** Commit

```bash
git add src/app/api/follow-up/realtime-session/route.ts
git commit -m "feat(follow-up): add realtime voice session API endpoint"
```

---

## Task 9: API — GET /api/follow-up/[id]/summary

**Files:**
- Create: `src/app/api/follow-up/[id]/summary/route.ts`

**Step 1:** Implement summary retrieval

Simple GET endpoint:
1. Extract `id` from route params
2. Query `followup_sessions` by id from Supabase
3. If session not found, return 404
4. If `post_call_summary` is already populated, return it
5. If not, generate the summary from session data using the post-call summary template from playbook Section 4.6
6. Update the session row with the generated summary
7. Return the summary

**Step 2:** Commit

```bash
git add "src/app/api/follow-up/[id]/summary/route.ts"
git commit -m "feat(follow-up): add post-call summary API endpoint"
```

---

## Task 10: Component — PatientSelector

**Files:**
- Create: `src/components/follow-up/PatientSelector.tsx`

**Step 1:** Build patient selector dropdown

Props: `{ onSelect: (scenario: PatientScenario) => void; disabled: boolean }`

UI:
- Section header "Select Patient"
- Dropdown (`<select>`) with two option groups:
  - "Demo Scenarios" — the 6 hardcoded scenarios with hint text
  - "Clinic Patients" — loaded from Supabase `patients` table via fetch on mount
- When a demo scenario is selected, show a context card below with: name, age/gender, diagnosis, medications, visit summary, and the scenario hint in a subtle info box
- When a clinic patient is selected, show basic info and prompt for medication/visit context (since real patients don't have pre-populated follow-up data)
- "Initiate Follow-Up" button at the bottom (calls `onSelect`)

Styling: matches existing card patterns — `background: '#1e293b'`, `border: '1px solid #334155'`, `borderRadius: '12px'`

**Step 2:** Commit

```bash
git add src/components/follow-up/PatientSelector.tsx
git commit -m "feat(follow-up): add PatientSelector component"
```

---

## Task 11: Component — ModeSelector

**Files:**
- Create: `src/components/follow-up/ModeSelector.tsx`

**Step 1:** Build SMS/Voice toggle

Props: `{ mode: 'sms' | 'voice'; onModeChange: (mode: 'sms' | 'voice') => void; disabled: boolean }`

UI: Two side-by-side buttons in a pill-shaped container. Active mode has green background (`#16A34A`), inactive has transparent background with gray text. Icons: chat bubble for SMS, microphone for voice.

**Step 2:** Commit

```bash
git add src/components/follow-up/ModeSelector.tsx
git commit -m "feat(follow-up): add ModeSelector component"
```

---

## Task 12: Component — MessageBubble

**Files:**
- Create: `src/components/follow-up/MessageBubble.tsx`

**Step 1:** Build individual message bubble

Props: `{ entry: TranscriptEntry; isLatest: boolean }`

UI:
- Agent messages: left-aligned, gray background (`#334155`), white text
- Patient messages: right-aligned, green background (`#16A34A`), white text
- Small timestamp below each bubble
- Typing indicator animation for the latest AI message if streaming

**Step 2:** Commit

```bash
git add src/components/follow-up/MessageBubble.tsx
git commit -m "feat(follow-up): add MessageBubble component"
```

---

## Task 13: Component — ChatConversation (SMS Mode)

**Files:**
- Create: `src/components/follow-up/ChatConversation.tsx`

**Step 1:** Build the SMS chat interface

Props: `{ scenario: PatientScenario; onDashboardUpdate: (update: DashboardUpdate) => void; onConversationComplete: (sessionId: string) => void; onEscalation: (flag: EscalationFlag) => void }`

State: `transcript: TranscriptEntry[]`, `inputText: string`, `loading: boolean`, `sessionId: string | null`, `conversationComplete: boolean`, `conversationHistory: {role: string, content: string}[]`

UI:
- Scrollable message area showing all `MessageBubble` components, auto-scrolls to bottom
- Text input at bottom with send button (disabled while loading)
- Enter key sends message
- When conversation starts, automatically sends first message (empty patient message triggers the greeting module)
- Each send: POST to `/api/follow-up/message` with session_id, patient_message, patient_context, conversation_history
- On response: append agent message to transcript, update dashboard via callback, check for escalation
- If `conversation_complete` is true in response, disable input and show "Conversation complete" message

**Step 2:** Commit

```bash
git add src/components/follow-up/ChatConversation.tsx
git commit -m "feat(follow-up): add ChatConversation component"
```

---

## Task 14: Component — VoiceConversation

**Files:**
- Create: `src/components/follow-up/VoiceConversation.tsx`
- Create: `src/hooks/useFollowUpRealtimeSession.ts`

**Step 1:** Build the voice mode hook

`useFollowUpRealtimeSession` — adapted from existing `useRealtimeSession` hook (`src/hooks/useRealtimeSession.ts`).

Key differences from the historian version:
- Calls `/api/follow-up/realtime-session` instead of `/api/ai/historian/session`
- Safety keywords expanded to match playbook Tier 1 triggers (seizure, stroke, chest pain, etc.)
- Tool call name is `save_followup_output` instead of `save_interview_output`
- `onEscalation` callback for real-time escalation detection from transcript text
- Runs `scanForEscalationTriggers()` on each user transcript segment

Returns same interface shape: `{ status, transcript, currentAssistantText, currentUserText, isAiSpeaking, isUserSpeaking, duration, error, startSession, endSession }`

**Step 2:** Build VoiceConversation component

Props: `{ scenario: PatientScenario; onDashboardUpdate: (update: DashboardUpdate) => void; onConversationComplete: (sessionId: string) => void; onEscalation: (flag: EscalationFlag) => void }`

UI:
- Same scrollable transcript area as ChatConversation (reuses `MessageBubble`)
- Voice status indicator at bottom (idle, connecting, active, speaking, listening)
- Start/Stop buttons
- Real-time transcript updates as conversation progresses
- Visual indicators for AI speaking vs user speaking

**Step 3:** Commit

```bash
git add src/hooks/useFollowUpRealtimeSession.ts src/components/follow-up/VoiceConversation.tsx
git commit -m "feat(follow-up): add VoiceConversation component with realtime session hook"
```

---

## Task 15: Component — ClinicianDashboard

**Files:**
- Create: `src/components/follow-up/ClinicianDashboard.tsx`

**Step 1:** Build the right-panel dashboard

Props: `{ dashboard: DashboardUpdate | null; escalationAlert: EscalationFlag | null; sessionId: string | null }`

UI sections (stacked vertically in right panel):
1. **Conversation Status** — badge showing current status + current module name
2. **Medication Status** — list of medications with filled/taking/side-effects checkmarks
3. **Functional Status** — shows better/worse/same when Module 5 completes
4. **Patient Questions** — list of flagged questions
5. **Escalation Flags** — list of all flags with color-coded severity badges
6. **Caregiver Info** — shows caregiver badge if applicable

Colors match playbook Section 4.5:
- Urgent: red (`#DC2626`)
- Same-day: orange (`#EA580C`)
- Next-visit: yellow (`#EAB308`)
- Informational: green (`#16A34A`)

When in idle state (no conversation started), show placeholder text.

**Step 2:** Commit

```bash
git add src/components/follow-up/ClinicianDashboard.tsx
git commit -m "feat(follow-up): add ClinicianDashboard component"
```

---

## Task 16: Component — EscalationAlert

**Files:**
- Create: `src/components/follow-up/EscalationAlert.tsx`

**Step 1:** Build the flash alert overlay

Props: `{ flag: EscalationFlag | null; onDismiss: () => void }`

UI:
- When `flag` is non-null, renders an overlay banner at the top of the dashboard panel
- Tier 1 (urgent): red background with pulse animation, "URGENT ESCALATION" header
- Tier 2 (same_day): orange background, "SAME-DAY CALLBACK REQUIRED"
- Shows: trigger text, category, recommended action
- "Acknowledge" button to dismiss
- CSS keyframe animation for the flash/pulse effect (matches playbook Section 8.2 "wow moment 1")

**Step 2:** Commit

```bash
git add src/components/follow-up/EscalationAlert.tsx
git commit -m "feat(follow-up): add EscalationAlert flash component"
```

---

## Task 17: Component — PostCallSummary

**Files:**
- Create: `src/components/follow-up/PostCallSummary.tsx`

**Step 1:** Build the structured summary display

Props: `{ sessionId: string }`

On mount, fetches `GET /api/follow-up/{sessionId}/summary`.

UI: Renders the structured clinical note format from playbook Section 4.6 in a styled card:
- Header: date, patient, visit date, provider, method, duration
- Sections: Medication Status, Symptom Update, Functional Status, Patient Questions, Escalation Flags, AI Recommendation
- Footer: "Generated by AI Follow-Up Agent | Reviewed by: [pending clinician review]" disclaimer
- "Copy to Clipboard" button for the text version

**Step 2:** Commit

```bash
git add src/components/follow-up/PostCallSummary.tsx
git commit -m "feat(follow-up): add PostCallSummary component"
```

---

## Task 18: Component — DisclaimerBanner

**Files:**
- Create: `src/components/follow-up/DisclaimerBanner.tsx`

**Step 1:** Build disclaimer

Matches playbook Section 7.4 text:
> "This is a demonstration of an AI-powered post-visit follow-up system. In production, all conversations are reviewed by a licensed clinician before clinical action is taken."

Styling matches existing triage `DisclaimerBanner` pattern.

**Step 2:** Commit

```bash
git add src/components/follow-up/DisclaimerBanner.tsx
git commit -m "feat(follow-up): add DisclaimerBanner component"
```

---

## Task 19: Main Page — /follow-up

**Files:**
- Create: `src/app/follow-up/page.tsx`

**Step 1:** Build the main page

Assembles all components into the split-screen layout from the design doc.

Page state machine:
- `'select'` — Patient selector visible, no conversation. Dashboard shows placeholder.
- `'active'` — Conversation in progress (SMS or voice). Dashboard updates live.
- `'complete'` — Conversation finished. PostCallSummary displayed.

Layout:
1. **Header bar** — green (`#16A34A`), back link to `/`, title, Demo badge. Pattern matches triage page header.
2. **Intro text** — centered description below header
3. **Split panel container** — flexbox row, `gap: 24px`
   - Left (~60%): PatientSelector (in select state) → ModeSelector + ChatConversation or VoiceConversation (in active state)
   - Right (~40%): ClinicianDashboard + EscalationAlert overlay
4. **Below split**: DisclaimerBanner

State management:
- `selectedScenario: PatientScenario | null`
- `mode: 'sms' | 'voice'`
- `pageState: 'select' | 'active' | 'complete'`
- `dashboard: DashboardUpdate | null`
- `escalationAlert: EscalationFlag | null`
- `sessionId: string | null`

**Step 2:** Commit

```bash
git add src/app/follow-up/page.tsx
git commit -m "feat(follow-up): add main /follow-up page with split-screen layout"
```

---

## Task 20: Homepage — Add Card 5

**Files:**
- Modify: `src/components/LandingPage.tsx`

**Step 1:** Add a 5th card to the landing page

Insert after the AI Triage Tool card (after line 289 in LandingPage.tsx). Pattern matches the existing 4 cards exactly:
- Color: green `#16A34A` (hover border), `rgba(22,163,74,0.15)` (icon bg), `#4ADE80` (icon stroke)
- Icon: chat bubble with checkmark SVG (represents follow-up communication)
- Title: "Post-Visit Follow-Up"
- Description: "AI-powered patient follow-up agent that checks on medication tolerance, side effects, and symptoms after a neurology visit — with real-time escalation alerts."
- CTA button: "Start Follow-Up Demo" with green background
- Route: `/follow-up`

**Step 2:** Commit

```bash
git add src/components/LandingPage.tsx
git commit -m "feat(follow-up): add Card 5 to homepage"
```

---

## Task 21: Typecheck + Final Commit

**Step 1:** Run typecheck

```bash
cd /Users/stevearbogast/dev/repos/OPSamplehtml
npx tsc --noEmit
```

Fix any type errors.

**Step 2:** Final commit if any fixes needed

```bash
git add -A
git commit -m "fix(follow-up): resolve type errors"
```

---

## Task 22: Push Branch

**Step 1:** Push to remote

```bash
git push -u origin feature/card-5-post-visit-agent
```

---

## Summary of Files Created/Modified

**New files (19):**
```
supabase/migrations/022_followup_sessions.sql
src/lib/follow-up/types.ts
src/lib/follow-up/systemPrompt.ts
src/lib/follow-up/escalationRules.ts
src/lib/follow-up/demoScenarios.ts
src/app/api/follow-up/message/route.ts
src/app/api/follow-up/realtime-session/route.ts
src/app/api/follow-up/[id]/summary/route.ts
src/components/follow-up/PatientSelector.tsx
src/components/follow-up/ModeSelector.tsx
src/components/follow-up/MessageBubble.tsx
src/components/follow-up/ChatConversation.tsx
src/components/follow-up/VoiceConversation.tsx
src/components/follow-up/ClinicianDashboard.tsx
src/components/follow-up/EscalationAlert.tsx
src/components/follow-up/PostCallSummary.tsx
src/components/follow-up/DisclaimerBanner.tsx
src/hooks/useFollowUpRealtimeSession.ts
src/app/follow-up/page.tsx
```

**Modified files (1):**
```
src/components/LandingPage.tsx (add Card 5)
```
