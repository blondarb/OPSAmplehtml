# Nova 2 Sonic Voice Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Amazon Nova 2 Sonic as a switchable voice provider behind the `/consult` Historian and `/follow-up` voice hooks (Nova default, OpenAI kept as fallback), with all clinical harness logic and UI unchanged.

**Architecture:** A `VoiceProvider` abstraction sits behind both hooks. `openaiWebrtc` keeps today's WebRTC path; `novaSonicWs` opens a WebSocket to a new stateless **App Runner relay** that bridges the browser to Bedrock `InvokeModelWithBidirectionalStream` (`amazon.nova-2-sonic-v1:0`, us-east-1). Tools and transcripts are normalized to one provider-agnostic event vocabulary; tool handlers stay on the client calling existing `/api` routes.

**Tech Stack:** Next.js 15 / React 18 / TypeScript, `@aws-sdk/client-bedrock-runtime` (`InvokeModelWithBidirectionalStreamCommand`) + `@smithy/node-http-handler` (`NodeHttp2Handler`), `ws`, Web Audio API (AudioWorklet), Vitest, AWS App Runner.

**Spec:** `docs/superpowers/specs/2026-06-05-nova-sonic-voice-migration-design.md`
**Canonical reference for the relay + audio:** AWS `aws-samples/amazon-nova-samples` → `speech-to-speech` (Node.js sample). Adapt, don't copy blind — our event contract below is authoritative.

---

## Verified Nova Sonic event contract (authoritative)

**Client → model (ordered):**
1. `{event:{sessionStart:{inferenceConfiguration:{maxTokens,topP,temperature}}}}`
2. `{event:{promptStart:{promptName, textOutputConfiguration:{mediaType:"text/plain"}, audioOutputConfiguration:{mediaType:"audio/lpcm", sampleRateHertz:24000, sampleSizeBits:16, channelCount:1, voiceId, encoding:"base64", audioType:"SPEECH"}, toolUseOutputConfiguration:{mediaType:"application/json"}, toolConfiguration:{tools:[...]}}}}`
3. System prompt: `contentStart{type:"TEXT", role:"SYSTEM", textInputConfiguration:{mediaType:"text/plain"}}` → `textInput{content:<instructions>}` → `contentEnd`
4. Audio turn: `contentStart{type:"AUDIO", role:"USER", audioInputConfiguration:{mediaType:"audio/lpcm", sampleRateHertz:16000, sampleSizeBits:16, channelCount:1, audioType:"SPEECH", encoding:"base64"}}` → repeated `audioInput{content:<base64 PCM16>}` → `contentEnd`
5. Tool result: `contentStart{type:"TOOL", role:"TOOL", toolResultInputConfiguration:{toolUseId, type:"TEXT", textInputConfiguration:{mediaType:"text/plain"}}}` → `toolResult{content:<json string>}` → `contentEnd`
6. Teardown: `promptEnd` → `sessionEnd`

(All content blocks carry `promptName` + a `contentName` UUID; see sample.)

**Model → client:** `contentStart{role}` · `textOutput{content,role}` (barge-in = content contains `{ "interrupted" : true }`) · `audioOutput{content:<base64 PCM16 24kHz>}` · `toolUse{toolName,toolUseId,content}` · `contentEnd{type:"TOOL"}` (triggers our tool handling) · `completionEnd`.

