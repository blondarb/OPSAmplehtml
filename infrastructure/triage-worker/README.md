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
