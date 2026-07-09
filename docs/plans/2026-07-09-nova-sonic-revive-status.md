# Nova Sonic voice-provider — status (2026-07-09) — LIVE

The AI Historian runs on **either** OpenAI Realtime (WebRTC, browser-direct) **or**
Amazon Nova 2 Sonic (via a WebSocket relay), chosen per session from a front-end
`VoiceProviderToggle` on `/patient/historian` and `/consult`. One build, one
runtime switch (`selectProvider`), extensible to more providers. **Default is
OpenAI everywhere.** Shipped to prod (`app.neuroplans.app`).

Design/plan: `docs/superpowers/specs/2026-06-05-nova-sonic-voice-migration-design.md`,
`docs/superpowers/plans/2026-06-05-nova-sonic-voice-migration.md`.

## Architecture
- **OpenAI path** — zero infra; browser ↔ OpenAI Realtime via an ephemeral token minted by `/api/ai/historian/session`.
- **Nova path** — browser `wss://nova-relay.neuroplans.app` ↔ **relay** (ECS Fargate + ALB) ↔ Bedrock `amazon.nova-2-sonic-v1:0` (us-east-1) via `InvokeModelWithBidirectionalStream`. The relay exists because Bedrock's bidirectional audio stream needs a persistent server (a browser / Amplify SSR Lambda can't hold it).

## Deployed infra (us-east-1, account 873370528823)
- **Relay service:** `services/nova-sonic-relay` on **ECS Fargate** (`fastfill-cluster`, service `nova-sonic-relay-svc`, task def `nova-sonic-relay`), image in ECR built by CodeBuild project `nova-sonic-relay-build` (Docker-free, S3 source). Task role `NovaSonicRelayInstanceRole` (Bedrock bidi on the nova-2 model); exec role `novaSonicRelayExecutionRole`.
- **ALB** `nova-sonic-relay-alb` → target group `nova-relay-tg` (HTTP1, health check `/healthz`), HTTPS:443 listener with ACM cert on `nova-relay.neuroplans.app`, **idle timeout 300s** (long/quiet Nova turns). Route53 A-alias in zone `neuroplans.app`.
- **NOTE: App Runner does NOT support WebSockets** — the original `services/nova-sonic-relay/apprunner.yaml` target was abandoned for this reason (proven: Envoy 403 on the WS upgrade + AWS docs; App Runner also sunset). The apprunner.yaml is dead — ignore/remove it.

## WebSocket auth (PR #148)
The relay's WS upgrade is gated: the session route mints a short-lived HMAC token
(`payload={exp}`, 120s TTL, `NOVA_RELAY_SHARED_SECRET`); the browser sends it as a
WS subprotocol `['nova.v1', token]`; the relay's `verifyClient` validates it
(timing-safe, `exp`, fail-closed if no secret) plus an Origin allowlist
(`NOVA_RELAY_ALLOWED_ORIGINS`). `/healthz` stays unauthenticated for the ALB.
Live-verified 4/4: valid+ok-origin→OPEN, no-token→401, valid+bad-origin→401, bogus→401.

## Env vars (set in BOTH places for the shared secret)
- **Amplify branch `main` env** (and inlined in `next.config.ts` for SSR runtime): `VOICE_PROVIDER` (unset→openai default), `NOVA_SONIC_RELAY_URL=wss://nova-relay.neuroplans.app`, `NOVA_SONIC_VOICE_ID=matthew`, `NOVA_RELAY_SHARED_SECRET`.
- **ECS task def env:** `NOVA_SONIC_REGION=us-east-1`, `NOVA_SONIC_MODEL_ID=amazon.nova-2-sonic-v1:0`, `NOVA_SONIC_VOICE_ID=matthew`, `NOVA_RELAY_SHARED_SECRET` (same value), `NOVA_RELAY_ALLOWED_ORIGINS=https://app.neuroplans.app`.

## PRs
#144 revive · #145 start()-error-propagation · #146 IPv4 bind · #147 next.config env wiring · #148 WS auth.

## Open / follow-ups (not blockers)
- **Scope: test-only, no real PHI now.** Productionization needs vendor BAAs (Amazon ✓; OpenAI obtainable). Relay secret is currently plaintext env on both sides — move to Secrets Manager before real patients.
- **Token replay** within the 120s window is possible (over TLS, voice-relay-only) — future hardening: single-use nonce / shorter TTL.
- **Follow-up voice path** (`src/app/api/follow-up/realtime-session/route.ts`) has its own `provider==='nova'` branch NOT wired with a relay token — it will fail-closed if Nova is selected there. Wire the same `relayToken` minting if that surface needs Nova.
- **OpenAI arm** currently returns `429 insufficient_quota` — OpenAI account billing, not code. Top up to A/B the OpenAI side.

## Teardown (when the trial ends, ~10 commands, reverse order)
Route53 record → ECS service (desired 0 → delete) → ALB listener/ALB/target group → security groups → ACM cert → CloudWatch log group → ECR repo (force) → CodeBuild project + role → exec role. Leave `fastfill-cluster`, the VPC, and the Route53 zone (shared).
