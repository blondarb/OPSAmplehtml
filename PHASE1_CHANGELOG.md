# Phase 1 — Integrated Neuro Intake Engine

**Date:** 2026-03-19
**Branch:** `claude/interesting-mcnulty`
**Author:** Claude (Sonnet 4.6)

---

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

---

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

**Key design decision — historian context enrichment:**
The `patientContext` block passed to the historian includes:
- Triage tier and a note to probe urgency-related findings
- Subspecialty recommendation
- Multi-line triage summary from the AI
- Red flags with instruction to ask targeted follow-up questions
- Intake summary (if intake ran before historian) with instruction to skip redundant questions

### `migrations/032_neurology_consults.sql`
Creates the `neurology_consults` table with:
- All pipeline-phase columns (triage_*, intake_*, historian_*)
- Indexes on `patient_id`, `status`, `triage_session_id`, `created_at`
- `updated_at` auto-update trigger
- `CHECK` constraint on `status` to prevent invalid states

**Run this migration against RDS before deploying:**
```bash
psql $RDS_URL -f migrations/032_neurology_consults.sql
```

### `src/app/api/neuro-consults/route.ts`
`POST /api/neuro-consults` — Create a pipeline consult record
`GET  /api/neuro-consults` — List consults (filter by `?patient_id=`, `?limit=`)

Note: `/api/consults` is the existing provider-to-provider consult request system (unrelated). `/api/neuro-consults` is the intake pipeline record.

### `src/app/api/neuro-consults/[id]/route.ts`
`GET /api/neuro-consults/[id]` — Fetch single consult
`PUT /api/neuro-consults/[id]` — Update `notes`, `status`, `patient_id` (manually editable fields only; pipeline transitions go through dedicated helpers)

### `src/app/api/neuro-consults/[id]/initiate-intake/route.ts`
`POST /api/neuro-consults/[id]/initiate-intake`

Advances a `triage_complete` consult into intake. Returns:
- `context` — triage-enriched `ConsultIntakeContext` to pre-populate the intake agent UI
- `intake_session_id` — pre-created `followup_sessions` ID so the consult is linked before the first message
- `already_initiated` — true if intake was already started

Pre-creates a `followup_sessions` row with:
- `visit_summary` set to the triage summary text
- `caregiver_info.consult_id` carrying the pipeline link back

Guards: returns 409 if triage hasn't completed yet.

### `src/app/api/neuro-consults/[id]/historian-context/route.ts`
`GET /api/neuro-consults/[id]/historian-context`

Returns ready-to-use historian context:
```json
{
  "consult_id": "...",
  "consult_status": "intake_complete",
  "session_type": "new_patient",
  "referral_reason": "New-onset seizure with post-ictal confusion",
  "patient_context": "TRIAGE PRIORITY: URGENT (urgent)\n...",
  "has_triage": true,
  "has_intake": true,
  "triage_urgency": "urgent",
  "triage_tier_display": "URGENT"
}
```

---

## Modified Files

### `src/app/api/triage/route.ts`
**New request fields:**
- `create_consult?: boolean` — auto-create a `neurology_consults` row after triage
- `consult_id?: string` — link this triage result to an existing consult

**New response field:**
- `consult_id: string | null` — present when `create_consult` or `consult_id` was provided

**Logic added** (non-fatal block after DB save):
1. Derives `chief_complaint` from `clinical_reasons[0]` or first sentence of referral text
2. Builds `triage_summary` from tier, clinical reasons, suggested workup, subspecialty
3. If `consult_id` provided: calls `linkTriageToConsult()`
4. If `create_consult: true`: calls `createConsult()` and returns new `consult_id`

**Backward compatible** — all existing calls with neither field set behave identically.

### `src/app/api/follow-up/message/route.ts`
**New request field:**
- `consult_id?: string` — link this intake conversation to a consult

**Logic added** (non-fatal block after DB operations):
- First message (no `session_id`) + `consult_id` → calls `linkIntakeToConsult(..., 'intake_in_progress')`
- `conversation_complete: true` + `consult_id` → builds intake summary from extracted data (functional status, medication status, patient questions), calls `linkIntakeToConsult(..., 'intake_complete', summary)`

**Backward compatible** — calls without `consult_id` are unaffected.

### `src/app/api/ai/historian/session/route.ts`
**New request field:**
- `consult_id?: string` — enrich historian context from the pipeline consult

**Logic added** (before system prompt assembly):
- Fetches consult from DB
- Calls `buildHistorianContextFromConsult()` → overrides `referralReason` and `patientContext`
- Calls `markHistorianStarted()` to advance consult status
- Echoes `consult_id` back in response for the save call

**Effect on historian AI:**
The OpenAI Realtime session receives a system prompt enriched with:
- Triage tier and priority note
- Referred subspecialty
- Full triage summary (AI clinical reasons, suggested workup, subspecialty rationale)
- Red flags with instruction to probe each one specifically
- Intake summary if available, with instruction to skip redundant questions

