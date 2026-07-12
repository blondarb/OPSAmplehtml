# API Authorization and Clinical-State Safety Audit

**Date:** 2026-07-11  
**Scope:** Repository route-level authorization, tenant isolation, destructive
operations, clinical-state mutation, credential minting, and avoidable AI cost
amplification.  
**Data used:** Source code, tests, PHI-free synthetic requests, and read-only AWS
configuration metadata. No patient data was accessed.  
**Deployment state:** This document records local worktree findings and planned
remediation. It does not authorize or claim a production deployment.

## Executive finding

`src/middleware.ts` exempts `/api/*`, so every API handler must establish its
own authorization boundary. `getUser()` proves only a Cognito identity;
`getTenantServer()` supplies a configured tenant value; neither proves active
tenant membership or clinical role. The current reusable boundary is
`authorizeClinicalAccess()`, which verifies an active server-side membership,
derives the tenant from that membership, and fails closed when the authorization
store is unavailable.

The review found multiple legacy routes that either had no authorization at all
or accepted any authenticated Cognito user without tenant-membership checks.
The most urgent destructive route, `/api/demo/reset`, could delete broad
clinical data without tenant predicates. A read-only Amplify branch inspection
showed `DEMO_ENDPOINTS_ENABLED=true`; no live endpoint was invoked. Both reset
routes are now retired in the local worktree, but production remains unchanged
until an explicitly approved deployment.

## Completed local containment

- `POST /api/demo/reset` and `POST /api/admin/reset-demo` always return a fixed
  `410 Gone` response with `Cache-Control: no-store`.
- The handlers cannot parse a body or reach authentication, feature flags,
  tenant lookup, secrets, or database code.
- ClinicalNote reset behavior/modal, dormant TopNav reset capability, and stale
  onboarding copy are removed.
- Focused isolation and production-source regression tests are present.
- Future synthetic resets must be an approval-gated operator workflow outside
  the web application.

## Completed local retirement: unused public clinical prototypes

Repository text and TypeScript-AST tracing found no production caller for these
handlers. They now return fixed `410 Gone`/`no-store` responses in the local
worktree. Retiring them is safer than preserving incomplete schemas and
workflows under a thin authentication wrapper. Production remains unchanged
pending an explicitly approved deployment.

| Route family | Unsafe behavior | Decision |
|---|---|---|
| `/api/ai/historian/escalation` | Anonymous red-flag state injection by bare consult ID; caller controls severity/tier/confidence; bypasses the durable closed-loop emergency workflow | Permanently retire; superseded by authorized historian save plus emergency-action workflow |
| `/api/provider-messages` and `/threads` | Anonymous PHI reads, sender impersonation, arbitrary participant/patient binding, cross-tenant state mutation | Retire pending a normalized, participant-authorized communications subsystem |
| `/api/consults` | Anonymous PHI/state reads and writes; requester/recipient impersonation; PATCH by bare ID | Retire pending a role-, participant-, and transition-authorized redesign |
| `/api/incomplete-docs` | Anonymous patient/note exposure; unscoped joins; browser GET creates duplicate notification side effects | Retire; replace later with an authenticated read and separate idempotent service job |

Do not drop the associated tables or historical rows. In particular,
`red_flag_events` remains a report input.

## Remaining high-risk batches

### 1. Demo seed and diagnostic surfaces

- Arbitrary `/api/demo/seed` payloads can create patients, medications,
  allergies, visits, signed notes, diagnoses, imaging, and appointments for any
  Cognito identity while the demo flag is enabled.
- Phrase, plan, and triage-validation seed routes are feature-gated but do not
  prove active admin membership or an explicitly configured demo tenant.
- `/api/diagnostic` exposes schema/configuration state and performs database
  probes; `/api/follow-up/twilio-status` publicly probes secret-backed
  configuration.

Preferred containment: retire unused arbitrary seed/diagnostic handlers. For a
fixed-data seed that has a real UI caller, require an active admin membership,
an explicit configured demo tenant equal to the authoritative membership
tenant, strict idempotency, bounded inputs, audit evidence, and no response
containing raw infrastructure errors.

### 2. Critical emergency notifications

