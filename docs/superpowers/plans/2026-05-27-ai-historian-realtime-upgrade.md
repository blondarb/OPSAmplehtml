# AI Historian — Realtime API + Harness Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the `/consult` AI Historian voice flow off the deprecated OpenAI Realtime API (`/v1/realtime/sessions` + `gpt-realtime`) onto the current GA surface (`/v1/realtime/client_secrets` + `/v1/realtime/calls` + `gpt-realtime-2` + `semantic_vad`), and upgrade the harness to expose 3 model-callable tools (`save_interview_output`, `query_evidence`, `scale_step`) plus an ambient Localizer push channel.

**Architecture:** Same `useRealtimeSession.ts` client + Next.js API route topology. Endpoint + model + session-schema migration. New paginated `scale_step` server route replaces the bulk-style `request_scale_administration` + `save_scale_responses` pair. Localizer findings push into the live session via `session.update` with **client-side re-serialized full instructions string** (`BASE_PROMPT + "\n\n[LATEST PUSH]\n" + delta`) — preserves base prompt + safety block, avoids timeline pollution. Demo-only scope, no PHI through OpenAI, first-encounter only.

**Tech Stack:** Next.js 15 (App Router), TypeScript, WebRTC, OpenAI Realtime API, AWS Bedrock (Knowledge Base + Claude Sonnet 4.6 via existing `src/lib/bedrock.ts`), AWS RDS (PostgreSQL via `node-postgres`), AWS Cognito (existing auth, unchanged), AWS Amplify (push-to-deploy from `main` — but this work lands on `feature/ai-historian-realtime-upgrade`, NOT main, until PR).

**Source spec:** `docs/superpowers/specs/2026-05-27-ai-historian-realtime-upgrade-design.md` (4 commits, cross-checked 2 rounds + Steve's round-3 pushback on scale completion).

**Phasing rationale (7 phases):** Gemini round 2 suggested 2 phases. Settled on 7 because each phase has a distinct verification gate that warrants a stop-and-confirm pause: pre-flight baseline, the immediate site-unblock (Phase 1), code-level prep (Phase 2), then three independent intelligence tracks (Phases 3-5), then ship (Phase 6). Splitting into 2 phases would batch 3+ unrelated changes per gate and hide regressions.

---

## Phase Map

| Phase | Goal | Verification gate | Files | Branch state at end |
|---|---|---|---|---|
| **0. Pre-flight** | Capture pre-upgrade baseline; audit schema | 5 persona transcripts on `qa/historian-baselines/2026-05-27-pre-upgrade/`; schema audit doc | qa baselines, audit notes | No code change; commit baselines only |
| **1. API migration** | Unblock the `/consult` 400 banner | Smoke S1 (page loads, voice starts on Walter persona) | `session/route.ts`, `useRealtimeSession.ts`, types, env | Site working on new API |
| **2. Prompt rewrite + tool definitions** | Define 3-tool surface + phased prompt structure | Vitest unit tests on `buildHistorianSystemPrompt` + `getHistorianToolDefinitions` | `historianPrompts.ts`, `historianTypes.ts`, tests | Tools defined; no behavior change yet |
| **3. `query_evidence` implementation** | Model can query Evidence Engine mid-session | Smoke S2 (tool fires at least once in 10-min Walter session) | `bedrock.ts` (+helper), new `evidence-query/route.ts`, `useRealtimeSession.ts` (handler) | Evidence tool live |
| **4. `scale_step` implementation** | Paginated scale admin replacing bulk pair | Migration 047 applied; smoke S3 (PHQ-9 admin via Maya with verbatim per-item pacing) | Migration 047, `scales/route.ts` (rewrite), `useRealtimeSession.ts` (handler), `EmbeddedHistorian.tsx` | Paginated scales live |
| **5. Localizer push channel** | Server-pushed differential context every 3 turns | Walter session: verify model incorporates Localizer-pushed differential in subsequent questions | `localizer/route.ts` (additive return shape), `EmbeddedHistorian.tsx` (push emit), `useRealtimeSession.ts` (re-serialize helper) | Full intelligence layer live |
| **6. Post-upgrade eval + docs + PR** | Compare pre/post on 5 personas; S4 hot-revert; open PR | Side-by-side rubric; S4 passes; PR URL returned | `qa/historian-baselines/2026-05-27-post-upgrade/`, PRD update, CHANGELOG, repo CLAUDE.md, `qa/TEST_RUNBOOK.md` | PR opened, awaiting human merge |

---

## Phase 0: Pre-flight (Baseline + Audit)

**Goal:** Lock in pre-upgrade reality before changing anything. Without this, "did we improve?" is unanswerable.

### Task 0.1: Verify feature branch + spec commits are present

**Files:** none (git inspection only)

- [ ] **Step 1: Confirm branch + commits**

Run:
```bash
cd ~/dev/repos/OPSAmplehtml
git rev-parse --abbrev-ref HEAD
git log --oneline -6 -- docs/superpowers/specs/
```

Expected:
- Branch: `feature/ai-historian-realtime-upgrade`
- Most recent 4 commits: spec creation (`8f26231`) + 3 cross-check revisions (`a35eb10`, `5ec97e4`, `71deaa6`)

If branch differs, run `git checkout feature/ai-historian-realtime-upgrade` first.

### Task 0.2: Capture pre-upgrade baseline transcripts (5 personas)

**Files:**
- Create: `qa/historian-baselines/2026-05-27-pre-upgrade/walter.json`
- Create: `qa/historian-baselines/2026-05-27-pre-upgrade/maya.json`
- Create: `qa/historian-baselines/2026-05-27-pre-upgrade/priya.json`
- Create: `qa/historian-baselines/2026-05-27-pre-upgrade/darnell.json`
- Create: `qa/historian-baselines/2026-05-27-pre-upgrade/rachel.json`

> **Note:** The site is currently broken (Step 2 throws "Failed to create realtime session: 400"). If you cannot reach a working historian flow, capture **the failure mode + final Step 1 (Triage) output + intended persona briefing** as the baseline for those personas. Document the failure explicitly. Phase 1's smoke test will verify the unblock; the eval rubric in Phase 6 will compare against Phase 0 honestly.

- [ ] **Step 1: For each persona, fill a baseline JSON**

Per persona, on the deployed `app.neuroplans.app/consult` site (current state):

For each of Walter, Maya, Priya, Darnell, Rachel:
1. Reload `/consult`, pick the persona card.
2. Read the actor briefing on the right panel (don't skip — that's the input you'll re-run in Phase 6).
3. Advance through Step 1 Triage (this currently works — the Bedrock token fix shipped earlier today).
4. Attempt Step 2 Historian. Record what happens (in current state, expected: 400 error banner — note any deviation).
5. If voice flow starts, run it 5-10 minutes, save the transcript + final structured output.

Save each as JSON with this shape:
```json
{
  "persona": "walter",
  "date": "2026-05-27",
  "phase": "pre-upgrade-baseline",
  "site_state": "step2_400_banner | functional_session_completed | other",
  "actor_briefing_copied": "<paste the full right-panel text>",
  "triage_output": { "<paste Step 1 output if reachable>" },
  "historian_session": {
    "started": false | true,
    "duration_seconds": null | <number>,
    "transcript": [] | [<array>],
    "structured_output": null | { },
    "localizer_findings_at_end": null | { },
    "scales_administered": [],
    "red_flags_surfaced": [],
    "completion_status": "n/a | complete | ended_early"
  },
  "notes": "<freeform observations: banner errors, console errors, behavior quirks>"
}
```

- [ ] **Step 2: Commit baselines**

```bash
git add qa/historian-baselines/2026-05-27-pre-upgrade/
git commit -m "qa: capture pre-upgrade baseline (5 personas) before historian Realtime API migration"
```

### Task 0.3: Audit `scale_results` schema vs paginated needs

**Files:** Create `docs/superpowers/specs/scale_results-pagination-audit-2026-05-27.md`

- [ ] **Step 1: Inspect current schema**

Run:
```bash
cd ~/dev/repos/OPSAmplehtml
cat migrations/034_scale_results.sql
```

- [ ] **Step 2: Document gaps and required migration**

Create `docs/superpowers/specs/scale_results-pagination-audit-2026-05-27.md` with this content:

```markdown
# scale_results Pagination Audit (2026-05-27)

## Current schema (migration 034)
- `raw_responses JSONB NOT NULL` — full response set, expected on insert
- `total_score INTEGER NOT NULL` — final score, expected on insert
- `interpretation TEXT NOT NULL` — final interpretation, expected on insert
- `severity_level TEXT NOT NULL` — final, expected on insert
- `completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` — assumes immediate completion
- No `status` column
- No `current_index` column

## Pagination needs
- Insert a row at scale **start** (turn N user calls `scale_step` with no prev_index)
- Update row per item answered (append to `raw_responses`, bump `current_index`)
- On final item: compute `total_score`, `interpretation`, `severity_level`, set `completed_at`, set `status=complete`

## Required migration 047 changes
- ADD COLUMN `status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','complete'))`
- ADD COLUMN `current_index INTEGER NOT NULL DEFAULT 0`
- DROP NOT NULL on `total_score`, `interpretation`, `severity_level`
- DROP DEFAULT NOW() on `completed_at` AND DROP NOT NULL (set on completion only)
- Backfill all existing rows: `UPDATE scale_results SET status='complete' WHERE status IS NULL`
- Precedent: migration 046 (triage async pattern) did exactly this for triage tables

## Notes
- `raw_responses` already JSONB — can hold partial sets without schema change
- `scoringMethod` and item ordering live in `scale-library.ts` (TypeScript), not DB
```

- [ ] **Step 3: Commit audit**

```bash
git add docs/superpowers/specs/scale_results-pagination-audit-2026-05-27.md
git commit -m "qa: audit scale_results schema for paginated scale_step (Phase 4 prep)"
```

### Phase 0 Verification Gate

Before proceeding to Phase 1:
- [ ] 5 persona baseline JSONs present in `qa/historian-baselines/2026-05-27-pre-upgrade/`
- [ ] Schema audit doc present and committed
- [ ] Two commits on feature branch (baselines + audit)

---

## Phase 1: API Migration (Unblock the 400 banner)

**Goal:** Swap deprecated OpenAI endpoints and migrate to nested session.update schema. The user-facing "Failed to create realtime session: 400" banner should disappear and the historian voice flow should start.

### Task 1.1: Add TurnDetectionConfig type + env-driven config helper

**Files:**
- Modify: `src/lib/historianTypes.ts` (append new types)

- [ ] **Step 1: Write failing test**

Create `src/lib/__tests__/historianTypes.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { getTurnDetectionConfig } from '@/lib/historianTypes'

describe('getTurnDetectionConfig', () => {
  it('returns semantic_vad with low eagerness by default', () => {
    const config = getTurnDetectionConfig(undefined)
    expect(config).toEqual({ type: 'semantic_vad', eagerness: 'low' })
  })

  it('returns semantic_vad when explicitly set', () => {
    const config = getTurnDetectionConfig('semantic_vad')
    expect(config).toEqual({ type: 'semantic_vad', eagerness: 'low' })
  })

  it('returns PR #105 server_vad tuning when explicitly set', () => {
    const config = getTurnDetectionConfig('server_vad')
    expect(config).toEqual({
      type: 'server_vad',
      threshold: 0.65,
      prefix_padding_ms: 400,
      silence_duration_ms: 1200,
    })
  })

  it('falls back to semantic_vad on unrecognized mode', () => {
    const config = getTurnDetectionConfig('garbage' as any)
    expect(config).toEqual({ type: 'semantic_vad', eagerness: 'low' })
  })
})
```

- [ ] **Step 2: Run test, verify failure**

```bash
npx vitest run src/lib/__tests__/historianTypes.test.ts
```

Expected: FAIL (`getTurnDetectionConfig` not exported)

- [ ] **Step 3: Implement in `src/lib/historianTypes.ts`**

Append to existing file:

```typescript
// ─── Turn detection config (env-driven, with PR #105 fallback) ──────────────

export type TurnDetectionMode = 'semantic_vad' | 'server_vad'

export type TurnDetectionConfig =
  | { type: 'semantic_vad'; eagerness: 'low' | 'medium' | 'high' }
  | {
      type: 'server_vad'
      threshold: number
      prefix_padding_ms: number
      silence_duration_ms: number
    }

/**
 * Resolve TurnDetectionConfig from a mode string (typically from
 * HISTORIAN_TURN_DETECTION_MODE env var or NEXT_PUBLIC_HISTORIAN_TURN_DETECTION_MODE
 * on the client). Falls back to semantic_vad on unknown input.
 *
 * server_vad params are the PR #105 tuning (speakerphone-echo-resistant).
 */
export function getTurnDetectionConfig(mode: string | undefined): TurnDetectionConfig {
  if (mode === 'server_vad') {
    return {
      type: 'server_vad',
      threshold: 0.65,
      prefix_padding_ms: 400,
      silence_duration_ms: 1200,
    }
  }
  // Default: semantic_vad with low eagerness (least likely to cut off patient)
  return { type: 'semantic_vad', eagerness: 'low' }
}
```

- [ ] **Step 4: Run test, verify pass**

```bash
npx vitest run src/lib/__tests__/historianTypes.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/historianTypes.ts src/lib/__tests__/historianTypes.test.ts
git commit -m "feat(historian): add TurnDetectionConfig type + env-driven resolver

Adds semantic_vad (default) vs server_vad mode selection per spec
Phase 1 of /consult AI Historian Realtime API upgrade. server_vad
params preserve PR #105 hand-tuning as fallback."
```

### Task 1.2: Migrate `/api/ai/historian/session` to `/v1/realtime/client_secrets`

**Files:**
- Modify: `src/app/api/ai/historian/session/route.ts` (full rewrite of the POST body)

- [ ] **Step 1: Inspect current handler**

```bash
cat src/app/api/ai/historian/session/route.ts
```

You'll see it POSTs to `https://api.openai.com/v1/realtime/sessions` with model `gpt-realtime` and a flat payload.

- [ ] **Step 2: Rewrite `session/route.ts`**

Replace the entire file with:

```typescript
import { NextResponse } from 'next/server'
import { buildHistorianSystemPrompt, getHistorianToolDefinition } from '@/lib/historianPrompts'
import type { HistorianSessionType } from '@/lib/historianTypes'
import { getTurnDetectionConfig } from '@/lib/historianTypes'
import { getOpenAIKey } from '@/lib/secrets'
import { getConsult, markHistorianStarted } from '@/lib/consult/pipeline'
import { buildHistorianContextFromConsult } from '@/lib/consult/contextBuilder'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const sessionType: HistorianSessionType = body.sessionType || 'new_patient'
    let referralReason: string | undefined = body.referralReason
    let patientContext: string | undefined = body.patientContext

    // Phase 1 pipeline: enrich the historian context with triage + intake from
    // the consult record. Caller-provided values are overridden when a consult
    // is found — the pipeline data is more authoritative.
    const consultId: string | undefined = body.consult_id
    if (consultId) {
      try {
        const consult = await getConsult(consultId)
        if (consult) {
          const consultContext = buildHistorianContextFromConsult(consult)
          referralReason = consultContext.referralReason
          patientContext = consultContext.patientContext
          await markHistorianStarted(consultId)
        }
      } catch (pipelineErr) {
        console.error('[historian/session] consult context build error (non-fatal):', pipelineErr)
      }
    }

    const apiKey = await getOpenAIKey()
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured.' },
        { status: 500 },
      )
    }

    const instructions = buildHistorianSystemPrompt(sessionType, referralReason, patientContext)
    const tools = getHistorianToolDefinition()
    const model = process.env.OPENAI_HISTORIAN_REALTIME_MODEL || 'gpt-realtime-2'
    const turnDetection = getTurnDetectionConfig(process.env.HISTORIAN_TURN_DETECTION_MODE)

    // Request an ephemeral client_secret from OpenAI's current GA endpoint.
    // Replaces the deprecated POST /v1/realtime/sessions flow.
    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session: {
          type: 'realtime',
          model,
          instructions,
          audio: {
            input: {
              turn_detection: turnDetection,
              transcription: { model: 'whisper-1' },
            },
            output: { voice: 'verse' },
          },
          tools,
        },
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error('[historian/session] OpenAI client_secrets error:', response.status, errorBody)
      // Pass the raw OpenAI error body through — do NOT collapse to a generic
      // string. Today's "Failed to create realtime session: 400" hides root causes.
      return NextResponse.json(
        {
          error: `OpenAI Realtime API returned ${response.status}`,
          openai_error: errorBody,
          status: response.status,
        },
        { status: response.status },
      )
    }

    const data = await response.json()

    return NextResponse.json({
      // Shape unchanged from client's perspective
      ephemeralKey: data.value ?? data.client_secret?.value,
      sessionId: data.session_id ?? data.id,
      expiresAt: data.expires_at ?? data.client_secret?.expires_at,
      consult_id: consultId || null,
      // Pass the resolved model + turn detection mode back so the client knows
      // exactly which configuration is active (for debugging + analytics)
      model,
      turn_detection_mode: turnDetection.type,
    })
  } catch (error: any) {
    console.error('[historian/session] API error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to create historian session' },
      { status: 500 },
    )
  }
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors related to this file. (Other files may still have errors — that's OK; just make sure this file isn't the cause.)

If errors mention `getHistorianToolDefinition` returning the wrong shape — that's expected. Phase 2 will rewrite `historianPrompts.ts` to return an array. For now, temporarily wrap the call site as: `const tools = [getHistorianToolDefinition()]` to keep the array contract.

Adjust the line above to:

```typescript
    const tools = [getHistorianToolDefinition()]
```

Re-run typecheck — should be clean now.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/ai/historian/session/route.ts
git commit -m "feat(historian): migrate session route to /v1/realtime/client_secrets

Replaces deprecated POST /v1/realtime/sessions flow. Uses nested
audio.input/output schema and env-driven model (gpt-realtime-2 default)
+ turn detection (semantic_vad default). Surfaces raw OpenAI error
body on non-2xx — no more generic 'Failed to create realtime session'
masking.

Phase 1 of /consult AI Historian Realtime API upgrade."
```

### Task 1.3: Migrate WebRTC SDP exchange in `useRealtimeSession.ts`

**Files:**
- Modify: `src/hooks/useRealtimeSession.ts` (SDP exchange section)

- [ ] **Step 1: Locate the current SDP exchange code**

```bash
grep -n "realtime/sessions\|realtime/calls\|setRemoteDescription\|setLocalDescription" src/hooks/useRealtimeSession.ts
```

Identify the lines that POST to `https://api.openai.com/v1/realtime/...` and call `setRemoteDescription`.

- [ ] **Step 2: Update the SDP exchange URL + model query param**

Find the block that looks like (line numbers approximate):

```typescript
const sdpResponse = await fetch(`${baseUrl}`, {
  method: 'POST',
  body: offer.sdp,
  headers: {
    Authorization: `Bearer ${ephemeralKey}`,
    'Content-Type': 'application/sdp',
  },
})
```

Replace with:

```typescript
// Current GA endpoint per platform.openai.com (2026-05). Model passed as
// query param. Ephemeral key is the bearer.
const realtimeModel =
  // Server returns the resolved model in the session create response (see
  // session/route.ts) — prefer that if available, fall back to env default.
  sessionResponse.model ?? 'gpt-realtime-2'

const sdpResponse = await fetch(
  `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(realtimeModel)}`,
  {
    method: 'POST',
    body: offer.sdp,
    headers: {
      Authorization: `Bearer ${ephemeralKey}`,
      'Content-Type': 'application/sdp',
    },
  },
)

if (!sdpResponse.ok) {
  const errorBody = await sdpResponse.text()
  console.error('[useRealtimeSession] SDP exchange failed:', sdpResponse.status, errorBody)
  throw new Error(`OpenAI Realtime SDP exchange returned ${sdpResponse.status}: ${errorBody}`)
}
```

Where `sessionResponse` is whatever variable currently holds the response from `POST /api/ai/historian/session` (it now also includes `model` — see Task 1.2).

- [ ] **Step 3: Update the initial `session.update` event to nested schema**

Find where the client emits the first `session.update` on the data channel (likely after `oncopen` for the data channel).

The current shape is flat:

```typescript
dataChannel.send(JSON.stringify({
  type: 'session.update',
  session: {
    instructions: ...,
    voice: 'verse',
    turn_detection: { ... },
    input_audio_transcription: { model: 'whisper-1' },
    tools: [...],
  }
}))
```

> **Note:** much of this may already be handled server-side in the new client_secrets call (Task 1.2). If the data-channel `session.update` only refreshes a subset, update only the relevant fields. The nested schema is mandatory either way.

If a data-channel `session.update` exists, change it to the nested schema:

```typescript
dataChannel.send(JSON.stringify({
  type: 'session.update',
  session: {
    instructions: <existing instructions value>,
    audio: {
      input: {
        turn_detection: <existing turn_detection value>,
        transcription: { model: 'whisper-1' },
      },
      output: { voice: 'verse' },
    },
    tools: <existing tools array>,
  },
}))
```

If no client-side `session.update` is sent (server-side handled the full config), this step is no-op — note that in the commit message.

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: clean (or only unrelated errors).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useRealtimeSession.ts
git commit -m "feat(historian): WebRTC SDP exchange to /v1/realtime/calls

Switches SDP POST from deprecated /v1/realtime/sessions to /v1/realtime/calls
?model=...; uses ephemeral key from new client_secrets flow as bearer.
Updates data-channel session.update (if present) to nested audio.input/
audio.output schema.

Phase 1 of /consult AI Historian Realtime API upgrade."
```

### Task 1.4: Update `.env.local.example` and Amplify env

**Files:**
- Modify: `.env.local.example`

- [ ] **Step 1: Append new env vars**

Append to `.env.local.example`:

```bash

# ─── AI Historian (Phase 1 of Realtime API upgrade) ─────────────────────────
# Override the model (default: gpt-realtime-2, the flagship GPT-5-class
# Realtime model). Set to 'gpt-realtime' to hot-revert to the standard GA model.
OPENAI_HISTORIAN_REALTIME_MODEL=gpt-realtime-2

# Override turn detection (default: semantic_vad). Set to 'server_vad' to
# restore the PR #105 tuning (threshold=0.65, silence_duration_ms=1200).
HISTORIAN_TURN_DETECTION_MODE=semantic_vad
```

- [ ] **Step 2: Apply to Amplify branch env (us-east-2 app d3ietjwgco4g2t)**

> **Critical:** `aws amplify update-branch` REPLACES all env vars on the branch. Pull the full set first, mutate, push.

```bash
# Pull current env (should have 19 keys from the May 27 update)
aws amplify get-branch \
  --app-id d3ietjwgco4g2t \
  --branch-name main \
  --profile sevaro-sandbox \
  --region us-east-2 \
  --query 'branch.environmentVariables' \
  --output json > /tmp/amplify-env-pre-phase1.json

# Verify 19 keys present
jq 'keys | length' /tmp/amplify-env-pre-phase1.json
# Expected: 19

# Add the 2 new keys
jq '. + {
  "OPENAI_HISTORIAN_REALTIME_MODEL": "gpt-realtime-2",
  "HISTORIAN_TURN_DETECTION_MODE": "semantic_vad"
}' /tmp/amplify-env-pre-phase1.json > /tmp/amplify-env-phase1.json

