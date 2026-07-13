# Neurology Triage Sentinel Evaluation

Status: implemented as an offline-first synthetic software evaluation package.

> **This is not clinical validation.** The catalog is synthetic and PHI-free. A passing run is a software regression/release signal only; it does not establish clinical safety, effectiveness, calibration, or fitness for patient care.

## What this package evaluates

The sentinel runs the same deterministic neurology emergency gateway used by the triage safety architecture against a versioned synthetic catalog. It separately reports:

- under-triage, including emergency cases sent to a manual hold rather than emergency action;
- over-triage and hard-negative false alerts;
- abstention/manual-hold burden;
- exact source-evidence validation, including document/page-local offsets for long packets;
- per-syndrome and adversarial-subgroup performance;
- time-critical alert burden;
- per-branch execution, token, cost, and latency fields;
- declarative release-gate results.

The catalog covers all safety-extractor syndrome families with at least one time-critical positive and one hard negative. It also includes negation, remote history, family experiencers, copied warnings/return precautions, ruled-out diagnoses, prompt injection, short rural-style referrals, a long Mayo-like/tertiary packet with critical evidence only on its final page, missing data, and conflicting data.

Files:

- `qa/triage-sentinel/cases.json` — synthetic catalog.
- `qa/triage-sentinel/release-gates.json` — software-only gates.
- `src/lib/triage/sentinel/` — validation, evaluator, report, live guard, and CLI logic.
- `scripts/triage-sentinel.ts` — executable wrapper.
- `tests/triage/sentinel*.test.ts` — offline tests; none call AWS.

## Safe default: offline

The default and `--offline` modes make no AWS SDK or model call. Model modules are not dynamically loaded.

```bash
npm run triage:sentinel -- --offline --format both
```

The command returns exit code `2` when an applicable release gate fails. To generate a report while preserving failures in the report but returning exit code `0`:

```bash
npm run triage:sentinel -- --offline --format both --no-fail-on-gate
```

Write artifacts to a directory:

```bash
npm run triage:sentinel -- --offline --output-dir qa/triage-sentinel/runs --no-fail-on-gate
```

## Explicit live mode

Live execution is opt-in twice:

1. `--live` is mandatory before any model branch, AWS profile, region, pricing, or live case selection is accepted.
2. The caller must allowlist one or more `--case` values or explicitly accept the cost of the full catalog with `--all-live`.

Example using the provided temporary SSO profile name and region (no credential material is stored or printed):

```bash
npm run triage:sentinel -- \
  --live \
  --case stroke-current-short-rural \
  --branches safety,scoring,adjudicator \
  --profile sevaro-sandbox \
  --region us-east-2 \
  --format both \
  --no-fail-on-gate
```

Run `aws sso login --profile sevaro-sandbox` outside the sentinel if the temporary SSO session has expired. Never place access keys, secret keys, session tokens, referral PHI, or patient data in command arguments, source files, pricing files, reports, or chat.

The current evaluated model registry defaults are:

| Role | Registry default |
|---|---|
| High-recall safety extractor | `us.anthropic.claude-sonnet-5` |
| Outpatient scorer | `us.anthropic.claude-sonnet-4-6` |
| Sparse disagreement adjudicator | `us.anthropic.claude-opus-4-8` |
| Long-packet mapper | `us.anthropic.claude-haiku-4-5-20251001-v1:0` |

These are configured candidate IDs, not a claim that the account currently has entitlement or regional availability. This offline implementation deliberately does not call AWS to verify availability. A live run resolves the registry and fails closed at the affected branch if AWS rejects a model/profile/region.

### Sparse Opus policy

Opus 4.8 is invoked only when:

- two or more successfully completed clinical branches disagree on the time-critical pathway class; or
- the safety extractor returns one or more critical unknowns.

A timeout, invalid response, transport error, or omitted branch alone does **not** trigger Opus. Those failures remain a manual hold/`undetermined` state. Adjudication is additive-only: it may escalate but cannot lower a deterministic or model safety floor.

### Long packets

Every long-packet page is planned into provenance-bound overlapping chunks and scanned by the deterministic gateway. In live mode, the existing long-packet model pipeline maps clinical facts and independently extracts safety evidence across all chunks before a narrative is offered to the outpatient scorer. Exact safety references remain page-local and immutable.

The current long-packet model pipeline does not expose per-call token usage through its public result, so the sentinel reports live token counts and calculated cost as `unknown` where usage is unavailable. It never substitutes zero for an executed model call with unknown usage. Measured wall-clock latency is still reported. Instrumenting token usage across chunk mapper, safety extractor, reducer, scorer, and adjudicator is required before using the report for precise budget forecasting.

Optional pricing is caller-supplied rather than hard-coded, because model pricing can change. Example schema:

```json
{
  "us.anthropic.claude-sonnet-5": {
    "inputUsdPerMillion": 0,
    "outputUsdPerMillion": 0
  },
  "us.anthropic.claude-opus-4-8": {
    "inputUsdPerMillion": 0,
    "outputUsdPerMillion": 0
  }
}
```

Replace zero placeholders with prices verified from the current AWS account/pricing source immediately before use. A cost remains `unknown` unless both token counts and pricing are available.

## Metric definitions

- **Exact / acceptable disposition:** actual pathway is in the case's prospectively declared acceptable set, every required syndrome is present, and all emitted evidence resolves exactly.
- **Under-triage:** a time-critical case is below `emergency_now`, or a same-day case is below same-day review. An emergency manual hold is counted in both under-triage and manual-hold metrics.
- **Over-triage:** a routine synthetic case is escalated above routine outpatient care. Manual hold is reported separately, not mislabeled as over-triage.
- **Hard-negative false alert:** an evaluated hard negative triggers `emergency_now` or `same_day_clinician_review`.
- **Manual hold / abstention:** actual pathway is `undetermined`; this must remain scheduling-locked and enter human review/provider clarification operationally.
- **Exact evidence:** quote and offsets exactly resolve to source text. Packet evidence must also match packet, document, page, extraction method, and extraction confidence.
- **Alert burden:** emergency plus same-day alerts divided by all evaluated cases. It is not sensitivity or positive predictive value.
- **Tokens / cost / latency:** branch-level operational telemetry. Unknown executed-model usage/cost stays unknown; unexecuted offline model branches show zero executions.

Every rate includes integer numerator and denominator. An empty denominator produces `null`/`N/A`, never a misleading 100%.

## Declarative synthetic release gates

The checked-in gates currently require:

- zero synthetic emergency under-triage;
- zero invalid time-critical evidence references;
- zero unevaluated cases that declared offline eligibility;
- hard-negative false-alert rate at or below 5%;
- manual-hold burden at or below 15%.

All gates carry `scope: synthetic_software_release_only` and `clinicalValidationClaim: false`. Subset live runs are never release-gate eligible even if their individual thresholds happen to pass.

### Initial offline finding and bounded gateway correction

The first full offline run found three hard-negative false alerts and correctly failed the trust gate:

- explicit emergency evaluation that **ruled out** cauda equina, followed by explicit symptom denials;
- chronic stable vision loss with no sudden change, no new blindness, and baseline vision;
- chronic stable dementia-related confusion with no acute or sudden change.

The root causes were narrowly scoped: preposed `ruled out` was not treated as a local feature negator, and negated acuity phrases such as `no acute or sudden change`/`no new blindness` were incorrectly reused as positive acuity markers when adjacent chronic sentences were combined. Regression tests were added before the parser change, including paired uncertain/current cases that must remain same-day or emergency.

| Offline synthetic metric | Before | After bounded fix |
|---|---:|---:|
| Emergency under-triage | 0/12 (0%) | 0/12 (0%) |
| Hard-negative false alerts | 3/13 (23.08%) | 0/13 (0%) |
| Overall over-triage on routine cases | 3/13 (23.08%) | 0/13 (0%) |
| Manual hold / abstention | 1/27 (3.70%) | 1/27 (3.70%) |
| Exact emitted evidence | 25/25 (100%) | 22/22 (100%) |
| Synthetic software release gates | FAIL | PASS |

The lower post-fix evidence denominator reflects removal of the three false emergency signals, not lost evidence on true positives. The after-state passed all 294 deterministic emergency-gateway tests and all 756 triage tests, including the sentinel suite. This remains a synthetic regression result, not clinical validation.

## Adding or changing cases

1. Use only invented, non-identifying text. Do not lightly de-identify a real referral.
2. Declare syndrome, hard-negative status, execution modes, adversarial tags, expected clinical class/pathway, acceptable pathways, and required syndromes before running the system.
3. Preserve complete packet/document/page metadata and contiguous ordering.
4. Add a paired hard negative when introducing a new emergency wording pattern.
5. Run the three sentinel test files and the full offline report.
6. Have at least two qualified neurology reviewers independently approve the clinical label before promoting a case into a governed validation dataset. The synthetic sentinel itself is not that dataset.

## What remains before clinical reliance

At minimum:

- independently labeled, representative retrospective validation across sites and referral sources;
- prospective silent-mode validation with adjudication of every miss and false alert;
- subgroup analysis for age, language, disability, health literacy, rural/tertiary source, note length, and document quality;
- prevalence-aware calibration, sensitivity/specificity/PPV/NPV with confidence intervals, and harm-weighted operating points;
- human-factors testing for alert fatigue, action acknowledgment, escalation SLAs, and provider/patient clarification workflows;
- drift monitoring by model/prompt/gateway/catalog version, rollback, incident response, and change control;
- privacy/security review, auditability, business associate/HIPAA controls, and appropriate clinical governance/regulatory review.

No production API route, deployment, database, or patient workflow is modified by this package.
