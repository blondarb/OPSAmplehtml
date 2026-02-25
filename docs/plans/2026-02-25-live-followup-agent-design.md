# Live Follow-Up Agent — Design Document

**Date:** 2026-02-25
**Status:** Draft
**Author:** Steve Arbogast + Claude

---

## 1. Goal

Add a **live, real-phone-call demo** to the AI Follow-Up Agent card. A user enters their cell phone number on the Sevaro website, receives an actual SMS from the AI agent, and can reply via text or call back the same number for a voice conversation. The clinician dashboard updates in real-time as the conversation happens.

This transforms the follow-up agent from a simulated in-browser demo into a working product that people can experience on their own phones.

---

## 2. Platform Decision

**Twilio + OpenAI Realtime API** (direct integration, no wrapper platform).

**Rationale:**
- User's organization already uses Twilio — familiar vendor, potential for shared infrastructure later
- No per-minute platform markup (Bland adds $0.09/min, Retell adds $0.07/min)
- Full control over conversation logic, prompts, and data flow
- OpenAI Realtime API is already used in the codebase for the Neurologic Historian
- Twilio free trial includes $15 in credits — enough for hundreds of demo interactions
- Long-term scaling path: move to organization's existing Twilio account for production

**Cost estimate (demo usage):**
- Twilio phone number: ~$1.15/month
- SMS: $0.0079/message sent, $0.0079/message received
- Voice telephony: ~$0.014/min
- OpenAI Realtime API: ~$0.06/min (audio input + output)
- Total for ~50 demo calls/month: ~$10-15

**Fallback:** If Twilio + OpenAI Realtime proves too complex for the voice bridge, Retell AI ($0.07/min, $2/month number, supports Twilio number import) can handle voice while Twilio handles SMS directly.

---

## 3. User Experience

### 3.1 Entry Point

The existing `/follow-up` hub page gets a new fourth tile: **"Try It Live"** alongside the existing Start Follow-Up, Analytics, and Billing tiles. Alternatively, a "Try It Live" panel can be added directly to the `/follow-up/conversation` page above the existing simulated demo.

### 3.2 Live Demo Flow

**Step 1:** User sees a "Try It Live" panel with:
- Phone number input (US format, validated)
- Demo scenario dropdown (6 existing scenarios)
- "Send Me a Text" button
- Privacy note: "Your number is used only for this demo and deleted after 24 hours."

**Step 2:** User clicks "Send Me a Text." Their phone receives an SMS within seconds:

> "Hi [name], this is the Sevaro Neurology care team following up after your recent visit with Dr. [provider] on [date]. We'd like to check in about your [medication]. You can reply here by text, or call this number if you'd prefer to talk. Reply STOP to opt out."

**Step 3a — SMS path:** User replies via text. AI responds via text. The 7-module conversation script runs (medication check → side effects → symptoms → functional status → questions → wrap-up). Each exchange updates the clinician dashboard on screen in real-time.

**Step 3b — Voice path:** User calls the number. AI answers with the greeting module, references any prior SMS context, and runs the same conversation script by voice. Dashboard updates live during the call.

**Step 4:** When the conversation ends (by completion or opt-out), a structured post-call summary appears on the clinician dashboard.

### 3.3 Dashboard Experience

The existing `ClinicianDashboard` component already handles real-time updates. For the live demo, it needs one enhancement: **Supabase real-time subscription** to the `followup_sessions` table so the dashboard updates even when the conversation is happening server-side (via Twilio webhooks) rather than client-side (via the in-browser chat).

Currently the dashboard state is passed as props from the conversation page. For live mode, it must also subscribe to Supabase changes for the active session ID.

---

## 4. Technical Architecture

### 4.1 New Files

```
src/
├── app/
│   └── api/
│       └── follow-up/
│           ├── send-sms/              # Triggers initial outbound SMS
│           │   └── route.ts
│           ├── twilio-sms/            # Webhook: receives inbound SMS replies
│           │   └── route.ts
│           ├── twilio-voice/          # Webhook: handles inbound voice calls
│           │   └── route.ts
│           └── twilio-status/         # Webhook: delivery & call status updates
│               └── route.ts
├── components/
│   └── follow-up/
│       └── LiveDemoPanel.tsx          # Phone input + scenario picker + send button
└── lib/
    └── follow-up/
        └── twilioClient.ts            # Twilio SDK helpers (send SMS, validate webhooks)
```