# Verify 21 keys
jq 'keys | length' /tmp/amplify-env-phase1.json
# Expected: 21

# Push
aws amplify update-branch \
  --app-id d3ietjwgco4g2t \
  --branch-name main \
  --environment-variables file:///tmp/amplify-env-phase1.json \
  --profile sevaro-sandbox \
  --region us-east-2 \
  --query 'branch.environmentVariables | keys | length' \
  --output text
# Expected: 21
```

> **Note:** the branch env above is `main`. Phase 1's code is on `feature/ai-historian-realtime-upgrade`. When the PR merges (Phase 6), the Amplify build will pick up these env vars. Adding them now is forward-compatible — no behavior change until code lands.

- [ ] **Step 3: Commit**

```bash
git add .env.local.example
git commit -m "chore(historian): add OPENAI_HISTORIAN_REALTIME_MODEL + HISTORIAN_TURN_DETECTION_MODE env vars

.env.local.example updated. Amplify branch env also updated (21 keys
total). Both keys have hot-revert fallback values documented inline."
```

### Phase 1 Verification Gate

- [ ] Server route uses `/v1/realtime/client_secrets`, NOT `/v1/realtime/sessions`
- [ ] Client SDP exchange uses `/v1/realtime/calls?model=...`
- [ ] Type-check clean (`npx tsc --noEmit`)
- [ ] All Phase 1 vitest tests pass (`npx vitest run src/lib/__tests__/historianTypes.test.ts`)
- [ ] **Smoke S1:** Run `npm run dev` locally OR observe via Amplify preview deploy — open `/consult`, pick Walter, advance through Step 1 Triage, observe Step 2 Historian. Voice prompts mic, voice greeting plays. **No 400 banner.** If banner persists, read the now-surfaced raw OpenAI error body in the response — it tells you exactly what's wrong (likely model name typo, missing nested schema, or model-not-yet-GA).
- [ ] 4 commits on feature branch (1 per task)
- [ ] **Pause for human review.** Phase 1 is the most user-visible change. Confirm voice works end-to-end before proceeding.

---

## Phase 2: Prompt Rewrite + Tool Definitions

**Goal:** Define the new 3-tool surface and phased prompt structure. No new server endpoints or client handlers yet — this phase is pure prompt-engineering + type signatures that subsequent phases consume.

### Task 2.1: Define new types for tool args + responses

**Files:**
- Modify: `src/lib/historianTypes.ts` (append)

- [ ] **Step 1: Append types**

Append to `src/lib/historianTypes.ts`:

```typescript
// ─── Tool: query_evidence ───────────────────────────────────────────────────

