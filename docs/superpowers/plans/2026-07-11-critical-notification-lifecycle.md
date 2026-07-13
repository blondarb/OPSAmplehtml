# Critical Emergency Notification Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` or
> `superpowers:executing-plans` and implement each task test-first.

**Goal:** Keep every durable emergency notification visible and actionable until
its authoritative emergency action is closed, with safe tenant-scoped navigation
to the linked triage session.

**Safety invariant:**
`triage_emergency_alert_notification_deliveries.notification_id ->
emergency_action_id` is the authoritative binding. Mutable notification metadata
must never decide whether a notification is protected. For a linked action in
`open`, `attempting_contact`, `failed`, or `handed_off`, only `read` and `unread`
notification states are permitted; snooze, dismiss, action, or delete must fail.
Closing the action atomically transitions the linked notification to `actioned`.
Opening a notification must never claim, hand off, or close an action.

**Deployment constraint:** Database enforcement must be deployed before any UI
that depends on it. Migration 055 requires migrations 053 and 054. Confirm the
live notification column types and `snoozed_until` definition before authoring or
applying it; the original notifications migration is not present in this
checkout. No production migration or deployment is authorized by this plan.

---

### Task 1: Prove the database lifecycle invariant

**Files:**

- Create: `tests/triage/migrations/055_critical_notification_lifecycle.test.ts`
- Create: `tests/triage/migrations/055_critical_notification_lifecycle.behavior.sql`
- Create: `tests/triage/migrations/run-055-behavior.sh`
- Create: `migrations/055_critical_notification_lifecycle.sql`

- [ ] Write failing static and disposable-PostgreSQL tests for open,
      attempting-contact, failed, handed-off, and closed actions.
- [ ] Prove direct SQL snooze, dismiss, action, or delete fails while the action
      is not closed; idempotent read remains allowed.
- [ ] Prove action closure changes the same notification to `actioned`, clears
      `snoozed_until`, and prevents a late read from resurrecting it.
- [ ] Backfill `patient_id` from the tenant-bound triage session.
- [ ] Restore prematurely hidden notifications to `unread` when the linked
      action is still not closed.
- [ ] Preserve the immutable delivery ledger and one-notification-per-alert
      constraints.
- [ ] Exercise read/close races, replay, delete attempts, and backfill behavior.

### Task 2: Add an authoritative notification store

**Files:**

- Create: `src/lib/notifications/notificationFeedStore.ts`
- Create: `src/lib/notifications/__tests__/notificationFeedStore.test.ts`

- [ ] Return `critical_ui`, `emergency_action_open`, action status/action ID,
      triage session ID, and patient ID from ledger/action/session joins.
- [ ] Never infer protection from `metadata.critical_ui`; preserve the existing
      text/UUID compatibility using `notification.id::text` where required.
- [ ] Add `include_open_critical=true`, returning every open critical row before
      applying the ordinary feed limit even when its status is `read`.
- [ ] Make multi-row transitions atomic: if any target is open-critical, reject
      a destructive batch without partially updating ordinary notifications.
- [ ] Return a controlled `409` reason such as `emergency_action_open` without
      disclosing cross-tenant existence.

### Task 3: Harden the notification API

**Files:**

- Modify: `src/app/api/notifications/route.ts`
- Create: `src/app/api/notifications/__tests__/routeSafety.test.ts`

- [ ] Prove `read` succeeds for an open critical row.
- [ ] Prove `snoozed`, `dismissed`, `actioned`, and delete return `409` while
      its action remains not closed.
- [ ] Prove mixed batches do not partially update.
- [ ] Prove a late read cannot change a closure-driven terminal state.
- [ ] Prove read-but-open critical rows remain in the special feed.
- [ ] Derive session/action/patient bindings from authoritative joins only.

### Task 4: Correct delivery and remove duplicate emergency notifications

**Files:**

- Modify: `src/lib/triage/emergencyAlertNotificationDelivery.ts`
- Modify: `tests/triage/emergencyAlertNotificationDelivery.test.ts`
- Modify: `tests/triage/migrations/054_emergency_alert_notification_delivery.behavior.sql`
- Modify: `tests/triage/migrations/054_emergency_alert_notification_delivery.integration.ts`
- Modify: `src/lib/triage/processTriageInBackground.ts`
- Modify: `src/app/api/triage/extract/route.ts`
- Modify: `src/app/api/ai/historian/save/route.ts`
- Modify: related background and route tests

