# Voice Layer Migration: OpenAI Realtime → Amazon Nova 2 Sonic (provider toggle)

**Status:** Design — awaiting approval
**Date:** 2026-06-05
**Author:** Steve + Claude
**Repo:** OPSAmplehtml (`app.neuroplans.app` / "Sevaro Clinical")
**Scope:** Demo-only voice surfaces (`/consult` AI Historian + `/follow-up` voice agent)

---

## 1. Problem

Both in-browser voice surfaces run on the **OpenAI Realtime API** over WebRTC:

- `/consult` AI Historian — `src/hooks/useRealtimeSession.ts` + `src/app/api/ai/historian/session/route.ts` (`gpt-realtime-2`, new GA `client_secrets` + `/v1/realtime/calls` flow).
- `/follow-up` voice agent — `src/hooks/useFollowUpRealtimeSession.ts` + `src/app/api/follow-up/realtime-session/route.ts` (`gpt-realtime`, legacy `/v1/realtime/sessions` flow).

Two problems:

1. **Cost / billing fragility.** The feature is gated behind OpenAI per-minute + per-token billing on a personal account. It is currently hard-down with a `429 insufficient_quota`. Demoing requires Steve to keep topping up an OpenAI account out of pocket.
2. **HIPAA posture.** When this graduates from demo to real patients, patient voice flowing to OpenAI Realtime requires a signed BAA with OpenAI. Sevaro already operates under an **AWS BAA**, and Bedrock (incl. Nova Sonic) is HIPAA-eligible. Moving the voice layer onto Bedrock puts it on the same BAA-covered footing as the rest of the clinical stack (Transcribe Medical, Bedrock Claude).

**Today this is demo-only and carries no real PHI.** This migration is the prerequisite for it ever carrying real PHI safely, and it removes the out-of-pocket OpenAI dependency now.

## 2. Goals / Non-Goals

**Goals**
- Add **Amazon Nova 2 Sonic** as a second voice provider behind both hooks, **default ON**, with the OpenAI path kept switchable for A/B and fallback.
- Ship one **prompt refinement** alongside the migration: a **directive, referral-anchored opening** for the Historian — state *why* the patient is being seen rather than asking open-ended (§5.6). Applies to **both** providers (shared prompt).
- Preserve every existing clinical safeguard and the entire UI unchanged.
- Run on AWS infra under an **IAM role (no access keys)**, BAA-covered region.
- Migrate **both** voice surfaces, phased (Historian first, then follow-up).

**Non-Goals**
- The Twilio **phone-call** follow-up path (SMS/voice via Twilio media) — out of scope; this migration covers only the in-browser WebRTC voice hooks.
- Multi-modal / camera input, prior-visit ingestion — explicitly future.
- Removing OpenAI entirely (we keep it as a fallback per the toggle decision).
- Productionizing for real PHI in this pass (no real patients yet; this enables it later).

## 3. Decisions (from 2026-06-05 brainstorm)

| Decision | Choice | Rationale |
|---|---|---|
| Landing strategy | **Provider toggle**, Nova default, OpenAI kept switchable | A/B on the same script; zero OpenAI spend by default; fallback if Nova disappoints |
| Scope | **Both** surfaces, phased (Historian → follow-up) | Kills the OpenAI Realtime dependency in two clean cuts |
| Relay hosting | **AWS App Runner** | Managed always-on WS, built-in TLS+URL, IAM role, minimal ops |
| Model | **Nova 2 Sonic** `amazon.nova-2-sonic-v1:0` | v1 (`amazon.nova-sonic-v1:0`) is Legacy, **EOL 2026-09-14**; v2 has improved function calling + multilingual |
| Region | **us-east-1** | Nova 2 Sonic regions = us-east-1, us-west-2, ap-northeast-1. Bedrock default us-east-2 does **not** host it. |

## 4. Why this is not a drop-in swap