export type QueryEvidenceArgs = {
  question: string
  focus_diagnoses?: string[]
}

export type QueryEvidenceResponse =
  | {
      status: 'ok'
      chunks: Array<{ content: string; source: string; score?: number }>
    }
  | { status: 'timeout'; chunks: [] }
  | { status: 'error'; chunks: []; message: string }

// ─── Tool: scale_step (paginated) ───────────────────────────────────────────

export type ScaleStepArgs =
  | { scale_id: string; reason: string } // First call
  | {
      scale_id: string
      prev_index: number
      prev_response: string | number
    }

export type ScaleStepResponse =
  | {
      done: false
      index: number
      item: {
        text: string
        choices?: Array<{ label: string; value: string | number }>
        scoring_hint?: string
      }
    }
  | {
      done: true
      total_score: number
      interpretation: string
      severity_level: 'none' | 'minimal' | 'mild' | 'moderate' | 'moderately_severe' | 'severe'
    }
  | { status: 'unknown_scale'; available: string[] }
  | { status: 'bad_index'; expected_index: number }
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep -E "historianTypes|QueryEvidence|ScaleStep"
```

Expected: no errors mentioning these types (unrelated errors OK).

- [ ] **Step 3: Commit**

```bash
git add src/lib/historianTypes.ts
git commit -m "feat(historian): add QueryEvidence + ScaleStep arg/response types

Type contracts for the two new model-callable tools. No runtime
behavior yet — Phase 3 (query_evidence) and Phase 4 (scale_step)
will implement.

Phase 2 of /consult AI Historian Realtime API upgrade."
```

### Task 2.2: Write failing tests for the new prompt builder

**Files:**
- Create: `src/lib/__tests__/historianPrompts.test.ts`

- [ ] **Step 1: Write tests**

Create `src/lib/__tests__/historianPrompts.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  buildHistorianSystemPrompt,
  getHistorianToolDefinition,
} from '@/lib/historianPrompts'

describe('buildHistorianSystemPrompt', () => {
  it('includes the safety block (988 / 741741 / 911 escalation)', () => {
    const prompt = buildHistorianSystemPrompt('new_patient')
    expect(prompt).toContain('988')
    expect(prompt).toContain('741741')
    expect(prompt).toContain('911')
  })

  it('includes the phased interview structure (Phase 1 turns 1-3, Phase 2 turns 4+)', () => {
    const prompt = buildHistorianSystemPrompt('new_patient')
    expect(prompt).toMatch(/Phase 1.*turns? 1.*3/i)
    expect(prompt).toMatch(/Phase 2.*turns? 4/i)
  })

  it('lists the soft turn budget (15-25)', () => {
    const prompt = buildHistorianSystemPrompt('new_patient')
    expect(prompt).toMatch(/15.*25/)
  })

  it('lists neurology focus conditions', () => {
    const prompt = buildHistorianSystemPrompt('new_patient')
    expect(prompt).toMatch(/migraine|cluster|tension/i)
    expect(prompt).toMatch(/seizure|epilep/i)
    expect(prompt).toMatch(/parkinson|essential tremor|movement/i)
    expect(prompt).toMatch(/stroke|tia/i)
  })

  it('contains the OLDCARTS framework guidance', () => {
    const prompt = buildHistorianSystemPrompt('new_patient')
    expect(prompt).toMatch(/onset/i)
    expect(prompt).toMatch(/character/i)
    expect(prompt).toMatch(/severity/i)
  })

  it('mentions the 3 tools by name (save_interview_output, query_evidence, scale_step)', () => {
    const prompt = buildHistorianSystemPrompt('new_patient')
    expect(prompt).toContain('save_interview_output')
    expect(prompt).toContain('query_evidence')
    expect(prompt).toContain('scale_step')
  })

  it('embeds referralReason when provided', () => {
    const prompt = buildHistorianSystemPrompt('new_patient', 'progressive hand tremor')
    expect(prompt).toContain('progressive hand tremor')
  })

  it('embeds patientContext when provided', () => {
    const prompt = buildHistorianSystemPrompt('new_patient', undefined, '72M, retired machinist')
    expect(prompt).toContain('72M, retired machinist')
  })
})

describe('getHistorianToolDefinition', () => {
  it('returns an array of exactly 3 tools', () => {
    const tools = getHistorianToolDefinition()
    expect(Array.isArray(tools)).toBe(true)
    expect(tools).toHaveLength(3)
  })

  it('exposes save_interview_output, query_evidence, scale_step by name', () => {
    const tools = getHistorianToolDefinition()
    const names = tools.map((t: any) => t.name).sort()
    expect(names).toEqual(['query_evidence', 'save_interview_output', 'scale_step'])
  })

  it('save_interview_output requires chief_complaint, hpi, narrative_summary, safety_escalated', () => {
    const tools = getHistorianToolDefinition()
    const tool = tools.find((t: any) => t.name === 'save_interview_output')
    expect(tool).toBeDefined()
    expect(tool!.parameters.required).toEqual(
      expect.arrayContaining(['chief_complaint', 'hpi', 'narrative_summary', 'safety_escalated']),
    )
  })

  it('query_evidence requires question, allows focus_diagnoses optional', () => {
    const tools = getHistorianToolDefinition()
    const tool = tools.find((t: any) => t.name === 'query_evidence')
    expect(tool).toBeDefined()
    expect(tool!.parameters.required).toEqual(['question'])
    expect(tool!.parameters.properties.focus_diagnoses).toBeDefined()
  })

  it('scale_step requires scale_id, allows prev_index/prev_response optional', () => {
    const tools = getHistorianToolDefinition()
    const tool = tools.find((t: any) => t.name === 'scale_step')
    expect(tool).toBeDefined()
    expect(tool!.parameters.required).toEqual(expect.arrayContaining(['scale_id']))
    expect(tool!.parameters.properties.prev_index).toBeDefined()
    expect(tool!.parameters.properties.prev_response).toBeDefined()
  })
})
```

- [ ] **Step 2: Run tests, verify failure**

```bash
npx vitest run src/lib/__tests__/historianPrompts.test.ts
```

Expected: FAIL (current `historianPrompts.ts` returns one tool, has different prompt structure)

### Task 2.3: Rewrite `historianPrompts.ts` to match new tests

**Files:**
- Modify: `src/lib/historianPrompts.ts` (full rewrite)

- [ ] **Step 1: Replace file content**

Replace the entire `src/lib/historianPrompts.ts` with:

```typescript
/**
 * System prompts and tool definitions for the AI Neurologic Historian.
 *
 * v2 (2026-05-27): Phased prompt structure, 3-tool surface
 * (save_interview_output, query_evidence, scale_step).
 *
 * See docs/superpowers/specs/2026-05-27-ai-historian-realtime-upgrade-design.md
 */

import type { HistorianSessionType } from './historianTypes'

const CORE_PROMPT = `You are a compassionate, professional AI medical historian conducting a neurological intake interview. Your role is to gather a thorough clinical history from the patient before they see their neurologist.

CRITICAL RULES:
1. Ask ONE question at a time. Wait for the patient to respond before asking the next question.
2. Use patient-friendly language. Avoid medical jargon. If you must use a medical term, explain it simply.
3. NEVER provide diagnoses, medical opinions, or treatment advice. You are gathering information, not interpreting it.
4. NEVER say "it sounds like you might have..." or suggest what a condition could be.
5. If asked for medical advice, say: "That's a great question for your neurologist. I'll make sure to include it in your notes."
6. Be warm and empathetic. Acknowledge the patient's concerns.
7. Keep responses concise — typically 1-2 sentences plus your next question.
8. If the patient gives a vague answer, ask one follow-up to clarify, then move on.

INTERVIEW BUDGET: Aim for 15-25 turns total. Quality over coverage. Call save_interview_output when you have clinical clarity — not when you have ticked every box.

NEUROLOGY FOCUS: Be alert for these condition categories — they shape what to ask and what red flags to surface:
- Primary headache disorders (migraine with/without aura, cluster, tension)
- Secondary headache red flags: thunderclap onset, focal deficit, papilledema, "worst headache of life", new headache age >50
- Seizure semiology (focal vs generalized, aura, automatisms, post-ictal state)
- Movement disorders (essential tremor vs Parkinsonism — action vs rest tremor)
- MS / demyelinating disease (transient optic symptoms, ascending paresthesias)
- Peripheral neuropathy (stocking-glove distribution, length-dependence)
- Cognitive impairment (vascular vs Alzheimer vs Lewy body — onset, course, hallmark features)
- Stroke / TIA history (sudden focal deficit, time-windowed)
- Neuromuscular weakness (fatigability, proximal vs distal)

SAFETY MONITORING:
If the patient expresses ANY of the following, IMMEDIATELY respond with the safety protocol:
- Suicidal ideation ("I want to die", "I want to hurt myself", "I don't want to be here anymore")
- Homicidal ideation ("I want to hurt someone")
- Active emergency symptoms ("I'm having the worst headache of my life RIGHT NOW", "I can't move my arm RIGHT NOW", "I'm having a seizure")

SAFETY RESPONSE (use this EXACT format):
"I hear you, and I want to make sure you get the right help immediately. Please call 911 if this is a medical emergency, or call 988 (Suicide & Crisis Lifeline) if you're having thoughts of harming yourself. You can also text HOME to 741741 for the Crisis Text Line. Your safety is the most important thing right now."

After delivering the safety response, call the save_interview_output tool with safety_escalated set to true.`

const PHASED_INTERVIEW_STRUCTURE = `INTERVIEW STRUCTURE (phased):

Phase 1 — Turns 1 to 3 (open exploration, NO tool calls):
- Warm greeting; ask the patient to describe why they are seeing a neurologist today.
- Begin to characterize the chief complaint with OLDCARTS:
   • Onset — when did this start; sudden vs gradual
   • Location — where do they feel it
   • Duration — how long each episode lasts; how long overall
   • Character — what does it feel like (sharp, dull, throbbing, etc.)
   • Aggravating / Relieving factors — what makes it worse / better
   • Timing — pattern, time of day, frequency
   • Severity — 0-10 scale at worst and on average
- Goal of Phase 1: enough signal for the background Localizer to form a real differential. Do NOT call any tools during these 3 turns.

Phase 2 — Turn 4 onward (tool-augmented refinement):
- Targeted follow-ups informed by the Localizer's pushed differential (you will see [LATEST LOCALIZER PUSH] context in your instructions, refreshed every 3 turns).
- Use query_evidence sparingly when you encounter a Red Flag you are unsure how to triage, or a rare neurology edge case (e.g., specific drug-drug interaction, syndrome variant). Before calling query_evidence, say ONE brief conversational filler line (e.g., "Let me check my reference on that — one second.") to mask the round-trip latency.
- Use scale_step when the differential meaningfully implicates a standardized scale:
   • Headache → MIDAS or HIT-6
   • Cognitive complaint → MoCA or Mini-Cog
   • Mood symptoms → PHQ-9 or GAD-7
   • Sleep / fatigue → ESS
   The tool returns one item at a time. Recite each item VERBATIM. Wait for the patient's response. Call scale_step again with prev_response. Continue until done.
- Continue refining the history until you can write a clinically useful HPI (typically by turn 15-25).

When you have sufficient clarity, call save_interview_output. Do not feel obligated to fill every field — narrative quality matters more than field coverage.`

// ─── Tools ──────────────────────────────────────────────────────────────────

const SAVE_INTERVIEW_OUTPUT_TOOL = {
  type: 'function' as const,
  name: 'save_interview_output',
  description:
    'Save the structured interview output when the interview is complete or when safety escalation is triggered. Call this when you have gathered enough information OR when a safety concern is identified.',
  parameters: {
    type: 'object',
    properties: {
      chief_complaint: { type: 'string', description: 'Brief chief complaint in clinical language' },
      hpi: { type: 'string', description: 'History of present illness narrative, written in clinical style' },
      onset: { type: 'string', description: 'When symptoms started' },
      location: { type: 'string', description: 'Location of symptoms' },
      duration: { type: 'string', description: 'Duration of symptoms' },
      character: { type: 'string', description: 'Character/quality of symptoms' },
      aggravating_factors: { type: 'string', description: 'What makes symptoms worse' },
      relieving_factors: { type: 'string', description: 'What makes symptoms better' },
      timing: { type: 'string', description: 'Pattern/frequency of symptoms' },
      severity: { type: 'string', description: 'Severity rating and description' },
      associated_symptoms: { type: 'string', description: 'Associated symptoms' },
      current_medications: { type: 'string', description: 'Current medications with dosages if known' },
      allergies: { type: 'string', description: 'Known allergies' },
      past_medical_history: { type: 'string', description: 'Relevant past medical history' },
      past_surgical_history: { type: 'string', description: 'Past surgical history' },
      family_history: { type: 'string', description: 'Relevant family history' },
      social_history: { type: 'string', description: 'Social history including occupation, substances' },
      review_of_systems: { type: 'string', description: 'Focused review of systems findings' },
      functional_status: { type: 'string', description: 'Impact on daily activities' },
      interval_changes: { type: 'string', description: 'Changes since last visit (follow-up only)' },
      treatment_response: { type: 'string', description: 'Response to current treatment (follow-up only)' },
      new_symptoms: { type: 'string', description: 'New symptoms since last visit (follow-up only)' },
      medication_changes: { type: 'string', description: 'Medication changes requested or made (follow-up only)' },
      side_effects: { type: 'string', description: 'Medication side effects reported (follow-up only)' },
      narrative_summary: { type: 'string', description: 'Brief narrative summary of the interview for the physician' },
      red_flags: {
        type: 'array',
        description: 'Any clinical red flags identified during the interview',
        items: {
          type: 'object',
          properties: {
            flag: { type: 'string', description: 'The red flag finding' },
            severity: { type: 'string', enum: ['high', 'medium', 'low'] },
            context: { type: 'string', description: 'Context from the interview' },
          },
          required: ['flag', 'severity', 'context'],
        },
      },
      safety_escalated: { type: 'boolean', description: 'Whether safety escalation was triggered' },
    },
    required: ['chief_complaint', 'hpi', 'narrative_summary', 'safety_escalated'],
  },
}

