# Neurology Triage Sentinel Evaluation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a PHI-free, offline-first sentinel evaluation package that measures neurology triage safety, accuracy, evidence grounding, human-review burden, and optional live-model operating cost without claiming clinical validation.

**Architecture:** A versioned JSON catalog describes synthetic short notes and provenance-bearing long packets, expected safety dispositions, syndrome coverage, and adversarial subgroups. Pure TypeScript runs the deterministic emergency gateway, validates exact evidence, computes stratified metrics, and evaluates declarative release gates; a separate live adapter dynamically imports existing Bedrock branches only after an explicit `--live` opt-in and calls Opus only for branch disagreement or critical unknowns. The CLI defaults to offline execution and emits machine-readable JSON plus a concise Markdown report.

**Tech Stack:** TypeScript, Vitest, JSON fixtures, existing deterministic gateway/long-packet planner, existing Bedrock safety/scoring/adjudication runners, `tsx` CLI.

**Safety boundary:** Synthetic/PHI-free teaching data only. No live AWS call is permitted without `--live`; no production route, deployment, database, or patient workflow is changed. Passing this suite is a software release signal, not prospective or retrospective clinical validation.

---

## File map

- `qa/triage-sentinel/cases.json`: versioned synthetic case catalog with syndrome, adversarial subgroup, note/packet source, and expected disposition.
- `qa/triage-sentinel/release-gates.json`: declarative synthetic-suite thresholds and scope labels.
- `src/lib/triage/sentinel/types.ts`: catalog, result, branch telemetry, metrics, and release-gate contracts.
- `src/lib/triage/sentinel/catalog.ts`: strict runtime validation for catalog and gate JSON.
- `src/lib/triage/sentinel/evaluator.ts`: offline deterministic execution, exact-evidence validation, case classification, metrics, and gate evaluation.
- `src/lib/triage/sentinel/liveRunner.ts`: explicit live-only dynamic imports, branch fusion, and sparse adjudicator policy.
- `src/lib/triage/sentinel/report.ts`: stable JSON/Markdown report construction.
- `scripts/triage-sentinel.ts`: CLI argument parsing, offline default, explicit live consent, and file output.
- `tests/triage/sentinelCatalog.test.ts`: catalog completeness and PHI-free/adversarial coverage tests.
- `tests/triage/sentinelEvaluator.test.ts`: offline execution, evidence, metrics, gates, and long-packet tests.
- `tests/triage/sentinelLiveGuard.test.ts`: no-live guard and sparse Opus invocation policy tests.
- `docs/clinical-safety/2026-07-11-neurology-triage-sentinel.md`: use, interpretation, release-gate, live-run, and non-validation documentation.

## Task 1: Catalog contracts and clinical coverage

**Files:**
- Create: `src/lib/triage/sentinel/types.ts`
- Create: `src/lib/triage/sentinel/catalog.ts`
- Create: `qa/triage-sentinel/cases.json`
- Test: `tests/triage/sentinelCatalog.test.ts`

- [x] **Step 1: Write failing catalog validation tests**

Test the wished-for `parseSentinelCatalog()` API with malformed fixtures and the real JSON catalog. Require a unique bounded case ID, `synthetic: true`, a valid note or ordered packet input, a supported expected pathway, and declared execution modes.

```ts
const catalog = parseSentinelCatalog(rawCatalog)
expect(catalog.synthetic).toBe(true)
expect(new Set(catalog.cases.map((item) => item.id)).size).toBe(catalog.cases.length)
expect(() => parseSentinelCatalog({ ...rawCatalog, synthetic: false })).toThrow(/synthetic/i)
```

- [x] **Step 2: Verify RED**

Run `npx vitest run tests/triage/sentinelCatalog.test.ts` and confirm failure because the catalog parser does not exist.

- [x] **Step 3: Implement strict contracts and parser**

Define `SentinelCase`, `SentinelInput`, `SentinelExpectation`, and all result types. Validate unknown JSON without coercion; reject additional unsupported pathway/syndrome values, empty text, invalid packet order, duplicate IDs, and any case not explicitly marked synthetic.

- [x] **Step 4: Add the synthetic case catalog**

Include at least one time-critical positive and one hard negative for every safety-extractor syndrome. Cover negation, remote history, family experiencer, copied warning/return-precaution text, ruled-out diagnoses, prompt injection, short rural-style referrals, long tertiary/Mayo-like packets with critical evidence on the final page, missing information, and conflicting information. Mark model-only cases explicitly so an offline deterministic run reports them as not evaluated rather than falsely passing them.

