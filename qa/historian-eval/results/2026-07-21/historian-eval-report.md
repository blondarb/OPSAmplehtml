# Investigational — AI-generated differential for retrospective QA and audit review only. Not a clinical diagnosis and not intended to guide patient care. The historian interview itself never diagnoses; this differential is produced by a separate review pass after the session ends and requires physician verification against the full chart.

## SYNTHETIC SOFTWARE EVALUATION — NOT CLINICALLY VALIDATED

> clinicalValidationClaim: false. Passing these gates does not establish safety, effectiveness, calibration, or fitness for patient care.

**developer baseline — not clinician-vetted** — at least one rubric contributing to these scores has not been clinician-vetted.

Honest n: n=5 development-set personas; tuning permitted; no held-out claims

- Generated: 2026-07-21T10:15:11.779Z
- Mode: fixtures
- Live: yes
- Gate set: historian-eval-release-gates-2026-07-21-v1
- Release-gate eligible: yes
- Release-gate result: FAIL

## Provenance

| Evaluator | Model id(s) | Prompt version(s) | Rubric version(s) | Vetted | Cases run/total |
|---|---|---|---|---|---:|
| final_differential | us.anthropic.claude-sonnet-4-6 | final-ddx-v1 | N/A | N/A | 5/5 |
| thoroughness | us.anthropic.claude-sonnet-4-6 | thoroughness-v1 | base-neuro-hpi-v1+migraine-v1, base-neuro-hpi-v1+ms-v1, base-neuro-hpi-v1+neuropathy-v1, base-neuro-hpi-v1+seizure-v1, base-neuro-hpi-v1+stroke-v1 | UNVETTED | 5/5 |
| independent_ddx | us.deepseek.r1-v1:0 | independent-ddx-r1-v1 | N/A | N/A | 5/5 |
| agreement | us.anthropic.claude-haiku-4-5-20251001-v1:0 | agreement-icd10-adjudicated-v1 | N/A | N/A | 5/5 |

## Per-case scorecards

### acute-stroke.json (fixture)

- Chief complaint: Sudden left-sided weakness and difficulty speaking that started about 2 hours ago while watching TV
- Syndrome: acute-stroke
- Turns: 20
- Thoroughness: overall=58 confidence=High missed_critical=3 coverage_disagreement=false unvetted=true
- Fidelity: fabricated_claims=2 material_omissions=2
- Pipeline DDx top-3: Acute Ischemic Stroke — Right MCA Territory (Cardioembolic); Intracerebral Hemorrhage (ICH); Transient Ischemic Attack (TIA)
- Independent (R1) DDx top-3: Acute ischemic stroke; Hemorrhagic stroke; Transient ischemic attack (TIA)
- Agreement: top1Match=true top3Overlap=3/3 jaccard=1.00
- Ground truth: expected=[Acute ischemic stroke] pipeline(top1/top3)=true/true independent(top1/top3)=true/true

### first-seizure.json (fixture)

- Chief complaint: I had a seizure about 30 minutes ago. My roommate says I was shaking all over for about 2 minutes. I don't remember any of it.
- Syndrome: first-seizure
- Turns: 22
- Thoroughness: overall=58 confidence=High missed_critical=4 coverage_disagreement=false unvetted=true
- Fidelity: fabricated_claims=4 material_omissions=2
- Pipeline DDx top-3: Provoked (Acute Symptomatic) Generalized Tonic-Clonic Seizure — Sleep Deprivation / Metabolic Stress; First Unprovoked Generalized Tonic-Clonic Seizure (New-Onset Epilepsy); Structural / Post-Traumatic Seizure (Remote TBI-Related)
- Independent (R1) DDx top-3: Acute symptomatic seizure due to sleep deprivation and stimulant use; First unprovoked generalized tonic-clonic seizure; Convulsive syncope
- Agreement: top1Match=false top3Overlap=1/3 jaccard=0.20
- Ground truth: expected=[Epilepsy (new onset) | Provoked seizure] pipeline(top1/top3)=true/true independent(top1/top3)=true/true

### migraine-chronic.json (fixture)

