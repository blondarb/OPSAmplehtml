# AI Historian — Realtime API + Harness Upgrade

**Date:** 2026-05-27
**Owner:** Steve Arbogast
**Status:** Design approved, awaiting implementation plan
**Repo:** `OPSAmplehtml`
**Affected route:** `/consult` Step 2 (AI Historian voice interview)

## Why

The `/consult` AI Historian was failing with `Failed to create realtime session: 400`. Root cause: OpenAI deprecated the original `gpt-realtime` / `POST /v1/realtime/sessions` flow. Beyond fixing the break, this is an opportunity to:

1. Upgrade to OpenAI's flagship `gpt-realtime-2` model (GPT-5-class reasoning).
2. Replace `server_vad` with `semantic_vad` to stop premature cut-offs when patients pause to think (the problem PR #105 hand-tuned around).
3. Sharpen the harness so the model uses the existing Localizer + Evidence Engine + scale library **actively** rather than as a passive background process.

## Scope (and explicit non-scope)

**In scope.** Upgrade the AI Historian voice interview on `/consult` to OpenAI Realtime API's current GA surface (`/v1/realtime/client_secrets` + `/v1/realtime/calls`, `gpt-realtime-2`, nested session schema, `semantic_vad`). Add two model-callable tools (`query_evidence`, `request_scale_administration`). Refresh the system prompt to enforce a phased interview structure with explicit neurology focus. Push Localizer findings into the live session as ambient context (new channel). Establish a pre/post-upgrade eval against the existing five sample personas.

**Out of scope — explicit guards:**
- **HIPAA / real-patient use.** `/consult` stays demo-only with the five sample personas. Real-patient voice flows are tracked separately (workspace roadmap line: "AWS Transcribe Medical, HIPAA-eligible"). No PHI flows through OpenAI in this work.
- **Multi-modal grounding.** Body-map markers, accelerometer tremor data, wearable readings are NOT exposed to the historian. This agent is designed for **first-encounter history-taking with limited prior documentation**. Multi-modal context belongs to a separate future agent.
- **Prior-visit memory.** This agent does not query past visit notes, past historian transcripts, or longitudinal wearable data. That belongs to a separate future agent.
- **Follow-up agent (`useFollowUpRealtimeSession.ts`, `/api/follow-up/realtime-session/route.ts`).** Different flow, different scope, not touched here.
- **Localizer pipeline internals.** `/api/ai/historian/localizer` keeps firing every 3 turns with the same symptom-extraction → KB-retrieve → question-generation pipeline. We add one outbound channel (push to live session), not new logic.
- **UI changes.** `LocalizerPanel`, scale UI, red-flag UI, transcript view — untouched.

## Architecture

```
                                                  ┌────────────────────────────────┐
                                                  │  Localizer (every 3 turns)     │
                                                  │  • Symptom extraction          │
                                       turn count │  • KB retrieve (existing)      │
                                          ────────┤  • Differential update         │
                                                  │  • Suggested next-Q / scale-id │
                                                  └──────────────┬─────────────────┘
                                                                 │
                                                                 ▼  (NEW: push channel)
                                                       session.update event
                                                       {current_differential,
                                                        suggested_question,
                                                        suggested_scale_id}
                                                                 │
                                                                 ▼
   Browser (WebRTC)                                       OpenAI Realtime
   ────────────────                                       ───────────────
   useRealtimeSession.ts ──────► POST /v1/realtime/client_secrets
                                    (ephemeralKey)
                          │
                          ├──SDP──► POST /v1/realtime/calls?model=gpt-realtime-2
                          │
                          ▼
   ┌─ Data channel ─────────────────────────────────────────────────────────┐
   │                                                                        │
   │  session.update (initial) — nested schema:                             │
   │    audio.input.turn_detection: {type:"semantic_vad", eagerness:"low"}  │
   │    audio.input.transcription:  {model:"whisper-1"}                     │
   │    audio.output.voice:         "verse"                                 │
   │    tools: [save_interview_output, save_scale_responses,                │
   │            query_evidence, request_scale_administration]               │
   │                                                                        │
   │  session.update (every 3 turns from Localizer) — same channel:         │
   │    instructions delta: "Differential leaders: X, Y, Z. Consider asking…"│
   │                                                                        │
   │  Tool calls from model:                                                │
   │    query_evidence(question, focus_diagnoses?) → server hits Bedrock    │
   │                                                  KB Retrieve (chunks   │
   │                                                  only, no synth) →     │
   │                                                  up to 5 chunks back   │
   │                                                                        │
   │    request_scale_administration(scale_id, reason) → server returns     │
   │                                                       verbatim scale   │
   │                                                       block → model    │
   │                                                       recites          │
   │                                                                        │
   │    save_scale_responses(…) — existing flow                             │
   │    save_interview_output(…) — existing flow                            │
   └────────────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Session creation (`src/app/api/ai/historian/session/route.ts`)
- Replace `POST https://api.openai.com/v1/realtime/sessions` with `POST https://api.openai.com/v1/realtime/client_secrets`.
- Model id from env: `OPENAI_HISTORIAN_REALTIME_MODEL` (default `gpt-realtime-2`).
- Return shape unchanged from the client's perspective (`{ ephemeralKey, sessionId, expiresAt, consult_id }`).
- On non-2xx from OpenAI: pass the raw error body up (don't collapse to a generic 400 string). Today's symptom hides root causes.

### 2. SDP exchange (`src/hooks/useRealtimeSession.ts`)
- `POST https://api.openai.com/v1/realtime/calls?model={model}` with the SDP offer + `Authorization: Bearer ${ephemeralKey}`. (Browser-side; bearer is the ephemeral key, not the master.)
- Set remote description from the SDP answer.

### 3. Initial session.update (`src/hooks/useRealtimeSession.ts`)
Nested schema per current API:
```ts
{
  type: "session.update",
  session: {
    instructions: <buildHistorianSystemPrompt result>,
    audio: {
      input: {
        turn_detection: turnDetectionConfig,   // env-driven (semantic_vad | server_vad)
        transcription: { model: "whisper-1" }
      },
      output: { voice: "verse" }
    },
    tools: [save_interview_output, save_scale_responses,
            query_evidence, request_scale_administration]
  }
}
```

Where `turnDetectionConfig` is read from `HISTORIAN_TURN_DETECTION_MODE`:
- `semantic_vad` (default): `{ type: "semantic_vad", eagerness: "low" }`
- `server_vad` (fallback): `{ type: "server_vad", threshold: 0.65, prefix_padding_ms: 400, silence_duration_ms: 1200 }` (PR #105 tuning preserved as a named const, not deleted)

### 4. Localizer push channel (`src/app/api/ai/historian/localizer/route.ts` + client)
Today the Localizer returns its findings as an HTTP response; `EmbeddedHistorian` consumes them for UI. **Add a parallel channel:** after Localizer completes, the client emits a `session.update` event on the data channel with an instructions delta:

```
Latest clinical context (from Localizer):
- Top differentials: <comma list>
- Suggested next question: <one line>
- Suggested scale to consider: <scale_id or "none">
```

This is **additive context**, not load-bearing. If the push fails, the interview continues on initial context.

### 5. New tool: `query_evidence`
**Definition (added in `src/lib/historianPrompts.ts`):**
```
name: query_evidence
description: When you are uncertain about clinical guidance, red flags, or how to differentiate
             two diagnoses you are weighing, query the Sevaro Evidence Engine. Use sparingly —
             prefer continuing the conversation when the Localizer's pushed context is enough.
parameters:
  question (string, required)
  focus_diagnoses (string[], optional)
```

**Server handler (`src/app/api/ai/historian/evidence-query/route.ts`, NEW):**
- Auth: `getUser()` (consult must belong to caller's tenant).
- Calls a NEW helper `retrieveChunksFromKB()` in `src/lib/bedrock.ts` that uses Bedrock Agents `RetrieveCommand` (NOT `RetrieveAndGenerateCommand` like the existing `retrieveFromKB`). Skipping the generation step cuts latency ~5× because the realtime model synthesizes in-context. Existing `retrieveFromKB()` is left in place — the Localizer keeps using it.
- Returns up to 5 chunks (matching `KB_RESULTS` in `src/app/api/ai/historian/localizer/route.ts` for consistency): `{ chunks: [{ content, source, score }], status: "ok" | "timeout" }`.
- 3-second AbortController timeout. On timeout: `{ chunks: [], status: "timeout" }`. Model is prompted to gracefully recover ("let me come back to that").

### 6. New tool: `request_scale_administration`
**Definition:**
```
name: request_scale_administration
description: When the differential and history suggest a standardized scale would quantify
             clinical outcome, request it. The server returns the EXACT scale wording — you
             MUST recite it verbatim to preserve instrument validity. Do NOT paraphrase.
parameters:
  scale_id (string, required) — one of: PHQ9, GAD7, MoCA, MiniCog, MIDAS, HIT6, ESS
  reason (string, required) — one sentence why this scale fits the current presentation
```

**Server handler (extend `src/app/api/ai/historian/scales/route.ts` with `?action=request`):**
- Lookup `scale_id` in `src/lib/consult/scales/scale-library.ts`.
- Return the scale's verbatim administration block + answer schema for `save_scale_responses`.
- Existing `save_scale_responses` handler unchanged — the existing capture/persist flow handles results.

### 7. System prompt (`src/lib/historianPrompts.ts`)
Replace `CORE_PROMPT + NEW_PATIENT_PROMPT`/`FOLLOW_UP_PROMPT` with a phased structure:

**Phase 1 (turns 1–3): Open exploration.** No tools. Warm greeting + chief complaint + OLDCARTS basics. Goal: enough signal for the Localizer to form a real differential.

**Phase 2 (turns 4 to budget): Tool-augmented refinement.** Targeted follow-ups informed by Localizer pushes. Use `query_evidence` sparingly when uncertain. Use `request_scale_administration` when the differential meaningfully implicates a scale (e.g., headache → MIDAS/HIT-6; cognitive complaint → MoCA/Mini-Cog; mood → PHQ-9/GAD-7; sleep → ESS). Recite scale items verbatim from server response. Continue refining until you have enough to write a clinically useful HPI.

**Budget:** Soft 15–25 turns. Quality over coverage. Call `save_interview_output` when you have sufficient clarity — not when you've ticked every box.

**Neurology focus list** (named conditions to be on the lookout for): primary headache disorders (migraine, cluster, tension), secondary headache red flags (thunderclap, focal deficit, papilledema), seizure semiology, movement disorders (essential tremor vs Parkinsonism), MS/demyelinating, neuropathy, cognitive impairment (vascular/Alzheimer/Lewy), stroke/TIA history, neuromuscular weakness.

**Safety block:** Unchanged from current `CORE_PROMPT` (988, 741741, 911 escalation paths).

### 8. Types (`src/lib/historianTypes.ts`)
Add: `TurnDetectionConfig`, `QueryEvidenceArgs`, `QueryEvidenceResponse`, `RequestScaleArgs`, `ScaleBlock`.

### 9. Environment variables
| Variable | Default | Notes |
|---|---|---|
| `OPENAI_HISTORIAN_REALTIME_MODEL` | `gpt-realtime-2` | Hot-revert to `gpt-realtime` if regression |
| `HISTORIAN_TURN_DETECTION_MODE` | `semantic_vad` | Hot-revert to `server_vad` if regression |

Add to Amplify branch env (remember: `aws amplify update-branch` REPLACES all 19 existing vars — must pass full set, including the two newly-rotated `BEDROCK_*` keys).

## Error handling

| Failure | Detection | Response |
|---|---|---|
| OpenAI session create non-2xx | `session/route.ts` checks `response.ok` | Pass through raw OpenAI error body to client (no swallow) |
| `gpt-realtime-2` regression | Manual demo + eval transcripts | Flip `OPENAI_HISTORIAN_REALTIME_MODEL=gpt-realtime`, redeploy |
| `semantic_vad` regression (over-eager or over-patient) | Live demo feedback | Flip `HISTORIAN_TURN_DETECTION_MODE=server_vad`, redeploy. Restores PR #105 tuning. |
| Localizer push (session.update) fails | API catches, logs | Non-fatal. Interview continues on initial context. |
| `query_evidence` exceeds 3s | AbortController | Return `{ chunks: [], status: "timeout" }`. Model prompted to gracefully recover. |
| `request_scale_administration` unknown id | Server 400 | Return `{ status: "unknown_scale", available: […] }`. Model picks again. |

**Reversibility summary.** All changes are env-flag-gated or feature-additive. Rollback = one `aws amplify update-branch` + redeploy. No DB migrations, no schema breaks.

## Testing & eval

### Pre-upgrade baseline (must capture BEFORE merging)
Run each sample persona on current `/consult`:
- Walter Henderson (72M, progressive hand tremor, ET vs PD)
- Maya Torres (34F, episodic migraine with aura)
- Priya Ramanathan (28F, transient optic symptoms + ascending numbness — MS workup)
- Darnell Wilson (58M, "feeling off", vague multi-symptom)
- Rachel Cho (22F, witnessed spells — possible new-onset seizures)

Save: full transcript, final structured output JSON, Localizer differential at session end, scales administered, red flags surfaced.

Path: `qa/historian-baselines/2026-05-27-pre-upgrade/{persona}.json`

### Post-upgrade eval (run before declaring done)
Same five personas, same actor briefings, same starting referrals. Capture identical artifacts in `qa/historian-baselines/2026-05-27-post-upgrade/`.

**Manual side-by-side review rubric:**
| Dimension | Pre | Post |
|---|---|---|
| Turns to chief-complaint clarity | | |
| Localizer differential top-1 accuracy at session end | | |
| Scales administered (correct set for presentation?) | | |
| Red flags surfaced (Walter: none. Maya: aura → should surface. Rachel: spells → should surface) | | |
| Redundant questions (count) | | |
| Average turn latency | | |
| Tool-use counts (query_evidence, request_scale_administration) | | |

### Smoke tests (per `qa/TEST_RUNBOOK.md` conventions)
- **S1 (existing):** `/consult` loads, mic prompts, voice starts on Walter persona.
- **S2 (NEW):** In a 10-min Walter session, `query_evidence` fires at least once. Verifies model uses the tool.
- **S3 (NEW):** A scale gets administered, and recited wording matches `scale-library.ts` verbatim (string compare on captured transcript vs source).
- **S4 (NEW):** Hot-revert works — set `HISTORIAN_TURN_DETECTION_MODE=server_vad`, redeploy, verify VAD behavior returns to PR #105 tuning (look for `silence_duration_ms: 1200` in the WebRTC trace).

### Out of scope for testing
- Real patient PHI (demo-only constraint enforced).
- Multi-modal / prior-visit eval (separate future agents per scope guard).

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `gpt-realtime-2` worse than `gpt-realtime` at clinical conversation | Low–Med | Model env flag, baseline transcripts |
| `semantic_vad` interrupts patients mid-thought in clinic acoustic | Med | VAD env flag, eagerness=low, PR #105 tuning kept as fallback |
| Model overuses `query_evidence` → cost spike + dead-air UX | Med | Prompt explicitly says "sparingly"; eval tracks tool-use count; 3s timeout caps per-call latency |
| Model paraphrases scale wording → instrument validity broken | High if not guarded | Explicit prompt clause "recite verbatim"; S3 smoke test checks |
| Localizer push spams session.update too often | Low | Push only on Localizer completion (already throttled to every-3-turns) |
| `query_evidence` returns irrelevant chunks (KB has gaps) | Med | Chunks include source citation; model prompted to ignore irrelevant returns; eval rubric tracks question quality |

## Files touched

| File | Action | Approx LoC |
|---|---|---|
| `src/lib/historianPrompts.ts` | Rewrite (phased prompt + 2 new tool defs) | ~140 → ~220 |
| `src/app/api/ai/historian/session/route.ts` | Endpoint swap, nested schema, register new tools | ~30 changed |
| `src/app/api/ai/historian/evidence-query/route.ts` | NEW | ~60 |
| `src/lib/bedrock.ts` | Add `retrieveChunksFromKB()` (Retrieve-only sibling of `retrieveFromKB`) | ~40 added |
| `src/app/api/ai/historian/scales/route.ts` | Add `?action=request` handler | ~40 added |
| `src/app/api/ai/historian/localizer/route.ts` | Surface findings to client for push (return shape additive only) | ~10 added |
| `src/hooks/useRealtimeSession.ts` | Nested session.update + 2 new tool-call handlers + push channel emit + env-driven TurnDetectionConfig | ~80 changed |
| `src/components/consult/EmbeddedHistorian.tsx` | Call client-side push after Localizer completes | ~15 added |
| `src/lib/historianTypes.ts` | New types | ~30 added |
| `.env.local.example` | Add 2 new vars | ~2 added |
| Amplify branch env (us-east-2 d3ietjwgco4g2t) | Add 2 new vars (preserve all 19 existing) | n/a |
| `docs/PRD_AI_HISTORIAN.md` | Append change note | ~20 added |
| `docs/CHANGELOG.md` | Append entry | ~10 added |
| `CLAUDE.md` (repo) | Update "Recent Changes" | ~5 added |
| `qa/TEST_RUNBOOK.md` | Add S2, S3, S4 | ~30 added |
| `qa/historian-baselines/` | NEW directory | n/a |

## Success criteria

1. ✅ `/consult` Step 2 successfully starts a Realtime session (banner gone).
2. ✅ A complete Walter session runs end-to-end on `gpt-realtime-2` with no errors.
3. ✅ At least one `query_evidence` tool call fires in S2 smoke test.
4. ✅ At least one scale administered with verbatim wording in S3 smoke test.
5. ✅ Hot-revert flags both work (S4 smoke test).
6. ✅ Post-upgrade eval rubric shows non-regression on at least 4 of 7 dimensions, with no dimension regressing >1 step (e.g., red flags previously surfaced still surface).
7. ✅ No new console errors in browser; no new 5xx logs in Amplify CloudWatch.

## Open questions (resolved during brainstorming, listed for reference)

- ~~HIPAA / BAA scope?~~ Demo-only. No PHI through OpenAI.
- ~~Which model?~~ `gpt-realtime-2` (flagship). Env flag allows revert.
- ~~Multi-modal grounding?~~ Out of scope — first-encounter history-taking only.
- ~~Prior-visits tool?~~ Out of scope — separate future agent.
- ~~Follow-up agent in scope?~~ No — different flow, untouched.