The current cockpit marks every notification `actioned` and removes it when its
primary destination is opened, even if the linked emergency action remains
open. It also discards authoritative session/action/patient bindings and falls
back to synthetic critical rows when live results are empty or fail.

Required invariant: the immutable delivery ledger binds the notification to the
emergency action. Until the action is `closed`, database triggers and the API
must permit only `read`/`unread`; snooze, dismiss, action, and delete must fail.
Closing the action atomically changes the notification to `actioned`. Opening a
notification marks it read, keeps it visible, and navigates to a tenant-scoped
`/triage?session_id=...` view. See
`docs/superpowers/plans/2026-07-11-critical-notification-lifecycle.md`.

### 3. Wearable and remote-patient-monitoring routes

Public ingestion/read/analyze routes permit cross-patient observation or
narrative poisoning, and the RPM proxy can act as a confused deputy using the
server's Monitor credential for caller-selected operations, including device
and webhook mutations.

Required design: authenticated tenant-bound patient/device enrollment,
purpose-specific service credentials, signed and replay-protected ingestion,
strict operation allowlists, patient ownership checks on every read/write,
idempotency, bounded payloads, audit events, and per-principal distributed rate
limits. Do not expose a general credentialed proxy.

### 4. Visits and legacy clinical CRUD

Visits, historian import, medications, allergies, scales, chart preparation,
draft response, and wearable linking contain paths that use only `getUser()` or
a static tenant and do not prove row-level tenant/patient ownership.

Required design: authorize before parsing, use the membership-derived tenant,
bind every row and join to that tenant, validate patient/visit/consult
relationships transactionally, enforce role-specific transitions, use strict
schemas and optimistic concurrency, and emit PHI-minimized audit events.

### 5. AI credential and cost-amplification routes

Public or weakly authorized routes can mint OpenAI Realtime credentials, invoke
Bedrock chat, return presigned AWS capabilities, or rerun validation with
caller-controlled model choices.

Required design: purpose-limited capability or active clinical membership,
server-selected model registry, exact allowed operation, distributed rate and
budget limits, concurrency limits, body/token/document bounds, no arbitrary
model override, short capability TTL, and usage/latency/cost/safety telemetry.

## Reintroduction requirements for retired workflows

### Provider consults

- Clinician/admin route access plus requester-or-recipient authorization;
  administrative role alone must not automatically expose message content.
- Derive requester identity server-side and verify recipient active membership
  in the same tenant.
- Verify optional patient binding and every status transition transactionally.
- Recipient may review/answer; requester may close; use strict enums, UUIDs,
  length limits, optimistic concurrency, and append-only audit events.

### Provider messaging

- Normalize thread participants into a tenant/thread/user membership table.
- Derive sender identity/display server-side; verify all participants and
  optional patient links against the same tenant.
- Require both route role and thread participation for content access.
- Keep message bodies out of audit metadata.

### Incomplete documentation

- Clinicians see only their assigned visits; admins may see the tenant.
- Tenant-scope notes, visits, patients, and every join.
- Browser GET remains read-only.
- Generate reminders in a separate service-authenticated job with idempotency by
  tenant, source, and issue lifecycle.

The legacy historian escalation route should not be reintroduced.

## Verification and release gates

1. Route-level tests prove unauthenticated, inactive-membership, wrong-role,
   cross-tenant, malformed-input, duplicate/replay, and authorization-store
   failure behavior.
2. Disposable PostgreSQL tests prove tenant and lifecycle invariants under
   concurrent/racing updates; browser behavior is not the only safety layer.
3. Focused tests, TypeScript, lint, build, and `git diff --check` pass; known
   unrelated full-suite failures are documented rather than hidden.
4. Synthetic adversarial cases cover both clinical under-triage and operational
   abuse. No PHI enters fixtures, logs, queues, prompts, or commits.
5. An independent spec review and code-quality/security review find no critical
   or important gaps.
6. Before deployment, produce the exact ordered database, IAM/secrets,
   application, and rollback change set. Database guards precede dependent UI.
7. Obtain explicit approval before any AWS configuration, secret, migration,
   deployment, deletion, or other live mutation.
