# Triage Safety Containment and Emergency Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the current silent/incomplete-output failure modes, make urgency independent from missing data, add a deterministic evidence-bearing emergency review gateway, and prevent emergent or unreviewed cases from entering outpatient scheduling or the AI Historian.

**Architecture:** Preserve the current Sonnet 4.6 result as the canonical comparator while the new gateway runs in shadow/review-only mode. Pure deterministic functions establish data quality, emergency review signals, and scheduling/consult locks; database fields persist the orthogonal workflow state. Bedrock clinical calls reject incomplete output rather than repairing it.

**Tech Stack:** Next.js 15 App Router, TypeScript, Vitest, AWS Bedrock Runtime, PostgreSQL migrations, existing `from()` query layer, AWS Amplify feature flags.

**Source design:** `docs/superpowers/specs/2026-07-10-neurology-referral-triage-safety-architecture-design.md`

---

## File map

- `src/lib/bedrock.ts`: legacy Bedrock helpers plus a strict clinical JSON path.
- `src/lib/triage/types.ts`: orthogonal care-pathway, data-quality, review, and workflow contracts.
- `src/lib/triage/scoring.ts`: weighted outpatient score plus non-compensatory floors; missing data cannot lower urgency.
- `src/lib/triage/emergencyGateway.ts`: deterministic assertion/temporality-aware emergency review signals over raw text.
- `src/lib/triage/workflowPolicy.ts`: initial workflow state and scheduling/Historian gates.
- `migrations/048_triage_safety_workflow.sql`: workflow state, locks, action records, and append-only events.
- `src/lib/triage/autoSchedule.ts`: refuse emergency, undetermined, locked, or unreviewed cases.
- `src/app/api/triage/[id]/schedule/route.ts`: enforce the same lock server-side.
- `src/app/api/triage/route.ts`: run gateway before the model, persist shadow signals, and preserve canonical output.
- `src/components/consult/ConsultPipelineView.tsx`: do not advance held cases into Historian.
- `docs/AI_PROMPTS_AND_MODELS.md`, `docs/API_CONTRACTS.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/CONSOLIDATED_ROADMAP.md`, `CLAUDE.md`, `qa/TEST_CASES.yaml`: required same-commit documentation.

## Task 1: Strict Bedrock clinical-output completion

**Files:**
- Modify: `src/lib/bedrock.ts`
- Test: `src/lib/__tests__/bedrockClinicalOutput.test.ts`

- [ ] **Step 1: Write the failing completion-guard tests**

Create `src/lib/__tests__/bedrockClinicalOutput.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  ClinicalModelOutputError,
  parseCompleteClinicalJSON,
} from '@/lib/bedrock'

describe('parseCompleteClinicalJSON', () => {
  it('accepts valid JSON only when the model ended its turn', () => {
    expect(parseCompleteClinicalJSON<{ ok: boolean }>('{"ok":true}', 'end_turn'))
      .toEqual({ ok: true })
  })

  it.each(['max_tokens', 'stop_sequence', 'tool_use', 'unknown'])(
    'rejects the non-complete stop reason %s',
    (stopReason) => {
      expect(() => parseCompleteClinicalJSON('{"ok":true}', stopReason))
        .toThrowError(ClinicalModelOutputError)
    },
  )

  it('rejects truncated JSON instead of repairing it', () => {
    expect(() => parseCompleteClinicalJSON('{"signals":[{"code":"stroke"}', 'max_tokens'))
      .toThrowError(/incomplete/i)
  })

  it('rejects markdown-wrapped and malformed clinical JSON', () => {
    expect(() => parseCompleteClinicalJSON('```json\n{"ok":true}\n```', 'end_turn'))
      .toThrowError(/valid JSON/i)
  })
})
```

- [ ] **Step 2: Run the test and verify the intended failure**

Run:

```bash
npx vitest run src/lib/__tests__/bedrockClinicalOutput.test.ts
```

Expected: FAIL because `ClinicalModelOutputError` and `parseCompleteClinicalJSON` are not exported.

- [ ] **Step 3: Add the strict parser and clinical invocation helper**

Add to `src/lib/bedrock.ts`:

```ts
export class ClinicalModelOutputError extends Error {
  constructor(
    message: string,
    public readonly code: 'incomplete' | 'malformed',
    public readonly stopReason: string,
  ) {
    super(message)
    this.name = 'ClinicalModelOutputError'
  }
}

export function parseCompleteClinicalJSON<T>(text: string, stopReason: string): T {
  if (stopReason !== 'end_turn') {
    throw new ClinicalModelOutputError(
      `Clinical model output is incomplete: stop reason ${stopReason}`,
      'incomplete',
      stopReason,
    )
  }

  try {
    return JSON.parse(text.trim()) as T
  } catch {
    throw new ClinicalModelOutputError(
      'Clinical model output is not valid JSON',
      'malformed',
      stopReason,
    )
  }
}

export async function invokeBedrockClinicalJSON<T>(
  opts: Omit<BedrockInvokeOptions, 'jsonMode'>,
): Promise<{
  parsed: T
  raw: string
  stopReason: string
  inputTokens?: number
  outputTokens?: number
}> {
  const result = await invokeBedrock({ ...opts, jsonMode: true })
  return {
    parsed: parseCompleteClinicalJSON<T>(result.text, result.stopReason),
    raw: result.text,
    stopReason: result.stopReason,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  }
}
```

