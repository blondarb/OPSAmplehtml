# Simulated Patient E2E Test Agent

API-level test harness that runs automated patient scenarios through the full Neuro Intake Engine pipeline. No voice/WebRTC required — all interactions are simulated at the HTTP API level.

## Pipeline Under Test

```
Referral Text
    |
    v
[1] Triage (POST /api/triage) ---> urgency tier, red flags, subspecialty
    |
    v
[2] Intake (POST /api/ai/intake/chat) ---> 9-field patient registration via multi-turn AI chat
    |
    v
[3] Historian Save (POST /api/ai/historian/save) ---> structured OLDCARTS output, narrative summary
    |
    v
[4] Localizer (POST /api/ai/historian/localizer) ---> differential diagnosis, ICD-10 codes
    |
    v
[5] Report (POST /api/neuro-consults/[id]/report) ---> unified clinical report
```

## This suite is opt-in, and it skips rather than fails

`runner.test.ts` drives a **live, authenticated app** over HTTP and takes ~14 minutes,
so it is **excluded from a default `npx vitest run`**. Without `RUN_SIMULATED_PATIENTS=1`
it skips, and the reporter prints why.

Authentication is not optional. Every clinical endpoint sits behind
`authorizeClinicalAccess`; only the `/triage` **page** is in middleware `PUBLIC_ROUTES`,
**not** `/api/triage/*`. Unauthenticated, every call returns 401.

The harness therefore keeps three states strictly apart:

| State | What you see | Why |
|-------|--------------|-----|
| Precondition unmet (not opted in, app down, no session, no clinical role) | **SKIP**, with the reason in the test name | Nothing clinical ran. An unmet precondition is not a safety failure. |
| Request rejected (401 / 403 / 503 / 5xx / network) | **FAIL**, prefixed `TRANSPORT (not a clinical result)` | The app refused the call. Nothing was graded. |
| 200 with a scored body | Clinical assertions and grading | The only state where a failure means the pipeline actually got something wrong. |

This split is the point of the harness. It previously reported a plain 401 as
`SAFETY: Emergent case "Acute Ischemic Stroke Presentation" was not triaged correctly`
across 6 tests — a gate that cries wolf is a gate everyone ignores, which is exactly
how a real safety regression would slip through unnoticed.

`transport.test.ts` covers that boundary with pure unit tests and **does** run in the
default suite.

## Prerequisites

