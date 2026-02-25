# Card 4: Post-Visit AI Follow-Up Agent — Product Playbook

---

## 1. Executive Summary

The Post-Visit AI Follow-Up Agent is an autonomous clinical communication system that contacts neurology patients after their office visit via voice call or SMS to check on medication tolerance, side effects, symptom changes, outstanding questions, and functional status. It replaces the inconsistent, labor-intensive process of manual post-visit callbacks — which most clinics either do poorly or skip entirely — with a structured, AI-driven outreach that catches problems early, improves medication adherence, and frees nursing staff for higher-value tasks. The agent uses a clinically structured conversation script with built-in escalation logic: if a patient reports red-flag symptoms (seizure, stroke symptoms, suicidal ideation), the system immediately flags the clinical team for urgent follow-up. For investors, this demonstrates a scalable model for post-visit care that reduces readmissions, improves patient satisfaction scores, and addresses the nursing shortage by automating routine follow-up workflows.

---

## 2. How To Use This Section

- **Step 1:** Navigate to the Post-Visit Agent card from the homepage.
- **Step 2:** You will see two demo modes: "SMS Conversation" (interactive, default) and "Voice Demo" (pre-recorded). Start with SMS.
- **Step 3 (SMS mode — primary):** An interactive SMS chat interface loads with a pre-populated patient scenario. You can type patient responses to see how the AI agent reacts, including escalation triggers.
- **Step 4 (Voice mode — secondary):** Click "Play Voice Demo." A pre-recorded audio conversation plays between the AI agent and a demo patient, with a scrolling real-time transcript appearing alongside. This simulates what the Phase 2 live voice experience will look like.
- **Step 5:** During the conversation, notice the **Clinician Dashboard** panel on the right side. It updates in real-time showing: conversation status, flagged concerns, escalation alerts, and a structured summary.
- **Step 6:** Try triggering an escalation: in SMS mode, type "I had a seizure last night" or "I'm feeling really hopeless." Watch the dashboard immediately flag the case and display the escalation protocol.
- **Step 7:** After the conversation ends, review the **Post-Call Summary** — a structured clinical note suitable for pasting into an EHR.
- **Step 8:** Click "View Escalation Logic" to see the complete decision tree the agent follows.

---

## 3. Clinical Context & Problem Statement

### The Problem

