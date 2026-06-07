# Spec: ASR Vocabulary Biasing for Clinical Voice Surfaces

## Document Information

| Field | Value |
|-------|-------|
| Type | Spec / scoping doc (no code yet) |
| Created | 2026-06-07 |
| Status | Proposed |
| Motivation | `docs/references/voice-agent-field-lessons.md` lesson #2 ("ASR falls apart on the words that matter most") |
| Owner | Sevaro Clinical Engineering |

---

## Problem

Our voice surfaces transcribe patient speech with **no domain vocabulary biasing** anywhere
in the stack. General-purpose ASR is weakest on exactly the words that matter most clinically —
drug names, anatomy/symptom terms, and patient/provider names — and a misheard medication or
dose is a **patient-safety issue**, not just a transcript-quality one.

### Current state (verified 2026-06-07, file:line)

Every transcription config passes only a bare model, no biasing field:

| Surface | File | Config |
|---|---|---|
| AI Historian (Realtime) | `src/app/api/ai/historian/session/route.ts:63` | `audio.input.transcription: { model: 'whisper-1' }` |
| Intake voice (Realtime) | `src/app/api/ai/intake/session/route.ts:30` | `input_audio_transcription: { model: 'whisper-1' }` |
| Follow-Up voice (Realtime) | `src/app/api/follow-up/realtime-session/route.ts:84` | `input_audio_transcription: { model: 'whisper-1' }` |
| Post-recording fallback | `src/app/api/ai/transcribe/route.ts:55` | Deepgram `nova-3`, no keyterm hints |
| Streaming (future) | `src/lib/transcribe-streaming.ts` | AWS Transcribe streaming, no custom vocabulary |

No `prompt`, `vocabulary`, `keyterm`, or custom-vocabulary field is set on any of them.

---

## Goal

Bias each transcription surface toward a **neurology clinical lexicon** plus a **per-session
roster** (the active patient's name and their provider's name), so high-stakes tokens transcribe
correctly. Keep it data-driven and easy to extend.

### Non-goals
- Rebuilding the transcription pipeline or switching primary ASR vendors.
- Changing turn-detection / latency tuning (tracked separately under lesson #1).
- Any PHI-handling change beyond what existing BAAs already cover (see Compliance below).

---

## Proposed approach

### A lexicon source of truth
Create a small module (e.g. `src/lib/asr/clinical-lexicon.ts`) exporting:
- **Static neurology terms** — anticonvulsants (levetiracetam, carbamazepine, lamotrigine,
  valproate…), DMTs (natalizumab, ocrelizumab, interferon…), triptans, common anatomy/symptom
  terms (paresthesia, dysarthria, optic neuritis, thunderclap…), and scale names (MIDAS, MoCA,
  PHQ-9…).
- **Dynamic per-session terms** — the active patient's name and the assigned provider's name,
  injected at session-creation time (we already have the consult/patient context server-side).

This single source feeds all surfaces below, formatted per each API's biasing mechanism.

### Per-surface injection points

1. **OpenAI Realtime surfaces (Historian, Intake, Follow-Up voice)** — set a biasing
   `prompt`/vocabulary on the transcription config in the session-creation route (the three
   files above). *Verify the current Realtime API's `input_audio_transcription` biasing
   support at implementation time* — if the bare `whisper-1` transcription config still won't
   accept a prompt, prefer migrating that field to a transcription model that does (e.g.
   `gpt-4o-transcribe`) or rely on the post-recording path (#2) for the corrected record.

2. **Post-recording Whisper path** (`src/app/api/ai/transcribe/route.ts`) — Whisper's
   `POST /v1/audio/transcriptions` accepts a `prompt` param that biases toward supplied terms.
   Lowest-risk place to start: pass the lexicon string there. Deepgram `nova-3` also supports
   `keyterm` hints if we keep it as fallback.

3. **AWS Transcribe Medical streaming** (`src/lib/transcribe-streaming.ts`) — when this path
   goes live, attach a **custom vocabulary** (`VocabularyName`) built from the lexicon. This is
   the HIPAA-eligible, production target and the strongest biasing mechanism of the three.

---

## Compliance note (lesson #6)

The per-session roster includes patient/provider names = PHI. Injecting them as ASR biasing
terms must stay within the same BAA-covered boundary as the audio itself (we already send the
patient's voice to these vendors). Do not log the lexicon string with PHI in plaintext app logs.
AWS Transcribe Medical custom-vocabulary is the cleanest fit since it's HIPAA-eligible.

---

## Rollout / verification

- Build the lexicon module + unit-test the formatter.
- Wire the post-recording Whisper `prompt` first (smallest blast radius), measure WER on a
  fixed set of high-stakes utterances (drug names, sample patient names) before/after.
- Then the Realtime surfaces; re-run the historian smoke test (`qa/historian-wss-smoke.md`).
- Gate behind an env flag for hot-revert, consistent with existing historian flags.
- Add a QA case to `qa/TEST_CASES.yaml` covering med-name transcription accuracy.

## Open questions

- Does the GA Realtime API surface accept transcription biasing today, or do we need
  `gpt-4o-transcribe` / the post-recording path? (Confirm at implementation.)
- Size/refresh cadence of the dynamic roster — per-session only, or a cached provider list?