### 4.2 Supabase Schema Addition

**New table: `followup_phone_sessions`**

```sql
CREATE TABLE IF NOT EXISTS followup_phone_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number text NOT NULL,            -- User's phone (E.164: +1XXXXXXXXXX)
  session_id uuid REFERENCES followup_sessions(id),
  scenario_id text NOT NULL,             -- Which demo scenario was selected
  twilio_number text NOT NULL,           -- Twilio number used
  channel text DEFAULT 'sms',            -- 'sms' or 'voice' (tracks current channel)
  sms_history jsonb DEFAULT '[]'::jsonb, -- SMS messages for cross-channel context
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '24 hours'),
  opted_out boolean DEFAULT false
);

CREATE INDEX idx_phone_sessions_phone ON followup_phone_sessions(phone_number);
CREATE INDEX idx_phone_sessions_session ON followup_phone_sessions(session_id);
```

**Privacy:** Rows auto-expire after 24 hours. A scheduled Supabase function or cron can clean up expired rows. Phone numbers are not stored in `followup_sessions` — only in this ephemeral mapping table.

### 4.3 Data Flow: SMS Path

```
[Browser] User clicks "Send Me a Text"
    |
    v
POST /api/follow-up/send-sms
    |-- Validate phone number (E.164 format)
    |-- Look up selected demo scenario from DEMO_SCENARIOS
    |-- Create followup_sessions row (status: initiated, method: sms)
    |-- Create followup_phone_sessions row (maps phone → session)
    |-- Call Twilio REST API: send initial SMS
    |-- Return { session_id, status: 'sent' } to browser
    |
    v
[Twilio] Delivers SMS to user's phone
    |
    v
[User] Replies via SMS
    |
    v
[Twilio] POST /api/follow-up/twilio-sms (webhook)
    |-- Validate Twilio signature (security)
    |-- Extract: From (phone), Body (message text)
    |-- Look up followup_phone_sessions by phone_number
    |-- Load session + conversation history from followup_sessions
    |-- Build conversation_history from transcript column
    |-- Call existing message processing logic:
    |     buildFollowUpSystemPrompt(scenario)
    |     OpenAI gpt-5.2 completion
    |     scanForEscalationTriggers(patient_message)
    |     mergeEscalations()
    |-- Update followup_sessions (transcript, escalation, status, etc.)
    |-- Append to followup_phone_sessions.sms_history
    |-- Respond with TwiML: <Message>{agent_response}</Message>
    |
    v
[Twilio] Delivers AI response SMS to user's phone
    |
    v
[Browser] ClinicianDashboard picks up Supabase real-time update
```

### 4.4 Data Flow: Voice Path (User Calls Back)

```
[User] Calls the Twilio number that texted them
    |
    v
[Twilio] POST /api/follow-up/twilio-voice (webhook)
    |-- Validate Twilio signature
    |-- Look up followup_phone_sessions by caller phone number
    |-- If found: load session context + any SMS history
    |-- If not found: create new session with default scenario
    |-- Update channel to 'voice'
    |-- Return TwiML: <Connect><Stream url="wss://voice-bridge.your-domain/stream" /></Connect>
    |
    v
[Twilio Media Stream] WebSocket opens to voice bridge server
    |
    v
[Voice Bridge Server] (Node.js WebSocket — hosted on Railway/Fly.io/Render)
    |-- Opens connection to OpenAI Realtime API
    |-- Sends session.update with:
    |     - System prompt (buildFollowUpSystemPrompt + SMS context injection)
    |     - Voice: "alloy" or "nova"
    |     - Tools: escalation_flag, module_update, conversation_complete
    |-- Audio relay loop:
    |     Twilio audio (mulaw 8kHz) → convert → OpenAI Realtime
    |     OpenAI Realtime audio → convert → Twilio
    |-- On tool calls from OpenAI:
    |     - escalation_flag → POST to /api/follow-up/escalate or write directly to Supabase
    |     - module_update → update followup_sessions.current_module
    |     - conversation_complete → generate summary, update session status
    |-- On call end:
    |     - Write final transcript to followup_sessions
    |     - Generate post-call summary
    |     - Close OpenAI session
    |
    v
[Browser] ClinicianDashboard picks up Supabase real-time updates throughout
```

