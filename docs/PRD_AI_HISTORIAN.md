# PRD: AI Neurologic Historian

## Document Information

| Field | Value |
|-------|-------|
| Version | 1.0 |
| Last Updated | February 2026 |
| Status | Production |
| Owner | Sevaro Clinical Engineering |

---

## 1. Overview

The AI Neurologic Historian is a voice-powered patient intake interview system that conducts structured neurological history-taking before patients see their neurologist. Using OpenAI's Realtime API over WebRTC, it provides a natural conversational experience where an AI conducts the interview entirely by voice.

### Key Capabilities

- **Voice-first interaction**: Patients speak naturally; no typing required
- **Structured clinical output**: Extracts chief complaint, HPI, medications, allergies, PMH, ROS
- **Two interview flows**: New patient (OLDCARTS framework) and follow-up visits
- **Safety monitoring**: Real-time detection of crisis situations with escalation protocol
- **Red flag identification**: Clinical red flags identified with severity scoring
- **EHR integration**: One-click import of structured data into clinical notes

### Architecture

```
Patient Browser                 Server                    OpenAI
     |                            |                         |
     |-- POST /api/ai/historian/session ------------------>|
     |<-- { ephemeralKey } --------------------------------|
     |                            |                         |
     |========= WebRTC (audio/data) ======================>|
     |<=============== Audio + Events =====================|
     |                            |                         |
     |-- POST /api/ai/historian/save ---->|                |
     |                          [Supabase]                 |
```

The client connects **directly to OpenAI** via WebRTC. The server only:
1. Issues ephemeral tokens (Vercel-compatible, no WebSocket servers)
2. Saves completed sessions to the database

---

## 2. User Stories

### 2.1 Patient-Facing

| ID | Story | Priority |
|----|-------|----------|
| P1 | As a patient, I want to complete my intake interview by voice so I don't have to type on a form | P0 |
| P2 | As a patient, I want the AI to ask me one question at a time so I can focus on each answer | P0 |
| P3 | As a patient, I want to see what the AI is saying transcribed in real-time in case I mishear | P1 |
| P4 | As a patient, I want to be routed to crisis resources if I express suicidal/homicidal ideation | P0 |
| P5 | As a patient, I want confirmation when my interview is complete and saved | P1 |
| P6 | As a returning patient, I want the AI to know about my prior visits so I don't repeat information | P1 |

### 2.2 Physician-Facing

| ID | Story | Priority |
|----|-------|----------|
| D1 | As a physician, I want to see completed historian sessions for my patients | P0 |
| D2 | As a physician, I want to import structured interview data into my clinical note with one click | P0 |
| D3 | As a physician, I want to see red flags identified during the interview | P0 |
| D4 | As a physician, I want to be alerted when a session triggered safety escalation | P0 |
| D5 | As a physician, I want to view the full transcript of the interview | P1 |
| D6 | As a physician, I want to see a narrative summary of the interview | P1 |

---

## 3. Patient-Facing Interview UI

### 3.1 Component: NeurologicHistorian.tsx

**Location**: `/src/components/NeurologicHistorian.tsx`

**Route**: `/patient/historian`

### 3.2 State Machine

```
                                        +------------------+
                                        |  SCENARIO_SELECT |
        +------------------------------>|   (or LOADING)   |
        |                               +--------+---------+
        |                                        |
        |                               handleStartInterview()
        |                                        v
        |                               +--------+---------+
        |                               |    CONNECTING    |
        |                               +--------+---------+
        |                                        |
        |                               WebRTC established
        |                                        v
        |                               +--------+---------+
        |                               |      ACTIVE      |
        |                               +--------+---------+
        |                                   /         \
        |                      handleEndInterview()   safety keyword detected
        |                                 |                   |
        |                                 v                   v
        |                         +------+------+    +--------+---------+
        |                         |   ENDING    |    | SAFETY_ESCALATION|
        |                         +------+------+    +------------------+
        |                                |                    |
        |                        onComplete callback     handleBackToPortal()
        |                                v                    |
        |                         +------+------+             |
        +-------------------------+   COMPLETE  +<------------+
                                  +-------------+
```

### 3.3 Phase: Scenario Select