const QUERY_EVIDENCE_TOOL = {
  type: 'function' as const,
  name: 'query_evidence',
  description: [
    'Query the Sevaro Evidence Engine for clinical guidance you do not already know.',
    '',
    'DO NOT call this tool to ask about the differentials, suggested questions, or suggested scales pushed by the Localizer — those come from this same KB and re-querying wastes time. Rely on your base knowledge for standard clinical criteria (e.g., OLDCARTS, common ICD-10 features, well-known drug classes).',
    '',
    'ONLY call query_evidence when:',
    ' - the patient describes a symptom you would flag as a Red Flag and you are uncertain how to triage it (e.g., thunderclap onset, focal deficit, atypical aura pattern)',
    ' - a rare neurology edge case appears (e.g., a specific drug-drug interaction, a syndrome variant you would want to look up before continuing)',
    '',
    'When you call this tool, say ONE brief conversational filler line to the patient FIRST (e.g., "Let me check my reference on that — one second.") before issuing the call. This masks the round-trip latency.',
  ].join('\n'),
  parameters: {
    type: 'object',
    properties: {
      question: {
        type: 'string',
        description: 'Natural-language clinical question to query the Evidence Engine.',
      },
      focus_diagnoses: {
        type: 'array',
        items: { type: 'string' },
        description: 'Diagnoses currently under consideration (helps the KB narrow results).',
      },
    },
    required: ['question'],
  },
}

const SCALE_STEP_TOOL = {
  type: 'function' as const,
  name: 'scale_step',
  description: [
    'Step through a clinical scale one item at a time. The server enforces single-item pacing — you receive ONE item per call, making bulk reading impossible.',
    '',
    'Flow:',
    ' - First call: pass {scale_id, reason}. Server returns first item.',
    ' - Subsequent calls: pass {scale_id, prev_index, prev_response}. Server records the previous answer in the DB AND returns the next item.',
    ' - Server signals completion: {done: true, total_score, interpretation}. On done, recite the interpretation if appropriate, then continue the interview.',
    '',
    'STRICT VERBATIM RULE on the returned item.text — instrument validity depends on this:',
    ' - Output ONLY the exact item.text string from the server.',
    ' - Do NOT prefix with "Okay,", "Alright,", "Here is the next question,", or any other filler.',
    ' - Do NOT paraphrase, summarize, or rephrase to be friendlier.',
    ' - Yield the floor IMMEDIATELY after reciting — wait for the patient response, then call scale_step again.',
    ' - Between items, the only insertion allowed is recording the patient response into prev_response on the next call.',
  ].join('\n'),
  parameters: {
    type: 'object',
    properties: {
      scale_id: {
        type: 'string',
        description: 'One of: phq9, gad7, moca, minicog, midas, hit6, ess (lowercase).',
      },
      reason: {
        type: 'string',
        description:
          'On the first call only: one sentence why this scale fits the current presentation.',
      },
      prev_index: {
        type: 'integer',
        description:
          'On subsequent calls: the index of the item just answered (zero-based). Omit on first call.',
      },
      prev_response: {
        description:
          'On subsequent calls: the patient response. String for free-text scales, integer for Likert. Omit on first call.',
      },
    },
    required: ['scale_id'],
  },
}

// ─── Exports ────────────────────────────────────────────────────────────────

export function buildHistorianSystemPrompt(
  sessionType: HistorianSessionType,
  referralReason?: string,
  patientContext?: string,
): string {
  let prompt = CORE_PROMPT + '\n\n' + PHASED_INTERVIEW_STRUCTURE

  if (sessionType === 'follow_up') {
    prompt +=
      '\n\nFOLLOW-UP NOTE: Adapt Phase 1 to ask about interval changes since the last visit, treatment response, medication adherence, side effects, and new symptoms. Keep Phase 2 the same.'
  }

  if (referralReason) {
    prompt += `\n\nREFERRAL REASON: ${referralReason}\nUse this to guide Phase 1 questioning. Start by asking the patient about the reason they were referred.`
  }

  if (patientContext) {
    prompt += `\n\nPATIENT CONTEXT:\n${patientContext}`
  }

  return prompt
}

export function getHistorianToolDefinition() {
  // Returns an array now (was a single tool in v1). Callers that previously
  // wrapped this in [getHistorianToolDefinition()] must drop the wrapper.
  return [SAVE_INTERVIEW_OUTPUT_TOOL, QUERY_EVIDENCE_TOOL, SCALE_STEP_TOOL]
}
```

- [ ] **Step 2: Run tests, verify pass**

```bash
npx vitest run src/lib/__tests__/historianPrompts.test.ts
```

Expected: All 14 tests pass.

- [ ] **Step 3: Update call site in session/route.ts (drop the temp wrapper from Task 1.2 step 3)**

If you wrapped `const tools = [getHistorianToolDefinition()]` in Task 1.2 step 3, change it back to:

```typescript
const tools = getHistorianToolDefinition()
```

(It now returns an array natively.)

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/historianPrompts.ts src/lib/__tests__/historianPrompts.test.ts src/app/api/ai/historian/session/route.ts
git commit -m "feat(historian): rewrite prompt + define 3-tool surface

- CORE_PROMPT + new PHASED_INTERVIEW_STRUCTURE (turns 1-3 open
  exploration, turns 4+ tool-augmented)
- 15-25 turn soft budget; neurology focus list (headache, seizure,
  movement, MS, neuropathy, cognitive, stroke, NMD)
- Tool surface: save_interview_output (unchanged), query_evidence
  (new, with restrictive trigger guidance), scale_step (new, paginated)
- getHistorianToolDefinition now returns array of 3 tools
- 14 vitest tests covering prompt structure + tool shape

Phase 2 of /consult AI Historian Realtime API upgrade. No new runtime
behavior yet — Phases 3-5 wire the tool handlers."
```

### Phase 2 Verification Gate

- [ ] All `historianPrompts.test.ts` tests pass (14 tests)
- [ ] All `historianTypes.test.ts` tests still pass (4 tests, no regression)
- [ ] Type-check clean
- [ ] Tools defined: 3 total (`save_interview_output`, `query_evidence`, `scale_step`)
- [ ] Prompt has Phase 1 / Phase 2 structure
- [ ] **Pause for human review** of the prompt content — the wording matters for demo quality. Read `historianPrompts.ts` end-to-end and confirm tone/content.

---

## Phase 3: `query_evidence` Implementation

**Goal:** Wire the model-callable Evidence Engine query end-to-end. Model can ask the KB clinical questions; server returns chunks; result delivered back via WebRTC data channel.

### Task 3.1: Add `retrieveChunksFromKB()` helper (Retrieve-only, not RetrieveAndGenerate)

**Files:**
- Modify: `src/lib/bedrock.ts` (append helper)
- Create: `src/lib/__tests__/bedrock-retrieveChunks.test.ts`

- [ ] **Step 1: Inspect existing `retrieveFromKB` for the import pattern**

```bash
grep -n "RetrieveAndGenerateCommand\|BedrockAgentRuntimeClient\|RetrieveCommand" src/lib/bedrock.ts
```

Note the existing imports.

- [ ] **Step 2: Write failing test**

Create `src/lib/__tests__/bedrock-retrieveChunks.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the AWS SDK before importing the module under test
vi.mock('@aws-sdk/client-bedrock-agent-runtime', () => {
  const RetrieveCommand = vi.fn().mockImplementation((input: any) => ({ input }))
  const BedrockAgentRuntimeClient = vi.fn().mockImplementation(() => ({
    send: vi.fn(async (cmd: any) => ({
      retrievalResults: [
        {
          content: { text: 'Migraine red flags include thunderclap onset.' },
          location: { s3Location: { uri: 's3://kb/migraine-redflags.md' } },
          score: 0.92,
        },
        {
          content: { text: 'Aura without headache is rare but reported.' },
          location: { s3Location: { uri: 's3://kb/aura-variants.md' } },
          score: 0.81,
        },
      ],
    })),
  }))
  return { BedrockAgentRuntimeClient, RetrieveCommand }
})

import { retrieveChunksFromKB } from '@/lib/bedrock'

describe('retrieveChunksFromKB', () => {
  beforeEach(() => {
    process.env.BEDROCK_REGION = 'us-east-2'
  })

  it('returns chunk objects shaped {content, source, score}', async () => {
    const result = await retrieveChunksFromKB({
      knowledgeBaseId: 'T4W8S8RNMN',
      query: 'migraine red flags',
      maxResults: 5,
    })
    expect(result.chunks).toHaveLength(2)
    expect(result.chunks[0]).toMatchObject({
      content: expect.stringContaining('thunderclap'),
      source: expect.stringContaining('migraine-redflags'),
      score: 0.92,
    })
  })

  it('defaults maxResults to 5', async () => {
    const result = await retrieveChunksFromKB({
      knowledgeBaseId: 'T4W8S8RNMN',
      query: 'migraine red flags',
    })
    expect(result.chunks.length).toBeLessThanOrEqual(5)
  })
})
```

- [ ] **Step 3: Run, verify failure**

```bash
npx vitest run src/lib/__tests__/bedrock-retrieveChunks.test.ts
```

Expected: FAIL (`retrieveChunksFromKB` not exported).

- [ ] **Step 4: Append helper to `src/lib/bedrock.ts`**

Append at the end of `src/lib/bedrock.ts`:

```typescript
// ─── Retrieve-only KB query (no synthesis) ──────────────────────────────────
// Sibling of retrieveFromKB(). Skips the RetrieveAndGenerate step — returns
// raw chunks for the caller to synthesize in-context. ~5× faster than the
// full RetrieveAndGenerate flow because no generation step is invoked.
// Used by the AI Historian's query_evidence tool where latency matters.

import { RetrieveCommand } from '@aws-sdk/client-bedrock-agent-runtime'

export interface KBChunkRetrievalOptions {
  knowledgeBaseId: string
  query: string
  /** Default 5 (matches KB_RESULTS in localizer route for consistency) */
  maxResults?: number
}

export interface KBChunk {
  content: string
  source: string
  score?: number
}

export interface KBChunkRetrievalResult {
  chunks: KBChunk[]
}

export async function retrieveChunksFromKB(
  opts: KBChunkRetrievalOptions,
): Promise<KBChunkRetrievalResult> {
  const region = process.env.BEDROCK_REGION || 'us-east-2'
  // Reuse the client constructor pattern from retrieveFromKB
  // (already imported as BedrockAgentRuntimeClient at top of file).
  const { BedrockAgentRuntimeClient } = await import('@aws-sdk/client-bedrock-agent-runtime')
  const client = new BedrockAgentRuntimeClient({ region })

  const cmd = new RetrieveCommand({
    knowledgeBaseId: opts.knowledgeBaseId,
    retrievalQuery: { text: opts.query },
    retrievalConfiguration: {
      vectorSearchConfiguration: { numberOfResults: opts.maxResults ?? 5 },
    },
  })

  const response: any = await client.send(cmd as any)
  const chunks: KBChunk[] = (response.retrievalResults ?? []).map((r: any) => ({
    content: r.content?.text ?? '',
    source: r.location?.s3Location?.uri ?? r.location?.webLocation?.url ?? 'unknown',
    score: r.score,
  }))

  return { chunks }
}
```

- [ ] **Step 5: Run test, verify pass**

```bash
npx vitest run src/lib/__tests__/bedrock-retrieveChunks.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/bedrock.ts src/lib/__tests__/bedrock-retrieveChunks.test.ts
git commit -m "feat(bedrock): add retrieveChunksFromKB (Retrieve-only, no synthesis)

Sibling of retrieveFromKB. Returns raw KB chunks for callers to synthesize
in-context. ~5x faster than RetrieveAndGenerate; used by the historian's
query_evidence tool where latency matters.

Phase 3 of /consult AI Historian Realtime API upgrade."
```