Do not change `invokeBedrockJSON`; unrelated non-clinical callers may still depend on legacy repair behavior.

- [ ] **Step 4: Run focused and regression tests**

Run:

```bash
npx vitest run src/lib/__tests__/bedrockClinicalOutput.test.ts
npx vitest run tests/triage/scoring.test.ts
```

Expected: the new file passes; the pre-existing red-flag override scoring test remains the only scoring failure until Task 2.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/lib/bedrock.ts src/lib/__tests__/bedrockClinicalOutput.test.ts
git commit -m "fix: reject incomplete Bedrock output in clinical workflows"
```

## Task 2: Orthogonal data quality and non-compensatory outpatient floors

**Files:**
- Modify: `src/lib/triage/types.ts`
- Modify: `src/lib/triage/scoring.ts`
- Modify: `tests/triage/scoring.test.ts`

- [ ] **Step 1: Add failing tests for every approved floor and missingness invariant**

Append to `tests/triage/scoring.test.ts` using the file's existing response factory:

```ts
it.each([
  ['symptom_acuity', 5],
  ['diagnostic_concern', 5],
  ['rate_of_progression', 5],
  ['red_flag_presence', 5],
] as const)('%s=5 establishes an urgent floor', (dimension, score) => {
  const response = makeResponse({
    dimension_scores: {
      ...lowScores,
      [dimension]: { score, rationale: 'synthetic safety fixture' },
    },
  })
  expect(calculateTriageDecision(response).outpatientPriority).toBe('urgent')
})

it('functional_impairment=5 alone does not establish an urgent floor', () => {
  const response = makeResponse({
    dimension_scores: {
      ...lowScores,
      functional_impairment: { score: 5, rationale: 'stable chronic disability' },
    },
  })
  expect(calculateTriageDecision(response).outpatientPriority).toBe('routine')
})

it.each(['symptom_acuity', 'diagnostic_concern'] as const)(
  '%s=4 establishes a semi-urgent floor',
  (dimension) => {
    const response = makeResponse({
      dimension_scores: {
        ...lowScores,
        [dimension]: { score: 4, rationale: 'synthetic safety fixture' },
      },
    })
    expect(calculateTriageDecision(response).outpatientPriority).toBe('semi_urgent')
  },
)

it('red_flag_override establishes an urgent floor', () => {
  const response = makeResponse({ red_flag_override: true })
  expect(calculateTriageDecision(response).outpatientPriority).toBe('urgent')
})

it('insufficient data cannot lower an emergency pathway or urgent floor', () => {
  const response = makeResponse({
    insufficient_data: true,
    emergent_override: true,
    dimension_scores: {
      ...lowScores,
      symptom_acuity: { score: 5, rationale: 'sudden persistent deficit' },
    },
  })
  expect(calculateTriageDecision(response)).toMatchObject({
    carePathway: 'emergency_now',
    dataQuality: 'insufficient',
    outpatientPriority: 'urgent',
    schedulingLocked: true,
  })
})
```

- [ ] **Step 2: Verify the tests fail for the missing API**

Run:

```bash
npx vitest run tests/triage/scoring.test.ts
```

Expected: FAIL because `calculateTriageDecision` is not exported and current scoring ignores `red_flag_override`.

- [ ] **Step 3: Add orthogonal types**

Add to `src/lib/triage/types.ts`:

```ts
export type CarePathway =
  | 'emergency_now'
  | 'same_day_clinician_review'
  | 'expedited_outpatient'
  | 'routine_outpatient'
  | 'redirect'
  | 'undetermined'

export type DataQuality = 'sufficient' | 'partial' | 'insufficient' | 'conflicting'

export type ReviewRequirement =
  | 'emergency_action'
  | 'immediate_clinician_review'
  | 'clinician_confirmation'
  | 'none'

export interface TriageDecisionState {
  carePathway: CarePathway
  outpatientPriority: Exclude<TriageTier, 'emergent' | 'insufficient_data'>
  dataQuality: DataQuality
  reviewRequirement: ReviewRequirement
  schedulingLocked: boolean
  weightedScore: number
  appliedFloors: string[]
}
```

- [ ] **Step 4: Implement deterministic outpatient floors**

Add to `src/lib/triage/scoring.ts` and have `calculateTriageTier` delegate to its outpatient result while preserving the legacy return shape:

```ts
const OUTPATIENT_ORDER: Array<Exclude<TriageTier, 'emergent' | 'insufficient_data'>> = [
  'urgent',
  'semi_urgent',
  'routine_priority',
  'routine',
  'non_urgent',
]

