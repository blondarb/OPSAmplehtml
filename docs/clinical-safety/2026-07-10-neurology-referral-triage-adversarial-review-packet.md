# Neurology Referral Triage: Adversarial Safety Review Packet

**Date:** 2026-07-10

**Status:** Pre-implementation clinical-safety review

**Data:** Synthetic and PHI-free

**Scope:** Referral routing only; this document does not validate the algorithm or authorize autonomous clinical use.

## Purpose

This packet preserves the principal safety concerns identified in an initial adversarial review and provides a clean-room prompt for a second, maximum-scrutiny review. The second reviewer must independently analyze the design rather than merely endorse these recommendations.

The central safety question is not simply whether a numerical tier is reasonable. It is whether the resulting operational action and maximum delay are safe for a patient whose referral may describe a time-critical neurologic syndrome.

## Algorithm under review

The LLM reads raw referral text and returns integer scores from 1 to 5 for:

- `symptom_acuity`
- `diagnostic_concern`
- `rate_of_progression`
- `functional_impairment`
- `red_flag_presence`

It also returns:

- `emergent_override`
- `insufficient_data`
- `red_flag_override`

Tiers, from most to least urgent, are `emergent`, `urgent`, `semi_urgent`, `routine_priority`, `routine`, `non_urgent`, plus `insufficient_data`.

The proposed redesigned deterministic layer is:

1. `emergent_override` produces `emergent`.
2. Otherwise, `insufficient_data` produces `insufficient_data`.
3. Calculate the weighted score:

   `0.30*acuity + 0.25*concern + 0.20*progression + 0.15*impairment + 0.10*red_flag`

4. Apply safety floors:
   - Any of acuity, concern, progression, or red-flag presence equal to 5: at least `urgent`.
   - Red-flag presence at least 4: at least `urgent`.
   - `red_flag_override=true`: at least `urgent`.
   - Acuity or concern at least 4: at least `semi_urgent`.
5. A raw-text lexical backstop recognizes selected stroke, thunderclap-headache, status-epilepticus, and cauda-equina phrases. A match produces an `urgent` floor and mandatory human-review flag, but never automatically produces `emergent`.
6. The final tier is the more urgent of the weighted-score tier and safety floor.

## Initial review: highest-risk findings

### 1. The deterministic layer cannot produce an emergency disposition

Apart from the single LLM `emergent_override` boolean, even the strongest possible scores and the lexical backstop stop at `urgent`. This leaves acute stroke or TIA, status epilepticus, meningitis or encephalitis, acute cord or cauda-equina compression, neuromuscular respiratory failure, and selected acute visual syndromes vulnerable to referral-queue routing instead of immediate emergency action.

`Urgent` is not a safe substitute for `emergent` unless its operational definition is itself immediate emergency evaluation. The system must distinguish “send for emergency care now” from “expedite outpatient neurology.”

### 2. `insufficient_data` can suppress positive danger signals

Under the proposed precedence, an incomplete note with untreated acute unilateral weakness can return `insufficient_data` if the LLM misses `emergent_override`. Data quality should be orthogonal to disposition. A safe output can be `disposition=emergent` and `data_quality=insufficient`; missing details must not neutralize positive emergency evidence.

### 3. Emergencies are often relational patterns, not single scores or phrases

Important conjunctions include:

- headache plus fever, neck stiffness, confusion, seizure, pregnancy/postpartum state, anticoagulation, trauma, papilledema, or focal deficit;
- back pain plus urinary retention, saddle sensory change, bilateral weakness, or new bowel/sexual dysfunction;
- weakness plus dyspnea, orthopnea, dysphagia, weak cough, or secretion difficulty;
- diplopia plus ataxia or inability to walk;
- seizure plus failure to return to baseline;
- visual symptoms plus jaw claudication or scalp tenderness.

A compensatory scalar and literal phrase list do not reliably model these interactions.

### 4. The current dimensions conflate clinically different concepts

The design should distinguish:

