# Bedrock Model Inventory for Neurology Triage

**Checked:** 2026-07-10
**Rechecked:** 2026-07-11 (catalog, inference-profile status, agreement,
authorization, entitlement, and regional availability)
**AWS profile:** `sevaro-sandbox`
**Region:** `us-east-2`
**Method:** read-only AWS CLI discovery and availability checks

## Account-available Anthropic candidates

| Candidate | US inference profile | Lifecycle | Account status |
|---|---|---:|---:|
| Claude Sonnet 5 | `us.anthropic.claude-sonnet-5` | Active | Authorized / available |
| Claude Opus 4.8 | `us.anthropic.claude-opus-4-8` | Active | Authorized / available |
| Claude Fable 5 | `us.anthropic.claude-fable-5` | Active | Authorized / available; synthetic-only evaluation |
| Claude Opus 4.7 | `us.anthropic.claude-opus-4-7` | Active | Authorized / available |
| Claude Sonnet 4.6 | `us.anthropic.claude-sonnet-4-6` | Active | Authorized / available |
| Claude Opus 4.6 | `us.anthropic.claude-opus-4-6-v1` | Active | Authorized / available |
| Claude Haiku 4.5 | `us.anthropic.claude-haiku-4-5-20251001-v1:0` | Active | Authorized / available |

The account also lists older active/legacy Claude profiles. The production registry should include only explicitly evaluated candidates.

## Read-only discovery commands

```bash
aws bedrock list-foundation-models \
  --profile sevaro-sandbox \
  --region us-east-2 \
  --by-provider anthropic

aws bedrock list-inference-profiles \
  --profile sevaro-sandbox \
  --region us-east-2 \
  --type-equals SYSTEM_DEFINED

aws bedrock get-foundation-model-availability \
  --profile sevaro-sandbox \
  --region us-east-2 \
  --model-id anthropic.claude-sonnet-5
```

## Selection policy

- Do not auto-promote the newest model.
- Benchmark every candidate on the same versioned, synthetic neurology reference set.
- Assign branch roles using emergency sensitivity, under-triage severity, evidence accuracy, schema reliability, latency, and cost.
- Default to US Geo profiles. Global profiles require separate privacy/residency approval.
- Pin exact model/profile IDs and log the selected profile with every branch result.
- Use the high-cost adjudicator only for disagreements, critical uncertainty, invalid evidence, or clinician request.
- Re-run shadow validation before any model, prompt, schema, or rule version changes production behavior.
- Exclude Fable 5 from PHI and deidentified clinical workflows. Its current AWS model card requires `provider_data_share` retention mode; use it only with wholly synthetic fixtures unless privacy/compliance governance explicitly changes this policy.
- Sonnet 5 and Opus 4.8 currently lack Bedrock structured-output support. If sampled, use prompt-constrained JSON plus strict application-side runtime validation and reject every non-`end_turn` response.

This inventory proves availability, not clinical suitability. No candidate is approved for autonomous triage merely because Bedrock authorizes invocation.
