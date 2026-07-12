# Neurology Triage Sentinel Report

> **SYNTHETIC SOFTWARE EVALUATION — NOT CLINICALLY VALIDATED.** Passing these gates does not establish safety, effectiveness, calibration, or fitness for patient care.

- Generated: 2026-07-11T12:45:12.631Z
- Catalog: neurology-triage-sentinel-2026-07-11-v2
- Mode: offline_deterministic
- Evaluation scope: full_catalog
- Release-gate eligible: yes
- Release-gate result: PASS
- Evaluated: 29/31; live-only unevaluated: 2

## Safety and accuracy metrics

| Metric | Result |
|---|---:|
| Exact / acceptable disposition | 29/29 (100.0%) |
| Under-triage | 0/14 (0.0%) |
| Emergency under-triage | 0/13 (0.0%) |
| Over-triage | 0/14 (0.0%) |
| Manual hold / abstention | 1/29 (3.4%) |
| Alert burden | 14/29 (48.3%) |
| Hard-negative false alerts | 0/14 (0.0%) |
| Exact evidence | 25/25 (100.0%) |
| Exact time-critical evidence | 25/25 (100.0%) |

## Release gates

| Gate | Observed | Requirement | Result |
|---|---:|---:|---|
| zero-emergency-under-triage | 0 | eq 0 | PASS |
| zero-invalid-time-critical-evidence | 0 | eq 0 | PASS |
| complete-offline-execution | 0 | eq 0 | PASS |
| hard-negative-false-alert-rate | 0 | lte 0.05 | PASS |
| manual-hold-burden | 0.034482758620689655 | lte 0.15 | PASS |

No synthetic software release gate failed.

## Case-level safety findings

| Case | Expected | Actual | Under-triage | Over-triage | Manual hold |
|---|---|---|---|---|---|
| missing-referral-clinical-text | undetermined | undetermined | no | no | yes |

## Syndrome performance