function moreUrgentOutpatientTier(
  a: Exclude<TriageTier, 'emergent' | 'insufficient_data'>,
  b: Exclude<TriageTier, 'emergent' | 'insufficient_data'>,
) {
  return OUTPATIENT_ORDER.indexOf(a) <= OUTPATIENT_ORDER.indexOf(b) ? a : b
}

export function calculateTriageDecision(aiResponse: AITriageResponse): TriageDecisionState {
  const weightedScore = calculateWeightedScore(aiResponse.dimension_scores)
  let outpatientPriority = mapScoreToTier(weightedScore) as Exclude<
    TriageTier,
    'emergent' | 'insufficient_data'
  >
  const appliedFloors: string[] = []
  const scores = aiResponse.dimension_scores

  if (
    aiResponse.red_flag_override ||
    scores.red_flag_presence.score >= 4 ||
    scores.symptom_acuity.score === 5 ||
    scores.diagnostic_concern.score === 5 ||
    scores.rate_of_progression.score === 5
  ) {
    outpatientPriority = moreUrgentOutpatientTier(outpatientPriority, 'urgent')
    appliedFloors.push('urgent_safety_floor')
  } else if (
    scores.symptom_acuity.score >= 4 ||
    scores.diagnostic_concern.score >= 4
  ) {
    outpatientPriority = moreUrgentOutpatientTier(outpatientPriority, 'semi_urgent')
    appliedFloors.push('semi_urgent_acuity_or_concern_floor')
  }

  const dataQuality: DataQuality = aiResponse.insufficient_data ? 'insufficient' : 'sufficient'
  const carePathway: CarePathway = aiResponse.emergent_override
    ? 'emergency_now'
    : outpatientPriority === 'urgent' || outpatientPriority === 'semi_urgent'
      ? 'expedited_outpatient'
      : 'routine_outpatient'

  return {
    carePathway,
    outpatientPriority,
    dataQuality,
    reviewRequirement: aiResponse.emergent_override
      ? 'emergency_action'
      : dataQuality === 'insufficient'
        ? 'clinician_confirmation'
        : 'clinician_confirmation',
    schedulingLocked: true,
    weightedScore,
    appliedFloors,
  }
}
```

The legacy `calculateTriageTier` returns `emergent` for emergency, the safety-floor tier when a floor applies, and `insufficient_data` only when no emergency or safety floor exists.

- [ ] **Step 5: Run scoring tests**

Run:

```bash
npx vitest run tests/triage/scoring.test.ts
```

Expected: all scoring tests pass.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/lib/triage/types.ts src/lib/triage/scoring.ts tests/triage/scoring.test.ts
git commit -m "feat: separate triage urgency from data quality"
```

## Task 3: Deterministic evidence-bearing emergency review gateway

**Files:**
- Create: `src/lib/triage/emergencyGateway.ts`
- Create: `tests/triage/emergencyGateway.test.ts`

- [ ] **Step 1: Write failing tests for true positives, contextual suppressions, and ambiguity**

Create `tests/triage/emergencyGateway.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { runEmergencyGateway } from '@/lib/triage/emergencyGateway'

describe('runEmergencyGateway', () => {
  it.each([
    ['Sudden right facial droop and aphasia began 20 minutes ago.', 'acute_cerebrovascular'],
    ['Worst headache of her life, maximal at onset, started just now.', 'intracranial_hemorrhage_or_sah'],
    ['Continuous generalized seizure for 8 minutes without recovery.', 'status_or_recurrent_seizure'],
    ['New urinary retention, saddle anesthesia, and rapidly worsening bilateral leg weakness.', 'acute_spinal_cord_or_cauda_equina'],
    ['Fever, neck stiffness, severe headache, and new confusion today.', 'acute_cns_infection'],
    ['Progressive bulbar weakness and now cannot handle secretions.', 'neuromuscular_respiratory_or_bulbar_failure'],
    ['Sudden painful loss of vision in the left eye this morning.', 'acute_vision_threat'],
  ])('flags %s', (text, syndrome) => {
    const result = runEmergencyGateway(text)
    expect(result.carePathway).toBe('emergency_now')
    expect(result.signals.some((signal) => signal.syndrome === syndrome)).toBe(true)
    expect(result.signals[0].evidence[0].quote.length).toBeGreaterThan(0)
  })

  it.each([
    'Denies sudden weakness, facial droop, aphasia, or vision loss.',
    'Remote stroke in 2004 with stable chronic left weakness.',
    'Family history: mother had status epilepticus.',
    'Discharge instructions: call 911 for sudden weakness or slurred speech.',
    'MRI ordered to rule out cauda equina; no saddle anesthesia, weakness, or bladder symptoms.',
  ])('does not treat contextual non-events as current emergencies: %s', (text) => {
    expect(runEmergencyGateway(text).carePathway).not.toBe('emergency_now')
  })

  it('routes uncertain time-critical language to immediate clinician review', () => {
    const result = runEmergencyGateway(
      'Possible new aphasia; onset and current symptom status are unclear in this fax.',
    )
    expect(result.carePathway).toBe('same_day_clinician_review')
    expect(result.reviewRequirement).toBe('immediate_clinician_review')
  })

  it('retains page provenance supplied by the parser', () => {
    const result = runEmergencyGateway('Sudden facial droop and slurred speech now.', {
      packetId: 'packet-1',
      documentId: 'document-1',
      pageNumber: 87,
    })
    expect(result.signals[0].evidence[0]).toMatchObject({
      packetId: 'packet-1',
      documentId: 'document-1',
      pageNumber: 87,
    })
  })
})
```

