# Security & Production-Readiness Audit — OPSAmplehtml — 2026-07-12

First in-repo audit of this repo (no prior baseline). Run via the `security-audit` skill: three parallel reviewers (auth/IDOR + PHI-logging; scalability + reliability; silent-failure hunt) plus deterministic pattern checks. PHI-bearing threat model (strict). Deployed at app.neuroplans.app (Amplify `d3ietjwgco4g2t`, us-east-2; RDS `ops_amplehtml`).

## ⚠️ Headline

**There is no platform-level auth on the API.** `src/middleware.ts:66-70` explicitly exempts every `/api/*` path from its Cognito gate, so each of the 135 route handlers is solely responsible for calling `getUser()` / `authorizeClinicalAccess()`. A large share of the clinical routes don't — many `import { getUser }` and never call it (dead import). The result: the entire Phase-1 clinical pipeline (neuro-consults, AI historian, patient portal, follow-up, wearable/RPM, provider messaging, notifications) is reachable **unauthenticated by GUID alone**.

**The critical judgment call is data, not code**: is real patient data in the deployed `ops_amplehtml` DB today, or is it still POC/synthetic (as the app's own `// demo app` comments and `DEMO_TENANT` single-tenant model suggest)? The code exposure is confirmed and independently corroborated by two reviewers; the *blast radius* depends on that answer.

> **RESOLVED 2026-07-12 (Steve): NO PHI — POC/demo surfaces only.** Disposition therefore = **DEFERRED, HARD GATE BEFORE REAL PHI**: none of the below are live breaches today, but the auth net must land *before* any route is pointed at real patient data or promoted to production clinical use. Nothing was changed — this is a report. Two zero-risk fixes are worth doing regardless (`ALLOW_ALL_ADMIN=false`; kill the `/api/appointments` DB-fail→fake-PHI fabrication — a physician-facing bug independent of PHI).

The raw "38 critical" auth count is **one systemic root cause** (no auth net + dead `getUser` imports) manifesting across ~38 routes. Remediation is a handful of per-route-family PRs adding the guard the repo *already has* (`getUser()` + `authorizeClinicalAccess()` are used correctly elsewhere), not 38 separate designs.

## Severity summary (deduped across reviewers)

| Bucket | Critical | High | Medium | Low |
|---|---|---|---|---|
| Auth / IDOR | 38 | 11 | 4 | 0 |
| Scalability | 1* | 5 | 3 | 2 |
| Reliability / silent-failure | 1* | 6 | 3 | 1 |
| Deterministic (headers/ops/PHI-log) | 0 | 4 | 4 | 0 |

\* the `/api/appointments` finding is one route flagged by two reviewers (unauth + PHI-dump + demo-data fabrication) — counted once.

## Section 1 — Auth & IDOR (systemic)

### S1 — CRITICAL: `/api/*` has no platform auth net
`src/middleware.ts:67,70` — `isApi = pathname.startsWith('/api/')` short-circuits the redirect, by design for token/cookie APIs, but nothing replaces it. Every route must self-gate. **Fix:** keep the exemption but add a default-deny wrapper (`withAuth(handler)`) that route families opt out of explicitly (webhooks, Clara test gate, flagged demo), inverting the current default-open posture.

### S2 — CRITICAL: entire Phase-1 clinical pipeline unauthenticated
Routes read/write consults, red-flag events, differential Dx, clinical scales, and full interview transcripts by GUID with **zero** auth. Confirmed no `getUser` import: `neuro-consults/route.ts`, `neuro-consults/[id]/{route,historian-context,initiate-intake,report,sdne}`, `ai/historian/{session,escalation,localizer,scales,save}`, `patient/{context,tools,messages,intake,patients,messages/draft(GET)}`, `follow-up/{message,[id]/summary,analytics,billing,billing/export,from-visit}`, `provider-messages/{route,threads}`, `notifications`, `consults`, `incomplete-docs`, `wearable/{events,hourly,patients,demo-data,analyze,analyze-assessment}`, `rpm/{alerts,vitals,glucose,devices,billing,webhooks}`. **Fix:** add `getUser()`/`authorizeClinicalAccess()` at the top of each handler (pattern already correct in `/api/triage/*`, `command-center/*`, `wearable/link`).

### S3 — CRITICAL: unauthenticated bulk PHI/financial export
`follow-up/billing/export/route.ts:5` streams a full CSV of every patient's billing entries for a month to any caller. Siblings `follow-up/analytics`, `follow-up/billing`, `patient/intake` (GET), `patient/messages` (GET), `incomplete-docs` return tenant-wide PHI lists unauthenticated. **Fix:** auth-gate; these are one-shot exfil endpoints.

### S4 — CRITICAL: unauthenticated wearable/RPM writes trigger real clinical alerts
`wearable/events` and `wearable/hourly` accept fabricated critical-anomaly events / biometrics for any `patient_id` (POST, `getUser` imported but never called) → fire real provider notifications + feed AI narratives. The six `rpm/*` routes are confused-deputy proxies forwarding caller input to a privileged upstream via `getMonitorApiKey()` with no caller auth. **Fix:** device API-key/HMAC on ingest; `getUser()` before proxying.

### S5 — CRITICAL: IDOR on follow-up session writes
`follow-up/message/route.ts:13` uses body-supplied `session_id` directly as an UPDATE key — a caller can overwrite another patient's follow-up conversation. **Fix:** verify session ownership before write.

### S6 — HIGH: `ALLOW_ALL_ADMIN = true` (confirmed)
`feedback/route.ts:10` and `feedback/admin/route.ts:9` — any authenticated user can add/remove admins and read the internal AI system-prompt inventory. Real, `TODO: set to false` left in. **Fix:** flip to `false`; the real `SEED_ADMIN_EMAIL`/`FEEDBACK_ADMIN_EMAILS` role checks already exist below the short-circuit.

### S7 — HIGH: identity spoofable from request body
`provider-messages` (`sender_id`), `consults` (`requester_id`), `patient/messages` (`patient_id`/`patient_name`) trust body-supplied identity. **Fix:** derive actor from session.

### S8 — HIGH: patient-lookup enumeration oracle
`patient/lookup/route.ts:12` — name+DOB → `patient_id`, no rate limit/lockout; and `patient/context` doesn't re-verify the caller owns the id it was handed. **Fix:** rate-limit + bind downstream reads to a patient-scoped session token.

Full per-route list (38C/11H/4M) in the reviewer output; remaining Mediums are the process-wide `DEMO_TENANT` (no real tenant isolation) and the `admin/reset-demo` body-supplied `tenant_id` delete scope (flag+secret gated today).

## Section 2 — PHI in logs (HIGH)

- `ai/transcribe/route.ts:80` and `ai/visit-ai/route.ts:111-112` — `console.log` of 200–300 chars of raw dictation/visit transcript. **Fix:** remove or debug-gate; never log transcript content.
- `follow-up/send-sms/route.ts:109` — logs recipient phone in plaintext (mask to last 4).
- `services/nova-sonic-relay/src/novaSonicSession.ts:113` — `RELAY_TRACE_RAW=1` logs verbatim speech text (opt-in). **Fix:** redact the text field like the audio byte-count path.

## Section 3 — Scalability (HIGH unless noted)

- **CRITICAL** `appointments/route.ts:71,110-121` — unauthenticated **and** unbounded: no-filter GET runs `SELECT … appointments ⋈ patients ⋈ visits ⋈ clinical_notes` with no WHERE/LIMIT → full PHI-table dump.
- `feedback/route.ts:54` and root cause `db-query.ts:336` — the shared query builder adds no default `LIMIT`; every unchained `.select()` is a silent full scan. **Fix:** default `LIMIT` in the builder (opt-out), matching the always-paginate posture.
- `bedrock.ts:676` `retrieveChunksFromKB` — no `AbortSignal`; caller's `Promise.race` returns but never cancels the Bedrock/OpenSearch call (orphans under load). Historian live path.
- **16 clinician-facing AI routes** call `invokeBedrock` with no timeout. **Fix:** wrap in the existing `runClinicalModelWithTimeout()` (already proven in 5 routes) — mechanical rollout.
- `db.ts:17,35` pools `max:5` reused verbatim by 6 SAM Lambda workers → dozens-hundreds of RDS connections under concurrency. **Fix:** RDS Proxy or drop Lambda pool `max` to 1-2.
- `secrets.ts:32` — `getSecret(id, maxAgeMs?)` caches **forever** when `maxAgeMs` omitted; every caller omits it (RDS/Cognito/OpenAI/Deepgram/Twilio/Monitor). Rotation can't propagate to warm containers. Compounded by `follow-up/twilioClient.ts:5` never rebuilding its client. **Fix:** TTL every `getSecret` call (pattern exists in `getNovaRelaySharedSecret`).
- `wearable/patients/route.ts:26` — per-patient query in a loop (N+1) on a request path. **Fix:** single `.in(ids)`.

## Section 4 — Reliability / silent failures

- **CRITICAL** `appointments/route.ts:160-182` — DB-query failure is caught, logged, and swallowed; the *same code path* as an empty result then fabricates fake patients (names/MRNs/DOBs) from `DEMO_TEMPLATES` and returns 200 with no `demo` flag. A physician sees 8 fake patients indistinguishable from real ones if RDS blips. **Fix:** 5xx on `dbError`; never share a code path between "DB failed" and "no rows" that injects synthetic PHI-shaped data.
- `dashboardData.ts:22-128` — 5 queries ignore `error`; 3 wrap in `catch {}` "table may not exist" that swallows *all* errors → dropped prior-visits/imaging/scale-history render as "none" in the chart (clinical-judgment risk). **Fix:** check `error.code==='42P01'` only; surface other failures.
- `follow-up/message/route.ts:97-159` — session insert "non-fatal" but `session_id` already returned → subsequent turns UPDATE zero rows and silently stop persisting; escalation insert + `notifyFollowUpEscalation` are fire-and-forget (a patient red flag can fail to reach the dashboard). **Fix:** fail the request on session-insert error; retry/alert on escalation-path failure.
- `notifications.ts` — the *entire* delivery path for `critical`-priority alerts (triage/historian/follow-up) is one DB insert; failure returns `null`, caller logs and moves on. `wearable/events` has a compensating DB-trigger path; the others don't. **Fix:** second delivery path (retry outbox — the pattern already exists in `triage/emergencyActionAlertOutbox`).
- `neuro-consults/[id]/report/route.ts:36-56` — 4 parallel queries incl. `red_flag_events` each `.catch(() => ({rows:[]}))` → report looks complete but silently missing red flags. **Fix:** per-section failure flag (pattern exists in `historian/localizer`'s `degradedReason`).

## Section 5 — Deterministic (headers / ops / infra)

- **HIGH** no security-response-headers block in `next.config.ts` — missing CSP, HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options`, Referrer/Permissions-Policy (clickjacking, downgrade, MIME-sniff on a PHI web app). **Fix:** add `async headers()`.
- **HIGH** no deploy-time Bedrock invocation-logging assertion — a single AWS-console toggle puts full PHI in CloudWatch, unguarded. **Fix:** CI/deploy check of `GetModelInvocationLoggingConfiguration`.
- **MEDIUM** hard-coded Bedrock model IDs — `bedrock.ts:26` `BEDROCK_MODEL = 'us.anthropic.claude-sonnet-4-6'`, plus `triage/longPacketIngestion.ts`, `longPacketPartialSafetyHold.ts` (`DEFAULT_*` constants). A model swap should be an env flip. **Fix:** read from `BEDROCK_*` env with these as fallback only.
- **MEDIUM** no `/api/health` endpoint.
- Nova relay: **HIGH** no max-connection cap (`server.ts:157`); MEDIUM no `bufferedAmount` backpressure, unbounded per-session queues, no `process.on('unhandledRejection')` backstop (one missed `.catch()` kills all concurrent patient sessions).
- **Positive controls (verified, no finding):** `/api/triage/*` emergency-action system (role+tenant+idempotency+lease+retry, fail-closed), `wearable/link`, `follow-up/twilio-sms` (Twilio signature validated), demo routes correctly `isDemoEndpointsEnabled()`-gated, `historian/localizer` degraded-state pattern. The repo clearly knows how to do this right — the gaps are inconsistent application, not absent capability.

## Prioritized remediation

1. **Steve's data call first** — real PHI in prod `ops_amplehtml` today, or synthetic? Determines whether §1–§4 criticals are ship-blockers or a hard-gate-before-PHI checklist.
2. If real (or before it goes real): **default-deny API auth wrapper** (S1) + close S2/S3/S4 by route family — the single highest-leverage fix.
3. `ALLOW_ALL_ADMIN=false` (S6) — one-line, no reason to wait.
4. `/api/appointments` — auth + kill the DB-fail→fake-PHI fallback (§3/§4 CRITICAL, one route).
5. PHI-in-logs (§2) — quick, independent of the auth work.
6. Security headers + Bedrock-logging assertion (§5) — deploy-config PRs.
7. Bedrock timeouts (16 routes) + secret TTLs — mechanical, existing patterns.

## Not covered (needs human/external)
Novel threat modeling, runtime PHI in a live deployment (CloudWatch inspection), HIPAA/SOC2 paperwork. Run an external audit (Scott/Manny-style) before GA. This is code-level drift detection.
