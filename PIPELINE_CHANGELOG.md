# Integrated Neuro Intake Engine — Pipeline Changelog

Tracks all phases of the pipeline that wires Triage → Intake → Historian → Background Localizer into a unified consult record.

---

# Phase 1 — Triage → Intake → Historian Pipeline

**Date:** 2026-03-19
**Branch:** `claude/interesting-mcnulty`
**Author:** Claude (Sonnet 4.6)

## Overview

Phase 1 wires the three existing standalone tools — Triage, Intake Agent, and AI Historian — into a single automated intake pipeline. A `neurology_consults` record now tracks a referral from first triage through structured historian output.

**Pipeline flow:**
```
Triage (scored, saved)
  → neurology_consults record created/updated
  → POST /api/neuro-consults/[id]/initiate-intake
  → Intake Agent (/api/follow-up/message) with triage context
  → GET  /api/neuro-consults/[id]/historian-context
  → AI Historian (/api/ai/historian/session) with triage+intake context
  → POST /api/ai/historian/save — historian output written back to consult
```

## New Files

### `src/lib/consult/types.ts`
TypeScript interfaces for the pipeline:
- `ConsultStatus` — 9-state enum tracking pipeline progression
- `NeurologyConsult` — full database row shape
- `TriageConsultUpdate` — data written from triage to consult
- `ConsultIntakeContext` — triage data surfaced to the intake agent UI
- `HistorianConsultContext` — `{ referralReason, patientContext }` for `buildHistorianSystemPrompt()`

### `src/lib/consult/pipeline.ts`
Non-throwing DB helpers. All errors logged; callers get null/false so pipeline failures don't break existing UX.

| Function | Description |
|---|---|
| `createConsult()` | INSERT a new `neurology_consults` row |
| `linkTriageToConsult()` | UPDATE consult with triage results; advance to `triage_complete` |
| `linkIntakeToConsult()` | UPDATE consult with intake session; advance to `intake_in_progress` or `intake_complete` |
| `markHistorianStarted()` | Advance consult to `historian_in_progress` |
| `linkHistorianToConsult()` | UPDATE consult with historian output; advance to `historian_complete` |
| `getConsult()` | Fetch single consult by ID |
| `listConsults()` | List recent consults with optional patient filter |

### `src/lib/consult/contextBuilder.ts`
Context string builders — pure functions that transform a `NeurologyConsult` into the formats each downstream step expects.

| Function | Output |
|---|---|
| `buildIntakeContextFromConsult()` | `ConsultIntakeContext` for the intake UI |
| `buildTriageSummaryText()` | One-paragraph visit_summary for `followup_sessions` |
| `buildHistorianContextFromConsult()` | `{ referralReason, patientContext }` for `buildHistorianSystemPrompt()` |
| `deriveChiefComplaint()` | Short chief complaint from clinical_reasons + referral text |
| `buildTriageSummaryForConsult()` | Multi-line summary stored on the consult record |

### `migrations/032_neurology_consults.sql`
Creates the `neurology_consults` table — the backbone for all downstream phases.

**Run before deploying Phase 1:**
```bash
psql $RDS_URL -f migrations/032_neurology_consults.sql
```

### API Routes (new)
- `POST /api/neuro-consults` — Create a pipeline consult record
- `GET  /api/neuro-consults` — List consults (filter by `?patient_id=`, `?limit=`)
- `GET  /api/neuro-consults/[id]` — Fetch single consult
- `PUT  /api/neuro-consults/[id]` — Update manually-editable fields
- `POST /api/neuro-consults/[id]/initiate-intake` — Advance to intake, pre-create followup session
- `GET  /api/neuro-consults/[id]/historian-context` — Ready-to-use historian context object

## Modified Files (Phase 1)

| File | Change |
|---|---|
| `src/app/api/triage/route.ts` | Added `create_consult` + `consult_id` request fields; returns `consult_id` |
| `src/app/api/follow-up/message/route.ts` | Added `consult_id` to link intake conversations to consult |
| `src/app/api/ai/historian/session/route.ts` | Added `consult_id` to enrich historian context from pipeline |
| `src/app/api/ai/historian/save/route.ts` | Added `consult_id` to write historian output back to consult |

## Key Design Decisions (Phase 1)