**Purpose**: Patient selects how to start their interview

**For real patients** (patient_id in URL):
- Loads patient context from database
- Shows patient card with name, referral reason, prior visit info
- Determines session type automatically (new_patient vs follow_up)

**For demo scenarios**:
- Shows 4 predefined demo scenarios
- Each scenario has: label, session_type, referral_reason, description

**Demo Scenarios**:

| ID | Label | Type | Description |
|----|-------|------|-------------|
| headache_new | New Patient: Headache Referral | new_patient | First-time neurology visit for persistent headaches |
| seizure_new | New Patient: Seizure Evaluation | new_patient | First-time neurology visit for seizure evaluation |
| migraine_followup | Follow-Up: Migraine Management | follow_up | Return visit for migraine management |
| ms_followup | Follow-Up: Multiple Sclerosis | follow_up | Return visit for MS monitoring |

### 3.4 Phase: Active Interview

**Voice Orb Animation**:
- Teal glow/pulse when AI is speaking
- Purple glow/pulse when patient is speaking
- Gray/dim when idle/ready

**Real-time Transcript**:
- Shows current streaming text as AI speaks
- Collapsible transcript history
- Entries show: role (AI/Patient), text, timestamp

**Timer**:
- Live countdown showing interview duration
- Status indicator (green dot = active, amber = ending)

**Controls**:
- "End Interview" button (red, disabled during ending phase)
- "Show/Hide Transcript" toggle

### 3.5 Phase: Complete

**Component**: `HistorianSessionComplete.tsx`

**Displays**:
- Success checkmark animation
- "Interview Complete" message
- Duration stat (e.g., "4m 23s")
- Question count stat (e.g., "15")

**Actions**:
- "Start Another Interview" - returns to scenario select
- "Back to Patient Portal" - navigates to /patient

### 3.6 Phase: Safety Escalation

**Trigger**: Safety keywords detected in patient speech

**UI**:
- Red gradient background with warning icon
- "We Want to Make Sure You're Safe" heading
- Emergency resource buttons:
  - Call 911 (Emergency)
  - Call 988 (Suicide & Crisis Lifeline)
  - Text HOME to 741741 (Crisis Text Line)
- "Back to Patient Portal" button

---

## 4. OpenAI Realtime API Integration

### 4.1 Hook: useRealtimeSession.ts

**Location**: `/src/hooks/useRealtimeSession.ts`

### 4.2 Configuration Options

```typescript
interface UseRealtimeSessionOptions {
  sessionType: 'new_patient' | 'follow_up'
  referralReason?: string
  patientName?: string
  patientContext?: string
  onSafetyEscalation?: () => void
  onComplete?: (data: CompletionData) => void
}
```

### 4.3 Return Interface

```typescript
interface UseRealtimeSessionResult {
  status: 'idle' | 'connecting' | 'active' | 'ending' | 'complete' | 'error' | 'safety_escalation'
  transcript: HistorianTranscriptEntry[]
  currentAssistantText: string
  currentUserText: string
  isAiSpeaking: boolean
  isUserSpeaking: boolean
  duration: number
  error: string | null
  startSession: () => Promise<void>
  endSession: () => void
}
```

### 4.4 WebRTC Connection Flow

1. **Get ephemeral token** from `/api/ai/historian/session`
2. **Create RTCPeerConnection**
3. **Create audio element** for remote playback (autoplay, playsInline)
4. **Get user microphone** via `getUserMedia({ audio: true })`
5. **Create data channel** named `oai-events` for events
6. **Generate SDP offer** and set as local description
7. **Exchange SDP** with OpenAI Realtime API at `https://api.openai.com/v1/realtime?model=gpt-realtime`
8. **Set remote description** from OpenAI's SDP answer
9. **On data channel open**: Send `response.create` to start interview

### 4.5 Server Events Handled

| Event Type | Description | Action |
|------------|-------------|--------|
| `response.audio_transcript.delta` | Streaming AI text | Append to currentAssistantText, set isAiSpeaking |
| `response.audio_transcript.done` | AI finished speaking | Add to transcript, increment questionCount |
| `conversation.item.input_audio_transcription.completed` | User finished speaking | Add to transcript, run safety check |
| `input_audio_buffer.speech_started` | User started speaking | Set isUserSpeaking, show "(listening...)" |
| `input_audio_buffer.speech_stopped` | User stopped speaking | Clear isUserSpeaking |
| `response.done` | Response complete, may contain tool call | Extract structured output from save_interview_output |
| `error` | API error | Set error state |

