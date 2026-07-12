#!/usr/bin/env bash
# One-shot production deploy for nova-sonic-relay.
#
#   ./scripts/deploy.sh
#
# Builds the image for linux/amd64 (Fargate default — an arm64 image from an
# Apple Silicon Mac will NOT run), pushes to ECR :latest, forces a new ECS
# deployment, and waits for the service to stabilize. Exits non-zero on any
# failure. PRODUCTION action — run deliberately.

set -euo pipefail
cd "$(dirname "$0")/.."

ACCOUNT=873370528823
REGION=us-east-1
PROFILE=sevaro-sandbox
CLUSTER=fastfill-cluster
SERVICE=nova-sonic-relay-svc
REPO="$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/nova-sonic-relay"

echo "==> ECR login"
aws ecr get-login-password --region "$REGION" --profile "$PROFILE" \
  | docker login --username AWS --password-stdin "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"

echo "==> Build (linux/amd64)"
docker build --platform linux/amd64 -t "$REPO:latest" .

echo "==> Push"
docker push "$REPO:latest"

echo "==> Force new ECS deployment ($CLUSTER/$SERVICE)"
aws ecs update-service --cluster "$CLUSTER" --service "$SERVICE" \
  --force-new-deployment --region "$REGION" --profile "$PROFILE" \
  --query "service.deployments[0].{status:status,rollout:rolloutState}" --output table

echo "==> Waiting for service to stabilize (up to ~10 min)"
aws ecs wait services-stable --cluster "$CLUSTER" --services "$SERVICE" \
  --region "$REGION" --profile "$PROFILE"

echo "PASS — nova-sonic-relay deployed and stable."
