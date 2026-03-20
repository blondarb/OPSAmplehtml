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

## Prerequisites

1. **App running** at `http://localhost:3000` (or set `TEST_BASE_URL`)
2. **Database accessible** from the running app (RDS or local PostgreSQL)
3. **Cognito credentials** (optional but recommended):
   - `TEST_EMAIL` — test user email
   - `TEST_PASSWORD` — test user password
4. **Bedrock configured** — for triage scoring and localizer (requires AWS credentials in app env)

## How to Run

```bash
# Run all simulated patient tests
npx vitest tests/simulated-patients/

# Run a specific test
npx vitest tests/simulated-patients/runner.test.ts

# Run with verbose output
npx vitest tests/simulated-patients/ --reporter=verbose

# Run with environment variables
TEST_EMAIL=test@example.com TEST_PASSWORD=secret123 npx vitest tests/simulated-patients/
```

## Patient Personas

| File | Scenario | Expected Triage | Key Features |
|------|----------|----------------|--------------|
| `migraine-chronic.json` | 35F chronic migraine with medication overuse | ROUTINE | 20+ headache days/month, daily analgesic use |
| `acute-stroke.json` | 68M sudden left-sided weakness | EMERGENT | Focal deficit, A-fib, within treatment window |
| `ms-relapse.json` | 28F new numbness in legs, known MS | URGENT | Progressive myelopathy, bladder urgency |
| `first-seizure.json` | 22M witnessed tonic-clonic seizure | URGENT | First seizure, sleep deprivation |
| `peripheral-neuropathy.json` | 55M progressive foot numbness | ROUTINE | Poorly controlled DM2, A1c 9.2 |

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
  helpers.ts         -- API call wrappers, auth, retry logic, validators
  grading.ts         -- Scoring rubric (5 dimensions)
  runner.test.ts     -- Vitest test suite (the entry point)
  README.md          -- This file
  personas/          -- Patient scenario JSON files
    migraine-chronic.json
    acute-stroke.json
    ms-relapse.json
    first-seizure.json
    peripheral-neuropathy.json
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TEST_BASE_URL` | No | `http://localhost:3000` | App URL |
| `TEST_EMAIL` | No | — | Cognito test user email |
| `TEST_PASSWORD` | No | — | Cognito test user password |
| `TEST_TIMEOUT` | No | `60000` | Per-step timeout (ms) |
| `TEST_TENANT_ID` | No | `test-tenant` | Tenant for historian sessions |

## Notes

- The **triage** and **intake chat** endpoints do NOT require authentication
- The **historian save**, **localizer**, and **report** endpoints may require auth depending on deployment configuration
- The **localizer** has a 2-second internal timeout and will degrade gracefully (partial results are expected)
- The **intake conversation** requires multiple AI round-trips and may take 30-60 seconds per persona
- Tests are designed to **soft-skip** steps that fail due to infrastructure issues (e.g., missing database tables) while still validating what they can
