# Handoff — Emergency-alert notification delivery: SQL type mismatches

**Date:** 2026-07-24
**Repo:** `blondarb/OPSAmplehtml` · **DB:** `ops_amplehtml` on `sevaro-postgres` (acct 873370528823, us-east-2)
**Commit shipped:** `fea4277` on `main` (Amplify auto-deploys from `main`)
**Trigger:** an RDS Postgres error-log audit run from another session

---

## 1. TL;DR

Two SQL type-mismatch bugs meant **zero emergency-alert critical-UI notifications had ever been delivered** — a 100% failure rate on a clinical safety path, running silently for 4 days. Both are fixed and pushed, along with two *latent* instances of the same bug class found in sibling failure paths. No production data was modified.

The single most important open item: **confirm a delivery actually reaches `delivered` after the Amplify build lands.** That had not yet happened at the time this was written.

---

## 2. What was asked

Find the `INSERT`/`UPDATE` writing `notifications` and `triage_emergency_alert_notification_deliveries`, fix the uuid-vs-text mismatch, confirm against real DDL first, and state explicitly whether alerts were silently not delivered.

---

## 3. Root causes (confirmed against live DDL, Postgres 17.9)

### Bug A — `deliverCriticalUiNotification` (ACTIVE, 94 errors/24h)
`INSERT INTO notifications … SELECT` fed `triage_emergency_actions.owner_user_id` (**text**, migration 048) into `notifications.recipient_user_id` (**uuid**, legacy pre-032 base schema — not in `migrations/`).

Postgres does not implicitly cast text→uuid, so this failed at **parse time on every attempt, regardless of the value**. `owner_user_id` is currently NULL, and it still failed — value never mattered.

### Bug B — `failCriticalUiDelivery` (ACTIVE, 94 errors/24h)
```sql
next_attempt_at = CASE WHEN attempt_count < max_attempts THEN $8 ELSE NULL END
```
`$8` appears **only** inside that CASE — nothing else in the statement pins its type. Postgres defaulted it to `text` and rejected assignment to the `timestamptz` column.

**Bug B is the more dangerous of the two:** it means the *failure-recording path was itself broken*. The worker could never mark a delivery `failed`/`terminal_failure`. Rows only died later via lease expiry (`delivery_lease_expired`, "lease expired after retry exhaustion") — which is exactly why the worker looped for four days instead of giving up.

> Note: the sibling `terminal_failed_at = CASE … THEN $4 END` needs no cast — `$4` is already pinned by `updated_at = $4` and `lease_expires_at > $4` in the same statement. Left alone deliberately.

### Why this was never caught
`recipient_user_id` is **never populated by any other code path in the app**. `createNotification()` in `src/lib/notifications.ts` takes a `recipientUserId` param that **no caller anywhere passes**, and `longPacketSafetyEscalation.ts` hardcodes `NULL`. All 147 pre-existing `triage_result` notifications have NULL recipient. The emergency-alert INSERT was the **first and only** code path that ever tried to write a real value into that column — so the type mismatch had no prior opportunity to surface.

---

## 4. Impact — were alerts silently not delivered? **Yes. All of them.**

| Metric | Value |
|---|---|
| Delivery rows | **371** — all `terminal_failure` |
| Ever delivered | **0** (`delivered_at` NULL and `notification_id` NULL on every row) |
| Window | 2026-07-20 01:58 → 2026-07-24 01:48 |
| Distinct emergency actions | **1** |

**Important scoping, so this isn't overstated:** all 371 alerts belong to **one** still-open emergency action (`cdb7bc10-51a5-4a86-a877-ef8854fbdbde`, `triage_session_id 1c307162-…`, `owner_team=neurology_triage`, unclaimed, `owner_user_id` NULL). This is **one clinical event re-alerting ~371 times over four days — not 371 distinct patients with missed alerts.**