### 4.6 Safety Keyword Detection (Client-Side)

Secondary defense layer that checks user speech for crisis keywords:

```typescript
const SAFETY_KEYWORDS = [
  'kill myself', 'want to die', 'hurt myself', 'end my life',
  'suicide', 'suicidal', 'self-harm', 'don\'t want to live',
  'hurt someone', 'kill someone',
]
```

When detected:
1. Set `safetyEscalatedRef.current = true`
2. Set status to `'safety_escalation'`
3. Call `options.onSafetyEscalation?.()`

### 4.7 Model Configuration

```json
{
  "model": "gpt-realtime",
  "voice": "verse",
  "input_audio_transcription": {
    "model": "whisper-1"
  },
  "turn_detection": {
    "type": "server_vad",
    "threshold": 0.5,
    "prefix_padding_ms": 300,
    "silence_duration_ms": 700
  }
}
```

---

## 5. Interview Flows

### 5.1 New Patient Interview (OLDCARTS Framework)

| Step | Area | Questions |
|------|------|-----------|
| 1 | Greeting | Warm welcome, ask why they're seeing a neurologist |
| 2 | Onset | When did this start? Sudden or gradual? |
| 3 | Location | Where exactly do you feel it? |
| 4 | Duration | How long does each episode last? Overall duration? |
| 5 | Character | What does it feel like? (sharp, dull, throbbing, etc.) |
| 6 | Aggravating | What makes it worse? |
| 7 | Relieving | What makes it better? |
| 8 | Timing | Pattern? Time of day? Frequency? |
| 9 | Severity | 0-10 at worst? On average? |
| 10 | Associated | Related symptoms? |
| 11 | Medications | Current medications and treatments tried |
| 12 | Allergies | Known allergies |
| 13 | PMH | Major illnesses, surgeries, hospitalizations |
| 14 | Family Hx | Family medical history, especially neurological |
| 15 | Social Hx | Occupation, alcohol, tobacco, drugs, living situation |
| 16 | ROS | Focused neurological review of systems |
| 17 | Functional | Impact on daily life |
| 18 | Wrap-up | Summarize and thank patient |

### 5.2 Follow-up Interview

| Step | Area | Questions |
|------|------|-----------|
| 1 | Greeting | How have you been since your last visit? |
| 2 | Interval changes | Have symptoms improved, worsened, or stayed the same? |
| 3 | Treatment response | How is current treatment working? |
| 4 | Medication adherence | Taking medications as prescribed? Missed doses? |
| 5 | Side effects | Any problems with medications? |
| 6 | New symptoms | Anything new since last visit? |
| 7 | Functional status | How are symptoms affecting daily activities, work, sleep? |
| 8 | Questions | Questions or concerns for the neurologist? |

### 5.3 Patient Context Enrichment

For real patients, the AI receives enriched context from the database:

```typescript
interface PatientContext {
  patientName: string
  referralReason: string | null
  lastVisitDate: string | null
  lastVisitType: string | null
  lastNoteExcerpt: string | null  // HPI from prior visit
  lastNotePlan: string | null
  allergies: string | null
  diagnoses: string | null        // Active diagnoses with ICD-10 codes
  lastNoteSummary: string | null  // AI-generated summary
}
```

This context is appended to the system prompt so the AI knows:
- Patient's prior diagnoses
- Current medications from last visit
- Known allergies
- Treatment plan from last visit
- What was discussed previously

---

## 6. Safety Protocol

### 6.1 Two-Layer Safety System

**Layer 1: AI-Level Safety (Primary)**
- Built into the system prompt
- AI trained to recognize crisis language
- AI delivers safety response and calls save_interview_output with `safety_escalated: true`

**Layer 2: Client-Side Keyword Detection (Secondary)**
- Runs on every user transcription
- Checks against hardcoded keyword list
- Immediately triggers escalation UI if match found

### 6.2 AI Safety Response (Verbatim)