- Chief complaint: Chronic daily headaches that have been getting worse over the past 6 months. I used to get migraines a few times a month but now I have headaches almost every day.
- Syndrome: migraine-chronic
- Turns: 28
- Thoroughness: overall=62 confidence=High missed_critical=4 coverage_disagreement=false unvetted=true
- Fidelity: fabricated_claims=0 material_omissions=3
- Pipeline DDx top-3: Chronic Migraine with Medication Overuse Headache (MOH); Chronic Migraine without Medication Overuse; New Daily Persistent Headache (NDPH)
- Independent (R1) DDx top-3: Chronic migraine with medication overuse headache; Medication-overuse headache; Chronic tension-type headache
- Agreement: top1Match=true top3Overlap=2/3 jaccard=0.50
- Ground truth: expected=[Chronic migraine with aura | Medication overuse headache] pipeline(top1/top3)=false/false independent(top1/top3)=false/true

### ms-relapse.json (fixture)

- Chief complaint: New numbness and tingling in both legs that started 3 days ago and is getting worse. I also have new bladder urgency.
- Syndrome: ms-relapse
- Turns: 24
- Thoroughness: overall=67 confidence=High missed_critical=4 coverage_disagreement=false unvetted=true
- Fidelity: fabricated_claims=0 material_omissions=2
- Pipeline DDx top-3: Acute MS relapse (myelopathy); MS pseudorelapse (Uhthoff phenomenon / occult infection or metabolic trigger); New or enlarging compressive cervical myelopathy (non-demyelinating)
- Independent (R1) DDx top-3: Multiple sclerosis relapse; Transverse myelitis; Guillain-Barré syndrome
- Agreement: top1Match=true top3Overlap=1/3 jaccard=0.20
- Ground truth: expected=[MS relapse] pipeline(top1/top3)=true/true independent(top1/top3)=true/true

### peripheral-neuropathy.json (fixture)

- Chief complaint: Numbness and tingling in my feet that's been getting worse over the past 6 months. Also burning pain at night and I've fallen twice recently.
- Syndrome: peripheral-neuropathy
- Turns: 24
- Thoroughness: overall=63 confidence=High missed_critical=3 coverage_disagreement=false unvetted=true
- Fidelity: fabricated_claims=2 material_omissions=3
- Pipeline DDx top-3: Diabetic Peripheral Polyneuropathy (Length-Dependent); Statin-Induced Peripheral Neuropathy; Alcoholic Peripheral Neuropathy
- Independent (R1) DDx top-3: Diabetic peripheral neuropathy; Peripheral neuropathy due to statin use; Vitamin B12 deficiency neuropathy
- Agreement: top1Match=true top3Overlap=2/3 jaccard=0.50
- Ground truth: expected=[Diabetic peripheral neuropathy] pipeline(top1/top3)=true/true independent(top1/top3)=true/true

## Aggregates (ranges, not point estimates)

- Thoroughness overall: min 58.0 / mean 61.6 / max 67.0 (n=5)
- Agreement top3Overlap: min 1.0 / mean 1.8 / max 3.0 (n=5)
- Agreement Jaccard top-3: min 0.2 / mean 0.5 / max 1.0 (n=5)
- Deterministic diagnosis-leak count (summed): 0
- Pipeline ground-truth hit rate: top1=80.0% (4/5) top3=80.0% (4/5)
- Independent ground-truth hit rate: top1=80.0% (4/5) top3=100.0% (5/5)
- Independent/pipeline top-3 agreement rate (>=1 overlap): 100.0% (5/5)

## Release gates

| Gate | Observed | Requirement | Result |
|---|---:|---:|---|
| thoroughness-floor | 61.6 | gte 70 | FAIL |
| zero-diagnosis-leaks | 0 | eq 0 | PASS |
| ddx-top3-ground-truth | 0.8 | gte 0.6 | PASS |
| independent-agreement-top3 | 1 | gte 0.5 | PASS |

Failed gates: thoroughness-floor. This is data to report, not something this harness tunes around.

## Cost / latency

| Evaluator | Cases run | Total cost | Total latency ms | Mean latency ms |
|---|---:|---:|---:|---:|
| final_differential | 5 | unknown (partial/unknown) | 220392 | 44078 |
| thoroughness | 5 | $0.205494 | 171805 | 34361 |
| independent_ddx | 5 | unknown (partial/unknown) | 63483 | 12697 |
| agreement | 5 | unknown (partial/unknown) | 2 | 0 |

Totals: cost $0.205494 (partial/unknown), latency 455682ms.

Unknown cost means the evaluator's public API does not expose token usage (final_differential, independent_ddx, agreement) — never coerced to zero.

## Interpretation boundary

This is a synthetic-software-release artifact for internal QI/IRB preparation, not a clinical validation study. Clinical deployment still requires independent clinician labeling, representative retrospective and prospective validation, subgroup analysis, calibrated review SLAs, and governance approval.