- baseline disability from new loss of function;
- symptom intensity from onset abruptness;
- amount of progression from progression time scale;
- diagnostic complexity from concern for time-sensitive morbidity;
- a mentioned risk factor from an active, contextually relevant red flag;
- current symptoms from resolved, remote, or already evaluated symptoms.

Excluding chronic `functional_impairment=5` from an urgent floor is reasonable. Excluding a new inability to walk, swallow, protect the airway, communicate, or remain safely at home is not. A single impairment score cannot safely represent both.

### 5. A raw lexical matcher will both miss emergencies and over-fire

It can miss lay language, abbreviations, posterior-circulation stroke, nonconvulsive status, neuromuscular respiratory decline, meningitis, GCA, and noncanonical high-risk headache descriptions. It can over-fire on negation, remote history, family history, copied instructions, ruled-out diagnoses, and hypothetical language.

The text layer needs assertion status, temporality, experiencer, section awareness, symptom proximity, and evidence spans. Phrase matching should remain a diverse high-recall monitor, not the principal emergency classifier.

## Representative under-triage probes

Score vectors use `[acuity, concern, progression, impairment, red_flag]`.

| Synthetic scenario | Plausible vector | Proposed result | Safety concern |
|---|---:|---|---|
| Persistent aphasia and unilateral arm weakness beginning this morning | `[5,5,5,4,5]` | Urgent if override is missed | Acute stroke requires emergency action |
| Sudden diplopia, severe imbalance, and inability to walk | `[5,5,5,5,5]` | Urgent | Posterior-circulation stroke terminology may evade the phrase net |
| Focal deficit resolved after 15 minutes | `[4,4,2,1,4]` | Urgent | Possible TIA remains time-sensitive despite symptom resolution |
| Repeated seizures without recovery to baseline | `[5,5,5,5,5]` | Urgent | Possible status epilepticus requires emergency treatment |
| Fever, severe headache, neck stiffness, and increasing confusion | `[4,4,4,4,4]` | Urgent | Possible meningitis/encephalitis can deteriorate within hours |
| New urinary retention, numbness when wiping, and bilateral leg weakness | `[5,5,5,5,5]` | Urgent | Possible cauda equina requires emergency assessment/imaging |
| Ascending weakness over three days, now dyspneic when supine | `[3,4,5,5,4]` | Urgent | Possible GBS with respiratory/autonomic failure |
| Myasthenia with worsening dysphagia, weak cough, and short phrases per breath | `[4,5,5,5,5]` | Urgent | Possible impending myasthenic crisis |
| Age over 50, new headache, jaw claudication, transient monocular blackout | `[4,5,4,3,5]` | Urgent | Possible GCA with threatened permanent vision loss |
| Sudden unilateral weakness but onset time and medications absent | `[5,5,5,4,5]` plus `insufficient_data=true` | Insufficient data | Incompleteness can suppress the emergency pathway |

## Representative over-triage probes

| Synthetic scenario | Plausible vector or trigger | Safety/usability concern |
|---|---:|---|
| Typical migraine frequency increases over six months without secondary features | `[2,2,5,2,1]` | `progression=5` forces urgent despite a nonurgent time scale |
| Stable unusual hand movements for one year; seizure versus tic is uncertain | `[2,4,1,2,2]` | Diagnostic complexity may be mislabeled as time-sensitive concern |
| Severe stereotyped migraine identical to prior attacks and fully resolved | `[4,2,2,4,1]` | Intensity may be confused with dangerous abruptness |
| Remote cancer history with stable chronic neuropathy | red flag 4 | Mentioned comorbidity may force urgent without contextual relevance |
| “No saddle anesthesia; cauda equina ruled out in ED” | lexical match | Negation and already-evaluated history may trigger mandatory review |
| Copied discharge instructions listing stroke warning signs | lexical match | Section and experiencer errors may overwhelm reviewers |

## Initial ranked recommendations