When crisis language is detected, the AI responds with:

> "I hear you, and I want to make sure you get the right help immediately. Please call 911 if this is a medical emergency, or call 988 (Suicide & Crisis Lifeline) if you're having thoughts of harming yourself. You can also text HOME to 741741 for the Crisis Text Line. Your safety is the most important thing right now."

### 6.3 Emergency Resources

| Resource | Access | Purpose |
|----------|--------|---------|
| 911 | Call | Medical emergency |
| 988 | Call | Suicide & Crisis Lifeline |
| 741741 | Text "HOME" | Crisis Text Line |

### 6.4 Session Flagging

When safety escalation occurs:
1. Session saved with `safety_escalated: true`
2. Physician-side panel shows red alert banner
3. Session highlighted with red border in session list

---

## 7. Structured Output

### 7.1 Tool Definition: save_interview_output

```typescript
{
  type: 'function',
  name: 'save_interview_output',
  description: 'Save the structured interview output when the interview is complete or when safety escalation is triggered.',
  parameters: {
    type: 'object',
    properties: {
      // Core clinical data
      chief_complaint: { type: 'string', description: 'Brief chief complaint in clinical language' },
      hpi: { type: 'string', description: 'History of present illness narrative' },

      // OLDCARTS breakdown
      onset: { type: 'string' },
      location: { type: 'string' },
      duration: { type: 'string' },
      character: { type: 'string' },
      aggravating_factors: { type: 'string' },
      relieving_factors: { type: 'string' },
      timing: { type: 'string' },
      severity: { type: 'string' },
      associated_symptoms: { type: 'string' },

      // Medical history
      current_medications: { type: 'string' },
      allergies: { type: 'string' },
      past_medical_history: { type: 'string' },
      past_surgical_history: { type: 'string' },
      family_history: { type: 'string' },
      social_history: { type: 'string' },
      review_of_systems: { type: 'string' },
      functional_status: { type: 'string' },

      // Follow-up specific
      interval_changes: { type: 'string' },
      treatment_response: { type: 'string' },
      new_symptoms: { type: 'string' },
      medication_changes: { type: 'string' },
      side_effects: { type: 'string' },

      // Summary and flags
      narrative_summary: { type: 'string' },
      red_flags: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            flag: { type: 'string' },
            severity: { type: 'string', enum: ['high', 'medium', 'low'] },
            context: { type: 'string' }
          },
          required: ['flag', 'severity', 'context']
        }
      },
      safety_escalated: { type: 'boolean' }
    },
    required: ['chief_complaint', 'hpi', 'narrative_summary', 'safety_escalated']
  }
}
```

### 7.2 Red Flag Detection

The AI identifies clinical red flags during the interview. Examples:

| Red Flag | Severity | Context Example |
|----------|----------|-----------------|
| "Worst headache of life" | high | Thunderclap headache suggesting SAH |
| Recent head trauma | high | Falls, accidents before symptom onset |
| Progressive weakness | high | Suggesting cord compression or GBS |
| New seizure with focal features | medium | Structural lesion concern |
| Weight loss with symptoms | medium | Malignancy screening needed |
| Family history of aneurysm | low | Risk factor documentation |

### 7.3 Tool Call Processing

When the AI calls save_interview_output:

1. Client receives `response.done` event with tool call in `response.output`
2. Client parses the function arguments
3. Structured data stored in refs for session completion
4. Client sends `function_call_output` back to acknowledge
5. Client sends `response.create` to let AI give closing remarks

---

## 8. Physician-Side Integration

### 8.1 Component: HistorianSessionPanel.tsx

**Location**: `/src/components/HistorianSessionPanel.tsx`

**Rendered in**: LeftSidebar of ClinicalNote.tsx

### 8.2 Session Card Display

Each session card shows:
- **Header**: Session type badge (New/F/U), patient name, chevron toggle
- **Meta**: Duration, question count, timestamp
- **Indicators**:
  - Green dot if unreviewed
  - Red warning icon if safety escalated
  - Amber border if red flags present
  - Red border if safety escalated

### 8.3 Expandable Sections (Sub-tabs)