It is still a genuine safety failure: that action's critical-UI notification never reached the notification feed, and the escalation has been climbing (now at level 3) with nothing to show for it.

**Cadence clarification:** the ~2-minute cadence visible in the Postgres error log is the *delivery worker's retry loop*, not new alerts. New alerts are created on the *escalation* schedule, currently ~15 min at escalation level 3.

---

## 5. What shipped (`fea4277`)

| # | File | Change | Status before |
|---|---|---|---|
| A | `emergencyAlertNotificationDelivery.ts` (~714) | guarded uuid cast | ACTIVE bug |
| B | `emergencyAlertNotificationDelivery.ts` (~846) | `$8` → `$8::timestamptz` | ACTIVE bug |
| C | `emergencyActionAlertOutbox.ts` (~631) `failEmergencyAlert` | `$8` → `$8::timestamptz` | **LATENT** |
| D | `longPacketDurableWork.ts` (~1818) `failJob` | `$7` → `$7::timestamptz` | **LATENT** |

C and D are the same parameter-inference bug, never yet exercised (zero log hits) but confirmed identically broken by `PREPARE` against the live schema. They would have fired the first time an alert publish or a long-packet job failed.

`triageCompletionPersistence.ts:291` was checked and is **fine** — its CASE unifies against a uuid branch.

### The judgment call in fix A — read this before changing it
```sql
CASE WHEN action.owner_user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     THEN action.owner_user_id::uuid ELSE NULL END
```
**Deliberately not a bare `::uuid`.** `owner_user_id` is unconstrained `text`; the repo's own tests use `'clinician-1'`. A bare cast throws `22P02` at **runtime**, which trades a parse failure for a runtime failure on the same emergency path — no improvement. Verified: `'clinician-1'::uuid` does throw.

This is safe because `recipient_user_id` is nullable **and** `/api/notifications` filters by **tenant only, never by recipient** — so a NULL recipient still surfaces the alert in the feed. Delivering with a NULL recipient beats not delivering.

### Tests
Added 4 SQL-shape regression tests. **Proven non-vacuous** by reverting the source and confirming they fail (4 failed), then restoring (4 passed).

**Why no existing test caught this:** the unit suite mocks the `pg` Pool entirely, so no mocked test can *ever* surface a SQL type error. The only real-SQL test (`tests/triage/migrations/054_….integration.ts`) is a standalone `main()` script requiring `PGHOST` — not wired into vitest or CI.

---

## 6. Verification performed — and its limits

**Done:**
- All 4 patched statements `PREPARE` cleanly against live Postgres 17.9 (extracted from the patched source, not hand-retyped).
- Both original bugs reproduced via `PREPARE` before fixing — exact same error text as the production log.
- Guard behavior verified against real values: passes real Cognito subs (incl. uppercase, normalized), safely NULLs `'clinician-1'` / `'not-a-uuid-at-all'` / NULL without throwing.
- `npx tsc --noEmit` clean · `npm run lint` clean · `npx vitest run tests/triage/` → **1,381 passed / 0 failed**.
- Confirmed the notification's tenant (`default`) matches the feed's filter, so it will be visible.

**NOT done — be explicit about these:**
- **No post-deploy confirmation.** The Amplify build had not been confirmed live, and no delivery had reached `delivered` at time of writing. *This is the #1 follow-up.*
- No dev server / browser verification — the change is background-worker SQL, not previewable.
- No production data modified. No migrations. No backfill.
- The `PREPARE` checks prove the statements **parse**; they do not prove end-to-end delivery succeeds.

---

## 7. Needs another look — prioritized