OpenAI Realtime runs **browser-direct over WebRTC**; the Next.js server only mints an ephemeral key and patient audio never touches the backend. Nova Sonic has **no browser/WebRTC path** — it is a server-side `InvokeModelWithBidirectionalStream` HTTP/2 stream requiring SigV4 credentials. Therefore a **server-side WebSocket relay is mandatory**, and it cannot live in an Amplify/Next.js API route (Amplify SSR Lambda has a ~28s gateway timeout — the same constraint that forced triage to a 202+poll pattern, per repo CLAUDE.md).

## 5. Architecture

```
TARGET (provider = nova | openai, flag-selected; nova default)

  ┌─────────┐   WS: PCM16 audio + JSON events   ┌──────────────────┐  HTTP/2 bidi   ┌──────────────┐
  │ Browser │ ◀────────────────────────────────▶ │  Nova Sonic Relay │ ◀────────────▶ │ Bedrock Nova │
  │  hooks  │                                     │  (App Runner,     │  stream        │  2 Sonic     │
  └─────────┘                                     │   IAM role)       │  us-east-1     └──────────────┘
       │                                          └──────────────────┘
       │                                                   │ toolUse
       │  (unchanged when flag = openai → OpenAI WebRTC)    ▼
       │                                          ┌──────────────────────────────┐
       └─────────────────────────────────────────│ existing Next.js /api routes  │
                                                  │ scales · evidence · localizer │
                                                  │ historian save · followup save│
                                                  └──────────────────────────────┘
```

### 5.1 Component: client provider abstraction (`src/lib/voice/`)

A `VoiceProvider` interface that both hooks consume. The hooks keep their **exact public API** (`status`, `transcript`, `currentAssistantText`, `isAiSpeaking`, `onComplete`, `injectScaleAdministration`, `pushLocalizerContext`, etc.) so **no UI component changes**.

```ts
interface VoiceProvider {
  start(opts: VoiceStartOptions): Promise<void>
  stop(): Promise<void>
  // server→client events normalized to a provider-agnostic shape:
  on(event: 'userTranscript' | 'assistantTranscript' | 'assistantTextDelta'
        | 'userSpeechStart' | 'userSpeechStop' | 'aiSpeechStart' | 'aiSpeechStop'
        | 'toolCall' | 'error', cb: (payload: any) => void): void
  // client→server controls:
  sendToolResult(callId: string, output: unknown): void
  injectSystemText(text: string): void   // localizer push, scale injection, early-end flush
}
```

Two implementations:
- `openaiWebrtcProvider` — the current WebRTC + data-channel code, refactored in place (no behavior change). Both existing hooks already speak this event vocabulary, so the normalized event names map 1:1 to today's `handleServerEvent` cases.
- `novaSonicWsProvider` — new. Opens a WS to the relay, captures mic via AudioWorklet → PCM16 @ 16 kHz, streams it, plays returned PCM via AudioContext, and translates Nova Sonic stream events into the normalized event shape.

The two hooks (`useRealtimeSession`, `useFollowUpRealtimeSession`) are refactored to drive a `VoiceProvider` chosen by config rather than calling WebRTC directly. **All harness logic stays in the hooks** (red-flag detection, safety keywords, localizer cadence every 3 turns, scale_step plumbing, early-end flush, completion callbacks).

### 5.2 Component: Nova Sonic relay (new service, `services/nova-sonic-relay/`)

A small standalone Node service (`ws` + `@aws-sdk/client-bedrock-runtime`), deployed to **App Runner** under an IAM role with `bedrock:InvokeModelWithBidirectionalStream` on the Nova 2 Sonic model ARN. One browser WS ⇄ one Nova Sonic bidirectional stream. Responsibilities:

