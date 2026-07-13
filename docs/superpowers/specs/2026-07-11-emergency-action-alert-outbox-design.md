# Emergency-Action Alert Outbox Design

## Goal

Create a PHI-free, closed-loop alert outbox for `triage_emergency_actions`. Every new action starts with an alert in the same database transaction. Active actions continue producing bounded reminders until verified handoff or closure.

## Data model

`triage_emergency_action_alerts` is an append-only audit stream keyed by `(emergency_action_id, sequence_number)`. Rows contain only opaque identifiers, fixed severity, bounded escalation level, publisher lifecycle fields, lease metadata, and sanitized error evidence. They contain no tenant identifier, patient identifier, source text, instructions, disposition evidence, contact details, or notification content.

Publisher states are `pending`, `leased`, `failed`, `sent`, `terminal_failure`, and `suppressed`. Escalation levels are capped at 3. Sequence numbers continue increasing at the capped level so reminders do not silently stop. Sent and terminal-failure rows are immutable; no alert row may be deleted.

## Creation and reminder flow

An `AFTER INSERT` trigger on `triage_emergency_actions` inserts sequence 0 at level 0. The trigger is part of the action transaction and the unique action/sequence key makes creation idempotent.

A due sweep locks eligible action rows with `FOR UPDATE SKIP LOCKED`. Eligibility requires action status `open`, `attempting_contact`, or `failed` and `next_escalation_at <= now()`. For each locked action it inserts exactly one next sequence, caps the level at 3, and advances `next_escalation_at` using a bounded cadence. Ownership or clinician claim does not affect eligibility.

When the action reaches verified `handed_off` or `closed`, a trigger suppresses unsent alerts and the claim/load queries reject further publishing. If a handed-off action later transitions to `failed`, reminder generation resumes from the next append-only sequence.

## Publisher contract

Dispatcher output contains only `{ alertId, actionId, severity, level }`. Claim accepts the opaque alert/action pair and a worker identity, resolves tenant and action bindings inside one locked conditional mutation, and returns internal publisher context only after leasing. Completion and failure require the exact active lease token and unexpired lease.

Failures store allowlisted, bounded error codes/details. Retry exhaustion produces `terminal_failure`, which remains queryable through a PHI-free monitor and does not close or hand off the clinical action.

The scheduled dispatcher first materializes due reminders, then lists dispatchable rows and submits strict opaque SQS messages in batches of at most 10. Partial SQS batch failure fails the scheduled invocation; duplicate successful sends remain safe because the database claim is authoritative.

The publisher consumer parses an exact four-field message, claims the row, reloads active routing context behind the lease, and publishes the same opaque reference to an isolated FIFO delivery queue using `alertId` as the deduplication key. It acknowledges publisher work only after either sent state or retry/terminal-failure state is durably recorded. A missing claim or a stale lease caused by verified suppression is acknowledged without publishing; uncertain database persistence returns an SQS batch failure.

The FIFO delivery consumer is a separate safety boundary. Migration 054 creates a one-row-per-alert critical-UI delivery ledger only after publisher-confirmed sent state. The consumer locks the alert, action, session, and delivery state; resolves tenant, team, and optional owner only from those authoritative rows; and requires an active action plus an unexpired delivery lease. It inserts a static, critical `triage_result` notification and marks delivery in the same transaction. `source_id` and the delivery ledger primary key are both the alert ID, so replay cannot insert a second notification. The consumer never calls the legacy non-throwing notification helper.

Verified handoff or closure suppresses pending delivery, while ownership alone does not. Delivery failure never changes the emergency action or its reminder cadence. Retry exhaustion is immutable and alarmed, and the active action continues producing later reminder alerts until verified resolution.

The FIFO consumer uses batch size one and stops on the first failure. Controlled publisher-commit races and retryable database failures shorten the current SQS message visibility to the database-authoritative retry time; crashes and uncertain persistence retain the longer queue default. This avoids turning a five-second publisher race into a multi-minute notification delay without creating a retry storm.

A one-minute recovery sweep lists only opaque, due delivery references whose alert is publisher-confirmed sent and whose action remains active. It re-enqueues migration backfill, failed, and expired-lease rows with the same FIFO action group and alert-ID deduplication key. The database claim remains authoritative, so overlap with the original queue message is harmless. This closes the otherwise silent gap between a durable delivery row and a missing or manually redriven queue message.

## Safety invariants

- Initial alert creation cannot commit separately from action creation.
- A clinician claim alone cannot suppress reminders.
- Only `handed_off` or `closed` suppresses new publishing.
- Queue messages never include tenant, patient, note, evidence, instructions, or contact content.
- Tenant/team notification routing is resolved only inside a status- and lease-bound database transaction.
- Critical UI notification insertion and delivery evidence commit or roll back together.
- UI notification deduplication is keyed by immutable alert ID.
- Every publisher mutation checks state, token, expiry, and affected-row count.
- Sent and terminal-failure evidence cannot be rewritten or deleted.
- Terminal publisher failure is visible and never represented as clinical resolution.

## Verification

Static migration tests assert schema and trigger invariants. Disposable PostgreSQL tests prove transactional initial insertion, reminder continuation after ownership claim, suppression after handoff/closure, immutable terminal records, and deduplication. Mocked service tests adversarially inspect queue payload shape, tenant resolution, SKIP LOCKED claims, stale-token rejection, retry exhaustion, and sanitized failures.