| Tab | Content |
|-----|---------|
| Summary | AI-generated narrative summary |
| Structured | All structured fields from save_interview_output |
| Transcript | Full conversation with role labels and timestamps |

### 8.4 Red Flags Banner

When session has red flags:
- Amber background banner
- Lists each flag with severity dot (red=high, amber=medium, gray=low)
- Shows flag text and context

### 8.5 Safety Escalation Alert

When `safety_escalated: true`:
- Red alert banner at top of session list
- Shows count of flagged sessions
- Session card has red border

### 8.6 Import to Note

**Button**: "Import to Note" (teal, shown if not yet imported)

**Handler in ClinicalNote.tsx**:

```typescript
const handleImportHistorian = (session: any) => {
  if (!session?.structured_output) return
  if (isSwitchingPatientRef.current) return

  const so = session.structured_output
  setNoteData(prev => ({
    ...prev,
    hpi: so.hpi || prev.hpi,
    allergies: so.allergies || prev.allergies,
    assessment: so.chief_complaint
      ? `${so.chief_complaint}\n${prev.assessment || ''}`.trim()
      : prev.assessment,
  }))
}
```

**Post-import**: Shows "Imported" badge in green

---

## 9. Patient Portal Integration

### 9.1 PatientPortal.tsx

**Location**: `/src/components/PatientPortal.tsx`

**Route**: `/patient`

### 9.2 AI Historian Tab

**Tab Label**: "AI Historian" with microphone icon

**Content**:
1. **Patient List**: Shows registered patients for tenant
   - Click patient to start interview at `/patient/historian?patient_id={id}`

2. **Add New Patient**: Expandable form
   - First name, last name, referral reason
   - Calls `/api/patient/register` (SECURITY DEFINER function)

3. **Demo Scenarios**: Collapsible section
   - Links to `/patient/historian?scenario={id}`

4. **How It Works**: Info card explaining the process

### 9.3 Routes

| Route | Component | Purpose |
|-------|-----------|---------|
| `/patient` | PatientPortal | Main patient portal with tabs |
| `/patient/historian` | NeurologicHistorian | Full-page voice interview UI |
| `/patient/historian?patient_id={id}` | NeurologicHistorian | Interview with patient context |
| `/patient/historian?scenario={id}` | NeurologicHistorian | Demo scenario auto-selected |

---

## 10. System Prompts

### 10.1 Core Prompt

```
You are a compassionate, professional AI medical historian conducting a neurological intake interview. Your role is to gather a thorough clinical history from the patient before they see their neurologist.

CRITICAL RULES:
1. Ask ONE question at a time. Wait for the patient to respond before asking the next question.
2. Use patient-friendly language. Avoid medical jargon. If you must use a medical term, explain it simply.
3. NEVER provide diagnoses, medical opinions, or treatment advice. You are gathering information, not interpreting it.
4. NEVER say "it sounds like you might have..." or suggest what a condition could be.
5. If asked for medical advice, say: "That's a great question for your neurologist. I'll make sure to include it in your notes."
6. Be warm and empathetic. Acknowledge the patient's concerns.
7. Keep responses concise - typically 1-2 sentences plus your next question.
8. If the patient gives a vague answer, ask one follow-up to clarify, then move on.
9. After gathering sufficient information (typically 10-20 questions), wrap up by summarizing what you've heard and thanking the patient.

SAFETY MONITORING:
If the patient expresses ANY of the following, IMMEDIATELY respond with the safety protocol:
- Suicidal ideation ("I want to die", "I want to hurt myself", "I don't want to be here anymore")
- Homicidal ideation ("I want to hurt someone")
- Active emergency symptoms ("I'm having the worst headache of my life RIGHT NOW", "I can't move my arm RIGHT NOW", "I'm having a seizure")

SAFETY RESPONSE (use this EXACT format):
"I hear you, and I want to make sure you get the right help immediately. Please call 911 if this is a medical emergency, or call 988 (Suicide & Crisis Lifeline) if you're having thoughts of harming yourself. You can also text HOME to 741741 for the Crisis Text Line. Your safety is the most important thing right now."

After delivering the safety response, call the save_interview_output tool with safety_escalated set to true.
```

### 10.2 New Patient Prompt Addition