1. **Opt in** — `RUN_SIMULATED_PATIENTS=1`
2. **App running** at `http://localhost:3000` (or set `TEST_BASE_URL`)
3. **An authenticated session** — see [Authenticating](#authenticating) below
4. **Clinical access for the test account** — an active `clinical_access_memberships`
   row with role `clinician` or `admin` for the tenant, or every call 403s
5. **Database accessible** from the running app (RDS or local PostgreSQL)
6. **Bedrock configured** — for triage scoring and localizer (requires AWS credentials in app env)

## Authenticating

### `TEST_SESSION_COOKIE` (preferred — this is the one that works)

The app signs in through the Cognito **Hosted UI (OAuth + PKCE)**. Its app client
generally does **not** enable the `USER_PASSWORD_AUTH` flow, so there is no reliable
way to mint a token from credentials alone. Copy a real session cookie instead:

1. Sign in to the target environment in a browser.
2. DevTools → Application → Cookies → copy the value of the **`id_token`** cookie.
3. Export it:

```bash
export TEST_SESSION_COOKIE='id_token=eyJraWQiOi...'
```

A bare token works too — it is wrapped in `id_token=` automatically. A full Cookie
header (`id_token=...; other=...`) is passed through as-is.

The cookie name matters: the app reads `id_token` (`src/lib/cognito/server.ts`,
`src/middleware.ts`). Any other name authenticates nothing and every call 401s.
ID tokens last 1 hour — a mid-run expiry surfaces as a `TRANSPORT ... HTTP 401`
failure, not as a clinical one.

### `TEST_EMAIL` / `TEST_PASSWORD` (fallback)

Uses Cognito `USER_PASSWORD_AUTH` directly. This only works if that flow is enabled
on the app client; otherwise `getAuthToken()` logs the Cognito error, returns null,
and preflight skips the suite with a 401 reason.

## How to Run

```bash
# Default suite — runner.test.ts SKIPS with a reason; transport.test.ts runs
npx vitest run tests/simulated-patients/

# The real thing: opted in, against a running authenticated app
RUN_SIMULATED_PATIENTS=1 \
TEST_BASE_URL=http://localhost:3000 \
TEST_SESSION_COOKIE='id_token=eyJ...' \
  npx vitest run tests/simulated-patients/runner.test.ts --reporter=verbose
```

### Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `RUN_SIMULATED_PATIENTS` | *(unset)* | Opt in. `1`/`true`/`yes`. Without it the suite skips. |
| `TEST_BASE_URL` | `http://localhost:3000` | Target app |
| `TEST_SESSION_COOKIE` | *(unset)* | Authenticated `id_token` cookie (preferred) |
| `TEST_EMAIL` / `TEST_PASSWORD` | *(unset)* | `USER_PASSWORD_AUTH` fallback |
| `TEST_TIMEOUT` | `60000` | Per-step timeout, ms |
| `TEST_TRIAGE_POLL_TIMEOUT` | `180000` | Max wait for async triage scoring, ms |
| `TEST_TENANT_ID` | `test-tenant` | Tenant for historian session saves |

## Triage is asynchronous

`POST /api/triage` returns **202** with `{ session_id, status }` — no scores. The
scored body only exists on `GET /api/triage/{id}` once `status === 'complete'`
(SSE was reverted in PR #111 over the ~28s Amplify gateway timeout). `runTriage()`
submits, then polls to completion, and returns the shape the old synchronous POST
used to. A harness that reads `triage_tier` straight off the POST response gets
`undefined` and fails every case — even fully authenticated.

## Patient Personas

| File | Scenario | Expected Triage | Key Features |
|------|----------|----------------|--------------|
| `migraine-chronic.json` | 35F chronic migraine with medication overuse | ROUTINE | 20+ headache days/month, daily analgesic use |
| `acute-stroke.json` | 68M sudden left-sided weakness | EMERGENT | Focal deficit, A-fib, within treatment window |
| `ms-relapse.json` | 28F new numbness in legs, known MS | URGENT | Progressive myelopathy, bladder urgency |
| `first-seizure.json` | 22M witnessed tonic-clonic seizure | URGENT | First seizure, sleep deprivation |
| `peripheral-neuropathy.json` | 55M progressive foot numbness | ROUTINE | Poorly controlled DM2, A1c 9.2 |

Optional `expectedFollowUps: string[]` lists follow-up keywords (with `|` for alternatives) for manual coverage review; it is metadata, not an authoritative gate.

Each persona includes:
- **referralText**: realistic referral letter a PCP would send
- **demographics**: age, sex, contact info
- **expectedTriage**: urgency, red flags, subspecialty
- **intakeData**: the 9 fields the intake agent should collect
- **historyResponses**: question-response pairs simulating patient interview
- **structuredHistory**: complete OLDCARTS structured output
- **narrativeSummary**: clinical narrative the historian would produce
- **expectedDDx**: diagnoses that should appear in the differential
- **expectedScales**: clinical scales that should be triggered
- **expectedRedFlags**: red flags the system should detect

## Grading Rubric

Each persona is scored on 5 dimensions after all pipeline steps complete:

| Dimension | Weight | Scoring | Critical Failure |
|-----------|--------|---------|------------------|
| **Triage Accuracy** | 25% | Exact match = 100, Over-triage = 75, Under-triage = 0 | Emergent cases under-triaged |
| **Red Flag Detection** | 25% | (found / expected) * 100 | Any expected red flag missed |
| **DDx Completeness** | 20% | (found / expected) * 90 + likelihood bonus | High-likelihood dx missing |
| **History Thoroughness** | 15% | OLDCARTS (60%) + additional fields (40%) | <8/10 OLDCARTS fields |
| **Report Quality** | 15% | Sections + chief complaint + word count + data accuracy | Score < 50 |

The **overall score** is a weighted average (0-100). Individual dimensions report pass/fail independently.

## Interpreting Results

After a test run, each persona produces a grade report printed to the console:

```
======================================================================
GRADE REPORT: Chronic Migraine with Medication Overuse
======================================================================

Overall Score: 85/100

  Triage Accuracy: 100/100 [PASS]
    Expected: routine, Got: routine. Exact match.

  Red Flag Detection: 100/100 [PASS]
    No red flags expected; none detected. Correct.

  DDx Completeness: 90/100 [PASS]
    Found 3/3 expected diagnoses.

  History Thoroughness: 100/100 [PASS]
    16/16 fields populated. OLDCARTS: 10/10.

  Report Quality: 75/100 [PASS]
    Sections: 3/3 key sections present (7 total). Chief complaint populated.
======================================================================
```

## Adding New Personas

1. Create a JSON file in `personas/` following the `PatientPersona` interface (see `types.ts`)
2. The test runner automatically discovers all `.json` files in the `personas/` directory
3. Run the test suite to validate the new persona

## Architecture

```
tests/simulated-patients/
  config.ts          -- Base URL, auth, timeouts, endpoint paths
  types.ts           -- TypeScript interfaces for personas, results, grading
  helpers.ts         -- API call wrappers, auth, preflight, transport guard, validators
  grading.ts         -- Scoring rubric (5 dimensions)
  runner.test.ts     -- Live E2E suite (OPT-IN: needs RUN_SIMULATED_PATIENTS=1 + a live app)
  transport.test.ts  -- Unit tests for the transport/clinical boundary (runs by default)
  README.md          -- This file
  personas/          -- Patient scenario JSON files
    migraine-chronic.json
    acute-stroke.json
    ms-relapse.json
    first-seizure.json
    peripheral-neuropathy.json
```

## Notes

- **Every endpoint in this pipeline requires authentication.** `/api/triage`,
  `/api/follow-up/message`, historian save, localizer, and report all call
  `authorizeClinicalAccess`. Only the `/triage` **page** is public. An earlier
  version of this file claimed triage and intake chat were unauthenticated —
  that was wrong, and believing it is what made a wall of 401s look like a
  clinical failure.
- **Triage is asynchronous** — 202 + poll. See [Triage is asynchronous](#triage-is-asynchronous).
- The **localizer** has a 2-second internal timeout and will degrade gracefully
  (partial results are expected). A *rejected* localizer call is not degradation —
  it is asserted as a transport failure before that path is credited.
- The **intake conversation** requires multiple AI round-trips and may take 30-60
  seconds per persona.
- Steps still tolerate genuine partial results (a degraded localizer, a report
  with no data) — but **not** rejected requests. A 401/403/503/5xx always fails
  loudly with a `TRANSPORT` message rather than soft-passing, because a step that
  soft-passes on a server error is indistinguishable from one that worked.