- [ ] **Step 2: Verify the gateway tests fail because the module is missing**

Run:

```bash
npx vitest run tests/triage/emergencyGateway.test.ts
```

Expected: FAIL with module resolution error for `emergencyGateway`.

- [ ] **Step 3: Implement the gateway with versioned syndrome rules**

Create `src/lib/triage/emergencyGateway.ts` with:

```ts
import type { CarePathway, ReviewRequirement } from './types'

export const EMERGENCY_GATEWAY_VERSION = 'neurology-emergency-gateway-v1'

export interface SourceLocation {
  packetId?: string
  documentId?: string
  pageNumber?: number
}

export interface GatewayEvidence extends Required<SourceLocation> {
  startOffset: number
  endOffset: number
  quote: string
}

export interface GatewaySignal {
  code: string
  syndrome: string
  action: 'emergency_now' | 'immediate_clinician_review'
  evidence: GatewayEvidence[]
}

export interface EmergencyGatewayResult {
  carePathway: CarePathway
  reviewRequirement: ReviewRequirement
  schedulingLocked: boolean
  signals: GatewaySignal[]
  version: typeof EMERGENCY_GATEWAY_VERSION
}
```

Use explicit rule families for the seven syndromes exercised above plus altered mental status, raised intracranial pressure, suicide/violence, and traumatic deterioration. Each rule must combine temporal/acuity language with its clinical feature cluster. Extract a bounded quote around the match. Before classifying a match as current, inspect the preceding and following sentence for:

```ts
const NEGATED = /\b(den(?:y|ies|ied)|no|not|without|negative for|absence of)\b/i
const HISTORICAL = /\b(history of|remote|prior|previous|in 19\d{2}|in 20\d{2}|years? ago|resolved|baseline|chronic stable)\b/i
const OTHER_EXPERIENCER = /\b(family history|mother|father|sister|brother|child)\b/i
const EDUCATION = /\b(instructions?|return precautions?|call 911|seek emergency care if|patient education)\b/i
const UNCERTAIN = /\b(possible|possibly|may have|concern for|rule out|unclear|unknown)\b/i
```

Negated, historical, other-experiencer, and educational matches do not establish `emergency_now`. An uncertain but otherwise time-critical match establishes `same_day_clinician_review`. Default no-hit output is `routine_outpatient + clinician_confirmation + schedulingLocked=true` because this gateway does not independently clear a case for scheduling.

- [ ] **Step 4: Run and refine until all gateway tests pass**

Run:

```bash
npx vitest run tests/triage/emergencyGateway.test.ts
```

Expected: all gateway tests pass with no console warnings.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/lib/triage/emergencyGateway.ts tests/triage/emergencyGateway.test.ts
git commit -m "feat: add deterministic neurology emergency review gateway"
```

## Task 4: Workflow policy and hard scheduling/Historian gates

**Files:**
- Create: `src/lib/triage/workflowPolicy.ts`
- Create: `tests/triage/workflowPolicy.test.ts`
- Modify: `src/lib/triage/autoSchedule.ts`
- Create: `tests/triage/autoSchedule.test.ts`

- [ ] **Step 1: Write failing pure-policy tests**

Create `tests/triage/workflowPolicy.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { canAdvanceToHistorian, canActivateOutpatientScheduling } from '@/lib/triage/workflowPolicy'

const cleared = {
  carePathway: 'routine_outpatient' as const,
  workflowStatus: 'decision_ready' as const,
  schedulingLocked: false,
  reviewedAt: '2026-07-10T12:00:00.000Z',
  openCriticalClarifications: 0,
  coverageStatus: 'complete' as const,
}