1. **Session lifecycle** — on WS connect, open `InvokeModelWithBidirectionalStreamCommand` for `amazon.nova-2-sonic-v1:0`; emit `sessionStart` → `promptStart` → `systemPrompt` content (instructions + tool config) per the Nova event protocol.
2. **Audio in** — forward client PCM16 chunks as `audioInput` events.
3. **Audio out** — forward Nova `audioOutput` (base64 PCM) to the client for playback.
4. **Transcripts** — map Nova `textOutput` (role `USER`/`ASSISTANT`) → `userTranscript` / `assistantTranscript` events.
5. **Tools** — map Nova `toolUse` → `toolCall`; on receiving `toolResult` back from the client, emit Nova `toolResult` content. (Tool *handlers* stay where they are today — on the client, calling the existing `/api/...` routes — so the relay stays stateless and PHI-light.)
6. **System-text injection** — accept a control message from the client and emit it as a Nova text content turn (used for localizer push, scale injection, early-end flush).
7. **Barge-in** — Nova Sonic emits interruption signals; forward so the client stops playback (replaces the OpenAI manual mic-mute echo handling in the follow-up hook).

**Statelessness / PHI:** the relay transports audio but does not persist it. It holds no DB connection and stores nothing. (Documents the HIPAA boundary for later.)

### 5.3 Tool mapping

The four existing tools become Nova Sonic `toolConfiguration` entries with the **same names, schemas, and handlers**:

| Tool | Surface | Handler (unchanged) |
|---|---|---|
| `save_interview_output` | Historian | client `handleServerEvent` → `onComplete` save path |
| `query_evidence` | Historian | `POST /api/ai/historian/evidence-query` |
| `scale_step` | Historian | `POST /api/ai/historian/scales?action=step` |
| `save_followup_output` | Follow-up | client escalation-flag + `onComplete` path |