### Task 3.2: Create `/api/ai/historian/evidence-query/route.ts`

**Files:**
- Create: `src/app/api/ai/historian/evidence-query/route.ts`
- Create: `src/app/api/ai/historian/evidence-query/__tests__/route.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/app/api/ai/historian/evidence-query/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/bedrock', () => ({
  retrieveChunksFromKB: vi.fn(),
}))
vi.mock('@/lib/cognito/server', () => ({
  getUser: vi.fn(),
}))

import { POST } from '@/app/api/ai/historian/evidence-query/route'
import { retrieveChunksFromKB } from '@/lib/bedrock'
import { getUser } from '@/lib/cognito/server'

const buildReq = (body: any): Request =>
  new Request('http://localhost/api/ai/historian/evidence-query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/ai/historian/evidence-query', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.BEDROCK_KB_ID = 'T4W8S8RNMN'
    ;(getUser as any).mockResolvedValue({ email: 'steve@sevaro.com' })
  })

  it('401s when not authenticated', async () => {
    ;(getUser as any).mockResolvedValue(null)
    const res = await POST(buildReq({ question: 'q' }))
    expect(res.status).toBe(401)
  })

  it('400s when question missing', async () => {
    const res = await POST(buildReq({}))
    expect(res.status).toBe(400)
  })

  it('returns chunks on success', async () => {
    ;(retrieveChunksFromKB as any).mockResolvedValue({
      chunks: [{ content: 'thunderclap', source: 's3://x', score: 0.9 }],
    })
    const res = await POST(buildReq({ question: 'migraine red flags' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.status).toBe('ok')
    expect(json.chunks).toHaveLength(1)
  })

  it('returns timeout shape if AbortController fires', async () => {
    // Simulate the Bedrock call rejecting with an AbortError
    ;(retrieveChunksFromKB as any).mockRejectedValue(
      Object.assign(new Error('aborted'), { name: 'AbortError' }),
    )
    const res = await POST(buildReq({ question: 'migraine' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.status).toBe('timeout')
    expect(json.chunks).toEqual([])
  })
})
```

- [ ] **Step 2: Run test, verify failure**

```bash
npx vitest run src/app/api/ai/historian/evidence-query/__tests__/route.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Create the route handler**

Create `src/app/api/ai/historian/evidence-query/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { retrieveChunksFromKB } from '@/lib/bedrock'
import { getUser } from '@/lib/cognito/server'
import type { QueryEvidenceArgs, QueryEvidenceResponse } from '@/lib/historianTypes'

const TIMEOUT_MS = 5000

export async function POST(request: Request) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ status: 'error', message: 'unauthorized' }, { status: 401 })
  }

  let body: QueryEvidenceArgs
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ status: 'error', message: 'invalid json' }, { status: 400 })
  }

  if (!body.question || typeof body.question !== 'string') {
    return NextResponse.json(
      { status: 'error', message: 'question is required' },
      { status: 400 },
    )
  }

  const kbId = process.env.BEDROCK_KB_ID
  if (!kbId) {
    return NextResponse.json(
      { status: 'error', message: 'BEDROCK_KB_ID not configured' },
      { status: 500 },
    )
  }

  // 5-second timeout. AWS SDK v3 supports AbortSignal on send(); but for
  // simplicity here we race against a timer.
  const timeoutPromise = new Promise<QueryEvidenceResponse>((resolve) =>
    setTimeout(() => resolve({ status: 'timeout', chunks: [] }), TIMEOUT_MS),
  )

  try {
    const queryPromise = retrieveChunksFromKB({
      knowledgeBaseId: kbId,
      query: body.question,
      maxResults: 5,
    }).then(
      (r) => ({ status: 'ok' as const, chunks: r.chunks }),
    )

    const result = await Promise.race([queryPromise, timeoutPromise])
    return NextResponse.json(result, { status: 200 })
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return NextResponse.json<QueryEvidenceResponse>(
        { status: 'timeout', chunks: [] },
        { status: 200 },
      )
    }
    console.error('[evidence-query] error:', err)
    return NextResponse.json<QueryEvidenceResponse>(
      { status: 'error', chunks: [], message: err?.message ?? 'unknown error' },
      { status: 200 },
    )
  }
}
```

- [ ] **Step 4: Run test, verify pass**

```bash
npx vitest run src/app/api/ai/historian/evidence-query/__tests__/route.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/ai/historian/evidence-query/route.ts src/app/api/ai/historian/evidence-query/__tests__/route.test.ts
git commit -m "feat(historian): add /api/ai/historian/evidence-query endpoint

Server handler for the model-callable query_evidence tool. Wraps
retrieveChunksFromKB with 5s timeout (per spec; Gemini cross-check
round 1 bumped from initial 3s). Auth via getUser; returns
{status:'ok'|'timeout'|'error', chunks:[]}.

Phase 3 of /consult AI Historian Realtime API upgrade."
```

### Task 3.3: Wire `query_evidence` tool-call handler in `useRealtimeSession.ts`

**Files:**
- Modify: `src/hooks/useRealtimeSession.ts`

- [ ] **Step 1: Locate existing tool-call handler**

```bash
grep -n "item.name ===\|tool_call\|function_call\|save_interview_output" src/hooks/useRealtimeSession.ts | head -20
```

Find the switch/if block that handles tool calls from the model on the data channel.

- [ ] **Step 2: Add a `query_evidence` branch**

Inside the existing tool-call handler (next to the `save_interview_output` and `save_scale_responses` branches), add:

```typescript
// ── query_evidence ──
if (item.name === 'query_evidence') {
  try {
    const args = JSON.parse(item.arguments)
    const res = await fetch('/api/ai/historian/evidence-query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: args.question,
        focus_diagnoses: args.focus_diagnoses,
      }),
    })
    const result = await res.json()

    // Send the tool result back to the model over the data channel
    dataChannel.send(
      JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: item.call_id,
          output: JSON.stringify(result),
        },
      }),
    )
    // Prompt the model to continue speaking
    dataChannel.send(JSON.stringify({ type: 'response.create' }))
  } catch (err) {
    console.error('[useRealtimeSession] query_evidence handler error:', err)
    dataChannel.send(
      JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: item.call_id,
          output: JSON.stringify({ status: 'error', chunks: [], message: 'client error' }),
        },
      }),
    )
    dataChannel.send(JSON.stringify({ type: 'response.create' }))
  }
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useRealtimeSession.ts
git commit -m "feat(historian): wire query_evidence tool-call handler

Client-side handler that POSTs to /api/ai/historian/evidence-query
and feeds the result back over the WebRTC data channel as a
function_call_output, then nudges the model to continue.

Phase 3 of /consult AI Historian Realtime API upgrade."
```

### Phase 3 Verification Gate

- [ ] All Phase 3 vitest tests pass (6 new tests across 2 files)
- [ ] Type-check clean
- [ ] **Smoke S2:** Deploy a preview (or `npm run dev`), run Walter persona for ~10 minutes asking about thunderclap headaches OR atypical aura. Confirm `query_evidence` fires at least once. Check the Network panel for a POST to `/api/ai/historian/evidence-query`. Confirm response is `{status:'ok', chunks:[...]}` not 401/timeout.
- [ ] 3 commits on feature branch in Phase 3
- [ ] **Pause for human review** of model behavior — does it call `query_evidence` appropriately, or over/under-call? Adjust prompt wording if needed (in `historianPrompts.ts`, the QUERY_EVIDENCE_TOOL description).

---

## Phase 4: `scale_step` Implementation (Paginated Scales)

**Goal:** Replace bulk-style scale admin with paginated per-item retrieval. Server enforces one-item-per-call pacing. Partial responses survive mid-scale termination.

### Task 4.1: Migration 047 — add `status` + `current_index` to `scale_results`

**Files:**
- Create: `migrations/047_scale_results_pagination.sql`

- [ ] **Step 1: Write migration SQL**

Create `migrations/047_scale_results_pagination.sql`:

```sql
-- Migration 047: scale_results pagination — paginated scale_step support
-- Lets scale_results rows live in 'in_progress' state with partial responses,
-- bumping current_index per item answered. On final item, total_score +
-- interpretation + severity_level + completed_at get populated and status
-- flips to 'complete'.
--
-- Run: psql $RDS_URL -f migrations/047_scale_results_pagination.sql
-- Rollback: see DROP statements at the bottom

-- Add status + current_index columns
ALTER TABLE scale_results
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'complete'
    CHECK (status IN ('in_progress', 'complete'));

ALTER TABLE scale_results
  ADD COLUMN IF NOT EXISTS current_index INTEGER NOT NULL DEFAULT 0;

-- Backfill existing rows as 'complete' (they were all bulk-inserted)
UPDATE scale_results SET status = 'complete' WHERE status IS NULL;

-- Relax NOT NULL on fields that aren't populated until completion
ALTER TABLE scale_results ALTER COLUMN total_score    DROP NOT NULL;
ALTER TABLE scale_results ALTER COLUMN interpretation DROP NOT NULL;
ALTER TABLE scale_results ALTER COLUMN severity_level DROP NOT NULL;

-- completed_at already has DEFAULT NOW() — drop the default + NOT NULL so
-- in-progress rows don't get an artificial timestamp
ALTER TABLE scale_results ALTER COLUMN completed_at DROP DEFAULT;
ALTER TABLE scale_results ALTER COLUMN completed_at DROP NOT NULL;

-- Index for finding the in-progress row for a session/scale
CREATE INDEX IF NOT EXISTS idx_scale_results_in_progress
  ON scale_results (historian_session_id, scale_id)
  WHERE status = 'in_progress';

-- ─── Rollback ───────────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS idx_scale_results_in_progress;
-- ALTER TABLE scale_results ALTER COLUMN completed_at SET NOT NULL;
-- ALTER TABLE scale_results ALTER COLUMN completed_at SET DEFAULT NOW();
-- ALTER TABLE scale_results ALTER COLUMN severity_level SET NOT NULL;
-- ALTER TABLE scale_results ALTER COLUMN interpretation SET NOT NULL;
-- ALTER TABLE scale_results ALTER COLUMN total_score    SET NOT NULL;
-- ALTER TABLE scale_results DROP COLUMN current_index;
-- ALTER TABLE scale_results DROP COLUMN status;
```

- [ ] **Step 2: Apply to RDS staging DB**

> **Ask Steve for the RDS connection string before running.** The repo CLAUDE.md indicates AWS RDS is the production DB; do not run migrations against prod without explicit approval. If you have a staging DB endpoint, use it.

```bash
# Apply (with explicit confirmation in commit message)
psql "$RDS_URL" -f migrations/047_scale_results_pagination.sql
```

- [ ] **Step 3: Verify**

```bash
psql "$RDS_URL" -c "\\d scale_results" | grep -E "status|current_index|total_score"
```

Expected output shows:
- `status TEXT NOT NULL DEFAULT 'complete'::text`
- `current_index INTEGER NOT NULL DEFAULT 0`
- `total_score INTEGER` (no `NOT NULL`)

- [ ] **Step 4: Commit**

```bash
git add migrations/047_scale_results_pagination.sql
git commit -m "feat(db): migration 047 — paginate scale_results (status + current_index)

Enables paginated scale_step admin: rows can live in 'in_progress' with
partial raw_responses until the final item, then flip to 'complete' with
total_score + interpretation + severity_level populated. Backfills existing
rows as 'complete'. Drops NOT NULL on result fields and completed_at.

Pattern mirrors migration 046 (triage async+polling NOT NULL drops).

Phase 4 of /consult AI Historian Realtime API upgrade."
```

### Task 4.2: Rewrite `/api/ai/historian/scales/route.ts` for paginated semantics

**Files:**
- Modify: `src/app/api/ai/historian/scales/route.ts` (full rewrite of POST handler)

- [ ] **Step 1: Read current handler**

```bash
cat src/app/api/ai/historian/scales/route.ts
```

The current handler has `?action=request` and `?action=submit` (or similar). The new handler is one path: POST with `{scale_id, prev_index?, prev_response?}`.

- [ ] **Step 2: Replace handler**

Replace `src/app/api/ai/historian/scales/route.ts` POST handler with:

```typescript
import { NextResponse } from 'next/server'
import { getUser } from '@/lib/cognito/server'
import { from } from '@/lib/db-query'
import { ALL_SCALES } from '@/lib/consult/scales/scale-library'
import type { ScaleStepArgs, ScaleStepResponse } from '@/lib/historianTypes'