- [x] **Step 5: Verify GREEN**

Run `npx vitest run tests/triage/sentinelCatalog.test.ts` and confirm all catalog validation and coverage tests pass.

## Task 2: Offline evaluator and exact evidence validation

**Files:**
- Create: `src/lib/triage/sentinel/evaluator.ts`
- Test: `tests/triage/sentinelEvaluator.test.ts`

- [x] **Step 1: Write failing evaluator tests**

Require `runOfflineSentinelCase()` to use `runEmergencyGateway()` for notes and `planLongPacketChunks()` plus `scanLongPacketEmergency()` for packets. Assert an emergency on the final packet page is found with exact page offsets, an empty/missing note becomes an abstention/manual hold, and hard negatives do not become present emergency signals.

```ts
const result = runOfflineSentinelCase(longPacketCase)
expect(result.actualPathway).toBe('emergency_now')
expect(result.evidenceValidation.invalidReferences).toBe(0)
expect(result.signals.some((s) => s.evidence.some((e) => e.pageNumber === 24))).toBe(true)
```

- [x] **Step 2: Verify RED**

Run `npx vitest run tests/triage/sentinelEvaluator.test.ts` and confirm the missing evaluator causes the expected failure.

- [x] **Step 3: Implement deterministic execution**

Use existing gateway functions without modifying them. Convert planner exceptions and empty/unscannable sources into a fail-closed `undetermined` result with immediate review. Preserve all source provenance and record deterministic runtime in branch telemetry.

- [x] **Step 4: Implement exact evidence validation and outcome classification**

For note evidence, require `source.slice(startOffset, endOffset) === quote`; for packet evidence, additionally require matching packet/document/page and exact page-local offsets. Classify under-triage, over-triage, exact/acceptable, and manual hold independently so an emergency abstention is visible in both under-triage and hold counts.

- [x] **Step 5: Verify GREEN**

Run the focused evaluator tests and confirm all cases pass without AWS credentials or network access.

## Task 3: Metrics, report, and declarative release gates

**Files:**
- Create: `qa/triage-sentinel/release-gates.json`
- Create: `src/lib/triage/sentinel/report.ts`
- Modify: `src/lib/triage/sentinel/catalog.ts`
- Modify: `src/lib/triage/sentinel/evaluator.ts`
- Test: `tests/triage/sentinelEvaluator.test.ts`

- [x] **Step 1: Write failing metrics and gate tests**

Require separate counts/rates for under-triage, over-triage, abstention/manual hold, exact evidence, alert burden, syndrome/subgroup performance, and branch token/cost/latency. Require a gate failure to identify its metric and observed/threshold values.

- [x] **Step 2: Verify RED**

Run the evaluator test and confirm metrics/gate assertions fail because aggregation is absent.

- [x] **Step 3: Implement stable aggregation**

Use integer counts as the source of truth and derive rates with explicit denominators. Report unevaluated live-only cases, hard-negative false alerts, time-critical evidence validity, per-syndrome/per-subgroup slices, and branch telemetry totals. Offline model token/cost fields remain zero with `executed: false`, not fabricated estimates.

- [x] **Step 4: Add declarative gates**

Declare zero emergency under-triage, zero invalid time-critical evidence references, complete deterministic case execution, bounded hard-negative false alerts, and bounded manual-hold burden for the applicable synthetic subsets. Label every gate `synthetic_software_release_only` and never describe it as clinical validation.

- [x] **Step 5: Verify GREEN**

Run the evaluator tests and confirm both passing and intentionally failing gate fixtures are reported correctly.

## Task 4: Explicit live adapter and sparse Opus adjudication

**Files:**
- Create: `src/lib/triage/sentinel/liveRunner.ts`
- Test: `tests/triage/sentinelLiveGuard.test.ts`

- [x] **Step 1: Write failing live-guard tests**

Require CLI/live option validation to reject model branches unless `live === true`. Test `shouldInvokeSparseAdjudicator()` returns true only for a real branch disagreement or one-or-more critical unknowns, and false for agreement, routine branch failure alone, or general uncertainty without a critical unknown.

```ts
expect(assertLiveAllowed({ live: false, branches: ['safety'] })).toThrow(/--live/)
expect(shouldInvokeSparseAdjudicator({ disagreement: true, criticalUnknownCount: 0 })).toBe(true)
expect(shouldInvokeSparseAdjudicator({ disagreement: false, criticalUnknownCount: 0 })).toBe(false)
```

- [x] **Step 2: Verify RED**

