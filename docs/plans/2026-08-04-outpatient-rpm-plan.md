# Outpatient RPM — Service Plan

**Date:** 2026-08-04 · **Status:** PLANNED — not started · **Repos:** OPSAmplehtml + SevaroMonitor
**Goal:** turn the isolated wearable stack into an outpatient RPM service attached to the visit: enroll from a signed visit → device pairing → monitoring with alerts flowing into the existing notification/escalation infra → review workflow → (later, gated) billing. Closes flow #8 on `docs/patient-flow.html`.

## Current state (verified 2026-08-04)

**What exists**

- SevaroMonitor: 4 Lambdas (`sevaro-monitor-api`, `sevaro-webhook-receiver`, `sevaro-device-sync`, `sevaro-token-refresh`) at `https://3eyoktd935.execute-api.us-east-2.amazonaws.com`; tables `wearable_*`, `vitals_readings`, `glucose_readings`. Apple Watch/HealthKit hourly snapshots + daily summaries; task assessments (tremor, tapping, fluency, spiral, gait, foot-tap; 0–100 composite); Withings/Oura webhooks + Dexcom polling; clinically sensible threshold logic (BP, SpO₂, temp, HR, glucose) writing `wearable_critical_events`.
- OPSAmplehtml: `/rpm` + `/wearable` dashboards (server-side proxy with a held key), `patient_wearable_links` + manual `POST /api/wearable/link`, and a **wired notification path**: `POST /api/wearable/events` → `wearable_anomalies` → `notifyWearableAlert()` (`src/lib/notifications.ts:301-322`; source type `wearable_alert` already exists).
- Reusable comms: the follow-up agent's Twilio client (`src/lib/follow-up/twilioClient.ts`), session model, and escalation tiers (`urgent` / `same_day` / `next_visit` / `informational`).

**What's missing or broken (why RPM is isolated on the diagram)**

1. **No enrollment concept anywhere** — "enroll" has zero hits in either repo. Closest artifacts: `wearable_patients.monitoring_start_date` and auto `ensureBillingPeriod()` on OAuth connect.
2. **Identity gap:** `wearable_patients` is initials + DOB + a UUID cached in the iOS app's UserDefaults — no login, no recovery, no auto-link to `patients`. Linking is a manual API call.
3. **Two redundant event pipelines** in the same DB: Lambda-written `wearable_critical_events` vs OPSAmple-written `wearable_anomalies`/`wearable_alerts`. Also `/api/rpm/alerts/route.ts` reads `wearable_critical_events` through the **default** DB pool rather than `wearableFrom()` — likely wrong-database bug; verify at runtime.
4. **Billing schema fiction:** code queries `rpm_billing_periods` + `device_daily_readings`; **neither exists**. An empty `wearable_billing_periods` does. Standing decision (SevaroMonitor `CLAUDE.md:62-64`, `sevaro-device-sync/index.mjs:320-339`): **do NOT rename** — renaming silences the error while `days_with_data`/`eligible_for_99454` silently never compute. `RPM_BILLING_ENABLED=false` gates device-sync only; webhook-receiver's `recordDailyReading()` is **unguarded** (inert today solely because `wearable_device_sources` has 0 rows).
5. **Security is not PHI-ready:** one shared static API key for all callers (`sevaro/monitor-api-key`), CORS `*`, webhook receiver has **no auth or HMAC verification**, DB rides the shared internet-exposed RDS, and `/wearable` shows hardcoded name fallbacks while self-declaring "not HIPAA-compliant… demonstration purposes only" (`wearable/page.tsx:568`).

## Plan

### Phase 1 — Enrollment: make the visit the front door

- New `rpm_enrollments` table (ops_amplehtml): `patient_id`, `visit_id`, ordering physician (physicianEmail), condition/program, `consent_at`, `status` (active/paused/ended), `monitoring_start_date`.
- **"Enroll in RPM" action on the signed visit** — explicit, alongside (not inside) the automatic follow-up trigger in `sign/route.ts`.
- **Pairing-code device linking** to close the identity gap: enrollment pre-creates the `wearable_patients` row (`POST /patients`) and issues a short-lived pairing code; the iOS SetupView gains an "I have a code" step that claims that row instead of creating an orphan. `patient_wearable_links` is written at claim time. Replaces the manual `/api/wearable/link` path.
- Consent capture at enrollment (also the CPT 99453 prerequisite).

### Phase 2 — One alert pipeline into the existing notification stack

- **Reconcile the two event paths:** Lambdas (webhook-receiver, device-sync) forward threshold events server-to-server to OPSAmple `POST /api/wearable/events`, making `wearable_anomalies` → `notifyWearableAlert()` the single clinical-facing path; `wearable_critical_events` remains the device-side raw log. Fix the `/api/rpm/alerts` wrong-pool bug as part of this.
- Map alert severities onto the follow-up escalation tiers. Critical alerts always notify the **ordering physician from the enrollment record**; optionally they can seed a follow-up-agent SMS outreach to the patient (existing Twilio infra). No automated clinical action.
- `/rpm` becomes enrollment-scoped: real patient names via `patients` ⋈ `patient_wearable_links` (removes the hardcoded name fallbacks), filtered to active enrollments.

### Phase 3 — Billing (gated, later)

- Create the schema the code already expects: `rpm_billing_periods` + `device_daily_readings` (supersedes the empty `wearable_billing_periods` and resolves the standing mismatch without the forbidden rename).
- Keep `RPM_BILLING_ENABLED=false` until: schema exists, webhook-receiver gets the same guard device-sync has, and the 16-day/99454 logic validates against seeded data. 99457/99458 (review minutes) come from time logging in the Phase-2 review surface — build only after 99454 is trustworthy.

### Security gate — HARD prerequisite before any real patient enrolls

Same posture as the sdne-dashboard/OPSAmple gates. RPM data is PHI the moment enrollment is real.

- Per-device tokens issued at pairing (replace the single shared API key); CORS lockdown.
- HMAC/signature verification on provider webhooks.
- Isolated DB credentials (shared internet-exposed RDS gate).
- Remove hardcoded real-name display fallbacks (`wearable/patients/route.ts:45`, `wearable/demo-data/route.ts:219`).
- The demo disclaimer stays up until this gate passes.

## Decisions (recommendations adopted per auto-approval policy; veto async)

- **D1:** pairing-code identity model, not full patient auth in the iOS app — adopted (smallest closure of the identity gap).
- **D2:** single clinical alert path = `wearable_anomalies` + `notifyWearableAlert()` — adopted (it's the one already wired to notifications).
- **D3:** alerts notify + optionally trigger follow-up outreach; no automated clinical action — adopted.
- **Open — needs Steve, not recommendation-grade:** (a) initial target conditions + device set for the outpatient program; (b) who owns the RPM review queue day-to-day (MA vs physician vs care team).

## Acceptance criteria

- **P1:** enrolling from a signed visit yields a linked, consented enrollment; a fresh iOS install with a pairing code lands data attributed to the correct patient with zero manual link calls.
- **P2:** a threshold breach on any provider path produces exactly one notification, attributed to the right patient and ordering physician; `/rpm` lists only enrolled patients with real names.
- **P3:** with seeded 16-day data, a billing period computes `eligible_for_99454` correctly; nothing billing-related fires while the flag is off.