1. **Opt-in integration** — all existing routes continue to work exactly as before.
2. **Non-fatal everywhere** — pipeline DB operations never bubble up to break primary route responses.
3. **Context enrichment over context replacement** — historian receives triage + intake data as additive context.
4. **Single source of truth** — all pipeline state lives in `neurology_consults`.
5. **`/api/neuro-consults` not `/api/consults`** — avoids collision with existing provider-to-provider consult requests.

---

# Phase 2 — Background Localizer + Evidence Engine

**Date:** 2026-03-19
**Branch:** `claude/nice-mahavira`
**Author:** Claude (Sonnet 4.6)

## Overview

Phase 2 adds the Background Localizer, which runs **during** an active historian session. As the patient speaks, it analyzes the real-time transcript, queries a Bedrock Knowledge Base (the Evidence Engine) containing neurology clinical guidelines, and generates refined follow-up questions to inject back into the live WebRTC session.

**Pipeline flow (per localizer call):**
```
Client fires POST /api/ai/historian/localizer every 3 user turns
  → Step 1: Symptom extraction (Bedrock Claude, temp=0)
  → Step 2: KB retrieval (Bedrock RetrieveAndGenerate, Evidence Engine)
  → Step 3: Question + differential generation (Bedrock Claude, temp=0.3)
  → Client injects followUpQuestions via WebRTC data channel
  → Results persisted to neurology_consults.localizer_* columns
```

## New Files (Phase 2)

### `infrastructure/evidence-engine/template.yaml`
SAM/CloudFormation template provisioning:
- `sevaro-neuro-guidelines-{env}` S3 bucket (SSE-AES256, versioning, public-access blocked)
- `sevaro-neuro-kb-{env}` OpenSearch Serverless collection (VECTORSEARCH type)
- Encryption, network, and data access security policies for OpenSearch
- `SevaroBedrockKBRole-{env}` IAM role with least-privilege S3 + AOSS + embedding model access

Note: The Bedrock Knowledge Base itself is created via CLI after the stack deploys (CloudFormation limitation). See `setup.sh` and the template's `NextStep` output for the exact CLI commands.

**Deploy:**
```bash
sam deploy \
  --template-file infrastructure/evidence-engine/template.yaml \
  --stack-name sevaro-evidence-engine-staging \
  --parameter-overrides Environment=staging \
  --capabilities CAPABILITY_NAMED_IAM \
  --profile sevaro-sandbox --region us-east-2
```

### `infrastructure/evidence-engine/setup.sh`
End-to-end setup script:
1. Validates prerequisites (SAM CLI, AWS CLI, jq, SSO login)
2. Deploys the CloudFormation stack
3. Uploads guideline documents from `infrastructure/evidence-engine/docs/` to S3
4. Prints the exact CLI commands to create the KB, data source, trigger ingestion, and smoke test
5. Instructions for setting `BEDROCK_KB_ID` in Amplify console

### `infrastructure/evidence-engine/docs/README.md`
Document library guide:
- Tier 1/2/3 priority guidelines (AAN, IHS, AHA/ASA, DSM-5-TR)
- File format requirements and naming convention
- Copyright/redistribution guidance (PDFs vs. structured summaries)
- Commands to upload and re-sync documents after additions
- Retrieval quality testing via `aws bedrock-agent-runtime retrieve`

### `src/lib/consult/localizer-types.ts`
TypeScript interfaces for the localizer:
- `LocalizerRequest` / `LocalizerResponse` — API contract
- `LocalizerTranscriptTurn` — transcript turn shape
- `ExtractedSymptoms` — Step 1 structured output
- `GeneratedQuestions` / `DifferentialEntry` — Step 3 structured output
- `LocalizerConsultRecord` — shape of the new `localizer_*` columns on `neurology_consults`

### `src/app/api/ai/historian/localizer/route.ts`
`POST /api/ai/historian/localizer` — the 3-step localizer pipeline:
- **Step 1**: `invokeBedrockJSON` with `SYMPTOM_EXTRACTOR_PROMPT` (temp=0, maxTokens=500)
- **Step 2**: `retrieveFromKB` (new helper in `bedrock.ts`) — queries Bedrock KB with extracted symptom query
- **Step 3**: `invokeBedrockJSON` with `QUESTION_GENERATOR_PROMPT` (temp=0.3, maxTokens=600)
- 2-second `AbortController` timeout with graceful degradation (returns partial results, never 500s)
- Persists differential + questions to `neurology_consults.localizer_*` (fire-and-forget, non-fatal)
- `GET /api/ai/historian/localizer` — health check, returns `{ configured, kbId, timeout, status }`