1. **Add deterministic emergency-syndrome rules.** Encode high-recall, conjunction-aware patterns for acute or recently resolved focal deficit, status/seizure without recovery, CNS infection/encephalopathy, cord/cauda-equina compression, neuromuscular respiratory compromise, high-risk acute headache, and acute threatened vision. These rules must be able to produce an emergency-care action.
2. **Make data sufficiency orthogonal and safety-asymmetric.** Never allow `insufficient_data` to suppress positive emergency evidence. Trigger rapid clarification when missing facts could change emergency disposition.
3. **Use structured, assertion-aware clinical extraction.** Extract onset, last-known-well, time to peak, trajectory interval, current/resolved status, laterality, new objective or functional deficit, modifiers, negation, experiencer, and evidence spans before assigning disposition.
4. **Add an independent emergency adjudication channel.** Use a separately prompted and, if feasible, operationally diverse classifier/model. Escalate any credible positive or emergency disagreement; do not majority-vote away a high-risk signal.
5. **Redesign dimensions and validate against time-to-action outcomes.** Separate the conflated concepts above and test enriched emergency and mimic cohorts. Optimize emergency sensitivity and harmful-delay prevention rather than aggregate tier accuracy.

## Required operational definitions before validation

For every tier, specify:

- the required action;
- maximum clinician-review time;
- maximum time to assessment or appointment;
- responsible role and escalation chain;
- after-hours behavior;
- behavior if mandatory review is not completed in time;
- instructions shown to the referrer and patient.

A mandatory-review flag without a guaranteed review SLA is not a complete safety control.

## Maximum-scrutiny clean-room review prompt

Copy everything inside the following block into a new high-reasoning session.