### 4.5 Voice Bridge Server

The Twilio ↔ OpenAI Realtime bridge is a lightweight Node.js WebSocket server. It cannot run on Vercel (no long-lived WebSocket support in standard serverless). Options:

| Platform | Cost | Setup |
|----------|------|-------|
| **Railway** | ~$5/month (usage-based) | `railway deploy` |
| **Fly.io** | Free tier available | `fly launch` |
| **Render** | Free tier (spins down after inactivity) | Git push deploy |

The bridge is ~150-200 lines of code. Its sole responsibility is:
1. Accept Twilio Media Stream WebSocket connections
2. Relay audio between Twilio and OpenAI Realtime
3. Handle OpenAI function calls (write to Supabase)
4. Convert audio formats (Twilio mulaw 8kHz ↔ OpenAI PCM 24kHz)

OpenAI publishes a reference implementation for this pattern: [Twilio + OpenAI Realtime integration guide](https://platform.openai.com/docs/guides/realtime-phone-calls).

### 4.6 Cross-Channel Context

When a user texts first, then calls:

1. SMS webhook stores each message in `followup_phone_sessions.sms_history`
2. Voice webhook retrieves that history
3. Voice bridge injects into the OpenAI Realtime system prompt:

```
## PRIOR SMS CONTEXT
The patient has already communicated the following via text before calling:
- Agent: "Hi Maria, this is the Sevaro Neurology care team..."
- Patient: "Yes I started the medication"
- Agent: "Great to hear. Have you noticed any side effects?"
Continue the conversation from Module 3 (Side Effects). Do not repeat questions already answered.
Current module: side_effects
```

### 4.7 Environment Variables

```env
# Twilio credentials
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1XXXXXXXXXX

# Webhook base URL (for Twilio to call back)
# In production this is the Vercel deployment URL
# Twilio webhooks must be publicly accessible
TWILIO_WEBHOOK_BASE_URL=https://ops-amplehtml.vercel.app

# Voice bridge WebSocket URL (hosted separately from Vercel)
VOICE_BRIDGE_WSS_URL=wss://sevaro-voice-bridge.up.railway.app
```

### 4.8 Security

- **Twilio webhook validation:** Every inbound webhook (`twilio-sms`, `twilio-voice`, `twilio-status`) validates the `X-Twilio-Signature` header using the Twilio auth token. This prevents spoofed requests.
- **Phone number privacy:** Numbers stored only in `followup_phone_sessions` with 24-hour auto-expiry. Not stored in `followup_sessions` or any analytics tables.
- **Rate limiting:** Max 1 active session per phone number. Max 5 sessions per phone number per 24 hours.
- **STOP handling:** If user texts "STOP", immediately set `opted_out = true`, cease all messaging, respond with opt-out confirmation per TCPA requirements.
- **No PHI in demo:** Demo scenarios use synthetic patient data. The user's phone number is the only real data, and it's ephemeral.

---

## 5. Reuse of Existing Code

The vast majority of the conversation logic already exists:

| Component | Status | Notes |
|-----------|--------|-------|
| System prompt (`buildFollowUpSystemPrompt`) | Reuse as-is | Already supports all 7 modules + escalation rules |
| Escalation rules (`scanForEscalationTriggers`) | Reuse as-is | 23 regex patterns, dual-layer detection |
| Demo scenarios (`DEMO_SCENARIOS`) | Reuse as-is | 6 scenarios with medications and context |
| Types (`types.ts`) | Reuse as-is | All interfaces already defined |
| Conversation API (`/api/follow-up/message`) | **Extract core logic** | Refactor into a shared function that both the existing in-browser chat and the new Twilio SMS webhook can call |
| `ClinicianDashboard` component | **Add Supabase subscription** | Currently prop-driven; needs real-time subscription for server-side updates |
| `PostCallSummary` component | Reuse as-is | Already fetches from `/api/follow-up/[id]/summary` |
| Supabase tables (`followup_sessions`, `followup_escalations`) | Reuse as-is | All columns already handle what's needed |

**New code to write:**
1. `LiveDemoPanel.tsx` — ~100 lines (form + button + status display)
2. `twilioClient.ts` — ~50 lines (send SMS helper, signature validation)
3. `/api/follow-up/send-sms/route.ts` — ~80 lines
4. `/api/follow-up/twilio-sms/route.ts` — ~120 lines (webhook + reuse message logic)
5. `/api/follow-up/twilio-voice/route.ts` — ~60 lines (TwiML response)
6. `/api/follow-up/twilio-status/route.ts` — ~40 lines (delivery receipts)
7. Voice bridge server — ~200 lines (standalone Node.js WebSocket)
8. Supabase migration for `followup_phone_sessions` — ~20 lines

**Estimated new code:** ~670 lines total.

---

## 6. UI Design: LiveDemoPanel

The `LiveDemoPanel` component appears on the `/follow-up/conversation` page as an alternative to the existing in-browser simulation.

**Layout:**
```
┌─────────────────────────────────────────────────┐
│  📱  Try It Live on Your Phone                  │
│                                                 │
│  Experience the AI follow-up agent on your      │
│  own phone. Pick a scenario, enter your number, │
│  and you'll get a real text message.            │
│                                                 │
│  ┌─ Scenario ──────────────────────────────┐    │
│  │ ▼ James Okonkwo — New epilepsy, Keppra  │    │
│  └──────────────────────────────────────────┘    │
│                                                 │
│  ┌─ Your Phone Number ─────────────────────┐    │
│  │ (555) 123-4567                           │    │
│  └──────────────────────────────────────────┘    │
│                                                 │
│  [ 🟢 Send Me a Text ]                         │
│                                                 │
│  🔒 Your number is used only for this demo      │
│     and automatically deleted after 24 hours.   │
│                                                 │
│  ─────────────────────────────────────────────  │
│  Status: ✅ SMS sent! Check your phone.         │
│  Session: Active — watching for replies...      │
│  💡 Reply to the text, or call the number back  │
│     to try the voice experience.                │
└─────────────────────────────────────────────────┘
```

After the SMS is sent, the existing `ClinicianDashboard` on the right side of the page activates and shows real-time updates as the user texts or calls.

---

## 7. Phased Implementation

### Phase A: SMS Only (1 session)
- Twilio account setup + phone number
- `send-sms` API route (outbound)
- `twilio-sms` webhook (inbound replies)
- `followup_phone_sessions` Supabase table
- `LiveDemoPanel` component
- Dashboard real-time subscription
- End-to-end SMS demo working

### Phase B: Voice Callback (1 session)
- Voice bridge server (Railway/Fly.io)
- `twilio-voice` webhook (TwiML + Media Stream)
- OpenAI Realtime integration in bridge
- Cross-channel context injection
- End-to-end voice demo working

### Phase C: Polish (0.5 session)
- STOP/opt-out handling
- Rate limiting
- Phone number cleanup cron
- Error states and retry logic
- Status webhook for delivery receipts

---

## 8. Open Questions

1. **Twilio account:** Create a new free trial account, or get added to the organization's existing account?
2. **Voice bridge hosting:** Railway vs Fly.io vs Render? All work; Railway is probably the simplest developer experience.
3. **Phone number type:** Local number ($1.15/month) vs toll-free ($2.15/month)? Toll-free may appear more professional for a demo.
4. **Voice persona:** Which OpenAI Realtime voice to use? "alloy" (neutral), "nova" (warm female), "shimmer" (clear female), "echo" (male).
5. **Demo page placement:** New hub tile on `/follow-up`, or integrated directly into `/follow-up/conversation`?

---

## 9. Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| `twilio` | ^5.x | Twilio Node.js SDK (send SMS, validate webhooks) |
| `ws` | ^8.x | WebSocket library (voice bridge server only) |
| OpenAI Realtime API | current | Voice AI (already in project for Historian) |
| Supabase Realtime | current | Dashboard live updates (already in project) |

Only `twilio` is a new dependency for the main Next.js app. The voice bridge is a separate small project with its own `package.json`.
