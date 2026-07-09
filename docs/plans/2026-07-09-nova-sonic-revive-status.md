# Nova Sonic voice-provider revive — status (2026-07-09)

Reviving the stranded `feat/nova-sonic-voice` work (24 commits / ~6 weeks behind
main) so the AI Historian can run on **either** OpenAI Realtime (today's live
path) **or** Amazon Nova 2 Sonic, chosen from a front-end toggle. Approach was a
**cherry-pick onto current `main`**, not a rebase of the stale branch.

Branch: `feat/nova-sonic-revive` (off `main`). See the original design/plan:
`docs/superpowers/specs/2026-06-05-nova-sonic-voice-migration-design.md` and
`docs/superpowers/plans/2026-06-05-nova-sonic-voice-migration.md`.

## What the toggle does
`VoiceProviderToggle` (rendered on both historian surfaces — `/patient/historian`
via `NeurologicHistorian.tsx` and `/consult` via `EmbeddedHistorian.tsx`, only
while `phase === 'ready'` so it can't be flipped mid-session) lets you pick the
provider per session. Default is **OpenAI** everywhere (`VOICE_PROVIDER` env →
`'openai'`; client `useVoiceProviderPreference` also hard-defaults to openai
unless `?voice=nova` or a stored choice exists). With no toggle interaction the
app reproduces today's OpenAI-only behavior.

## Phases done (committed + pushed)
- **Phase 0 — feasibility GO.** `amazon.nova-2-sonic-v1:0` verified **ACTIVE** in
  Bedrock us-east-1 (us-east-2 has no Sonic — relay must run in us-east-1). Branch
  code confirmed substantial (relay + provider layer + tests), not a stub.
- **Phase 1 (`fa94c9a`)** — lifted 30 conflict-free new files onto current main.
  Collision fix: the branch had shipped the VoiceProvider interface as
  `src/lib/voice/types.ts`, which now collides with main's **SDNE speech-biomarker**
  `types.ts` (10 importers). Restored main's `types.ts`; relocated the provider
  contract to `src/lib/voice/providerTypes.ts`.
- **Phases 2–4 (`babeb0c`, `2a4e130`, `5680742`)** — reconciled the modified files,
  threaded `useRealtimeSession` + the follow-up hook through the provider
  abstraction, added the nova tool-config adapter, mounted the toggle. Preserved
  main's July fixes (#142 drop-modalities, #134 greeting timing, #143 auto-end,
  VAD, localizer-every-3-turns, echo cancellation, token renewal, Henry prompt).
  `tsc` clean; unit tests at the pre-existing baseline; relay package builds/tests.
- **Adversarial review + fix (`83b49f4`)** — independent review of the crux
  (`useRealtimeSession` + `openaiWebrtcProvider`) vs main confirmed 10/11 behaviors
  preserved and caught one Medium regression: the end-of-interview save-flush was
  gated on `!!provider` instead of the transport actually being open, causing a
  ~4s "Ending…" stall on a genuine transport drop. Fixed by adding
  `VoiceProvider.isOpen()` and gating the flush on it.

## Phase 5 — remaining (needs AWS go; creates remote resources)
The Nova path fails closed (throws) until a relay is deployed and
`NOVA_SONIC_RELAY_URL` is set — so shipping this branch changes nothing for users
until Phase 5 runs. Steps:

1. **Build + push the relay image to ECR** (`services/nova-sonic-relay/`, region
   `us-east-1`) — see that dir's `README.md` Option A.
2. **Create an App Runner service** from the image (port 8081), env
   `NOVA_SONIC_REGION=us-east-1`, `NOVA_SONIC_MODEL_ID=amazon.nova-2-sonic-v1:0`.
3. **Instance IAM role** with `bedrock:InvokeModelWithBidirectionalStream` on
   `arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-2-sonic-v1:0`.
4. **Point the app at it** — set `NOVA_SONIC_RELAY_URL` (wss://…) in Amplify
   (remember: Amplify **replaces the whole env map** on update).
5. **Live smoke both paths** (OpenAI unchanged; Nova end-to-end) on Mac + Windows
   before considering GA. The branch has NOT been live-tested against a running
   relay yet.

Note: `apprunner.yaml` pins `runtime: nodejs18` — bump to the latest available
App Runner Node runtime at deploy time.