```
INTERVIEW STRUCTURE for NEW PATIENT:
1. Start by warmly greeting the patient and asking them to describe why they're seeing a neurologist today.
2. Use the OLDCARTS framework to characterize their chief complaint:
   - Onset: When did this start? Was it sudden or gradual?
   - Location: Where exactly do you feel it?
   - Duration: How long does each episode last? How long has this been going on overall?
   - Character: What does it feel like? (sharp, dull, throbbing, etc.)
   - Aggravating factors: What makes it worse?
   - Relieving factors: What makes it better?
   - Timing: Is there a pattern? Time of day? Frequency?
   - Severity: On a scale of 0-10, how bad is it at its worst? On average?
3. Associated symptoms (relevant to chief complaint)
4. Current medications and treatments tried
5. Allergies
6. Past medical history (major illnesses, surgeries, hospitalizations)
7. Family history (especially neurological conditions)
8. Social history (occupation, alcohol, tobacco, recreational drugs, living situation)
9. Brief focused review of systems (neurological: headaches, seizures, weakness, numbness, vision changes, memory issues, sleep problems)
10. Impact on daily life / functional status

Adapt your questions based on the referral reason and patient responses. Skip sections that don't apply.
```

### 10.3 Follow-up Prompt Addition

```
INTERVIEW STRUCTURE for FOLLOW-UP VISIT:
1. Start by warmly greeting the patient and asking how they've been doing since their last visit.
2. Interval changes: Have symptoms improved, worsened, or stayed the same?
3. Treatment response: How is the current treatment working?
4. Medication adherence: Have you been taking medications as prescribed? Any missed doses?
5. Side effects: Any problems with your medications?
6. New symptoms: Anything new since your last visit?
7. Functional status: How are symptoms affecting your daily activities, work, sleep?
8. Questions or concerns for the neurologist

Keep the follow-up interview focused and efficient. Typically 8-12 questions.
```

### 10.4 Dynamic Context Additions

When referral reason is provided:
```
REFERRAL REASON: {referralReason}
Use this to guide your questioning. Start by asking the patient about the reason they were referred.
```

When patient context is provided (follow-up visits):
```
PATIENT CONTEXT:
{patientContext}
```

---

## 11. API Routes

### 11.1 POST /api/ai/historian/session

**Purpose**: Create ephemeral token for WebRTC connection

**Request**:
```typescript
{
  sessionType: 'new_patient' | 'follow_up'
  referralReason?: string
  patientContext?: string
}
```

**Response**:
```typescript
{
  ephemeralKey: string      // Client secret for WebRTC auth
  sessionId: string         // OpenAI session ID
  expiresAt: number         // Timestamp when token expires
}
```

**Implementation**:
1. Get OpenAI API key from environment
2. Build system prompt via `buildHistorianSystemPrompt()`
3. Get tool definition via `getHistorianToolDefinition()`
4. POST to `https://api.openai.com/v1/realtime/sessions`
5. Return ephemeral key from response

### 11.2 POST /api/ai/historian/save

**Purpose**: Save completed interview session

**Request**:
```typescript
{
  tenant_id: string
  patient_id: string | null
  session_type: 'new_patient' | 'follow_up'
  patient_name: string
  referral_reason: string | null
  structured_output: HistorianStructuredOutput | null
  narrative_summary: string | null
  transcript: HistorianTranscriptEntry[] | null
  red_flags: HistorianRedFlag[] | null
  safety_escalated: boolean
  duration_seconds: number
  question_count: number
  status: 'completed' | 'abandoned'
}
```

**Response**:
```typescript
{
  session: HistorianSession
}
```

### 11.3 GET /api/ai/historian/save

**Purpose**: List historian sessions

**Query Parameters**:
- `tenant_id`: Tenant identifier
- `patient_id`: Optional patient filter

**Response**:
```typescript
{
  sessions: HistorianSession[]
}
```

---

## 12. Database Schema

### 12.1 Table: historian_sessions

**Migration**: `010_historian_sessions.sql`