### P0 — Verify the fix actually works in production
The 371 `terminal_failure` rows are terminal and will **not** self-retry. Recovery depends on the outbox emitting a *new* alert for the still-open action (escalation ~15 min), which then creates a fresh delivery row.
```sql
SELECT status, count(*), count(*) FILTER (WHERE delivered_at IS NOT NULL) AS delivered
FROM triage_emergency_alert_notification_deliveries GROUP BY 1;
```
Expect a row reaching `delivered` with a non-NULL `notification_id`. Also confirm the RDS log stops emitting both error signatures:
```bash
aws rds download-db-log-file-portion --db-instance-identifier sevaro-postgres \
  --region us-east-2 --profile sevaro-sandbox \
  --log-file-name error/postgresql.log.$(date -u +%Y-%m-%d-%H) --output text \
  | grep -c "is of type"
```
If alerting has stopped and no new alert arrives, recovery needs a deliberate decision (see P1).

### P1 — An emergency action has been open and unclaimed for 4 days
Arguably the bigger clinical finding. `cdb7bc10…` has been `status=open`, `owner_user_id=NULL` since 2026-07-20 01:57, escalating to level 3 with no human ever claiming it. Even with delivery fixed, **nothing closes the loop if no one acts on the notification.** Worth asking: is this a real referral or test data? Should an action escalate indefinitely with no terminal state or human-alerting fallback?

### P2 — Decide what to do with the 371 dead rows
Left as-is deliberately — they are an accurate audit record of non-delivery, and rewriting them would destroy evidence. If they should be replayed instead, that is a production data write needing explicit approval and a considered migration.

### P3 — `recipient_user_id` is unenforced *and* unfiltered
No caller ever sets it; the read path never filters on it. "Critical" notifications are effectively **tenant-wide broadcast**. Fine for a POC, but it should be a deliberate decision rather than an accident — especially before PHI (see the standing OPSAmplehtml security gate).

### P4 — No CI guard for this bug class
Mocks structurally cannot catch SQL type errors. Consider a CI job that `PREPARE`s every worker statement against a real schema (ephemeral Postgres + `migrations/`), or wiring the existing `054_….integration.ts` script in properly. The 4 new shape-assertion tests are a stopgap, not a general solution.

### P5 — The guard silently NULLs a malformed owner id
No telemetry when that happens. If a malformed `owner_user_id` ever lands, the alert still delivers (correct) but the recipient quietly disappears with no signal. Consider a log line.

### P6 — Out of scope, found in the same log (different app/DB)
- **75 ×** `relation "rpm_billing_periods" does not exist` from `sevaro_admin@**sevaro_monitor**` — an RPM billing-period close job (`UPDATE … SET status='closed' … eligible_for_99454`) failing every 1–2 min against a missing table. Different database, different app. **Not investigated.**
- **1 ×** `relation "neuro_plans" does not exist`
- **1 ×** `ORDER BY position 3 is not in select list`

Neither of the last two was investigated.

---

## 8. Reproduction / diagnosis commands

```bash
# Pull an hour of RDS error log
aws rds download-db-log-file-portion --db-instance-identifier sevaro-postgres \
  --region us-east-2 --profile sevaro-sandbox \
  --log-file-name error/postgresql.log.2026-07-24-00 --starting-token 0 --output text

# Both original signatures
grep -E "uuid but expression is of type text|timestamp with time zone but expression is of type text"
```

DB creds: Secrets Manager `sevaro/rds/credentials` (us-east-2) — **override the `database` field to `ops_amplehtml`**; the secret's default (`github_showcase`) is a different app's DB. Use `sslmode=require`.

To re-check a statement's types without executing it, wrap it in `PREPARE` — it does full parse/analyze and writes nothing.

---

## 9. Files touched

```
src/lib/triage/emergencyAlertNotificationDelivery.ts   (+14 -4)
src/lib/triage/emergencyActionAlertOutbox.ts           (+1 -1)
src/lib/triage/longPacketDurableWork.ts                (+1 -1)
tests/triage/emergencyAlertNotificationDelivery.test.ts (+76)
tests/triage/emergencyActionAlertOutbox.test.ts         (+29)
tests/triage/longPacketDurableWork.test.ts              (+39)
CLAUDE.md                                               (+1 changelog entry)
```
