# nova-sonic-relay

WebSocket relay service that bridges browser clients to AWS Bedrock Nova 2 Sonic (bidirectional streaming). It handles audio framing, turn detection, and tool-use plumbing so the browser only speaks a simple JSON-over-WebSocket protocol.

Listens on `PORT` (default `8081`). Health check: `GET /healthz` → `200 ok`.

---

## Run locally

```bash
AWS_PROFILE=sevaro-sandbox npm run dev
```

The relay uses the default AWS credential provider chain. In local dev that means your SSO profile. In App Runner it uses the instance IAM role — no keys needed.

Environment variables (all optional except `NOVA_RELAY_SHARED_SECRET`, defaults shown):

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8081` | HTTP / WebSocket listen port |
| `NOVA_SONIC_REGION` | `us-east-1` | AWS region for Bedrock |
| `NOVA_SONIC_MODEL_ID` | `amazon.nova-2-sonic-v1:0` | Nova 2 Sonic model ID |
| `NOVA_SONIC_VOICE_ID` | *(model default)* | Voice ID passed to Nova Sonic |
| `NOVA_RELAY_SHARED_SECRET` | *(none)* | **Required to accept any connection.** HMAC secret shared with the Next.js app's `NOVA_RELAY_SHARED_SECRET`; used to validate the short-lived auth token the browser sends as a WS subprotocol. Unset = every WebSocket upgrade is rejected (fail closed) — there is no "auth disabled" mode. |
| `NOVA_RELAY_ALLOWED_ORIGINS` | *(none — origin check skipped)* | Comma-separated allowlist of exact `Origin` header values (e.g. `https://app.neuroplans.app`). When set, connections from any other origin are rejected alongside the token check. When unset, the token is the sole gate. |
| `TRANSCRIBE_MEDICAL_ENABLED` | `false` | **Flag-gated, off by default.** When `true`/`1`, the relay opens a second, parallel AWS Transcribe Medical streaming session per call on the same caller audio Nova Sonic receives, and emits `medicalTranscript` messages (`{ t: 'medicalTranscript', text, isPartial }`) alongside Nova's own transcripts — a higher-accuracy cross-check on spoken identifiers (MRN/name/DOB) that Nova Sonic (speech-to-speech) is prone to dropping digits from. Fail-safe: any Transcribe Medical error is logged and the session goes inert; the Nova Sonic call is never affected. Requires the task role to have `transcribe:StartMedicalStreamTranscription`. See `src/transcribeMedicalSession.ts`. |
| `NOVA_RENEW_AFTER_MS` | `420000` (7:00) | See [8-minute connection renewal](#8-minute-connection-renewal) below. |
| `NOVA_RENEW_HARD_MS` | `465000` (7:45) | See [8-minute connection renewal](#8-minute-connection-renewal) below. |

### WebSocket authentication

`/healthz` stays unauthenticated (ALB health check). Every other WS upgrade is gated in `src/server.ts` via `verifyClient`/`handleProtocols`:

1. The browser cannot set custom headers on a WS handshake, so the caller (the Next.js historian session route) mints a short-lived HMAC token and the browser sends it as a second WS **subprotocol** alongside the fixed `nova.v1` tag: `Sec-WebSocket-Protocol: nova.v1, <token>`.
2. `verifyClient` rejects the upgrade (401, no 101 handshake) unless: `NOVA_RELAY_SHARED_SECRET` is configured, the `Origin` header is allowed (when `NOVA_RELAY_ALLOWED_ORIGINS` is set), and the token's HMAC + `exp` (unix seconds) both check out.
3. `handleProtocols` only runs after `verifyClient` accepts, and simply echoes back `nova.v1` as the negotiated subprotocol.

Token format: `${base64url(JSON.stringify({exp}))}.${base64url(HMAC_SHA256(secret, payload))}` — see the header comment in `src/server.ts` and the minting logic in `src/app/api/ai/historian/session/route.ts` (Next.js app) for the exact byte-for-byte contract both sides must agree on.

---

## 8-minute connection renewal

Amazon Nova 2 Sonic enforces a hard **~8-minute limit per bidirectional stream** ("Connection limit of 8 minutes, with connection renewal and session continuation pattern available in code samples" — [docs.aws.amazon.com/nova/latest/nova2-userguide/using-conversational-speech.html](https://docs.aws.amazon.com/nova/latest/nova2-userguide/using-conversational-speech.html)). The historian interview is designed to run 15-20 minutes, so **every real interview hits this cap.**

`src/novaConnectionManager.ts` (`NovaConnectionManager`) wraps `NovaSonicSession` and renews the underlying Bedrock connection before that happens, so the client WebSocket — and the browser — never sees it:

- **Trigger:** at `NOVA_RENEW_AFTER_MS` (default 7:00), but only at a *quiet point* (right after the model finishes a spoken turn, never mid-speech and never with a tool call outstanding). If the connection is already quiet when the timer fires, renewal starts immediately; otherwise it waits for the next quiet-point signal.
- **Quiet-point signal:** the model's own `contentEnd` event with `type: "AUDIO"` and `stopReason: "END_TURN"` (`NovaSonicCallbacks.onTurnEnd`) — the actual per-turn boundary Nova emits (`PARTIAL_TURN` mid-turn, `END_TURN` at the end of a spoken turn; see AWS's output-events docs). `completionEnd` (`onCompletionEnd`) is wired as a secondary check with identical logic, but is not reliably emitted per turn in practice — a production run on 2026-09-08 logged the 7:00 scheduled-renewal timer firing while the assistant completed three full spoken turns in the following 45s with no `completionEnd` in between, so the renewal never got a chance to fire until the 7:45 hard deadline. `onTurnEnd` is the fix; both callbacks share one `checkQuietPointRenewal()` method so they can't drift apart.
- **Hard deadline:** if no quiet point has arrived by `NOVA_RENEW_HARD_MS` (default 7:45), renewal is forced at the next transcript boundary regardless of speaking/tool state, so it can never ride all the way into Nova's own cutoff.
- **What happens:** a second `NovaSonicSession` opens with the same instructions/tools/voice, seeded with the accumulated conversation (every USER/ASSISTANT turn the old session forwarded, capped at ~60k characters, oldest dropped first, then run through `sanitizeHistoryForNova()` — see below) plus a one-line system note telling the model to continue, not re-greet. Once that new stream is open, the manager atomically switches audio/tool-result/system-text routing and callbacks to it, then stops the old session in the background. The client WebSocket is never touched.
- **History sanitization (`sanitizeHistoryForNova()` in `src/novaConnectionManager.ts`):** Nova requires the seeded history to start with a USER turn and rejects a leading ASSISTANT turn outright ("First message in chat history should not be Assistant" — a real production failure on 2026-09-08, since the interview's first accumulated turn is always the assistant's own greeting). Nova is also designed for strictly alternating user/assistant turns, and the manager's own accumulation can produce back-to-back same-role turns (e.g. two assistant turns with no intervening user reply). Before seeding, the accumulated history is: (1) trimmed of any leading turns until the first USER turn, (2) had consecutive same-role turns merged into one (text joined with a single space), and (3) had any empty-text turns dropped. If nothing survives, `history: []` is passed rather than seeding anything. This is a pure function, unit-tested independently of the renewal flow.
- **Reactive fallback:** if the *old* connection errors (e.g. Nova's own timeout fires) before a scheduled renewal completed, the manager attempts one renewal immediately. Only if that attempt also fails does it fall back to the existing graceful-close behavior (PR #234: relay closes the client ws with code `1011`, the browser ends the interview with the transcript already saved).
- **Rate limit:** at most one renewal attempt per 60 seconds.
- **What the browser sees:** nothing — no reconnect, no gap in audio/transcript, no re-greeting. Operationally, `[nova-renew] ...` lines in the relay log (`scheduled` / `started` / `switched` / `failed` — never transcript text) are the only visible trace. The `scheduled reason=timer` line now also logs `quiet=<bool> speaking=<bool> toolOutstanding=<bool>`, and `started`/`switched` log `historyTurns=<raw count> seeded=<count after sanitization>`, so a future stall or history problem is diagnosable straight from CloudWatch.

---

## Build the Docker image

```bash
docker build -t nova-sonic-relay .
```

Run the image locally (credentials via env for testing; never do this in prod):

```bash
docker run --rm -p 8081:8081 \
  -e AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID \
  -e AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY \
  -e AWS_SESSION_TOKEN=$AWS_SESSION_TOKEN \
  -e NOVA_SONIC_REGION=us-east-1 \
  -e NOVA_RELAY_SHARED_SECRET=$NOVA_RELAY_SHARED_SECRET \
  nova-sonic-relay
```

`NOVA_RELAY_SHARED_SECRET` must match the value configured on the Next.js app (Amplify env var of the same name) or every connection will be rejected.

---

## Deploy to AWS App Runner

### Option A — Image via ECR (recommended for production)

1. Push the image to ECR:

   ```bash
   ACCOUNT=$(aws sts get-caller-identity --query Account --output text --profile sevaro-sandbox)
   REGION=us-east-1
   REPO=$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/nova-sonic-relay

   aws ecr get-login-password --region $REGION --profile sevaro-sandbox \
     | docker login --username AWS --password-stdin $ACCOUNT.dkr.ecr.$REGION.amazonaws.com

   docker build -t nova-sonic-relay .
   docker tag nova-sonic-relay:latest $REPO:latest
   docker push $REPO:latest
   ```

2. Create / update the App Runner service pointing at the ECR image.

3. Attach an IAM instance role with:
   - `bedrock:InvokeModelWithBidirectionalStream` on `arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-2-sonic-v1:0`

### Option B — Source-based via apprunner.yaml

Point App Runner at this repository; it will run `npm ci && npm run build` then
`node dist/server.js` on each deploy using the `apprunner.yaml` in this directory.
Requires the same IAM instance role as Option A.

> The `nodejs18` managed runtime in `apprunner.yaml` is the latest generally
> available managed runtime. If App Runner adds `nodejs20` support by the time
> you deploy, update the `runtime:` line accordingly.
