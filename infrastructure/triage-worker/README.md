# Durable neurology triage workers

This SAM stack is the production path for long referral packets. It is not
deployed automatically. The web request performs complete-source deterministic
screening and creates the safety hold first; these workers perform versioned
mapper, safety, and reducer jobs from the database after that point. The same
stack carries closed-loop emergency-action alerts through an opaque work queue,
an opaque FIFO delivery queue, and an idempotent critical UI transaction.

Safety properties:

- SQS messages contain opaque run/job identifiers only, never referral text.
- The database lease token is authoritative because SQS delivery is at least
  once.
- The database lease exceeds the Lambda timeout; stale invocations therefore
  cannot publish a late result under an expired lease.
- The worker has bounded concurrency, a queue DLQ, a one-minute recovery
  sweep, and alarms for DLQ entries, worker errors, and queue age.
- Queue encryption and TLS-only access are explicit.
- Completed outcomes are immutable under migration 052.
- No failed or incomplete run may mark an extraction complete or release a
  clinician hold.
- Emergency queue messages contain exactly alert ID, action ID, fixed severity,
  and bounded escalation level; tenant/team routing is loaded from locked
  database rows.
- Migration 053 continues emergency reminders until verified handoff or closure.
- Migration 054 inserts one critical UI notification per alert ID in the same
  transaction that records delivery; it does not use a best-effort helper.
- Publisher and UI-delivery paths each have a DLQ plus age, Lambda error, and
  terminal-failure alarms.
- Critical UI delivery consumes one FIFO message at a time and adjusts only the
  current message's visibility for bounded, database-recorded retries.
- A one-minute recovery sweep re-enqueues due, expired, and migration-backfilled
  delivery rows using the same alert-ID deduplication key.
- Missing-invocation heartbeat alarms detect a disabled or broken outbox or
  delivery recovery schedule even when no SQS message exists to age.

Deployment remains blocked until migrations 048-054 pass preflight in the
target database, the sandbox stack change set is reviewed, the RDS VPC and
secret parameters are confirmed, and the alarm topic has an actively monitored
subscription. A sandbox acceptance test must also prove that an active action
appears as an unread critical notification for the intended tenant/team and
that verified handoff stops later reminders. The selected private subnets must
have tested access to RDS, Secrets Manager, SQS, Bedrock Runtime, CloudWatch
Logs, and X-Ray through VPC endpoints or controlled egress. Use
`sam validate --lint` and `sam build` before any change set.

## Deploying

**These Lambdas are not deployed by Amplify.** Amplify deploys only the Next.js
app. The functions here bundle `src/lib/triage/*` at build time and ship as this
separate SAM stack, so a merge to `main` leaves them running stale code until
this stack is deployed explicitly. Check what is actually live before assuming a
merged change has shipped:

```bash
aws lambda list-functions --region us-east-2 --profile sevaro-sandbox \
  --query "Functions[?contains(FunctionName,'mergencyAlert')].[FunctionName,LastModified]" \
  --output text
```

Deploy settings live in `samconfig.toml` (stack, region, profile, capabilities,
and the required parameters), so the full sequence is:

```bash
cd infrastructure/triage-worker
sam validate --lint
sam build
sam deploy                 # prints a changeset and asks before applying
```

Add `--no-confirm-changeset` for a non-interactive run.

`samconfig.toml` exists because `RdsSecretArn` and `RdsDatabase` are required
parameters with **no defaults** — before it, a bare `sam deploy` dropped into
`--guided` or errored out before ever contacting CloudFormation, which is a
silent no-op that looks like a successful deploy. `RdsDatabase` must stay
explicit: the shared `sevaro/rds/credentials` secret's own `database` field is a
stale default (`github_showcase`, a different app's DB).

> Recorded because it actually bit us: on 2026-07-24 a SQL type-mismatch fix on
> the emergency-alert notification path sat merged-but-inert while the deploy
> silently never reached CloudFormation. See
> `docs/HANDOFF_2026-07-24_emergency-alert-delivery-fix.md`.

Note that the sibling `infrastructure/triage-ingestion` stack has no
`samconfig.toml` and is exposed to the same failure mode.
