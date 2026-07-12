# Neurology Triage Sentinel Report

> **SYNTHETIC SOFTWARE EVALUATION — NOT CLINICALLY VALIDATED.** Passing these gates does not establish safety, effectiveness, calibration, or fitness for patient care.

- Generated: 2026-07-11T12:50:45.735Z
- Catalog: neurology-triage-sentinel-2026-07-11-v2
- Mode: live_ensemble
- Evaluation scope: subset
- Release-gate eligible: no (subset runs cannot release)
- Release-gate result: FAIL
- Evaluated: 1/1; live-only unevaluated: 0

## Safety and accuracy metrics

| Metric | Result |
|---|---:|
| Exact / acceptable disposition | 1/1 (100.0%) |
| Under-triage | 0/1 (0.0%) |
| Emergency under-triage | 0/1 (0.0%) |
| Over-triage | 0/0 (N/A) |
| Manual hold / abstention | 0/1 (0.0%) |
| Alert burden | 1/1 (100.0%) |
| Hard-negative false alerts | 0/0 (N/A) |
| Exact evidence | 3/3 (100.0%) |
| Exact time-critical evidence | 3/3 (100.0%) |

## Release gates

| Gate | Observed | Requirement | Result |
|---|---:|---:|---|
| zero-emergency-under-triage | 0 | eq 0 | PASS |
| zero-invalid-time-critical-evidence | 0 | eq 0 | PASS |
| complete-offline-execution | 0 | eq 0 | PASS |
| hard-negative-false-alert-rate | 0 | lte 0.05 | PASS |
| manual-hold-burden | 0 | lte 0.15 | PASS |

No synthetic software release gate failed.

## Case-level safety findings

| Case | Expected | Actual | Under-triage | Over-triage | Manual hold |
|---|---|---|---|---|---|
| none | — | — | — | — | — |

## Syndrome performance

| Syndrome | Evaluated | Exact | Under-triage | Over-triage | Manual hold | Alerts |
|---|---:|---:|---:|---:|---:|---:|
| other_time_critical | 1 | 1/1 (100.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 1/1 (100.0%) |

## Subgroup performance

| Subgroup | Evaluated | Exact | Under-triage | Over-triage | Manual hold | Alerts |
|---|---:|---:|---:|---:|---:|---:|
| current | 1 | 1/1 (100.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 1/1 (100.0%) |
| emergency | 1 | 1/1 (100.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 1/1 (100.0%) |
| model_only | 1 | 1/1 (100.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 1/1 (100.0%) |
| other_time_critical | 1 | 1/1 (100.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 1/1 (100.0%) |

## Tokens / cost / latency

| Branch | Executions | Input tokens | Output tokens | Latency ms | Cost USD |
|---|---:|---:|---:|---:|---:|
| adjudicator | 1 | 0 (partial/unknown) | 0 (partial/unknown) | 6198.1 | unknown |
| deterministic_gateway | 1 | 0 | 0 | 13.1 | 0.000000 |
| outpatient_scorer | 1 | 0 (partial/unknown) | 0 (partial/unknown) | 18896.1 | unknown |
| safety_extractor | 1 | 0 (partial/unknown) | 0 (partial/unknown) | 10784.9 | unknown |

Offline model branches show zero executions and zero tokens; no AWS or model call is made. A zero in an unexecuted branch is not a price estimate. Unknown cost for an executed live branch is reported as unknown, never coerced to zero.

## Interpretation boundary

This sentinel is a regression and software-release artifact. Clinical deployment still requires independent clinician labeling, representative retrospective and prospective validation, subgroup and site analysis, calibrated alert/hold SLAs, human-factors testing, drift monitoring, incident response, and governance approval.