**Backward compatible** — calls without `consult_id` are unaffected.

### `src/app/api/ai/historian/save/route.ts`
**New request field:**
- `consult_id?: string` — link saved historian session to pipeline consult

**Logic added** (after successful DB insert):
- Calls `linkHistorianToConsult()` with `narrative_summary`, `structured_output`, `red_flags`, `safety_escalated`
- Advances consult status to `historian_complete`
- `consult_id` echoed in response

**Backward compatible** — calls without `consult_id` are unaffected.

---

## Database Schema Changes

### New table: `neurology_consults`
See `migrations/032_neurology_consults.sql` for full DDL.

**No changes** to existing tables.

---

## Integration Points Summary

| When | What fires | What updates |
|---|---|---|
| `POST /api/triage` with `create_consult: true` | `createConsult()` | New `neurology_consults` row |
| `POST /api/triage` with `consult_id` | `linkTriageToConsult()` | Existing consult → `triage_complete` |
| `POST /api/neuro-consults/[id]/initiate-intake` | Pre-creates `followup_sessions` | Consult → `intake_in_progress` |
| First `POST /api/follow-up/message` with `consult_id` | `linkIntakeToConsult(..., 'in_progress')` | Consult `intake_session_id` set |
| Final `POST /api/follow-up/message` (`conversation_complete`) | `linkIntakeToConsult(..., 'complete')` | Consult `intake_summary`, `intake_escalation_level` set |
| `POST /api/ai/historian/session` with `consult_id` | `buildHistorianContextFromConsult()` + `markHistorianStarted()` | Enriched system prompt; consult → `historian_in_progress` |
| `POST /api/ai/historian/save` with `consult_id` | `linkHistorianToConsult()` | Consult gets full OLDCARTS output; status → `historian_complete` |

---

## Design Decisions

1. **Opt-in integration** — all existing routes continue to work exactly as before. The pipeline is activated only when callers pass `create_consult`, `consult_id`, or `consult_id` in requests. This ensures zero regressions.

2. **Non-fatal everywhere** — every pipeline DB operation is wrapped in try/catch. Errors are logged but never bubble up to block the primary route response. This matches the existing codebase pattern for demo resilience.

3. **Context enrichment over context replacement** — the historian receives triage and intake data as additional context in its system prompt, not as a replacement for its own questions. The AI is instructed to probe red flags specifically and skip topics already covered in intake.

4. **Single source of truth** — all pipeline state lives in `neurology_consults`. The three existing tables (`triage_sessions`, `followup_sessions`, `historian_sessions`) are unchanged; the consult record just holds foreign keys to them plus summary fields for quick access.

5. **`/api/neuro-consults` not `/api/consults`** — `/api/consults` already handles provider-to-provider consult requests (a separate feature). The pipeline uses a distinct namespace to avoid collision.

---

## What's NOT in Phase 1

The following were explicitly deferred to later phases:
- UI components for the pipeline (consult tracking view, pipeline status widget)
- Localizer (anatomical localization from historian OLDCARTS data)
- Clinical scales auto-selection from historian structured output
- Red flag escalation notifications to physician
- Report generator (Phase 5)
- Historian → Note import with triage context already populated

---

## Testing Checklist

To verify the pipeline end-to-end:

1. **Run migration:**
   ```bash
   psql $RDS_URL -f migrations/032_neurology_consults.sql
   ```

2. **Triage → consult creation:**
   ```bash
   curl -X POST /api/triage \
     -d '{"referral_text": "...", "create_consult": true}'
   # → response includes consult_id
   ```

3. **Initiate intake:**
   ```bash
   curl -X POST /api/neuro-consults/{consult_id}/initiate-intake
   # → returns ConsultIntakeContext with triage data
   ```

4. **Intake message with consult linkage:**
   ```bash
   curl -X POST /api/follow-up/message \
     -d '{"session_id": null, "consult_id": "...", "patient_message": "...", "patient_context": {...}}'
   ```

5. **Get historian context:**
   ```bash
   curl /api/neuro-consults/{consult_id}/historian-context
   # → referral_reason and patient_context pre-populated from triage + intake
   ```

6. **Create historian session with consult:**
   ```bash
   curl -X POST /api/ai/historian/session \
     -d '{"sessionType": "new_patient", "consult_id": "..."}'
   # → OpenAI Realtime session with enriched system prompt
   ```

7. **Save historian session:**
   ```bash
   curl -X POST /api/ai/historian/save \
     -d '{"consult_id": "...", "structured_output": {...}, ...}'
   # → historian_session_id written to consult; status → historian_complete
   ```

8. **Verify consult record:**
   ```bash
   curl /api/neuro-consults/{consult_id}
   # → all three phase fields populated; status = historian_complete
   ```
