# Durable Long-Packet Progress Read Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Return and display tenant-isolated, aggregate-only durable long-packet progress while extraction remains pending, without exposing PHI or durable-work internals.

**Architecture:** A focused PostgreSQL reader uses one aggregate query rooted in a tenant-bound pending long-packet extraction. The polling route conditionally serializes the validated snapshot; the polling client validates it again before callbacks; pure UI formatting presents only clinician-facing counts/status.

**Tech Stack:** Next.js App Router, TypeScript, node-postgres, Vitest, React state, existing async polling helper.

**Source design:** `docs/superpowers/specs/2026-07-11-long-packet-progress-read-design.md`

---

## Task 1: Aggregate-only progress reader

**Files:**
- Create: `src/lib/triage/longPacketProgressRead.ts`
- Create: `tests/triage/longPacketProgressRead.test.ts`

- [x] **Step 1: Write failing service tests**

Require `readLongPacketProgress(pool, { extractionId, tenantId })` to return the documented aggregate, use one query with both bindings, select no result/lease/job identifiers, return `null` for no row, and throw a sanitized error for database failure or malformed/inconsistent completion.

- [x] **Step 2: Verify RED**

Run `npx vitest run tests/triage/longPacketProgressRead.test.ts`; expect failure because the service module does not exist.

- [x] **Step 3: Implement strict reader**

Add `LongPacketProgress`, bounded status/count validation, complete-run consistency, and one CTE query selecting the latest primary run for the tenant-bound pending long-packet extraction. Catch unknown persistence errors and throw `LongPacketProgressReadError` without database detail.

- [x] **Step 4: Verify GREEN**

Run the focused service test; expect every valid/no-run/error/isolation assertion to pass.

## Task 2: Pending extraction route integration

**Files:**
- Modify: `src/app/api/triage/extract/[id]/route.ts`
- Modify: `src/app/api/triage/extract/[id]/__tests__/routeSafety.test.ts`

- [x] **Step 1: Write failing route tests**

Mock `getPool` and the progress reader. Require the service call only for `status=pending` plus `ingestion_mode=long_packet`, exact tenant/extraction propagation, exact `long_packet_progress` shape, no IDs/payloads, and omission on `null` or reader error.

- [x] **Step 2: Verify RED**

Run the route test; expect the progress field/service call assertions to fail.

- [x] **Step 3: Implement route integration**

Call the progress reader after the already tenant-bound extraction query. Catch reader failures with a generic log message; do not modify extraction status or infer completion. Serialize only documented fields.

- [x] **Step 4: Verify GREEN**

Run the route test; expect auth, tenant isolation, terminal response, and progress cases to pass.

## Task 3: Poll callback and runtime validation

**Files:**
- Modify: `src/lib/triage/pollClient.ts`
- Modify: `src/lib/triage/__tests__/pollClient.test.ts`

- [x] **Step 1: Write failing polling tests**

Require `PollOptions.onProgress` to receive a frozen/read-only valid aggregate on pending polls and `null` for missing or invalid aggregates. Confirm no callback changes terminal completion/error behavior.

- [x] **Step 2: Verify RED**

Run `npx vitest run src/lib/triage/__tests__/pollClient.test.ts`; expect missing `onProgress` behavior.

- [x] **Step 3: Implement parser and callback**

Export the progress type and a strict parser. On every pending poll call `onProgress` with the parsed snapshot or `null`; do not call it on terminal payloads.

- [x] **Step 4: Verify GREEN**

Run polling tests and confirm all start/progress/terminal cases pass.

## Task 4: Concise page and batch progress display

**Files:**
- Create: `src/lib/triage/longPacketProgressView.ts`
- Create: `tests/triage/longPacketProgressView.test.ts`
- Modify: `src/lib/triage/types.ts`
- Modify: `src/app/triage/page.tsx`
- Modify: `src/components/triage/BatchResultsPanel.tsx`

- [x] **Step 1: Write failing formatter tests**

Require mapping/safety counts, active leases rendered as `active`, failures rendered as `awaiting retry/review`, all chunks complete rendered as finalizing, and failed runs rendered as human-review wording. Assert output does not contain `job`, `lease`, `run id`, model names, or source data.

- [x] **Step 2: Verify RED**

Run `npx vitest run tests/triage/longPacketProgressView.test.ts`; expect missing formatter failure.

- [x] **Step 3: Implement formatter and page wiring**

Store progress for primary extraction, clear it on cancel/reset/terminal/error, pass the formatter output through `TriageInputPanel.loadingMessage`, and attach per-item derived labels during batch extraction. Extend `BatchItem` with the label only and display it beside processing status.

- [x] **Step 4: Verify GREEN**

Run formatter, polling, route, and service tests together.

## Task 5: Documentation and verification

**Files:**
- Modify: `docs/superpowers/specs/2026-07-11-long-packet-progress-read-design.md` only if implementation differs materially.

- [x] **Step 1: Run full verification**

Run:

```bash
npx vitest run tests/triage/longPacketProgressRead.test.ts src/app/api/triage/extract/[id]/__tests__/routeSafety.test.ts src/lib/triage/__tests__/pollClient.test.ts tests/triage/longPacketProgressView.test.ts
npx vitest run tests/triage
npx tsc --noEmit
npm run lint -- src/lib/triage/longPacketProgressRead.ts src/lib/triage/longPacketProgressView.ts src/lib/triage/pollClient.ts src/app/api/triage/extract/[id]/route.ts src/app/triage/page.tsx src/components/triage/BatchResultsPanel.tsx tests/triage/longPacketProgressRead.test.ts tests/triage/longPacketProgressView.test.ts src/lib/triage/__tests__/pollClient.test.ts src/app/api/triage/extract/[id]/__tests__/routeSafety.test.ts
git diff --check
```

Expected: all focused and triage tests, typecheck, lint, and whitespace checks exit 0. No AWS call, deploy, commit, push, schema change, PHI, result payload, or durable internal identifier is introduced.