```text
You are the lead of an independent clinical-safety review team with expertise in neurology, emergency neurology, clinical informatics, human factors, safety-critical decision support, and diagnostic error. Perform a maximum-scrutiny, adversarial review of the neurology REFERRAL-triage algorithm below.

These are synthetic, PHI-free teaching cases. Full clinical reasoning is expected. This is a pre-implementation hazard analysis, not medical advice for an individual patient and not a request to validate the system for autonomous clinical use.

IMPORTANT REVIEW POSTURE

- Work independently. Do not assume the proposed redesign or the prior recommendations are correct.
- Prioritize false-negative emergency disposition and harmful delay over elegance or average accuracy.
- Distinguish EMERGENT care now from expedited outpatient neurology. Do not treat an URGENT referral queue as equivalent to emergency evaluation.
- State any necessary assumptions about the operational SLA for each tier. If the tier labels are not clinically interpretable without SLAs, make that a principal finding.
- Use current authoritative guidance from primary professional or governmental sources for time-critical syndromes. Cite claims near the relevant text. Note where evidence is consensus-based or operational rather than derived from trials.
- Do not merely expand a keyword list. Analyze extraction errors, negation, temporality, experiencer, copied text, contradictory notes, missingness, model correlation, automation bias, queue failure, and human-review latency.
- Do not majority-vote away a plausible emergency signal.
- Challenge every boolean, score boundary, ordering rule, and fallback.
- When suggesting a rule, also identify its likely false positives and required contextual qualifiers.
- Identify what must be handled outside the scoring algorithm: workflow, UI, escalation, monitoring, governance, and validation.

PIPELINE

An LLM reads a neurology referral note and emits five integer dimension scores from 1 to 5:

1. symptom_acuity
2. diagnostic_concern
3. rate_of_progression
4. functional_impairment
5. red_flag_presence

It also emits three booleans:

- emergent_override
- insufficient_data
- red_flag_override

Tiers, most to least urgent:

emergent, urgent, semi_urgent, routine_priority, routine, non_urgent, plus insufficient_data.

PRIOR DESIGN

Weighted average:

0.30*acuity + 0.25*concern + 0.20*progression + 0.15*impairment + 0.10*red_flag

Cutoffs:

- >=4.0 urgent
- >=3.0 semi_urgent
- >=2.5 routine_priority
- >=1.5 routine
- otherwise non_urgent

Escalations were emergent_override -> emergent and red_flag_presence >=4 -> urgent. This under-triaged isolated dangerous features through compensation; for example, sudden vision loss with acuity 5 and low other dimensions could average to routine_priority.

NEW DESIGN TO REVIEW

1. emergent_override -> EMERGENT.
2. Else insufficient_data -> INSUFFICIENT_DATA.
3. Compute the same weighted score and base tier.
4. Apply deterministic safety floors so the final tier is never less urgent than:
   - any of symptom_acuity, diagnostic_concern, rate_of_progression, or red_flag_presence ==5 -> URGENT;
   - red_flag_presence >=4 -> URGENT;
   - red_flag_override=true -> URGENT;
   - symptom_acuity >=4 or diagnostic_concern >=4 -> SEMI_URGENT.
   Functional_impairment is excluded from the =5 floor because chronic severe disability alone should not force urgency.
5. Apply a lexical backstop over raw text. Current concepts are thunderclap; “worst headache of my life”; status epilepticus; cauda equina; saddle anesthesia/numbness; sudden plus weakness/numbness/vision loss/facial droop/slurred speech/aphasia; crescendo TIA. A match floors the case at URGENT and flags mandatory human review. It does not automatically produce EMERGENT to reduce keyword over-fire.
6. Final tier is the more urgent of weighted-score tier and floor tier.

INITIAL REVIEW FINDINGS TO CHALLENGE, NOT BLINDLY ACCEPT

The first reviewer argued that:

1. The largest defect is that only the LLM emergent_override can produce EMERGENT; even maximal scores and lexical emergency phrases stop at URGENT.
2. insufficient_data is incorrectly modeled as a mutually exclusive disposition and can suppress positive emergency evidence.
3. emergencies often depend on conjunctions: focal deficit plus sudden onset; seizure plus failure to recover; headache plus fever/meningismus/altered state/pregnancy/anticoagulation; back pain plus bladder/saddle/bilateral-leg findings; weakness plus bulbar or respiratory symptoms; visual symptoms plus GCA features.
4. Functional impairment should be split into baseline disability and new functional loss; selected new losses may be emergent.
5. rate_of_progression=5 alone is too nonspecific without a time interval and syndrome.
6. diagnostic_concern may conflate diagnostic uncertainty/complexity with time-sensitive morbidity.
7. The lexical layer needs assertion, negation, temporality, experiencer, section, and evidence-span handling.
8. A second generic LLM vote may add correlated failure rather than true redundancy; an independent emergency adjudicator plus deterministic rules and disagreement escalation may be safer.
9. Tier labels require explicit action and review SLAs, after-hours handling, and escalation when mandatory review is delayed.

REQUIRED ANALYSIS

1. Find every credible path to under-triage in the NEW design. Prioritize cases where the output would create harmful delay. Include at least 20 diverse synthetic cases and exact score vectors in the order [acuity, concern, progression, impairment, red_flag], the booleans, weighted score, floor, final tier, clinically correct disposition, and failure mechanism.
2. Cover at minimum:
   - anterior and posterior circulation stroke;
   - resolved TIA/amaurosis fugax;
   - intracranial hemorrhage and high-risk headache;
   - convulsive and nonconvulsive status;
   - meningitis/encephalitis;
   - spinal cord, conus, and cauda-equina compression;
   - GBS and myasthenic respiratory/bulbar decline;
   - acute visual loss, GCA, and papilledema with threatened vision;
   - pregnancy/postpartum neurologic emergencies;
   - anticoagulation, immunosuppression, cancer, trauma, or recent procedure as modifiers;
   - pediatric and older-adult atypical presentation where relevant;
   - incomplete, contradictory, copied, negated, remote, resolved, and already-evaluated notes.
3. Find credible over-triage pathways that could erode trust or overwhelm mandatory review. Include at least 12 concrete cases, exact triggers, and a mitigation that preserves emergency sensitivity.
4. Audit each floor independently and in combination. Determine whether functional_impairment should be excluded, whether progression=5 alone should force urgent, whether acuity/concern>=4 should mean semi_urgent, and whether combinations of subthreshold scores should trigger emergent review.
5. Audit rule ordering, especially emergent_override versus insufficient_data. Determine whether data sufficiency should be an orthogonal output.
6. Produce a syndrome-by-syndrome emergency concept table with:
   - canonical and lay-language expressions;
   - contextual conjunctions;
   - negations and common false-positive contexts;
   - temporality/current-status requirements;
   - intended action: emergency now, same-day clinician adjudication, or expedited outpatient care.
7. Assess whether a single LLM emergency boolean is an acceptable highest-stakes control. Compare at least three architectures:
   A. single model plus lexical net;
   B. two-model voting;
   C. structured extraction plus deterministic emergency rules plus independent adjudicator and disagreement escalation.
   Include common-mode failures, latency, maintainability, explainability, and false-negative risk. Recommend one architecture.
8. Analyze non-model hazards: vague SLAs, human-review queue failure, after-hours referrals, alert fatigue, UI salience, automation bias, referral-note staleness, inability to contact the referrer/patient, and lack of closed-loop confirmation.
9. Define a validation strategy. Include enriched emergency challenge sets, realistic prevalence evaluation, subgroup analysis, repeated-run variance, adversarial paraphrases, negation/temporality tests, prospective silent-mode validation, clinician adjudication, stopping rules, and post-deployment monitoring. Specify safety-oriented metrics and confidence intervals; do not rely on overall accuracy or AUROC alone.
10. Provide the top 10 changes ranked by patient-safety impact, with rationale, implementation difficulty, likely false-positive cost, prerequisite, and verification test.

REQUIRED OUTPUT FORMAT

A. Executive verdict: no more than 12 bullets, with an explicit go/no-go recommendation for the NEW design as written.
B. Assumptions and operational SLA gaps.
C. Under-triage table with at least 20 cases.
D. Over-triage table with at least 12 cases.
E. Audit of every scoring floor and rule-order interaction.
F. Emergency syndrome and language-coverage matrix.
G. Architecture comparison and recommended safety architecture.
H. Human-factors and operational hazard analysis using severity, likelihood, detectability, and mitigations.
I. Validation and monitoring plan with acceptance criteria.
J. Top 10 ranked changes.
K. Residual risks that remain even after the recommended redesign.
L. A concise proposed replacement decision flow in pseudocode. Do not write production code.

For every major conclusion, label it as one of:

- evidence-backed clinical requirement;
- safety-engineering recommendation;
- operational assumption requiring local confirmation.

End with three lists:

1. “Must fix before any prospective silent-mode test”
2. “Must validate before clinician-facing use”
3. “Must remain human-controlled”
```