export async function POST(request: Request) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ status: 'error', message: 'unauthorized' }, { status: 401 })
  }

  let body: ScaleStepArgs & { historian_session_id?: string; consult_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ status: 'error', message: 'invalid json' }, { status: 400 })
  }

  const scaleId = (body as any).scale_id?.toLowerCase?.()
  if (!scaleId) {
    return NextResponse.json(
      { status: 'error', message: 'scale_id required' },
      { status: 400 },
    )
  }

  const scale = ALL_SCALES.find((s: any) => s.id === scaleId)
  if (!scale) {
    return NextResponse.json<ScaleStepResponse>(
      { status: 'unknown_scale', available: ALL_SCALES.map((s: any) => s.id) },
      { status: 200 },
    )
  }

  const items: Array<{ id: string; text: string; choices?: any[] }> = scale.questions ?? []
  if (items.length === 0) {
    return NextResponse.json(
      { status: 'error', message: `scale ${scaleId} has no items` },
      { status: 500 },
    )
  }

  const isFirstCall = (body as any).prev_index == null

  if (isFirstCall) {
    // Insert new in-progress row; return item 0
    const sessionId = body.historian_session_id
    if (!sessionId) {
      return NextResponse.json(
        { status: 'error', message: 'historian_session_id required on first call' },
        { status: 400 },
      )
    }

    await from('scale_results').insert({
      historian_session_id: sessionId,
      consult_id: body.consult_id ?? null,
      scale_id: scale.id,
      scale_name: scale.name,
      scale_abbreviation: scale.abbreviation,
      raw_responses: JSON.stringify({}),
      status: 'in_progress',
      current_index: 0,
      admin_mode: 'voice_administrable',
    })

    return NextResponse.json<ScaleStepResponse>(
      {
        done: false,
        index: 0,
        item: { text: items[0].text, choices: items[0].choices },
      },
      { status: 200 },
    )
  }

  // Subsequent call: record prev_response, return next item
  const prevIndex = (body as any).prev_index as number
  const prevResponse = (body as any).prev_response
  const sessionId = body.historian_session_id

  // Find the in-progress row
  const rows = await from('scale_results').select({
    where: {
      historian_session_id: sessionId,
      scale_id: scale.id,
      status: 'in_progress',
    },
  })

  if (!rows || rows.length === 0) {
    return NextResponse.json<ScaleStepResponse>(
      { status: 'bad_index', expected_index: 0 },
      { status: 200 },
    )
  }

  const row = rows[0]
  if (row.current_index !== prevIndex) {
    return NextResponse.json<ScaleStepResponse>(
      { status: 'bad_index', expected_index: row.current_index },
      { status: 200 },
    )
  }

  // Record response into raw_responses JSONB
  const responses = typeof row.raw_responses === 'string'
    ? JSON.parse(row.raw_responses)
    : row.raw_responses || {}
  responses[items[prevIndex].id] = prevResponse

  const nextIndex = prevIndex + 1
  const isLast = nextIndex >= items.length

  if (!isLast) {
    await from('scale_results').update(
      {
        raw_responses: JSON.stringify(responses),
        current_index: nextIndex,
      },
      { where: { id: row.id } },
    )

    return NextResponse.json<ScaleStepResponse>(
      {
        done: false,
        index: nextIndex,
        item: { text: items[nextIndex].text, choices: items[nextIndex].choices },
      },
      { status: 200 },
    )
  }

  // Final item: score + complete
  const totalScore = scoreScale(scale, responses)
  const interpretation = interpretScale(scale, totalScore)
  const severityLevel = severityFor(scale, totalScore)

  await from('scale_results').update(
    {
      raw_responses: JSON.stringify(responses),
      current_index: nextIndex,
      total_score: totalScore,
      interpretation,
      severity_level: severityLevel,
      completed_at: new Date().toISOString(),
      status: 'complete',
    },
    { where: { id: row.id } },
  )

  return NextResponse.json<ScaleStepResponse>(
    { done: true, total_score: totalScore, interpretation, severity_level: severityLevel as any },
    { status: 200 },
  )
}

// ─── Scoring helpers (lightweight; reuse scale-library scoring if present) ──

function scoreScale(scale: any, responses: Record<string, any>): number {
  // Most scales: sum of numeric responses.
  // scale-library.ts may expose a scoring function; if so, prefer it.
  if (typeof scale.score === 'function') return scale.score(responses)
  const values = Object.values(responses).map((v: any) =>
    typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v) ? parseInt(v, 10) : 0,
  )
  return values.reduce((a, b) => a + b, 0)
}

function interpretScale(scale: any, score: number): string {
  if (typeof scale.interpret === 'function') return scale.interpret(score)
  return `Score: ${score}`
}

function severityFor(scale: any, score: number): string {
  if (typeof scale.severity === 'function') return scale.severity(score)
  return 'none'
}
```

> **Note:** The scoring helpers (`scoreScale`, `interpretScale`, `severityFor`) currently fall back to "sum + stub" when scale-library doesn't expose a function. **Inspect `src/lib/consult/scales/scale-library.ts` and `src/lib/scales/scale-definitions.ts`** — if those exports already include scoring methods (e.g., PHQ-9 severity bands), import and use them directly. Update the helpers to call the library's scoring once verified. (Don't write your own PHQ-9 thresholds — instrument validity matters.)

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Resolve any errors. If `from(...).select({where:...})` shape differs from how the rest of the codebase uses it, look at `src/lib/db-query.ts` and adjust to match.

- [ ] **Step 4: Test against staging DB**

Manual integration check (no vitest mock — exercise the live DB):

```bash
# Generate a fake historian session ID for the test
SESSION_ID=$(uuidgen)
echo "Testing scale_step with session $SESSION_ID"

# First call
curl -X POST http://localhost:3000/api/ai/historian/scales \
  -H "Content-Type: application/json" \
  -b "<paste-your-cognito-cookie>" \
  -d "{\"scale_id\":\"phq9\",\"reason\":\"test\",\"historian_session_id\":\"$SESSION_ID\"}"
# Expected: { "done": false, "index": 0, "item": { "text": "...", "choices": [...] } }

# Second call (answer item 0 with value 2)
curl -X POST http://localhost:3000/api/ai/historian/scales \
  -H "Content-Type: application/json" \
  -b "<paste-your-cognito-cookie>" \
  -d "{\"scale_id\":\"phq9\",\"prev_index\":0,\"prev_response\":2,\"historian_session_id\":\"$SESSION_ID\"}"
# Expected: { "done": false, "index": 1, "item": ... }

# Verify the row in DB:
psql "$RDS_URL" -c "SELECT id, scale_id, status, current_index, raw_responses FROM scale_results WHERE historian_session_id = '$SESSION_ID'"
# Expected: status='in_progress', current_index=1, raw_responses has 1 entry
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/ai/historian/scales/route.ts
git commit -m "feat(historian): rewrite /api/ai/historian/scales for paginated scale_step

Replaces bulk request_scale_administration + save_scale_responses pair.
Single POST endpoint accepting {scale_id, prev_index?, prev_response?}:
 - First call inserts in-progress row, returns item 0
 - Subsequent calls record prev response into raw_responses JSONB and
   return next item
 - On final item, scores the scale and flips status to complete

Returns {done:false, index, item} | {done:true, total_score,
interpretation, severity_level} | {status:'unknown_scale', available} |
{status:'bad_index', expected_index}.

Phase 4 of /consult AI Historian Realtime API upgrade."
```

### Task 4.3: Replace `save_scale_responses` handler with `scale_step` handler in `useRealtimeSession.ts`

**Files:**
- Modify: `src/hooks/useRealtimeSession.ts`

- [ ] **Step 1: Locate the current handler**

```bash
grep -n "save_scale_responses\|injectScaleAdministration\|scale" src/hooks/useRealtimeSession.ts | head -30
```

You'll find:
- A branch handling `save_scale_responses` (around line 495 per spec)
- An `injectScaleAdministration` helper
- A scale-tracking ref set (`injectedScaleIdsRef`)

- [ ] **Step 2: Remove the old branch + helper**

Delete (or comment out then delete in a follow-up commit, your call) the `save_scale_responses` tool-call branch and the `injectScaleAdministration` function. Keep the `injectedScaleIdsRef` set — repurpose it for `scale_step` completion tracking.

- [ ] **Step 3: Add the `scale_step` branch**

In the tool-call handler section (next to where you added `query_evidence` in Phase 3), add:

```typescript
// ── scale_step ──
if (item.name === 'scale_step') {
  try {
    const args = JSON.parse(item.arguments)
    const res = await fetch('/api/ai/historian/scales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...args,
        historian_session_id: historianSessionIdRef.current, // existing ref
        consult_id: consultIdRef.current,                    // existing ref
      }),
    })
    const result = await res.json()

    // Track completed scales for the parent component
    if (result?.done === true && typeof args.scale_id === 'string') {
      injectedScaleIdsRef.current.add(args.scale_id)
      // Notify parent
      onScaleCompleted?.({
        scale_id: args.scale_id,
        total_score: result.total_score,
        interpretation: result.interpretation,
        severity_level: result.severity_level,
      })
    }

    dataChannel.send(
      JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: item.call_id,
          output: JSON.stringify(result),
        },
      }),
    )
    dataChannel.send(JSON.stringify({ type: 'response.create' }))
  } catch (err) {
    console.error('[useRealtimeSession] scale_step handler error:', err)
    dataChannel.send(
      JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: item.call_id,
          output: JSON.stringify({ status: 'error', message: 'client error' }),
        },
      }),
    )
    dataChannel.send(JSON.stringify({ type: 'response.create' }))
  }
}
```

> **Note:** The `onScaleCompleted` callback should already exist (it was the destination for the old `save_scale_responses` flow). If its signature differs from the shape above, adapt the call site — but don't change the callback contract without updating `EmbeddedHistorian.tsx` accordingly.

- [ ] **Step 4: Update `EmbeddedHistorian.tsx` if needed**

```bash
grep -n "onScaleCompleted\|/api/ai/historian/scales\?action=" src/components/consult/EmbeddedHistorian.tsx
```

Remove any code that POSTs to `?action=submit` or `?action=request`. The new scale_step flow is fully owned by the model + the rewritten server route. EmbeddedHistorian's role narrows to: receive `onScaleCompleted` callbacks and reflect them in the UI.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useRealtimeSession.ts src/components/consult/EmbeddedHistorian.tsx
git commit -m "feat(historian): wire scale_step handler; remove bulk admin paths

- Adds client-side scale_step tool-call handler that proxies to
  /api/ai/historian/scales and feeds result back via WebRTC data channel
- Removes save_scale_responses tool branch and injectScaleAdministration
  helper (subsumed by scale_step's paginated flow)
- Removes EmbeddedHistorian's ?action=request and ?action=submit POSTs

Phase 4 of /consult AI Historian Realtime API upgrade."
```

### Phase 4 Verification Gate

- [ ] Migration 047 applied to staging RDS
- [ ] `scale_step` POST endpoint returns the right shape for first call AND subsequent calls AND final call (verify via curl integration test in Task 4.2 Step 4)
- [ ] Type-check clean
- [ ] **Smoke S3:** On a deployed preview, run Maya persona (episodic migraine — should trigger MIDAS or HIT-6). Manually steer to a mood symptom and verify model administers PHQ-9 via `scale_step`. In the captured transcript, confirm: (a) each item is recited verbatim against `scale-library.ts` source, (b) the model paused after each item for patient response — NO bursts of multiple items, (c) at the end, the final result includes `total_score` and an interpretation string.
- [ ] 3 commits on feature branch in Phase 4
- [ ] **Pause for human review.** Scale administration validity is the highest-stakes piece of this work. Confirm a complete PHQ-9 ran end-to-end before proceeding.

---

## Phase 5: Localizer Push Channel

**Goal:** Every 3 turns, after the Localizer pipeline completes server-side, push the differential + suggested-next-question + suggested-scale into the live OpenAI session as updated instructions. Client re-serializes the full BASE_PROMPT + delta and emits `session.update`. Avoids both timeline pollution (Gemini round 2 finding) and base-prompt overwrite-loss.

### Task 5.1: Extend `/api/ai/historian/localizer/route.ts` response shape with explicit push payload

**Files:**
- Modify: `src/app/api/ai/historian/localizer/route.ts`

- [ ] **Step 1: Read current response shape**

```bash
tail -80 src/app/api/ai/historian/localizer/route.ts
```

Identify what the route currently returns (differential, questions, etc.).

- [ ] **Step 2: Append a `push_payload` field to the response**

In the response-builder section of `localizer/route.ts`, add:

```typescript
// Push payload — client serializes this into the session.update instructions
// delta. Kept as a separate field so client doesn't need to know the full
// localizer shape.
const push_payload = {
  turn_count: turnCount,
  top_differentials: differential
    ?.slice(0, 3)
    ?.map((d: any) => `${d.diagnosis} (${d.confidence ?? 'medium'})`)
    ?? [],
  suggested_next_question: generatedQuestions?.[0]?.text ?? null,
  suggested_scale_id: suggestedScaleId ?? null,
}

return NextResponse.json({
  ...existingPayload,  // whatever the current return is
  push_payload,
})
```

