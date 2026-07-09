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

### WebSocket authentication

`/healthz` stays unauthenticated (ALB health check). Every other WS upgrade is gated in `src/server.ts` via `verifyClient`/`handleProtocols`:

1. The browser cannot set custom headers on a WS handshake, so the caller (the Next.js historian session route) mints a short-lived HMAC token and the browser sends it as a second WS **subprotocol** alongside the fixed `nova.v1` tag: `Sec-WebSocket-Protocol: nova.v1, <token>`.
2. `verifyClient` rejects the upgrade (401, no 101 handshake) unless: `NOVA_RELAY_SHARED_SECRET` is configured, the `Origin` header is allowed (when `NOVA_RELAY_ALLOWED_ORIGINS` is set), and the token's HMAC + `exp` (unix seconds) both check out.
3. `handleProtocols` only runs after `verifyClient` accepts, and simply echoes back `nova.v1` as the negotiated subprotocol.

Token format: `${base64url(JSON.stringify({exp}))}.${base64url(HMAC_SHA256(secret, payload))}` — see the header comment in `src/server.ts` and the minting logic in `src/app/api/ai/historian/session/route.ts` (Next.js app) for the exact byte-for-byte contract both sides must agree on.

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