it('allows scheduling only for a reviewed, unlocked outpatient decision', () => {
  expect(canActivateOutpatientScheduling(cleared)).toEqual({ allowed: true })
})

it.each([
  { ...cleared, carePathway: 'emergency_now' as const },
  { ...cleared, carePathway: 'undetermined' as const },
  { ...cleared, schedulingLocked: true },
  { ...cleared, reviewedAt: null },
  { ...cleared, openCriticalClarifications: 1 },
  { ...cleared, coverageStatus: 'partial' as const },
])('blocks unsafe outpatient scheduling: %#', (state) => {
  expect(canActivateOutpatientScheduling(state).allowed).toBe(false)
})

it('never advances emergency or immediate-review cases to Historian', () => {
  expect(canAdvanceToHistorian({
    ...cleared,
    carePathway: 'emergency_now',
    patientClarificationApproved: true,
  }).allowed).toBe(false)
})

it('advances only a clinician-approved patient clarification question set', () => {
  expect(canAdvanceToHistorian({
    ...cleared,
    workflowStatus: 'patient_clarification',
    patientClarificationApproved: true,
  })).toEqual({ allowed: true })
})
```

- [ ] **Step 2: Verify the policy tests fail for the missing module**

Run:

```bash
npx vitest run tests/triage/workflowPolicy.test.ts
```

Expected: FAIL with module resolution error.

- [ ] **Step 3: Implement explicit gates with machine-readable reasons**

Create `src/lib/triage/workflowPolicy.ts` exporting `canActivateOutpatientScheduling` and `canAdvanceToHistorian`. Both return `{ allowed: true } | { allowed: false; reason: string }`. Scheduling permits only `expedited_outpatient` or `routine_outpatient`, `decision_ready`, complete coverage, zero critical clarifications, a non-null clinician `reviewedAt`, and `schedulingLocked=false`. Historian additionally requires `workflowStatus='patient_clarification'` and `patientClarificationApproved=true`.

- [ ] **Step 4: Add an emergency scheduling regression test**

Create `tests/triage/autoSchedule.test.ts` with a mocked query builder and assert that `autoScheduleFromTriage()` makes zero database insert calls for `emergency_now`, `undetermined`, or any locked/unreviewed state. Assert one pending-review insert for a permitted urgent outpatient state.

- [ ] **Step 5: Update `autoScheduleFromTriage` to require a policy state**

Change its final argument to:

```ts
interface SchedulingAuthorization {
  carePathway: CarePathway
  workflowStatus: WorkflowStatus
  schedulingLocked: boolean
  reviewedAt: string | null
  openCriticalClarifications: number
  coverageStatus: CoverageStatus
}
```

Call `canActivateOutpatientScheduling` before any date calculation or database operation. Remove `emergent` and `critical` from qualifying tiers. A denied policy returns `null` and writes one structured warning without patient identifiers.

- [ ] **Step 6: Run policy and scheduling tests**

Run:

```bash
npx vitest run tests/triage/workflowPolicy.test.ts tests/triage/autoSchedule.test.ts
```

Expected: both test files pass.

- [ ] **Step 7: Commit Task 4**

```bash
git add src/lib/triage/workflowPolicy.ts src/lib/triage/autoSchedule.ts tests/triage/workflowPolicy.test.ts tests/triage/autoSchedule.test.ts
git commit -m "fix: lock unsafe triage cases out of outpatient workflows"
```

## Task 5: Persist orthogonal safety workflow and closed-loop events

**Files:**
- Create: `migrations/048_triage_safety_workflow.sql`
- Create: `tests/triage/migrations/048_triage_safety_workflow.test.ts`

- [ ] **Step 1: Write a migration contract test**

Create a test that reads the SQL file and asserts it contains:

```ts
expect(sql).toContain("care_pathway IN ('emergency_now','same_day_clinician_review','expedited_outpatient','routine_outpatient','redirect','undetermined')")
expect(sql).toContain("data_quality IN ('sufficient','partial','insufficient','conflicting')")
expect(sql).toContain('scheduling_locked boolean NOT NULL DEFAULT true')
expect(sql).toContain('triage_emergency_actions')
expect(sql).toContain('triage_workflow_events')
expect(sql).toContain('CREATE TRIGGER')
```

- [ ] **Step 2: Verify the contract test fails because migration 048 is absent**

Run:

```bash
npx vitest run tests/triage/migrations/048_triage_safety_workflow.test.ts
```

Expected: FAIL reading the absent migration file.

- [ ] **Step 3: Create migration 048**

Create `migrations/048_triage_safety_workflow.sql` with:

```sql
ALTER TABLE triage_sessions
  ADD COLUMN IF NOT EXISTS care_pathway text,
  ADD COLUMN IF NOT EXISTS data_quality text,
  ADD COLUMN IF NOT EXISTS coverage_status text,
  ADD COLUMN IF NOT EXISTS review_requirement text,
  ADD COLUMN IF NOT EXISTS workflow_status text,
  ADD COLUMN IF NOT EXISTS scheduling_locked boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS owner_user_id text,
  ADD COLUMN IF NOT EXISTS owner_team text,
  ADD COLUMN IF NOT EXISTS due_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_escalation_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS final_triage_tier text,
  ADD COLUMN IF NOT EXISTS final_care_pathway text,
  ADD COLUMN IF NOT EXISTS closure_code text,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS algorithm_version text,
  ADD COLUMN IF NOT EXISTS rule_version text,
  ADD COLUMN IF NOT EXISTS prompt_versions jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS safety_shadow_result jsonb;

