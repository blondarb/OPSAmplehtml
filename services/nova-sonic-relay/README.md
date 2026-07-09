# nova-sonic-relay

WebSocket relay service that bridges browser clients to AWS Bedrock Nova 2 Sonic (bidirectional streaming). It handles audio framing, turn detection, and tool-use plumbing so the browser only speaks a simple JSON-over-WebSocket protocol.

Listens on `PORT` (default `8081`). Health check: `GET /healthz` → `200 ok`.

---

## Run locally

```bash
AWS_PROFILE=sevaro-sandbox npm run dev
```

The relay uses the default AWS credential provider chain. In local dev that means your SSO profile. In App Runner it uses the instance IAM role — no keys needed.

Environment variables (all optional, defaults shown):

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8081` | HTTP / WebSocket listen port |
| `NOVA_SONIC_REGION` | `us-east-1` | AWS region for Bedrock |
| `NOVA_SONIC_MODEL_ID` | `amazon.nova-2-sonic-v1:0` | Nova 2 Sonic model ID |
| `NOVA_SONIC_VOICE_ID` | *(model default)* | Voice ID passed to Nova Sonic |

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
  nova-sonic-relay
```

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