JSON Schemas are reused verbatim from `historianPrompts.ts` / the follow-up route; only the wrapper key (`type:'function'` → Nova's tool spec shape) differs and is adapted in the provider.

### 5.4 Localizer push change

Today the localizer pushes a re-serialized `BASE_PROMPT + delta` via OpenAI `session.update { instructions }` every 3 turns. Nova Sonic has **no mid-stream instructions-replace event**, so `pushLocalizerContext` on the Nova provider instead calls `injectSystemText(delta)` → relay emits the delta as a Nova text content turn (advisory, no forced response). Same cadence (every 3 patient turns), same Bedrock localizer pipeline, same data — different delivery event. The OpenAI provider keeps the `session.update` mechanism.

### 5.5 Config / flags

- `VOICE_PROVIDER=nova|openai` (env, default `nova`) — global default.
- Per-session override via query param / UI dev toggle so Nova vs OpenAI can be compared **on the same intake** live.
- `NOVA_SONIC_RELAY_URL` (env) — WSS URL of the App Runner relay (e.g. `wss://<id>.us-east-1.awsapprunner.com`).
- Relay env: `NOVA_SONIC_REGION=us-east-1`, `NOVA_SONIC_MODEL_ID=amazon.nova-2-sonic-v1:0`.
- Hot-revert: set `VOICE_PROVIDER=openai` (requires the OpenAI account to have credit again).

### 5.6 Prompt change: directive, referral-anchored opening (provider-agnostic)

Today Phase 1 opens open-endedly ("ask the patient to describe why they are seeing a neurologist today"). Steve's directive: in this setting the AI **already knows the referral reason** and should **state it back to the patient** as the reason for the visit, then invite them to discuss it — rather than asking them to self-report a chief complaint.

- **New behavior (turn 1):** greet by name (when available) and **lead with the referral reason as a statement**, then ask to talk about it.
  > "Hi Dr. Arbogast — you're being seen today because of the tremors you mentioned to your primary care provider. Can we talk about those?"
- The rest of OLDCARTS characterization in Phase 1 is unchanged; only the *opening* shifts from open-question to directive-statement.
- **Fallback:** when `referralReason` is absent/empty, retain the current open-ended opening (no referral to anchor on).
- **Where:** `src/lib/historianPrompts.ts` — `PHASED_INTERVIEW_STRUCTURE` Phase 1 wording + the `REFERRAL REASON` block in `buildHistorianSystemPrompt`. This is a **single shared prompt**, so both the Nova and OpenAI providers inherit it; no provider-specific prompt forking.
- **Scope note:** this is the only intentional behavior change in the migration; everything else is transport-only. Captured here so it isn't mistaken for prompt drift.

**Phase 1 — Historian on Nova (behind flag)**
1. Build `services/nova-sonic-relay/`; run locally first (`ws://localhost`) for fast iteration.
2. Build `src/lib/voice/` abstraction + `novaSonicWsProvider`; refactor existing WebRTC into `openaiWebrtcProvider`.
3. Refactor `useRealtimeSession` onto the provider abstraction; wire `VOICE_PROVIDER`.
4. Tool config + localizer-injection mapping for the historian.
5. Apply the **directive referral-anchored opening** (§5.6) to `historianPrompts.ts` — shared prompt, both providers; verify the OpenAI path still behaves with the new opening.
6. Deploy relay to App Runner (IAM role, us-east-1). Point `NOVA_SONIC_RELAY_URL` at it.
7. Validate (§7).

**Phase 2 — Follow-up agent on Nova**
7. Refactor `useFollowUpRealtimeSession` onto the same abstraction; reuse the relay; map `save_followup_output`; carry over barge-in via Nova interruption signals.
8. Validate.

OpenAI stays switchable throughout both phases.

## 7. Validation plan

- **A/B, same script:** run the existing `qa/historian-baselines/` scripts through both providers; compare transcripts and structured output.
- **Medical-term ASR:** score Nova's built-in transcription on the neuro vocabulary in the baselines. If weak, evaluate routing the user channel through the already-present `@aws-sdk/client-transcribe-streaming` (Transcribe Medical) for transcripts while Nova drives the voice. (Decision gate, not committed.)
- **Naturalness / barge-in:** human listen test, both providers, including an interrupt-the-AI case and a distressed-patient tone.
- **Tool round-trips:** confirm `scale_step` verbatim pacing, `query_evidence` latency-masking filler, and `save_*` completion fire correctly over Nova.
- **Safety:** confirm the suicide-safety keyword path and red-flag detection still trigger on Nova transcripts.
- **Smoke:** existing `qa/` S1–S5 on `/consult` and `/follow-up`, plus a 375px mobile check.
- **Directive opening:** confirm turn 1 leads with the referral reason as a statement ("you're being seen today because of …, can we talk about that?") on both providers, and falls back to the open-ended ask when `referralReason` is empty.

## 8. Risks & open questions

- **ASR on medical terms** — primary quality risk; mitigated by the Transcribe Medical fallback option (§7).
- **Conversational polish gap** — OpenAI `gpt-realtime-2` is a half-step ahead on raw prosody/empathy; mitigated by heavy scaffolding (short, near-scripted turns) and validated by listen test. Toggle preserves fallback.
- **App Runner cold start / WS keepalive** — confirm App Runner holds long-lived WS and tune min instances for demo responsiveness.
- **Cross-region hop** — relay in us-east-1 calling Nova in us-east-1; the app's other Bedrock calls stay us-east-2. No data-residency issue (all US), negligible latency.
- **Audio format** — confirm Nova 2 Sonic input PCM sample rate/encoding (16 kHz, 16-bit, mono LPCM expected) and output format; align the AudioWorklet.
- **Open:** does Nova 2 Sonic's improved function calling reliably honor the `scale_step` single-item verbatim discipline? Validate early — it's the most brittle tool.

## 9. Out of scope (this pass)

Twilio phone-call voice path · real-PHI productionization · removing OpenAI · multi-modal · prior-visit ingestion · Nova Sonic v1 (EOL).

---

### Sources
- Nova Sonic model card (model IDs, regions, EOL, `InvokeModelWithBidirectionalStream`): https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-sonic.html
- Nova 2 Sonic launch (`amazon.nova-2-sonic-v1:0`, regions, tool calling, multilingual): https://aws.amazon.com/blogs/aws/introducing-amazon-nova-2-sonic-next-generation-speech-to-speech-model-for-conversational-ai/
- Bidirectional Streaming API event protocol: https://docs.aws.amazon.com/nova/latest/userguide/speech-bidirection.html
- Nova Sonic on a web app (relay pattern reference): https://aws.amazon.com/blogs/machine-learning/make-your-web-apps-hands-free-with-amazon-nova-sonic/