## Authoritative starting points for the second review

The reviewer should refresh sources at the time of review. Useful authoritative starting points include:

- [American Stroke Association: stroke warning signs](https://www.stroke.org/en/stroke-facts)
- [Epilepsy Foundation: status epilepticus](https://go.epilepsy.com/complications-risks/emergencies/status-epilepticus)
- [CDC: meningococcal disease symptoms](https://www.cdc.gov/meningococcal/symptoms/)
- [NINDS: Guillain-Barré syndrome](https://www.ninds.nih.gov/health-information/disorders/guillain-barre-syndrome)
- [Myasthenia Gravis Foundation of America: MG emergencies](https://myasthenia.org/living-with-mg/mg-emergency-preparedness/mg-emergencies/)
- [North Bristol NHS Trust: cauda equina emergency pathway](https://www.nbt.nhs.uk/our-services/a-z-services/neurosurgery/neurosurgery-patient-information/same-day-emergency-clinic-sdec-cauda-equina-syndrome-sec)
- [American Academy of Ophthalmology EyeWiki: giant cell arteritis](https://eyewiki.aao.org/Giant_Cell_Arteritis)

## Decision record

This packet intentionally does not modify production prompts, tier definitions, scoring code, or user-facing workflow. The next step is independent review, followed by clinical governance decisions and a separately approved implementation and validation plan.