| Syndrome | Evaluated | Exact | Under-triage | Over-triage | Manual hold | Alerts |
|---|---:|---:|---:|---:|---:|---:|
| acute_cerebrovascular | 5 | 5/5 (100.0%) | 0/5 (0.0%) | 0/5 (0.0%) | 0/5 (0.0%) | 3/5 (60.0%) |
| acute_cns_infection | 2 | 2/2 (100.0%) | 0/2 (0.0%) | 0/2 (0.0%) | 0/2 (0.0%) | 1/2 (50.0%) |
| acute_spinal_cord_or_cauda_equina | 2 | 2/2 (100.0%) | 0/2 (0.0%) | 0/2 (0.0%) | 0/2 (0.0%) | 1/2 (50.0%) |
| acute_vision_threat | 2 | 2/2 (100.0%) | 0/2 (0.0%) | 0/2 (0.0%) | 0/2 (0.0%) | 1/2 (50.0%) |
| altered_mental_status_or_coma | 2 | 2/2 (100.0%) | 0/2 (0.0%) | 0/2 (0.0%) | 0/2 (0.0%) | 1/2 (50.0%) |
| autonomic_dysreflexia | 2 | 2/2 (100.0%) | 0/2 (0.0%) | 0/2 (0.0%) | 0/2 (0.0%) | 1/2 (50.0%) |
| intracranial_hemorrhage_or_sah | 2 | 2/2 (100.0%) | 0/2 (0.0%) | 0/2 (0.0%) | 0/2 (0.0%) | 1/2 (50.0%) |
| neuromuscular_respiratory_or_bulbar_failure | 2 | 2/2 (100.0%) | 0/2 (0.0%) | 0/2 (0.0%) | 0/2 (0.0%) | 1/2 (50.0%) |
| other_time_critical | 1 | 1/1 (100.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 0/1 (0.0%) |
| raised_intracranial_pressure | 2 | 2/2 (100.0%) | 0/2 (0.0%) | 0/2 (0.0%) | 0/2 (0.0%) | 1/2 (50.0%) |
| status_or_recurrent_seizure | 2 | 2/2 (100.0%) | 0/2 (0.0%) | 0/2 (0.0%) | 0/2 (0.0%) | 1/2 (50.0%) |
| suicide_or_violence_risk | 2 | 2/2 (100.0%) | 0/2 (0.0%) | 0/2 (0.0%) | 0/2 (0.0%) | 1/2 (50.0%) |
| traumatic_neurologic_deterioration | 2 | 2/2 (100.0%) | 0/2 (0.0%) | 0/2 (0.0%) | 0/2 (0.0%) | 1/2 (50.0%) |

## Subgroup performance

| Subgroup | Evaluated | Exact | Under-triage | Over-triage | Manual hold | Alerts |
|---|---:|---:|---:|---:|---:|---:|
| autonomic_dysreflexia | 2 | 2/2 (100.0%) | 0/2 (0.0%) | 0/2 (0.0%) | 0/2 (0.0%) | 1/2 (50.0%) |
| behavioral_safety | 1 | 1/1 (100.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 1/1 (100.0%) |
| conflicting_data | 0 | 0/0 (N/A) | 0/0 (N/A) | 0/0 (N/A) | 0/0 (N/A) | 0/0 (N/A) |
| copied_warning | 2 | 2/2 (100.0%) | 0/2 (0.0%) | 0/2 (0.0%) | 0/2 (0.0%) | 0/2 (0.0%) |
| critical_evidence_final_page | 2 | 2/2 (100.0%) | 0/2 (0.0%) | 0/2 (0.0%) | 0/2 (0.0%) | 1/2 (50.0%) |
| critical_unknown | 0 | 0/0 (N/A) | 0/0 (N/A) | 0/0 (N/A) | 0/0 (N/A) | 0/0 (N/A) |
| current | 12 | 12/12 (100.0%) | 0/12 (0.0%) | 0/12 (0.0%) | 0/12 (0.0%) | 12/12 (100.0%) |
| emergency | 13 | 13/13 (100.0%) | 0/13 (0.0%) | 0/13 (0.0%) | 0/13 (0.0%) | 13/13 (100.0%) |
| family_experiencer | 2 | 2/2 (100.0%) | 0/2 (0.0%) | 0/2 (0.0%) | 0/2 (0.0%) | 0/2 (0.0%) |
| hard_negative | 14 | 14/14 (100.0%) | 0/14 (0.0%) | 0/14 (0.0%) | 0/14 (0.0%) | 0/14 (0.0%) |
| headache | 1 | 1/1 (100.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 1/1 (100.0%) |
| historical | 7 | 7/7 (100.0%) | 0/7 (0.0%) | 0/7 (0.0%) | 0/7 (0.0%) | 0/7 (0.0%) |
| infection | 1 | 1/1 (100.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 1/1 (100.0%) |
| long_mayo_like_packet | 2 | 2/2 (100.0%) | 0/2 (0.0%) | 0/2 (0.0%) | 0/2 (0.0%) | 1/2 (50.0%) |
| manual_hold | 1 | 1/1 (100.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 1/1 (100.0%) | 0/1 (0.0%) |
| mental_status | 1 | 1/1 (100.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 1/1 (100.0%) |
| missing_data | 2 | 2/2 (100.0%) | 0/2 (0.0%) | 0/2 (0.0%) | 1/2 (50.0%) | 1/2 (50.0%) |
| model_only | 0 | 0/0 (N/A) | 0/0 (N/A) | 0/0 (N/A) | 0/0 (N/A) | 0/0 (N/A) |
| negation | 7 | 7/7 (100.0%) | 0/7 (0.0%) | 0/7 (0.0%) | 0/7 (0.0%) | 0/7 (0.0%) |
| neuromuscular | 1 | 1/1 (100.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 1/1 (100.0%) |
| other_time_critical | 0 | 0/0 (N/A) | 0/0 (N/A) | 0/0 (N/A) | 0/0 (N/A) | 0/0 (N/A) |
| packet_placement | 2 | 2/2 (100.0%) | 0/2 (0.0%) | 0/2 (0.0%) | 0/2 (0.0%) | 1/2 (50.0%) |
| patient_experiencer | 1 | 1/1 (100.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 1/1 (100.0%) |
| prompt_injection | 1 | 1/1 (100.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 0/1 (0.0%) |
| provider_clarification | 1 | 1/1 (100.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 1/1 (100.0%) | 0/1 (0.0%) |
| raised_pressure | 1 | 1/1 (100.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 1/1 (100.0%) |
| resolved | 1 | 1/1 (100.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 0/1 (0.0%) |
| ruled_out | 1 | 1/1 (100.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 0/1 (0.0%) |
| same_day | 1 | 1/1 (100.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 1/1 (100.0%) |
| seizure | 1 | 1/1 (100.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 1/1 (100.0%) |
| short_rural_referral | 1 | 1/1 (100.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 1/1 (100.0%) |
| spine | 1 | 1/1 (100.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 1/1 (100.0%) |
| stable_baseline | 5 | 5/5 (100.0%) | 0/5 (0.0%) | 0/5 (0.0%) | 0/5 (0.0%) | 0/5 (0.0%) |
| template_text | 1 | 1/1 (100.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 0/1 (0.0%) |
| trauma | 1 | 1/1 (100.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 1/1 (100.0%) |
| uncertain_temporality | 1 | 1/1 (100.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 1/1 (100.0%) |
| untrusted_source_text | 1 | 1/1 (100.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 0/1 (0.0%) |
| vision | 1 | 1/1 (100.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 0/1 (0.0%) | 1/1 (100.0%) |

## Tokens / cost / latency

| Branch | Executions | Input tokens | Output tokens | Latency ms | Cost USD |
|---|---:|---:|---:|---:|---:|
| adjudicator | 0 | 0 | 0 | 0.0 | 0.000000 |
| deterministic_gateway | 29 | 0 | 0 | 56.4 | 0.000000 |
| outpatient_scorer | 0 | 0 | 0 | 0.0 | 0.000000 |
| safety_extractor | 0 | 0 | 0 | 0.0 | 0.000000 |

Offline model branches show zero executions and zero tokens; no AWS or model call is made. A zero in an unexecuted branch is not a price estimate. Unknown cost for an executed live branch is reported as unknown, never coerced to zero.

## Interpretation boundary

This sentinel is a regression and software-release artifact. Clinical deployment still requires independent clinician labeling, representative retrospective and prospective validation, subgroup and site analysis, calibrated alert/hold SLAs, human-factors testing, drift monitoring, incident response, and governance approval.
