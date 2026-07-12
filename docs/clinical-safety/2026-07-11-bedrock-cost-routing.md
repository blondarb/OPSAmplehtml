# Bedrock cost and latency routing for neurology referral triage

**Date:** 2026-07-11

**Scope:** source-backed planning for the pinned Amazon Bedrock model roles in `us-east-2`; no model invocation, AWS change, or deployment was performed.

**Clinical status:** architecture and validation guidance only. Cost controls must never weaken emergency detection, complete-packet safety review, conservative holds, or required human review.

## Executive decision

Keep the current model-role separation, but do not treat cost control as a reason to skip a safety branch or silently bypass required adjudication.

The current commercial US-geo list prices are verifiable. The expected per-case model cost is approximately:

- **Short note:** about **$0.041** without Opus and **$0.085** when Opus adjudication is required in the illustrative base case.
- **100-page packet:** about **$1.16** without Opus and **$1.22** with Opus in the illustrative base case; a planning range using 500-1,000 source tokens per page is **$0.82-$1.60** before Opus.
- **300-page packet:** about **$3.48** without Opus and **$3.54** with Opus in the illustrative base case; the same density range is **$2.36-$4.68** before Opus.

These are planning estimates, not observed production costs. They exclude OCR, storage, database, Lambda, SQS, logging, retries, private discounts, and human-review labor. The estimates must be replaced by actual per-call usage telemetry before financial commitments.

The highest-impact findings are:

1. **Every packet chunk invokes both Haiku 4.5 and Sonnet 5.** That repeated fan-out, especially output verbosity, dominates packet cost; sparse Opus is not the primary cost driver.
2. **The long-packet path currently loses per-call token and cache detail.** Precise cost attribution is therefore impossible even though Bedrock returns usage.
3. **The reducer is serial inside one 240-second finalizer.** Very fact-dense 300-page packets can exceed the deadline and incur retry cost. This is the main latency architecture risk identified here.
4. **Sonnet 5 pricing changes after August 31, 2026.** AWS has announced the base price change, but a future-dated US-geo Bedrock SKU is not yet present in the current public rate card. Refresh the rate card on or before September 1; do not hard-code an inferred future price.
5. **The pinned `us.` profiles are intentional US-geo routes.** Global profiles are approximately 10% cheaper, but changing to global would violate the current US-only model-registry policy and requires separate privacy/security approval.

## Pinned routing and current implementation

| Role | Pinned inference profile | Invocation pattern | Current output ceiling |
|---|---|---:|---:|
| Independent safety extractor | `us.anthropic.claude-sonnet-5` | Every short note; every long-packet chunk | 4,000 tokens |
| Outpatient scorer | `us.anthropic.claude-sonnet-4-6` | Every referral after deterministic processing | 3,000 tokens |
| Narrative-only reducer | `us.anthropic.claude-sonnet-4-6` | One or more hierarchical calls after all long-packet chunk branches | 5,000 tokens/call |
| Sparse adjudicator | `us.anthropic.claude-opus-4-8` | Branch disagreement or unresolved critical uncertainty only | 2,000 tokens |
| Long-packet clinical mapper | `us.anthropic.claude-haiku-4-5-20251001-v1:0` | Every long-packet chunk | 8,000 tokens |

The bindings are in `src/lib/triage/modelRegistry.ts`; the reducer binding and limits are in `src/lib/triage/longPacketModelPipeline.ts`. The packet planner uses 8,000-character windows with 1,000-character overlap. The inline path runs six chunks concurrently and invokes mapper and safety concurrently for each chunk. The durable path creates **two jobs per chunk**, uses an SQS batch size of one, and limits the worker to six concurrent executions by default. Chunk calls have a 90-second deadline; the finalizer has a 240-second deadline; the Lambda timeout is 300 seconds.

Short-note safety and scoring run concurrently with a 45-second deadline per branch. Opus, when required, is a second serial stage with another 45-second deadline. A precomputed complete-packet safety result prevents unnecessary duplicate Sonnet 5 extraction after long-packet processing.

## What AWS currently publishes

### Source hierarchy

