# Handoff: Neuro Intake Engine Pipeline Fixes

**Date**: 2026-04-07
**Session**: Production debugging + pipeline flow fixes
**Deploy Target**: AWS Amplify (`d3ietjwgco4g2t`) — `app.neuroplans.app`

---

## What Was Done This Session

### 1. Fixed Triage → Historian → Pipeline Flow

**Root causes identified and fixed (builds #104–#112):**

| Issue | Root Cause | Fix | Build |
|-------|-----------|-----|-------|
| Env vars wiped | `aws amplify update-branch` REPLACES all vars | Restored all 19 env vars | #106 |
| `RDS_DATABASE=github_showcase` | Wrong DB from prior session | Changed to `ops_amplehtml` | #106 |
| 504 on triage | `BEDROCK_ACCESS_KEY_ID` undefined at build time | Created new IAM key for `opsample-bedrock`, added to Amplify | #108 |
| `22P02 invalid JSON` on triage_sessions | jsonb columns need `JSON.stringify()` but query builder skips arrays | Added `toJSON()` helper in `src/app/api/triage/route.ts` | #108 |
| Empty triage fields on consult | `TriageStepPanel` read `triageData.result.overall_tier` (undefined) | Mapped correct top-level API fields: `triageData.triage_tier`, etc. | #109 |
| Pipeline stuck on triage after completion | `triage_complete` was in triage step's statuses, causing useEffect to reset activeStep | Moved `triage_complete` to historian step's statuses in `ConsultPipelineView.tsx` | #109 |
| "OpenAI API key not configured" on historian | `OPENAI_API_KEY` missing from restored env vars | Added to Amplify env vars | #110 |
| Historian didn't advance pipeline | `NeurologicHistorian.tsx` never extracted `consult_id` from URL params | Added `searchParams.get('consult_id')` and pass to save endpoint | #111 |
| Evidence Engine KB never queried | `BEDROCK_KB_ID` not in `next.config.ts` env block | Added `BEDROCK_KB_ID: process.env.BEDROCK_KB_ID` | #111 |
| KB calls always failed silently | `opsample-bedrock` IAM user missing `bedrock:Retrieve` + `bedrock:RetrieveAndGenerate` | Added to IAM policy scoped to `knowledge-base/T4W8S8RNMN` | IAM (live) |
| Localizer always timed out | 2-second timeout for 3 sequential Bedrock calls (~7-15s total) | Increased to 15 seconds | #112 |

### 2. Current State (Post Build #112)

**Working end-to-end:**
- Triage: Bedrock Sonnet 4.6, completes in ~20-27s, saves to `triage_sessions` + creates `neurology_consults` record
- AI Historian: Opens in new tab, conducts OLDCARTS interview, saves session + links to consult via `linkHistorianToConsult()`, sets status to `historian_complete`
- Evidence Engine: IAM + env vars + timeout all fixed — KB retrieval should now work during historian interviews (fires every 3 patient turns)

**NOT working yet (see Remaining Work below):**
- Pipeline doesn't auto-advance after historian (new tab flow issue)
- Patient Tools step exists but isn't well-integrated into the flow
- Report generation untested

---

## Remaining Work

### Issue 1: Historian New-Tab Flow Breaks Pipeline Continuity

**Problem**: The historian opens in a new tab (`target="_blank"` in `HistorianStepPanel.tsx:133`). When the interview completes, `NeurologicHistorian.tsx:227` calls `router.push('/patient')` — sending the patient back to the patient portal, NOT back to the pipeline. The original pipeline tab stays on the historian step and doesn't know the interview finished.

**Files involved:**
- `src/components/consult/HistorianStepPanel.tsx:80` — builds historian URL with `consult_id` param
- `src/components/NeurologicHistorian.tsx:226-228` — `handleBackToPortal()` redirects to `/patient`
- `src/components/consult/ConsultPipelineView.tsx:87-90` — `handleHistorianComplete` manually sets `activeStep('patient_tools')`

**Fix options (pick one):**
1. **Polling approach** (simplest): Add a polling interval in `HistorianStepPanel` that checks consult status every 5s while the historian tab is open. When status becomes `historian_complete`, auto-advance to patient_tools.
2. **BroadcastChannel approach** (better UX): Use `BroadcastChannel` API to send a message from the historian tab when complete. The pipeline tab listens and auto-advances.
3. **Same-tab embed** (best UX but biggest change): Embed the historian directly in the pipeline view instead of opening a new tab.

**Recommendation**: Option 1 (polling) for now — it's 10 lines of code and handles all edge cases (tab closed, browser refreshed, etc.). The HistorianStepPanel already has an "Already Complete → Continue" button as a manual fallback.

### Issue 2: Patient Tools Step Needs `historian_complete` Status Mapping

**Problem**: In `ConsultPipelineView.tsx:21`, the patient_tools step has `statuses: []` (empty). This means `getActiveStep()` can never land on patient_tools from DB status alone — it only reaches patient_tools via the manual `setActiveStep('patient_tools')` call. If the user refreshes the page while on patient_tools, they'll jump to the report step (the fallback).

**Fix**: Add `historian_complete` to the patient_tools statuses array:
```typescript
{ id: 'patient_tools', label: 'Patient Tools', statuses: ['historian_complete'] },
```

This way, when the consult status is `historian_complete` and the page reloads, it correctly lands on the patient_tools step.

### Issue 3: Report Generation Not Tested End-to-End

**What exists:**
- `src/components/consult/ReportStepPanel.tsx` — UI with "Generate Report" button, data badges showing which sources are available, regenerate support
- `src/components/ConsultReportView.tsx` — Renders the report with collapsible sections and source badges
- `src/app/api/neuro-consults/[id]/report/route.ts` — POST generates report, GET retrieves existing
- `src/lib/consult/report/report-builder.ts` — Pure-function report builder that assembles sections from triage, historian, localizer, scales, SDNE, patient tools data

**Needs testing**: Run through triage → historian → patient tools (or skip) → generate report and verify the report builder correctly pulls data from all pipeline sources.

### Issue 4: Verify Evidence Engine KB Is Actually Being Queried

**How to verify:**
1. Run a historian interview for 3+ patient turns
2. Check CloudWatch logs at `/aws/amplify/d3ietjwgco4g2t` for `[localizer]` entries
3. Look for: KB retrieval success, `kbSources` in response, no "Step 2 (KB retrieval) failed" errors
4. The localizer response should include `partial: false` and non-empty `kbSources` + `evidenceSnippets`

**If KB fails**: Check that the IAM user can access the KB:
```bash
aws bedrock-agent retrieve-and-generate \
  --input '{"text":"migraine diagnostic criteria"}' \
  --retrieve-and-generate-configuration '{"type":"KNOWLEDGE_BASE","knowledgeBaseConfiguration":{"knowledgeBaseId":"T4W8S8RNMN","modelArn":"arn:aws:bedrock:us-east-2::foundation-model/us.anthropic.claude-sonnet-4-6"}}' \
  --region us-east-2 --profile sevaro-sandbox
```

---

## Key Architecture Notes

### Pipeline Status Machine
```
triage_pending → triage_complete → intake_pending → intake_in_progress → intake_complete
→ historian_pending → historian_in_progress → historian_complete
→ sdne_pending → sdne_complete → complete
```

### Pipeline Step → Status Mapping (ConsultPipelineView.tsx)
```typescript
triage:        ['triage_pending']
historian:     ['triage_complete', 'intake_pending', 'intake_in_progress', 'intake_complete', 'historian_pending', 'historian_in_progress', 'historian_complete']
patient_tools: []  // ← NEEDS FIX: add 'historian_complete'
report:        ['sdne_pending', 'sdne_complete', 'complete']
```

### Localizer 3-Step Pipeline (fires every 3 patient turns)
1. **Symptom extraction** — Bedrock extracts structured symptoms from transcript
2. **KB retrieval** — Evidence Engine (KB `T4W8S8RNMN`) returns guideline context
3. **Question generation** — Bedrock generates follow-up questions + differential

Timeout: 15s. Non-blocking. Results persisted to `neurology_consults` table.

### IAM User: `opsample-bedrock`
- Access key: `AKIA4WWHQVQ3RJ2FAT7H` (created 2026-04-07)
- Policy `BedrockInvokeOnly`: `InvokeModel`, `InvokeModelWithResponseStream`, `Retrieve`, `RetrieveAndGenerate`
- KB resource: `arn:aws:bedrock:us-east-2:873370528823:knowledge-base/T4W8S8RNMN`

### Amplify Env Vars (19 total — ALL must be passed in update-branch)
`OPENAI_API_KEY`, `DEEPGRAM_API_KEY`, `RDS_HOST`, `RDS_PORT`, `RDS_USER`, `RDS_PASSWORD`, `RDS_DATABASE`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `COGNITO_REGION`, `BEDROCK_ACCESS_KEY_ID`, `BEDROCK_SECRET_ACCESS_KEY`, `BEDROCK_REGION`, `BEDROCK_TRIAGE_MODEL`, `BEDROCK_KB_ID`, `COGNITO_CLIENT_SECRET`, `NEXT_PUBLIC_COGNITO_USER_POOL_ID`, `NEXT_PUBLIC_COGNITO_CLIENT_ID`, `NEXT_PUBLIC_COGNITO_REGION`

**Critical**: `aws amplify update-branch --environment-variables` REPLACES all vars (does not merge). Always pass ALL 19.

### Build-Time vs Runtime
`next.config.ts` `env:` block inlines env vars at build time via DefinePlugin. Amplify SSR does NOT inject app-level env vars at runtime. RELEASE jobs reuse old build artifacts — only git-push builds inline fresh values.

---

## Suggested Next Session Prompt

```
Continue the Neuro Intake Engine pipeline work from the handoff at:
docs/HANDOFF_2026-04-07_neuro-intake-pipeline.md

Priority fixes:
1. Add polling to HistorianStepPanel so the pipeline auto-advances when
   the historian completes in its new tab (consult status → historian_complete)
2. Add 'historian_complete' to patient_tools step statuses in ConsultPipelineView
3. Test the full pipeline end-to-end: triage → historian → patient tools → report
4. Verify Evidence Engine KB retrieval in CloudWatch logs

The triage and historian are working. The pipeline flow after historian
completion needs fixing — it doesn't return to the pipeline view or
auto-advance to patient tools.
```