Adjust to match the existing variable names in the file (`differential`, `generatedQuestions`, etc. — look at the actual file).

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected: clean (or only unrelated errors).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/ai/historian/localizer/route.ts
git commit -m "feat(historian): localizer route returns push_payload for session.update

Adds an additive push_payload field to the localizer response:
{ turn_count, top_differentials, suggested_next_question, suggested_scale_id }.
Client uses this to re-serialize the historian instructions string and emit
session.update on the WebRTC data channel.

Phase 5 of /consult AI Historian Realtime API upgrade."
```

### Task 5.2: Add `pushLocalizerContext()` helper in `useRealtimeSession.ts`

**Files:**
- Modify: `src/hooks/useRealtimeSession.ts`

- [ ] **Step 1: Find the section where the initial instructions string is built**

The session/route.ts builds the initial instructions server-side. The client doesn't currently rebuild it. We need the client to know `BASE_PROMPT` for re-serialization. Two options:
1. Have the server return `instructions` in the session create response so the client can store it.
2. Have the client know how to build it.

Option 1 is simpler (no duplication of prompt-building logic). Update `session/route.ts` to also return `base_instructions: instructions` in the JSON response.

- [ ] **Step 2: Update `session/route.ts` to return `base_instructions`**

In `src/app/api/ai/historian/session/route.ts`, in the `NextResponse.json({...})` block at the end of the success path, add:

```typescript
    return NextResponse.json({
      ephemeralKey: data.value ?? data.client_secret?.value,
      sessionId: data.session_id ?? data.id,
      expiresAt: data.expires_at ?? data.client_secret?.expires_at,
      consult_id: consultId || null,
      model,
      turn_detection_mode: turnDetection.type,
      // NEW: expose the resolved instructions so the client can re-serialize
      // them when pushing Localizer context updates (Phase 5 of the upgrade).
      base_instructions: instructions,
    })
```

- [ ] **Step 3: Add `pushLocalizerContext` helper in the hook**

In `src/hooks/useRealtimeSession.ts`, add a new function exposed by the hook:

```typescript
// Inside the hook, after the existing data channel setup:
const baseInstructionsRef = useRef<string>('')

// In the session-create handler (where you store ephemeralKey + sessionId):
baseInstructionsRef.current = sessionResponse.base_instructions ?? ''

// New function exposed:
const pushLocalizerContext = useCallback(
  (pushPayload: {
    turn_count: number
    top_differentials: string[]
    suggested_next_question: string | null
    suggested_scale_id: string | null
  }) => {
    if (!dataChannelRef.current || dataChannelRef.current.readyState !== 'open') return
    if (!baseInstructionsRef.current) return

    const delta = [
      `[LATEST LOCALIZER PUSH @ turn ${pushPayload.turn_count}]`,
      `- Top differentials: ${pushPayload.top_differentials.join(', ') || '(none yet)'}`,
      `- Suggested next question: ${pushPayload.suggested_next_question ?? '(none)'}`,
      `- Suggested scale to consider: ${pushPayload.suggested_scale_id ?? '(none)'}`,
    ].join('\n')

    const updatedInstructions = baseInstructionsRef.current + '\n\n' + delta

    try {
      dataChannelRef.current.send(
        JSON.stringify({
          type: 'session.update',
          session: { instructions: updatedInstructions },
        }),
      )
    } catch (err) {
      console.error('[useRealtimeSession] pushLocalizerContext failed:', err)
      // Non-fatal — interview continues on previous instructions
    }
  },
  [],
)

// Export it from the hook:
return {
  // ...existing exports
  pushLocalizerContext,
}
```

Adjust variable names (`dataChannelRef`, `sessionResponse`) to match the existing code.

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useRealtimeSession.ts src/app/api/ai/historian/session/route.ts
git commit -m "feat(historian): add pushLocalizerContext helper

Adds a hook-exposed helper that re-serializes the historian instructions
(BASE_PROMPT + latest Localizer push delta) and emits a session.update
event on the WebRTC data channel. Avoids both base-prompt overwrite-loss
(would-be effect of session.update with just the delta) and timeline
pollution (would-be effect of conversation.item.create with role:'system'
every 3 turns) — see spec cross-check round 2 audit trail.

session/route.ts now also returns base_instructions in the session
create response so the client can re-serialize without duplicating
prompt-building logic.

Phase 5 of /consult AI Historian Realtime API upgrade."
```

### Task 5.3: Call `pushLocalizerContext` from `EmbeddedHistorian` after each Localizer response

**Files:**
- Modify: `src/components/consult/EmbeddedHistorian.tsx`

- [ ] **Step 1: Find where Localizer responses are consumed**

```bash
grep -n "localizer\|/api/ai/historian/localizer" src/components/consult/EmbeddedHistorian.tsx
```

Identify the handler that processes the Localizer response (likely in the turn-counter / poll logic).

- [ ] **Step 2: Call the push helper after each Localizer response**

In the Localizer-response handler, after the existing UI-state update, add:

```typescript
// Push Localizer findings into the live session as updated instructions.
// Additive only — non-fatal if push fails.
if (response?.push_payload && realtimeSession?.pushLocalizerContext) {
  realtimeSession.pushLocalizerContext(response.push_payload)
}
```

Where `realtimeSession` is the destructured `useRealtimeSession()` return value.

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/consult/EmbeddedHistorian.tsx
git commit -m "feat(historian): wire EmbeddedHistorian to call pushLocalizerContext

After each Localizer response is consumed for UI updates, also push the
findings into the live OpenAI session as a re-serialized instructions
delta. Non-fatal if push fails.

Phase 5 of /consult AI Historian Realtime API upgrade — completes the
intelligence layer."
```

### Phase 5 Verification Gate

- [ ] Type-check clean
- [ ] **Smoke (manual):** On a deployed preview, run Walter for ~5 minutes. Open DevTools → Network → WebSocket frames OR Console with verbose logging. Observe at turn ~3-4 a `session.update` event going out with `session.instructions` ending in `[LATEST LOCALIZER PUSH @ turn 3]\n- Top differentials: ...`. Confirm the model's subsequent questions reflect the differential (e.g., if Localizer says "essential tremor leading," the model should start asking ET-specific differentiators like alcohol response, hand vs head tremor, family history depth).
- [ ] 3 commits on feature branch in Phase 5
- [ ] **Pause for human review.** This is the most behaviorally-impactful change — confirm model intelligence has visibly improved on at least one persona before declaring Phase 5 done.

---

## Phase 6: Post-Upgrade Eval + Docs + PR

**Goal:** Capture the post-upgrade transcripts, run smoke S4 (hot-revert), update all docs, open the PR. No code changes in this phase except doc updates and config.

### Task 6.1: Capture post-upgrade baseline (5 personas, same as Phase 0)

**Files:**
- Create: `qa/historian-baselines/2026-05-27-post-upgrade/walter.json`
- Create: `qa/historian-baselines/2026-05-27-post-upgrade/maya.json`
- Create: `qa/historian-baselines/2026-05-27-post-upgrade/priya.json`
- Create: `qa/historian-baselines/2026-05-27-post-upgrade/darnell.json`
- Create: `qa/historian-baselines/2026-05-27-post-upgrade/rachel.json`

- [ ] **Step 1: Run each persona on the upgraded site**

Same shape as Phase 0 Task 0.2. Use the SAME actor briefings (already saved in pre-upgrade JSONs). Capture the same artifact set.

- [ ] **Step 2: Build a side-by-side rubric file**

Create `qa/historian-baselines/RUBRIC_2026-05-27.md`:

```markdown
# Historian Upgrade Rubric — 2026-05-27

| Dimension | Walter pre / post | Maya pre / post | Priya pre / post | Darnell pre / post | Rachel pre / post |
|---|---|---|---|---|---|
| Turns to chief-complaint clarity | / | / | / | / | / |
| Localizer top-1 differential accuracy at session end | / | / | / | / | / |
| Scales administered (correct set?) | / | / | / | / | / |
| Red flags surfaced | / | / | / | / | / |
| Redundant questions (count) | / | / | / | / | / |
| Average turn latency | / | / | / | / | / |
| Tool-use counts (query_evidence / scale_step items) | / | / | / | / | / |
| Scale-item pacing: pause between items? | / | / | / | / | / |
| Scale completion rate (% reaching done:true) | / | / | / | / | / |

## Pass criteria
- Non-regression on at least 4 of 7 dimensions
- No dimension regresses more than 1 step
- Red flags previously surfaced still surface (or: red flags missed pre still missed — not gaining false positives)

## Findings
<paste qualitative observations>
```

- [ ] **Step 3: Fill in the rubric**

Side-by-side review the pre- vs post-upgrade JSONs. Fill numbers + observations.

- [ ] **Step 4: Commit**

```bash
git add qa/historian-baselines/2026-05-27-post-upgrade/ qa/historian-baselines/RUBRIC_2026-05-27.md
git commit -m "qa: post-upgrade historian baseline + side-by-side rubric

Captured all 5 personas (Walter, Maya, Priya, Darnell, Rachel) on the
upgraded historian flow. Rubric scores pre vs post across 9 dimensions.

Phase 6 of /consult AI Historian Realtime API upgrade."
```

### Task 6.2: Run smoke S4 (hot-revert flag works)

- [ ] **Step 1: Flip turn detection to server_vad**

```bash
# Build env update (preserve existing 21 keys)
aws amplify get-branch --app-id d3ietjwgco4g2t --branch-name main \
  --profile sevaro-sandbox --region us-east-2 \
  --query 'branch.environmentVariables' --output json > /tmp/env-revert.json
jq '.HISTORIAN_TURN_DETECTION_MODE = "server_vad"' /tmp/env-revert.json > /tmp/env-revert2.json
aws amplify update-branch --app-id d3ietjwgco4g2t --branch-name main \
  --environment-variables file:///tmp/env-revert2.json \
  --profile sevaro-sandbox --region us-east-2
```

(Or do this in a preview deploy if PR is preview-built — not on main yet.)

- [ ] **Step 2: Deploy + verify**

Start a fresh Walter session. In the network trace, confirm the `/api/ai/historian/session` response now contains `turn_detection_mode: "server_vad"` (we added this field in Phase 1 Task 1.2). Observe in WebRTC data channel that turn-end behavior matches PR #105 tuning (longer silence threshold, less semantic interrupt risk).

- [ ] **Step 3: Restore default**

```bash
jq '.HISTORIAN_TURN_DETECTION_MODE = "semantic_vad"' /tmp/env-revert.json > /tmp/env-restore.json
aws amplify update-branch --app-id d3ietjwgco4g2t --branch-name main \
  --environment-variables file:///tmp/env-restore.json \
  --profile sevaro-sandbox --region us-east-2
```

- [ ] **Step 4: Record S4 result in the rubric file**

Append to `qa/historian-baselines/RUBRIC_2026-05-27.md`:

```markdown
## Smoke S4 — Hot-revert flag verification

- Set `HISTORIAN_TURN_DETECTION_MODE=server_vad` via amplify update-branch
- Deployed; confirmed session create response shows `turn_detection_mode: "server_vad"`
- Observed turn-detection behavior matches PR #105 tuning
- Restored to `semantic_vad`. Result: PASS.
```

- [ ] **Step 5: Commit**

```bash
git add qa/historian-baselines/RUBRIC_2026-05-27.md
git commit -m "qa: smoke S4 — hot-revert flag verified working

HISTORIAN_TURN_DETECTION_MODE env flag confirmed reversible without code
change. Session-create response surfaces the active mode for debugging.

Phase 6 of /consult AI Historian Realtime API upgrade."
```

### Task 6.3: Update documentation

**Files:**
- Modify: `docs/PRD_AI_HISTORIAN.md`
- Modify: `docs/CHANGELOG.md`
- Modify: `CLAUDE.md` (repo)
- Modify: `qa/TEST_RUNBOOK.md`

- [ ] **Step 1: Append a change note to `docs/PRD_AI_HISTORIAN.md`**

Append:

```markdown

## 2026-05-27 — Realtime API + Harness Upgrade

