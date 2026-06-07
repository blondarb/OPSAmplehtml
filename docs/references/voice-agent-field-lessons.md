# Reference: Field Lessons from a Production Voice AI Scheduling Agent

## Document Information

| Field | Value |
|-------|-------|
| Type | External reference / field notes |
| Source | Reddit practitioner post (team that shipped an AI phone-based scheduling agent) |
| Captured | 2026-05-29 |
| Status | Reference only — not a spec or commitment |
| Relevance | AI Historian (`/consult`), Live Follow-Up Agent (`/follow-up`), any future phone/voice channel |

---

## Why this lives in the repo

This is a first-hand account from a team that put a **voice AI scheduling agent on real phone
calls**. We don't build a scheduling agent, but we do build voice-driven patient-facing agents
(the AI Historian over WebRTC, and the Follow-Up Agent over Twilio SMS + voice). The hard-won
lessons below overlap heavily with our problem space — especially anything that touches **live
phone audio, ASR on clinical vocabulary, barge-in, graceful human handoff, and PHI/compliance.**

Treat this as a checklist of failure modes to design against, not as requirements.

---

## The six lessons (verbatim, with our annotations)

### 1. Latency is the entire product

> On a screen a 2-second AI delay is fine. On a phone call, anything past about a second of dead
> air and the patient would go "hello? hello?" and start repeating themselves, which wrecks the
> transcription. We spent more time shaving response time than on anything else.

**Relevance to us:**
- Our `/consult` Historian already runs on the Realtime API over WebRTC specifically to keep
  round-trip latency low — this validates that choice. The danger zone is any path where we add a
  server hop (tool calls, the Localizer push channel, scale injection).
- Twilio voice on the Follow-Up Agent is the higher risk surface: a 202+poll or Bedrock round-trip
  that's tolerable on a screen becomes dead air on a call.
- **Watch items:** turn-detection tuning (`server_vad`/`semantic_vad` thresholds we already tweaked
  in PR #107), tool-call latency budget, and the fact that patient self-repetition *corrupts the
  transcript*, not just the UX.

### 2. Speech-to-text falls apart on the words that matter most

> General ASR is great until someone says their last name, a medication, or a specialist name, over
> a bad cell connection, with an accent. Out-of-the-box accuracy on exactly those high-stakes words
> was rough. We had to bias the vocabulary heavily toward names, meds and scheduling terms.

**Relevance to us:** This is arguably the single most important lesson for a *neurology* intake
agent. Our highest-stakes words are drug names (anticonvulsants, DMTs, triptans), symptom and
anatomy terms, and patient/provider names — precisely the long-tail tokens general ASR misses.
- Consider vocabulary biasing / phrase hints for med lists, neurology terminology, and the active
  patient/provider roster.
- Whisper and the Realtime transcription model both support prompt/vocabulary biasing — we should
  evaluate feeding a domain lexicon.
- Errors here are a **clinical safety issue**, not just a quality one (a misheard med or dose).
- **Current state (verified 2026-06-07): we pass NO ASR biasing on any surface** (Historian, Intake,
  Follow-Up voice all use bare `whisper-1`; Deepgram fallback has no keyterms). Scoped fix in
  `docs/plans/2026-06-07-asr-vocabulary-biasing-spec.md`.

### 3. The AI is the easy 20%. The integration is the hard 80%.

> Pulling real-time slot availability and writing an appointment back into the system is where the
> project lives or dies. Legacy interfaces, partial FHIR support, and "this field is technically
> optional but actually required" surprises ate most of our timeline.

**Relevance to us:** Directly maps to EHR/RDS write-back. Our intake pipeline already feels this:
JSONB-array-vs-`text[]` stringify gotchas (PR #107), relaxed NOT NULL columns to let pending rows
insert (migrations 044/046/047), and the consult state machine. The lesson generalizes: **budget
for the system-of-record integration as the majority of the work**, and expect "optional but
actually required" fields when we integrate with real EHRs beyond the demo DB.

### 4. Patients interrupt constantly

> People talk over the bot, change their mind mid-sentence, give the date before you ask for it.
> Without solid barge-in handling it feels robotic and people just bail to the front desk.

**Relevance to us:** Barge-in / interruption handling is a first-class requirement for the
Historian and any voice follow-up. The Realtime API handles barge-in natively, but we should
explicitly verify: (a) the model stops speaking when the patient starts, (b) we don't lose
out-of-order answers (patient volunteering info before we ask), and (c) our phased prompt
(turns 1-3 open, 4+ tool-augmented) tolerates the patient front-loading information.

### 5. Knowing when *not* to handle the call

> The agent has to catch confusion, distress, or anything clinical and hand off to a human cleanly
> instead of stubbornly trying to finish the booking. Graceful failure mattered way more for trust
> than any success metric.

**Relevance to us:** We already have a red-flag escalation detector and crisis-safety monitoring in
the Historian — this lesson says to treat **clean human handoff as a primary success metric, not an
edge case.** For a clinical intake agent the bar is higher than for scheduling: confusion, distress,
or any acute clinical signal should trigger a graceful, well-messaged handoff rather than the agent
pushing to complete the interview. Worth auditing our escalation UX against "does this feel like a
clean handoff to the patient?"

### 6. Compliance shapes the architecture from day one

> BAA, where PHI lives, call recording consent, retention windows — none of this is a feature you
> bolt on later. It changes how you build everything.

**Relevance to us:** We already operate under this constraint (Cognito auth, RDS, BAA-relevant
vendor choices). The specific reminders that apply to *voice*:
- **Call/recording consent** for any Twilio voice leg and stored audio.
- **Where PHI lives** across OpenAI Realtime, Whisper, Bedrock, and Twilio — and which have BAAs.
- **Retention windows** for transcripts, audio, and `historian_sessions`/`followup_phone_sessions`
  rows.
- The planned move to AWS Transcribe Medical (HIPAA-eligible) is consistent with this lesson.

---

## How to use this doc

- When scoping any **phone/voice** work, walk these six points as a pre-mortem checklist.
- When something here turns into an actual decision or requirement, capture it in the relevant
  **PRD** (`PRD_AI_HISTORIAN.md`, the follow-up agent plans) or a handoff — don't let this reference
  silently become the spec.