UPDATE triage_sessions
SET care_pathway = COALESCE(care_pathway, 'undetermined'),
    data_quality = COALESCE(data_quality, 'partial'),
    coverage_status = COALESCE(coverage_status, 'legacy_unknown'),
    review_requirement = COALESCE(review_requirement, 'clinician_confirmation'),
    workflow_status = COALESCE(workflow_status, 'clinician_review'),
    scheduling_locked = true;

ALTER TABLE triage_sessions
  ALTER COLUMN care_pathway SET NOT NULL,
  ALTER COLUMN data_quality SET NOT NULL,
  ALTER COLUMN coverage_status SET NOT NULL,
  ALTER COLUMN review_requirement SET NOT NULL,
  ALTER COLUMN workflow_status SET NOT NULL,
  DROP CONSTRAINT IF EXISTS triage_sessions_care_pathway_check,
  DROP CONSTRAINT IF EXISTS triage_sessions_data_quality_check,
  DROP CONSTRAINT IF EXISTS triage_sessions_coverage_status_check,
  DROP CONSTRAINT IF EXISTS triage_sessions_review_requirement_check,
  DROP CONSTRAINT IF EXISTS triage_sessions_workflow_status_check;

ALTER TABLE triage_sessions
  ADD CONSTRAINT triage_sessions_care_pathway_check CHECK
    (care_pathway IN ('emergency_now','same_day_clinician_review','expedited_outpatient','routine_outpatient','redirect','undetermined')),
  ADD CONSTRAINT triage_sessions_data_quality_check CHECK
    (data_quality IN ('sufficient','partial','insufficient','conflicting')),
  ADD CONSTRAINT triage_sessions_coverage_status_check CHECK
    (coverage_status IN ('complete','partial','failed','not_applicable','legacy_unknown')),
  ADD CONSTRAINT triage_sessions_review_requirement_check CHECK
    (review_requirement IN ('emergency_action','immediate_clinician_review','clinician_confirmation','none')),
  ADD CONSTRAINT triage_sessions_workflow_status_check CHECK
    (workflow_status IN ('pending_safety_screen','emergency_hold','clinician_review','provider_clarification','patient_clarification','decision_ready','action_pending','closed'));