```sql
CREATE TABLE historian_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         TEXT NOT NULL DEFAULT 'default',
  patient_id        UUID REFERENCES patients(id) ON DELETE SET NULL,
  session_type      TEXT NOT NULL DEFAULT 'new_patient',
  patient_name      TEXT NOT NULL DEFAULT '',
  referral_reason   TEXT,
  structured_output JSONB,           -- HistorianStructuredOutput
  narrative_summary TEXT,
  transcript        JSONB,           -- HistorianTranscriptEntry[]
  red_flags         JSONB,           -- HistorianRedFlag[]
  safety_escalated  BOOLEAN NOT NULL DEFAULT false,
  duration_seconds  INTEGER DEFAULT 0,
  question_count    INTEGER DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'in_progress',
  reviewed          BOOLEAN NOT NULL DEFAULT false,
  imported_to_note  BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_historian_sessions_tenant ON historian_sessions (tenant_id);
CREATE INDEX idx_historian_sessions_tenant_status ON historian_sessions (tenant_id, status);
CREATE INDEX idx_historian_sessions_patient ON historian_sessions (patient_id);
```

### 12.2 RLS Policies

```sql
-- Authenticated users have full access
CREATE POLICY "Allow all for authenticated" ON historian_sessions
  FOR ALL USING (true) WITH CHECK (true);

-- Anon role can insert/select (patient portal without auth)
CREATE POLICY "Allow anon inserts" ON historian_sessions
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow anon selects" ON historian_sessions
  FOR SELECT TO anon USING (true);
```

### 12.3 Portal Functions (SECURITY DEFINER)

**Function**: `get_patients_for_portal(p_tenant_id TEXT)`
- Returns patients list for patient portal
- Bypasses RLS for anon role

**Function**: `get_patient_context_for_portal(p_patient_id UUID)`
- Returns enriched patient context including:
  - Patient name, referral reason
  - Last visit date and type
  - Last note HPI, assessment, plan, summary
  - Last note allergies, ROS
  - Active diagnoses with ICD-10 codes

**Function**: `portal_register_patient(p_first_name, p_last_name, p_referral_reason, p_tenant_id)`
- Registers new patient from portal without auth
- Uses first physician's user_id in tenant

---

## 13. TypeScript Types

### 13.1 Location: /src/lib/historianTypes.ts

```typescript
export type HistorianSessionType = 'new_patient' | 'follow_up'
export type HistorianSessionStatus = 'in_progress' | 'completed' | 'abandoned'

export interface HistorianTranscriptEntry {
  role: 'assistant' | 'user'
  text: string
  timestamp: number // seconds from session start
}

export interface HistorianRedFlag {
  flag: string
  severity: 'high' | 'medium' | 'low'
  context: string
}

export interface HistorianStructuredOutput {
  chief_complaint?: string
  hpi?: string
  onset?: string
  location?: string
  duration?: string
  character?: string
  aggravating_factors?: string
  relieving_factors?: string
  timing?: string
  severity?: string
  associated_symptoms?: string
  current_medications?: string
  allergies?: string
  past_medical_history?: string
  past_surgical_history?: string
  family_history?: string
  social_history?: string
  review_of_systems?: string
  functional_status?: string
  // Follow-up specific
  interval_changes?: string
  treatment_response?: string
  new_symptoms?: string
  medication_changes?: string
  side_effects?: string
}

export interface HistorianSession {
  id: string
  tenant_id: string
  patient_id: string | null
  session_type: HistorianSessionType
  patient_name: string
  referral_reason: string | null
  structured_output: HistorianStructuredOutput | null
  narrative_summary: string | null
  transcript: HistorianTranscriptEntry[] | null
  red_flags: HistorianRedFlag[] | null
  safety_escalated: boolean
  duration_seconds: number
  question_count: number
  status: HistorianSessionStatus
  reviewed: boolean
  imported_to_note: boolean
  created_at: string
  updated_at: string
  // Joined patient data
  patient?: {
    id: string
    first_name: string
    last_name: string
    mrn: string
  } | null
}

export interface PatientContext {
  patientName: string
  referralReason: string | null
  lastVisitDate: string | null
  lastVisitType: string | null
  lastNoteExcerpt: string | null
  lastNotePlan: string | null
  allergies: string | null
  diagnoses: string | null
  lastNoteSummary: string | null
}

export interface DemoScenario {
  id: string
  label: string
  session_type: HistorianSessionType
  referral_reason: string
  patient_name: string
  description: string
}
```