The billing source of truth used here is the [AWS Price List bulk file for Amazon Bedrock Foundation Models](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonBedrockFoundationModels/current/index.json), published `2026-07-03T08:58:57Z` when retrieved for this review. AWS documents the Price List as the programmatic SKU-level pricing source in its [Billing guide](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/price-changes.html). The [Amazon Bedrock pricing page](https://aws.amazon.com/bedrock/pricing/) independently publishes the Sonnet 5 promotion. Anthropic's [current pricing documentation](https://platform.claude.com/docs/en/about-claude/pricing) is used to cross-check model pricing policy and tokenizer behavior, but AWS, not Anthropic's first-party API rate, determines the Bedrock bill.

### Commercial US-geo on-demand rate card

All values below are USD per one million tokens for the exact `us-east-2` **Regional/Regional CRIS** SKUs used by the pinned `us.` inference profiles. The scenarios below assume no cache hits.

| Model | Input | Output | 5-minute cache write | 1-hour cache write | Cache read |
|---|---:|---:|---:|---:|---:|
| Claude Haiku 4.5 | $1.10 | $5.50 | $1.375 | $2.20 | $0.11 |
| Claude Sonnet 5, promotion through 2026-08-31 | $2.20 | $11.00 | $2.75 | $4.40 | $0.22 |
| Claude Sonnet 4.6 | $3.30 | $16.50 | $4.125 | $6.60 | $0.33 |
| Claude Opus 4.8 | $5.50 | $27.50 | $6.875 | $11.00 | $0.55 |

The matching global rates are 10% lower. AWS describes global cross-Region inference as having approximately 10% savings relative to geographic routing in its [cross-Region inference guide](https://docs.aws.amazon.com/bedrock/latest/userguide/cross-region-inference.html), and Anthropic documents a 10% regional/multi-region premium for Claude 4.5 and later models. The application intentionally rejects non-`us.` model profiles pending separate privacy approval, so the global rate is not an authorized optimization.

AWS and Anthropic announce Sonnet 5 base pricing of $2/$10 through August 31, 2026 and $3/$15 beginning September 1. The current AWS bulk rate card contains the promotional US-geo prices above but no future-dated US-geo SKU. Therefore:

- use $2.20/$11.00 for current US-geo planning through August 31;
- set the price record to expire at `2026-09-01T00:00:00Z`;
- refresh the AWS SKU file before estimating September traffic;
- treat post-promotion US-geo pricing as **unknown until published**, rather than assuming a 1.1 multiplier.

### Availability, context, and service tier

| Model | Context / max output | `us-east-2` in-region | US geo from `us-east-2` | Supported relevant tiers | `CountTokens` on `bedrock-runtime` |
|---|---|---|---|---|---|
| [Sonnet 5](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-5.html) | 1M / 128K | No | Yes | Standard | No |
| [Sonnet 4.6](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-4-6.html) | 1M / 64K | No | Yes | Standard, Reserved | Yes |
| [Opus 4.8](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-opus-4-8.html) | 1M / 128K | No | Yes | Standard | No |
| [Haiku 4.5](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-haiku-4-5.html) | 200K / 64K | No | Yes | Standard, Reserved | Yes |

All four pinned profiles are available from `us-east-2` through US geographic cross-Region inference. None has an in-region-only endpoint in Ohio. Sonnet 5 and Opus 4.8 do not support Priority or Flex in their model cards, so no uncommitted low-latency or discounted Flex tier can be assumed.

AWS does not publish an absolute p50/p95 latency SLA for these exact on-demand profile/model combinations. Anthropic publishes only relative model latency categories. Any numeric latency promise must therefore come from synthetic and deidentified measurements in this account and Region, not from invented vendor estimates.

### Published quotas and the important burndown rule

Published defaults for the cross-Region `bedrock-runtime` endpoint are summarized below. AWS states that account defaults can vary with regional factors, payment history, and approved increases; new accounts can receive lower quotas. The Service Quotas console for the actual account remains authoritative.

| Model | Cross-Region RPM | Cross-Region TPM | Published effective cross-Region TPD | Output-token quota burndown |
|---|---:|---:|---:|---:|
| Haiku 4.5 | 10,000 | 5,000,000 | 7.2B | 5x |
| Sonnet 5 | Not published in the general table; verify account | 6,000,000 | 8.64B | 10x |
| Sonnet 4.6 | 10,000 | 6,000,000 | 8.64B | 5x |
| Opus 4.8 | No RPM quota; token-governed | 30,000,000 | 43.2B | 15x |

Sources: [Amazon Bedrock quotas](https://docs.aws.amazon.com/general/latest/gr/bedrock.html), [runtime quota behavior](https://docs.aws.amazon.com/bedrock/latest/userguide/quotas-runtime.html), and [token burndown rules](https://docs.aws.amazon.com/bedrock/latest/userguide/quotas-token-burndown.html). The effective cross-Region TPD values apply AWS's documented doubling to the listed model-invocation daily quota; they are not a promise about this account.

AWS reserves approximately `input tokens + max_tokens` at request start, then reconciles completed usage as:

```text
quota_tokens = input_tokens + cache_write_tokens + output_tokens * burndown
```

Cache-read tokens do not consume TPM. Billing still uses actual input, output, and cache tokens, not the quota-burndown amount. This distinction matters because the current output ceilings are generous: an 8,000-token Haiku mapper ceiling or 4,000-token Sonnet 5 safety ceiling can reduce concurrency well before it creates the same number of billable output tokens.

## Cost formulas

For model `m`, with rate-card values `p`, cost is:

```text
C_m = (
  input_tokens       * p_input
  + output_tokens    * p_output
  + cache_write_5m   * p_cache_write_5m
  + cache_write_1h   * p_cache_write_1h
  + cache_read_tokens * p_cache_read
) / 1,000,000
```

For a short referral:

```text
C_short = C_Sonnet5_safety + C_Sonnet4.6_scorer
          + adjudication_required * C_Opus4.8
```

For each source document of `X` characters, the current planner produces approximately:

```text
N_document = 1                                      when X <= 8,000
N_document = 1 + ceil((X - 8,000) / 7,000)         when X > 8,000
N_packet   = sum(N_document)
```

The exact count is computed per document because overlap resets at document boundaries. Packet model cost is:

```text
C_packet = sum over N chunks (C_Haiku_mapper + C_Sonnet5_safety)
           + sum over R reducer calls C_Sonnet4.6_reducer
           + C_Sonnet4.6_final_scorer
           + adjudication_required * C_Opus4.8
```

`R` is data-dependent. Pages do not determine reducer calls: clinical fact density, conflicts, safety evidence, and prior reducer output size determine how many 60,000-character batches and recursive stages are required.

## Scenario estimates

### Assumptions—explicitly not vendor facts

The estimates use the current US-geo rates and the following transparent planning assumptions:

- source-page density range: 500, 750, or 1,000 **previous-tokenizer-equivalent** tokens/page;
- approximately four source characters per previous-tokenizer-equivalent token, matching the current planner comment;
- one source document per scenario, including the planner's two-character separators between pages;
- Haiku mapper call: 3,000 input and 900 output tokens per chunk;
- Sonnet 5 safety call: 3,400 input and 350 output tokens per chunk;
- Sonnet 4.6 reducer call: 14,000 input and 1,500 output tokens;
- final Sonnet 4.6 scoring call after packet finalization: 6,000 input and 900 output tokens;
- optional Opus adjudication after a packet: 7,000 input and 600 output tokens;
- reducer-call planning proxy: 3/4/6 calls for a 100-page low/base/high-density packet and 9/13/18 for a 300-page packet;
- no retries and no cache hits.

Anthropic reports that Sonnet 5 and Opus 4.8 use a newer tokenizer that produces approximately 30% more tokens for the same text, workload-dependent. The assumptions therefore use higher Sonnet 5/Opus inputs than a simple reuse of Haiku/Sonnet 4.6 token counts. Forced tool definitions and schemas are also billable input; the round input assumptions include prompt/tool overhead. Actual Bedrock usage must replace all of these assumptions.

AWS states that its [CountTokens API](https://docs.aws.amazon.com/bedrock/latest/userguide/count-tokens.html) is free. Use it for preflight estimates on Haiku 4.5 and Sonnet 4.6. Sonnet 5 and Opus 4.8 do not support CountTokens on the current `bedrock-runtime` endpoint; use actual response usage or an explicitly privacy-approved token-count path. Token-count failure makes the estimate `unknown`; it must never suppress safety processing.

### Short note

Illustrative base note: 2,000 previous-tokenizer-equivalent clinical-source tokens.

| Branch | Assumed input | Assumed output | Estimated cost |
|---|---:|---:|---:|
| Sonnet 5 safety | 4,000 | 350 | $0.01265 |
| Sonnet 4.6 scoring | 4,000 | 900 | $0.02805 |
| Opus 4.8, only if required | 5,000 | 600 | $0.04400 |
| **Total, no Opus** |  |  | **$0.04070** |
| **Total, with Opus** |  |  | **$0.08470** |

With the same output assumptions and source-note sizes from 1,000 to 5,000 tokens, the estimate is **$0.0345-$0.0592** without Opus and **$0.0714-$0.1246** with Opus.

### Long packets

| Scenario | Estimated chunks `N` | Assumed reducers `R` | Durable chunk-job waves at concurrency 6 | Cost before Opus | Cost with Opus |
|---|---:|---:|---:|---:|---:|
| 100 pages, 500 tokens/page | 29 | 3 | 10 | $0.815 | $0.870 |
| **100 pages, 750 tokens/page** | **43** | **4** | **15** | **$1.160** | **$1.215** |
| 100 pages, 1,000 tokens/page | 58 | 6 | 20 | $1.596 | $1.651 |
| 300 pages, 500 tokens/page | 86 | 9 | 29 | $2.357 | $2.412 |
| **300 pages, 750 tokens/page** | **129** | **13** | **43** | **$3.483** | **$3.538** |
| 300 pages, 1,000 tokens/page | 172 | 18 | 58 | $4.680 | $4.735 |

The durable wave count is `ceil(2N / 6)` because mapper and safety are separate jobs. It ignores queue imbalance, throttling, retries, and the serial finalizer. The inline path instead has approximately `ceil(N / 6)` paired chunk waves because it starts mapper and safety together for each chunk.

The illustrative per-unit costs are:

- mapper + safety for one chunk: **$0.01958**;
- one reducer call: **$0.07095**;
- final scorer: **$0.03465**;
- optional packet adjudicator: **$0.05500**.

### Cost exposure from current output ceilings

The base scenario is not a worst case. If outputs reach configured ceilings while inputs remain at the assumptions above:

- each chunk's mapper+safety cost rises from about **$0.0196 to $0.0988**;
- that alone adds about **$3.41** to the 43-chunk packet and **$10.22** to the 129-chunk packet;
- each reducer reaching 5,000 rather than 1,500 output tokens adds **$0.05775**.

Do not lower output ceilings blindly: truncating a safety result or atomic fact map is unsafe. First instrument actual output distributions, confirm schema completeness under a candidate cap, and validate it on the safety corpus. Then set a role-specific ceiling above the validated p99 plus margin.

## Latency model and current unknowns

AWS publishes `InvocationLatency`—request to last token—and streaming `TimeToFirstToken` through [Bedrock runtime CloudWatch metrics](https://docs.aws.amazon.com/bedrock/latest/userguide/monitoring-runtime-metrics.html), but it does not publish absolute latency targets for these exact profiles. Use:

```text
L_short ~= L_deterministic
           + max(L_Sonnet5_safety, L_Sonnet4.6_scorer)
           + adjudication_required * L_Opus4.8
           + L_persistence

L_packet ~= L_queue
            + makespan(N mapper jobs + N safety jobs, worker_concurrency)
            + sum over serial reducer calls L_reducer
            + L_final_scorer
            + adjudication_required * L_Opus4.8
            + L_persistence
```

The application deadlines are failure ceilings, not latency estimates:

- short safety/scorer stage: up to 45 seconds in parallel;
- optional Opus stage: up to another 45 seconds;
- durable mapper/safety job: 90 seconds;
- durable finalizer, including all serial reducer calls: 240 seconds;
- worker Lambda: 300 seconds;
- current queue-age alarm: greater than 15 minutes for two periods.

The reducer implementation awaits each packed batch in sequence, including batches that could be independent within a stage. At 13 illustrative calls, staying within 240 seconds requires mean end-to-end reducer time below roughly 18 seconds before persistence and overhead; at 18 calls it is below roughly 13 seconds. No source establishes that these bounds will hold. A timeout can replay the finalizer and re-bill already completed reduction calls.

Before production long-packet use, either:

1. persist each reduction batch/stage as an idempotent durable job with its own usage record and resume point; or
2. parallelize independent batches within a stage, persist stage outputs, and prove that the final stage remains within the deadline.

Failure of reduction must retain the facts, safety evidence, conservative pathway, and clinician hold. It must not clear safety or silently proceed with a partial narrative.

## Required telemetry

### Per invocation

Record one PHI-free event per attempt. Use opaque identifiers only; never record referral text, page text, evidence quotes, prompt/completion bodies, filenames, patient identifiers, or provider names.

Required fields:

- `timestamp`, `environment`, `aws_account_alias`, `source_region`;
- `run_id`, `job_id`, `chunk_id`, `tenant_key` as opaque non-PHI identifiers;
- `pipeline_version`, `planner_version`, `prompt_version`, `price_version`;
- `branch_role`, exact `model_id`/inference profile, endpoint, service tier;
- `attempt`, `idempotency_key`, retry reason, adjudication trigger;
- source page count, source character count, planned chunk count, reducer stage/batch;
- `input_tokens`, `output_tokens`, `cache_write_5m_tokens`, `cache_write_1h_tokens`, `cache_read_tokens`;
- `estimated_cost_usd` and whether pricing was current, expired, discounted, or unknown;
- queue wait, invocation wall time, end-to-end branch time, and time to first token when streaming;
- stop reason, schema validity, coverage result, timeout, throttle, HTTP/error class;
- safety/fusion outcome as a controlled enum, human-hold state, and cost-gate decision.

The shared Bedrock wrapper currently parses only `input_tokens` and `output_tokens`. It should also parse cache creation/read token fields and return usage for every clinical tool call. Long-packet mapper, safety, and reducer results must persist those usage records; today the public long-packet result does not expose them.

AWS model invocation logging can capture full prompts and responses and is disabled by default. The [AWS invocation-logging documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/model-invocation-logging.html) confirms that content can be written to CloudWatch Logs or S3. Do **not** enable text-body invocation logging for clinical production merely to obtain costs. Use Bedrock runtime metrics and application-generated metadata-only events unless privacy, security, retention, access-control, and BAA review explicitly approve content logging.

### Dashboards and alarms

Near-real-time operational alarms:

- any safety/scorer/adjudicator schema failure, timeout, or server error;
- any `InvocationThrottles` for a required clinical branch;
- `EstimatedTPMQuotaUsage` at 70%, 85%, and 95%, while recognizing AWS says this metric is approximate and not sufficient alone for capacity planning;
- p95/p99 invocation and end-to-end latency above validated baselines by role;
- finalizer approaching 75% of its 240-second deadline;
- unknown/missing token usage on any executed model call;
- duplicate idempotency keys that create more than one billed successful call;
- queue age, DLQ depth, retry amplification, and finalizer replay counts;
- per-case cost above the validated p99 for its packet-size/density band.

Financial alarms:

- internal daily estimated-spend notifications at 50%, 80%, and 100% of the approved daily envelope;
- AWS monthly Budget alerts at 50% forecast, 80% actual, and 100% actual;
- model/role cost anomaly detection and a separate Sonnet 5 price-version-expiry alert before September 1;
- reconciliation of internal token-derived cost against AWS Cost and Usage data at least monthly.

[AWS Budgets](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-best-practices.html) updates billing data at least daily and can alert on actual or forecast spend, so it is too slow to be the only runtime control. Use internal token counters for near-real-time visibility and AWS Budgets/Cost Anomaly Detection for independent billing reconciliation.

## Cost gates that preserve safety

### Never gate these on spend

- deterministic emergency gateway and lexical/structured emergency checks;
- OCR/extraction completeness validation and whole-packet coverage reconciliation;
- Sonnet 5 safety extraction for every note/chunk that reaches model processing;
- conservative fusion floors, clinician holds, and urgent human-review routing;
- Opus adjudication when the validated policy requires it.

If a required model branch cannot run because of quota, budget, timeout, configuration, or service failure, the safe outcome is **hold/manual review with scheduling locked**, not fallback to a less capable model, omission of the branch, or use of the outpatient score alone.

### Safe cost controls

1. **Idempotency and resume first.** Never pay twice for a completed chunk or reducer stage; persist usage and outputs atomically with the completion key.
2. **Gate only optional work.** Pause shadow-model comparisons, narrative embellishment, nonclinical re-runs, and offline evaluation before touching live safety work.
3. **Keep Opus sparse, not optional.** Maintain the documented disagreement/critical-unknown trigger. If the call cannot occur, substitute mandatory human adjudication and retain the hold.
4. **Defer narrative-only reduction if necessary.** Preserve atomic facts and all safety evidence, then queue the narrative reducer; do not defer the safety branches or falsely mark the packet complete.
5. **Tune output ceilings only after validation.** Use p50/p95/p99 output telemetry and schema-completeness tests; no arbitrary truncation.
6. **Use prompt caching only for validated static prefixes.** The scorer already requests system-prompt caching. Sonnet 4.6 requires at least 1,024 tokens per checkpoint; the other pinned models require 4,096. Cache only stable instructions/tool definitions, never clinical source text merely to obtain a discount, and require observed cache-read/write metrics before claiming savings.
7. **Use batch only offline.** Batch pricing can be lower for supported models, but asynchronous batch behavior is not appropriate for live emergency/referral safety without a separately validated clinical latency contract. Sonnet 5 and Opus 4.8 do not have batch prices in the current Bedrock table.
8. **Do not switch to global for price alone.** Global routing is outside the current US-only privacy policy.
9. **Limit retries by failure class.** Retry transient throttles with bounded jitter; do not repeatedly bill deterministic schema-invalid output. A non-retryable failure goes to hold/manual review.
10. **Admission control may delay new optional work, never downgrade an active case.** Reserve quota for required safety calls; when saturated, queue the complete case and surface clinical SLA risk to humans.

## Implementation priorities

1. **Add complete per-call usage and latency telemetry to the shared Bedrock wrapper and persist it for mapper, safety, reducer, scorer, and adjudicator.** This is necessary for both safety capacity and cost accuracy.
2. **Make reduction durable at the batch/stage level.** Eliminate full-finalizer replay and the 240-second serial bottleneck before validating 300-page packets.
3. **Create a versioned rate-card module with an expiry date and `unknown` state.** Populate it from the exact AWS US-geo SKUs; fail financial estimates closed to `unknown`, but never block clinical safety processing because pricing is unavailable.
4. **Run deidentified latency/load validation in `us-east-2`.** Measure p50/p95/p99 by role, packet density, output length, cache state, and concurrency; test 100- and 300-page cases plus throttle/retry conditions.
5. **Set quota and budget alarms from measured demand.** Request quota increases before load reaches the clinical SLA boundary; do not use cost alarms to suppress required branches.

## Validation acceptance criteria

Before production authorization:

- 100% of executed model calls have role/model/prompt/price versions, complete usage or an explicit `unknown`, and latency/error telemetry;
- cost reconstruction matches sampled AWS billing within a predeclared tolerance;
- no raw clinical content appears in application cost/latency logs;
- 100- and 300-page synthetic packets complete under the declared p95/p99 clinical SLA without missing chunks or safety evidence;
- finalizer retry does not re-bill already persisted reducer stages;
- quota exhaustion, expired pricing, and budget-overrun tests preserve deterministic checks, required safety calls, clinician hold, and scheduling lock;
- the Sonnet 5 price refresh is completed before the promotional rate expires.
