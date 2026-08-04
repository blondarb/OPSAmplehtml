# Security & Production-Readiness Audit — OPSAmplehtml — 2026-08-04

Second in-repo audit. Baseline: [`docs/security-audit-2026-07-12.md`](security-audit-2026-07-12.md)
(commit `5efa1f6`). Run via the `security-audit` skill — deterministic pattern battery over the
whole tree, plus a silent-failure agent pass scoped to the **80 security-surface files changed
since the baseline** (`src/app/api`, `src/lib`, `lambda`, `src/middleware.ts`, `services`).

Threat model: PHI-bearing clinical app (strict). **Data disposition unchanged from July: POC/
synthetic only — no real PHI in `ops_amplehtml` today.** Every auth finding below is therefore a
*hard gate before real PHI*, not a live breach. That disposition is the load-bearing assumption of
this entire document; if it ever stops being true, the July catalog becomes an incident list.

## Headline: no new critical exposure from the redesign — but the demo surface changed the risk shape

The Neuro Navigator / Health Interview work (Aug 3, commits `411a420`→`f1bdaee`) introduced
**zero new auth findings**. The triage surface is the best-gated family in the repo (27
`authorizeClinicalAccess` / denial-message references across 21 route files, with
`routeSafety.test.ts` regression barriers next to them). The two genuinely new routes since the
baseline both ship purpose-built gates:

| New route | Gate |
|---|---|
| `ai/clara/feedback-review` | `verifyGateToken` (Clara test-surface cookie) → 401 |
| `ai/historian/transcript-flush` | `verifyFlushToken` Bearer + session-id binding → 403 |

Both were flagged by the crude "no `getUser` import" pattern and are **false positives** —
recorded here so the next audit doesn't re-raise them.

**What did change is exposure, not code.** `/patient/historian` is now a partner-facing demo being
shown to Mayo (Aug 7) and Novant (Aug 12), and it is in `PUBLIC_ROUTES` by design. That elevates
one pre-existing July finding from "unauthenticated clinical route" to "unauthenticated **paid**
endpoint on a URL we are about to hand to two health systems" — see **N1**.

## Severity summary

| Bucket | Critical | High | Medium | Low |
|---|---|---|---|---|
| Auth / IDOR (**all carried over from July, unremediated by decision**) | 38 | 11 | 4 | 0 |
| New this pass (exposure change + never-fixed zero-risk items) | 0 | 3 | 2 | 0 |
| Deterministic (headers / ops / PHI-log / config) | 0 | 3 | 3 | 0 |
| Reliability / silent-failure | *(agent pass — folded in below)* | | | |

Nothing regressed. Nothing new is Critical. The Critical count is identical to July because the
systemic auth gap was consciously deferred, not because new work reopened anything.

---

## Section 1 — New / changed this pass

### N1 — HIGH: unauthenticated paid-token mint on the partner demo surface
`src/app/api/ai/historian/session/route.ts:50`

The historian session route mints **OpenAI Realtime ephemeral client secrets** (and a Nova relay
token) with no caller authentication, no origin check, and no rate limit. It was already inside
July's S2 blanket finding; what changed is that `/patient/historian` is now a public,
partner-demo URL. Anyone who watches the demo, opens devtools, or guesses the path can drive
paid Realtime sessions against Sevaro's key — a cost/quota-exhaustion surface whose worst
realistic outcome is **the demo failing live because the quota is gone**, not a PHI breach.

**Fix (cheap, pre-demo):** origin/referer allowlist + a short sliding-window IP cap on this one
route. It needs no login and doesn't touch the deferred platform-auth work. The `?internal=1`
engine toggle shipped Aug 3 is *not* a gate — it only hides UI.

### N2 — HIGH: `ALLOW_ALL_ADMIN = true` still shipped (July S6, "zero-risk fix", not done)
`src/app/api/feedback/route.ts:10`, `src/app/api/feedback/admin/route.ts:9`

Any authenticated user can add/remove admins and read the internal AI system-prompt inventory.
July called this out as one of two fixes worth doing *regardless* of the PHI disposition. Still
`true`, `TODO: set to false` still in place. The real `SEED_ADMIN_EMAIL` / `FEEDBACK_ADMIN_EMAILS`
checks already exist directly below the short-circuit.