### `migrations/033_localizer_results.sql`
Adds 6 columns to `neurology_consults`:
- `localizer_differential JSONB` — most recent ranked differential
- `localizer_questions JSONB` — most recent suggested follow-up questions
- `localizer_hypothesis TEXT` — neuroanatomical localization hypothesis
- `localizer_kb_sources JSONB` — source document names (audit trail)
- `localizer_last_run_at TIMESTAMPTZ` — timestamp of last successful run
- `localizer_run_count INTEGER DEFAULT 0` — total localizer calls in this session
- Index: `idx_neurology_consults_localizer_last_run` on `localizer_last_run_at DESC`

**Run before deploying Phase 2:**
```bash
psql $RDS_URL -f migrations/033_localizer_results.sql
```

## Modified Files (Phase 2)

| File | Change |
|---|---|
| `package.json` | Added `@aws-sdk/client-bedrock-agent-runtime ^3.1003.0` |
| `src/lib/bedrock.ts` | Added `BedrockAgentRuntimeClient` singleton + `retrieveFromKB()` helper |

## New Environment Variable

| Variable | Where to set | Description |
|---|---|---|
| `BEDROCK_KB_ID` | Amplify console (staging + production) | Bedrock Knowledge Base ID returned by `aws bedrock-agent create-knowledge-base`. Required for Step 2 KB retrieval. If unset, localizer skips Step 2 and degrades gracefully. |

## Key Design Decisions (Phase 2)

1. **Graceful degradation over hard failure** — the localizer is never on the critical path. Every error degrades to partial results with `partial: true` and a `degradedReason` string. The historian session continues regardless.

2. **2-second hard timeout** — `AbortController` ensures the localizer never blocks the client longer than 2 seconds. Natural conversation pauses (patient speaking, AI generating response) are typically 2–8 seconds, so the localizer result arrives before the next injection window.

3. **Step 2 is optional** — if `BEDROCK_KB_ID` is not set (local dev, pre-KB-creation), Steps 1 and 3 still run and produce a useful differential from symptoms alone. The guideline context in Step 3 falls back to a note telling the model to use clinical judgment.

4. **Non-blocking DB write** — `persistLocalizerResults()` is fire-and-forget. It only updates the consult if a `historian_session_id` link exists; standalone historian sessions (without a consult record) are safely ignored.

5. **Prompts embedded in route** — the `SYMPTOM_EXTRACTOR_PROMPT` and `QUESTION_GENERATOR_PROMPT` live in `localizer/route.ts` rather than a separate prompts file. The route and its prompts are tightly coupled; separating them would add indirection without benefit at this stage.

6. **KB RetrieveAndGenerate over Retrieve** — `RetrieveAndGenerate` combines retrieval + synthesis in one API call, reducing latency compared to separate Retrieve + manual context assembly. The generated KB response is passed directly to Step 3 as `guidelineContext`.

## What's NOT in Phase 2

Deferred to later phases:
- **Phase 2c — Client integration** (`useRealtimeSession.ts` turn counter, `injectLocalizerContext()`)
- **Phase 2d — Physician panel enhancement** (`GET /api/ai/historian/localizer/live` polling, `HistorianSessionPanel` evidence display)
- **Phase 2e — CloudWatch monitoring** (localizer latency metrics, p95 alert)
- Document upload and KB ingestion (requires running `setup.sh` manually)

---

## Phase Roadmap

| Phase | Status | Description |
|---|---|---|
| Phase 1 | Complete | Triage → Intake → Historian pipeline with `neurology_consults` |
| Phase 2a | Complete | Evidence Engine infrastructure (S3 + OpenSearch + IAM) |
| Phase 2b | Complete | Localizer API route (3-step pipeline) |
| Phase 2c | Pending | Client integration: turn counter + injection in `useRealtimeSession` |
| Phase 2d | Pending | Physician observer panel: live differential + evidence display |
| Phase 2e | Pending | CloudWatch monitoring and latency alerting |
| Phase 3 | Planned | Clinical scales auto-selection from historian OLDCARTS output |
| Phase 4 | Planned | Red flag escalation notifications to physician |
| Phase 5 | Planned | Report generator: structured consult report from all pipeline data |