**Audio formats:** input **16 kHz** 16-bit mono LPCM; output **24 kHz** 16-bit mono LPCM. (Confirm against the sample's constants in Task 1.)

---

## File structure

**New — relay service (own deployable):**
- `services/nova-sonic-relay/src/server.ts` — `ws` server; one WS connection ↔ one `NovaSonicSession`.
- `services/nova-sonic-relay/src/novaSonicSession.ts` — wraps the Bedrock bidi stream; ordered event emitters + response loop.
- `services/nova-sonic-relay/src/eventBuilders.ts` — pure functions building each client→model event (unit-tested).
- `services/nova-sonic-relay/src/wsProtocol.ts` — shared browser↔relay WS message shapes (mirrored in `src/lib/voice/relayProtocol.ts`).
- `services/nova-sonic-relay/Dockerfile`, `apprunner.yaml`, `package.json`, `tsconfig.json`.
- `services/nova-sonic-relay/src/__tests__/eventBuilders.test.ts`.

**New — client provider layer:**
- `src/lib/voice/types.ts` — `VoiceProvider`, `VoiceStartOptions`, normalized event union.
- `src/lib/voice/relayProtocol.ts` — browser↔relay WS message shapes (mirror of relay's).
- `src/lib/voice/audio/pcm.ts` — pure `floatTo16BitPCM`, `downsampleTo16k`, `base64FromPcm`, `pcmFromBase64` (unit-tested).
- `src/lib/voice/audio/capture-worklet.ts` + `public/voice/pcm-capture-worklet.js` — AudioWorklet mic→PCM16.
- `src/lib/voice/audio/player.ts` — queued PCM playback via AudioContext (24kHz).
- `src/lib/voice/providers/openaiWebrtcProvider.ts` — today's WebRTC, refactored to the interface.
- `src/lib/voice/providers/novaSonicWsProvider.ts` — new.
- `src/lib/voice/selectProvider.ts` — chooses provider from `VOICE_PROVIDER` / override.

**Modified:**
- `src/hooks/useRealtimeSession.ts` — drive a `VoiceProvider`; harness logic unchanged.
- `src/hooks/useFollowUpRealtimeSession.ts` — same (Phase 3).
- `src/lib/historianPrompts.ts` — directive referral-anchored opening + Nova tool-config adapter.
- `src/app/api/ai/historian/session/route.ts` — return Nova config (instructions + tools + relay URL) when provider=nova.
- `.env` / Amplify env — `VOICE_PROVIDER`, `NOVA_SONIC_RELAY_URL`.

---

## PHASE 1 — Historian on Nova (local relay)

### Task 1: Relay scaffold + audio constants from the canonical sample

**Files:**
- Create: `services/nova-sonic-relay/package.json`, `tsconfig.json`, `src/server.ts` (stub)
- Create: `services/nova-sonic-relay/src/audioConstants.ts`

- [ ] **Step 1: Clone the canonical sample for reference**

Run: `git clone --depth 1 https://github.com/aws-samples/amazon-nova-samples /tmp/nova-samples` and read `/tmp/nova-samples/speech-to-speech/` (Node.js). Confirm input/output sample rates, `voiceId` values, and the exact `contentStart`/`audioInput` field names. Do NOT commit the clone.

- [ ] **Step 2: Record verified constants**

```ts
// services/nova-sonic-relay/src/audioConstants.ts
export const INPUT_SAMPLE_RATE = 16000   // browser → model
export const OUTPUT_SAMPLE_RATE = 24000  // model → browser
export const SAMPLE_SIZE_BITS = 16
export const CHANNELS = 1
export const MODEL_ID = process.env.NOVA_SONIC_MODEL_ID ?? 'amazon.nova-2-sonic-v1:0'
export const REGION = process.env.NOVA_SONIC_REGION ?? 'us-east-1'
export const DEFAULT_VOICE_ID = process.env.NOVA_SONIC_VOICE_ID ?? 'matthew'
```

- [ ] **Step 3: Init package**

```jsonc
// services/nova-sonic-relay/package.json
{ "name": "nova-sonic-relay", "private": true, "type": "module",
  "scripts": { "dev": "tsx watch src/server.ts", "start": "node dist/server.js",
               "build": "tsc -p tsconfig.json", "test": "vitest run" },
  "dependencies": { "@aws-sdk/client-bedrock-runtime": "^3.1003.0",
                    "@smithy/node-http-handler": "^4", "ws": "^8", "uuid": "^11" },
  "devDependencies": { "tsx": "^4", "typescript": "^5", "vitest": "^4",
                       "@types/ws": "^8", "@types/uuid": "^10", "@types/node": "^20" } }
```

- [ ] **Step 4: Install + verify build skeleton**

Run: `cd services/nova-sonic-relay && npm install && npx tsc --noEmit`
Expected: no errors (empty `server.ts` stub `export {}`).

- [ ] **Step 5: Commit**

```bash
git add services/nova-sonic-relay
git commit -m "feat(relay): scaffold nova-sonic-relay service + verified audio constants"
```

---

### Task 2: Event builders (pure, TDD)

**Files:**
- Create: `services/nova-sonic-relay/src/eventBuilders.ts`
- Test: `services/nova-sonic-relay/src/__tests__/eventBuilders.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { sessionStart, promptStart, systemContent, audioContentStart, audioInput, toolResultEvents, promptEnd } from '../eventBuilders'

describe('eventBuilders', () => {
  it('sessionStart carries inferenceConfiguration', () => {
    expect(sessionStart().event.sessionStart.inferenceConfiguration.maxTokens).toBeGreaterThan(0)
  })
  it('promptStart includes 24k audio out + tool config', () => {
    const e = promptStart('p1', [{ toolSpec: { name: 'save_interview_output' } } as any], 'matthew')
    expect(e.event.promptStart.audioOutputConfiguration.sampleRateHertz).toBe(24000)
    expect(e.event.promptStart.toolConfiguration.tools).toHaveLength(1)
    expect(e.event.promptStart.audioOutputConfiguration.voiceId).toBe('matthew')
  })
  it('audioContentStart declares 16k USER audio', () => {
    const e = audioContentStart('p1', 'c1')
    expect(e.event.contentStart.role).toBe('USER')
    expect(e.event.contentStart.audioInputConfiguration.sampleRateHertz).toBe(16000)
  })
  it('toolResultEvents produces start→result→end with the toolUseId', () => {
    const evs = toolResultEvents('p1', 'tu-9', JSON.stringify({ ok: true }))
    expect(evs).toHaveLength(3)
    expect(evs[0].event.contentStart.toolResultInputConfiguration.toolUseId).toBe('tu-9')
    expect(JSON.parse(evs[1].event.toolResult.content).ok).toBe(true)
  })
})
```

- [ ] **Step 2: Run, verify fail**

Run: `cd services/nova-sonic-relay && npx vitest run`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement builders** per the authoritative event contract above (each returns `{event:{...}}`; `contentStart`/`audioInput`/`textInput`/`toolResult` carry `promptName` + `contentName`). Use `audioConstants.ts` for all rates/sizes. `toolResultEvents` returns `[contentStart(type:TOOL), toolResult, contentEnd]`.

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/nova-sonic-relay/src/eventBuilders.ts services/nova-sonic-relay/src/__tests__
git commit -m "feat(relay): nova sonic event builders (tested against verified contract)"
```

---

### Task 3: NovaSonicSession — Bedrock bidi stream wrapper

**Files:**
- Create: `services/nova-sonic-relay/src/novaSonicSession.ts`

- [ ] **Step 1: Implement the session class.** Construct `BedrockRuntimeClient({ region: REGION, requestHandler: new NodeHttp2Handler({ requestTimeout: 300000, sessionTimeout: 300000 }) })` (IAM role creds — omit explicit credentials so the App Runner role / local SSO profile resolves). Expose:
  - `start(instructions, tools, voiceId)` — opens `InvokeModelWithBidirectionalStreamCommand({ modelId: MODEL_ID, body: orderedAsyncGenerator() })`; the generator yields `sessionStart`, `promptStart`, system `contentStart/textInput/contentEnd`, then drains an internal queue (`pushEvent`) for audio + tool-result events.
  - `pushAudio(base64Pcm)` — wraps in `audioInput` and enqueues. (Open the USER audio `contentStart` once on first audio, close `contentEnd` on `stopUserTurn()`.)
  - `pushToolResult(toolUseId, jsonString)` — enqueues `toolResultEvents`.
  - `pushSystemText(text)` — enqueues a SYSTEM `contentStart/textInput/contentEnd` (localizer push / scale injection / early-end flush).
  - response loop (`for await (const event of response.body)`) → decode → emit via a callback bag: `onTextOutput({role,content})`, `onAudioOutput(base64)`, `onToolUse({toolName,toolUseId,content})`, `onContentEnd(type)`, `onCompletionEnd()`, `onError(e)`. Detect barge-in (`textOutput.content` includes `"interrupted" : true`) → `onBargeIn()`.
  - `stop()` — enqueue `promptEnd` + `sessionEnd`, close stream, set inactive.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` → Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add services/nova-sonic-relay/src/novaSonicSession.ts
git commit -m "feat(relay): NovaSonicSession bidi stream wrapper"
```

---

### Task 4: WS server + shared protocol

**Files:**
- Create: `services/nova-sonic-relay/src/wsProtocol.ts`
- Create: `src/lib/voice/relayProtocol.ts` (identical message union — keep in sync)
- Create: `services/nova-sonic-relay/src/server.ts`

- [ ] **Step 1: Define the browser↔relay message union** (same in both files):

```ts
// client → relay
export type ClientMsg =
  | { t: 'start'; instructions: string; tools: unknown[]; voiceId?: string }
  | { t: 'audio'; pcm: string }            // base64 PCM16 @16k
  | { t: 'userTurnEnd' }
  | { t: 'toolResult'; toolUseId: string; output: string }
  | { t: 'systemText'; text: string }
  | { t: 'stop' }
// relay → client
export type ServerMsg =
  | { t: 'userTranscript'; text: string }
  | { t: 'assistantTranscript'; text: string }
  | { t: 'assistantTextDelta'; text: string }
  | { t: 'audio'; pcm: string }            // base64 PCM16 @24k
  | { t: 'aiSpeechStart' } | { t: 'aiSpeechStop' }
  | { t: 'bargeIn' }
  | { t: 'toolCall'; toolName: string; toolUseId: string; input: unknown }
  | { t: 'completion' } | { t: 'error'; message: string }
```

- [ ] **Step 2: Implement `server.ts`** — `new WebSocketServer({ port: process.env.PORT ?? 8081 })`; per connection create a `NovaSonicSession`, wire its callbacks to `ws.send(JSON.stringify(serverMsg))`, and route incoming `ClientMsg` to the session methods. `toolCall` is forwarded to the browser (handlers live client-side); `toolResult` from the browser → `session.pushToolResult`. Add a `GET /healthz` (plain `http` upgrade share) returning 200 for App Runner health checks.

- [ ] **Step 3: Manual smoke (local)** — `npm run dev`, then a 20-line `scripts/smoke.mjs` that connects, sends `start` with a trivial system prompt + empty tools, streams a small recorded 16k WAV as `audio` frames, and logs `assistantTranscript`/`audio` frames received.

Run: `node scripts/smoke.mjs` → Expected: at least one `assistantTranscript` and `audio` message logged. (Requires local AWS creds with Bedrock access to us-east-1; `aws sso login --profile sevaro-sandbox` first, `AWS_PROFILE=sevaro-sandbox`.)

- [ ] **Step 4: Commit**

```bash
git add services/nova-sonic-relay/src/wsProtocol.ts services/nova-sonic-relay/src/server.ts src/lib/voice/relayProtocol.ts services/nova-sonic-relay/scripts
git commit -m "feat(relay): ws server + browser↔relay protocol + local smoke"
```

> ⚠️ Pre-req for Step 3: confirm Bedrock model access to `amazon.nova-2-sonic-v1:0` is enabled in us-east-1 for the sandbox account (Bedrock console → Model access). If not, request access — this blocks all live testing.

---

### Task 5: Client audio PCM utilities (pure, TDD)

**Files:**
- Create: `src/lib/voice/audio/pcm.ts`
- Test: `src/lib/voice/audio/__tests__/pcm.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { floatTo16BitPCM, base64FromPcm, pcmFromBase64, downsampleTo16k } from '../pcm'

describe('pcm', () => {
  it('floatTo16BitPCM clamps full-scale', () => {
    const out = floatTo16BitPCM(new Float32Array([0, 1, -1]))
    expect(out[1]).toBe(32767); expect(out[2]).toBe(-32768)
  })
  it('base64 round-trips', () => {
    const pcm = new Int16Array([1, -1, 100, -100])
    expect(Array.from(pcmFromBase64(base64FromPcm(pcm)))).toEqual([1, -1, 100, -100])
  })
  it('downsampleTo16k halves a 32k buffer', () => {
    expect(downsampleTo16k(new Float32Array(320), 32000).length).toBe(160)
  })
})
```

- [ ] **Step 2: Run, verify fail** → `npx vitest run src/lib/voice/audio` → FAIL.
- [ ] **Step 3: Implement** the four pure functions (linear-interpolation downsample to 16k; base64 via `btoa`/`atob` over the byte view).
- [ ] **Step 4: Run, verify pass** → PASS.
- [ ] **Step 5: Commit** → `git commit -m "feat(voice): pcm conversion utils (tested)"`.

---

### Task 6: Mic capture worklet + PCM player

**Files:**
- Create: `public/voice/pcm-capture-worklet.js` (AudioWorkletProcessor → posts Float32 frames)
- Create: `src/lib/voice/audio/capture-worklet.ts` (load worklet, getUserMedia with echoCancellation/noiseSuppression/autoGainControl, downsample→PCM16→base64, callback)
- Create: `src/lib/voice/audio/player.ts` (AudioContext @24k, queue base64 PCM chunks, schedule gapless playback, `interrupt()` clears queue for barge-in)

- [ ] **Step 1: Implement** all three (no unit test — Web Audio needs a browser; validated in Task 9 manual run).
- [ ] **Step 2: Typecheck** → `npx tsc --noEmit` → no errors.
- [ ] **Step 3: Commit** → `git commit -m "feat(voice): mic capture worklet + 24k pcm player"`.

---

### Task 7: VoiceProvider interface + both providers

**Files:**
- Create: `src/lib/voice/types.ts`, `src/lib/voice/selectProvider.ts`
- Create: `src/lib/voice/providers/novaSonicWsProvider.ts`
- Create: `src/lib/voice/providers/openaiWebrtcProvider.ts` (lift existing WebRTC out of `useRealtimeSession.ts`)

- [ ] **Step 1: Define the interface** (matches spec §5.1):

```ts
// src/lib/voice/types.ts
export type VoiceEvent =
  | { type: 'userTranscript'; text: string }
  | { type: 'assistantTranscript'; text: string }
  | { type: 'assistantTextDelta'; text: string }
  | { type: 'userSpeechStart' } | { type: 'userSpeechStop' }
  | { type: 'aiSpeechStart' } | { type: 'aiSpeechStop' }
  | { type: 'toolCall'; toolName: string; toolUseId: string; input: unknown }
  | { type: 'error'; message: string }
export interface VoiceStartOptions {
  instructions: string
  tools: unknown[]              // provider-native tool specs (adapter builds these)
  voiceId?: string
}
export interface VoiceProvider {
  start(opts: VoiceStartOptions): Promise<void>
  stop(): Promise<void>
  on(cb: (e: VoiceEvent) => void): void
  sendToolResult(toolUseId: string, output: unknown): void
  injectSystemText(text: string): void
}
```

- [ ] **Step 2: `novaSonicWsProvider`** — connect `new WebSocket(process.env.NEXT_PUBLIC_NOVA_SONIC_RELAY_URL!)`; on open send `{t:'start',...}`; start mic capture → `{t:'audio'}`; route `ServerMsg` → `VoiceEvent` (audio → `player.enqueue`; `bargeIn` → `player.interrupt()`; `toolCall`/transcripts → emit). `sendToolResult`→`{t:'toolResult'}`, `injectSystemText`→`{t:'systemText'}`, `stop`→`{t:'stop'}` + teardown.

- [ ] **Step 3: `openaiWebrtcProvider`** — move the existing WebRTC/data-channel code from `useRealtimeSession.ts` here unchanged; translate its `handleServerEvent` cases to the same `VoiceEvent` names (`response.audio_transcript.delta`→`assistantTextDelta`, `...done`→`assistantTranscript`, `input_audio_transcription.completed`→`userTranscript`, `response.done` function_call→`toolCall`, etc.). `injectSystemText`→ today's `conversation.item.create` system message; `sendToolResult`→ today's `function_call_output` + `response.create`.

- [ ] **Step 4: `selectProvider`**

```ts
export function selectProvider(override?: 'nova' | 'openai'): 'nova' | 'openai' {
  const v = override ?? (process.env.NEXT_PUBLIC_VOICE_PROVIDER as any) ?? 'nova'
  return v === 'openai' ? 'openai' : 'nova'
}
```

- [ ] **Step 5: Typecheck + commit** → `npx tsc --noEmit`; `git commit -m "feat(voice): VoiceProvider interface + nova/openai providers + selector"`.

---

### Task 8: Refactor `useRealtimeSession` onto the provider + Nova tool adapter

**Files:**
- Modify: `src/hooks/useRealtimeSession.ts`
- Modify: `src/lib/historianPrompts.ts` (add `getHistorianToolsForProvider(provider)`)
- Modify: `src/app/api/ai/historian/session/route.ts`

- [ ] **Step 1: Tool adapter** — add `toNovaToolSpec(openAiTool)` mapping `{type:'function',name,description,parameters}` → `{ toolSpec: { name, description, inputSchema: { json: JSON.stringify(parameters) } } }`. Export `getHistorianToolsForProvider(p)` returning OpenAI specs for `openai`, Nova specs for `nova`. Unit-test the mapping (names + parsed schema preserved).

- [ ] **Step 2: Refactor the hook** — replace the inline `RTCPeerConnection`/`handleServerEvent` block with: `const provider = makeProvider(selectProvider(override))`; `provider.on(handleVoiceEvent)`; keep ALL existing harness logic (safety keywords, `detectRedFlags`, localizer cadence every 3 patient turns, `scale_step`/`query_evidence`/`save_interview_output` tool routing now via `provider.sendToolResult`, early-end flush via `provider.injectSystemText`, `pushLocalizerContext` via `provider.injectSystemText`). Public hook API unchanged.

- [ ] **Step 3: Session route** — when `provider=nova`, return `{ provider:'nova', instructions, tools: getHistorianToolsForProvider('nova'), relayUrl: process.env.NOVA_SONIC_RELAY_URL, voiceId }` and skip the OpenAI `client_secrets` call. Keep the OpenAI branch intact for `provider=openai`.

- [ ] **Step 4: Build check** — `npx tsc --noEmit` + `npx vitest run` (existing historian tests must still pass).

- [ ] **Step 5: Commit** → `git commit -m "refactor(historian): drive VoiceProvider; add Nova tool adapter; provider-aware session route"`.

---

### Task 9: Directive referral-anchored opening (prompt change)

**Files:**
- Modify: `src/lib/historianPrompts.ts`
- Test: `src/lib/__tests__/historianPrompts.test.ts`

- [ ] **Step 1: Failing test**

```ts
it('leads with the referral reason directively when present', () => {
  const p = buildHistorianSystemPrompt('new_patient', 'tremors reported to PCP', undefined)
  expect(p).toMatch(/state .*reason .*as a statement/i)         // directive instruction present
  expect(p).toContain('tremors reported to PCP')
})
it('falls back to open-ended opening when no referral reason', () => {
  const p = buildHistorianSystemPrompt('new_patient', undefined, undefined)
  expect(p).toMatch(/describe why they are seeing a neurologist/i)
})
```

- [ ] **Step 2: Run, verify fail** → `npx vitest run src/lib/__tests__/historianPrompts.test.ts` → FAIL.

- [ ] **Step 3: Edit prompt.** In `PHASED_INTERVIEW_STRUCTURE` Phase 1, replace the open-ended opener with a conditional: when a referral reason exists, **open by stating it as the reason for the visit and inviting discussion** ("Hi [name] — you're being seen today because of [referral reason] that you shared with your primary care provider. Can we talk about that?"), then proceed to OLDCARTS. In `buildHistorianSystemPrompt`, strengthen the `REFERRAL REASON` block: "Open the interview by stating this reason back to the patient as a directive, not by asking an open 'what brings you in' question." Keep the open-ended wording as the no-referral fallback path.

- [ ] **Step 4: Run, verify pass** → PASS.

- [ ] **Step 5: Commit** → `git commit -m "feat(historian): directive referral-anchored opening (shared prompt, both providers)"`.

---

### Task 10: Local end-to-end validation (Historian)

- [ ] **Step 1:** Relay running locally (`AWS_PROFILE=sevaro-sandbox npm run dev` in `services/nova-sonic-relay`). App: `.env.local` → `NEXT_PUBLIC_VOICE_PROVIDER=nova`, `NEXT_PUBLIC_NOVA_SONIC_RELAY_URL=ws://localhost:8081`, `NOVA_SONIC_RELAY_URL=ws://localhost:8081`. `npm run dev`.
- [ ] **Step 2:** `/consult` → start a sample-persona intake (mic). Verify: directive opening fires; transcript populates both roles; AI audio plays; barge-in stops playback; localizer panel updates ~every 3 turns; a scale (e.g. MIDAS) administers verbatim one item at a time; `save_interview_output` writes the structured record; safety phrase triggers escalation.
- [ ] **Step 3:** Flip `NEXT_PUBLIC_VOICE_PROVIDER=openai` (needs OpenAI credit) and confirm the same intake still works — proves the toggle + that the prompt change carried to both.
- [ ] **Step 4:** Capture both transcripts into `qa/historian-baselines/` for the ASR/naturalness A/B. Note any medical-term ASR misses on the Nova run.
- [ ] **Step 5:** Commit any fixes found.

> Decision gate (from spec §7): if Nova medical-term ASR is materially worse, open a follow-up task to route the USER channel through Transcribe Medical (`@aws-sdk/client-transcribe-streaming`, already a dep) for transcripts while Nova drives voice. Do NOT build this pre-emptively.

---

## PHASE 2 — Deploy relay to App Runner

### Task 11: Containerize + App Runner config

**Files:**
- Create: `services/nova-sonic-relay/Dockerfile`, `apprunner.yaml`, `.dockerignore`

- [ ] **Step 1: Dockerfile** — node:20-slim, copy + `npm ci` + `npm run build`, `EXPOSE 8081`, `CMD ["node","dist/server.js"]`.
- [ ] **Step 2: `apprunner.yaml`** — `runtime: nodejs` (or image), health-check path `/healthz`, port `8081`, env `NOVA_SONIC_REGION=us-east-1`, `NOVA_SONIC_MODEL_ID=amazon.nova-2-sonic-v1:0`.
- [ ] **Step 3: Build image locally** → `docker build -t nova-relay services/nova-sonic-relay` → success.
- [ ] **Step 4: Commit** → `git commit -m "feat(relay): Dockerfile + App Runner config"`.

### Task 12: Provision App Runner (IAM role, us-east-1) — stage for Steve

> Per global rules, Claude does not create AWS resources unprompted; **stage these commands and hand them to Steve** (he approves infra on trust, but creation is a confirm-first action).

- [ ] **Step 1:** Create an **instance role** `nova-sonic-relay-role` with a least-privilege policy: `bedrock:InvokeModelWithBidirectionalStream` on `arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-2-sonic-v1:0`. (No access keys.)
- [ ] **Step 2:** Create the App Runner service from the image/repo in **us-east-1**, instance role attached, health check `/healthz`, min 1 instance (avoid WS cold-start mid-demo).
- [ ] **Step 3:** Capture the service URL → set app env `NOVA_SONIC_RELAY_URL=wss://<id>.us-east-1.awsapprunner.com` and `NEXT_PUBLIC_NOVA_SONIC_RELAY_URL` to the same.
- [ ] **Step 4:** Re-run Task 10 Step 2 against the deployed relay (`wss://`).
- [ ] **Step 5:** Set Amplify env `NEXT_PUBLIC_VOICE_PROVIDER=nova` + the relay URLs; commit env doc updates (`CLAUDE.md` + `docs/`).

---

## PHASE 3 — Follow-up agent on Nova

### Task 13: Refactor `useFollowUpRealtimeSession` onto the provider

**Files:**
- Modify: `src/hooks/useFollowUpRealtimeSession.ts`
- Modify: `src/app/api/follow-up/realtime-session/route.ts`

- [ ] **Step 1:** Same refactor as Task 8: drive a `VoiceProvider`; keep follow-up harness logic (safety keywords incl. emergency terms, `scanForEscalationTriggers`, `save_followup_output` routing). The follow-up's manual mic-mute echo handling is replaced by Nova barge-in on the Nova path; **keep** the mute logic on the OpenAI path.
- [ ] **Step 2:** Map `save_followup_output` via `toNovaToolSpec`; session route returns Nova config when `provider=nova`.
- [ ] **Step 3:** `npx tsc --noEmit` + `npx vitest run`.
- [ ] **Step 4: Commit** → `git commit -m "refactor(follow-up): drive VoiceProvider; Nova tool spec; barge-in on Nova path"`.

### Task 14: Validate follow-up + open PR

- [ ] **Step 1:** `/follow-up` browser voice demo on Nova: medication-status + escalation flow, escalation flag fires, `save_followup_output` completes; flip to OpenAI and confirm parity.
- [ ] **Step 2:** Run `qa/` S1–S5 on `/consult` + `/follow-up` + a 375px mobile check.
- [ ] **Step 3:** Update docs (`CLAUDE.md` Recent Changes, `docs/AI_PROMPTS_AND_MODELS.md`, `qa/TEST_CASES.yaml`).
- [ ] **Step 4:** Open PR from `feat/nova-sonic-voice` (do NOT merge — Steve smoke-tests + merges).

---

## Self-review

- **Spec coverage:** provider toggle (Tasks 7,8,13) · relay (1–4,11,12) · audio plumbing (5,6) · tool mapping (8,13) · localizer injection (8) · directive opening (9) · region/IAM (12) · validation incl. ASR gate (10,14) · both surfaces phased (P1 vs P3) — all mapped. OpenAI fallback preserved (Task 7 Step 3, Task 13 Step 1).
- **Placeholders:** none — owned code is shown; relay-core + worklet tasks reference the verified event contract + cited AWS sample rather than inventing streaming internals, which is the honest boundary (flagged at top).
- **Type consistency:** `VoiceEvent`/`VoiceProvider` (Task 7) reused in Tasks 8/13; `ClientMsg`/`ServerMsg` shared between `wsProtocol.ts` and `relayProtocol.ts` (Task 4); audio constants centralized (Task 1); `toNovaToolSpec`/`getHistorianToolsForProvider` defined Task 8, reused Task 13.

## Open risks carried into execution
- Bedrock **model access** for `amazon.nova-2-sonic-v1:0` in us-east-1 must be enabled before any live test (Task 4 warning).
- Exact `voiceId` options + input/output rates **confirmed from the sample in Task 1**, not assumed.
- App Runner long-lived **WS keepalive** + min-instance tuning verified in Task 12.