**Fix:** flip the constant. One line.

### N3 — HIGH: DB failure fabricates clinical-looking data (July zero-risk fix, not done)
`src/app/api/appointments/route.ts:166-169`

`catch (dbError) { console.error('DB query failed, using demo data'); }` → returns generated
appointments. A physician sees a plausible schedule when the database is down. This is a
clinician-facing correctness bug independent of PHI, and July flagged it as fix-now.

**Fix:** return 5xx (or an explicit empty + degraded-state banner). Never success-shaped data
from a caught DB error.

### N4 — MEDIUM: no security response headers
`next.config.ts` — no `async headers()` block; zero of CSP / HSTS / `X-Frame-Options` /
`X-Content-Type-Options` / Referrer-Policy / Permissions-Policy.

A health system's governance review will check this on a public clinical URL, and both demo pages
are public. Clickjacking + MIME-sniffing + protocol-downgrade exposure today.

**Fix:** add the standard header block; ~15 lines, no behavior change. Worth doing before Aug 7
purely for how it reads to a security reviewer.

### N5 — MEDIUM: still no rate limiting anywhere, and no `/api/health`
No limiter in `src/middleware.ts` (matcher only) and no health route. Both were July findings.
On a now-public demo surface the limiter matters more than it did (see N1).

---

## Section 2 — Carried over unchanged from July (deferred by decision)

Spot-checked 8/8 of July's named criticals — **all still open**, exactly as the deferral intended:

`follow-up/billing/export` · `follow-up/analytics` · `follow-up/message` · `wearable/events` ·
`wearable/hourly` · `patient/lookup` · `provider-messages` · `incomplete-docs`

41 route files (of 137) import no auth helper; ~6 of those are token-gated by other means
(Clara/flush/webhook), leaving the July systemic picture intact: `/api/*` is exempt from the
middleware Cognito gate (`src/middleware.ts:66-70`) and each handler self-gates or doesn't.

Also unchanged and still true: identity-from-query on 12 routes (`patientId`/`patient_id` straight
from `searchParams` into a DB key), `DEMO_TENANT` single-tenant model, PHI-adjacent transcript
logging at `ai/visit-ai/route.ts:111`, 21 hard-coded Bedrock/Anthropic model IDs outside
`process.env`, pool `max: 5` on three pools.

**Do not re-triage these individually.** They are one root cause with one fix (a default-deny
`withAuth` wrapper + explicit opt-outs), gated on the PHI decision.

---

## Section 3 — Reliability / silent failure

*(Agent pass over the 80 changed files — findings folded in below.)*

---

## Section 4 — What improved since July

- **Triage safety regression barriers**: `routeSafety.test.ts` files now sit beside the triage
  routes; 19 test files assert 401/403/denial behavior. July had none of this.
- **Reason-specific denial messages** (`clinicalAccessDeniedMessage`) — a signed-out browser no
  longer looks identical to a provisioning failure.
- **Lint gate is clean**: `npm run lint` (the project's actual gate) exits 0. *(A bare
  `eslint .` reports ~16.5k errors because it walks `public/` build artifacts — that is a
  scanning artifact, not a code-quality finding. Noted so it isn't mistaken for regression.)*
- **Full test suite green**: 2,743 passing.

## Section 5 — Open PR risk

| PR | Age | Note |
|---|---|---|
| #168 gitleaks CI | 12d | Secret-scanning gate still unmerged — merge it; it's the cheapest standing control here |
| #127, #126, #118, #116 | 44–66d | Docs/feature PRs, long-stale — close or merge to shrink surface |

---

## Prioritized remediation

**Before Aug 7 (small, demo-protecting, no architecture):**
1. **N1** — origin allowlist + IP cap on `ai/historian/session` (protects the demo itself)
2. **N2** — `ALLOW_ALL_ADMIN = false` (one line)
3. **N3** — kill the appointments fabrication (clinician-facing correctness)
4. **N4** — security headers block (governance optics + real hardening)

**Next:** merge PR #168; add `/api/health`; move model IDs to env.

**Gated on the PHI decision (unchanged):** the 38-critical auth net. If real patient data is ever
pointed at this deployment, that work becomes blocking and precedes everything above.