- **API migration:** `/v1/realtime/sessions` (deprecated) → `/v1/realtime/client_secrets` + `/v1/realtime/calls`. Nested `session.update` schema with `audio.input`/`audio.output` grouping.
- **Model:** `gpt-realtime` → `gpt-realtime-2` (flagship GPT-5-class). Env-flag reversible via `OPENAI_HISTORIAN_REALTIME_MODEL`.
- **Turn detection:** `server_vad` (PR #105 hand-tuned) → `semantic_vad` (default). Env-flag reversible via `HISTORIAN_TURN_DETECTION_MODE`.
- **Tools:** Consolidated from 4 (save_interview_output, save_scale_responses, request_scale_administration, plus the prior bulk-style) to **3** (save_interview_output, query_evidence, scale_step). `query_evidence` is a new model-callable Evidence Engine query (Retrieve-only via Bedrock KB, 5s timeout, filler-line UX). `scale_step` is paginated — one item per call, instrument validity preserved via STRICT VERBATIM RULE in the tool description.
- **Prompt:** Phased structure (turns 1-3 open exploration, turns 4+ tool-augmented), 15-25 turn soft budget, neurology focus list (headache / seizure / movement / MS / neuropathy / cognitive / stroke / NMD).
- **Localizer push channel:** After each Localizer run (every 3 turns), client re-serializes BASE_PROMPT + delta and emits `session.update` to update the model's working instructions. Preserves base prompt + safety block AND avoids timeline pollution.
- **Scope guards:** Demo-only (no PHI through OpenAI). First-encounter history-taking only. Multi-modal / prior-visits remain out of scope as future agents.

Migration 047 added paginated state columns to `scale_results` (`status`, `current_index`). Existing rows backfilled as `complete`.

See:
- Spec: `docs/superpowers/specs/2026-05-27-ai-historian-realtime-upgrade-design.md`
- Plan: `docs/superpowers/plans/2026-05-27-ai-historian-realtime-upgrade.md`
- Pre/post baselines: `qa/historian-baselines/`
```

- [ ] **Step 2: Append a CHANGELOG entry**

Append to `docs/CHANGELOG.md`:

```markdown

## 2026-05-27 — AI Historian Realtime API + Harness Upgrade

Demo-only (no PHI). First-encounter history-taking flow at `/consult` Step 2.

- Migrated OpenAI Realtime API: `/v1/realtime/sessions` → `/v1/realtime/client_secrets` + `/v1/realtime/calls`; model `gpt-realtime` → `gpt-realtime-2`; nested session schema; `semantic_vad` default.
- New model-callable tools: `query_evidence` (Bedrock KB Retrieve-only, 5s timeout), `scale_step` (paginated, replaces `request_scale_administration` + `save_scale_responses`).
- New Localizer push channel: re-serialized BASE_PROMPT + delta via `session.update` every 3 turns.
- Phased system prompt (turns 1-3 open, turns 4+ tool-augmented); 15-25 turn soft budget; neurology focus list.
- Migration 047: `scale_results.status` + `scale_results.current_index` for paginated state. Existing rows backfilled `complete`.
- Env flags for hot-revert: `OPENAI_HISTORIAN_REALTIME_MODEL`, `HISTORIAN_TURN_DETECTION_MODE`.
- Pre/post baselines + side-by-side rubric in `qa/historian-baselines/`.

PR: <will fill in after Task 6.4>
```

- [ ] **Step 3: Append a "Recent Changes" entry to repo `CLAUDE.md`**

In the "Recent Changes (Summary)" section of `/Users/stevearbogast/dev/repos/OPSAmplehtml/CLAUDE.md`, prepend:

```markdown
- **AI Historian Realtime API + Harness Upgrade (2026-05-27)**: Demo-only `/consult` Step 2 historian migrated to OpenAI's current GA Realtime API (`client_secrets` + `/calls` + `gpt-realtime-2` + `semantic_vad`). Tool surface consolidated to 3 (save_interview_output, query_evidence, scale_step — paginated). New Localizer push channel via re-serialized session.update. Phased prompt structure with neurology focus. Migration 047 added paginated state to `scale_results`. Env flags `OPENAI_HISTORIAN_REALTIME_MODEL` / `HISTORIAN_TURN_DETECTION_MODE` for hot-revert. Spec + plan + cross-check audit trail + pre/post eval rubric all in `docs/superpowers/` and `qa/historian-baselines/`.

```

- [ ] **Step 4: Update `qa/TEST_RUNBOOK.md` with S1-S4**

Append new smoke cases:

```markdown

## Historian Realtime API Upgrade — Smoke Cases (added 2026-05-27)

### S1 — Historian voice flow starts (replaces prior 400-banner failure)
- Open `/consult`, pick Walter persona.
- Advance through Step 1 Triage (should succeed via Bedrock fix shipped 2026-05-27).
- Advance to Step 2 Historian. Click Start Voice Interview.
- **Pass:** Mic prompts, voice greeting plays, no error banner.
- **Fail:** Banner shows OpenAI error body — read it, fix accordingly.

### S2 — `query_evidence` fires
- Run Walter for ~10 min asking ambiguous neurology questions (e.g., "what counts as a thunderclap headache vs migraine?").
- **Pass:** DevTools Network shows at least one POST to `/api/ai/historian/evidence-query` returning `{status:'ok', chunks:[...]}`.
- **Fail:** Tool never fires (prompt too restrictive) OR fires too often (prompt not restrictive enough).

### S3 — `scale_step` administers a scale with per-item pacing
- Run Maya persona; steer to mood symptoms to trigger PHQ-9.
- **Pass:** Transcript shows: each item recited verbatim (string-compare against `scale-library.ts`), each item followed by a patient response before the next item appears, final `{done:true, total_score, interpretation}` recorded in `scale_results` with `status='complete'`.
- **Fail:** Model burst-reads multiple items (instrument validity broken) OR scale never reaches `done:true`.

### S4 — Hot-revert flag works
- Set `HISTORIAN_TURN_DETECTION_MODE=server_vad` in Amplify branch env. Redeploy.
- **Pass:** New session-create response shows `turn_detection_mode: "server_vad"`. Turn-end behavior matches PR #105 tuning (longer silence threshold).
- **Fail:** Flag has no effect — check env propagation, redeploy, retry.
```

- [ ] **Step 5: Commit doc updates**

```bash
git add docs/PRD_AI_HISTORIAN.md docs/CHANGELOG.md CLAUDE.md qa/TEST_RUNBOOK.md
git commit -m "docs: historian upgrade — PRD + CHANGELOG + repo CLAUDE.md + QA runbook

Per repo Documentation Update Policy ('docs ship with code'). Captures
the API migration, new tool surface, Localizer push channel, migration
047, env flags, and 4 new smoke cases (S1-S4).

Phase 6 of /consult AI Historian Realtime API upgrade."
```

### Task 6.4: Push feature branch + open PR (do NOT auto-merge)

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feature/ai-historian-realtime-upgrade
```

- [ ] **Step 2: Open PR via gh**

```bash
gh pr create --title "feat(/consult): AI Historian Realtime API + harness upgrade" --body "$(cat <<'EOF'
## Summary

Migrates `/consult` Step 2 AI Historian off the deprecated OpenAI Realtime API surface and upgrades the harness with model-callable Evidence Engine queries, paginated standardized-scale administration, and an ambient Localizer push channel.

- **API:** `/v1/realtime/sessions` (deprecated) → `/v1/realtime/client_secrets` + `/v1/realtime/calls`; model `gpt-realtime` → `gpt-realtime-2`; nested `audio.input`/`audio.output` schema; `semantic_vad` (default) with `server_vad` hot-revert.
- **Tools (3, down from 4):** `save_interview_output` (unchanged), `query_evidence` (new, Bedrock KB Retrieve-only, 5s timeout), `scale_step` (new, paginated, replaces `request_scale_administration` + `save_scale_responses`).
- **Localizer push:** re-serialized `BASE_PROMPT + [LATEST PUSH]` via `session.update` every 3 turns. Avoids both overwrite-loss and timeline pollution per cross-check round 2 finding.
- **Prompt:** phased structure (turns 1-3 open, turns 4+ tool-augmented), 15-25 turn soft budget, neurology focus list.
- **Migration 047:** `scale_results.status` + `current_index` for paginated state.
- **Scope guards:** demo-only (no PHI through OpenAI), first-encounter only, multi-modal + prior-visits are explicitly future agents.

Spec: [`docs/superpowers/specs/2026-05-27-ai-historian-realtime-upgrade-design.md`](docs/superpowers/specs/2026-05-27-ai-historian-realtime-upgrade-design.md) (4 commits, 2 cross-check rounds + Steve's round-3 pushback documented in audit trail)
Plan: [`docs/superpowers/plans/2026-05-27-ai-historian-realtime-upgrade.md`](docs/superpowers/plans/2026-05-27-ai-historian-realtime-upgrade.md) (7 phases, all gates passed)
Baselines + rubric: [`qa/historian-baselines/`](qa/historian-baselines/)

## Test plan

- [ ] **S1 — Historian starts:** Walter persona, voice flow launches, no error banner
- [ ] **S2 — `query_evidence` fires:** at least one tool call in a 10-min Walter session
- [ ] **S3 — `scale_step` paginates correctly:** PHQ-9 on Maya, each item verbatim, pause between items, `done:true` at end
- [ ] **S4 — Hot-revert flag works:** flip `HISTORIAN_TURN_DETECTION_MODE=server_vad`, redeploy, verify
- [ ] **Eval rubric non-regression** — see `qa/historian-baselines/RUBRIC_2026-05-27.md`; required: non-regression on ≥4 of 7 dimensions

## Watch-items (not blockers, tracked for follow-up)

- Scale-item burst-read concern (addressed by pagination design; eval rubric tracks it)
- `cross-check` wrapper has stdin-piping bug with codex backend (filed separately)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Update CHANGELOG with the PR URL**

```bash
PR_URL=$(gh pr view --json url -q .url)
sed -i.bak "s|PR: <will fill in after Task 6.4>|PR: $PR_URL|" docs/CHANGELOG.md
rm docs/CHANGELOG.md.bak

git add docs/CHANGELOG.md
git commit -m "docs: add PR URL to historian upgrade CHANGELOG entry"
git push
```

- [ ] **Step 4: Return PR URL**

Print:
```bash
gh pr view --json url -q .url
```

This is the deliverable. Hand the URL to Steve. Do NOT auto-merge — per CLAUDE.md `commit-commands` policy, PR-merge fires only on an explicit "merge" instruction.

### Phase 6 Verification Gate

- [ ] Post-upgrade baselines captured for all 5 personas
- [ ] Rubric filled in with pre/post side-by-side scores
- [ ] Non-regression met on ≥4 of 7 dimensions, no dimension regresses >1 step
- [ ] S4 smoke (hot-revert) verified working
- [ ] Doc updates committed (PRD + CHANGELOG + repo CLAUDE.md + qa/TEST_RUNBOOK.md)
- [ ] Feature branch pushed
- [ ] PR opened with test plan and rubric link
- [ ] PR URL returned to Steve

---

## Final summary (for execution tracking)

**Branch:** `feature/ai-historian-realtime-upgrade`
**Phase commits expected:** ~22 (≈ 3-4 per phase × 6 phases)
**Lines of code changed:** ~700-900 (per spec estimates + scale_step rewrite)
**Migrations:** 1 (047)
**New tests:** ~24 (4 type tests + 14 prompt tests + 2 bedrock tests + 4 evidence-query tests)
**Smoke tests added:** 4 (S1-S4)
**Eval artifacts:** 10 persona JSONs (5 pre + 5 post) + 1 rubric file
**Doc updates:** 4 files (PRD + CHANGELOG + repo CLAUDE.md + TEST_RUNBOOK)
**Env vars added:** 2 (both with hot-revert defaults)

**Stops for human review:** End of every phase (6 review gates).

---

## Self-Review checklist

### Spec coverage
- [x] API migration (endpoint + model + nested schema + semantic_vad) → Phase 1 Tasks 1.1-1.4
- [x] `query_evidence` tool (helper + route + client handler) → Phase 3 Tasks 3.1-3.3
- [x] `scale_step` tool (migration + route + client handler) → Phase 4 Tasks 4.1-4.3
- [x] Localizer push channel (server push_payload + client helper + EmbeddedHistorian wiring) → Phase 5 Tasks 5.1-5.3
- [x] Phased prompt + neurology focus → Phase 2 Task 2.3
- [x] STRICT VERBATIM RULE on scale recitation → in tool description (Phase 2 Task 2.3)
- [x] Filler-line UX for query_evidence → in tool description (Phase 2 Task 2.3)
- [x] Pre-upgrade baseline → Phase 0 Task 0.2
- [x] Schema audit → Phase 0 Task 0.3
- [x] Post-upgrade eval → Phase 6 Task 6.1
- [x] Smoke tests S1-S4 → Phases 1, 3, 4, 6
- [x] Env vars with hot-revert → Phase 1 Task 1.4
- [x] Doc updates → Phase 6 Task 6.3
- [x] PR open (no auto-merge) → Phase 6 Task 6.4

### Placeholder scan
No "TBD", "TODO", "fill in details", or "similar to Task N" patterns — verified.

### Type consistency
- `getHistorianToolDefinition()` returns `Array<Tool>` throughout (Task 1.2 wraps in `[...]` temporarily; Task 2.3 makes it natively return array).
- `pushLocalizerContext` argument shape matches `push_payload` server return (turn_count, top_differentials, suggested_next_question, suggested_scale_id).
- `QueryEvidenceResponse` and `ScaleStepResponse` discriminated unions are consumed consistently by client handlers (Tasks 3.3, 4.3).

### Scope check
Single implementation plan covering one feature surface. Not splittable further without losing the dependency thread (Phase 4 depends on Phase 2's tool defs; Phase 5 depends on Phase 1's endpoint + Phase 2's prompt). Each phase has independent value (Phase 1 alone unblocks the site).
