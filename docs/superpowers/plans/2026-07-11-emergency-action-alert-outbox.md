# Emergency-Action Alert Outbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a PHI-free, closed-loop emergency-action alert outbox with durable reminders, safe publisher leases, and visible terminal failures.

**Architecture:** Migration 053 owns invariant enforcement and automatic initial/suppression triggers. A focused PostgreSQL service owns due-reminder generation and opaque publisher lifecycle operations. Queue consumers receive only opaque IDs plus fixed severity and bounded level.

**Tech Stack:** PostgreSQL, node-postgres, TypeScript, Vitest, disposable local PostgreSQL.

---

### Task 1: Migration contract tests

**Files:**
- Create: `tests/triage/migrations/053_emergency_action_alert_outbox.test.ts`
- Create: `tests/triage/migrations/053_emergency_action_alert_outbox.behavior.sql`
- Create: `tests/triage/migrations/run-053-behavior.sh`

- [x] Write static tests for PHI-free columns, append-only identity, lifecycle checks, action insert trigger, terminal suppression trigger, and terminal-failure index.
- [x] Run the static test and verify it fails because migration 053 is absent.
- [x] Write disposable behavior assertions for transactional initial insertion, claim-insensitive reminders, handoff/closure suppression, deduplication, stale-token proof, and terminal immutability.

### Task 2: Migration 053

**Files:**
- Create: `migrations/053_emergency_action_alert_outbox.sql`

- [x] Create the alert table with sequence, fixed severity, capped level, publisher states, lease fields, retry fields, sanitized failure evidence, and lifecycle checks.
- [x] Add immutable binding/lifecycle triggers and reject deletion.
- [x] Add the action-insert initial-alert trigger and active-action backfill.
- [x] Add the handed-off/closed suppression trigger without reacting to ownership-only updates.
- [x] Run static and disposable PostgreSQL tests to green.

### Task 3: PostgreSQL service tests

**Files:**
- Create: `tests/triage/emergencyActionAlertOutbox.test.ts`

- [x] Write failing tests for due reminder generation under action-row locks, capped continuing levels, and exact affected-row checks.
- [x] Write failing tests proving dispatcher references have only alert/action IDs, severity, and level.
- [x] Write failing tests for opaque tenant-resolving claims, lease-bound loads, stale completion/failure rejection, sanitized retry errors, terminal failure visibility, and handed-off suppression.
- [x] Run focused tests and verify failures are caused by the missing service.

### Task 4: PostgreSQL service

**Files:**
- Create: `src/lib/triage/emergencyActionAlertOutbox.ts`

- [x] Implement `enqueueDueEmergencyActionReminders(limit)` with `FOR UPDATE SKIP LOCKED`, unique append-only sequence insertion, capped levels, and bounded cadence.
- [x] Implement `listDispatchableEmergencyAlertRefs(limit)` returning only PHI-free opaque references.
- [x] Implement `claimEmergencyAlertByRef`, resolving tenant/action context in the locked mutation without external tenant input.
- [x] Implement lease-bound active-action context loading.
- [x] Implement token/expiry-conditioned sent and failed transitions with bounded retries and terminal failure.
- [x] Implement a PHI-free terminal publisher failure monitor.
- [x] Run service tests to green and refactor only while green.

### Task 5: Verification

**Files:**
- Verify all files above.

- [x] Run focused outbox and migration tests.
- [x] Run disposable PostgreSQL behavior tests.
- [x] Run related emergency-action regression tests.
- [x] Run `npx tsc --noEmit` and focused ESLint.
- [x] Inspect the diff for PHI, secrets, unrelated changes, deployment actions, and migration-number conflicts.

No commit, push, migration application, AWS call, or notification delivery is authorized in this slice.

### Task 6: Opaque message and dispatcher core

**Files:**
- Create: `src/workers/triageEmergencyAlertMessage.ts`
- Create: `src/workers/triageEmergencyAlertDispatcherCore.ts`
- Test: `tests/triage/emergencyAlertMessage.test.ts`
- Test: `tests/triage/emergencyAlertDispatcherCore.test.ts`

- [x] Write failing strict-schema tests that reject unknown fields, non-UUID IDs, invalid severity/level, and oversized bodies.
- [x] Implement exact four-field serialization containing only alert/action IDs, severity, and level.
- [x] Write failing dispatcher tests for reminder materialization, deduplication, ten-entry batches, and partial-batch failure.
- [x] Implement the scheduled dispatcher core and run focused tests to green.

### Task 7: Publisher worker core and handler adapters

**Files:**
- Create: `src/workers/triageEmergencyAlertWorkerCore.ts`
- Create: `src/workers/triageEmergencyAlertDispatcher.ts`
- Create: `src/workers/triageEmergencyAlertWorker.ts`
- Test: `tests/triage/emergencyAlertWorkerCore.test.ts`
- Test: `tests/triage/emergencyAlertDispatcher.test.ts`
- Test: `tests/triage/emergencyAlertWorker.test.ts`

- [x] Write failing claim/acknowledgment tests for duplicates, verified suppression, binding mismatch, provider success, provider failure, and persistence uncertainty.
- [x] Implement capped exponential backoff and idempotent delivery keyed by alert ID.
- [x] Implement dependency-injected handlers without sending a real notification in tests.
- [x] Run focused worker tests to green.

### Task 8: Isolated SAM resources and alarms

**Files:**
- Modify: `infrastructure/triage-worker/template.yaml`
- Test: `tests/triage/emergencyAlertInfrastructure.test.ts`

- [x] Write failing static tests for encrypted queue/DLQ, TLS policy, least-privilege publisher/dispatcher functions, one-minute schedule, partial batch responses, and alarms for DLQ, queue age, Lambda errors, and terminal database failures.
- [x] Add isolated emergency-alert resources without changing long-packet resources or deploying the template.
- [x] Run static infrastructure tests and template parsing checks.

### Task 9: Closed-loop critical UI delivery

**Files:**
- Create: `migrations/054_emergency_alert_notification_delivery.sql`
- Create: `src/lib/triage/emergencyAlertNotificationDelivery.ts`
- Create: `src/workers/triageEmergencyAlertDeliveryWorkerCore.ts`
- Create: `src/workers/triageEmergencyAlertDeliveryWorker.ts`
- Create: `src/workers/triageEmergencyAlertDeliveryDispatcher.ts`
- Test: `tests/triage/emergencyAlertNotificationDelivery.test.ts`
- Test: `tests/triage/emergencyAlertDeliveryWorkerCore.test.ts`
- Test: `tests/triage/emergencyAlertDeliveryWorker.test.ts`
- Test: `tests/triage/emergencyAlertDeliveryDispatcher.test.ts`
- Test: `tests/triage/migrations/054_emergency_alert_notification_delivery.test.ts`
- Test: `tests/triage/migrations/054_emergency_alert_notification_delivery.behavior.sql`

- [x] Create one delivery ledger row only after publisher-confirmed sent state.
- [x] Resolve tenant, team, and owner from locked active-action database rows, never from SQS.
- [x] Insert one static critical UI notification and delivery evidence atomically, keyed by alert ID.
- [x] Suppress only after verified handoff/closure; keep reminder cadence independent.
- [x] Persist sanitized retries and immutable terminal failure without resolving the action.
- [x] Add an encrypted FIFO delivery DLQ, partial-batch worker, age/error/DLQ/terminal alarms.
- [x] Add a one-minute opaque recovery sweep for backfill, retry-due, and expired delivery rows.
- [x] Prove lifecycle invariants in disposable PostgreSQL and build the SAM stack locally.