CREATE TABLE IF NOT EXISTS triage_emergency_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  triage_session_id uuid NOT NULL REFERENCES triage_sessions(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('open','attempting_contact','handed_off','closed','failed')),
  owner_user_id text,
  owner_team text NOT NULL,
  due_at timestamptz NOT NULL,
  next_escalation_at timestamptz NOT NULL,
  contact_attempted_at timestamptz,
  contact_channel text,
  instruction_given text,
  delivery_status text CHECK (delivery_status IN ('unknown','delivered','failed','not_applicable')),
  understanding_status text CHECK (understanding_status IN ('unknown','confirmed','not_confirmed','not_applicable')),
  outcome text,
  closure_code text,
  closed_at timestamptz,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'closed' OR (closure_code IS NOT NULL AND closed_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS triage_workflow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  triage_session_id uuid NOT NULL REFERENCES triage_sessions(id) ON DELETE RESTRICT,
  emergency_action_id uuid REFERENCES triage_emergency_actions(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  actor_kind text NOT NULL CHECK (actor_kind IN ('system','model','clinician','staff','patient','provider')),
  actor_id text,
  actor_role text,
  previous_state text,
  new_state text,
  reason text NOT NULL,
  model_profile text,
  prompt_version text,
  rule_version text,
  correlation_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION reject_triage_workflow_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'triage_workflow_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS triage_workflow_events_append_only ON triage_workflow_events;
CREATE TRIGGER triage_workflow_events_append_only
BEFORE UPDATE OR DELETE ON triage_workflow_events
FOR EACH ROW EXECUTE FUNCTION reject_triage_workflow_event_mutation();

CREATE INDEX IF NOT EXISTS idx_triage_sessions_open_safety_holds
  ON triage_sessions (workflow_status, due_at)
  WHERE workflow_status <> 'closed';

CREATE INDEX IF NOT EXISTS idx_triage_emergency_actions_open
  ON triage_emergency_actions (triage_session_id, status, due_at)
  WHERE status <> 'closed';

CREATE INDEX IF NOT EXISTS idx_triage_workflow_events_session_time
  ON triage_workflow_events (triage_session_id, created_at);
```

- [ ] **Step 4: Run the migration contract test**

Run:

```bash
npx vitest run tests/triage/migrations/048_triage_safety_workflow.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```bash
git add migrations/048_triage_safety_workflow.sql tests/triage/migrations/048_triage_safety_workflow.test.ts
git commit -m "feat: persist triage safety workflow and closure evidence"
```

## Task 6: Integrate the gateway into triage as shadow/review-only output

**Files:**
- Modify: `src/app/api/triage/route.ts`
- Create: `src/app/api/triage/__tests__/safetyGatewayIntegration.test.ts`

- [ ] **Step 1: Write route-level failing tests**

Mock Bedrock, persistence, notification, consult, and scheduling dependencies. Assert:

```ts
expect(runEmergencyGateway).toHaveBeenCalledWith(originalReferralText)
expect(insertedRow).toMatchObject({
  care_pathway: 'emergency_now',
  review_requirement: 'emergency_action',
  workflow_status: 'emergency_hold',
  scheduling_locked: true,
})
expect(autoScheduleFromTriage).not.toHaveBeenCalled()
expect(linkTriageToConsult).not.toHaveBeenCalled()
```

For a no-hit fixture, assert the canonical Bedrock path still runs and its canonical tier is unchanged. For a gateway exception, assert a review hold is persisted and scheduling is not called.

- [ ] **Step 2: Run the route tests and verify they fail**

Run:

```bash
npx vitest run src/app/api/triage/__tests__/safetyGatewayIntegration.test.ts
```

Expected: FAIL because the route does not call the gateway or persist the new fields.

- [ ] **Step 3: Run the gateway before the model**

At POST initialization:

```ts
const gateway = runEmergencyGateway(referral_text)
const gatewayWorkflow = gateway.carePathway === 'emergency_now'
  ? 'emergency_hold'
  : gateway.carePathway === 'same_day_clinician_review'
    ? 'clinician_review'
    : 'pending_safety_screen'
```

Persist the gateway result in `safety_shadow_result`, set its review/lock fields, and always score the same original referral text for short-note canonical comparison. Change the model call from `invokeBedrockJSON` to `invokeBedrockClinicalJSON`. A non-`end_turn` stop reason marks the case for clinician review; it never writes `processing_status='complete'` with partial model fields.

Until clinical validation approves action-enabling behavior, the gateway may set review/lock workflow state but may not message a patient, direct EMS, overwrite the canonical tier, or expose a final clinician disposition.

- [ ] **Step 4: Block downstream outpatient effects for holds**

Before consult progression or scheduling, evaluate the policy state. Held cases skip those functions. Notifications for holds must be treated as required work in the later closed-loop phase; this task only ensures no unsafe outpatient side effect occurs.

- [ ] **Step 5: Run route, scoring, gateway, and strict-output tests**

Run:

```bash
npx vitest run \
  src/app/api/triage/__tests__/safetyGatewayIntegration.test.ts \
  src/lib/__tests__/bedrockClinicalOutput.test.ts \
  tests/triage/scoring.test.ts \
  tests/triage/emergencyGateway.test.ts \
  tests/triage/workflowPolicy.test.ts \
  tests/triage/autoSchedule.test.ts
```

Expected: all listed tests pass.

- [ ] **Step 6: Commit Task 6**

```bash
git add src/app/api/triage/route.ts src/app/api/triage/__tests__/safetyGatewayIntegration.test.ts
git commit -m "feat: run emergency safety gateway before model triage"
```

## Task 7: Enforce the scheduling API and consult-to-Historian gate

**Files:**
- Modify: `src/app/api/triage/[id]/schedule/route.ts`
- Create: `src/app/api/triage/[id]/schedule/__tests__/route.test.ts`
- Modify: `src/components/consult/ConsultPipelineView.tsx`
- Create: `src/components/consult/__tests__/ConsultPipelineView.test.tsx`

- [ ] **Step 1: Add failing scheduling API tests**

Mock the database query and assert HTTP 409 for emergency, undetermined, locked, unreviewed, incomplete-coverage, and open-critical-clarification fixtures. Assert HTTP 201 only for a reviewed, unlocked outpatient case.

- [ ] **Step 2: Add failing consult progression tests**

Render the pipeline or extract its next-step decision into a pure exported helper. Assert `emergency_hold`, `clinician_review`, `provider_clarification`, and `patient_clarification` without clinician approval never select the normal Historian step. Assert approved purpose-limited patient clarification selects only the referral-clarification mode.

- [ ] **Step 3: Run both test files and verify failure**

Run:

```bash
npx vitest run \
  src/app/api/triage/[id]/schedule/__tests__/route.test.ts \
  src/components/consult/__tests__/ConsultPipelineView.test.tsx
```

Expected: FAIL on the current urgent-tier-only scheduling check and unconditional Historian transition.

- [ ] **Step 4: Enforce policy in both paths**

The schedule route queries all policy fields and passes them to `canActivateOutpatientScheduling`; a denial returns 409 with the machine-readable reason. The consult pipeline renders a review/clarification hold state and does not set `selectedStep='historian'` unless `canAdvanceToHistorian` permits a clinician-approved patient clarification.

- [ ] **Step 5: Run focused tests**

Run:

```bash
npx vitest run \
  src/app/api/triage/[id]/schedule/__tests__/route.test.ts \
  src/components/consult/__tests__/ConsultPipelineView.test.tsx \
  tests/triage/workflowPolicy.test.ts
```

Expected: all listed tests pass.

- [ ] **Step 6: Commit Task 7**

```bash
git add \
  src/app/api/triage/[id]/schedule/route.ts \
  src/app/api/triage/[id]/schedule/__tests__/route.test.ts \
  src/components/consult/ConsultPipelineView.tsx \
  src/components/consult/__tests__/ConsultPipelineView.test.tsx
git commit -m "fix: enforce clinician clearance before scheduling or Historian"
```

## Task 8: Documentation, QA cases, and full verification

**Files:**
- Modify: `docs/AI_PROMPTS_AND_MODELS.md`
- Modify: `docs/API_CONTRACTS.md`
- Modify: `docs/IMPLEMENTATION_STATUS.md`
- Modify: `docs/CONSOLIDATED_ROADMAP.md`
- Modify: `CLAUDE.md`
- Modify: `qa/TEST_CASES.yaml`

- [ ] **Step 1: Document exact behavior and shadow boundary**

Record model output rejection, outpatient score floors, orthogonal state axes, gateway version, schedule/Historian gates, migration 048, feature flags, and the fact that gateway signals are review-only until clinical promotion.

- [ ] **Step 2: Add QA cases**

Add cases for emergency plus insufficient data, negated/history/family/education language, uncertain acute deficit, no model completion, emergent scheduling refusal, incomplete coverage refusal, and prohibited Historian progression.

- [ ] **Step 3: Run the complete verification suite**

Run:

```bash
npx vitest run \
  src/lib/__tests__/bedrockClinicalOutput.test.ts \
  tests/triage/scoring.test.ts \
  tests/triage/emergencyGateway.test.ts \
  tests/triage/workflowPolicy.test.ts \
  tests/triage/autoSchedule.test.ts \
  tests/triage/migrations/048_triage_safety_workflow.test.ts \
  src/app/api/triage/__tests__/safetyGatewayIntegration.test.ts \
  src/app/api/triage/[id]/schedule/__tests__/route.test.ts \
  src/components/consult/__tests__/ConsultPipelineView.test.tsx
npx tsc --noEmit
npm run lint
npm run build
npm test
```

Expected: every focused safety test, type check, lint, and build passes. The full baseline may still report only the previously documented unrelated Historian expectation failures and simulated-patient server prerequisite; no new failure is acceptable.

- [ ] **Step 4: Review the diff for scope and secrets**

Run:

```bash
git diff --check
git status --short
git diff --stat HEAD~8..HEAD
rg -n "AKIA|ASIA|BEDROCK_SECRET_ACCESS_KEY=.*|sevaro-sandbox" src migrations qa docs CLAUDE.md
```

Expected: no whitespace errors, no credentials, and the profile name appears only in the approved model-inventory documentation.

- [ ] **Step 5: Commit Task 8**

```bash
git add docs/AI_PROMPTS_AND_MODELS.md docs/API_CONTRACTS.md docs/IMPLEMENTATION_STATUS.md docs/CONSOLIDATED_ROADMAP.md CLAUDE.md qa/TEST_CASES.yaml
git commit -m "docs: record triage safety containment and validation cases"
```

---

## Plan self-review

- Spec coverage: immediate output containment, urgency/missingness separation, score floors, emergency review gateway, persistence, scheduling lock, Historian lock, documentation, and QA are covered.
- Explicit deferrals are in separate implementation plans: packet/page/OCR ingestion; evidence extraction and chronology; multi-model orchestration; clarification and closed-loop action UI; shadow evaluation and promotion.
- Type consistency: `CarePathway`, `DataQuality`, `ReviewRequirement`, `WorkflowStatus`, and `CoverageStatus` are shared contracts; scheduling and Historian gates consume the same state.
- Safety invariant: no task permits a model or clarification to lower a safety floor, and no held case can activate outpatient scheduling.
