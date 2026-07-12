# nova-sonic-relay

WebSocket relay service that bridges browser clients to AWS Bedrock Nova 2 Sonic (bidirectional streaming). It handles audio framing, turn detection, and tool-use plumbing so the browser only speaks a simple JSON-over-WebSocket protocol.

Listens on `PORT` (default `8081`). Health check: `GET /healthz` → `200 ok`.

---

## Run locally

```bash
AWS_PROFILE=sevaro-sandbox \
NOVA_RELAY_SHARED_SECRET="$NOVA_RELAY_SHARED_SECRET" \
NOVA_RELAY_ALLOWED_ORIGINS=http://localhost:3000 \
NOVA_RELAY_REPLAY_TABLE=nova-relay-replay \
npm run dev
```

The relay uses the default AWS credential provider chain. Local development
should use an SSO profile; the deployed ECS task uses its task role. Static AWS
access keys are not required or recommended.

The environment variables `NOVA_RELAY_SHARED_SECRET`,
`NOVA_RELAY_ALLOWED_ORIGINS`, and `NOVA_RELAY_REPLAY_TABLE` are required:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8081` | HTTP / WebSocket listen port |
| `NOVA_SONIC_REGION` | `us-east-1` | AWS region for Bedrock |
| `NOVA_SONIC_MODEL_ID` | `amazon.nova-2-sonic-v1:0` | Nova 2 Sonic model ID |
| `NOVA_SONIC_VOICE_ID` | *(model default)* | Voice ID passed to Nova Sonic |
| `NOVA_RELAY_SHARED_SECRET` | *(none)* | **Required to accept any connection.** Inject it into the relay at runtime from the `shared_secret` field in `sevaro/nova-relay/shared-secret`; the Next.js app reads the same named secret. It validates the short-lived auth token carried as a WS subprotocol. Unset = every WebSocket upgrade is rejected (fail closed). |
| `NOVA_RELAY_SECONDARY_SHARED_SECRET` | *(none)* | Optional overlap key injected from `secondary_shared_secret`. The relay accepts either signing key during an approved, bounded rotation; the primary remains mandatory. |
| `NOVA_RELAY_ALLOWED_ORIGINS` | *(none)* | Required comma-separated allowlist of exact `Origin` values (for example `https://app.neuroplans.app`). Unset rejects every upgrade. |
| `NOVA_RELAY_REPLAY_TABLE` | *(none)* | Required DynamoDB table used to atomically consume each signed token ID once. Unset rejects every upgrade. |

### WebSocket authentication

`/healthz` stays unauthenticated for the ALB health check. Every WebSocket
upgrade passes through the asynchronous gate in `src/relayUpgrade.ts` before
`ws.handleUpgrade` takes ownership:

1. The browser cannot set custom headers on a WS handshake, so the caller (the Next.js historian session route) mints a short-lived HMAC token and the browser sends it as a second WS **subprotocol** alongside the fixed `nova.v1` tag: `Sec-WebSocket-Protocol: nova.v1, <token>`.
2. The asynchronous gate rejects the upgrade (401, no 101 handshake) unless
   the required primary secret, exact Origin allowlist, and shared replay table
   are configured. The token HMAC may match the primary or optional overlap
   secret; its expiry, configuration digest, and UUIDv4 `jti` must validate.
3. The gate conditionally writes the `jti` to DynamoDB. A simultaneous or later
   reuse fails the conditional write and is rejected across all relay replicas.
4. The gate hands the verified configuration to the accepted connection once,
   removes its temporary raw-socket listener, and only then calls
   `handleUpgrade`; `handleProtocols` echoes `nova.v1`.

The signed payload contains the expiry and a SHA-256 digest of the exact
server-approved start configuration. See `src/relayAuth.ts` and
`src/lib/voice/novaRelayAuth.ts` for the byte-for-byte contract.

---

## Build the Docker image

```bash
docker build -t nova-sonic-relay .
```

Run the image locally with an SSO/default-chain credential profile. The named
DynamoDB replay table must exist in the selected development account:

```bash
docker run --rm -p 8081:8081 \
  -v "$HOME/.aws:/root/.aws:ro" \
  -e AWS_PROFILE=sevaro-sandbox \
  -e AWS_REGION=us-east-1 \
  -e NOVA_SONIC_REGION=us-east-1 \
  -e NOVA_RELAY_SHARED_SECRET \
  -e NOVA_RELAY_SECONDARY_SHARED_SECRET \
  -e NOVA_RELAY_ALLOWED_ORIGINS=http://localhost:3000 \
  -e NOVA_RELAY_REPLAY_TABLE=nova-relay-replay \
  nova-sonic-relay
```

`NOVA_RELAY_SHARED_SECRET` must match the runtime Secrets Manager value used by
the Next.js app or every connection will be rejected. Do not build the secret
into either artifact.

---

## Existing AWS deployment

The current relay runs on ECS Fargate in `us-east-1`: cluster
`fastfill-cluster`, service `nova-sonic-relay-svc`, task-definition family
`nova-sonic-relay`, behind the ALB at `nova-relay.neuroplans.app`. Images are
built through the existing `nova-sonic-relay-build` CodeBuild project and
stored in ECR.

An approved relay release updates the image, registers a task-definition
revision, and rolls that existing ECS service. The task role supplies Bedrock
and replay-table access; the execution role injects both JSON secret keys. Keep
`/healthz` healthy and verify authorization, one-use replay rejection, and
alarms during a canary before completing a rollout.

Secret rotation requires forced ECS deployments because changing Secrets
Manager does not refresh already-running tasks. Follow the approval-gated
overlap and wait procedure in
[`infrastructure/nova-relay-security/README.md`](../../infrastructure/nova-relay-security/README.md).