Run `npx vitest run tests/triage/sentinelLiveGuard.test.ts` and confirm expected missing-export failures.

- [x] **Step 3: Implement the live guard and dependency-injected runner**

Keep all Bedrock imports inside the post-guard live function. Reuse the existing safety extractor and outpatient scorer, map results into the existing ensemble policy, and record model IDs, tokens when available, measured latency, and caller-supplied/known cost fields. Invoke the existing Opus adjudicator only when `shouldInvokeSparseAdjudicator()` is true; adjudicator output may escalate or retain a floor but never lower it.

- [x] **Step 4: Verify GREEN without AWS**

Run the live-guard tests with injected fake branch functions only. Confirm no test imports or calls the AWS SDK execution path.

## Task 5: Offline-first CLI and documentation

**Files:**
- Create: `scripts/triage-sentinel.ts`
- Create: `docs/clinical-safety/2026-07-11-neurology-triage-sentinel.md`
- Modify: `package.json`
- Test: `tests/triage/sentinelLiveGuard.test.ts`

- [x] **Step 1: Write failing CLI option tests**

Test `parseSentinelCliArgs()` for offline defaults, `--live` plus explicit branch selection, output format/path, and rejection of unknown or live-only flags without `--live`.

- [x] **Step 2: Verify RED**

Run the live-guard tests and confirm the parser is missing.

- [x] **Step 3: Implement CLI and report output**

Add `npm run triage:sentinel -- [options]`. Default to the checked-in catalog and gates, offline mode, both JSON and Markdown report output under an ignored or caller-selected path, and nonzero exit when an applicable release gate fails. Print an unmistakable synthetic/non-validation banner and live-call warning before any optional model invocation.

- [x] **Step 4: Document operation and interpretation**

Document offline use, explicit AWS live opt-in, profile/region examples without secrets, sparse adjudication, case/gate schema, metric definitions, cost limitations, how to add cases, and the distinction between a sentinel software gate and clinical validation. State that prospective human-reviewed validation, subgroup representativeness, calibration, workflow SLA testing, monitoring, and governance remain required before clinical reliance.

- [x] **Step 5: Verify the full package**

Run:

```bash
npx vitest run tests/triage/sentinelCatalog.test.ts tests/triage/sentinelEvaluator.test.ts tests/triage/sentinelLiveGuard.test.ts
npm run triage:sentinel -- --offline --format json
npx tsc --noEmit
npm run lint -- src/lib/triage/sentinel tests/triage/sentinelCatalog.test.ts tests/triage/sentinelEvaluator.test.ts tests/triage/sentinelLiveGuard.test.ts scripts/triage-sentinel.ts
git diff --check
```

Expected: focused tests, offline CLI, typecheck, lint, and whitespace validation exit 0; no AWS call, deploy, commit, push, production route edit, or clinical-validation claim occurs.

## Task 6: Bounded hard-negative gateway correction

**Files:**
- Modify: `tests/triage/emergencyGateway.test.ts`
- Modify: `src/lib/triage/emergencyGateway.ts`
- Modify: `docs/clinical-safety/2026-07-11-neurology-triage-sentinel.md`

- [x] **Step 1: Reproduce and preserve the initial metrics**

The initial offline run produced 0/12 emergency under-triage, 3/13 hard-negative false alerts, 1/27 manual holds, and 25/25 exact evidence references. The failing case IDs and before-state are retained in the clinical-safety document.

- [x] **Step 2: Add exact failing regression tests and paired positives**

Tests reproduce preposed ruled-out cauda equina, chronic stable vision loss with explicit no sudden/new change, and chronic stable dementia/confusion with explicit no acute/sudden change. Paired tests require unresolved cauda exclusion to remain same-day and current vision loss/confusion to remain emergency.

- [x] **Step 3: Make the smallest assertion/temporality-scoping correction**

Treat `ruled out`/`excluded` as local feature negators while preserving unresolved exclusion, add blindness to direct negation scope, and strip explicitly negated acuity/change phrases before deciding that chronic history introduced a new symptom. The general acute/current patterns remain unchanged.

- [x] **Step 4: Verify focused, full-gateway, long-packet, and sentinel behavior**

The paired regression tests, all 294 emergency-gateway tests, all 756 triage tests, sentinel gates, typecheck, focused lint, CLI help/offline execution, and `git diff --check` pass. Post-fix metrics are 0/12 emergency under-triage, 0/13 hard-negative false alerts, 1/27 manual holds, and 22/22 exact evidence references.