---

## 14. File Structure Summary

```
src/
├── app/
│   ├── api/ai/historian/
│   │   ├── session/route.ts    # Ephemeral token creation
│   │   └── save/route.ts       # Session save/list
│   └── patient/
│       ├── page.tsx            # Patient portal wrapper
│       └── historian/page.tsx  # Voice interview wrapper
├── components/
│   ├── NeurologicHistorian.tsx       # Full-page interview UI
│   ├── HistorianSessionPanel.tsx     # Physician-side session list
│   ├── HistorianSessionComplete.tsx  # Post-interview success screen
│   └── PatientPortal.tsx             # Patient portal with historian tab
├── hooks/
│   └── useRealtimeSession.ts         # WebRTC hook for Realtime API
└── lib/
    ├── historianTypes.ts             # TypeScript types
    └── historianPrompts.ts           # System prompts and tool definition

supabase/migrations/
├── 010_historian_sessions.sql        # Main table
├── 011_historian_patient_link.sql    # Patient FK + portal functions
└── 012_enrich_patient_context.sql    # Enhanced context function
```

---

## 15. Testing Considerations

### 15.1 Manual Testing Scenarios

| Scenario | Steps | Expected |
|----------|-------|----------|
| New patient interview | Select headache_new demo, complete interview | Structured output saved, session appears in physician panel |
| Follow-up interview | Select migraine_followup demo | AI asks about interval changes, treatment response |
| Safety escalation | Say "I want to hurt myself" | Red overlay appears with crisis resources |
| Import to note | Click "Import to Note" on completed session | HPI and allergies populate in clinical note |
| Real patient context | Start interview with patient_id | AI references prior visit info |

### 15.2 Edge Cases

- Microphone permission denied
- WebRTC connection failure
- OpenAI API error mid-interview
- Patient disconnects before completion
- Very long interview (>30 minutes)
- Patient speaks in non-English language
- Background noise interference

### 15.3 Browser Compatibility

- Chrome: Full support
- Firefox: Full support
- Safari: Requires `playsInline` for audio playback on iOS
- Edge: Full support

---

## 16. Future Enhancements

| Enhancement | Priority | Description |
|-------------|----------|-------------|
| Multi-language support | P1 | Conduct interviews in Spanish, Mandarin, etc. |
| Session resume | P2 | Allow patients to pause and resume interviews |
| Custom interview templates | P2 | Condition-specific interview flows |
| Voice activity visualization | P3 | Waveform display during recording |
| Interview recordings | P3 | Save audio for review |
| Automated follow-up scheduling | P3 | Based on red flags detected |

---

## Appendix A: Prompt Builder Function

**Location**: `/src/lib/historianPrompts.ts`

```typescript
export function buildHistorianSystemPrompt(
  sessionType: HistorianSessionType,
  referralReason?: string,
  patientContext?: string,
): string {
  let prompt = CORE_PROMPT + '\n\n'

  if (sessionType === 'new_patient') {
    prompt += NEW_PATIENT_PROMPT
  } else {
    prompt += FOLLOW_UP_PROMPT
  }

  if (referralReason) {
    prompt += `\n\nREFERRAL REASON: ${referralReason}\nUse this to guide your questioning. Start by asking the patient about the reason they were referred.`
  }

  if (patientContext) {
    prompt += `\n\nPATIENT CONTEXT:\n${patientContext}`
  }

  return prompt
}
```

---

## Appendix B: WebRTC Cleanup

The `useRealtimeSession` hook properly cleans up all WebRTC resources:

```typescript
const cleanup = useCallback(() => {
  if (timerRef.current) {
    clearInterval(timerRef.current)
    timerRef.current = null
  }
  if (dcRef.current) {
    try { dcRef.current.close() } catch {}
    dcRef.current = null
  }
  if (pcRef.current) {
    try { pcRef.current.close() } catch {}
    pcRef.current = null
  }
  if (streamRef.current) {
    streamRef.current.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }
  if (audioElRef.current) {
    audioElRef.current.srcObject = null
    audioElRef.current = null
  }
}, [])
```

Called on:
- Component unmount
- Session end
- Error during connection
