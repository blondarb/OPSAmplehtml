#!/usr/bin/env bash
# Historian eval worker + flag rollout — STEVE-EXECUTED (the Claude auto-mode classifier
# blocks stack deletion, Lambda/IAM creation and Amplify env writes).
# Idempotent: safe to re-run. Prints keys only, never secret values.
set -euo pipefail
export AWS_PROFILE="${AWS_PROFILE:-sevaro-sandbox}" AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-us-east-2}"
APP=d3ietjwgco4g2t
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

step() { printf '\n== %s\n' "$*"; }

step "0. (optional) delete the superseded historian-mvp-qa-worker stack — hygiene only; it polls historian_eval_jobs, not our pending rows"
if [ "${DELETE_OLD_STACK:-0}" = "1" ]; then
  aws cloudformation delete-stack --stack-name historian-mvp-qa-worker
  aws cloudformation wait stack-delete-complete --stack-name historian-mvp-qa-worker && echo "old stack deleted"
else
  echo "skipped (set DELETE_OLD_STACK=1 to delete)"
fi

step "1. sam build && sam deploy (adds HistorianEval queue/DLQ/worker/dispatcher/log groups/alarms)"
cd "$ROOT/infrastructure/triage-worker"
sam build >/dev/null && sam deploy --no-confirm-changeset --no-fail-on-empty-changeset
aws cloudformation list-stack-resources --stack-name sevaro-triage-worker-sandbox \
  --query 'StackResourceSummaries[?contains(LogicalResourceId, `HistorianEval`)].[LogicalResourceId,ResourceStatus]' --output text

step "2. Amplify app-level env: add the four historian flags (app level holds no secrets; branch level is untouched)"
CUR=$(aws amplify get-app --app-id "$APP" --query 'app.environmentVariables' --output json)
MERGED=$(python3 - "$CUR" <<'PY'
import json,sys
m=json.loads(sys.argv[1]); m.update({
  "HISTORIAN_EVAL_MODE":"queue",
  "HISTORIAN_ATTENDING_ENABLED":"true",
  "NEXT_PUBLIC_HISTORIAN_PATIENT_STEER":"true",
  "NEXT_PUBLIC_HISTORIAN_PRECLOSE_GATE":"true",
}); print(",".join(f"{k}={v}" for k,v in m.items()))
PY
)
aws amplify update-app --app-id "$APP" --environment-variables "$MERGED" --query 'keys(app.environmentVariables)' --output text

step "3. Rebuild main (env is build-time) and wait"
JOB=$(aws amplify start-job --app-id "$APP" --branch-name main --job-type RELEASE --query 'jobSummary.jobId' --output text)
echo "job $JOB"
for i in $(seq 1 60); do
  S=$(aws amplify get-job --app-id "$APP" --branch-name main --job-id "$JOB" --query 'job.summary.status' --output text)
  case "$S" in SUCCEED) echo "build $S"; break;; FAILED|CANCELLED) echo "build $S"; exit 1;; esac
  sleep 20
done

step "4. Verify"
curl -s -o /dev/null -w "runs API %{http_code}\n" "https://app.neuroplans.app/api/ai/historian/runs?limit=1"
echo "Next: Gate 1 in qa/runs/RUN-2026-09-06-001.md (Claude runs the synthetic session)."