- [ ] Insert the tenant-bound session `patient_id`, not `NULL`, into the durable
      critical notification.
- [ ] Stop emitting a second generic critical notification on paths that already
      create a durable emergency action.
- [ ] Retain generic urgent/same-day notifications for workflows with no
      emergency action.

### Task 5: Make the cockpit preserve critical intent

**Files:**

- Create: `src/lib/notifications/notificationFeedModel.ts`
- Create: `src/lib/notifications/__tests__/notificationFeedModel.test.ts`
- Prefer create: `src/components/home/NotificationCard.tsx`
- Prefer create: `src/components/home/__tests__/NotificationCard.test.ts`
- Modify: `src/components/home/NotificationFeed.tsx`
- Modify: `src/components/PhysicianHome.tsx`
- Modify: `src/components/ClinicalNote.tsx`
- Modify: `src/hooks/useNotificationCounts.ts`

- [ ] On critical primary action, send only idempotent `status: read`, never
      remove the row, and navigate in a `finally` path to
      `/triage?session_id=<encoded-server-session-id>`.
- [ ] Use the authoritative `patient_id` for patient navigation and omit the
      patient link when none exists.
- [ ] Replace hard-coded badges with authoritative active/needs-attention counts
      that include read-but-open critical rows.
- [ ] Remove automatic synthetic fall/seizure substitution. A successful empty
      response renders an empty state; a failed response visibly reports
      unavailable/stale data while retaining last-known critical rows.
- [ ] If synthetic mode is retained, require an explicit flag and visibly label
      the entire feed as synthetic.

### Task 6: Add tenant-scoped triage deep links

**Files:**

- Create: `src/lib/triage/linkedSessionClient.ts`
- Create: `src/lib/triage/__tests__/linkedSessionClient.test.ts`
- Create: `src/components/triage/LinkedEmergencyHold.tsx`
- Create: `src/components/triage/__tests__/LinkedEmergencyHold.test.ts`
- Modify: `src/app/triage/page.tsx`
- Modify: `src/lib/triage/types.ts`

- [ ] Accept only an opaque `session_id` query value; never accept a tenant ID.
- [ ] Load `/api/triage/<session_id>` with `cache: no-store` and rely on the
      server's active membership and tenant binding.
- [ ] Render the emergency action immediately for pending or model-error
      sessions, poll pending results, then transition to `TriageOutputPanel`.
- [ ] Treat cross-tenant and nonexistent sessions identically.
- [ ] Abort polling on unmount and prevent duplicate Strict Mode loops.
- [ ] Keep manual-hold language and the action panel visible if outpatient
      scoring fails.

### Task 7: Accessibility, documentation, and verification

**Files:**

- Modify: notification drawer/card components and accessibility tests
- Modify: `docs/API_CONTRACTS.md`
- Modify: `docs/IMPLEMENTATION_STATUS.md`
- Modify: `docs/CONSOLIDATED_ROADMAP.md`
- Modify: `docs/CHANGELOG.md`
- Modify: `CLAUDE.md`
- Modify: `qa/TEST_CASES.yaml`

- [ ] Make the drawer a labelled modal dialog with focus entry, focus trap,
      Escape/close behavior, and focus restoration.
- [ ] Ensure a closed drawer is not focusable; give critical cards stable
      landmarks/headings, descriptive actions, and visible keyboard focus.
- [ ] Use `role=alert` for unavailable or missing-binding failures without
      re-announcing every polling interval.
- [ ] Test reload/back retention, multi-tab races, closure disappearance,
      pending/error deep links, cross-tenant denial, patient linkage, empty live
      feeds, 375px layout, keyboard-only use, and screen-reader labels.
- [ ] Run focused tests, disposable database behavior tests, type checking,
      focused lint, `git diff --check`, and independent spec/code-quality review.

### Authorization decision for non-managing roles

Before UI completion, resolve one policy detail: notification reads currently
allow scheduler/viewer roles while emergency-action reads are clinician/admin
only. The preferred design is a minimal tenant-member read-only action-status
view with mutations still restricted to clinician/admin; non-managing roles
should see a clear “contact clinical triage” state. Do not silently grant them
full emergency-action detail or mutation rights.