Post-visit follow-up is one of the most critical yet consistently neglected parts of outpatient neurology care. After a neurology visit, patients are often started on new medications (anti-epileptics, Parkinson's drugs, migraine preventives, immunotherapies) that have significant side effect profiles and titration schedules. Without systematic follow-up:

- **30-50% of patients** do not fill their new prescriptions within 7 days (primary non-adherence)
- **Side effects go unreported** until the next visit (often 3-6 months later), leading to unnecessary suffering and medication abandonment
- **Red flag symptoms** develop between visits and are not caught until they become emergencies
- **Patient questions** accumulate, causing anxiety and medication non-adherence
- **Clinical documentation gaps** emerge because post-visit status is not captured

Most neurology practices handle follow-up in one of three inadequate ways:

1. **No systematic follow-up** — patients are told "call if you have problems" (most patients don't call until it's serious)
2. **Nurse callback list** — nurses attempt to call patients 1-2 weeks post-visit, but are frequently unable to reach them, and the calls are unstructured and undocumented
3. **Patient portal messaging** — relies on patient initiative, has low engagement rates (15-25%), and messages are often vague

### The Clinical Workflow

Visit → Medication started/changed → 3-7 day follow-up → 2-4 week follow-up → Next visit

The AI Follow-Up Agent sits in the 3-7 day and 2-4 week windows, conducting structured outreach that captures actionable clinical information.

### Patient Population

All patients who had a neurology visit where:
- A new medication was started
- A medication dose was changed
- New diagnostic results were discussed
- A new diagnosis was communicated
- A procedure was scheduled or performed
- The patient expressed concern or confusion during the visit

### Why AI Adds Value

- **Reach**: AI can contact 100% of eligible patients, not just the ones nurses have time for
- **Consistency**: Every patient gets the same structured follow-up every time
- **Scalability**: Handles 10 or 1,000 post-visit calls per day with no additional FTEs
- **Documentation**: Every conversation is automatically transcribed and structured for EHR integration
- **Escalation**: Red flag detection operates on clinically validated criteria, not nurse intuition under time pressure
- **Patient preference**: Many patients prefer the convenience and low-pressure nature of SMS/text-based follow-up

---

## 4. Functional Requirements

### 4.1 Demo Page Layout

| Section | Details |
|---|---|
| **Mode Selector** | Default: "SMS Conversation" (interactive). Secondary: "Voice Demo" (pre-recorded audio with scrolling transcript). SMS is the primary demo mode. |
| **Patient Scenario Panel** | Shows the demo patient's context: name, diagnosis, medications started, visit summary |
| **Conversation Area** | Left side: real-time conversation display (voice transcript or SMS thread) |
| **Clinician Dashboard** | Right side: live-updating dashboard showing conversation status, flags, escalations |
| **Post-Call Summary** | Appears after conversation ends: structured note for EHR |
| **Escalation Logic Viewer** | Button to view the full decision tree |

### 4.2 Conversation Script — Structured Flow

The AI agent follows a structured conversation script. Each module is a discrete conversation segment with specific goals and branching logic.

**Module 1: Greeting & Consent**
```
"Hi, this is the Neurology Care Team follow-up assistant calling on behalf of
Dr. [Name]'s office. I'm reaching out to check in on you after your recent visit
on [date]. This is an automated follow-up — I'm an AI assistant. Is this a good
time to chat for about 3-5 minutes? You can also ask to speak with a human team
member at any time."
```
- If patient declines → "No problem. Would you like us to call back at a better time, or would you prefer a text message follow-up instead?"
- If patient opts out → Log opt-out, do not re-contact. "Understood. We won't call again for this follow-up. Please call our office at [number] if you have any questions or concerns."
- **If a caregiver/proxy answers instead of the patient:**
  ```
  "Thank you for answering. May I ask your name and your relationship to
  [patient name]? Are you authorized to discuss their medical care?"
  ```
  - If authorized → Log caregiver name and relationship, proceed with all modules using caregiver as informant. Adjust language (e.g., "How has [patient name] been doing with the medication?" instead of "How have you been doing?").
  - If not authorized or uncertain → "I understand. For privacy reasons, I'll need to speak directly with [patient name] or an authorized representative. Could you let them know we called? They can call us back at [number]." → Log as incomplete, schedule retry.

  > **Design rationale (CMIO):** A large percentage of neurology patients — particularly those with dementia, severe stroke, or advanced Parkinson's — cannot answer a phone or text independently. The system must handle caregiver-mediated conversations as a first-class workflow, not an edge case.

**Module 2: Medication Check**
```
"During your visit, Dr. [Name] started you on [medication] at [dose].
Have you been able to pick up the medication from the pharmacy?"
```
- If not filled → "I understand. Would it help if I connected you with our care coordinator to assist with the pharmacy? Sometimes there are insurance or availability issues we can help resolve."
- If filled but not taking → Explore reason: cost, side effects, confusion, intentional
  - **⚠️ CRITICAL — Abrupt Cessation Rule:** If the patient reports abruptly stopping an anti-epileptic (e.g., levetiracetam, lacosamide, carbamazepine, valproate, lamotrigine, phenytoin), antispasmodic (e.g., baclofen, tizanidine), or benzodiazepine, this is a **medical emergency**. Abrupt withdrawal of these medications can cause status epilepticus, withdrawal seizures, or life-threatening withdrawal syndromes. → **Immediately trigger Tier 1 (URGENT) or Tier 2 (SAME-DAY) escalation** depending on how recently the medication was stopped and the patient's seizure history. The AI must NOT simply "explore the reason" — it must escalate first, then explore.
- If taking as prescribed → Proceed to Module 3

**Module 3: Side Effects**
```
"How has the [medication] been treating you so far?
Have you noticed any side effects or anything that feels different since starting it?"
```
- If no side effects → Acknowledge positively, proceed to Module 4
- If mild side effects → "Thank you for sharing that. [Side effect] is something that can occur with [medication] and often improves over the first few weeks. I'll make a note for your care team. If it becomes bothersome, please call the office."
- If significant side effects interfering with daily life → ESCALATE: flag for same-day clinician callback. "That sounds like it's really affecting your daily life. I'm going to flag this for your care team so they can follow up with you today."
- If dangerous side effect (allergic reaction, severe rash, suicidal thoughts, etc.) → IMMEDIATE ESCALATION

**Module 4: Symptom Check**
```
"Have you noticed any new symptoms or any changes in the symptoms
that brought you to our office?"
```
- If no new symptoms → Proceed to Module 5
- If new/worsening symptoms → Assess severity using follow-up questions, apply red flag logic

**Module 5: Functional Status**
```
"Compared to how you were feeling before your visit, would you say
you're feeling better, worse, or about the same?"
```
- **Worse** → Follow up: "I'm sorry to hear that. Can you tell me more about what's changed?" → Assess severity, apply escalation logic. Flag for Tier 2 (Same-day) if significant decline; Tier 3 (Next-visit) if mild.
- **About the same** → Acknowledge: "Thank you for letting me know. I'll note that for your care team." → Tier 3 (Next-visit) note.
- **Better** → Acknowledge positively: "That's great to hear!" → Tier 4 (Informational).

> **Design rationale (CMIO):** A static 1-10 scale produces constant false-positive escalations for patients with chronic progressive conditions (e.g., ALS, advanced Parkinson's) whose baseline is already low. A comparative "better/worse/same" question measures change from *their* baseline, which is what clinicians actually care about.

**Module 6: Questions**
```
"Do you have any questions from your visit that we can help answer,
or anything that was unclear?"
```
- If questions within guardrails (scheduling, logistics, general info) → Answer
- If clinical questions → "That's a great question, and I want to make sure you get an accurate answer from your care team. I'll flag this for Dr. [Name]'s nurse to call you back."

**Module 7: Wrap-Up**
```
"Thank you for taking the time to check in with us. Your care team will review
this conversation summary. If you need anything before your next appointment,
please call our office at [number]. We'll also send you a text message summary
of what we discussed today. Take care!"
```

### 4.3 Voice Demo Requirements (Phase 1: Pre-Recorded Only)

| Requirement | Details |
|---|---|
| Phase 1 approach | **Pre-recorded audio demo only.** No live voice AI in Phase 1. A professionally recorded audio conversation plays alongside a scrolling transcript to simulate the Phase 2 live experience. |
| Audio file | Pre-recorded WAV/MP3 of a simulated AI-patient follow-up conversation (~3-5 minutes) |
| Transcript sync | Transcript text highlights/scrolls in sync with audio playback |
| Dashboard sync | Clinician dashboard updates at appropriate timestamps during audio playback |

### 4.3.1 Voice Call Requirements (Phase 2: Live Voice AI)

| Requirement | Details |
|---|---|
| Voice engine | Vapi.ai or ElevenLabs (evaluate during Phase 1) |
| Voice characteristics | Warm, professional, moderate pace, American English neutral accent |
| Latency | Response within 1-2 seconds of patient finishing speaking |
| Interruption handling | Allow patient to interrupt; agent pauses and acknowledges |
| Background noise tolerance | Must function with moderate background noise (home, car) |
| Call duration | Target 3-5 minutes |
| Recording | Full audio recording stored encrypted in Supabase (with patient consent) |
| Transcription | Real-time transcription displayed alongside audio |

### 4.4 SMS Requirements (Phase 1 POC)

| Requirement | Details |
|---|---|
| SMS provider | Twilio for production; simulated in-browser for demo |
| Message style | Conversational, 1-3 sentences per message, grade 6 reading level |
| Response parsing | AI must understand: yes/no, side effect descriptions, symptom descriptions, questions, emotional language |
| Response timeout | If patient doesn't respond within **24 hours**, send one follow-up nudge. If no response within **48 hours**, log as incomplete. *(CMIO correction: A 2-hour nudge feels like spam, increases opt-out rates, and ignores that patients are at work, driving, or sleeping. 24 hours is the appropriate window for asynchronous SMS.)* |
| Opt-out | "Reply STOP to opt out" in initial message |
| Multi-language | **Auto-detect and respond in patient's language from Phase 1.** Claude is natively polyglot — if a patient replies in Spanish ("No me siento bien"), the AI should seamlessly transition to Spanish. Do not artificially restrict to English. Full localization of templates/outbound messages is Phase 2, but *responsive* multilingual support is free and immediate. |
| Default outreach method | **SMS is the default outreach method.** Voice is opt-in only. *(Equity rationale: Voice calls consume prepaid minutes for lower-income patients; SMS is generally unlimited in the US. SMS also has higher engagement rates for asynchronous clinical communication.)* |

### 4.5 Escalation Dashboard

| Element | Details |
|---|---|
| Real-time status | Active conversations, completed, escalated |
| Escalation queue | List of patients with escalation flags, ordered by severity |
| Flag categories | Urgent (red), Same-day (orange), Next-visit (yellow), Informational (green) |
| Action buttons | "Acknowledge", "Call Patient", "Schedule Follow-up", "Add to Chart" |
| Summary export | One-click export of structured conversation summary as clinical note |

### 4.6 Post-Call Summary Format

```
POST-VISIT FOLLOW-UP SUMMARY
Date: [date]  |  Patient: [name]  |  Visit Date: [visit date]
Provider: Dr. [name]  |  Follow-up method: Voice / SMS  |  Duration: X min

MEDICATION STATUS:
- [Medication]: Filled ✓ | Taking as prescribed ✓ | Side effects: [none / description]

SYMPTOM UPDATE:
- New symptoms: [none / description]
- Existing symptoms: [improved / stable / worsening]

FUNCTIONAL STATUS: [Better / Worse / About the Same] [details if worse]
INFORMANT: [Patient / Caregiver: name, relationship]

PATIENT QUESTIONS: [none / summary]

ESCALATION FLAGS: [none / description with severity]

AI RECOMMENDATION: [routine follow-up / same-day callback / urgent review]

---
Generated by AI Follow-Up Agent | Reviewed by: [pending clinician review]
This summary was generated by an automated clinical support tool and should be
reviewed by a licensed clinician before clinical action is taken.
```

---

## 5. Technical Architecture

### 5.1 Frontend Components (React / Next.js)

```
src/
├── app/
│   └── follow-up/
│       └── page.tsx                    # Main follow-up agent page
├── components/
│   └── follow-up/
│       ├── ModeSelector.tsx                # SMS (interactive) / Voice Demo (pre-recorded) toggle
│       ├── PatientScenarioPanel.tsx         # Demo patient context card
│       ├── VoiceDemoPlayer.tsx              # Pre-recorded voice demo with scrolling transcript (Phase 1)
│       ├── SMSConversation.tsx              # Interactive SMS chat interface (primary demo)
│       ├── SMSMessageBubble.tsx             # Individual message bubble
│       ├── CaregiverBadge.tsx              # Visual indicator when caregiver is the informant
│       ├── ClinicianDashboard.tsx           # Right-panel live dashboard
│       ├── EscalationAlert.tsx              # Real-time escalation notification (with flash/color change)
│       ├── EscalationQueueList.tsx          # List of escalated cases
│       ├── AfterHoursWarning.tsx            # Banner when escalation occurs outside business hours
│       ├── PostCallSummary.tsx              # Structured summary display
│       ├── EscalationLogicViewer.tsx        # Decision tree modal/sidebar
│       ├── ConversationFlowDiagram.tsx      # Visual flow of conversation modules
│       ├── AbruptCessationAlert.tsx         # Specific alert for medication withdrawal danger
│       └── DisclaimerBanner.tsx             # Safety disclaimer
```

### 5.2 Supabase Schema

**Table: `followup_sessions`**

| Column | Type | Description |
|---|---|---|
| `id` | `uuid` (PK) | Session ID |
| `created_at` | `timestamptz` | Session start time |
| `patient_id` | `uuid` | Reference to patient (demo: synthetic ID) |
| `patient_name` | `text` | Patient display name |
| `visit_date` | `date` | Date of the neurology visit |
| `provider_name` | `text` | Treating neurologist name |
| `follow_up_method` | `text` | voice, sms |
| `conversation_status` | `text` | in_progress, completed, abandoned, escalated |
| `duration_seconds` | `integer` | Call/conversation duration |
| `transcript` | `jsonb` | Full conversation transcript as array of messages |
| `medications_discussed` | `jsonb` | Array of medication status objects |
| `side_effects_reported` | `jsonb` | Array of reported side effects |
| `new_symptoms_reported` | `jsonb` | Array of new symptoms |
| `functional_status` | `text` | Comparative status: better, worse, about_the_same |
| `functional_details` | `text` | If worse, what changed (patient's own words) |
| `caregiver_name` | `text` | Name of caregiver/proxy if applicable |
| `caregiver_relationship` | `text` | Relationship to patient (spouse, child, etc.) |
| `patient_questions` | `jsonb` | Array of patient questions |
| `escalation_flags` | `jsonb` | Array of escalation objects with severity |
| `escalation_level` | `text` | none, informational, next_visit, same_day, urgent |
| `post_call_summary` | `text` | Generated clinical summary |
| `clinician_reviewed` | `boolean` | Whether a clinician has reviewed |
| `clinician_review_notes` | `text` | Clinician's review notes |
| `ai_model_used` | `text` | Model identifier |
| `clinic_timezone` | `text` | Clinic timezone (e.g., America/New_York) |
| `after_hours_escalation` | `boolean` | Whether escalation occurred outside business hours |
| `language_used` | `text` | Language of the conversation (auto-detected) |

**Table: `followup_escalations`**

| Column | Type | Description |
|---|---|---|
| `id` | `uuid` (PK) | Escalation ID |
| `session_id` | `uuid` (FK) | Reference to followup_sessions |
| `created_at` | `timestamptz` | Escalation timestamp |
| `severity` | `text` | urgent, same_day, next_visit, informational |
| `trigger_text` | `text` | The patient statement that triggered escalation |
| `trigger_category` | `text` | Category of escalation trigger |
| `ai_assessment` | `text` | AI's assessment of the trigger |
| `recommended_action` | `text` | What should happen next |
| `acknowledged` | `boolean` | Whether clinical team acknowledged |
| `acknowledged_by` | `text` | Who acknowledged |
| `resolution_notes` | `text` | How the escalation was resolved |

**Table: `followup_conversation_scripts`**

| Column | Type | Description |
|---|---|---|
| `id` | `uuid` (PK) | Script ID |
| `script_name` | `text` | Name of the script version |
| `modules` | `jsonb` | Conversation modules and branching logic |
| `escalation_rules` | `jsonb` | Escalation decision tree |
| `is_active` | `boolean` | Whether currently in use |
| `version` | `integer` | Script version number |

### 5.3 API Endpoints

**`POST /api/follow-up/start`** — Initiate a follow-up conversation

Request:
```json
{
  "patient_id": "uuid",
  "patient_name": "string",
  "visit_date": "date",
  "provider_name": "string",
  "medications": [
    { "name": "Levetiracetam", "dose": "500mg BID", "new": true }
  ],
  "visit_summary": "Brief visit summary text",
  "method": "voice | sms"
}
```

**`POST /api/follow-up/message`** — Process a patient message in an active conversation

Request:
```json
{
  "session_id": "uuid",
  "patient_message": "string",
  "message_type": "text | voice_transcript"
}
```

Response:
```json
{
  "agent_response": "string",
  "current_module": "greeting | medication | side_effects | symptoms | functional | questions | wrapup",
  "escalation_triggered": false,
  "escalation_details": null,
  "conversation_complete": false,
  "dashboard_update": {
    "status": "in_progress",
    "flags": [],
    "medication_status": { "filled": true, "taking": true, "side_effects": [] }
  }
}
```

**`POST /api/follow-up/escalate`** — Manual escalation by agent

**`GET /api/follow-up/:id/summary`** — Get structured post-call summary

**`GET /api/follow-up/dashboard`** — Get current dashboard state (all active/recent sessions)

### 5.4 External Services

| Service | Purpose | Phase |
|---|---|---|
| Anthropic Claude API | Conversation AI engine | Phase 1 |
| Vapi.ai or ElevenLabs | Production voice quality | Phase 2 (pre-recorded audio demo only in Phase 1) |
| Twilio | SMS sending/receiving | Phase 2 (simulated in Phase 1) |
| Supabase | Database, real-time subscriptions for dashboard | Phase 1 |

### 5.5 Data Flow

```
Follow-up triggered (post-visit, timed)
        ↓
System retrieves patient context (medications, visit summary)
        ↓
Conversation initiated (voice call placed or SMS sent)
        ↓
Patient responds → message sent to POST /api/follow-up/message
        ↓
API constructs prompt: system prompt + conversation history + patient message
        ↓
Claude API processes → returns structured response
        ↓
Parse response: agent reply + module tracking + escalation check
        ↓
If escalation triggered → write to followup_escalations + notify dashboard
        ↓
Store conversation turn in Supabase
        ↓
Return agent response to patient (voice/SMS)
        ↓
Dashboard updates via Supabase real-time subscription
        ↓
On conversation end → generate post-call summary → store
```

---

## 6. AI & Algorithm Design

### 6.1 What the AI Does

The AI manages a multi-turn clinical conversation following a structured script. It must:

1. **Navigate** through conversation modules in the correct order
2. **Parse** patient responses for clinical information (medications, side effects, symptoms)
3. **Detect** escalation triggers in real-time
4. **Respond** with empathetic, clinically appropriate language at a grade 6 reading level
5. **Summarize** the conversation into a structured clinical note
6. **Maintain** conversational context across the entire interaction

### 6.2 Model Selection

**Conversation Engine: Anthropic Claude (claude-sonnet-4-5-20250929)**

Rationale:
- Excellent multi-turn conversation management
- Strong at following structured scripts while remaining natural
- Reliable escalation detection with low false-negative rate
- Consistent structured output for dashboard updates

**Voice Engine (Phase 1): Pre-recorded audio demo only**

Rationale (CMIO recommendation):
- Live voice AI introduces latency, interruption handling, and transcription errors that distract from the core value and look buggy in a demo
- A pre-recorded audio file with scrolling transcript effectively communicates the vision without engineering risk
- All Phase 1 engineering effort is focused on the interactive SMS experience

**Voice Engine (Phase 2): Vapi.ai or ElevenLabs**

Rationale:
- Significantly more natural voice quality than OpenAI Realtime
- Lower latency
- Better interruption handling
- Multiple voice options and language support
- Evaluate both during Phase 1 for HIPAA compliance, cost, and naturalness

### 6.3 Escalation Decision Tree

```
TIER 1 — IMMEDIATE ESCALATION (Red)
Trigger → Clinician notified within 5 minutes
─────────────────────────────────────────────
├── Patient reports: chest pain or difficulty breathing
├── Patient reports: sudden severe headache ("worst of my life")
├── Patient reports: stroke symptoms (face droop, arm weakness, speech changes)
├── Patient reports: seizure since the visit
├── Patient reports: fall with head injury or loss of consciousness
├── Patient reports: suicidal ideation, self-harm thoughts, feeling hopeless
│   └── Special handling: "I want to make sure you're safe. If you're in
│       immediate danger, please call 911 or the 988 Suicide and Crisis
│       Lifeline. I'm also flagging this for your care team right now."
├── Patient reports: allergic reaction (rash, swelling, difficulty breathing)
│   └── NOTE: Even if patient says reaction has "resolved," STILL escalate as
│       Tier 1. Anaphylaxis is often biphasic — patients improve, then fatally
│       worsen hours later. Always advise ED evaluation.
├── Patient reports: severe medication reaction
├── Patient reports: sudden vision loss or severe double vision
└── Patient reports: abrupt cessation of anti-epileptic, antispasmodic, or
    benzodiazepine medication (risk of status epilepticus, withdrawal crisis)

TIER 2 — SAME-DAY CALLBACK (Orange)
Trigger → Clinician callback within same business day
─────────────────────────────────────────────
├── Side effects significantly interfering with daily life
├── New neurological symptoms not present at visit
├── Worsening of the primary symptom
├── Patient unable to tolerate prescribed medication
├── Patient reports feeling significantly WORSE compared to before visit
├── Patient expresses significant distress or anxiety
├── Patient reports medication interaction concern
└── Patient reports abrupt cessation of anti-epileptic, antispasmodic,
    or benzodiazepine (may also be Tier 1 depending on recency/history)

TIER 3 — NEXT-VISIT FLAG (Yellow)
Trigger → Note added to chart for next appointment
─────────────────────────────────────────────
├── Mild side effects (expected, not interfering with daily life)
├── Mild new symptoms (non-urgent)
├── Patient has clinical questions requiring physician answer
├── Patient reports partial medication adherence
├── Patient reports feeling ABOUT THE SAME as before visit
└── Patient requests earlier follow-up appointment

TIER 4 — INFORMATIONAL (Green)
Trigger → Logged, no immediate action needed
─────────────────────────────────────────────
├── No side effects, no new symptoms
├── Taking medication as prescribed
├── Patient reports feeling BETTER compared to before visit
├── No questions or questions answered by AI
└── Patient satisfied with care plan
```

### 6.4 System Prompt — Draft

```
You are a post-visit follow-up assistant for a neurology clinic. You contact patients after their neurology appointment to check on their medications, side effects, symptoms, and overall wellbeing.

## YOUR IDENTITY
- You are an AI assistant, and you MUST disclose this when asked or at the start of the call
- You represent Dr. [provider_name]'s neurology office
- You are NOT a doctor, nurse, or clinician
- You CANNOT diagnose conditions, change medications, or provide medical advice
- You CAN: collect information, answer logistical questions, provide general medication information (e.g., "it's common to experience some drowsiness when starting levetiracetam"), and flag concerns for the clinical team

## PATIENT CONTEXT
Patient: {patient_name}
Visit Date: {visit_date}
Provider: {provider_name}
Medications: {medications_json}
Visit Summary: {visit_summary}

## CONVERSATION FLOW
Follow these modules in order. You may skip modules if the patient provides information proactively that covers them.

### Module 1: Greeting & Consent
- Identify yourself as the follow-up assistant from Dr. [provider]'s office
- State you are an AI assistant
- Ask if it's a good time for a 3-5 minute check-in
- Mention they can ask to speak with a human at any time
- If they decline: offer to reschedule or switch to text
- **If a caregiver answers:** Ask their name, relationship to the patient, and confirm they are authorized to discuss the patient's care. If authorized, proceed using caregiver-adapted language ("How has [patient] been doing?" instead of "How have you been?"). If not authorized, politely end and request the patient or authorized proxy call back.

### Module 2: Medication Check
- For each new/changed medication, ask:
  - Were they able to fill it?
  - Are they taking it as prescribed?
- If not filled: offer care coordinator assistance, note the barrier
- If not taking: explore the reason without judgment
- **CRITICAL — Abrupt Cessation Check:** If the patient has abruptly stopped an anti-epileptic (levetiracetam, carbamazepine, lamotrigine, valproate, phenytoin, etc.), antispasmodic (baclofen, tizanidine), or benzodiazepine → IMMEDIATELY escalate as Tier 1 or Tier 2. Do NOT simply "explore" — these are medical emergencies (risk of status epilepticus, withdrawal seizures, withdrawal crisis).
- **Dose Change Requests:** If patient asks to change their dose (e.g., "Can I take half?"), use the strict canned refusal: *"I cannot advise on changing your medication dose. Please continue taking your prescribed dose, and I will flag your question for the nurse to call you back today."* Do NOT improvise medication advice.

### Module 3: Side Effects
- Ask about any side effects or anything that feels different
- For each reported side effect, assess:
  - Severity (mild / moderate / severe)
  - Impact on daily life
  - Duration
- Apply escalation logic based on severity

### Module 4: Symptom Check
- Ask about new symptoms or changes to existing symptoms
- For reported symptoms, ask:
  - When did it start?
  - Is it getting better, worse, or stable?
  - How does it affect daily activities?
- Apply escalation logic for red flag symptoms

### Module 5: Functional Status
- Ask: "Compared to how you were feeling before your visit, would you say you're feeling better, worse, or about the same?"
- If worse: follow up to understand what changed, assess severity, apply escalation logic
- If same: acknowledge, note for care team
- If better: acknowledge positively
- Do NOT use a 1-10 numeric scale (produces false-positive escalations for patients with chronic progressive conditions whose baseline is already low)

### Module 6: Questions
- Ask if they have questions from the visit
- Answer logistical questions (scheduling, where to get labs, etc.)
- For clinical questions: acknowledge and flag for clinician

### Module 7: Wrap-Up
- Summarize what you discussed
- Inform them their care team will review the summary
- Provide office phone number
- Thank them for their time

## ESCALATION RULES (CRITICAL — ALWAYS CHECK)

IMMEDIATELY ESCALATE (Tier 1 — tag as "urgent") if patient mentions ANY of:
- Chest pain or difficulty breathing
- Sudden severe headache
- Stroke symptoms (face droop, arm weakness, speech changes)
- Seizure since the visit
- Fall with head injury or loss of consciousness
- Suicidal thoughts, self-harm, hopelessness
- Allergic reaction symptoms
- Severe medication reaction
- Sudden vision loss

When Tier 1 escalation is triggered:
1. Acknowledge the patient's concern with empathy
2. If life-threatening: advise calling 911 immediately
3. If suicidal ideation: provide 988 Lifeline number
4. **IMMEDIATELY TERMINATE the standard clinical script.** Do NOT proceed to the next module. The AI must say: *"Because of what you just shared, I need you to hang up and call 911 [or 988] immediately. I am alerting your doctor's office now. Please do not wait."*
5. Do NOT attempt to diagnose or treat
6. **Do NOT continue the conversation after a Tier 1 declaration.** The only acceptable follow-up is confirming the patient understands they should call 911/988. The AI must not ask about side effects, functional status, or any other module after a life-threatening disclosure.

> **Design rationale (CMIO):** The AI cannot just say "call 911" and then casually move on to "so, any side effects?" — this trivializes the emergency and wastes critical seconds. Script termination is mandatory.

**WHEN TIER 1 IS TRIGGERED:** Immediately terminate the standard conversation flow. Say: "Because of what you just shared, I need you to hang up and call 911 [or 988] immediately. I am alerting your doctor's office now." Do NOT proceed to the next module. The conversation is OVER except to confirm the patient understands.

SAME-DAY ESCALATE (Tier 2 — tag as "same_day") if:
- Side effects significantly impacting daily life
- New neurological symptoms
- Worsening primary symptoms
- Cannot tolerate medication
- Patient reports feeling significantly worse compared to before the visit
- Significant patient distress
- Abrupt cessation of anti-epileptic, antispasmodic, or benzodiazepine medication

## COMMUNICATION STYLE
- Warm, empathetic, professional
- Grade 6 reading level (avoid medical jargon)
- Short sentences (1-3 sentences per message in SMS mode)
- Always acknowledge what the patient shares before asking the next question
- Never rush the patient
- Use the patient's name occasionally
- Never minimize a patient's reported experience
- **MULTILINGUAL:** If the patient responds in a language other than English, seamlessly transition to that language for the remainder of the conversation. Do not force English.
- **CAREGIVER MODE:** If speaking with a caregiver, use third-person references ("How has [patient name] been doing?") instead of second-person ("How have you been?").

## BUSINESS HOURS AWARENESS
- Current clinic hours: {clinic_hours} (timezone: {clinic_timezone})
- On-call number: {oncall_number}
- If an escalation occurs AFTER clinic hours: For Tier 1, advise 911/988 AND instruct patient to page on-call physician. For Tier 2, instruct patient to go to ED if worsening, or call on-call number, and queue the flag for first business hour.

## OUTPUT FORMAT

For each response, return JSON:
{
  "agent_message": "Your response to the patient",
  "current_module": "greeting|medication|side_effects|symptoms|functional|questions|wrapup",
  "escalation_triggered": false,
  "escalation_details": {
    "tier": "urgent|same_day|next_visit|informational",
    "trigger_text": "what the patient said",
    "category": "category of trigger",
    "recommended_action": "what should happen"
  },
  "conversation_complete": false,
  "extracted_data": {
    "medication_status": [
      { "medication": "name", "filled": true, "taking": true, "side_effects": [] }
    ],
    "new_symptoms": [],
    "functional_status": "better | worse | about_the_same",
    "functional_details": "string (if worse, what changed)",
    "patient_questions": [],
    "caregiver_info": { "is_caregiver": false, "name": null, "relationship": null }
  }
}

## WHAT YOU MUST NEVER DO
1. Never diagnose a new condition
2. Never change medication dosing or advise stopping a medication
3. Never dismiss a symptom the patient reports as serious
4. Never claim to be a human
5. Never provide specific medical advice (e.g., "you should take ibuprofen")
6. Never promise a specific timeline for clinician callback
7. Never access or reference information the patient hasn't shared with you
8. Never argue with the patient or insist they are wrong about their experience
9. Never continue a conversation if the patient has asked to stop
10. Always offer to connect to a live person when asked
```

### 6.5 Guardrails Within the AI

| Guardrail | Implementation |
|---|---|
| No diagnosis | System prompt + output parsing to flag diagnostic language |
| No medication changes | System prompt + keyword detection ("stop", "increase", "decrease", "half", "skip", "cut" + medication name → redirect to clinician). **Strict canned refusal:** When a patient asks to change their dose (e.g., "Can I just take half?"), the AI must respond with exactly: *"I cannot advise on changing your medication dose. Please continue taking your prescribed dose, and I will flag your question for the nurse to call you back today."* This prevents LLM hallucination of dose adjustment advice. |
| Escalation never missed | Dual-check: AI applies rules AND a post-processing regex layer scans transcript for known trigger phrases |
| Empathy maintenance | System prompt requires acknowledgment before questions; output parsing checks for abrupt transitions |
| Conversation scope | If patient asks about unrelated topics, AI gently redirects: "I appreciate you sharing that. My role today is to focus on your neurology follow-up, but I can pass along any other concerns to your care team." |
| Forced human handoff | If AI confidence is low or patient explicitly requests a human, conversation is paused and clinical team is notified |

---

## 7. Safety & Guardrails

### 7.1 Clinical Safety Boundaries

- **The AI is a data collection and routing tool, not a clinician.** It gathers information and routes it to the right person.
- **Escalation is one-directional and conservative.** If any ambiguity exists about whether to escalate, the system escalates. False positives are preferable to false negatives.
- **The AI never de-escalates.** Once an escalation is triggered, it cannot be un-triggered by subsequent patient statements.
- **No medical advice.** The AI can share general medication information (e.g., "drowsiness is common when starting this medication") but never specific recommendations.
- **Mandatory human review.** Every conversation summary must be reviewed by a clinician before any clinical action is taken.

### 7.2 Escalation Logic — Critical Safety

| Trigger | Severity | Action |
|---|---|---|
| Suicidal ideation, self-harm | CRITICAL | Provide 988 Lifeline, **terminate clinical script immediately**, flag immediate team notification |
| Stroke symptoms | CRITICAL | Advise 911, **terminate clinical script immediately**, flag immediate team notification |
| Seizure report | URGENT | Flag for urgent clinician callback within 1 hour |
| Allergic reaction (active OR "resolved") | URGENT | **Always advise ED evaluation** — biphasic anaphylaxis risk means even "resolved" reactions can fatally recur hours later. Do NOT downgrade to same-day callback. |
| Abrupt medication cessation (anti-epileptics, antispasmodics, benzodiazepines) | URGENT | Flag for urgent clinician callback — risk of status epilepticus or withdrawal crisis |
| Fall with injury | URGENT | Assess for head injury; if present or unclear, flag urgent |
| Severe side effects | SAME-DAY | Flag for same-day clinician callback |
| Medication not filled | SAME-DAY | Flag for care coordinator follow-up |
| New neurological symptoms | SAME-DAY | Flag for clinician callback |

### 7.2.1 Business Hours Awareness — After-Hours Escalation Logic

The AI must have contextual awareness of the current day/time and the clinic's operating hours. Escalation routing changes based on whether the clinic is open:

| Scenario | During Business Hours (configurable, default M-F 8am-5pm) | After Hours / Weekends / Holidays |
|---|---|---|
| **Tier 1 (CRITICAL)** | Flag immediate team notification + advise 911/988 | Advise 911/988 + instruct patient to page on-call physician. AI message: *"Our office is currently closed. Because of what you've shared, please call 911 [or 988] immediately. You can also reach the on-call neurologist by calling [on-call number]."* |
| **Tier 2 (SAME-DAY)** | Flag for same-day clinician callback | Instruct patient to go to ED/Urgent Care if worsening, or call on-call physician. Queue flag for first business hour. AI message: *"Our office is currently closed and will reopen at [time]. If your symptoms worsen, please go to your nearest Emergency Department or call the on-call doctor at [number]. I'm flagging this for your care team first thing when the office opens."* |
| **Tier 3/4** | Normal routing | Queue for next business day. No after-hours action needed. |

**Implementation:** The `followup_sessions` table must include a `clinic_timezone` and `clinic_hours` field. The escalation logic checks `current_time` against clinic hours before determining the routing path. The on-call phone number is configurable per clinic.

### 7.3 Regulatory Considerations

- **HIPAA**: All conversation data is PHI. Encryption at rest and in transit mandatory. Voice recordings especially sensitive — require explicit patient consent before recording. For POC: use synthetic data only. For production: ensure BAAs with all vendors (Supabase, Anthropic, Twilio, voice provider).
- **Telehealth regulations**: AI follow-up calls are not telehealth visits (no clinical decision-making occurs). However, state laws vary. Some states may require disclosure that the call is AI-powered (the script already includes this).
- **FDA**: Post-visit follow-up that collects data and routes to clinicians is not a medical device. However, if the AI begins making autonomous clinical recommendations (e.g., "you should stop your medication"), it could be classified as SaMD. Maintain strict guardrails.
- **TCPA (Telephone Consumer Protection Act)**: For SMS — patients must opt in before receiving automated messages. Must include opt-out mechanism. Cannot send messages before 8am or after 9pm local time.
- **Consent**: Patients must consent to AI follow-up outreach. Consent should be collected during the visit (paper or EHR form). Opt-out must be immediate and permanent for that episode.

### 7.4 UI Disclaimers

**On the demo page:**
> "This is a demonstration of an AI-powered post-visit follow-up system. In production, all conversations are reviewed by a licensed clinician before clinical action is taken."

**In the conversation (voice/SMS):**
> The AI identifies itself as an AI assistant at the start of every conversation and offers connection to a human team member.

**On the clinician dashboard:**
> "These summaries were generated by an AI assistant. Review the full transcript before taking clinical action."

---

## 8. Demo Design

### 8.1 The 3-Minute Demo

**Minute 0:00-0:30 — Context Setting**
"After a neurology visit, patients start new medications with real side effects — anti-epileptics, Parkinson's drugs, migraine preventives. Today, follow-up depends on whether a nurse has time to call, which means most patients fall through the cracks. Our AI agent contacts every patient, every time — and every conversation generates the documentation required for TCM/CCM billing."

**Minute 0:30-1:30 — Routine Follow-Up Demo (SMS)**
- Show the SMS interface with a post-seizure patient started on levetiracetam
- Walk through: medication check (filled, taking it), side effects (mild drowsiness — AI provides reassurance), no new symptoms, functional status: "better than before the visit"
- Point out the clinician dashboard updating in real-time: "The clinical team sees this summary building live."
- Note: "A patient replies in Spanish? The AI seamlessly switches to Spanish — no configuration needed."

**Minute 1:30-2:30 — Escalation Demo (SMS)**
- Same interface, different patient
- Patient types: "I had a seizure last night"
- Show the immediate escalation: **dashboard flashes red**, urgent flag appears, AI responds with empathy and flags for urgent callback
- "The system caught this in real-time. The clinical team gets notified in under 5 minutes."
- Quick mention: "If this happened at 9 PM on a Friday, the AI knows the clinic is closed and tells the patient to page the on-call neurologist."

**Minute 2:30-3:00 — The Post-Call Summary + Revenue**
- Show the structured clinical note generated from the routine follow-up
- "This summary is ready to paste into the EHR. No nurse had to write it, no physician had to read an unstructured message. And we have a complete, auditable record of every follow-up."
- Revenue hook: "Every one of these conversations is automatically documented at the level required for Transitional Care Management and Chronic Care Management billing. That's revenue your clinic is currently leaving on the table."

### 8.2 Key Wow Moments

1. **Real-time escalation**: The moment a patient reports a seizure or expresses suicidal ideation, the dashboard lights up — demonstrating the safety net. **Ensure the UI clearly flashes/changes color when an escalation is triggered.** This is the "shut up and take my money" moment for a clinic director.
2. **Structured clinical note**: The post-call summary looks like something a nurse would write, generated automatically
3. **Scale**: "This agent can make 100 follow-up calls simultaneously. No FTEs, no scheduling nightmares."
4. **Patient empathy**: The AI's responses feel warm and human — not robotic or dismissive
5. **Nothing falls through the cracks**: Every patient gets followed up, every time, documented every time
6. **Direct revenue generation (TCM/CCM billing)**: These structured AI follow-ups generate the exact documentation required to bill Medicare **Transitional Care Management (TCM)** codes (CPT 99495, 99496) and **Chronic Care Management (CCM)** codes (CPT 99490, 99491). TCM requires a patient contact within 2 business days of discharge and a face-to-face visit within 7-14 days — the AI handles the contact requirement automatically and documents it. CCM requires 20+ minutes of non-face-to-face clinical staff time per month — AI follow-up conversations contribute directly to that time threshold with full documentation. This transforms the AI from a pure cost-center into a **direct revenue generator** that can pay for itself. Demo talking point: *"Every one of these conversations is automatically documented at the level required for TCM/CCM billing. That's revenue your clinic is currently leaving on the table."*

### 8.3 Sample Demo Patient Scenarios

**Scenario 1 — Routine (happy path):**
Patient: Maria Santos, 34F. Visit: MS follow-up. New medication: Tecfidera 240mg BID. Status: filled, taking, mild flushing (expected). Functional score: 8/10. No questions.

**Scenario 2 — Escalation (seizure):**
Patient: James Okonkwo, 42M. Visit: New epilepsy. New medication: Levetiracetam 500mg BID. Status: filled, taking. Reports seizure 2 days after visit. → URGENT escalation

**Scenario 3 — Medication not filled:**
Patient: Dorothy Chen, 72F. Visit: Memory clinic. New medication: Donepezil 5mg daily. Status: not filled — pharmacy said insurance won't cover. → Flag care coordinator

**Scenario 4 — Mental health escalation:**
Patient: Robert Alvarez, 55M. Visit: Parkinson's disease. Medication: carbidopa/levodopa increased. Reports feeling hopeless, "what's the point." → CRITICAL escalation, 988 resources provided, **script terminates immediately** — AI does not proceed to further modules.

**Scenario 5 — Caregiver/proxy conversation:**
Patient: Harold Washington, 78M. Visit: Memory clinic, moderate Alzheimer's. New medication: Donepezil 10mg daily. SMS answered by daughter Linda Washington. AI verifies caregiver identity and authorization, then conducts full follow-up in caregiver-adapted language. Linda reports father is taking medication but had an episode of nausea. → Tier 3 (Next-visit) flag, mild expected side effect.

**Scenario 6 — Abrupt medication cessation:**
Patient: Keisha Brown, 28F. Visit: Epilepsy follow-up. Medication: Levetiracetam 750mg BID. Reports she ran out of medication 3 days ago and hasn't been able to get a refill (insurance issue). → **URGENT escalation** — abrupt anti-epileptic cessation, risk of breakthrough seizures/status epilepticus. AI flags for immediate clinician callback AND care coordinator to resolve insurance barrier.

---

## 9. Phased Roadmap

### Phase 1: POC / Demo Version (Current Sprint)

**Scope:**
- Demo page with **interactive SMS conversation simulation** (in-browser, fully functional)
- **No live Voice AI in Phase 1.** Voice latency, interruption handling, and transcription errors in a live demo will distract from the core value and look buggy. If voice must be shown, use a **pre-recorded audio file** that plays alongside a scrolling transcript to simulate what Phase 2 will look like.
- 4 pre-built patient scenarios (including caregiver scenario)
- Full escalation logic with real-time dashboard (with visual flash/color change on escalation)
- Post-call summary generation
- Business hours awareness logic
- Supabase storage of all conversations
- No real patient contact
- No real SMS/voice infrastructure

**Technical:**
- Next.js page at `/follow-up`
- Claude API for conversation management
- Simulated SMS in browser (no Twilio needed for demo)
- Optional: Pre-recorded voice demo audio file + scrolling transcript (NOT live OpenAI Realtime API)
- Supabase tables for conversation storage

**Timeline:** 1-2 development sessions

> **CMIO recommendation:** Focus 100% of Phase 1 engineering on a flawless, interactive SMS demo. A highly polished, bug-free SMS chat with a live-updating dashboard is more than enough to prove the concept. De-risk the build by deferring live voice to Phase 2.

### Phase 2: Clinical Pilot Version

**New Features:**
- Real SMS via Twilio
- Production voice via Vapi.ai or ElevenLabs
- EHR integration: auto-populate visit context, write-back summaries
- Multi-language support (Spanish)
- Patient consent management
- Scheduled outreach: auto-trigger follow-up calls at configurable intervals post-visit
- Clinician review workflow with approve/edit/escalate actions
- Analytics: response rates, escalation rates, time-to-response

**Timeline:** 3-6 months post-POC

### Phase 3: Production / Scaled Version

**New Features:**
- Multi-clinic deployment
- Specialty-specific conversation scripts (epilepsy, movement disorders, headache, etc.)
- Patient sentiment analysis and satisfaction scoring
- Longitudinal follow-up: multiple check-ins per episode (3-day, 2-week, 6-week)
- Integration with patient portal
- AI-generated visit-prep summaries for the next appointment using follow-up data
- HIPAA-compliant infrastructure with full audit trail
- Outcome tracking: does AI follow-up correlate with fewer ED visits, better adherence?

**What Changes Between Phases:**
- Phase 1 → 2: Adds real communication channels, EHR integration, clinical workflow
- Phase 2 → 3: Adds multi-clinic, longitudinal follow-up, outcome measurement, regulatory infrastructure

---

## 10. Open Questions & Decisions Needed

### Resolved (CMIO Review)

1. ~~**Voice vs. SMS priority**~~ → **RESOLVED:** Focus 100% of Phase 1 on interactive SMS demo. If voice must be shown, use a pre-recorded audio file with scrolling transcript — do NOT build live voice AI for Phase 1. SMS-first for pilot as well (equity: voice consumes prepaid minutes; SMS is generally unlimited).
3. ~~**Conversation script customization**~~ → **RESOLVED:** Keep one universal script for Phase 1. Over-customizing adds unnecessary state management complexity. Diagnosis-specific scripts (epilepsy seizure frequency, Parkinson's motor fluctuations) deferred to Phase 2/3.
5. ~~**Outreach timing**~~ → **RESOLVED:** 7 days post-visit is the sweet spot. 3 days is too early for most medications to reach steady state or for side effects to balance out. Configurable per provider in Phase 2.
6. ~~**Clinician notification method**~~ → **RESOLVED:** For Tier 1/2, notification must go to the EHR In Basket AND trigger a priority visual flag on the app dashboard. Dashboard-only is insufficient — nurses will forget to check it. For Phase 1 demo, dashboard flag is sufficient.
8. ~~**Liability**~~ → **RESOLVED (framework):** Legally, treat AI follow-up as equivalent to an asynchronous patient portal message. If a patient sends a portal message saying "I am having a stroke," the clinic is liable if they don't check it. The AI *mitigates* this risk by auto-flagging it, which is legally safer than the current standard of care (unmonitored voicemails). Full legal review still needed before pilot, but the framework is sound.

### Still Open

2. **Voice provider for Phase 2**: Vapi.ai vs. ElevenLabs vs. other? Need to evaluate on: voice naturalness, latency, cost, HIPAA compliance, language support.
4. **Consent model**: How is patient consent collected? During the visit (nurse-administered), via patient portal, or via initial SMS opt-in? Who tracks consent status?
7. **Human handoff mechanism**: When a patient requests a human, what happens? Direct transfer to nurse line? Callback scheduled? Portal message sent?
9. **Success metrics**: What defines success for this tool? Proposed: (a) 80%+ patient engagement rate, (b) <5 min clinician notification for urgent escalations, (c) 90%+ escalation accuracy, (d) patient satisfaction ≥4/5.
10. **Data retention**: How long are conversation transcripts retained? Voice recordings? Does the clinic's data retention policy apply, or do we need a separate policy?

### New Questions (from CMIO Review)

11. **On-call number integration**: How does the system obtain the on-call physician's pager/phone number for after-hours escalations? Is this a static config, or does it pull from the clinic's on-call schedule system?
12. **Caregiver authorization verification**: In production, how does the system verify that a caregiver is authorized to discuss the patient's care? Is this tracked in the EHR (e.g., HIPAA authorization on file), or does verbal confirmation suffice for a follow-up call?
13. **TCM/CCM billing workflow**: Who owns the billing code submission? Does the AI follow-up auto-generate a billable encounter, or does a clinician need to attest to the contact before the code can be submitted?
